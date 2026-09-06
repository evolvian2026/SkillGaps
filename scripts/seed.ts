import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { Client } from "pg";
import { migrationUrl } from "./_bootstrap";
import { SKILL_AREAS, TRACKS, BENCHMARKS } from "./seed-data/taxonomy";
import { QUESTIONS } from "./seed-data/questions";
import { RESOURCES } from "./seed-data/resources";
import { INTERVIEW_QUESTIONS } from "./seed-data/interview";
import { INDUSTRY_SKILLS } from "./seed-data/industry";

/**
 * Seeds the shared taxonomy, question bank, benchmarks and resources, plus two
 * demo universities with students so that tenant isolation and the cohort
 * dashboard can be exercised immediately.
 *
 * Runs as the owner role (BYPASSRLS) — this is the one place that is allowed
 * to write across tenants.
 */

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const DEMO_PASSWORD = "SkillGaps2026";

const BRANCHES = ["CSE", "IT", "ECE", "AI & DS"];
const SECTIONS = ["A", "B"];
const BATCH_YEARS = [2026, 2027];

const FIRST_NAMES = [
  "Aarav", "Diya", "Rohan", "Ananya", "Kabir", "Ishita", "Vihaan", "Meera",
  "Arjun", "Sanya", "Aditya", "Nisha", "Karan", "Priya", "Rahul", "Tara",
  "Vikram", "Neha", "Siddharth", "Kavya", "Manav", "Riya", "Aryan", "Pooja",
];
const LAST_NAMES = [
  "Sharma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Singh", "Mehta",
  "Desai", "Rao", "Joshi", "Kulkarni",
];

/** Deterministic pseudo-random so re-seeding produces the same demo cohort. */
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

/**
 * Gives roughly 70% of seeded students a completed attempt, with per-student
 * ability drawn from a spread so cohort averages and the "weakest area"
 * ranking have something realistic to show.
 */
