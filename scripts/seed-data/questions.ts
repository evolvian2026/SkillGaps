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
  // ============================================================ DSA (more) ==
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "What is the worst-case time complexity of quicksort?",
    explanation: "O(n^2) when the pivot repeatedly splits off one element, e.g. an already-sorted array with a naive first-element pivot. The O(n log n) figure is the average case.",
    options: [
      { label: "O(n^2)", correct: true },
      { label: "O(n log n)" },
      { label: "O(n)" },
      { label: "O(log n)" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which structure gives O(1) access to the smallest element while allowing O(log n) insertion?",
    explanation: "A min-heap. A sorted array gives O(1) access but O(n) insertion; a hash set gives neither.",
    options: [
      { label: "A min-heap", correct: true },
      { label: "A hash set" },
      { label: "A singly linked list" },
      { label: "A queue" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "How many comparisons does binary search need, in the worst case, on a sorted array of 1,024 elements?",
    explanation: "About log2(1024) = 10. Each comparison halves the remaining range.",
    options: [
      { label: "10", correct: true },
      { label: "1,024" },
      { label: "512" },
      { label: "32" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "You must return the first non-repeating character in a string, in one pass over the data plus one pass over the counts. What do you need?",
    explanation: "A count per character that preserves insertion order (or a second pass over the original string). A hash map of counts plus a re-scan of the string in order gives O(n).",
    options: [
      { label: "A hash map of counts, then a second pass over the string in order", correct: true },
      { label: "Sorting the string first" },
      { label: "A stack of seen characters" },
      { label: "A nested loop over every pair" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What is the space complexity of a recursive depth-first traversal of a balanced binary tree with n nodes?",
    explanation: "O(log n) for the call stack, which is the tree's height. A skewed tree degrades to O(n).",
    options: [
      { label: "O(log n)", correct: true },
      { label: "O(1)" },
      { label: "O(n)" },
      { label: "O(n log n)" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "A sliding window of fixed size k moves across an array of n numbers, and you need each window's sum. What is the best complexity?",
    explanation: "O(n): keep a running sum, adding the entering element and subtracting the leaving one. Recomputing each window from scratch is O(n*k).",
    options: [
      { label: "O(n)", correct: true },
      { label: "O(n * k)" },
      { label: "O(n log n)" },
      { label: "O(k^2)" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "Which traversal of a binary search tree visits the values in ascending order?",
    explanation: "In-order: left subtree, node, right subtree. This is the property that makes a BST useful for ordered iteration.",
    options: [
      { label: "In-order", correct: true },
      { label: "Pre-order" },
      { label: "Post-order" },
      { label: "Level-order" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "Dijkstra's algorithm gives wrong answers on a graph containing negative edge weights. Why?",
    explanation: "It finalises a node's distance as soon as it is dequeued, assuming no later path can be shorter. A negative edge can make a later path shorter, so the assumption fails. Bellman-Ford handles negative weights.",
    options: [
      { label: "It finalises each node's distance too early to account for a later, cheaper path", correct: true },
      { label: "Its priority queue cannot store negative numbers" },
      { label: "It only works on undirected graphs" },
      { label: "It requires the graph to be acyclic" },
    ],
  },
  {
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "You need the median of a stream of numbers at any point, efficiently. What structure supports this?",
    explanation: "Two heaps: a max-heap of the lower half and a min-heap of the upper half, kept balanced. The median is then at one or both roots, in O(1), with O(log n) inserts.",
    options: [
      { label: "Two heaps, one for each half of the data", correct: true },
      { label: "A single sorted array, re-sorted on each insert" },
      { label: "A hash map keyed by value" },
      { label: "A queue of the last k values" },
    ],
  },

  // ============================================================ SQL (more) ==
  {
    skillArea: "SQL",
    tracks: ["SDE", "DA", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which clause removes duplicate rows from a result set?",
    explanation: "DISTINCT. GROUP BY also collapses duplicates but is for aggregation; HAVING filters groups; UNIQUE is a constraint, not a query clause.",
    options: [
      { label: "DISTINCT", correct: true },
      { label: "UNIQUE" },
      { label: "HAVING" },
      { label: "TRUNCATE" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "What does a FULL OUTER JOIN return that an INNER JOIN does not?",
    explanation: "Unmatched rows from both sides, with NULLs on the missing half. An inner join returns only rows that matched on both.",
    options: [
      { label: "Unmatched rows from both tables, padded with NULLs", correct: true },
      { label: "Only rows matching in both tables" },
      { label: "Unmatched rows from the left table only" },
      { label: "A cartesian product of both tables" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "In which order does SQL logically evaluate WHERE, GROUP BY and HAVING?",
    explanation: "WHERE, then GROUP BY, then HAVING. This is why WHERE cannot reference an aggregate and HAVING can.",
    options: [
      { label: "WHERE, then GROUP BY, then HAVING", correct: true },
      { label: "GROUP BY, then WHERE, then HAVING" },
      { label: "HAVING, then WHERE, then GROUP BY" },
      { label: "They are evaluated in the order written" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "A table has 1,000 orders across 200 customers. `SELECT COUNT(DISTINCT customer_id) FROM orders` returns what?",
    explanation: "200 — the number of distinct customers, not the number of orders. COUNT(*) would return 1,000.",
    options: [
      { label: "200", correct: true },
      { label: "1,000" },
      { label: "1,200" },
      { label: "It depends on whether customer_id is indexed" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "Which is true of `LEFT JOIN orders o ... WHERE o.status = 'paid'`?",
    explanation: "Filtering a right-hand column in WHERE discards the NULL-padded unmatched rows, so the left join behaves as an inner join. Moving the condition into the ON clause preserves them.",
    options: [
      { label: "It behaves as an inner join, because the NULL rows fail the filter", correct: true },
      { label: "It keeps all left rows regardless of the filter" },
      { label: "It is a syntax error" },
      { label: "It returns only rows where status is NULL" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does `RANK()` do differently from `ROW_NUMBER()` when two rows tie?",
    explanation: "RANK gives tied rows the same rank and then skips values (1,1,3); ROW_NUMBER always assigns distinct consecutive numbers. DENSE_RANK ties without skipping (1,1,2).",
    options: [
      { label: "RANK repeats the rank for ties and then skips; ROW_NUMBER never repeats", correct: true },
      { label: "They are identical" },
      { label: "ROW_NUMBER repeats for ties; RANK does not" },
      { label: "RANK cannot be used with PARTITION BY" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "Why can `SELECT * FROM big_table ORDER BY created_at LIMIT 10` still be slow without an index on created_at?",
    explanation: "Without an ordered index the database must sort the whole table before it can know which ten rows come first. The LIMIT reduces what is returned, not what is examined.",
    options: [
      { label: "The whole table must be sorted before the first ten rows are known", correct: true },
      { label: "LIMIT is applied before ORDER BY" },
      { label: "SELECT * always forces a sequential scan" },
      { label: "The limit is too small for the planner to optimise" },
    ],
  },
  {
    skillArea: "SQL",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "A query with `NOT IN (SELECT customer_id FROM blocked)` returns no rows, though most customers are not blocked. What is the likely cause?",
    explanation: "The subquery contains a NULL. `x NOT IN (1, NULL)` evaluates to unknown for every x, so no row qualifies. NOT EXISTS, or filtering the NULLs out, behaves as intended.",
    options: [
      { label: "The subquery returns a NULL, which makes every NOT IN comparison unknown", correct: true },
      { label: "NOT IN is not supported on subqueries" },
      { label: "The subquery returns too many rows" },
      { label: "blocked has no index on customer_id" },
    ],
  },
  // ======================================================== PY_DATA (more) ==
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which pandas call returns the number of rows and columns in a DataFrame?",
    explanation: "df.shape returns a (rows, columns) tuple. len(df) gives rows only; df.size gives the total cell count.",
    options: [
      { label: "df.shape", correct: true },
      { label: "df.size" },
      { label: "df.count()" },
      { label: "df.length" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "What does `df['col'].value_counts()` return?",
    explanation: "A Series of how often each distinct value occurs, sorted descending. It excludes NaN unless dropna=False is passed.",
    options: [
      { label: "How often each distinct value occurs, most frequent first", correct: true },
      { label: "The number of non-null values" },
      { label: "The distinct values, in the original order" },
      { label: "Summary statistics for the column" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which is the correct way to select rows where score exceeds 50?",
    explanation: "Boolean masking: df[df['score'] > 50]. The mask is a Series of True/False aligned to the index.",
    options: [
      { label: "df[df['score'] > 50]", correct: true },
      { label: "df.select('score > 50')" },
      { label: "df.where('score' > 50)" },
      { label: "df['score' > 50]" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What is the difference between `.loc` and `.iloc`?",
    explanation: ".loc indexes by label, .iloc by integer position. They coincide only when the index happens to be a default RangeIndex.",
    options: [
      { label: ".loc indexes by label; .iloc by integer position", correct: true },
      { label: ".loc is for rows; .iloc is for columns" },
      { label: ".iloc is the older, deprecated form of .loc" },
      { label: ".loc returns a copy; .iloc returns a view" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "A left merge of 1,000 rows onto a lookup table returns 1,000 rows, but many new columns are NaN. What does that mean?",
    explanation: "Those keys had no match in the lookup table. A left join keeps every left row and pads the missing right-hand columns with NaN — so the NaNs are the unmatched keys, not an error.",
    options: [
      { label: "Those join keys had no match on the right-hand side", correct: true },
      { label: "The merge silently dropped rows" },
      { label: "The lookup table has duplicate keys" },
      { label: "The join was performed on the wrong axis" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "Which operation is a vectorised alternative to looping over rows to compute a new column?",
    explanation: "An arithmetic expression on whole columns, e.g. df['c'] = df['a'] * df['b'], which runs in optimised C. apply() with a Python function still loops; iterrows is slower still.",
    options: [
      { label: "An arithmetic expression on the columns themselves", correct: true },
      { label: "df.iterrows() with an append" },
      { label: "A for loop over df.index" },
      { label: "df.itertuples() with a list comprehension" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "In NumPy, what does broadcasting a (3,1) array against a (1,4) array produce?",
    explanation: "A (3,4) array: each dimension of size 1 is stretched to match the other operand. This is why an accidental shape mismatch can produce a huge array instead of an error.",
    options: [
      { label: "A (3, 4) array", correct: true },
      { label: "A (3, 1) array" },
      { label: "A (1, 4) array" },
      { label: "A shape error" },
    ],
  },
  {
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "You pivot a table and get a MultiIndex on the columns. What is the usual next step before writing it to CSV?",
    explanation: "Flatten the MultiIndex into single-level names — otherwise the CSV gains a confusing second header row that most downstream readers mishandle.",
    options: [
      { label: "Flatten the column MultiIndex into single-level names", correct: true },
      { label: "Reset the row index only" },
      { label: "Convert every column to a string dtype" },
      { label: "Nothing — CSV handles MultiIndex natively" },
    ],
  },

  // ========================================================== STATS (more) ==
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which measure of central tendency is most affected by a single extreme outlier?",
    explanation: "The mean, because every value enters the sum. The median depends only on the middle position, and the mode on frequency.",
    options: [
      { label: "The mean", correct: true },
      { label: "The median" },
      { label: "The mode" },
      { label: "All three equally" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "In a normal distribution, roughly what proportion of values lie within one standard deviation of the mean?",
    explanation: "About 68%. Two standard deviations covers about 95%, and three about 99.7% — the 68-95-99.7 rule.",
    options: [
      { label: "About 68%", correct: true },
      { label: "About 50%" },
      { label: "About 95%" },
      { label: "About 99%" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "What does a correlation coefficient of -0.9 indicate?",
    explanation: "A strong negative linear relationship: as one variable rises the other falls, consistently. The sign is direction; the magnitude is strength.",
    options: [
      { label: "A strong negative linear relationship", correct: true },
      { label: "A weak relationship, because the value is negative" },
      { label: "No relationship" },
      { label: "That one variable causes a decrease in the other" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "An A/B test shows a 2% lift with p = 0.30 on 400 users. What is the right conclusion?",
    explanation: "There is not enough evidence to conclude the variants differ. It is not evidence that they are the same either — with 400 users the test likely lacks the power to detect a 2% effect at all.",
    options: [
      { label: "Not enough evidence either way; the test is probably underpowered", correct: true },
      { label: "The variants are equivalent" },
      { label: "B is better, since the lift is positive" },
      { label: "The result is significant at the 30% level" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does the interquartile range measure?",
    explanation: "The spread of the middle 50% of the data, from the 25th to the 75th percentile. It ignores the tails, which is why it is used with the median for skewed data.",
    options: [
      { label: "The spread of the middle half of the data", correct: true },
      { label: "The difference between the largest and smallest values" },
      { label: "The average distance from the mean" },
      { label: "The number of outliers" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "A dataset's mean is well above its median. What does that suggest about its shape?",
    explanation: "A right (positive) skew: a tail of large values pulls the mean above the median. Income and response times typically look like this.",
    options: [
      { label: "It is right-skewed, with a tail of large values", correct: true },
      { label: "It is left-skewed" },
      { label: "It is symmetric" },
      { label: "It is bimodal" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "What does Bayes' theorem let you compute?",
    explanation: "The probability of a hypothesis given the evidence, from the probability of the evidence given the hypothesis plus the prior. It is why a highly accurate test for a rare condition still yields many false positives.",
    options: [
      { label: "P(hypothesis | evidence), from P(evidence | hypothesis) and the prior", correct: true },
      { label: "The probability that a p-value is correct" },
      { label: "The confidence interval for a sample mean" },
      { label: "The correlation between two variables" },
    ],
  },
  {
    skillArea: "STATS",
    tracks: ["DA", "MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "A test for a disease affecting 1 in 1,000 people is 99% accurate. A random person tests positive. Roughly what is the chance they have it?",
    explanation: "About 9%. Among 1,000 people, one true case is detected but about ten healthy people test positive, so most positives are false. Base rates dominate when a condition is rare.",
    options: [
      { label: "About 9%", correct: true },
      { label: "About 99%" },
      { label: "About 50%" },
      { label: "About 1%" },
    ],
  },

  // ============================================================= ML (more) ==
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which of these is a regression rather than a classification problem?",
    explanation: "Predicting a continuous quantity — a house price — is regression. Spam or not, churn or not, and digit identity are all classification.",
    options: [
      { label: "Predicting a house's sale price", correct: true },
      { label: "Deciding whether an email is spam" },
      { label: "Recognising a handwritten digit" },
      { label: "Predicting whether a customer will churn" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 1,
    prompt: "What is a feature, in machine learning terms?",
    explanation: "An input variable the model learns from. The label is what it predicts; a parameter is learned during training; a hyperparameter is set before it.",
    options: [
      { label: "An input variable the model learns from", correct: true },
      { label: "The value the model predicts" },
      { label: "A weight learned during training" },
      { label: "A setting chosen before training begins" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does regularisation do to a model?",
    explanation: "It penalises complexity — large coefficients — trading a little training accuracy for better generalisation. It is one of the standard responses to overfitting.",
    options: [
      { label: "Penalises complexity, trading training fit for generalisation", correct: true },
      { label: "Increases the model's capacity to fit the data" },
      { label: "Normalises the input features to zero mean" },
      { label: "Removes outliers from the training set" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "Why is a confusion matrix more informative than a single accuracy figure?",
    explanation: "It separates the kinds of error — false positives from false negatives — which usually have very different costs. Accuracy collapses them into one number that hides the trade-off.",
    options: [
      { label: "It separates false positives from false negatives, which have different costs", correct: true },
      { label: "It is invariant to class imbalance" },
      { label: "It reports the model's training time" },
      { label: "It works for regression as well as classification" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What is the purpose of a learning rate in gradient descent?",
    explanation: "It scales each step down the gradient. Too large and the loss oscillates or diverges; too small and training crawls or stalls in a poor region.",
    options: [
      { label: "It controls how large each step down the gradient is", correct: true },
      { label: "It sets how many training examples are used per batch" },
      { label: "It determines the number of model parameters" },
      { label: "It decides when to stop training" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "What does the bias-variance trade-off describe?",
    explanation: "Simple models underfit (high bias); flexible ones fit noise (high variance). Total error is minimised somewhere between, which is why the most flexible model is rarely the best one.",
    options: [
      { label: "Simple models underfit; flexible ones fit noise — error is lowest between", correct: true },
      { label: "The trade-off between training time and accuracy" },
      { label: "The trade-off between precision and recall" },
      { label: "The trade-off between model size and inference speed" },
    ],
  },
  {
    skillArea: "ML",
    tracks: ["MLE"],
    type: "mcq",
    difficulty: 3,
    prompt: "Your training set has 95% class A and 5% class B. Which sampling strategy for the train/test split matters most?",
    explanation: "Stratified splitting, which preserves the class proportions in both halves. A random split can leave the test set with almost no class B, making the score meaningless for the class you care about.",
    options: [
      { label: "Stratified, so both halves keep the same class proportions", correct: true },
      { label: "Purely random, to avoid introducing bias" },
      { label: "Sorted by class, so each half is homogeneous" },
      { label: "It makes no difference at this size" },
    ],
  },
  // ======================================================== CS_CORE (more) ==
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which HTTP method is expected to be idempotent?",
    explanation: "PUT: applying it twice leaves the same state as applying it once. POST typically creates a new resource each time, so repeating it is not safe.",
    options: [
      { label: "PUT", correct: true },
      { label: "POST" },
      { label: "PATCH" },
      { label: "CONNECT" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "What is the purpose of DNS?",
    explanation: "It resolves a hostname to an IP address. Routing, encryption and load balancing are handled by other layers.",
    options: [
      { label: "Resolving a hostname to an IP address", correct: true },
      { label: "Encrypting traffic between client and server" },
      { label: "Routing packets between networks" },
      { label: "Balancing load across servers" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does a deadlock require, in terms of resource holding?",
    explanation: "A cycle of processes each holding one resource and waiting for another held by the next. Breaking any link — a consistent lock order, or timeouts — prevents it.",
    options: [
      { label: "A cycle of processes each holding one resource and waiting for another", correct: true },
      { label: "Two processes reading the same resource at once" },
      { label: "A process holding a resource for too long" },
      { label: "More processes than available CPU cores" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "Why does an HTTP API usually return 201 rather than 200 after creating a resource?",
    explanation: "201 Created states that a new resource exists and, by convention, gives its location. 200 only says the request succeeded, which is less informative to a client.",
    options: [
      { label: "201 states a new resource was created and where to find it", correct: true },
      { label: "200 is reserved for GET requests" },
      { label: "201 tells the client to retry" },
      { label: "There is no meaningful difference" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does `git bisect` help you do?",
    explanation: "Find the commit that introduced a bug, by binary search across history. It reduces a search over n commits to about log2(n) tests.",
    options: [
      { label: "Find the commit that introduced a bug, by binary search", correct: true },
      { label: "Split one commit into several" },
      { label: "Merge two branches without conflicts" },
      { label: "Remove a file from every commit in history" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "Why is it dangerous to build a SQL query by concatenating user input into the string?",
    explanation: "The input can close the literal and append its own SQL — injection. Parameterised queries send the value separately from the statement, so it can never be parsed as code.",
    options: [
      { label: "The input can be parsed as SQL; use parameterised queries instead", correct: true },
      { label: "String concatenation is slow at scale" },
      { label: "It prevents the query planner from caching" },
      { label: "It only matters if the database is public" },
    ],
  },
  {
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "A stateless service is easier to scale horizontally. Why?",
    explanation: "Any instance can serve any request, so instances can be added, removed or replaced without moving session state or routing a user to a specific machine.",
    options: [
      { label: "Any instance can serve any request, so instances are interchangeable", correct: true },
      { label: "Stateless services use less memory per request" },
      { label: "Stateless services do not need a load balancer" },
      { label: "Stateless services cannot fail" },
    ],
  },

  // =========================================================== PROG (more) ==
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "In Python, what does `list.append(x)` return?",
    explanation: "None — it mutates the list in place. Writing `xs = xs.append(1)` therefore replaces the list with None, a common beginner bug.",
    options: [
      { label: "None", correct: true },
      { label: "The modified list" },
      { label: "The appended element" },
      { label: "The new length of the list" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "Which is true of a Python tuple compared with a list?",
    explanation: "Tuples are immutable, so they can be dictionary keys and cannot be modified after creation. Lists are mutable and cannot be hashed.",
    options: [
      { label: "It is immutable, so it can be used as a dictionary key", correct: true },
      { label: "It can hold only one type of value" },
      { label: "It is always faster to iterate" },
      { label: "It cannot be nested" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does a `finally` block guarantee?",
    explanation: "It runs whether or not an exception was raised, and even if the try block returns — which is why it is the right place to release a resource.",
    options: [
      { label: "It runs whether or not an exception occurred", correct: true },
      { label: "It runs only when an exception was raised" },
      { label: "It runs only when no exception was raised" },
      { label: "It suppresses any exception raised in the try block" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What is the output of `print(0.1 + 0.2 == 0.3)` in Python?",
    explanation: "False. Neither 0.1 nor 0.2 is exactly representable in binary floating point, so the sum is very slightly off 0.3.",
    options: [
      { label: "False", correct: true },
      { label: "True" },
      { label: "A TypeError" },
      { label: "It varies between runs" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does a generator give you that a list does not?",
    explanation: "Values produced lazily, one at a time, so memory does not scale with the sequence length. The trade is that it can be consumed only once and has no random access.",
    options: [
      { label: "Lazy values, so memory does not grow with the sequence", correct: true },
      { label: "Faster random access to any element" },
      { label: "The ability to be iterated many times" },
      { label: "Automatic sorting of the output" },
    ],
  },
  {
    skillArea: "PROG",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "Why does modifying a list while iterating over it produce surprising results?",
    explanation: "The iterator tracks a position, so removing an element shifts later items past the cursor and they are skipped. Iterating a copy, or building a new list, avoids it.",
    options: [
      { label: "Removing an element shifts later items past the iterator's position", correct: true },
      { label: "Python forbids it and raises an error" },
      { label: "The list is copied on each iteration" },
      { label: "Iteration order becomes random" },
    ],
  },

  // =========================================================== SYSD (more) ==
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 1,
    prompt: "What is the main purpose of a CDN?",
    explanation: "Serving content from a location near the user, cutting latency and origin load. It does not make the origin application itself faster.",
    options: [
      { label: "Serving content from a location close to the user", correct: true },
      { label: "Encrypting traffic end to end" },
      { label: "Backing up the origin server's data" },
      { label: "Compressing the application's database" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does rate limiting protect against, beyond abuse?",
    explanation: "One noisy client exhausting capacity everyone else depends on. It converts an unbounded failure into a bounded, predictable rejection for the offender.",
    options: [
      { label: "A single client consuming the capacity others depend on", correct: true },
      { label: "Data corruption in the database" },
      { label: "Slow queries caused by missing indexes" },
      { label: "Loss of data during a deploy" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "Why is a health check endpoint that only returns 200 often insufficient?",
    explanation: "It says the process is up, not that it can do its job. An instance with a dead database connection passes such a check and keeps receiving traffic it cannot serve.",
    options: [
      { label: "It proves the process is running, not that its dependencies work", correct: true },
      { label: "Load balancers ignore 200 responses" },
      { label: "It is too slow to run frequently" },
      { label: "It cannot be used with HTTPS" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 2,
    prompt: "What does idempotency give an API client that may retry?",
    explanation: "The confidence that a retry after an ambiguous timeout will not duplicate the effect — the difference between one payment and two.",
    options: [
      { label: "A retry after a timeout cannot duplicate the effect", correct: true },
      { label: "Guaranteed delivery of every request" },
      { label: "Lower latency on repeated calls" },
      { label: "Automatic ordering of concurrent requests" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "A cache sits in front of a database. A popular key expires and a thousand requests miss simultaneously. What is this called?",
    explanation: "A cache stampede (or thundering herd): the database receives the full uncached load at once. Staggered expiry, or letting one request repopulate while others serve stale, prevents it.",
    options: [
      { label: "A cache stampede", correct: true },
      { label: "A cache hit ratio collapse" },
      { label: "A write-through failure" },
      { label: "An eviction cascade" },
    ],
  },
  {
    skillArea: "SYSD",
    tracks: ["SDE"],
    type: "mcq",
    difficulty: 3,
    prompt: "Why does adding more application servers sometimes fail to increase throughput?",
    explanation: "The bottleneck has moved elsewhere — usually a shared database, connection pool or lock. Adding capacity behind a saturated shared resource adds contention rather than throughput.",
    options: [
      { label: "The bottleneck is a shared resource the new servers also contend for", correct: true },
      { label: "Load balancers cannot exceed a fixed server count" },
      { label: "Each server has a fixed maximum of requests per second" },
      { label: "Horizontal scaling only helps read traffic" },
    ],
  },

  // =========================================================== APTI (more) ==
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "If 3 machines make 3 widgets in 3 minutes, how long do 100 machines take to make 100 widgets?",
    explanation: "3 minutes. Each machine makes one widget in 3 minutes, so 100 machines working in parallel make 100 widgets in the same 3 minutes.",
    options: [
      { label: "3 minutes", correct: true },
      { label: "100 minutes" },
      { label: "33 minutes" },
      { label: "1 minute" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 1,
    prompt: "A sum doubles in 8 years at simple interest. What is the annual rate?",
    explanation: "Doubling means the interest equals the principal, so 100% over 8 years — 12.5% per year at simple interest.",
    options: [
      { label: "12.5%", correct: true },
      { label: "8%" },
      { label: "25%" },
      { label: "10%" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "A batch has 40 students with a mean score of 70, and another has 60 students with a mean of 80. What is the combined mean?",
    explanation: "Weight by size: (40x70 + 60x80) / 100 = 7,600/100 = 76. Averaging 70 and 80 to 75 ignores that the second group is larger.",
    options: [
      { label: "76", correct: true },
      { label: "75" },
      { label: "74" },
      { label: "77.5" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 2,
    prompt: "In a code review you disagree with a senior colleague's approach. What is the most professional first step?",
    explanation: "Ask what constraint led them there. You may be missing context, and if you are not, the question surfaces the trade-off without turning it into a contest of seniority.",
    options: [
      { label: "Ask what led them to that approach, then state your concern with specifics", correct: true },
      { label: "Escalate to their manager for a decision" },
      { label: "Approve it, since they are more senior" },
      { label: "Reject it and rewrite the code yourself" },
    ],
  },
  {
    skillArea: "APTI",
    tracks: ["SDE", "DA"],
    type: "mcq",
    difficulty: 3,
    prompt: "A pipe fills a tank in 6 hours; another empties it in 9. Both open, how long to fill?",
    explanation: "Net rate is 1/6 - 1/9 = 1/18 of the tank per hour, so 18 hours. Subtracting the outflow rate, not the times, is the key step.",
    options: [
      { label: "18 hours", correct: true },
      { label: "3 hours" },
      { label: "7.2 hours" },
      { label: "15 hours" },
    ],
  },
];
