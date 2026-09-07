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
  // ------------------------------------------------------- DSA (more) ------
  {
    skillArea: "DSA",
    difficulty: 1,
    prompt: "What is the time complexity of looking up a key in a balanced binary search tree holding n items?",
    explanation:
      "O(log n): each comparison discards half the remaining tree. 'Balanced' is doing the work — an unbalanced BST degenerates into a linked list and becomes O(n), which is why self-balancing variants like red-black and AVL trees exist.",
    options: [
      { label: "O(log n)", correct: true },
      { label: "O(1)" },
      { label: "O(n)" },
      { label: "O(n log n)" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 1,
    prompt: "You need to process items in the order they arrived. Which structure fits?",
    explanation:
      "A queue: first in, first out. A stack is last in, first out, which is what you want for undo history or depth-first traversal. Choosing the wrong one is a common source of subtly wrong ordering in job processing.",
    options: [
      { label: "A queue", correct: true },
      { label: "A stack" },
      { label: "A hash map" },
      { label: "A binary heap" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 1,
    prompt: "Why is inserting into the middle of an array O(n) while inserting into the middle of a linked list is O(1)?",
    explanation:
      "An array stores elements contiguously, so everything after the insertion point must shift. A linked list only repoints two references. The catch is that reaching the middle of a linked list is itself O(n) — the O(1) applies once you already hold the node.",
    options: [
      { label: "The array must shift every later element; the list only repoints references", correct: true },
      { label: "Linked lists are stored in faster memory" },
      { label: "Arrays must be re-sorted after every insert" },
      { label: "Linked lists have no fixed capacity" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 2,
    prompt: "You need to detect whether a linked list contains a cycle, using constant extra memory. What works?",
    explanation:
      "Two pointers moving at different speeds — one step at a time and two at a time. If there is a cycle they eventually meet inside it; if there is not, the fast pointer reaches the end. A visited-set also works but costs O(n) memory, which the constraint rules out.",
    options: [
      { label: "Two pointers at different speeds, checking whether they meet", correct: true },
      { label: "A hash set of visited nodes" },
      { label: "Sorting the list first" },
      { label: "Reversing the list and comparing" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 2,
    prompt: "Two sorted arrays must be merged into one sorted array. What is the best achievable complexity?",
    explanation:
      "O(n + m): walk both with one index each, always taking the smaller head. Concatenating and re-sorting throws away the fact that both inputs are already ordered and costs O((n+m) log(n+m)) — this merge step is exactly what makes merge sort work.",
    options: [
      { label: "O(n + m)", correct: true },
      { label: "O(n log n)" },
      { label: "O(n × m)" },
      { label: "O(log n + log m)" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 2,
    prompt: "When does a hash map's average O(1) lookup degrade to O(n)?",
    explanation:
      "When many keys collide into the same bucket — a poor hash function, or adversarial input chosen to collide. The bucket becomes a linear scan. Real implementations mitigate this by resizing on load factor and, in some languages, switching a long bucket to a tree.",
    options: [
      { label: "When most keys hash into the same bucket", correct: true },
      { label: "When the map holds more than a million entries" },
      { label: "When keys are strings rather than integers" },
      { label: "Never — hash maps are always O(1)" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 3,
    prompt: "You must find the shortest path in an unweighted graph. Which traversal gives it directly?",
    explanation:
      "Breadth-first search: it explores in order of distance, so the first time it reaches a node it has done so by a shortest path. Depth-first search finds *a* path, not the shortest. Once edges carry different weights you need Dijkstra instead.",
    options: [
      { label: "Breadth-first search", correct: true },
      { label: "Depth-first search" },
      { label: "Either — they give the same result" },
      { label: "Neither; you must sort the edges first" },
    ],
  },
  {
    skillArea: "DSA",
    difficulty: 3,
    prompt: "A problem has overlapping subproblems and optimal substructure. What does that tell you?",
    explanation:
      "It is a dynamic programming candidate. Optimal substructure means an optimal solution is built from optimal solutions to subproblems; overlapping subproblems means the same ones recur, so caching pays. Without overlap, plain divide-and-conquer is the better fit.",
    options: [
      { label: "Dynamic programming will help — cache the subproblem results", correct: true },
      { label: "It must be solved greedily" },
      { label: "It is NP-hard" },
      { label: "It can only be solved by brute force" },
    ],
  },

  // ------------------------------------------------------- SQL (more) ------
  {
    skillArea: "SQL",
    difficulty: 1,
    prompt: "What does COUNT(column) do differently from COUNT(*)?",
    explanation:
      "COUNT(column) skips NULLs; COUNT(*) counts every row. This bites when you count a nullable column expecting a row count and quietly get a smaller number — a classic source of reports that are wrong but plausible.",
    options: [
      { label: "It ignores rows where that column is NULL", correct: true },
      { label: "It counts distinct values only" },
      { label: "It is always faster" },
      { label: "There is no difference" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 1,
    prompt: "Why does `WHERE status = NULL` never match anything?",
    explanation:
      "NULL means unknown, and any comparison with unknown is unknown rather than true — so the row is not returned. `IS NULL` is the test that works. The same reasoning explains why `NOT IN` with a NULL in the list returns nothing.",
    options: [
      { label: "Comparing with NULL yields unknown, not true; use IS NULL", correct: true },
      { label: "NULL must be quoted as a string" },
      { label: "The column must be indexed first" },
      { label: "It matches, but only in some databases" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 1,
    prompt: "What does a foreign key constraint actually guarantee?",
    explanation:
      "That the referenced row exists — you cannot insert an order for a customer id that is not in the customers table, and you cannot delete that customer while the order points at them (unless you asked for a cascade). It is the database enforcing a rule the application would otherwise have to remember.",
    options: [
      { label: "The referenced row exists, and stays until the reference is removed", correct: true },
      { label: "The two columns have the same data type" },
      { label: "Joins on that column are faster" },
      { label: "The referencing column cannot be NULL" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 2,
    prompt: "A report needs one row per customer with their most recent order. Which approach avoids returning every order?",
    explanation:
      "A window function ranking orders per customer — ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY placed_at DESC) — then filtering to rank 1. A plain GROUP BY gives you the max date but not the rest of that row, which is why 'greatest-n-per-group' is a named problem.",
    options: [
      { label: "ROW_NUMBER() over a partition, filtered to the first row", correct: true },
      { label: "GROUP BY customer_id with SELECT *" },
      { label: "DISTINCT on customer_id" },
      { label: "ORDER BY placed_at with LIMIT 1" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 2,
    prompt: "What does a transaction's atomicity guarantee?",
    explanation:
      "All of it happens or none of it does. If a transfer debits one account and the credit fails, the debit is rolled back too. This is why money movement belongs in a transaction — the alternative is a state no application code can reason about.",
    options: [
      { label: "Every statement commits, or none of them do", correct: true },
      { label: "Other transactions cannot read the data" },
      { label: "The changes survive a crash" },
      { label: "The statements run in parallel" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 2,
    prompt: "You add an index on (branch, batch_year). Which query can use it?",
    explanation:
      "A composite index is usable left-to-right, so filtering on branch alone works, and on branch plus batch_year works. Filtering on batch_year alone generally cannot use it — the index is ordered by branch first. This is why column order in a composite index matters.",
    options: [
      { label: "WHERE branch = 'CSE'", correct: true },
      { label: "WHERE batch_year = 2026" },
      { label: "Neither can use it" },
      { label: "Only a query using both, in that exact order" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 3,
    prompt: "Two transactions each update two rows in the opposite order and both hang. What has happened?",
    explanation:
      "A deadlock: each holds a lock the other needs. Databases detect this and abort one transaction with an error, expecting the application to retry. The durable fix is to acquire locks in a consistent order everywhere, so the cycle cannot form.",
    options: [
      { label: "A deadlock — each holds a lock the other is waiting for", correct: true },
      { label: "A full table scan on both queries" },
      { label: "The connection pool is exhausted" },
      { label: "A missing index on the updated rows" },
    ],
  },
  {
    skillArea: "SQL",
    difficulty: 3,
    prompt: "What problem does normalisation solve, and when is denormalising defensible?",
    explanation:
      "Normalising removes duplicated data, so a fact is stored once and cannot disagree with itself. Denormalising reintroduces duplication deliberately to avoid expensive joins on a read-heavy path — defensible when you can keep the copies in step and have measured that the join is the actual bottleneck.",
    options: [
      { label: "It removes duplication so a fact cannot contradict itself; denormalise only for a measured read bottleneck", correct: true },
      { label: "It makes tables smaller; denormalise when disk is cheap" },
      { label: "It speeds up writes; denormalise to speed up writes further" },
      { label: "It enforces foreign keys; denormalise when you drop them" },
    ],
  },

  // --------------------------------------------------- CS_CORE (more) ------
  {
    skillArea: "CS_CORE",
    difficulty: 1,
    prompt: "What is the practical difference between TCP and UDP?",
    explanation:
      "TCP guarantees delivery and ordering, retransmitting what is lost; UDP does neither and is therefore lighter. Video calls prefer UDP because a late packet is worse than a missing one — you would rather drop a frame than pause to recover it.",
    options: [
      { label: "TCP guarantees delivery and order; UDP does not", correct: true },
      { label: "UDP is encrypted; TCP is not" },
      { label: "TCP is for local networks only" },
      { label: "UDP guarantees delivery but not order" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 1,
    prompt: "What does HTTP status 401 mean, as distinct from 403?",
    explanation:
      "401 means not authenticated — we do not know who you are. 403 means authenticated but not permitted — we know who you are and the answer is still no. Returning 403 to an anonymous visitor is a common and confusing mix-up.",
    options: [
      { label: "401 is 'not authenticated'; 403 is 'authenticated but not allowed'", correct: true },
      { label: "401 is a client error; 403 is a server error" },
      { label: "They are interchangeable" },
      { label: "401 means the resource does not exist" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 1,
    prompt: "Why does `.gitignore` not stop a file that is already tracked from being committed?",
    explanation:
      "It only governs *untracked* files. Once git tracks a path, changes to it are staged as normal — you must `git rm --cached` it first. This is why a secret committed by accident stays in history until it is actively removed.",
    options: [
      { label: "It only applies to untracked files; the file must be un-tracked first", correct: true },
      { label: "The file must be listed twice" },
      { label: "It only works on new branches" },
      { label: "It does stop it; the commit must have used --force" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 2,
    prompt: "A container works locally but crashes in production with 'file not found'. What is the most likely cause?",
    explanation:
      "Something in the image depends on the local machine — a file mounted from the host, a path outside the build context, or a dependency present locally but never copied in. The point of a container is that it carries what it needs; a missing file usually means something was assumed rather than included.",
    options: [
      { label: "The image relies on a file present locally but never copied into it", correct: true },
      { label: "Production runs a different CPU architecture, which always breaks paths" },
      { label: "Containers cannot read files at runtime" },
      { label: "The image was built without a tag" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 2,
    prompt: "What is the difference between a merge and a rebase, in terms of the resulting history?",
    explanation:
      "A merge preserves both histories and adds a commit joining them. A rebase replays your commits on top of the other branch, producing a linear history with new commit hashes. The trade is honesty about what happened versus readability of the log.",
    options: [
      { label: "Merge keeps both histories and joins them; rebase replays commits into a linear history", correct: true },
      { label: "Merge discards the other branch; rebase keeps it" },
      { label: "They produce identical history; only the command differs" },
      { label: "Rebase creates a merge commit; merge does not" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 2,
    prompt: "Why is storing a password's plain text — or even its MD5 — unacceptable?",
    explanation:
      "A breach then hands over every password directly, and MD5 is fast enough to brute-force at billions of guesses per second. Passwords need a slow, salted hash designed for the purpose — bcrypt, scrypt or Argon2 — so that each guess costs the attacker real time.",
    options: [
      { label: "A breach exposes every password; use a slow salted hash like bcrypt or Argon2", correct: true },
      { label: "MD5 is fine as long as the database is encrypted" },
      { label: "Plain text is acceptable if the server is behind a firewall" },
      { label: "SHA-256 is the recommended password hash" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 3,
    prompt: "What does 'eventual consistency' actually promise?",
    explanation:
      "That replicas converge once writes stop — not that a read right after a write sees it. Systems choose this to stay available under partition. The design consequence is that your application must tolerate reading a slightly stale value, which is a product decision as much as a technical one.",
    options: [
      { label: "Replicas converge eventually; a read may still see a stale value", correct: true },
      { label: "Every read sees the latest write, after a short delay" },
      { label: "Writes are never lost under any circumstances" },
      { label: "Consistency is guaranteed within one datacentre" },
    ],
  },
  {
    skillArea: "CS_CORE",
    difficulty: 3,
    prompt: "Why does adding an index to speed up a slow report sometimes make the whole system slower?",
    explanation:
      "Every write must now maintain that index too, so inserts, updates and deletes cost more — and the index competes for memory that was caching something else. On a write-heavy table an index that helps one report can cost more than the report was worth.",
    options: [
      { label: "Every write must maintain it, and it competes for cache memory", correct: true },
      { label: "Indexes lock the table while they exist" },
      { label: "The query planner ignores tables with many indexes" },
      { label: "Indexes must be rebuilt on every read" },
    ],
  },
  // ------------------------------------------------------ PROG (more) ------
  {
    skillArea: "PROG",
    difficulty: 1,
    prompt: "What is the difference between `==` and `is` in Python?",
    explanation:
      "`==` compares values; `is` compares identity — whether they are the same object in memory. Two equal lists are `==` but not `is`. Small integers and short strings are often cached, which makes `is` appear to work and then fail on larger values.",
    options: [
      { label: "`==` compares value; `is` compares object identity", correct: true },
      { label: "They are identical; `is` is just more readable" },
      { label: "`is` compares value; `==` compares type" },
      { label: "`==` works only on numbers" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 1,
    prompt: "Why prefer a list comprehension over building a list with a loop and `.append()`?",
    explanation:
      "It states the intent in one expression and is usually faster, because the loop runs in the interpreter's own code rather than through repeated method calls. The limit is readability: once a comprehension needs two conditions and a nested loop, a plain loop is clearer.",
    options: [
      { label: "It expresses the intent in one place and is usually faster", correct: true },
      { label: "It uses less memory in every case" },
      { label: "Loops cannot build lists" },
      { label: "Comprehensions are evaluated lazily" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 1,
    prompt: "What does it mean that strings are immutable in Python and Java?",
    explanation:
      "Operations that look like edits actually create a new string. Building one by repeated concatenation in a loop is therefore quadratic — each step copies everything so far. Joining a list, or using a string builder, does it in one pass.",
    options: [
      { label: "Every 'edit' creates a new string, so repeated concatenation is expensive", correct: true },
      { label: "Strings cannot be passed to functions" },
      { label: "Strings are stored on the stack, not the heap" },
      { label: "Two identical strings are always the same object" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 2,
    prompt: "What is the difference between a shallow copy and a deep copy of a nested list?",
    explanation:
      "A shallow copy duplicates the outer list but shares the inner ones, so mutating a nested element shows up in both. A deep copy duplicates all the way down. This is behind a lot of 'why did my original change?' bugs.",
    options: [
      { label: "A shallow copy shares the nested objects; a deep copy duplicates them", correct: true },
      { label: "A shallow copy is read-only" },
      { label: "A deep copy is always faster" },
      { label: "There is no difference for lists" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 2,
    prompt: "Why is it usually wrong to compare two floating-point numbers with `==`?",
    explanation:
      "Most decimals cannot be represented exactly in binary, so arithmetic accumulates tiny errors — 0.1 + 0.2 is not 0.3. Compare within a tolerance instead, or use a decimal type when exactness matters, as it does for money.",
    options: [
      { label: "Binary floats cannot represent most decimals exactly, so tiny errors accumulate", correct: true },
      { label: "Floats are compared by reference, not value" },
      { label: "`==` is not defined for floats" },
      { label: "Only very large floats are affected" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 2,
    prompt: "What does a unit test give you that a manual check does not?",
    explanation:
      "It runs again, unattended, every time the code changes. Its real value is not proving the code works today but catching the day someone breaks it — which is why a test that never fails when the behaviour regresses is not doing its job.",
    options: [
      { label: "It re-runs automatically, catching the change that breaks the behaviour later", correct: true },
      { label: "It proves the code is free of bugs" },
      { label: "It makes the code run faster" },
      { label: "It replaces the need for code review" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 3,
    prompt: "You must make a function that reads a file testable without touching the disk. What is the usual approach?",
    explanation:
      "Take the dependency as a parameter rather than reaching for it — pass the file contents, or an object that knows how to read. The function then has nothing to mock. This is dependency injection, and it is why pure logic is easy to test and I/O is not.",
    options: [
      { label: "Pass the data or the reader in, so the function does no I/O itself", correct: true },
      { label: "Wrap every call in a try/except" },
      { label: "Test it only in an integration test" },
      { label: "Make the function a static method" },
    ],
  },
  {
    skillArea: "PROG",
    difficulty: 3,
    prompt: "What is a race condition, and why is it hard to find?",
    explanation:
      "Two threads or processes interleave in an order the author did not anticipate, and the result depends on timing. It is hard to find precisely because it is intermittent — it may never reproduce under a debugger, and it often appears only under production load.",
    options: [
      { label: "The result depends on interleaving, so it reproduces only sometimes", correct: true },
      { label: "It is a compile-time error that some compilers miss" },
      { label: "It only happens on single-core machines" },
      { label: "It is any bug involving a loop" },
    ],
  },

  // --------------------------------------------------- PY_DATA (more) ------
  {
    skillArea: "PY_DATA",
    difficulty: 1,
    prompt: "What does `df.head()` show, and why is it the first thing to run?",
    explanation:
      "The first five rows, including the column names and how values are actually formatted. It catches the mundane problems — a header row read as data, numbers parsed as strings, an unnamed index column — before you build analysis on top of them.",
    options: [
      { label: "The first few rows, which surfaces parsing problems immediately", correct: true },
      { label: "Summary statistics for every column" },
      { label: "The column data types only" },
      { label: "A random sample of rows" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 1,
    prompt: "A numeric column comes back with dtype `object`. What has usually happened?",
    explanation:
      "Something non-numeric is in it — a stray comma, a currency symbol, a blank string, or 'N/A' — so pandas fell back to storing Python objects. `pd.to_numeric(..., errors='coerce')` converts what it can and marks the rest NaN so you can see what was wrong.",
    options: [
      { label: "Some values are not numeric, so the column fell back to objects", correct: true },
      { label: "The column has too many rows to store as numbers" },
      { label: "Object is the normal dtype for integers" },
      { label: "The file was read with the wrong encoding" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 1,
    prompt: "What is the difference between `df.dropna()` and `df.fillna(0)`?",
    explanation:
      "One removes rows with missing values, the other replaces them. Neither is automatically right: dropping can bias your sample if the missingness is not random, and filling with zero silently asserts that missing means zero, which is rarely true for a price or a score.",
    options: [
      { label: "One removes rows with missing data; the other substitutes a value — both change the analysis", correct: true },
      { label: "They are equivalent; fillna is just faster" },
      { label: "dropna removes columns, fillna removes rows" },
      { label: "fillna is always the safer choice" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 2,
    prompt: "Why is iterating a DataFrame row by row with `iterrows()` usually the wrong tool?",
    explanation:
      "It is orders of magnitude slower than a vectorised operation, because each row is materialised as a Series. Most row-by-row logic can be written as a column expression or a `groupby`, which pushes the loop into optimised C code.",
    options: [
      { label: "It is far slower than a vectorised column operation", correct: true },
      { label: "It cannot read string columns" },
      { label: "It modifies the DataFrame in place" },
      { label: "It skips rows containing NaN" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 2,
    prompt: "What does `df.describe()` leave out that you still need to check?",
    explanation:
      "It summarises numeric columns only, and says nothing about categorical values, duplicates, or how much is missing in the columns it skipped. A clean-looking describe() on a frame with a duplicated key is a common way to be confidently wrong.",
    options: [
      { label: "Non-numeric columns, duplicates, and missingness elsewhere", correct: true },
      { label: "The mean and standard deviation" },
      { label: "The number of rows" },
      { label: "Nothing — it covers the whole frame" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 2,
    prompt: "You need the mean score per branch attached to every original row. Which operation does that?",
    explanation:
      "`groupby('branch')['score'].transform('mean')` — transform returns a result aligned to the original index, so it fits straight back as a column. `mean()` alone collapses to one row per group, which is the other question.",
    options: [
      { label: "groupby(...).transform('mean')", correct: true },
      { label: "groupby(...).mean()" },
      { label: "groupby(...).apply(list)" },
      { label: "pivot_table with aggfunc='mean'" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 3,
    prompt: "Why can reading a very large CSV exhaust memory even when the file is smaller than your RAM?",
    explanation:
      "pandas stores strings as Python objects with substantial per-value overhead, and infers types by reading ahead, so an in-memory frame is often several times the file size. Specifying dtypes, using categoricals, or reading in chunks all bring it back down.",
    options: [
      { label: "The in-memory representation is much larger than the file, especially for strings", correct: true },
      { label: "CSV files are compressed on disk" },
      { label: "pandas always loads the file twice" },
      { label: "Memory is reserved per column regardless of size" },
    ],
  },
  {
    skillArea: "PY_DATA",
    difficulty: 3,
    prompt: "A merge on a date column returns almost no matches, though the dates clearly overlap. What should you check first?",
    explanation:
      "That both sides are the same type — one is very often a string and the other a datetime, and they will never compare equal. Time zones and timestamps that carry a time component when you expected a date are the next two culprits.",
    options: [
      { label: "That both columns are the same dtype, not string versus datetime", correct: true },
      { label: "That the DataFrames are sorted" },
      { label: "That the indexes were reset" },
      { label: "That the join is an inner join" },
    ],
  },

  // ----------------------------------------------------- STATS (more) ------
  {
    skillArea: "STATS",
    difficulty: 1,
    prompt: "What does the standard deviation tell you that the mean does not?",
    explanation:
      "How spread out the values are. Two cohorts can share a mean of 60 while one is tightly clustered and the other is half at 30 and half at 90 — which are completely different situations for a teacher, and identical to anyone reading only the mean.",
    options: [
      { label: "How spread out the values are around the mean", correct: true },
      { label: "The most common value" },
      { label: "The middle value" },
      { label: "Whether the data is normally distributed" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 1,
    prompt: "A survey is run only among people who opened a marketing email. What is the main problem?",
    explanation:
      "Selection bias: the people who opened it already differ from those who did not, so the results describe that subgroup rather than the population. No sample size fixes this — a bigger biased sample is just a more confident wrong answer.",
    options: [
      { label: "Selection bias — the sample is not representative, and more responses will not fix it", correct: true },
      { label: "The sample is too small" },
      { label: "Email surveys always have measurement error" },
      { label: "Nothing, provided the response rate is high" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 2,
    prompt: "What does a 95% confidence interval of [42%, 58%] actually mean?",
    explanation:
      "That the method producing it captures the true value 95% of the time across repeated samples. It is not a 95% probability that the true value lies in this particular interval — a subtle distinction, but the reason a wide interval is a statement about your evidence, not about the world.",
    options: [
      { label: "The procedure captures the true value 95% of the time over repeated samples", correct: true },
      { label: "There is a 95% chance the true value is between 42% and 58%" },
      { label: "95% of the data lies between 42% and 58%" },
      { label: "The result is significant at p < 0.05" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 2,
    prompt: "Why does a larger sample produce a narrower confidence interval?",
    explanation:
      "The standard error shrinks with the square root of the sample size, so more data means less uncertainty about the estimate. The square root is the important part: quadrupling the sample only halves the interval, which is why precision gets expensive.",
    options: [
      { label: "The standard error shrinks with the square root of n", correct: true },
      { label: "Larger samples have less variance in the underlying data" },
      { label: "The confidence level rises with n" },
      { label: "Outliers are excluded automatically in large samples" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 2,
    prompt: "You test twenty hypotheses at p < 0.05 and one comes back significant. What should you conclude?",
    explanation:
      "Very little. At a 5% threshold you expect roughly one false positive in twenty tests by chance alone. This is the multiple-comparisons problem; a correction such as Bonferroni, or pre-registering the one hypothesis you care about, is the honest response.",
    options: [
      { label: "Almost nothing — one in twenty is what chance alone produces", correct: true },
      { label: "The effect is real, since it passed the threshold" },
      { label: "The other nineteen hypotheses are false" },
      { label: "The sample was too small for the other tests" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 3,
    prompt: "A test has 80% power. What does that mean, and what happens if power is low?",
    explanation:
      "Power is the chance of detecting a real effect of a given size. At 20% power you miss four real effects in five, so a non-significant result tells you almost nothing — 'we found no effect' and 'we could not have found one' look identical in the output.",
    options: [
      { label: "The chance of detecting a real effect; low power makes a null result uninformative", correct: true },
      { label: "The probability the result is correct" },
      { label: "The proportion of variance explained" },
      { label: "The chance of a false positive" },
    ],
  },
  {
    skillArea: "STATS",
    difficulty: 3,
    prompt: "Simpson's paradox: a treatment looks better in every subgroup but worse overall. How?",
    explanation:
      "The subgroups have very different sizes and baseline rates, and the aggregate is dominated by whichever group the treatment was mostly given to. It is the strongest argument for looking at how a population splits before trusting a single headline number.",
    options: [
      { label: "Unequal group sizes and baselines let the aggregate contradict every subgroup", correct: true },
      { label: "The subgroup results must be a calculation error" },
      { label: "It only occurs with small samples" },
      { label: "The overall figure is always the correct one" },
    ],
  },
  // -------------------------------------------------------- ML (more) ------
  {
    skillArea: "ML",
    difficulty: 1,
    prompt: "What is the difference between supervised and unsupervised learning?",
    explanation:
      "Supervised learning trains on labelled examples — inputs paired with the answer. Unsupervised learning has no labels and looks for structure, such as clusters. The practical consequence is that supervised learning needs someone to have produced the labels, which is usually the expensive part.",
    options: [
      { label: "Supervised learning trains on labelled examples; unsupervised has no labels", correct: true },
      { label: "Supervised learning is always more accurate" },
      { label: "Unsupervised learning needs more data by definition" },
      { label: "Supervised learning cannot be used for classification" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 1,
    prompt: "Why is a separate validation set needed when you already have a test set?",
    explanation:
      "The validation set is what you tune against — choosing hyperparameters, comparing models. Every decision made against the test set leaks it, so a test set used for tuning stops being an honest estimate of unseen performance. It should be looked at once, at the end.",
    options: [
      { label: "Tuning against the test set leaks it, so it stops estimating unseen performance", correct: true },
      { label: "The test set is too small for tuning" },
      { label: "Validation sets are only needed for neural networks" },
      { label: "They are interchangeable names for the same thing" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 2,
    prompt: "What does cross-validation buy you over a single train/test split?",
    explanation:
      "An estimate that does not depend on which rows happened to land in the test set, plus a sense of how much the score varies across splits. That variance is often the more useful output: two models with the same mean score can differ greatly in how reliably they achieve it.",
    options: [
      { label: "An estimate less dependent on one split, plus the variance across splits", correct: true },
      { label: "A model that generalises better by construction" },
      { label: "Faster training" },
      { label: "The ability to skip a test set entirely" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 2,
    prompt: "What is the trade-off between precision and recall?",
    explanation:
      "Precision is how many flagged items were right; recall is how many of the real ones you caught. Loosening the threshold catches more true cases but flags more false ones. Which matters depends on the cost of each error — missing a fraud versus troubling a legitimate customer.",
    options: [
      { label: "Catching more real cases usually means flagging more false ones", correct: true },
      { label: "Improving one always improves the other" },
      { label: "They are two names for accuracy" },
      { label: "Precision matters only for balanced classes" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 2,
    prompt: "Your model performs well in testing but degrades over months in production. What is the likely cause?",
    explanation:
      "Drift: the incoming data no longer resembles what the model was trained on, because the world moved. Nothing about the model changed — the population did. It is why production models need monitoring and periodic retraining rather than one-off validation.",
    options: [
      { label: "Data drift — the live distribution has moved away from the training data", correct: true },
      { label: "The model file has become corrupted" },
      { label: "Overfitting that only appears after deployment" },
      { label: "The test set was too large" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 3,
    prompt: "A hiring model is trained on historical hiring decisions. What is the central risk?",
    explanation:
      "It learns the historical pattern including its biases, and presents them as objective. Removing the protected attribute does not fix it: correlated features — a postcode, a school, a hobby — carry the same signal. This is why measuring outcomes across groups matters more than inspecting inputs.",
    options: [
      { label: "It reproduces historical bias, and proxy features carry it even if you drop the attribute", correct: true },
      { label: "It will underfit, because hiring data is small" },
      { label: "It cannot be evaluated without a test set" },
      { label: "There is no risk if the attribute is excluded" },
    ],
  },
  {
    skillArea: "ML",
    difficulty: 3,
    prompt: "Why is a simpler model often preferred even when a complex one scores slightly higher?",
    explanation:
      "It is easier to explain, debug, monitor and retrain, and it usually degrades more gracefully as data drifts. A two-point gain rarely pays for a model nobody can account for when a decision is challenged — which for hiring or credit is a requirement, not a preference.",
    options: [
      { label: "It is explainable and maintainable, and a small score gain rarely pays for losing that", correct: true },
      { label: "Simpler models always generalise better" },
      { label: "Complex models cannot be deployed" },
      { label: "Simplicity guarantees the model is unbiased" },
    ],
  },

  // ------------------------------------------------------ SYSD (more) ------
  {
    skillArea: "SYSD",
    difficulty: 1,
    prompt: "What does a load balancer do, beyond spreading traffic?",
    explanation:
      "It removes a single instance as a single point of failure: it health-checks the pool and stops sending traffic to an instance that is failing. That is often the more valuable half — you can deploy or lose a machine without an outage.",
    options: [
      { label: "It health-checks instances and routes away from failing ones", correct: true },
      { label: "It caches responses for every client" },
      { label: "It encrypts traffic between services" },
      { label: "It compresses requests to save bandwidth" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 1,
    prompt: "Why is horizontal scaling usually preferred over vertical scaling?",
    explanation:
      "Adding machines has no hard ceiling and gives you redundancy; making one machine bigger eventually runs out of machine and leaves you with a single point of failure. The cost is that your application must actually tolerate running as more than one instance.",
    options: [
      { label: "It has no hard ceiling and provides redundancy", correct: true },
      { label: "It is always cheaper per unit of capacity" },
      { label: "It requires no changes to the application" },
      { label: "Vertical scaling is not possible in the cloud" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 2,
    prompt: "What problem does a read replica solve, and what does it not?",
    explanation:
      "It scales reads by serving them from copies. It does not scale writes — those still go to the primary — and replicas lag, so a read straight after a write may not see it. 'Read your own writes' usually needs routing that user's reads to the primary for a short window.",
    options: [
      { label: "It scales reads, but not writes, and introduces replication lag", correct: true },
      { label: "It scales both reads and writes" },
      { label: "It removes the need for backups" },
      { label: "It guarantees every read sees the latest write" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 2,
    prompt: "What is a circuit breaker in a distributed system, and why use one?",
    explanation:
      "It stops calling a dependency that is already failing, returning an error immediately instead. Without it, every request piles up waiting on the sick service, exhausts your own threads or connections, and the failure spreads upward — one service down becomes everything down.",
    options: [
      { label: "It fails fast on a sick dependency, stopping the failure from spreading upstream", correct: true },
      { label: "It retries a failing call until it succeeds" },
      { label: "It restarts the failing service automatically" },
      { label: "It load balances between healthy replicas" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 2,
    prompt: "Why should a service log a request id that travels with the request across services?",
    explanation:
      "Without it, a single user-visible failure is scattered across the logs of five services with nothing tying the lines together. A correlation id turns 'find the error' from guesswork into a single query, which is most of the value of structured logging.",
    options: [
      { label: "It ties one request's log lines together across every service it touched", correct: true },
      { label: "It reduces the volume of logs" },
      { label: "It is required for logs to be encrypted" },
      { label: "It replaces the need for metrics" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 3,
    prompt: "The CAP theorem says you must give something up during a network partition. What is the real choice?",
    explanation:
      "Between consistency and availability — during a partition you either refuse requests you cannot make consistent, or serve possibly-stale data. Partition tolerance is not optional over a real network. The design question is which failure your product can better live with.",
    options: [
      { label: "Between consistency and availability; partition tolerance is not optional", correct: true },
      { label: "Between consistency and partition tolerance" },
      { label: "Between availability and durability" },
      { label: "Between latency and throughput" },
    ],
  },
  {
    skillArea: "SYSD",
    difficulty: 3,
    prompt: "Why can a system that is fine at 1,000 requests per second collapse suddenly at 1,200 rather than degrading smoothly?",
    explanation:
      "Queues. Below capacity a queue drains; above it, wait times grow without bound and latency rises sharply rather than linearly. Add retries — which multiply load exactly when the system is struggling — and the collapse becomes self-reinforcing.",
    options: [
      { label: "Past capacity, queue wait times grow without bound, and retries amplify the load", correct: true },
      { label: "CPUs throttle above a fixed request rate" },
      { label: "Memory is allocated in fixed blocks" },
      { label: "Load balancers cap connections at round numbers" },
    ],
  },

  // ------------------------------------------------------ APTI (more) ------
  {
    skillArea: "APTI",
    difficulty: 1,
    prompt: "A shirt costs 800 after a 20% discount. What was the original price?",
    explanation:
      "800 is 80% of the original, so the original is 800 / 0.8 = 1,000. The common error is adding 20% to 800, which gives 960 — that would be the answer to a different question, because the percentage is taken from the larger original.",
    options: [
      { label: "1,000", correct: true },
      { label: "960" },
      { label: "1,024" },
      { label: "980" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 1,
    prompt: "A train 200 m long passes a pole in 10 seconds. What is its speed?",
    explanation:
      "Passing a pole means covering its own length, so 200 m in 10 s = 20 m/s, or 72 km/h. The distinction that catches people out is passing a *platform*, where the distance is the train's length plus the platform's.",
    options: [
      { label: "20 m/s", correct: true },
      { label: "10 m/s" },
      { label: "2 m/s" },
      { label: "200 m/s" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 2,
    prompt: "The average of five numbers is 20. One number is removed and the average becomes 18. What was removed?",
    explanation:
      "The total was 5 × 20 = 100; the remaining four total 4 × 18 = 72. The removed number is 28. Converting an average back into a total is the move that makes almost every average problem straightforward.",
    options: [
      { label: "28", correct: true },
      { label: "22" },
      { label: "20" },
      { label: "38" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 2,
    prompt: "In a group of 100 students, 60 study Python, 45 study SQL and 25 study both. How many study neither?",
    explanation:
      "Those studying at least one are 60 + 45 − 25 = 80, so 20 study neither. Subtracting the overlap is the whole trick — adding the two figures directly double-counts the 25 who appear in both.",
    options: [
      { label: "20", correct: true },
      { label: "5" },
      { label: "25" },
      { label: "0" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 2,
    prompt: "A teammate's pull request has a real flaw and they are clearly proud of it. What is the most useful review comment?",
    explanation:
      "Name the specific problem and the case that breaks, without judging the author. 'This drops the last answer when the connection fails — here is the sequence' gives them something to act on. Vague praise helps nobody, and vague criticism invites defensiveness rather than a fix.",
    options: [
      { label: "The specific failure and the case that triggers it, addressed to the code", correct: true },
      { label: "A general note that the approach could be improved" },
      { label: "Approve it and fix the flaw yourself later" },
      { label: "List everything you would have done differently" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 3,
    prompt: "Work A takes 10 days alone, work B takes 15 days alone. Working together, how long?",
    explanation:
      "Add the rates, not the times: 1/10 + 1/15 = 1/6, so 6 days. Averaging the two durations to 12.5 is the standard mistake — it would mean two people together are slower than the faster one alone.",
    options: [
      { label: "6 days", correct: true },
      { label: "12.5 days" },
      { label: "25 days" },
      { label: "5 days" },
    ],
  },
  {
    skillArea: "APTI",
    difficulty: 3,
    prompt: "You realise mid-sprint that a task you estimated at two days will take eight. What do you do first?",
    explanation:
      "Tell whoever is planning around it, immediately, with the revised estimate and why. The cost of a slip is mostly in how late it is discovered by everyone else — a four-fold change found on day one is a re-plan, and the same news on day seven is a crisis.",
    options: [
      { label: "Raise it immediately with the revised estimate and the reason", correct: true },
      { label: "Work extra hours and try to absorb the difference" },
      { label: "Wait until the daily stand-up to see if it improves" },
      { label: "Reduce the scope quietly to fit the original estimate" },
    ],
  },
];
