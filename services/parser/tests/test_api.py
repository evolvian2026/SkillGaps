"""Tests for the HTTP surface."""

import io

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

JD_TEXT = (
    "Requirements\n"
    "- Strong SQL and query optimization experience\n"
    "- Python and pandas for data cleaning\n"
    "- Good communication skills across teams\n"
)

RESUME_TEXT = (
    "Priya Sharma, B.Tech CSE 2026.\n"
    "Skills: Python, SQL, pandas, Git, Docker.\n"
    "Built a churn model with scikit-learn and wrote unit tests with pytest.\n"
)


def test_health_reports_pdf_support():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert isinstance(body["pdfSupport"], bool)


def test_extract_keywords_returns_skills():
    response = client.post("/extract/keywords", json={"text": JD_TEXT})
    assert response.status_code == 200
    skills = {s["skill"] for s in response.json()["skills"]}
    assert {"SQL", "Python", "pandas"} <= skills


def test_extract_keywords_rejects_short_input():
    assert client.post("/extract/keywords", json={"text": "SQL"}).status_code == 422


def test_parse_resume_accepts_pasted_text():
    response = client.post("/parse/resume", data={"text": RESUME_TEXT})
    assert response.status_code == 200
    body = response.json()
    assert body["charCount"] > 0
    assert "Python" in {s["skill"] for s in body["skills"]}


def test_parse_resume_accepts_a_text_file_upload():
    response = client.post(
        "/parse/resume",
        files={"file": ("resume.txt", io.BytesIO(RESUME_TEXT.encode()), "text/plain")},
    )
    assert response.status_code == 200
    assert "SQL" in {s["skill"] for s in response.json()["skills"]}


def test_parse_resume_requires_some_input():
    assert client.post("/parse/resume", data={}).status_code == 422


def test_unparseable_pdf_returns_422_not_500():
    # A student uploading a scan or a corrupt file is bad input, not a crash.
    response = client.post(
        "/parse/resume",
        files={"file": ("resume.pdf", io.BytesIO(b"not really a pdf"), "application/pdf")},
    )
    assert response.status_code == 422
    assert "detail" in response.json()


def test_redact_masks_contact_details():
    response = client.post(
        "/redact",
        json={"text": "Reach me at priya@example.edu or +91 98765 43210 any time."},
    )
    assert "priya@example.edu" not in response.json()["text"]


class TestAuth:
    def test_token_is_enforced_when_configured(self, monkeypatch):
        monkeypatch.setenv("PARSER_SERVICE_TOKEN", "s3cret")
        assert client.post("/extract/keywords", json={"text": JD_TEXT}).status_code == 401

    def test_correct_token_is_accepted(self, monkeypatch):
        monkeypatch.setenv("PARSER_SERVICE_TOKEN", "s3cret")
        response = client.post(
            "/extract/keywords",
            json={"text": JD_TEXT},
            headers={"Authorization": "Bearer s3cret"},
        )
        assert response.status_code == 200
