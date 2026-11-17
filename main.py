
import os
import json
import logging
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone

import fitz
from fastapi import (
    FastAPI, HTTPException, Depends, UploadFile, File, Form
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from jose import jwt, JWTError

from db_queries import (
    get_all_roles,
    get_role_details,
    get_learning_resources,
    get_connection
)
from skill_gap_engine import analyze_role_gap
from auth_utils import hash_password, verify_password
from resume_parsing.resume_info import parse_resume


# --------------------------------------------------
# APPLICATION CONFIGURATION
# --------------------------------------------------

logger = logging.getLogger("skillbridge")

app = FastAPI(
    title="SkillBridge API",
    description="AI-powered Career and Skill Gap Analysis Platform",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://skillbridge-ai-skill-gap-analyser.netlify.app",
        "https://skillbridge-api-lsys.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SKILLBRIDGE_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "Set SKILLBRIDGE_SECRET_KEY in Render environment variables."
    )

ALGORITHM = "HS256"
TOKEN_EXPIRY_MINUTES = 60
security = HTTPBearer()



# --------------------------------------------------
# DATABASE MIGRATION
# --------------------------------------------------

@app.on_event("startup")
def migrate_student_database():
    with get_connection() as conn:

        # Students and authentication
        conn.execute("""
            CREATE TABLE IF NOT EXISTS students (
                student_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT
            )
        """)

        student_columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(students)"
            ).fetchall()
        }

        if "password_hash" not in student_columns:
            conn.execute(
                "ALTER TABLE students ADD COLUMN password_hash TEXT"
            )

        # Latest skill analysis for each student
        conn.execute("""
            CREATE TABLE IF NOT EXISTS student_skill_analysis (
                student_id INTEGER PRIMARY KEY,
                role_id INTEGER NOT NULL,
                student_skills TEXT NOT NULL DEFAULT '[]',
                matched_skills TEXT NOT NULL DEFAULT '[]',
                missing_skills TEXT NOT NULL DEFAULT '[]',
                match_percentage REAL NOT NULL DEFAULT 0,
                total_required_skills INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Individual learning progress for each skill
        conn.execute("""
            CREATE TABLE IF NOT EXISTS student_skill_progress (
                progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                role_id INTEGER NOT NULL,
                skill_name TEXT NOT NULL,
                progress_percentage REAL NOT NULL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, role_id, skill_name)
            )
        """)

        # Database indexes for faster dashboard queries
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_analysis
            ON student_skill_analysis(student_id)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_student_progress
            ON student_skill_progress(student_id, role_id)
        """)

        conn.commit()


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

def create_access_token(student_id):
    expiry = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRY_MINUTES
    )

    return jwt.encode(
        {
            "sub": str(student_id),
            "exp": expiry
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def get_current_student(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        student_id = int(payload.get("sub"))

    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login. Please log in again."
        )

    with get_connection() as conn:
        student = conn.execute(
            """
            SELECT student_id, name, email
            FROM students
            WHERE student_id = ?
            """,
            (student_id,)
        ).fetchone()

    if student is None:
        raise HTTPException(
            status_code=401,
            detail="Student not found."
        )

    return student


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class StudentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=150)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name", "email")
    @classmethod
    def clean_fields(cls, value):
        return value.strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Enter a valid email address.")
        return value.lower()


class StudentLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class SkillAnalysisRequest(BaseModel):
    role_id: int = Field(gt=0)
    student_skills: list[str] = Field(min_length=1)

    @field_validator("student_skills")
    @classmethod
    def clean_skills(cls, skills):
        cleaned = [s.strip() for s in skills if s.strip()]

        if not cleaned:
            raise ValueError("Enter at least one skill.")

        return cleaned


class ProgressInitialize(BaseModel):
    role_id: int = Field(gt=0)
    student_skills: list[str] = Field(min_length=1)


class ProgressUpdate(BaseModel):
    role_id: int = Field(gt=0)
    skill_name: str = Field(min_length=1)
    progress_percentage: float = Field(ge=0, le=100)

    @field_validator("skill_name")
    @classmethod
    def clean_skill(cls, value):
        return value.strip()


# --------------------------------------------------
# DATABASE HELPERS
# --------------------------------------------------

def save_analysis(student_id, role_id, skills, result):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO student_skill_analysis (
                student_id,
                role_id,
                student_skills,
                matched_skills,
                missing_skills,
                match_percentage,
                total_required_skills,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

            ON CONFLICT(student_id) DO UPDATE SET
                role_id = excluded.role_id,
                student_skills = excluded.student_skills,
                matched_skills = excluded.matched_skills,
                missing_skills = excluded.missing_skills,
                match_percentage = excluded.match_percentage,
                total_required_skills = excluded.total_required_skills,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                student_id,
                role_id,
                json.dumps(skills),
                json.dumps(result["matched_skills"]),
                json.dumps(result["missing_skills"]),
                result["match_percentage"],
                len(result["matched_skills"]) +
                len(result["missing_skills"])
            )
        )


