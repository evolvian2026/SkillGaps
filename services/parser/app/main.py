"""FastAPI entry point for the parser service.

Stateless by design: no database, no credentials to student data. It receives
bytes or text and returns structured JSON. Everything about tenancy, storage
and retention stays in the Next.js application.
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .extract import (
    MAX_PDF_BYTES,
    PDF_SUPPORT,
    contact_redaction,
    extract_jd_keywords,
    extract_pdf_text,
    find_skills,
    normalise_whitespace,
)

app = FastAPI(
    title="SkillGaps parser",
    description="Resume text extraction and job-description keyword analysis.",
    version="1.0.0",
)

_bearer = HTTPBearer(auto_error=False)


def require_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Shared-secret auth.

    Only enforced when PARSER_SERVICE_TOKEN is set, so local development needs
    no setup — but any deployment reachable beyond localhost must set it.
    """
    expected = os.environ.get("PARSER_SERVICE_TOKEN")
    if not expected:
        return
    if credentials is None or credentials.credentials != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing token")


class SkillOut(BaseModel):
    skill: str
    skillArea: str
    weight: int
    occurrences: int
    required: bool


class ResumeOut(BaseModel):
    text: str
    charCount: int
    skills: list[SkillOut]


class KeywordsIn(BaseModel):
    text: str = Field(min_length=1, max_length=60_000)


class KeywordsOut(BaseModel):
    skills: list[SkillOut]
    charCount: int


class HealthOut(BaseModel):
    status: str
    pdfSupport: bool
    authRequired: bool


@app.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(
        status="ok",
        pdfSupport=PDF_SUPPORT,
        authRequired=bool(os.environ.get("PARSER_SERVICE_TOKEN")),
    )


@app.post("/parse/resume", response_model=ResumeOut, dependencies=[Depends(require_token)])
async def parse_resume(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
) -> ResumeOut:
    """Extracts text and skills from an uploaded resume.

    Accepts either a PDF/text upload or pasted text, so a student whose PDF
    will not parse still has a way through.
    """
    if file is None and not text:
        raise HTTPException(status_code=422, detail="Provide a file or text.")

    if file is not None:
        data = await file.read()
        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(status_code=413, detail="File is larger than 8 MB.")

        content_type = (file.content_type or "").lower()
        filename = (file.filename or "").lower()

        if content_type == "application/pdf" or filename.endswith(".pdf"):
            try:
                extracted = extract_pdf_text(data)
            except ValueError as exc:
                # 422 rather than 500: a scanned PDF is the student's input
                # being unusable, not the service failing.
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        else:
            try:
                extracted = normalise_whitespace(data.decode("utf-8", errors="replace"))
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=422, detail="Unreadable file.") from exc
    else:
        extracted = normalise_whitespace(text or "")

    if len(extracted.strip()) < 40:
        raise HTTPException(
            status_code=422,
            detail="That resume looks empty. Please upload a text-based PDF or paste the text.",
        )

    hits = find_skills(extracted)
    return ResumeOut(
        text=extracted,
        charCount=len(extracted),
        skills=[SkillOut(**hit.as_dict()) for hit in hits],
    )


@app.post("/extract/keywords", response_model=KeywordsOut, dependencies=[Depends(require_token)])
def extract_keywords(payload: KeywordsIn) -> KeywordsOut:
    """Extracts weighted skill keywords from a job description."""
    text = normalise_whitespace(payload.text)
    if len(text.strip()) < 40:
        raise HTTPException(
            status_code=422,
            detail="That job description is too short to analyse.",
        )
    hits = extract_jd_keywords(text)
    return KeywordsOut(
        skills=[SkillOut(**hit.as_dict()) for hit in hits],
        charCount=len(text),
    )


@app.post("/redact", dependencies=[Depends(require_token)])
def redact(payload: KeywordsIn) -> dict[str, str]:
    """Masks contact details. Used before resume text reaches any log."""
    return {"text": contact_redaction(payload.text)}
