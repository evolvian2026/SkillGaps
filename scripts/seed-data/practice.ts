/**
 * Practice question bank.
 *
 * Deliberately separate content from `questions.ts`, not a subset of it.
 * Practice shows the correct answer and an explanation the moment a student
 * answers; if any of these could also appear on a diagnostic, practice would be
 * an answer key and every diagnostic score in the product would be worthless.
 *
 * Every item carries an explanation, because an explanation is the entire
 * reason a student is here rather than retaking the paper.
 */

export interface SeedPracticeQuestion {
  skillArea: string;
  prompt: string;
  difficulty: 1 | 2 | 3;
  explanation: string;
  options: { label: string; correct?: boolean }[];
}

export const PRACTICE_QUESTIONS: SeedPracticeQuestion[] = [
  // ------------------------------------------------------------------ DSA --
  {
    skillArea: "DSA",
    difficulty: 1,
    prompt:
      "You need to check whether a value exists in a collection of 100,000 items, many times per second. Which structure gives the best average lookup time?",
    explanation:
      "A hash set answers membership in O(1) on average. A sorted array is O(log n) with binary search, and scanning a list is O(n). The trade is memory and the loss of ordering — if you also need 'the next largest value', a balanced tree is the better fit.",
    options: [
      { label: "A hash set", correct: true },
      { label: "A sorted array with binary search" },
      { label: "A linked list" },
      { label: "A stack" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 2,
    prompt:
      "A recursive function computes fib(n) by calling fib(n-1) and fib(n-2). What is its time complexity, and what fixes it?",
    explanation:
      "It is O(2^n): the same subproblems are recomputed exponentially often. Memoising the results — storing fib(k) the first time it is computed — collapses it to O(n), because each subproblem is then solved once. This is the whole idea behind dynamic programming.",
    options: [
      { label: "O(2^n); memoise the subproblems", correct: true },
      { label: "O(n^2); use a faster language" },
      { label: "O(n log n); sort the inputs first" },
      { label: "O(n); it is already optimal" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 2,
    prompt:
      "Why does appending to a dynamic array cost O(1) amortised, even though it sometimes has to copy every element?",
    explanation:
      "The array doubles when full, so a copy of n elements happens only after n cheap appends. Spread across those appends the cost per operation is constant. 'Amortised' means averaged over a sequence — an individual append can still be O(n).",
    options: [
      {
        label: "Doubling means an expensive copy is paid for by the cheap appends before it",
        correct: true,
      },
      { label: "Copying is O(1) because memory is contiguous" },
      { label: "The compiler optimises the copy away" },
      { label: "It is not O(1); it is O(n) per append" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 3,
    prompt:
      "You must return the k largest items from a stream of millions of numbers, holding as little as possible in memory. What do you use?",
    explanation:
      "A min-heap of size k: each new value is compared against the smallest kept item, replacing it when larger. Memory is O(k) rather than O(n), and each item costs O(log k). Sorting everything needs the whole stream in memory, which is the constraint being tested.",
    options: [
      { label: "A min-heap holding k items", correct: true },
      { label: "Sort the stream and take the last k" },
      { label: "A max-heap holding every item" },
      { label: "A hash map keyed by value" },
    ],
  },

  // ------------------------------------------------------------------ SQL --
  {
    skillArea: "SQL",
    difficulty: 1,
    prompt:
      "A LEFT JOIN returns 500 rows where the INNER JOIN returned 480. What do the extra 20 rows represent?",
    explanation:
      "Rows in the left table with no match on the right; their right-hand columns come back NULL. That is exactly what a LEFT JOIN is for — 'every student, and their placement if they have one'. Filtering on a right-hand column in the WHERE clause silently turns it back into an inner join.",
    options: [
      { label: "Left-table rows with no matching right-table row", correct: true },
      { label: "Duplicate rows created by the join" },
      { label: "Rows where both sides are NULL" },
      { label: "Rows excluded by the ON condition on both sides" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 2,
    prompt:
      "Why does WHERE fail when you try to filter on the result of COUNT(*), and what do you use instead?",
    explanation:
      "WHERE is applied before rows are grouped, so aggregates do not exist yet. HAVING runs after grouping and can filter on them. The order is roughly FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY, which also explains why a SELECT alias is not usable in WHERE.",
    options: [
      { label: "WHERE runs before grouping; use HAVING", correct: true },
      { label: "COUNT(*) must be wrapped in a subquery first" },
      { label: "WHERE cannot reference any function" },
      { label: "You must add the aggregate to GROUP BY" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 2,
    prompt:
      "You need each student's score alongside their department's average, on every row. Which tool does this without collapsing the rows?",
    explanation:
      "A window function: AVG(score) OVER (PARTITION BY department). GROUP BY would collapse each department to one row, losing the individual scores. Window functions compute across a set of rows while still returning every row — the usual answer to 'per-row value plus a group-level value'.",
    options: [
      { label: "AVG(score) OVER (PARTITION BY department)", correct: true },
      { label: "GROUP BY department" },
      { label: "DISTINCT ON (department)" },
      { label: "A self-join on department" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 3,
    prompt:
      "A query on a 10-million-row table is slow. EXPLAIN shows a sequential scan despite an index on the filtered column. What is the most likely cause?",
    explanation:
      "The filter is not usable by the index — commonly because a function is applied to the column (WHERE lower(email) = ...), or the query returns so much of the table that a scan is genuinely cheaper. An index on an expression, or rewriting the predicate to leave the column bare, is the usual fix.",
    options: [
      {
        label: "A function is applied to the column, so the plain index cannot be used",
        correct: true,
      },
      { label: "The index needs rebuilding after every insert" },
      { label: "Indexes never help on tables above a million rows" },
      { label: "The table is missing a primary key" },
    ],
  },

  // -------------------------------------------------------------- CS_CORE --
  {
    skillArea: "CS_CORE",
    difficulty: 1,
    prompt:
      "What is the practical difference between a process and a thread?",
    explanation:
      "Processes have separate memory; threads within a process share it. Sharing makes threads cheap to create and to communicate between, and is also why threads need locks — two threads writing the same variable is a data race, whereas two processes simply cannot see each other's memory.",
    options: [
      { label: "Processes have separate memory; threads share it", correct: true },
      { label: "Threads are always faster than processes" },
      { label: "Processes cannot run in parallel" },
      { label: "Threads have their own address space" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 2,
    prompt:
      "Your service returns 504 Gateway Timeout under load but the application logs show no errors. Where is the problem most likely to be?",
    explanation:
      "A 504 comes from something in front of your application — a proxy or load balancer — that gave up waiting. The application never errored because it never finished. Look for a slow dependency, an exhausted connection pool, or a thread pool with everything blocked.",
    options: [
      {
        label: "Upstream of the app: a proxy timed out waiting for a slow response",
        correct: true,
      },
      { label: "The client sent a malformed request" },
      { label: "The application threw an uncaught exception" },
      { label: "DNS resolution failed" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 2,
    prompt:
      "Why is `git rebase` discouraged on a branch other people have already pulled?",
    explanation:
      "Rebasing rewrites commits, giving them new hashes. Anyone who already has the old commits now has a diverged history and gets conflicts on their next pull. On a shared branch, merge instead; rebase is for tidying work only you hold.",
    options: [
      {
        label: "It rewrites history, so collaborators' copies diverge",
        correct: true,
      },
      { label: "It deletes the remote branch" },
      { label: "It cannot be undone under any circumstances" },
      { label: "It always produces merge conflicts" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 3,
    prompt:
      "What problem does a database index solve, and what does it cost?",
    explanation:
      "It turns a full scan into a lookup, at the cost of extra storage and slower writes — every insert, update and delete must maintain the index too. That trade is why you index the columns you filter and join on, not every column.",
    options: [
      { label: "Faster reads, at the cost of storage and slower writes", correct: true },
      { label: "Faster reads and faster writes, at the cost of storage" },
      { label: "Smaller tables, at the cost of slower reads" },
      { label: "Guaranteed uniqueness, with no other effect" },
    ],
  },

  // ----------------------------------------------------------------- PROG --
  {
    skillArea: "PROG",
    difficulty: 1,
    prompt:
      "In Python, why can a mutable default argument like `def f(items=[])` cause surprising behaviour?",
    explanation:
      "The default is created once, when the function is defined, not on each call — so mutations persist between calls. The usual fix is `def f(items=None)` and `items = items or []` inside. This is one of the most common real bugs in Python code.",
    options: [
      { label: "The list is created once and shared across all calls", correct: true },
      { label: "Python copies the list on every call, which is slow" },
      { label: "Default arguments cannot be mutated at all" },
      { label: "The list is garbage collected between calls" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 2,
    prompt:
      "What does it mean for a function to be idempotent, and why does it matter for a retry?",
    explanation:
      "Calling it twice has the same effect as calling it once. That is what makes a retry safe: if a request times out you cannot know whether it was applied, so the ability to repeat it without doubling the effect is what lets you recover from an unreliable network.",
    options: [
      { label: "Repeating the call has the same effect as making it once", correct: true },
      { label: "It always returns the same value regardless of input" },
      { label: "It has no side effects of any kind" },
      { label: "It can safely run in parallel with itself" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 2,
    prompt:
      "Why does catching a broad exception and continuing silently tend to make debugging harder rather than easier?",
    explanation:
      "The program keeps running in a state its author never intended, so the eventual failure happens far from the cause and looks unrelated. Catch what you can actually handle; let the rest surface where it happened, with the context still attached.",
    options: [
      {
        label: "The failure surfaces later, far from its cause",
        correct: true,
      },
      { label: "Broad catches are slower at runtime" },
      { label: "It prevents the stack trace from ever being generated" },
      { label: "It converts all errors into syntax errors" },
    ],
  },

  // ---------------------------------------------------------------- APTI ---
  {
    skillArea: "APTI",
    difficulty: 1,
    prompt:
      "A task takes 6 people 12 days. Assuming the work splits evenly, how long does it take 9 people?",
    explanation:
      "Total work is 6 × 12 = 72 person-days. Divided among 9 people that is 8 days. The assumption doing the heavy lifting is that the work splits evenly — which is exactly the assumption that fails for real software teams.",
    options: [
      { label: "8 days", correct: true },
      { label: "9 days" },
      { label: "18 days" },
      { label: "6 days" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 2,
    prompt:
      "A price rises 20% and is then reduced 20%. How does the final price compare with the original?",
    explanation:
      "It is 4% lower: 100 → 120 → 96. The second percentage is taken from the larger number, so the two do not cancel. The same asymmetry is why a 50% drop needs a 100% gain to recover.",
    options: [
      { label: "4% lower than the original", correct: true },
      { label: "Exactly the same" },
      { label: "4% higher" },
      { label: "20% lower" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 2,
    prompt:
      "You have to tell a manager that a feature will miss its date. What makes the message most useful to them?",
    explanation:
      "The new date, the reason, and what you need — early. A manager's job is to re-plan around the truth; the worst version is a late, vague message that leaves them unable to act. Confidence is not the point; usable information is.",
    options: [
      {
        label: "The revised date, the cause, and what you need to unblock it",
        correct: true,
      },
      { label: "A reassurance that you will try to catch up" },
      { label: "A detailed technical account of the obstacle" },
      { label: "Nothing until you are certain of the new date" },
    ],
  },

  // ---------------------------------------------------------------- STATS --
  {
    skillArea: "STATS",
    difficulty: 2,
    prompt:
      "A test is significant at p < 0.05. What does that actually tell you?",
    explanation:
      "That data this extreme would be unlikely if the null hypothesis were true. It does not tell you the probability that the hypothesis is true, nor that the effect is large or useful. A tiny effect becomes significant with a big enough sample.",
    options: [
      {
        label: "Data this extreme would be unlikely if there were no real effect",
        correct: true,
      },
      { label: "There is a 95% chance the hypothesis is true" },
      { label: "The effect is large enough to matter" },
      { label: "The result will replicate 95% of the time" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 2,
    prompt:
      "Median household income is often quoted instead of the mean. Why?",
    explanation:
      "Income is heavily right-skewed: a few very large values pull the mean upward, away from what a typical household earns. The median is the middle value and is unaffected by how extreme the tail is, so it describes the typical case better.",
    options: [
      { label: "The mean is pulled up by a small number of very high incomes", correct: true },
      { label: "The median is always larger than the mean" },
      { label: "The mean cannot be computed for skewed data" },
      { label: "The median uses more of the data" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 3,
    prompt:
      "Ice cream sales and drowning deaths rise together. What is the most likely explanation?",
    explanation:
      "A confounder: hot weather drives both. This is the standard illustration of why correlation is not causation — and why the honest move is to look for the third variable rather than to explain the link away.",
    options: [
      { label: "A third variable — hot weather — drives both", correct: true },
      { label: "Ice cream consumption impairs swimming" },
      { label: "The correlation must be a coincidence" },
      { label: "Drowning reports increase ice cream demand" },
    ],
  },

  // ------------------------------------------------------------------- ML --
  {
    skillArea: "ML",
    difficulty: 2,
    prompt:
      "Your model scores 99% on training data and 62% on held-out data. What is happening?",
    explanation:
      "Overfitting: the model has learned noise specific to the training set rather than the underlying pattern. More data, fewer parameters, regularisation or early stopping all attack it. The gap between the two numbers is the diagnostic, not either number alone.",
    options: [
      { label: "Overfitting — it has memorised the training set", correct: true },
      { label: "Underfitting — the model is too simple" },
      { label: "The test set is mislabelled" },
      { label: "The learning rate is too low" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 2,
    prompt:
      "A fraud classifier is 99.5% accurate, but fraud is 0.5% of transactions. Why is accuracy the wrong metric?",
    explanation:
      "Predicting 'never fraud' scores 99.5% and catches nothing. With heavily imbalanced classes, precision and recall on the rare class — or the area under the precision-recall curve — say whether the model does anything useful.",
    options: [
      {
        label: "Always predicting the majority class scores nearly as well",
        correct: true,
      },
      { label: "Accuracy cannot be computed for binary problems" },
      { label: "99.5% is too low for production" },
      { label: "Accuracy ignores the training set size" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 3,
    prompt:
      "Why is it a mistake to fit a scaler on the whole dataset before splitting into train and test?",
    explanation:
      "The scaler learns the mean and variance of the test data too, so information from the test set leaks into training and the measured score is optimistic. Fit on train only, then apply that fitted scaler to test — which is exactly what a pipeline exists to enforce.",
    options: [
      { label: "Test-set statistics leak into training, inflating the score", correct: true },
      { label: "Scaling is only valid on training data by convention" },
      { label: "It makes the model train more slowly" },
      { label: "The test set must be scaled with its own statistics" },
    ],
  },

  // ----------------------------------------------------------------- SYSD --
  {
    skillArea: "SYSD",
    difficulty: 2,
    prompt:
      "What problem does a cache solve, and what new problem does it always introduce?",
    explanation:
      "It trades staleness for speed: reads get faster, but the cached copy can disagree with the source. Every caching design is therefore an invalidation design — deciding how wrong a value is allowed to be, and for how long.",
    options: [
      { label: "Faster reads, at the cost of data that can be stale", correct: true },
      { label: "Lower storage cost, at the cost of slower reads" },
      { label: "Stronger consistency, at the cost of availability" },
      { label: "Simpler code, at the cost of memory" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 2,
    prompt:
      "Why put a queue between a web request and a slow job like video encoding?",
    explanation:
      "The request returns as soon as the work is accepted, so a slow job cannot hold a connection open or time out the user. It also lets the workers be scaled and retried independently — at the cost of the result no longer being available immediately.",
    options: [
      {
        label: "The request returns immediately; the work is retried and scaled separately",
        correct: true,
      },
      { label: "Queues make the encoding itself faster" },
      { label: "It guarantees the job runs exactly once" },
      { label: "It removes the need for error handling" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 3,
    prompt:
      "Your API is rate-limited per user. Why add jitter to the client's retry backoff?",
    explanation:
      "Without jitter every client that failed at the same moment retries at the same moment, so the recovering service is hit by a synchronised wave and fails again. Randomising the interval spreads the load out — the same reason this product's own answer outbox jitters its retries.",
    options: [
      { label: "To stop every client retrying in the same instant", correct: true },
      { label: "To make retries happen sooner on average" },
      { label: "To guarantee ordering between retries" },
      { label: "To reduce the size of each request" },
    ],
  },

  // -------------------------------------------------------------- PY_DATA --
  {
    skillArea: "PY_DATA",
    difficulty: 1,
    prompt:
      "In pandas, what does `df.groupby('branch')['score'].mean()` return?",
    explanation:
      "A Series indexed by branch, holding the mean score for each. Grouping collapses the rows; if you want the mean attached to every original row instead, `transform('mean')` is the tool.",
    options: [
      { label: "A Series of mean scores, indexed by branch", correct: true },
      { label: "A DataFrame with the original rows plus a mean column" },
      { label: "A single number: the overall mean" },
      { label: "A list of branches sorted by score" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 2,
    prompt:
      "Why does `df[df['score'] > 50]['score'] = 0` often fail to change the DataFrame?",
    explanation:
      "Chained indexing may operate on a copy rather than the original, so the write goes nowhere — pandas usually warns about exactly this. `df.loc[df['score'] > 50, 'score'] = 0` addresses the frame in one step and assigns reliably.",
    options: [
      { label: "Chained indexing can write to a copy; use .loc instead", correct: true },
      { label: "Boolean masks are read-only in pandas" },
      { label: "The column must be converted to float first" },
      { label: "Assignment requires inplace=True" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 2,
    prompt:
      "You merge two DataFrames and the result has more rows than either input. What happened?",
    explanation:
      "The join key is not unique on at least one side, so rows multiplied — every match on the left paired with every match on the right. Check for duplicate keys before merging; this is the most common cause of a silently wrong analysis.",
    options: [
      { label: "The join key repeats, so matching rows multiplied", correct: true },
      { label: "An outer join always adds rows" },
      { label: "The indexes were not reset before merging" },
      { label: "Missing values were expanded into rows" },
    ],
  },
];
