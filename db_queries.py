
import os
import shutil
import sqlite3
from pathlib import Path


# --------------------------------------------------
# DATABASE CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
BUNDLED_DB_PATH = BASE_DIR / "database" / "skill_gap.db"

# Production must set DATABASE_PATH to a durable datastore location.
# On Render, /var/data is suitable only when a paid persistent disk is
# actually attached to the service. Without it, the filesystem is ephemeral.
configured_path = os.getenv("DATABASE_PATH")
DB_PATH = Path(configured_path) if configured_path else BUNDLED_DB_PATH


def _prepare_database_file():
    """Seed a new writable database from the committed reference database."""
    if DB_PATH.resolve() == BUNDLED_DB_PATH.resolve() or DB_PATH.exists():
        return

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    if BUNDLED_DB_PATH.is_file():
        shutil.copy2(BUNDLED_DB_PATH, DB_PATH)


_prepare_database_file()


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=30,
        check_same_thread=False
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")

    return conn


# --------------------------------------------------
# GET ALL JOB ROLES
# --------------------------------------------------

def get_all_roles():
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT role_id, sector, job_role
            FROM roles
            ORDER BY sector, job_role
        """)

        return [dict(row) for row in cursor.fetchall()]


# --------------------------------------------------
# SEARCH JOB ROLES
# --------------------------------------------------

def search_roles(keyword):
    if not keyword or not keyword.strip():
        return []

    keyword = keyword.strip()

    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT role_id, sector, job_role
            FROM roles
            WHERE job_role LIKE ? COLLATE NOCASE
               OR sector LIKE ? COLLATE NOCASE
            ORDER BY job_role
        """, (f"%{keyword}%", f"%{keyword}%"))

        return [dict(row) for row in cursor.fetchall()]


# --------------------------------------------------
# GET REQUIRED SKILLS
# --------------------------------------------------

def get_required_skills(role_id):
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT skill_name, skill_type
            FROM role_skills
            WHERE role_id = ?
            ORDER BY skill_type, skill_name
        """, (role_id,))

        return [dict(row) for row in cursor.fetchall()]


# --------------------------------------------------
# GET LEARNING RESOURCES
# --------------------------------------------------

def get_learning_resources(skill_name):
    if not skill_name or not skill_name.strip():
        return []

    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT
                resource_id,
                skill_name,
                platform,
                resource_title,
                resource_url,
                resource_type
            FROM learning_resources
            WHERE LOWER(TRIM(skill_name)) = LOWER(TRIM(?))
            ORDER BY
                CASE resource_type
                    WHEN 'Video' THEN 1
                    WHEN 'Playlist' THEN 2
                    WHEN 'Course' THEN 3
                    ELSE 4
                END,
                platform,
                resource_title
        """, (skill_name.strip(),))

        return [dict(row) for row in cursor.fetchall()]


# --------------------------------------------------
# GET ROLE DETAILS
# --------------------------------------------------

def get_role_details(role_id):
    with get_connection() as conn:
        role = conn.execute("""
            SELECT role_id, sector, job_role
            FROM roles
            WHERE role_id = ?
        """, (role_id,)).fetchone()

        if role is None:
            return None

        role_details = dict(role)
        role_details["skills"] = get_required_skills(role_id)

        return role_details


# --------------------------------------------------
# GET RESOURCES FOR A ROLE
# --------------------------------------------------

def get_resources_for_role(role_id):
    role = get_role_details(role_id)

    if role is None:
        return None

    results = []

    for skill in role["skills"]:
        resources = get_learning_resources(skill["skill_name"])

        results.append({
            "skill_name": skill["skill_name"],
            "skill_type": skill["skill_type"],
            "resources": resources
        })

    return {
        "role_id": role["role_id"],
        "job_role": role["job_role"],
        "sector": role["sector"],
        "skills": results
    }


# --------------------------------------------------
# GET SECTOR SUMMARY
# --------------------------------------------------

