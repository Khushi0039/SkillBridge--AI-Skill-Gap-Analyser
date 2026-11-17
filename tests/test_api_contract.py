"""Fast, isolated checks for the public FastAPI contract.

These tests deliberately avoid the production SQLite database and external ML
model downloads. They verify that the deployed API can be imported and that
its documented routes remain available.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SKILLBRIDGE_SECRET_KEY", "test-only-secret-key")

from main import app  # noqa: E402


def test_application_metadata():
    assert app.title == "SkillBridge API"
    assert app.version


def test_core_routes_are_registered():
    paths = {route.path for route in app.routes}
    expected = {
        "/",
        "/health",
        "/roles",
        "/roles/{role_id}",
        "/students",
        "/login",
        "/me",
        "/analyze-skills",
        "/resume/analyze",
        "/student-analysis",
        "/resources/{skill_name}",
        "/progress/initialize",
        "/progress/{role_id}",
        "/progress/update",
        "/resource-progress/{role_id}",
        "/resource-progress/update",
        "/dashboard/{role_id}",
    }
    assert expected.issubset(paths)


def test_openapi_contains_authenticated_workflows():
    schema = app.openapi()
    paths = schema["paths"]
    assert "post" in paths["/resume/analyze"]
    assert "get" in paths["/dashboard/{role_id}"]
    assert "get" in paths["/resource-progress/{role_id}"]
    assert "put" in paths["/resource-progress/update"]
    assert "put" in paths["/progress/update"]
