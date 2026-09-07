#!/usr/bin/env python3
"""Offline item analysis job.

Reads every graded response, runs the analysis in `app.item_analysis`, and
records the result. Runs OUTSIDE the web application, on a schedule or by hand,
because it is a whole-population query that has no business inside a request —
the same shape as `calibrate.py`.

Unlike calibration, this job publishes nothing and changes no score. Its output
is a maintenance report: which items are miskeyed, which separate nobody, which
distractors are dead. Acting on it is a human editorial decision about the
question bank, and deliberately not something a job does on its own.

    python analyse_items.py                  # the whole bank
    python analyse_items.py --track SDE      # one track's items
    python analyse_items.py --json           # machine-readable, writes nothing
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import psycopg
from psycopg.rows import dict_row

from app.item_analysis import MIN_RESPONSES, Response, analyse_bank


def database_url() -> str:
    url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set MIGRATION_DATABASE_URL (or DATABASE_URL) first.")
    return url


def load_responses(conn, track_id: str | None) -> dict[str, list[Response]]:
    """Graded responses, grouped by item.

    The pooling rules — submitted attempts only, integrity-flagged papers
    excluded, rest-of-paper score corrected — live in `app.item_response_pool`
    so they are stated once, next to the policies they have to respect, rather
    than duplicated in whatever calls them.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT * FROM app.item_response_pool(%s)", (track_id,))
        rows = cur.fetchall()

    grouped: dict[str, list[Response]] = {}
    for row in rows:
        if row["rest_percent"] is None:
            continue
        grouped.setdefault(str(row["question_id"]), []).append(
            Response(
                user_id=str(row["user_id"]),
                correct=bool(row["correct"]),
                rest_percent=float(row["rest_percent"]),
                selected_option_id=(
                    str(row["selected_option_id"]) if row["selected_option_id"] else None
                ),
            )
        )
    return grouped


def load_options(conn, question_ids: list[str]) -> dict[str, list[tuple[str, str, bool]]]:
    """Answer options per item, so distractor behaviour can be reported."""
    if not question_ids:
        return {}
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT question_id::text, id::text, label, is_correct
            FROM question_options
            WHERE question_id = ANY(%s::uuid[])
            ORDER BY question_id, display_order
            """,
            (question_ids,),
        )
        rows = cur.fetchall()

    grouped: dict[str, list[tuple[str, str, bool]]] = {}
    for row in rows:
        grouped.setdefault(row["question_id"], []).append(
            (row["id"], row["label"], row["is_correct"])
        )
    return grouped


def record(conn, track_id: str | None, report, response_count: int) -> str:
    """Store the run and every item's statistics."""
    message = (
        f"Analysed {report.analysed} items from {response_count} responses: "
        f"{report.urgent} need urgent attention, {report.review} want a look, "
        f"{report.ok} are behaving. {report.skipped} had fewer than "
        f"{MIN_RESPONSES} responses and were not analysed."
    )

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO item_analysis_runs
              (track_id, analysed_count, skipped_count, urgent_count,
               review_count, ok_count, response_count, min_responses, message)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                track_id,
                report.analysed,
                report.skipped,
                report.urgent,
                report.review,
                report.ok,
                response_count,
                MIN_RESPONSES,
                message,
            ),
        )
        run_id = cur.fetchone()["id"]

        for item in report.items:
            cur.execute(
                """
                INSERT INTO item_statistics
                  (run_id, question_id, responses, facility, discrimination,
                   discrimination_p, verdict, flags, message, distractors)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    run_id,
                    item.question_id,
                    item.responses,
                    item.facility,
                    item.discrimination,
                    item.discrimination_p,
                    item.verdict,
                    item.flags,
                    item.message,
                    json.dumps([d.as_dict() for d in item.distractors]),
                ),
            )
    return str(run_id)


def resolve_track(conn, code: str) -> tuple[str, str]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id::text, code FROM tracks WHERE code = %s", (code,))
        row = cur.fetchone()
    if not row:
        sys.exit(f"No track with code {code!r}.")
    return row["id"], row["code"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyse question bank item quality.")
    parser.add_argument("--track", help="Track code; omit to analyse the whole bank.")
    parser.add_argument(
        "--json", action="store_true", help="Print the report and write nothing."
    )
    args = parser.parse_args()

    with psycopg.connect(database_url()) as conn:
        track_id = None
        if args.track:
            track_id, _ = resolve_track(conn, args.track)

        responses = load_responses(conn, track_id)
        options = load_options(conn, list(responses.keys()))
        report = analyse_bank(responses, options)
        response_count = sum(len(v) for v in responses.values())

        if args.json:
            print(json.dumps(report.as_dict(), indent=2))
            return

        run_id = record(conn, track_id, report, response_count)
        conn.commit()

    print(
        f"run {run_id}: {report.analysed} analysed, {report.skipped} skipped "
        f"(under {MIN_RESPONSES} responses)"
    )
    print(f"  urgent {report.urgent} | review {report.review} | ok {report.ok}")
    for item in report.items:
        if item.verdict in ("urgent", "review"):
            print(f"  [{item.verdict:6}] {item.question_id}  {item.message}")


if __name__ == "__main__":
    main()
