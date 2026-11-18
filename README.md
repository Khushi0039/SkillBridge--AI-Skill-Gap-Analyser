# SkillBridge — AI Skill Gap Analyser

SkillBridge is a career-development web application with a static frontend and a
FastAPI backend. Students can create an account, select a target role, analyse
their skills, upload a text-based PDF resume, explore learning resources and
track progress.

## Production services

- Frontend: https://skillbridge-ai-skill-gap-analyser.netlify.app/
- Backend: https://skillbridge-api-lsys.onrender.com
- API documentation: https://skillbridge-api-lsys.onrender.com/docs
- Health check: https://skillbridge-api-lsys.onrender.com/health

## Architecture

- `frontend/`: HTML, CSS and browser JavaScript (Netlify publish directory).
- `main.py`: FastAPI application and authenticated student workflows.
- `db_queries.py`: SQLite access and role/resource queries.
- `skill_gap_engine.py`: production skill-gap calculation currently used by the API.
- `ml/`: experimental/research recommendation modules and supporting tests.
- `resume_parsing/`: text-based PDF resume extraction.

The production API currently uses `skill_gap_engine.analyze_role_gap`. The
separate modules under `ml/` are not automatically part of the live analysis
path; do not describe semantic-model recommendations as live until they are
integrated and validated in deployment.

## Local backend setup

Use Python 3.11 or newer:

```bash
python -m venv .venv
# Windows:
.venv\\Scripts\\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

Set the required environment variables before starting the API:

```bash
# Use a long, random secret. Never commit a real production value.
# Windows PowerShell:
$env:SKILLBRIDGE_SECRET_KEY = "replace-with-a-long-random-secret"
# macOS/Linux:
export SKILLBRIDGE_SECRET_KEY="replace-with-a-long-random-secret"
uvicorn main:app --reload
```

The database path defaults to `database/skill_gap.db`. If
`DATABASE_PATH` points to a new, empty location, the application copies the
committed reference database there once before startup migrations. It never
overwrites a database file that already exists.

**Free Render deployment (recommended):** Render's Free web-service
filesystem is ephemeral, so do not use its local SQLite file for student
accounts or learning progress. This project now supports a hosted Turso
database while retaining local SQLite for development.

1. Create a free database in your Turso account and generate a database auth
   token.
2. Copy the database URL (it begins with `libsql://`) and the auth token.
3. In Render → your `Skillbridge-api` service → Environment, add:
   - `TURSO_DATABASE_URL` = your Turso database URL
   - `TURSO_AUTH_TOKEN` = your database auth token
4. Keep `SKILLBRIDGE_SECRET_KEY` configured. Do not commit any secret or token.
5. Deploy the latest `main` branch. On first startup, the API creates the
   required reference tables and copies roles, role skills and learning
   resources from the bundled database. Student accounts and progress are
   then written to Turso instead of Render's temporary filesystem.

Do not set `DATABASE_PATH` when using Turso. If `TURSO_DATABASE_URL` is set
without `TURSO_AUTH_TOKEN`, startup intentionally fails rather than silently
falling back to temporary local storage. Keep your Turso token private.

Existing accounts stored only on an ephemeral filesystem cannot be recovered
by a code deployment. Users may need to register again after durable storage
has been configured. Never delete or replace a populated production database
to resolve a login issue.

## Deployment configuration

### Render (backend)

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Required environment variable: `SKILLBRIDGE_SECRET_KEY`
- Recommended: configure `DATABASE_PATH` to a persistent disk location.

### Netlify (frontend)

- Base directory: repository root
- Publish directory: `frontend`
- Production branch: `main`

## Current product limitations

- Resume uploads support text-based PDF files up to 8 MB. Scanned/image-only
  PDFs require OCR, which is not currently included.
- Weekly learning activity and internship listings must not be presented as
  live/verified data unless a real activity source or internship provider is
  connected.
- Production skill analysis currently uses the rule/alias engine. The separate
  semantic/embedding pipeline needs explicit integration, model/runtime
  validation and end-to-end tests before it can be called the production AI
  engine.
- The current database schema stores the latest analysis per student. A
  multi-career analysis history requires a versioned migration and UI support.

## Automated checks

GitHub Actions compiles the backend modules and runs API route-contract tests.
These checks do not replace live integration tests against a persistent
production database, browser testing, or a real resume upload.
