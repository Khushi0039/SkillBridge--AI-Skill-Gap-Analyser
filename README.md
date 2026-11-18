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

**Important for Render:** the Free web-service plan has an ephemeral
filesystem and does not support persistent disks. SQLite accounts created on
that filesystem can disappear after a restart or deploy. For durable SQLite
storage, use a paid web service with a persistent disk mounted at
`/var/data`, and set `DATABASE_PATH=/var/data/skill_gap.db` in the service
environment. The application will seed that file from the bundled reference
database on first startup. Do not attach a disk over an existing populated
database path without backing up the data first.

If you need to stay on Render's Free web-service plan, use an external
persistent database (such as managed PostgreSQL) instead of SQLite on the
service filesystem. The current SQLite application has not been migrated to
PostgreSQL; do not set a PostgreSQL URL as `DATABASE_PATH`.

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
