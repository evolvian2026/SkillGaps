/**
 * Deterministic PRNG (mulberry32) seeded per attempt.
 *
 * Selection and ordering are randomised, but reproducible from the attempt id,
 * so a support query can reconstruct exactly which paper a student saw without
 * storing the shuffle itself.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw `count` questions from one skill area's pool, spreading difficulty
 * rather than taking a random slice — otherwise an attempt can come out all
 * easy or all hard and the skill-area score stops being comparable between
 * students, which is the whole point of a cohort dashboard.
 */
export function drawSpreadByDifficulty<T extends { difficulty: number }>(
  pool: readonly T[],
  count: number,
  rand: () => number,
): T[] {
  if (pool.length <= count) return shuffle(pool, rand);

  const byDifficulty = new Map<number, T[]>();
  for (const q of pool) {
    const bucket = byDifficulty.get(q.difficulty) ?? [];
    bucket.push(q);
    byDifficulty.set(q.difficulty, bucket);
  }
  for (const [k, v] of byDifficulty) byDifficulty.set(k, shuffle(v, rand));

  const levels = [...byDifficulty.keys()].sort((a, b) => a - b);
  const picked: T[] = [];

  // Round-robin across difficulty levels until the quota is filled.
  while (picked.length < count) {
    let tookAny = false;
    for (const level of levels) {
      if (picked.length >= count) break;
      const bucket = byDifficulty.get(level)!;
      const next = bucket.pop();
      if (next) {
        picked.push(next);
        tookAny = true;
      }
    }
    if (!tookAny) break;
  }

  return shuffle(picked, rand);
}
