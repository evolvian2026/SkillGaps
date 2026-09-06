/**
 * Mock interview question bank.
 *
 * Behavioural questions apply to every track; technical ones are tied to the
 * same `skill_areas` the diagnostic uses, so interview and diagnostic
 * performance sit on one axis rather than two.
 */

export interface SeedInterviewQuestion {
  kind: "behavioral" | "technical" | "situational";
  prompt: string;
  skillArea?: string;
  tracks: string[];
  difficulty: 1 | 2 | 3;
  guidance: string;
  criteria?: { key: string; label: string; description: string; weight: number }[];
  suggestedTimeSeconds?: number;
}

/** Applied when a question does not define its own. */
const STAR = [
  {
    key: "structure",
    label: "Structure",
    description:
      "The answer follows a clear arc — situation, what they did, and the outcome — rather than wandering.",
    weight: 1.5,
  },
  {
    key: "specificity",
    label: "Specificity",
    description:
      "Concrete details: named technologies, numbers, and the candidate's own actions rather than generalities.",
    weight: 1.5,
  },
  {
    key: "clarity",
    label: "Clarity",
    description:
      "Plain, direct language an interviewer could follow, without filler.",
    weight: 1,
  },
  {
    key: "relevance",
    label: "Relevance",
    description: "The answer addresses what was actually asked.",
    weight: 1,
  },
];

const TECHNICAL = [
  {
    key: "correctness",
    label: "Technical correctness",
    description:
      "The explanation is accurate and does not contain misconceptions.",
    weight: 2,
  },
  {
    key: "depth",
    label: "Depth",
    description:
      "Goes past the textbook definition into trade-offs and when it applies.",
    weight: 1.5,
  },
  {
    key: "clarity",
    label: "Clarity",
    description:
      "Explains it in a way a colleague could follow, using an example where it helps.",
    weight: 1.5,
  },
  {
    key: "relevance",
    label: "Relevance",
    description: "The answer addresses what was actually asked.",
    weight: 1,
  },
];

const ALL = ["SDE", "DA", "MLE"];

