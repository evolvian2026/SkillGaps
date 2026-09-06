#!/usr/bin/env python3
"""Offline calibration job.

Reads diagnostic scores and recorded placement outcomes, runs the analysis in
`app.calibration`, and records the result. Runs OUTSIDE the web application, on
a schedule or by hand, because it is a slow whole-population query that has no
business inside a request.

Publishing a calibrated benchmark set is opt-in (`--publish`) and only ever
happens when the analysis actually produced thresholds. A run that could not
calibrate still writes a `calibration_runs` row: "we looked, and there was not
enough evidence" is exactly the record needed to justify why the live
benchmarks are still marked provisional.

    python calibrate.py --track SDE                 # analyse and report
    python calibrate.py --track SDE --publish       # also publish a new set
    python calibrate.py --all                       # every active track
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import psycopg
from psycopg.rows import dict_row

from app.calibration import Observation, calibrate


def database_url() -> str:
    url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set MIGRATION_DATABASE_URL (or DATABASE_URL) first.")
    return url


def load_observations(conn, track_id: str) -> dict[str, list[Observation]]:
    """Latest submitted attempt per student, paired with their outcome.

    Only students with a *recorded* outcome are included. "Not yet known" is
    not evidence of anything, and treating it as "not placed" would bias every
    threshold downward.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (a.user_id) a.id, a.user_id
              FROM attempts a
              WHERE a.track_id = %s AND a.status = 'submitted'
              ORDER BY a.user_id, a.submitted_at DESC
            )
            SELECT sa.code AS skill_area,
                   l.user_id::text AS user_id,
                   s.percent::float AS percent,
                   (o.status = 'placed') AS placed
            FROM latest l
            JOIN attempt_skill_scores s ON s.attempt_id = l.id
            JOIN skill_areas sa ON sa.id = s.skill_area_id
            JOIN placement_outcomes o ON o.user_id = l.user_id
            WHERE o.status IN ('placed', 'not_placed')
            """,
            (track_id,),
        )
        rows = cur.fetchall()

    grouped: dict[str, list[Observation]] = {}
    for row in rows:
        grouped.setdefault(row["skill_area"], []).append(
            Observation(row["user_id"], row["percent"], row["placed"])
        )
    return grouped


def publish_benchmarks(conn, track_id: str, result, run_id: str) -> str | None:
    """Create a new, calibrated benchmark set and make it active.

    Versioned rather than edited in place, so a report issued last month still
    names the thresholds it was actually scored against. Only areas that
    genuinely calibrated get a new bar; the rest carry forward the previous
    value, which keeps a partially-calibrated set honest instead of leaving
    holes.
    """
    calibrated = {a.skill_area_code: a for a in result.areas if a.threshold is not None}
    if not calibrated:
        return None

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM benchmark_sets WHERE track_id = %s",
            (track_id,),
        )
        version = cur.fetchone()["v"]

        cur.execute(
            """
            INSERT INTO benchmark_sets
              (track_id, version, label, is_provisional, is_active, source_note)
            VALUES (%s, %s, %s, false, false, %s)
            RETURNING id
            """,
            (
                track_id,
                version,
                f"v{version} (calibrated, n={result.sample_size})",
                (
                    f"Calibrated from {result.sample_size} students with recorded "
                    f"outcomes ({result.placed_count} placed) by calibration run {run_id}. "
                    f"Areas without sufficient evidence keep their previous bar."
                ),
            ),
        )
        set_id = cur.fetchone()["id"]

        # Carry forward the current active set, then overwrite what calibrated.
        cur.execute(
            """
            SELECT bt.skill_area_id, bt.hiring_bar_percent, sa.code
            FROM benchmark_thresholds bt
            JOIN benchmark_sets bs ON bs.id = bt.benchmark_set_id
            JOIN skill_areas sa ON sa.id = bt.skill_area_id
            WHERE bs.track_id = %s AND bs.is_active
            """,
            (track_id,),
        )
        for previous in cur.fetchall():
            area = calibrated.get(previous["code"])
            bar = area.threshold if area else previous["hiring_bar_percent"]
            cur.execute(
                """
                INSERT INTO benchmark_thresholds
                  (benchmark_set_id, skill_area_id, hiring_bar_percent)
                VALUES (%s, %s, %s)
                """,
                (set_id, previous["skill_area_id"], bar),
            )

        # Switch over only once the new set is fully populated.
        cur.execute(
            "UPDATE benchmark_sets SET is_active = false WHERE track_id = %s", (track_id,)
        )
        cur.execute(
            "UPDATE benchmark_sets SET is_active = true, effective_from = now() WHERE id = %s",
            (set_id,),
        )
    return set_id


def run_for_track(conn, track_id: str, track_code: str, publish: bool) -> None:
    observations = load_observations(conn, track_id)
    result = calibrate(observations)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO calibration_runs
              (track_id, status, sample_size, placed_count, correlation, result, message)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                track_id,
                result.status,
                result.sample_size,
                result.placed_count,
                result.overall_correlation,
                json.dumps(result.as_dict()),
                result.message,
            ),
        )
        run_id = cur.fetchone()["id"]

    print(f"\n=== {track_code} ===")
    print(f"status:      {result.status}")
    print(f"students:    {result.sample_size} ({result.placed_count} placed)")
    print(f"correlation: {result.overall_correlation}")
    print(f"note:        {result.message}")
    for area in result.areas:
        bar = "—" if area.threshold is None else f"{area.threshold:.0f}%"
        print(f"  {area.skill_area_code:<10} bar {bar:<6} {area.reason}")

    if result.status != "succeeded":
        if publish:
            print("  not publishing: the data did not support a calibrated set.")
        return

    if not publish:
        print("  (re-run with --publish to make these the live benchmarks)")
        return

    set_id = publish_benchmarks(conn, track_id, result, str(run_id))
    if set_id:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE calibration_runs SET benchmark_set_id = %s, finished_at = now() WHERE id = %s",
                (set_id, run_id),
            )
        print(f"  published benchmark set {set_id}; it is now active and NOT provisional.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Recalibrate hiring bars from outcomes.")
    parser.add_argument("--track", help="Track code, e.g. SDE")
    parser.add_argument("--all", action="store_true", help="Every active track")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Publish a calibrated benchmark set when the analysis supports one.",
    )
    args = parser.parse_args()

    if not args.track and not args.all:
        parser.error("Pass --track CODE or --all.")

    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if args.all:
                cur.execute("SELECT id, code FROM tracks WHERE is_active ORDER BY display_order")
            else:
                cur.execute("SELECT id, code FROM tracks WHERE code = %s", (args.track,))
            tracks = cur.fetchall()

        if not tracks:
            sys.exit("No matching track.")

        for track in tracks:
            run_for_track(conn, str(track["id"]), track["code"], args.publish)


if __name__ == "__main__":
    main()
