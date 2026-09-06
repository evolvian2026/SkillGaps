"""Text extraction and keyword detection.

Deliberately rule-based rather than model-based: skill detection needs to be
explainable to a student ("we did not find SQL in your resume"), reproducible,
and free to run on every upload. A model would be harder to justify on all
three counts for what is fundamentally a vocabulary-matching problem.
"""

from __future__ import annotations

import io
import re
from collections import Counter
from dataclasses import dataclass

from .skills import Skill, all_terms

try:  # pdfplumber is optional so the service still starts without it.
    import pdfplumber

    PDF_SUPPORT = True
except ImportError:  # pragma: no cover - exercised only in minimal installs
    pdfplumber = None
    PDF_SUPPORT = False


MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PAGES = 15

_TERMS = all_terms()

# Sections of a JD that describe requirements, as opposed to company boilerplate.
_REQUIREMENT_CUES = (
    "requirement", "qualification", "skills", "you will", "you'll",
    "must have", "should have", "looking for", "responsibilities",
    "what you bring", "eligibility", "preferred",
)


@dataclass
class SkillHit:
    canonical: str
    skill_area: str
    weight: int
    occurrences: int
    #: True when the term appeared in a requirements-style section of a JD.
    required: bool = False

    def as_dict(self) -> dict:
        return {
            "skill": self.canonical,
            "skillArea": self.skill_area,
            "weight": self.weight,
            "occurrences": self.occurrences,
            "required": self.required,
        }


def extract_pdf_text(data: bytes) -> str:
    """Pulls text out of a PDF.

    Raises ValueError with a message meant for the student, not a stack trace —
    a scanned photo of a resume is a common and recoverable mistake.
    """
    if not PDF_SUPPORT:
        raise ValueError("PDF support is not installed on the parser service.")
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("That PDF is larger than the 8 MB limit.")

    chunks: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages[:MAX_PAGES]:
                chunks.append(page.extract_text() or "")
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as a message
        raise ValueError(f"That PDF could not be read: {exc}") from exc

    text = normalise_whitespace("\n".join(chunks))
    if len(text.strip()) < 40:
        raise ValueError(
            "No text could be read from that PDF. If it is a scan or an image, "
            "please upload a text-based PDF or paste the text instead."
        )
    return text


def normalise_whitespace(text: str) -> str:
    text = text.replace(" ", " ").replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _searchable(text: str) -> str:
    """Lowercased text with punctuation flattened to spaces.

    `+` and `#` survive so that "C++" and "C#" remain findable; `.` survives for
    ".net". Everything is space-padded so that term matching can require word
    boundaries without a regex per term.
    """
    lowered = text.lower()
    flattened = re.sub(r"[^a-z0-9+#./\s-]", " ", lowered)
    collapsed = re.sub(r"\s+", " ", flattened)
    return f" {collapsed} "


def _requirement_regions(text: str) -> str:
    """The parts of a JD that look like requirements rather than boilerplate."""
    lines = text.split("\n")
    keep: list[str] = []
    active = False
    for line in lines:
        lowered = line.lower()
        if any(cue in lowered for cue in _REQUIREMENT_CUES):
            active = True
        elif line.strip() == "":
            active = False
        if active:
            keep.append(line)
    # If nothing matched, treat the whole document as requirements rather than
    # returning nothing — a short JD often has no headings at all.
    return "\n".join(keep) if keep else text


def find_skills(text: str, requirement_text: str | None = None) -> list[SkillHit]:
    """Detects known skills in free text.

    Matching is on whole terms only, so "go" does not match "going" and "ml"
    does not match "html". Aliases collapse onto their canonical skill, so a
    resume saying both "postgres" and "MySQL" counts SQL once with two hits.
    """
    haystack = _searchable(text)
    required_haystack = _searchable(requirement_text) if requirement_text else ""

    counts: Counter[Skill] = Counter()
    required: set[Skill] = set()

    for term, skill in _TERMS:
        padded = f" {term} "
        occurrences = haystack.count(padded)
        # Also catch a term at a line end followed by punctuation we stripped.
        if occurrences == 0 and f" {term}," in haystack:
            occurrences = haystack.count(f" {term},")
        if occurrences:
            counts[skill] += occurrences
            if required_haystack and padded in required_haystack:
                required.add(skill)

    hits = [
        SkillHit(
            canonical=skill.canonical,
            skill_area=skill.skill_area,
            weight=skill.weight,
            occurrences=count,
            required=skill in required,
        )
        for skill, count in counts.items()
    ]
    hits.sort(key=lambda h: (h.required, h.weight, h.occurrences), reverse=True)
    return hits


def extract_jd_keywords(text: str) -> list[SkillHit]:
    """Skills a job description asks for, flagged by whether they look required."""
    return find_skills(text, requirement_text=_requirement_regions(text))


def contact_redaction(text: str) -> str:
    """Masks phone numbers and email addresses.

    Applied before any text is logged. Resume text is personal data, and an
    error report should not be the thing that leaks a student's phone number.
    """
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[email]", text)
    text = re.sub(r"(?<!\d)(\+?\d[\d\s-]{8,}\d)(?!\d)", "[phone]", text)
    return text