export const INTERVIEW_QUESTIONS: SeedInterviewQuestion[] = [
  // ---------------------------------------------------------- behavioural --
  {
    kind: "behavioral",
    prompt:
      "Tell me about a technical project you are proud of. What was your specific contribution, and what would you do differently now?",
    tracks: ALL,
    difficulty: 1,
    criteria: STAR,
    guidance:
      "Interviewers are listening for what YOU did, not what the team did. Name your part explicitly, give one number that shows scale or impact, and end with a concrete lesson — the 'what I'd change' half is where most candidates stop too early.",
  },
  {
    kind: "behavioral",
    prompt:
      "Describe a time you were stuck on a bug for more than a day. How did you eventually work it out?",
    tracks: ALL,
    difficulty: 2,
    criteria: STAR,
    guidance:
      "This is a question about method, not about the bug. Show how you narrowed the search — reproducing it, forming a hypothesis, testing it. 'I googled it and found the answer' is a weaker answer than a systematic one, even if that is what happened.",
  },
  {
    kind: "behavioral",
    prompt:
      "Tell me about a disagreement you had with a teammate on a technical decision. How was it resolved?",
    tracks: ALL,
    difficulty: 2,
    criteria: STAR,
    guidance:
      "Avoid making the other person the villain. Strong answers show you understood their reasoning, made your own case with evidence, and were willing to be wrong. What the decision was matters far less than how you reached it.",
  },
  {
    kind: "behavioral",
    prompt:
      "Give an example of a deadline you had to meet with limited time. What did you cut, and why?",
    tracks: ALL,
    difficulty: 2,
    criteria: STAR,
    guidance:
      "The interesting part is the trade-off. Name what you deliberately dropped and the reasoning — that shows prioritisation. 'I worked all night and finished everything' answers the wrong question.",
  },
  {
    kind: "behavioral",
    prompt:
      "Describe something technical you taught yourself outside your coursework. How did you go about it?",
    tracks: ALL,
    difficulty: 1,
    criteria: STAR,
    guidance:
      "Companies hire for the ability to learn. Name the resource, what you built with it, and how you knew you had actually learned it. A finished project beats a finished course.",
  },
  {
    kind: "behavioral",
    prompt: "Why this role, and why our company specifically?",
    tracks: ALL,
    difficulty: 1,
    criteria: STAR,
    guidance:
      "Generic enthusiasm reads as no preparation. Connect one concrete thing about the company or product to something you have actually done or want to do.",
  },

  // ------------------------------------------------------------ technical --
  {
    kind: "technical",
    prompt:
      "Explain the difference between an array and a linked list. When would you choose one over the other in real code?",
    skillArea: "DSA",
    tracks: ["SDE", "MLE"],
    difficulty: 1,
    criteria: TECHNICAL,
    guidance:
      "Cover contiguous vs. pointer-based memory, O(1) indexing vs. O(1) insertion at a known node, and cache locality. The 'when' half is what separates a memorised answer from an understood one.",
  },
  {
    kind: "technical",
    prompt:
      "A page on your web app has become slow. Walk me through how you would find out why.",
    skillArea: "SYSD",
    tracks: ["SDE"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "Interviewers want a method: measure before guessing. Narrow down the layer — network, server, database — then profile within it. Naming a specific tool at each step makes the answer concrete.",
  },
  {
    kind: "technical",
    prompt:
      "What is a database index, and what does it cost you? Give an example of when adding one would be a mistake.",
    skillArea: "SQL",
    tracks: ["SDE", "DA", "MLE"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "Faster reads, slower writes, extra storage. The mistake case — a heavily-written table, or a low-cardinality column like a boolean — is what shows you have used indexes rather than only read about them.",
  },
  {
    kind: "technical",
    prompt:
      "Explain overfitting to someone who has never trained a model. How would you detect it, and what would you do about it?",
    skillArea: "ML",
    tracks: ["MLE", "DA"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "An analogy helps, but follow it with the mechanics: a train/validation gap as the detector, then regularisation, more data, or a simpler model as the fixes. Naming cross-validation shows practice, not theory.",
  },
  {
    kind: "technical",
    prompt:
      "You have a table of orders and a table of customers. How would you find customers who have never placed an order, and why does your approach work?",
    skillArea: "SQL",
    tracks: ["DA", "SDE"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "A LEFT JOIN with a NULL check, or NOT EXISTS. Explain why an INNER JOIN cannot answer this — that reasoning is the point of the question.",
  },
  {
    kind: "technical",
    prompt:
      "Your model scores 94% accuracy on a dataset where 94% of examples are one class. What do you tell your manager?",
    skillArea: "ML",
    tracks: ["MLE", "DA"],
    difficulty: 3,
    criteria: TECHNICAL,
    guidance:
      "The model may have learned nothing — predicting the majority class scores exactly that. Name precision, recall, and PR-AUC as the metrics that would actually reveal it, and say what business cost a false negative carries.",
  },
  {
    kind: "technical",
    prompt:
      "What happens, step by step, between typing a URL and the page appearing?",
    skillArea: "CS_CORE",
    tracks: ["SDE"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "A breadth question. DNS, TCP handshake, TLS, the HTTP request, the server's response, then parsing and rendering. Depth on one or two steps beats a shallow list of all of them.",
  },
  {
    kind: "technical",
    prompt:
      "Describe how you would clean a dataset that has missing values, duplicates, and inconsistent date formats.",
    skillArea: "PY_DATA",
    tracks: ["DA", "MLE"],
    difficulty: 2,
    criteria: TECHNICAL,
    guidance:
      "Investigate before you impute — why is it missing? Mention that dropping rows can bias a dataset, and that duplicates need a definition of 'same' before you can remove them.",
  },

  // ----------------------------------------------------------- situational --
  {
    kind: "situational",
    prompt:
      "You are two days from a demo and find a bug that will take a week to fix properly, or an hour to patch around. What do you do?",
    tracks: ALL,
    difficulty: 2,
    criteria: STAR,
    guidance:
      "There is no single right answer — the reasoning is what is assessed. Strong answers weigh the blast radius, say who else needs to know, and commit to fixing it properly afterwards rather than leaving it.",
  },
  {
    kind: "situational",
    prompt:
      "You are assigned to a codebase in a language you have never used, with no documentation. How do you get productive?",
    tracks: ALL,
    difficulty: 2,
    criteria: STAR,
    guidance:
      "Name a concrete first move: get it running, read the tests, trace one request end to end, make a tiny change. Vague 'I'd read the code and ask questions' answers are the most common and the least convincing.",
  },
];