def initialize_student_progress(student_id, role_id, result):
    with get_connection() as conn:

        for skill in result["matched_skills"]:
            conn.execute(
                """
                INSERT INTO student_skill_progress
                (student_id, role_id, skill_name, progress_percentage)
                VALUES (?, ?, ?, 100)
                ON CONFLICT(student_id, role_id, skill_name)
                DO NOTHING
                """,
                (student_id, role_id, skill)
            )

        for skill in result["missing_skills"]:
            conn.execute(
                """
                INSERT INTO student_skill_progress
                (student_id, role_id, skill_name, progress_percentage)
                VALUES (?, ?, ?, 0)
                ON CONFLICT(student_id, role_id, skill_name)
                DO NOTHING
                """,
                (student_id, role_id, skill)
            )


# --------------------------------------------------
# GENERAL ROUTES
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "application": "SkillBridge",
        "status": "running",
        "version": "2.0.0"
    }


@app.get("/health")
def health():
    required_tables = {
        "students",
        "roles",
        "role_skills",
        "learning_resources",
        "student_skill_analysis",
        "student_skill_progress",
    }

    try:
        with get_connection() as conn:
            existing_tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }

        missing_tables = sorted(required_tables - existing_tables)
        if missing_tables:
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "unhealthy",
                    "database": "connected",
                    "missing_tables": missing_tables,
                },
            )

        return {"status": "healthy", "database": "connected"}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable.")


@app.get("/roles")
def read_roles():
    roles = get_all_roles()

    return {
        "total_roles": len(roles),
        "roles": roles
    }


@app.get("/roles/{role_id}")
def read_role(role_id: int):
    role = get_role_details(role_id)

    if role is None:
        raise HTTPException(
            status_code=404,
            detail="Job role not found."
        )

    return role


# --------------------------------------------------
# STUDENT REGISTRATION
# --------------------------------------------------

