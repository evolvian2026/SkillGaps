/**
 * The reference list of currently in-demand skills, per skill area.
 *
 * Curated by the platform team. When a job-posting scraper exists it writes
 * into the same table with `source = 'scraped'`, so the curriculum benchmark
 * does not need rebuilding to take live data.
 *
 * `demandWeight`: 5 = expected in nearly every posting, 1 = differentiator.
 */

export interface SeedIndustrySkill {
  skillArea: string;
  topic: string;
  aliases?: string[];
  demandWeight: 1 | 2 | 3 | 4 | 5;
}

export const INDUSTRY_SKILLS: SeedIndustrySkill[] = [
  // DSA
  { skillArea: "DSA", topic: "Arrays and Strings", aliases: ["array", "string manipulation"], demandWeight: 5 },
  { skillArea: "DSA", topic: "Hashing", aliases: ["hash table", "hash map", "dictionary"], demandWeight: 5 },
  { skillArea: "DSA", topic: "Trees and Graphs", aliases: ["binary tree", "bst", "graph traversal", "bfs", "dfs"], demandWeight: 4 },
  { skillArea: "DSA", topic: "Sorting and Searching", aliases: ["binary search", "quicksort", "merge sort"], demandWeight: 4 },
  { skillArea: "DSA", topic: "Time and Space Complexity", aliases: ["big o", "asymptotic analysis", "complexity analysis"], demandWeight: 5 },
  { skillArea: "DSA", topic: "Dynamic Programming", aliases: ["dp", "memoization"], demandWeight: 3 },
  { skillArea: "DSA", topic: "Recursion", aliases: ["backtracking"], demandWeight: 4 },

  // Programming
  { skillArea: "PROG", topic: "Object-Oriented Design", aliases: ["oop", "oops", "solid principles", "design patterns"], demandWeight: 4 },
  { skillArea: "PROG", topic: "Python", aliases: ["python programming"], demandWeight: 5 },
  { skillArea: "PROG", topic: "Exception Handling", aliases: ["error handling", "try catch"], demandWeight: 3 },
  { skillArea: "PROG", topic: "Functional Programming", aliases: ["lambda", "map filter reduce", "immutability"], demandWeight: 2 },
  { skillArea: "PROG", topic: "Concurrency", aliases: ["multithreading", "async", "parallel programming"], demandWeight: 3 },

  // SQL
  { skillArea: "SQL", topic: "Joins and Subqueries", aliases: ["inner join", "left join", "subquery"], demandWeight: 5 },
  { skillArea: "SQL", topic: "Aggregation and Grouping", aliases: ["group by", "having", "aggregate functions"], demandWeight: 5 },
  { skillArea: "SQL", topic: "Window Functions", aliases: ["rank", "dense_rank", "row_number", "partition by"], demandWeight: 4 },
  { skillArea: "SQL", topic: "Indexing and Query Plans", aliases: ["index", "explain plan", "query optimization"], demandWeight: 4 },
  { skillArea: "SQL", topic: "Normalisation", aliases: ["normalization", "1nf", "2nf", "3nf", "er model"], demandWeight: 3 },
  { skillArea: "SQL", topic: "Transactions and ACID", aliases: ["acid", "isolation levels", "transaction"], demandWeight: 3 },
  { skillArea: "SQL", topic: "NoSQL Databases", aliases: ["mongodb", "cassandra", "document store", "key value store"], demandWeight: 3 },

  // Python for data
  { skillArea: "PY_DATA", topic: "pandas", aliases: ["dataframe", "data manipulation"], demandWeight: 5 },
  { skillArea: "PY_DATA", topic: "NumPy", aliases: ["numerical computing", "vectorisation", "vectorization"], demandWeight: 4 },
  { skillArea: "PY_DATA", topic: "Data Cleaning", aliases: ["data wrangling", "missing values", "data preprocessing"], demandWeight: 5 },
  { skillArea: "PY_DATA", topic: "Data Visualisation", aliases: ["matplotlib", "seaborn", "data visualization", "plotting"], demandWeight: 4 },
  { skillArea: "PY_DATA", topic: "BI Dashboards", aliases: ["power bi", "tableau", "looker", "dashboard"], demandWeight: 3 },

  // Statistics
  { skillArea: "STATS", topic: "Descriptive Statistics", aliases: ["mean median mode", "standard deviation", "variance"], demandWeight: 5 },
  { skillArea: "STATS", topic: "Probability Distributions", aliases: ["normal distribution", "binomial", "poisson"], demandWeight: 4 },
  { skillArea: "STATS", topic: "Hypothesis Testing", aliases: ["t-test", "chi square", "p-value", "significance"], demandWeight: 4 },
  { skillArea: "STATS", topic: "A/B Testing", aliases: ["ab testing", "experiment design", "controlled experiment"], demandWeight: 4 },
  { skillArea: "STATS", topic: "Regression", aliases: ["linear regression", "logistic regression", "least squares"], demandWeight: 4 },
  { skillArea: "STATS", topic: "Sampling and Bias", aliases: ["sampling methods", "selection bias", "confidence interval"], demandWeight: 3 },

  // ML
  { skillArea: "ML", topic: "Supervised Learning", aliases: ["classification", "regression models", "decision tree", "random forest"], demandWeight: 5 },
  { skillArea: "ML", topic: "Model Evaluation", aliases: ["precision recall", "confusion matrix", "roc auc", "f1 score", "cross validation"], demandWeight: 5 },
  { skillArea: "ML", topic: "Overfitting and Regularisation", aliases: ["overfitting", "regularization", "bias variance", "l1 l2"], demandWeight: 5 },
  { skillArea: "ML", topic: "Feature Engineering", aliases: ["feature selection", "feature extraction", "encoding"], demandWeight: 4 },
  { skillArea: "ML", topic: "Unsupervised Learning", aliases: ["clustering", "k-means", "pca", "dimensionality reduction"], demandWeight: 3 },
  { skillArea: "ML", topic: "Neural Networks", aliases: ["deep learning", "backpropagation", "pytorch", "tensorflow"], demandWeight: 3 },
  { skillArea: "ML", topic: "MLOps and Deployment", aliases: ["model deployment", "model serving", "mlops", "model monitoring"], demandWeight: 3 },
  { skillArea: "ML", topic: "Large Language Models", aliases: ["llm", "transformers", "prompt engineering", "rag"], demandWeight: 3 },

  // System design
  { skillArea: "SYSD", topic: "REST API Design", aliases: ["rest", "api design", "http methods"], demandWeight: 4 },
  { skillArea: "SYSD", topic: "Caching", aliases: ["redis", "cache invalidation", "cdn"], demandWeight: 4 },
  { skillArea: "SYSD", topic: "Load Balancing and Scaling", aliases: ["horizontal scaling", "load balancer", "high availability"], demandWeight: 3 },
  { skillArea: "SYSD", topic: "Message Queues", aliases: ["kafka", "rabbitmq", "async processing", "pub sub"], demandWeight: 3 },
  { skillArea: "SYSD", topic: "Microservices", aliases: ["service oriented architecture", "distributed systems"], demandWeight: 3 },

  // CS core
  { skillArea: "CS_CORE", topic: "Operating Systems", aliases: ["process scheduling", "deadlock", "memory management", "virtual memory"], demandWeight: 4 },
  { skillArea: "CS_CORE", topic: "Computer Networks", aliases: ["tcp ip", "http", "dns", "osi model"], demandWeight: 3 },
  { skillArea: "CS_CORE", topic: "Version Control", aliases: ["git", "branching", "pull request", "merge conflict"], demandWeight: 5 },
  { skillArea: "CS_CORE", topic: "Testing", aliases: ["unit testing", "integration testing", "test driven development"], demandWeight: 4 },
  { skillArea: "CS_CORE", topic: "Cloud Fundamentals", aliases: ["aws", "azure", "gcp", "cloud computing"], demandWeight: 4 },
  { skillArea: "CS_CORE", topic: "Containers and CI/CD", aliases: ["docker", "kubernetes", "jenkins", "continuous integration", "devops"], demandWeight: 3 },
  { skillArea: "CS_CORE", topic: "Linux and Shell", aliases: ["linux", "bash", "command line", "shell scripting"], demandWeight: 3 },

  // Aptitude
  { skillArea: "APTI", topic: "Technical Communication", aliases: ["documentation", "presentation skills", "written communication"], demandWeight: 4 },
  { skillArea: "APTI", topic: "Quantitative Aptitude", aliases: ["quantitative reasoning", "numerical ability"], demandWeight: 3 },
  { skillArea: "APTI", topic: "Logical Reasoning", aliases: ["analytical reasoning", "puzzles"], demandWeight: 3 },
  { skillArea: "APTI", topic: "Teamwork and Collaboration", aliases: ["group projects", "peer review", "agile"], demandWeight: 3 },
];
