"""Skill vocabulary.

Maps the words that actually appear in resumes and job descriptions onto the
skill-area codes the main application already uses (`skill_areas.code`), so
extraction results slot into the Phase 1 taxonomy instead of forming a second,
parallel vocabulary that has to be reconciled later.

Each canonical skill carries its aliases because a resume says "postgres", a JD
says "PostgreSQL", and a syllabus says "RDBMS" — all the same thing.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Skill:
    canonical: str
    skill_area: str
    aliases: tuple[str, ...] = field(default=())
    #: Rough signal of how often this is a hard requirement rather than a nice-to-have.
    weight: int = 3


SKILLS: tuple[Skill, ...] = (
    # --- Programming languages -------------------------------------------
    Skill("Python", "PROG", ("python3", "py"), 5),
    Skill("Java", "PROG", ("java8", "java 8", "core java"), 4),
    Skill("C++", "PROG", ("cpp", "c/c++"), 3),
    Skill("JavaScript", "PROG", ("js", "es6", "ecmascript"), 4),
    Skill("TypeScript", "PROG", ("ts",), 3),
    Skill("Go", "PROG", ("golang",), 2),
    Skill("C#", "PROG", ("csharp", "dotnet", ".net"), 2),
    Skill("Object-Oriented Programming", "PROG", ("oop", "oops"), 3),

    # --- DSA ---------------------------------------------------------------
    Skill("Data Structures", "DSA", ("data structure", "ds"), 5),
    Skill("Algorithms", "DSA", ("algorithm", "algo"), 5),
    Skill("Problem Solving", "DSA", ("competitive programming", "leetcode", "codeforces"), 4),
    Skill("Time Complexity", "DSA", ("big o", "big-o", "asymptotic analysis"), 3),
    Skill("Dynamic Programming", "DSA", ("dp",), 2),

    # --- SQL / databases ---------------------------------------------------
    Skill("SQL", "SQL", ("mysql", "postgresql", "postgres", "sql server", "plsql", "pl/sql"), 5),
    Skill("Database Design", "SQL", ("dbms", "rdbms", "normalization", "normalisation", "er diagram"), 4),
    Skill("Query Optimisation", "SQL", ("query optimization", "indexing", "explain plan"), 3),
    Skill("NoSQL", "SQL", ("mongodb", "mongo", "cassandra", "dynamodb", "redis"), 3),

    # --- Python for data ---------------------------------------------------
    Skill("pandas", "PY_DATA", ("panda",), 5),
    Skill("NumPy", "PY_DATA", ("numpy",), 4),
    Skill("Data Cleaning", "PY_DATA", ("data wrangling", "data preparation", "etl"), 4),
    Skill("Data Visualisation", "PY_DATA", ("matplotlib", "seaborn", "plotly", "data visualization"), 3),
    Skill("Excel", "PY_DATA", ("spreadsheet", "pivot table", "vlookup"), 2),
    Skill("Power BI", "PY_DATA", ("powerbi", "tableau", "looker", "dashboarding"), 3),

    # --- Statistics --------------------------------------------------------
    Skill("Statistics", "STATS", ("statistical analysis", "descriptive statistics"), 4),
    Skill("Probability", "STATS", ("probability theory",), 3),
    Skill("Hypothesis Testing", "STATS", ("a/b testing", "ab testing", "significance testing", "p-value"), 4),
    Skill("Regression Analysis", "STATS", ("linear regression", "logistic regression"), 3),

    # --- Machine learning --------------------------------------------------
    Skill("Machine Learning", "ML", ("ml", "supervised learning", "unsupervised learning"), 5),
    Skill("scikit-learn", "ML", ("sklearn", "scikit learn"), 4),
    Skill("Deep Learning", "ML", ("neural network", "pytorch", "tensorflow", "keras"), 3),
    Skill("Model Evaluation", "ML", ("cross validation", "cross-validation", "precision recall", "roc auc", "f1 score"), 4),
    Skill("Feature Engineering", "ML", ("feature selection", "feature extraction"), 3),
    Skill("NLP", "ML", ("natural language processing", "text mining", "llm", "transformers"), 2),

    # --- System design -----------------------------------------------------
    Skill("System Design", "SYSD", ("high level design", "hld", "low level design", "lld"), 4),
    Skill("REST APIs", "SYSD", ("rest api", "restful", "api design", "graphql"), 4),
    Skill("Caching", "SYSD", ("cache", "memcached", "cdn"), 3),
    Skill("Microservices", "SYSD", ("micro services", "service oriented"), 3),
    Skill("Message Queues", "SYSD", ("kafka", "rabbitmq", "sqs", "pub/sub", "message queue"), 2),
    Skill("Scalability", "SYSD", ("load balancing", "horizontal scaling", "high availability"), 3),

    # --- CS core -----------------------------------------------------------
    Skill("Operating Systems", "CS_CORE", ("os", "process management", "threading", "concurrency"), 4),
    Skill("Computer Networks", "CS_CORE", ("networking", "tcp/ip", "tcp", "http", "dns"), 3),
    Skill("Version Control", "CS_CORE", ("git", "github", "gitlab", "bitbucket"), 4),
    Skill("Linux", "CS_CORE", ("unix", "bash", "shell scripting"), 3),
    Skill("Cloud Platforms", "CS_CORE", ("aws", "azure", "gcp", "google cloud"), 3),
    Skill("Containers", "CS_CORE", ("docker", "kubernetes", "k8s"), 3),
    Skill("CI/CD", "CS_CORE", ("continuous integration", "jenkins", "github actions", "devops"), 2),
    Skill("Testing", "CS_CORE", ("unit testing", "unit test", "pytest", "junit", "test driven"), 3),

    # --- Aptitude / communication -----------------------------------------
    Skill("Communication", "APTI", ("verbal communication", "written communication", "presentation"), 4),
    Skill("Teamwork", "APTI", ("collaboration", "team player", "cross functional"), 3),
    Skill("Leadership", "APTI", ("led a team", "team lead", "mentoring"), 2),
    Skill("Analytical Thinking", "APTI", ("analytical skills", "logical reasoning", "critical thinking"), 3),
)


def all_terms() -> list[tuple[str, Skill]]:
    """Every searchable term paired with its skill, longest first.

    Longest-first matters: "data structures" must win over "data" so that a
    resume mentioning data structures is not credited only with a generic hit.
    """
    terms: list[tuple[str, Skill]] = []
    for skill in SKILLS:
        terms.append((skill.canonical.lower(), skill))
        for alias in skill.aliases:
            terms.append((alias.lower(), skill))
    terms.sort(key=lambda pair: len(pair[0]), reverse=True)
    return terms