async function seedDemoAttempts(client: Client): Promise<number> {
  const { rows: students } = await client.query<{
    id: string;
    tenant_id: string;
  }>("SELECT id, tenant_id FROM users WHERE role = 'student' ORDER BY email");

  const { rows: trackRows } = await client.query<{ id: string; code: string }>(
    "SELECT id, code FROM tracks",
  );
  const { rows: blueprintRows } = await client.query<{
    track_id: string;
    skill_area_id: string;
    question_count: number;
  }>("SELECT track_id, skill_area_id, question_count FROM track_blueprint_items");
  const { rows: barRows } = await client.query<{
    track_id: string;
    skill_area_id: string;
    hiring_bar_percent: string;
    set_id: string;
  }>(`SELECT bs.track_id, bt.skill_area_id, bt.hiring_bar_percent, bs.id AS set_id
      FROM benchmark_thresholds bt
      JOIN benchmark_sets bs ON bs.id = bt.benchmark_set_id
      WHERE bs.is_active`);

  const rng = makeRng(4242);
  let created = 0;

  for (const [index, student] of students.entries()) {
    if (rng() > 0.7) continue; // ~30% of the cohort has not been assessed yet

    const track = trackRows[index % trackRows.length];
    const blueprint = blueprintRows.filter((b) => b.track_id === track.id);
    if (blueprint.length === 0) continue;

    // Each student gets a baseline ability; individual areas vary around it.
    const ability = 0.28 + rng() * 0.55;
    const daysAgo = Math.floor(rng() * 45) + 1;

    const { rows: attemptRows } = await client.query<{ id: string }>(
      `INSERT INTO attempts
         (tenant_id, user_id, track_id, benchmark_set_id, status, started_at,
          submitted_at, expires_at, duration_seconds, integrity_flags)
       VALUES ($1,$2,$3,$4,'submitted',
               now() - ($5 || ' days')::interval,
               now() - ($5 || ' days')::interval + interval '38 minutes',
               now() - ($5 || ' days')::interval + interval '45 minutes',
               2700, $6)
       RETURNING id`,
      [
        student.tenant_id,
        student.id,
        track.id,
        barRows.find((b) => b.track_id === track.id)?.set_id ?? null,
        String(daysAgo),
        // A small slice of attempts carry a review flag, as they would in life.
        rng() < 0.12 ? JSON.stringify({ tab_blur: 1 + Math.floor(rng() * 3) }) : "{}",
      ],
    );
    const attemptId = attemptRows[0].id;

    let totalScore = 0;
    let totalMax = 0;

    for (const item of blueprint) {
      const max = item.question_count;
      const areaAbility = Math.min(
        1,
        Math.max(0, ability + (rng() - 0.5) * 0.4),
      );
      const score = Math.round(areaAbility * max);
      const percent = max === 0 ? 0 : Math.round((score / max) * 10000) / 100;
      totalScore += score;
      totalMax += max;

      const bar = barRows.find(
        (b) => b.track_id === track.id && b.skill_area_id === item.skill_area_id,
      );

      await client.query(
        `INSERT INTO attempt_skill_scores
           (tenant_id, attempt_id, skill_area_id, score, max_score, percent,
            hiring_bar_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          student.tenant_id,
          attemptId,
          item.skill_area_id,
          score,
          max,
          percent,
          bar?.hiring_bar_percent ?? null,
        ],
      );
    }

    await client.query(
      "UPDATE attempts SET total_score = $1, max_score = $2, percent = $3 WHERE id = $4",
      [
        totalScore,
        totalMax,
        totalMax === 0 ? 0 : Math.round((totalScore / totalMax) * 10000) / 100,
        attemptId,
      ],
    );
    created++;
  }

  return created;
}

async function main() {
  const client = new Client({ connectionString: migrationUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Wipe everything the seed owns so re-running is idempotent.
    await client.query(
      "TRUNCATE tenants, skill_areas, tracks, questions, interview_questions, " +
        "industry_skill_references RESTART IDENTITY CASCADE",
    );

    // ---------------------------------------------------------- taxonomy --
    const skillAreaIds = new Map<string, string>();
    for (const area of SKILL_AREAS) {
      const id = randomUUID();
      skillAreaIds.set(area.code, id);
      await client.query(
        `INSERT INTO skill_areas (id, code, name, description, display_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, area.code, area.name, area.description, area.displayOrder],
      );
    }

    const trackIds = new Map<string, string>();
    for (const track of TRACKS) {
      const id = randomUUID();
      trackIds.set(track.code, id);
      await client.query(
        `INSERT INTO tracks (id, code, name, description, duration_seconds, display_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, track.code, track.name, track.description, track.durationSeconds, track.displayOrder],
      );
      for (const [index, item] of track.blueprint.entries()) {
        await client.query(
          `INSERT INTO track_blueprint_items
             (track_id, skill_area_id, question_count, weight, display_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, skillAreaIds.get(item.skillArea), item.questionCount, item.weight, index * 10],
        );
      }
    }

    // ----------------------------------------------------- question bank --
    for (const question of QUESTIONS) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO questions
           (id, skill_area_id, type, prompt, difficulty, points, language_id,
            starter_code, explanation, accepted_answers)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          skillAreaIds.get(question.skillArea),
          question.type,
          question.prompt,
          question.difficulty,
          question.points ?? 1,
          question.languageId ?? null,
          question.starterCode ?? null,
          question.explanation ?? null,
          question.acceptedAnswers ?? null,
        ],
      );

      for (const trackCode of question.tracks) {
        await client.query(
          "INSERT INTO question_tracks (question_id, track_id) VALUES ($1,$2)",
          [id, trackIds.get(trackCode)],
        );
      }

      for (const [index, option] of (question.options ?? []).entries()) {
        await client.query(
          `INSERT INTO question_options (question_id, label, is_correct, display_order)
           VALUES ($1,$2,$3,$4)`,
          [id, option.label, option.correct ?? false, index * 10],
        );
      }

      for (const [index, testCase] of (question.testCases ?? []).entries()) {
        await client.query(
          `INSERT INTO question_test_cases
             (question_id, stdin, expected_stdout, is_hidden, display_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, testCase.stdin, testCase.expectedStdout, testCase.isHidden ?? true, index * 10],
        );
      }
    }

    // -------------------------------------------------------- benchmarks --
    for (const [trackCode, thresholds] of Object.entries(BENCHMARKS)) {
      const setId = randomUUID();
      await client.query(
        `INSERT INTO benchmark_sets
           (id, track_id, version, label, is_provisional, is_active, source_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          setId,
          trackIds.get(trackCode),
          1,
          "v1 (provisional, pre-calibration)",
          true,
          true,
          "Working estimates set by the platform team. Not derived from placement outcome data. Replace via Phase 3 calibration.",
        ],
      );
      for (const [areaCode, bar] of Object.entries(thresholds)) {
        await client.query(
          `INSERT INTO benchmark_thresholds
             (benchmark_set_id, skill_area_id, hiring_bar_percent)
           VALUES ($1,$2,$3)`,
          [setId, skillAreaIds.get(areaCode), bar],
        );
      }
    }

    // --------------------------------------------------------- resources --
    for (const [areaCode, items] of Object.entries(RESOURCES)) {
      for (const [index, item] of items.entries()) {
        await client.query(
          `INSERT INTO resources
             (skill_area_id, title, url, provider, kind, estimated_hours, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            skillAreaIds.get(areaCode),
            item.title,
            item.url,
            item.provider,
            item.kind,
            item.hours ?? null,
            index * 10,
          ],
        );
      }
    }

    // ------------------------------------------ interview question bank --
    for (const question of INTERVIEW_QUESTIONS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO interview_questions
           (kind, prompt, skill_area_id, difficulty, rubric_criteria, guidance,
            suggested_time_seconds)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          question.kind,
          question.prompt,
          question.skillArea ? skillAreaIds.get(question.skillArea) : null,
          question.difficulty,
          JSON.stringify(question.criteria ?? []),
          question.guidance,
          question.suggestedTimeSeconds ?? 240,
        ],
      );
      for (const trackCode of question.tracks) {
        await client.query(
          "INSERT INTO interview_question_tracks (question_id, track_id) VALUES ($1,$2)",
          [rows[0].id, trackIds.get(trackCode)],
        );
      }
    }

    // ------------------------------------------- industry reference list --
    for (const skill of INDUSTRY_SKILLS) {
      await client.query(
        `INSERT INTO industry_skill_references
           (skill_area_id, topic, aliases, demand_weight, source)
         VALUES ($1,$2,$3,$4,'curated')`,
        [
          skillAreaIds.get(skill.skillArea),
          skill.topic,
          skill.aliases ?? [],
          skill.demandWeight,
        ],
      );
    }

    // ------------------------------------------------------- demo tenants --
    const passwordHash = hashPassword(DEMO_PASSWORD);
    const demoTenants = [
      {
        name: "Sunrise Institute of Technology",
        slug: "sunrise",
        domains: ["sunrise.edu.in"],
        invite: "SUNRISE26",
        studentCount: 24,
      },
      {
        name: "Meridian College of Engineering",
        slug: "meridian",
        domains: ["meridian.ac.in"],
        invite: "MERIDIAN26",
        studentCount: 16,
      },
    ];

    for (const [tenantIndex, tenant] of demoTenants.entries()) {
      const tenantId = randomUUID();
      await client.query(
        `INSERT INTO tenants (id, name, slug, email_domains, invite_code)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, tenant.name, tenant.slug, tenant.domains, tenant.invite],
      );

      await client.query(
        `INSERT INTO users (tenant_id, email, full_name, role, password_hash)
         VALUES ($1,$2,$3,'admin',$4)`,
        [tenantId, `tpo@${tenant.domains[0]}`, `TPO — ${tenant.name}`, passwordHash],
      );

      const rng = makeRng(1000 + tenantIndex * 97);
      for (let i = 0; i < tenant.studentCount; i++) {
        const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
        const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
        const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@${tenant.domains[0]}`;
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, full_name, role, password_hash)
           VALUES ($1,$2,$3,'student',$4) RETURNING id`,
          [tenantId, email, `${first} ${last}`, passwordHash],
        );
        await client.query(
          `INSERT INTO student_profiles
             (user_id, tenant_id, roll_number, branch, section, batch_year)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            rows[0].id,
            tenantId,
            `${tenant.slug.toUpperCase()}${2026 - tenantIndex}${String(i + 1).padStart(3, "0")}`,
            BRANCHES[Math.floor(rng() * BRANCHES.length)],
            SECTIONS[Math.floor(rng() * SECTIONS.length)],
            BATCH_YEARS[Math.floor(rng() * BATCH_YEARS.length)],
          ],
        );

        await client.query(
          `INSERT INTO consent_records
             (tenant_id, user_id, policy_key, policy_version, granted, notice_text)
           VALUES ($1,$2,'assessment_data_v1','2026-09-01',true,$3)`,
          [tenantId, rows[0].id, "Seeded demo consent record."],
        );
      }
    }

    // ------------------------------------------------- demo attempt data --
    // Without completed attempts the institution dashboard demos as an empty
    // state, which tells a TPO nothing. These are clearly synthetic and are
    // scored directly rather than by replaying the grading pipeline.
    const attemptCount = await seedDemoAttempts(client);

    await client.query("COMMIT");

    console.log("seed complete");
    console.log(`  skill areas: ${SKILL_AREAS.length}`);
    console.log(`  tracks: ${TRACKS.length}`);
    console.log(`  questions: ${QUESTIONS.length}`);
    console.log(`  tenants: ${demoTenants.length}`);
    console.log(`  interview questions: ${INTERVIEW_QUESTIONS.length}`);
    console.log(`  industry reference topics: ${INDUSTRY_SKILLS.length}`);
    console.log(`  demo attempts: ${attemptCount}`);
    console.log("");
    console.log("Demo logins (all use the same password):");
    console.log(`  password: ${DEMO_PASSWORD}`);
    console.log("  TPO:     tpo@sunrise.edu.in / tpo@meridian.ac.in");
    console.log("  Student: any seeded student address, e.g. run");
    console.log("           psql -c \"SELECT email FROM users WHERE role='student' LIMIT 3\"");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
