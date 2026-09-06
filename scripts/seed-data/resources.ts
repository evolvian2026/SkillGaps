/**
 * Manually curated free resources, one small set per skill area.
 *
 * Deliberately a static list for Phase 1 — a recommendation engine is not
 * needed to tell a student who scored 40% on SQL to go and learn joins.
 */
export const RESOURCES: Record<
  string,
  { title: string; url: string; provider: string; kind: string; hours?: number }[]
> = {
  DSA: [
    { title: "Data Structures and Algorithms", url: "https://www.geeksforgeeks.org/data-structures/", provider: "GeeksforGeeks", kind: "reference" },
    { title: "NeetCode 150 practice roadmap", url: "https://neetcode.io/roadmap", provider: "NeetCode", kind: "practice", hours: 60 },
    { title: "Algorithms, Part I", url: "https://www.coursera.org/learn/algorithms-part1", provider: "Princeton / Coursera", kind: "course", hours: 40 },
  ],
  PROG: [
    { title: "The Python Tutorial", url: "https://docs.python.org/3/tutorial/", provider: "Python.org", kind: "reference", hours: 12 },
    { title: "CS50x: Introduction to Computer Science", url: "https://cs50.harvard.edu/x/", provider: "Harvard", kind: "course", hours: 100 },
  ],
  SQL: [
    { title: "SQLBolt interactive lessons", url: "https://sqlbolt.com/", provider: "SQLBolt", kind: "practice", hours: 6 },
    { title: "PostgreSQL Tutorial", url: "https://www.postgresqltutorial.com/", provider: "PostgreSQL Tutorial", kind: "reference", hours: 15 },
    { title: "SQL practice problems", url: "https://datalemur.com/questions", provider: "DataLemur", kind: "practice", hours: 20 },
  ],
  PY_DATA: [
    { title: "10 minutes to pandas", url: "https://pandas.pydata.org/docs/user_guide/10min.html", provider: "pandas", kind: "reference", hours: 2 },
    { title: "Python Data Science Handbook", url: "https://jakevdp.github.io/PythonDataScienceHandbook/", provider: "Jake VanderPlas", kind: "book", hours: 30 },
  ],
  STATS: [
    { title: "Statistics and Probability", url: "https://www.khanacademy.org/math/statistics-probability", provider: "Khan Academy", kind: "course", hours: 30 },
    { title: "Seeing Theory — visual probability", url: "https://seeing-theory.brown.edu/", provider: "Brown University", kind: "interactive", hours: 4 },
  ],
  ML: [
    { title: "Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course", provider: "Google", kind: "course", hours: 15 },
    { title: "scikit-learn user guide", url: "https://scikit-learn.org/stable/user_guide.html", provider: "scikit-learn", kind: "reference" },
    { title: "Kaggle Learn: Intro to Machine Learning", url: "https://www.kaggle.com/learn/intro-to-machine-learning", provider: "Kaggle", kind: "course", hours: 3 },
  ],
  SYSD: [
    { title: "System Design Primer", url: "https://github.com/donnemartin/system-design-primer", provider: "GitHub", kind: "reference", hours: 25 },
    { title: "Designing Data-Intensive Applications (chapter summaries)", url: "https://github.com/keyvanakbary/learning-notes/blob/master/books/designing-data-intensive-applications.md", provider: "Community notes", kind: "book", hours: 10 },
  ],
  CS_CORE: [
    { title: "Operating Systems: Three Easy Pieces", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/", provider: "UW-Madison", kind: "book", hours: 40 },
    { title: "Computer Networking: a Top-Down Approach (course site)", url: "https://gaia.cs.umass.edu/kurose_ross/index.php", provider: "UMass", kind: "course", hours: 30 },
  ],
  APTI: [
    { title: "Quantitative aptitude practice", url: "https://www.indiabix.com/aptitude/questions-and-answers/", provider: "IndiaBIX", kind: "practice", hours: 20 },
    { title: "Logical reasoning practice", url: "https://www.indiabix.com/logical-reasoning/questions-and-answers/", provider: "IndiaBIX", kind: "practice", hours: 12 },
  ],
};
