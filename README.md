# SkillBridge — AI Skill Gap Analyser

SkillBridge is a FastAPI + SQLite career skill-gap application with a static HTML/CSS/JavaScript frontend.

## Production services
- Frontend: https://skillbridge-ai-skill-gap-analyser.netlify.app/
- API: https://skillbridge-api-lsys.onrender.com
- API documentation: https://skillbridge-api-lsys.onrender.com/docs
- Health/schema check: https://skillbridge-api-lsys.onrender.com/health

## Features
- Student registration and JWT-based login
- Career/role catalogue from the database
- Manual skill-gap analysis against role requirements
- PDF resume text extraction and skill analysis (text-based PDFs; scanned PDFs/OCR are not supported)
- Per-skill learning progress tracking
- Learning-resource lookup
- Dashboard and progress API endpoints

## Local setup
1. Create a virtual environment and install dependencies: `pip install -r requirements.txt`.
2. Set `SKILLBRIDGE_SECRET_KEY` to a long random secret.
3. Set `DATABASE_PATH` if you want to use a database outside `database/skill_gap.db`.
4. Start the API with `uvicorn main:app --reload`.
5. Serve the `frontend` directory with a local static server; update `API_URL` in the frontend scripts if needed.

## Deployment notes
- Render must define `SKILLBRIDGE_SECRET_KEY`.
- For persistent student accounts and progress, configure a Render persistent disk and point `DATABASE_PATH` to a file on that disk. A container-local SQLite file can be lost on instance replacement/redeploy.
- Keep the reference role/resource tables in the deployed database. Do not run destructive seed/rebuild scripts against production data.
- The health endpoint verifies that the core role and student tables exist.

## Scope and limitations
The current live analysis endpoint uses the deterministic rule/alias matching in `skill_gap_engine.py`. The separate experimental semantic/ML modules under `ml/` are not currently connected to the production API, so the product does not claim semantic-model matching. Internship listings and real weekly study-time tracking are not backed by a live provider/activity event store yet.

## Resume support
The dashboard accepts PDF uploads up to 8 MB. The parser extracts text from text-based PDFs and looks for a labelled skills section. Image-only/scanned PDFs need OCR, which is not included.