@app.post("/students", status_code=201)
def register_student(student: StudentCreate):

    try:
        password_hash = hash_password(student.password)

        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO students (
                    name,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?)
                """,
                (
                    student.name,
                    student.email,
                    password_hash
                )
            )

            student_id = cursor.lastrowid

        return {
            "message": "Registration successful",
            "student_id": student_id,
            "name": student.name,
            "email": student.email
        }

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered."
        )


# --------------------------------------------------
# STUDENT LOGIN
# --------------------------------------------------

@app.post("/login")
def login_student(credentials: StudentLogin):

    with get_connection() as conn:
        student = conn.execute(
            """
            SELECT student_id, name, email, password_hash
            FROM students
            WHERE LOWER(email) = LOWER(?)
            """,
            (credentials.email,)
        ).fetchone()

    if student is None or not student["password_hash"]:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    try:
        password_valid = verify_password(
            credentials.password,
            student["password_hash"]
        )
    except (ValueError, TypeError):
        password_valid = False

    if not password_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    return {
        "message": "Login successful",
        "access_token": create_access_token(
            student["student_id"]
        ),
        "token_type": "bearer",
        "student": {
            "student_id": student["student_id"],
            "name": student["name"],
            "email": student["email"]
        }
    }


@app.get("/me")
def get_profile(current_student=Depends(get_current_student)):
    return {
        "student": dict(current_student)
    }


# --------------------------------------------------
# MANUAL SKILL ANALYSIS
# --------------------------------------------------

@app.post("/analyze-skills")
def analyze_skills(
    request: SkillAnalysisRequest,
    current_student=Depends(get_current_student)
):

    result = analyze_role_gap(
        request.role_id,
        request.student_skills
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Role not found."
        )

    student_id = current_student["student_id"]

    save_analysis(
        student_id,
        request.role_id,
        request.student_skills,
        result
    )

    initialize_student_progress(
        student_id,
        request.role_id,
        result
    )

    return result


# --------------------------------------------------
# RESUME UPLOAD AND ANALYSIS
# --------------------------------------------------

@app.post("/resume/analyze")
async def analyze_resume(
    role_id: int = Form(...),
    resume: UploadFile = File(...),
    current_student=Depends(get_current_student)
):

    filename = (resume.filename or "").lower()

    if not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF resumes are supported."
        )

    content = await resume.read(8 * 1024 * 1024 + 1)

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )

    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Resume must be smaller than 8 MB."
        )

    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF."
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=".pdf",
            delete=False
        ) as temp_file:

            temp_file.write(content)
            temp_path = temp_file.name

        parsed = parse_resume(temp_path)

        if parsed.get("error"):
            raise HTTPException(
                status_code=422,
                detail=parsed["error"]
            )

        extracted_skills = parsed.get("skills", [])

        if not extracted_skills:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No skills were detected in the resume. "
                    "Please ensure your PDF has a clearly labelled "
                    "Skills section, or enter your skills manually."
                )
            )

        result = analyze_role_gap(
            role_id,
            extracted_skills
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="Role not found."
            )

        student_id = current_student["student_id"]

        save_analysis(
            student_id,
            role_id,
            extracted_skills,
            result
        )

        initialize_student_progress(
            student_id,
            role_id,
            result
        )

        return {
            "message": "Resume analysed successfully.",
            "candidate_name": parsed.get("candidate_name"),
            "extracted_skills": extracted_skills,
            "total_extracted_skills": len(extracted_skills),
            "analysis": result
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Resume processing failed")
        raise HTTPException(
            status_code=500,
            detail="Resume processing failed. Please try another text-based PDF."
        )

    finally:
        await resume.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# --------------------------------------------------
# STUDENT ANALYSIS
# --------------------------------------------------

@app.get("/student-analysis")
def student_analysis(
    current_student=Depends(get_current_student)
):

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                a.role_id,
                a.student_skills,
                a.matched_skills,
                a.missing_skills,
                a.match_percentage,
                a.total_required_skills,
                r.job_role,
                r.sector
            FROM student_skill_analysis a
            JOIN roles r ON a.role_id = r.role_id
            WHERE a.student_id = ?
            """,
            (current_student["student_id"],)
        ).fetchone()

    if row is None:
        return {
            "has_analysis": False
        }

    return {
        "has_analysis": True,
        "role_id": row["role_id"],
        "student_skills": json.loads(row["student_skills"]),
        "matched_skills": json.loads(row["matched_skills"]),
        "missing_skills": json.loads(row["missing_skills"]),
        "match_percentage": row["match_percentage"],
        "total_required_skills": row["total_required_skills"],
        "job_role": row["job_role"],
        "sector": row["sector"]
    }


# --------------------------------------------------
# LEARNING RESOURCES
# --------------------------------------------------

@app.get("/resources/{skill_name}")
def resources(skill_name: str):

    result = get_learning_resources(
        skill_name.strip()
    )

    return {
        "skill": skill_name,
        "total_resources": len(result),
        "resources": result
    }


# --------------------------------------------------
# LEARNING PROGRESS INITIALIZATION
# --------------------------------------------------

@app.post("/progress/initialize")
def initialize_progress(
    request: ProgressInitialize,
    current_student=Depends(get_current_student)
):

    result = analyze_role_gap(
        request.role_id,
        request.student_skills
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Role not found."
        )

    student_id = current_student["student_id"]

    save_analysis(
        student_id,
        request.role_id,
        request.student_skills,
        result
    )

    initialize_student_progress(
        student_id,
        request.role_id,
        result
    )

    return {
        "message": "Progress initialized",
        "job_role": result["job_role"],
        "matched_skills": result["matched_skills"],
        "missing_skills": result["missing_skills"],
        "initial_match_percentage": result["match_percentage"]
    }