def get_sector_summary():
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT sector, COUNT(*) AS total_roles
            FROM roles
            GROUP BY sector
            ORDER BY total_roles DESC
        """)

        return [dict(row) for row in cursor.fetchall()]


# --------------------------------------------------
# GET DATABASE STATISTICS
# --------------------------------------------------

def get_database_stats():
    tables = [
        "roles",
        "role_skills",
        "learning_resources"
    ]

    stats = {}

    with get_connection() as conn:
        for table in tables:
            stats[table] = conn.execute(
                f"SELECT COUNT(*) FROM {table}"
            ).fetchone()[0]

    return stats


# --------------------------------------------------
# REGISTER STUDENT
# --------------------------------------------------

def register_student(name, email):
    if not name or not name.strip():
        raise ValueError("Student name cannot be empty.")

    if not email or not email.strip():
        raise ValueError("Email cannot be empty.")

    email = email.strip().lower()

    with get_connection() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO students (name, email)
            VALUES (?, ?)
        """, (name.strip(), email))

        student = conn.execute("""
            SELECT student_id
            FROM students
            WHERE email = ?
        """, (email,)).fetchone()

        return student["student_id"]


# --------------------------------------------------
# ASSIGN LEARNING RESOURCES TO STUDENT
# --------------------------------------------------

def assign_resources_to_student(student_id, role_id):
    role_resources = get_resources_for_role(role_id)

    if role_resources is None:
        raise ValueError("Invalid role ID.")

    assigned_count = 0

    with get_connection() as conn:
        for skill in role_resources["skills"]:
            for resource in skill["resources"]:
                cursor = conn.execute("""
                    INSERT OR IGNORE INTO student_resource_progress
                    (student_id, role_id, resource_id)
                    VALUES (?, ?, ?)
                """, (
                    student_id,
                    role_id,
                    resource["resource_id"]
                ))

                assigned_count += cursor.rowcount

    return assigned_count


# --------------------------------------------------
# UPDATE RESOURCE PROGRESS
# --------------------------------------------------

def update_resource_progress(
    student_id,
    role_id,
    resource_id,
    status
):
    valid_statuses = [
        "Not Started",
        "In Progress",
        "Completed"
    ]

    if status not in valid_statuses:
        raise ValueError("Invalid progress status.")

    with get_connection() as conn:
        cursor = conn.execute("""
            UPDATE student_resource_progress
            SET
                status = ?,
                started_at = CASE
                    WHEN ? = 'Not Started' THEN NULL
                    ELSE COALESCE(started_at, CURRENT_TIMESTAMP)
                END,
                completed_at = CASE
                    WHEN ? = 'Completed' THEN CURRENT_TIMESTAMP
                    ELSE NULL
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
              AND role_id = ?
              AND resource_id = ?
        """, (
            status,
            status,
            status,
            student_id,
            role_id,
            resource_id
        ))

        if cursor.rowcount == 0:
            raise ValueError(
                "Resource progress record not found. Assign resources first."
            )

    return True


# --------------------------------------------------
# GET OVERALL RESOURCE PROGRESS
# --------------------------------------------------

def get_student_overall_progress(student_id, role_id):
    with get_connection() as conn:
        result = conn.execute("""
            SELECT
                COUNT(*) AS total_resources,
                SUM(
                    CASE WHEN status = 'Completed'
                    THEN 1 ELSE 0 END
                ) AS completed_resources,
                SUM(
                    CASE WHEN status = 'In Progress'
                    THEN 1 ELSE 0 END
                ) AS in_progress_resources
            FROM student_resource_progress
            WHERE student_id = ?
              AND role_id = ?
        """, (student_id, role_id)).fetchone()

        total = result["total_resources"]
        completed = result["completed_resources"] or 0
        in_progress = result["in_progress_resources"] or 0

        percentage = (
            completed / total * 100
            if total else 0
        )

        return {
            "total_resources": total,
            "completed_resources": completed,
            "in_progress_resources": in_progress,
            "not_started_resources": total - completed - in_progress,
            "progress_percentage": round(percentage, 2)
        }


# --------------------------------------------------
# GET STUDENT RESOURCES WITH PROGRESS
# --------------------------------------------------

def get_student_resources_with_progress(student_id, role_id):
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT
                srp.resource_id,
                lr.skill_name,
                lr.platform,
                lr.resource_title,
                lr.resource_url,
                lr.resource_type,
                srp.status,
                srp.started_at,
                srp.completed_at,
                srp.updated_at
            FROM student_resource_progress AS srp
            JOIN learning_resources AS lr
                ON srp.resource_id = lr.resource_id
            WHERE srp.student_id = ?
              AND srp.role_id = ?
            ORDER BY lr.skill_name, lr.resource_title
        """, (student_id, role_id))

        return [dict(row) for row in cursor.fetchall()]
