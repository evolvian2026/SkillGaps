/**
 * Starter question bank.
 *
 * Sized so every track blueprint can be filled several times over without
 * repeating a question within one attempt, and spread across difficulty 1-3 so
 * the difficulty-balanced draw has something to work with.
 */

export interface SeedQuestion {
  skillArea: string;
  tracks: string[];
  type: "mcq" | "short" | "code";
  prompt: string;
  difficulty: 1 | 2 | 3;
  points?: number;
  explanation?: string;
  options?: { label: string; correct?: boolean }[];
  acceptedAnswers?: string[];
  languageId?: number;
  starterCode?: string;
  testCases?: { stdin: string; expectedStdout: string; isHidden?: boolean }[];
}

const JUDGE0_PYTHON = 71;

export const QUESTIONS: SeedQuestion[] = [
  // ---------------------------------------------------------------- DSA ----
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    prompt:
      "What is the average-case time complexity of looking up a key in a hash table with good hashing and load factor kept below 1?",
    difficulty: 1,
    explanation:
      "Average case is O(1); it degrades to O(n) only when most keys collide.",
    options: [
      { label: "O(1)", correct: true },
      { label: "O(log n)" },
      { label: "O(n)" },
      { label: "O(n log n)" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    prompt:
      "You need the k largest elements from a stream of n numbers, where n is far larger than k and does not fit in memory. Which approach is most appropriate?",
    difficulty: 2,
    explanation:
      "A min-heap of size k gives O(n log k) time and O(k) space — the only one of these that bounds memory by k.",
    options: [
      { label: "Sort the whole stream and take the last k", },
      { label: "Maintain a min-heap of size k", correct: true },
      { label: "Maintain a max-heap of size n" },
      { label: "Run quickselect over the whole stream" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "A binary search on a sorted array of 1,000,000 elements performs at most roughly how many comparisons?",
    difficulty: 1,
    explanation: "log2(1,000,000) ≈ 20.",
    options: [
      { label: "10" },
      { label: "20", correct: true },
      { label: "1000" },
      { label: "1,000,000" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "Which traversal of a binary search tree visits the nodes in ascending key order?",
    difficulty: 1,
    options: [
      { label: "Pre-order" },
      { label: "In-order", correct: true },
      { label: "Post-order" },
      { label: "Level-order" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    prompt:
      "Detecting whether a singly linked list contains a cycle, using O(1) extra space, is done with:",
    difficulty: 2,
    explanation: "Floyd's tortoise-and-hare uses two pointers and constant space.",
    options: [
      { label: "A hash set of visited nodes" },
      { label: "Two pointers moving at different speeds", correct: true },
      { label: "Reversing the list twice" },
      { label: "Sorting the node addresses" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "What is the worst-case time complexity of quicksort, and when does it occur?",
    difficulty: 2,
    options: [
      { label: "O(n log n), always" },
      { label: "O(n²), when the pivot is consistently the smallest or largest element", correct: true },
      { label: "O(n²), when the array is already sorted regardless of pivot choice" },
      { label: "O(n log n) worst case, O(n) best case" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "code",
    prompt:
      "Read a line of space-separated integers from standard input. Print the length of the longest run of strictly increasing consecutive values.\n\nExample: input `1 2 1 3 4 5 2` should print `4` (the run 1 3 4 5).",
    difficulty: 2,
    points: 3,
    languageId: JUDGE0_PYTHON,
    starterCode: "nums = list(map(int, input().split()))\n# your code here\n",
    testCases: [
      { stdin: "1 2 1 3 4 5 2", expectedStdout: "4", isHidden: false },
      { stdin: "5 4 3 2 1", expectedStdout: "1" },
      { stdin: "1 2 3 4 5", expectedStdout: "5" },
      { stdin: "7", expectedStdout: "1" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "code",
    prompt:
      "Read a line of space-separated integers and a target on the next line. Print `yes` if any two distinct elements sum to the target, otherwise `no`. Aim for O(n).",
    difficulty: 2,
    points: 3,
    languageId: JUDGE0_PYTHON,
    starterCode: "nums = list(map(int, input().split()))\ntarget = int(input())\n",
    testCases: [
      { stdin: "2 7 11 15\n9", expectedStdout: "yes", isHidden: false },
      { stdin: "1 2 3\n7", expectedStdout: "no" },
      { stdin: "3 3\n6", expectedStdout: "yes" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "short",
    prompt:
      "What is the space complexity of merge sort on an array of n elements, in big-O notation? Answer in the form O(...).",
    difficulty: 2,
    acceptedAnswers: ["O(n)", "o(n)", "O(N)"],
  },

  // --------------------------------------------------------------- PROG ----
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "In Python, what does `a = [1,2,3]; b = a; b.append(4)` leave `a` as?",
    difficulty: 1,
    explanation: "`b = a` binds the same list object; it does not copy.",
    options: [
      { label: "[1, 2, 3]" },
      { label: "[1, 2, 3, 4]", correct: true },
      { label: "[4]" },
      { label: "It raises a TypeError" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "Which of these is the clearest reason to prefer a `try/finally` (or a context manager) over closing a file at the end of a function body?",
    difficulty: 2,
    options: [
      { label: "It is faster" },
      { label: "The file is closed even if an exception is raised", correct: true },
      { label: "It uses less memory" },
      { label: "It allows the file to be opened twice" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "What does a mutable default argument in a Python function cause?",
    difficulty: 3,
    explanation:
      "The default is created once at definition time and shared across every call that does not override it.",
    options: [
      { label: "A syntax error" },
      { label: "The same object to persist across calls", correct: true },
      { label: "A fresh object on every call" },
      { label: "The argument to become read-only" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "In Java, what is the difference between `==` and `.equals()` for String objects?",
    difficulty: 2,
    options: [
      { label: "No difference — both compare content" },
      { label: "`==` compares references, `.equals()` compares content", correct: true },
      { label: "`==` compares content, `.equals()` compares references" },
      { label: "`.equals()` only works on primitives" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "code",
    prompt:
      "Read a single line of text. Print the same line with the words in reverse order, separated by single spaces.\n\nExample: `the quick brown fox` prints `fox brown quick the`.",
    difficulty: 1,
    points: 2,
    languageId: JUDGE0_PYTHON,
    starterCode: "line = input()\n",
    testCases: [
      { stdin: "the quick brown fox", expectedStdout: "fox brown quick the", isHidden: false },
      { stdin: "hello", expectedStdout: "hello" },
      { stdin: "a b c d", expectedStdout: "d c b a" },
    ],
  },

  // ---------------------------------------------------------------- SQL ----
  {
    skillArea: "SQL",
    tracks: ["SDE", "DA", "MLE"],
    type: "mcq",
    prompt:
      "Which join returns every row from the left table, plus matching rows from the right table where they exist?",
    difficulty: 1,
    options: [
      { label: "INNER JOIN" },
      { label: "LEFT JOIN", correct: true },
      { label: "RIGHT JOIN" },
      { label: "CROSS JOIN" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt:
      "You want the average order value per customer, including customers who have never ordered (as NULL or 0). Which is correct?",
    difficulty: 2,
    explanation:
      "Only a LEFT JOIN from customers keeps customers with no matching orders.",
    options: [
      { label: "SELECT ... FROM orders INNER JOIN customers ... GROUP BY customer_id" },
      { label: "SELECT ... FROM customers LEFT JOIN orders ... GROUP BY customers.id", correct: true },
      { label: "SELECT ... FROM orders GROUP BY customer_id" },
      { label: "SELECT ... FROM customers CROSS JOIN orders ... GROUP BY customers.id" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "mcq",
    prompt: "What is the difference between WHERE and HAVING?",
    difficulty: 2,
    options: [
      { label: "No difference; HAVING is older syntax" },
      { label: "WHERE filters rows before grouping; HAVING filters groups after aggregation", correct: true },
      { label: "WHERE works on numbers, HAVING on strings" },
      { label: "HAVING filters rows before grouping; WHERE filters after" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "SDE"],
    type: "mcq",
    prompt:
      "A query filtering on `WHERE email = ?` against a 10-million-row table is slow. What is the most likely fix?",
    difficulty: 2,
    options: [
      { label: "Add an index on the email column", correct: true },
      { label: "Add more RAM to the application server" },
      { label: "Rewrite the query as a subquery" },
      { label: "Switch from LEFT JOIN to INNER JOIN" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "mcq",
    prompt:
      "Which window function assigns 1, 2, 2, 4 to a group of four rows where the middle two tie?",
    difficulty: 3,
    explanation:
      "RANK() leaves a gap after a tie; DENSE_RANK() would give 1, 2, 2, 3.",
    options: [
      { label: "ROW_NUMBER()" },
      { label: "RANK()", correct: true },
      { label: "DENSE_RANK()" },
      { label: "NTILE(4)" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "short",
    prompt:
      "Which SQL keyword removes duplicate rows from a SELECT result set? (One word.)",
    difficulty: 1,
    acceptedAnswers: ["DISTINCT", "distinct"],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "SDE"],
    type: "mcq",
    prompt:
      "`SELECT COUNT(*)` and `SELECT COUNT(column_name)` on the same table return different numbers. Why?",
    difficulty: 2,
    options: [
      { label: "COUNT(column_name) skips NULLs in that column", correct: true },
      { label: "COUNT(*) skips NULLs in every column" },
      { label: "COUNT(*) is an estimate" },
      { label: "They can never differ" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "mcq",
    prompt: "Third normal form (3NF) requires that:",
    difficulty: 3,
    options: [
      { label: "Every table has a primary key only" },
      { label: "No non-key column depends on another non-key column", correct: true },
      { label: "All columns are indexed" },
      { label: "Tables contain no foreign keys" },
    ],
  },

  // ------------------------------------------------------------ PY_DATA ----
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt:
      "In pandas, which correctly selects rows of `df` where the `score` column exceeds 80?",
    difficulty: 1,
    options: [
      { label: "df[df['score'] > 80]", correct: true },
      { label: "df['score'] > 80" },
      { label: "df.where('score' > 80)" },
      { label: "df.filter(score=80)" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt:
      "A column of numbers has 12% missing values and a strong right skew. Which is generally the safest simple imputation?",
    difficulty: 2,
    explanation:
      "The median is robust to skew; the mean would be pulled by the long tail.",
    options: [
      { label: "Fill with the mean" },
      { label: "Fill with the median", correct: true },
      { label: "Fill with zero" },
      { label: "Drop the column" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA"],
    type: "mcq",
    prompt: "What does `df.groupby('city')['sales'].sum()` return?",
    difficulty: 1,
    options: [
      { label: "A Series of total sales indexed by city", correct: true },
      { label: "A DataFrame with one row per sale" },
      { label: "The overall sum of sales" },
      { label: "A list of unique cities" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt:
      "Why does NumPy vectorised arithmetic usually beat an equivalent Python for-loop over a large array?",
    difficulty: 2,
    options: [
      { label: "It runs the loop in compiled code over contiguous memory", correct: true },
      { label: "It uses the GPU by default" },
      { label: "It caches results between calls" },
      { label: "It uses fewer bits per number" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["MLE"],
    type: "short",
    prompt:
      "In pandas, which method gives the count of unique values in a Series, as a name only? (e.g. `df['x'].____()`)",
    difficulty: 2,
    acceptedAnswers: ["nunique", "nunique()", "df.nunique"],
  },

  // -------------------------------------------------------------- STATS ----
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt:
      "A dataset of salaries has mean ₹8L and median ₹6L. What does this tell you?",
    difficulty: 1,
    options: [
      { label: "The distribution is right-skewed, with high earners pulling the mean up", correct: true },
      { label: "The distribution is left-skewed" },
      { label: "The distribution is symmetric" },
      { label: "There is a data entry error" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt: "What does a p-value of 0.03 mean in a hypothesis test at α = 0.05?",
    difficulty: 2,
    explanation:
      "It is the probability of data at least this extreme assuming the null is true — not the probability the null is true.",
    options: [
      { label: "There is a 3% chance the null hypothesis is true" },
      { label: "Assuming the null is true, data this extreme would occur 3% of the time; we reject the null", correct: true },
      { label: "The result is 97% likely to replicate" },
      { label: "The effect size is 0.03" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    prompt: "The Central Limit Theorem says that, for large enough samples:",
    difficulty: 2,
    options: [
      { label: "Any data becomes normally distributed" },
      { label: "The distribution of the sample mean approaches normal, whatever the population shape", correct: true },
      { label: "The sample variance equals the population variance" },
      { label: "Outliers disappear" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA"],
    type: "mcq",
    prompt:
      "Two variables have a correlation of 0.85. Which conclusion is justified?",
    difficulty: 1,
    options: [
      { label: "One causes the other" },
      { label: "They move together strongly; causation is not established", correct: true },
      { label: "They are independent" },
      { label: "One is a linear transform of the other" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["MLE"],
    type: "mcq",
    prompt:
      "In an A/B test, you check results daily and stop as soon as p < 0.05. What is wrong?",
    difficulty: 3,
    explanation:
      "Repeated testing inflates the false-positive rate well above the nominal 5%.",
    options: [
      { label: "Nothing — this is standard practice" },
      { label: "Peeking repeatedly inflates the false positive rate", correct: true },
      { label: "Daily checks reduce statistical power to zero" },
      { label: "p-values cannot be computed daily" },
    ],
  },

  // ----------------------------------------------------------------- ML ----
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    prompt:
      "A model scores 0.98 on training data and 0.61 on held-out data. This is:",
    difficulty: 1,
    options: [
      { label: "Overfitting", correct: true },
      { label: "Underfitting" },
      { label: "Data leakage" },
      { label: "Class imbalance" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    prompt:
      "For a fraud detection dataset where 0.3% of transactions are fraudulent, which metric is least useful on its own?",
    difficulty: 2,
    explanation:
      "Predicting 'never fraud' scores 99.7% accuracy while catching nothing.",
    options: [
      { label: "Accuracy", correct: true },
      { label: "Precision" },
      { label: "Recall" },
      { label: "PR-AUC" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    prompt:
      "You scale features using statistics computed over the full dataset, then split into train and test. What has gone wrong?",
    difficulty: 3,
    explanation:
      "Test-set statistics have leaked into training, so the held-out score is optimistic.",
    options: [
      { label: "Nothing" },
      { label: "Data leakage — scaling must be fit on the training split only", correct: true },
      { label: "The features are now unscaled" },
      { label: "The model will underfit" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    prompt: "What does k-fold cross-validation give you that a single train/test split does not?",
    difficulty: 2,
    options: [
      { label: "A faster training run" },
      { label: "A more stable performance estimate, with a sense of its variance", correct: true },
      { label: "A guarantee against overfitting" },
      { label: "More training data overall" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    prompt:
      "Precision is 0.9 and recall is 0.3. In plain terms, the model is:",
    difficulty: 2,
    options: [
      { label: "Usually right when it flags something, but it misses most positives", correct: true },
      { label: "Catching most positives, but with many false alarms" },
      { label: "Performing well overall" },
      { label: "Predicting a single class" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "short",
    prompt:
      "Name the regularisation penalty (L1 or L2) that drives some coefficients exactly to zero, performing feature selection.",
    difficulty: 2,
    acceptedAnswers: ["L1", "l1", "L1 regularisation", "L1 regularization", "lasso"],
  },

  // --------------------------------------------------------------- SYSD ----
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "A read-heavy API serving the same few thousand records is hitting database limits. The cheapest effective first step is usually:",
    difficulty: 1,
    options: [
      { label: "Add a cache in front of the database", correct: true },
      { label: "Shard the database" },
      { label: "Rewrite the service in a faster language" },
      { label: "Move to a NoSQL database" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "Why is an idempotent endpoint valuable for a payment API?",
    difficulty: 2,
    options: [
      { label: "A retried request cannot charge the customer twice", correct: true },
      { label: "It makes responses faster" },
      { label: "It removes the need for authentication" },
      { label: "It compresses the response body" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    prompt:
      "What problem does a message queue between a web request and a slow job primarily solve?",
    difficulty: 2,
    options: [
      { label: "It decouples the request from the work, so the request returns promptly", correct: true },
      { label: "It makes the slow job run faster" },
      { label: "It removes the need for a database" },
      { label: "It guarantees the job never fails" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "A database read replica primarily helps with:",
    difficulty: 2,
    explanation:
      "Replicas absorb read load but lag behind, so they do not help write throughput or strong consistency.",
    options: [
      { label: "Read throughput, at the cost of possible replication lag", correct: true },
      { label: "Write throughput" },
      { label: "Guaranteeing strong consistency" },
      { label: "Reducing storage costs" },
    ],
  },

  // ------------------------------------------------------------ CS_CORE ----
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "What is a deadlock?",
    difficulty: 1,
    options: [
      { label: "Two or more processes each waiting on a resource the other holds", correct: true },
      { label: "A process consuming 100% CPU" },
      { label: "A process that has crashed" },
      { label: "Memory being exhausted" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "The main difference between a process and a thread is that threads:",
    difficulty: 1,
    options: [
      { label: "Share the same address space", correct: true },
      { label: "Always run on separate cores" },
      { label: "Cannot access files" },
      { label: "Have separate memory spaces" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "TCP differs from UDP chiefly in that TCP:",
    difficulty: 1,
    options: [
      { label: "Guarantees ordered, reliable delivery", correct: true },
      { label: "Is always faster" },
      { label: "Does not use ports" },
      { label: "Cannot be used over the internet" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "In ACID, what does the 'I' guarantee?",
    difficulty: 2,
    options: [
      { label: "Concurrent transactions do not observe each other's partial state", correct: true },
      { label: "Committed data survives a crash" },
      { label: "Transactions complete fully or not at all" },
      { label: "Constraints are never violated" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    prompt: "Virtual memory allows a process to:",
    difficulty: 2,
    options: [
      { label: "Use an address space larger than physical RAM, paging to disk", correct: true },
      { label: "Run without an operating system" },
      { label: "Access another process's memory directly" },
      { label: "Avoid using the CPU cache" },
    ],
  },

  // --------------------------------------------------------------- APTI ----
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    prompt:
      "A train travels 240 km in 3 hours. Maintaining the same speed, how long does it take to travel 400 km?",
    difficulty: 1,
    explanation: "80 km/h, so 400/80 = 5 hours.",
    options: [
      { label: "4 hours" },
      { label: "5 hours", correct: true },
      { label: "5.5 hours" },
      { label: "6 hours" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    prompt:
      "An item's price rises 20%, then falls 20%. Compared with the original price, the final price is:",
    difficulty: 2,
    explanation: "1.2 × 0.8 = 0.96, a 4% net fall.",
    options: [
      { label: "The same" },
      { label: "4% lower", correct: true },
      { label: "4% higher" },
      { label: "20% lower" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    prompt:
      "All engineers in a team know Python. Some who know Python also know Go. Which must be true?",
    difficulty: 2,
    options: [
      { label: "Some engineers may know Go", correct: true },
      { label: "All engineers know Go" },
      { label: "No engineer knows Go" },
      { label: "Everyone who knows Go is an engineer" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["DA"],
    type: "mcq",
    prompt:
      "You must tell a non-technical stakeholder that a data pipeline failure delayed a report. The most effective opening is:",
    difficulty: 2,
    options: [
      { label: "State the impact and the new timeline, then the cause", correct: true },
      { label: "Open with the stack trace" },
      { label: "Apologise at length before saying what happened" },
      { label: "Wait until the fix is fully deployed before saying anything" },
    ],
  },
];