# --------------------------------------------------
# GET LEARNING PROGRESS
# --------------------------------------------------

@app.get("/progress/{role_id}")
def get_progress(
    role_id: int,
    current_student=Depends(get_current_student)
):

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT skill_name, progress_percentage
            FROM student_skill_progress
            WHERE student_id = ? AND role_id = ?
            ORDER BY skill_name
            """,
            (
                current_student["student_id"],
                role_id
            )
        ).fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Learning progress has not been initialized."
        )

    total = len(rows)

    overall = sum(
        row["progress_percentage"] for row in rows
    ) / total

    return {
        "role_id": role_id,
        "total_skills": total,
        "overall_progress": round(overall, 2),
        "skills": [
            {
                "skill_name": row["skill_name"],
                "progress": row["progress_percentage"]
            }
            for row in rows
        ]
    }


# --------------------------------------------------
# UPDATE LEARNING PROGRESS
# --------------------------------------------------

@app.put("/progress/update")
def update_progress(
    request: ProgressUpdate,
    current_student=Depends(get_current_student)
):

    with get_connection() as conn:

        row = conn.execute(
            """
            SELECT skill_name
            FROM student_skill_progress
            WHERE student_id = ?
              AND role_id = ?
              AND LOWER(TRIM(skill_name)) = LOWER(TRIM(?))
            """,
            (
                current_student["student_id"],
                request.role_id,
                request.skill_name
            )
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Skill not found in your learning plan."
            )

        conn.execute(
            """
            UPDATE student_skill_progress
            SET progress_percentage = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
              AND role_id = ?
              AND LOWER(TRIM(skill_name)) = LOWER(TRIM(?))
            """,
            (
                request.progress_percentage,
                current_student["student_id"],
                request.role_id,
                request.skill_name
            )
        )

    return {
        "message": "Progress updated",
        "skill_name": row["skill_name"],
        "progress_percentage": request.progress_percentage
    }


# --------------------------------------------------
# DASHBOARD DATA
# --------------------------------------------------

@app.get("/dashboard/{role_id}")
def dashboard(
    role_id: int,
    current_student=Depends(get_current_student)
):

    student_id = current_student["student_id"]

    with get_connection() as conn:

        role = conn.execute(
            """
            SELECT role_id, job_role, sector
            FROM roles
            WHERE role_id = ?
            """,
            (role_id,)
        ).fetchone()

        if role is None:
            raise HTTPException(
                status_code=404,
                detail="Role not found."
            )

        skills = conn.execute(
            """
            SELECT skill_name, progress_percentage
            FROM student_skill_progress
            WHERE student_id = ? AND role_id = ?
            ORDER BY skill_name
            """,
            (student_id, role_id)
        ).fetchall()

        analysis = conn.execute(
            """
            SELECT match_percentage, matched_skills, missing_skills
            FROM student_skill_analysis
            WHERE student_id = ? AND role_id = ?
            """,
            (student_id, role_id)
        ).fetchone()

    if not skills:
        raise HTTPException(
            status_code=404,
            detail="Initialize your learning progress first."
        )

    completed = []
    in_progress = []
    not_started = []

    for skill in skills:

        item = {
            "skill_name": skill["skill_name"],
            "progress": skill["progress_percentage"]
        }

        if skill["progress_percentage"] >= 100:
            completed.append(item)

        elif skill["progress_percentage"] > 0:
            in_progress.append(item)

        else:
            not_started.append(item)

    overall = sum(
        skill["progress_percentage"] for skill in skills
    ) / len(skills)

    return {
        "student": dict(current_student),
        "career": dict(role),
        "learning_summary": {
            "total_skills": len(skills),
            "completed_skills": len(completed),
            "in_progress_skills": len(in_progress),
            "not_started_skills": len(not_started),
            "overall_progress": round(overall, 2),
            "career_match": (
                analysis["match_percentage"] if analysis else 0
            )
        },
        "skills": {
            "completed": completed,
            "in_progress": in_progress,
            "not_started": not_started
        }
    }
