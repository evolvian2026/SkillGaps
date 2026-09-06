"""Tests for text extraction and skill detection."""

from app.extract import (
    contact_redaction,
    extract_jd_keywords,
    find_skills,
    normalise_whitespace,
)

RESUME = """
Priya Sharma
priya.sharma@example.edu | +91 98765 43210

EDUCATION
B.Tech Computer Science, 2026

SKILLS
Python, SQL (PostgreSQL, MySQL), pandas, scikit-learn, Git, Docker

PROJECTS
Built a churn prediction model using scikit-learn and pandas, evaluated with
cross validation and F1 score. Deployed behind a REST API.
Wrote unit tests with pytest and set up CI on GitHub Actions.
"""

JD = """
About Acme Analytics
We are a fast growing company that values curiosity and ownership. Our team
believes in building great products together in a collaborative culture.

Requirements
- Strong SQL, including query optimization and indexing
- Experience with Python and pandas for data cleaning
- Understanding of statistics and hypothesis testing
- Excellent communication skills

Nice to have
- Exposure to Power BI or Tableau
"""


def names(hits):
    return {hit.canonical for hit in hits}


class TestFindSkills:
    def test_detects_skills_across_areas(self):
        found = names(find_skills(RESUME))
        assert {"Python", "SQL", "pandas", "scikit-learn", "Version Control"} <= found

    def test_aliases_collapse_onto_one_canonical_skill(self):
        # The resume names PostgreSQL and MySQL; both are the SQL skill.
        hits = {h.canonical: h for h in find_skills(RESUME)}
        assert "SQL" in hits
        assert hits["SQL"].occurrences >= 2
        assert "PostgreSQL" not in hits

    def test_matches_whole_terms_only(self):
        # "ml" must not match inside "html"; "go" must not match "going".
        found = names(find_skills("I wrote HTML and CSS and I am going to learn more."))
        assert "Machine Learning" not in found
        assert "Go" not in found

    def test_handles_punctuation_in_skill_names(self):
        assert "C++" in names(find_skills("Proficient in C++ and data structures."))

    def test_returns_nothing_for_unrelated_text(self):
        assert find_skills("I enjoy hiking and playing the guitar on weekends.") == []


class TestJobDescriptionKeywords:
    def test_flags_requirements_separately_from_boilerplate(self):
        hits = {h.canonical: h for h in extract_jd_keywords(JD)}
        assert hits["SQL"].required is True
        assert hits["Communication"].required is True

    def test_detects_nice_to_have_skills_too(self):
        assert "Power BI" in names(extract_jd_keywords(JD))

    def test_orders_required_skills_first(self):
        hits = extract_jd_keywords(JD)
        required = [h.required for h in hits]
        # Once a non-required skill appears, no required one may follow.
        assert required == sorted(required, reverse=True)

    def test_falls_back_to_whole_text_when_no_headings(self):
        plain = "We need someone strong in Python and SQL who can write clean code every day."
        assert {"Python", "SQL"} <= names(extract_jd_keywords(plain))


class TestRedaction:
    def test_masks_email_and_phone(self):
        redacted = contact_redaction(RESUME)
        assert "priya.sharma@example.edu" not in redacted
        assert "98765 43210" not in redacted
        assert "[email]" in redacted and "[phone]" in redacted

    def test_leaves_ordinary_numbers_alone(self):
        assert "2026" in contact_redaction("Graduating in 2026 with 8.5 CGPA")


class TestNormalise:
    def test_collapses_runs_of_whitespace_and_blank_lines(self):
        assert normalise_whitespace("a  \t b\n\n\n\nc") == "a b\n\nc"
