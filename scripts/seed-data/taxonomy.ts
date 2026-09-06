/** Shared taxonomy. Everything here is data — adding to it needs no code change. */

export const SKILL_AREAS = [
  {
    code: "DSA",
    name: "Data Structures & Algorithms",
    description: "Arrays, strings, hashing, trees, recursion, complexity analysis.",
    displayOrder: 10,
  },
  {
    code: "PROG",
    name: "Programming Fundamentals",
    description: "Language semantics, control flow, common runtime errors.",
    displayOrder: 20,
  },
  {
    code: "SQL",
    name: "SQL & Databases",
    description: "Querying, joins, aggregation, indexing, normalisation.",
    displayOrder: 30,
  },
  {
    code: "PY_DATA",
    name: "Python for Data",
    description: "pandas, NumPy, data cleaning and reshaping.",
    displayOrder: 40,
  },
  {
    code: "STATS",
    name: "Statistics & Probability",
    description: "Descriptive statistics, distributions, hypothesis testing.",
    displayOrder: 50,
  },
  {
    code: "ML",
    name: "Machine Learning Fundamentals",
    description: "Supervised learning, evaluation metrics, overfitting, validation.",
    displayOrder: 60,
  },
  {
    code: "SYSD",
    name: "System Design Basics",
    description: "Caching, load balancing, databases at scale, API design.",
    displayOrder: 70,
  },
  {
    code: "CS_CORE",
    name: "CS Core (OS, DBMS, Networks)",
    description: "Operating systems, DBMS internals, computer networks.",
    displayOrder: 80,
  },
  {
    code: "APTI",
    name: "Aptitude & Communication",
    description: "Quantitative aptitude, logical reasoning, written clarity.",
    displayOrder: 90,
  },
] as const;

export const TRACKS = [
  {
    code: "SDE",
    name: "SDE / Software Engineer",
    description:
      "For product and service company software roles. Weighted toward DSA, core CS and system design.",
    durationSeconds: 2700,
    displayOrder: 10,
    blueprint: [
      { skillArea: "DSA", questionCount: 6, weight: "2.0" },
      { skillArea: "PROG", questionCount: 3, weight: "1.5" },
      { skillArea: "CS_CORE", questionCount: 3, weight: "1.0" },
      { skillArea: "SYSD", questionCount: 2, weight: "1.0" },
      { skillArea: "SQL", questionCount: 2, weight: "1.0" },
      { skillArea: "APTI", questionCount: 2, weight: "0.5" },
    ],
  },
  {
    code: "DA",
    name: "Data Analyst",
    description:
      "For analyst roles. Weighted toward SQL, Python for data work and applied statistics.",
    durationSeconds: 2400,
    displayOrder: 20,
    blueprint: [
      { skillArea: "SQL", questionCount: 6, weight: "2.0" },
      { skillArea: "PY_DATA", questionCount: 4, weight: "1.5" },
      { skillArea: "STATS", questionCount: 4, weight: "1.5" },
      { skillArea: "APTI", questionCount: 2, weight: "0.5" },
    ],
  },
  {
    code: "MLE",
    name: "ML Engineer",
    description:
      "For applied ML and MLE roles. Weighted toward ML fundamentals, Python and statistics.",
    durationSeconds: 2700,
    displayOrder: 30,
    blueprint: [
      { skillArea: "ML", questionCount: 5, weight: "2.0" },
      { skillArea: "PY_DATA", questionCount: 3, weight: "1.5" },
      { skillArea: "STATS", questionCount: 3, weight: "1.5" },
      { skillArea: "DSA", questionCount: 3, weight: "1.0" },
      { skillArea: "SQL", questionCount: 2, weight: "1.0" },
    ],
  },
] as const;

/**
 * Provisional hiring bars.
 *
 * These are the platform team's working estimates. They are NOT derived from
 * placement outcome data, which is why every set is marked provisional and the
 * UI labels them as such. Phase 3 calibration replaces them with versioned
 * sets derived from real correlations.
 */
export const BENCHMARKS: Record<string, Record<string, number>> = {
  SDE: {
    DSA: 70,
    PROG: 75,
    CS_CORE: 65,
    SYSD: 55,
    SQL: 60,
    APTI: 70,
  },
  DA: {
    SQL: 75,
    PY_DATA: 65,
    STATS: 65,
    APTI: 70,
  },
  MLE: {
    ML: 70,
    PY_DATA: 70,
    STATS: 70,
    DSA: 60,
    SQL: 60,
  },
};
