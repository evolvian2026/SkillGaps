"""Item analysis.

The cases that matter are the failures: an item the analysis should refuse to
score, and an item it must call broken rather than merely weak.
"""

import pytest

from app.item_analysis import (
    CONFIDENT_RESPONSES,
    MIN_RESPONSES,
    Response,
    analyse_bank,
    analyse_item,
)


def responses(pattern: list[bool], scores: list[float] | None = None) -> list[Response]:
    """One response per entry; rest-of-paper score defaults to a clean gradient."""
    n = len(pattern)
    scores = scores or [i * (100 / max(n - 1, 1)) for i in range(n)]
    return [
        Response(f"u{i}", correct=c, rest_percent=s)
        for i, (c, s) in enumerate(zip(pattern, scores))
    ]


def discriminating(n: int = 120, cut: float = 50.0) -> list[Response]:
    """A well-behaved item: students above the cut get it right."""
    return [
        Response(f"u{i}", correct=(i * 100 / n) >= cut, rest_percent=i * 100 / n)
        for i in range(n)
    ]


class TestRefusal:
    def test_refuses_below_the_minimum_sample(self):
        stat = analyse_item("q", discriminating(MIN_RESPONSES - 1))
        assert stat.verdict == "not_analysed"
        assert stat.discrimination is None
        assert "insufficient_data" in stat.flags
        assert str(MIN_RESPONSES) in stat.message

    def test_analyses_at_exactly_the_minimum(self):
        stat = analyse_item("q", discriminating(MIN_RESPONSES))
        assert stat.verdict != "not_analysed"
        assert stat.discrimination is not None

    def test_marks_a_thin_sample_as_provisional(self):
        stat = analyse_item("q", discriminating(MIN_RESPONSES + 5))
        assert "thin_sample" in stat.flags
        assert "provisional" in stat.message

    def test_does_not_caveat_a_large_sample(self):
        stat = analyse_item("q", discriminating(CONFIDENT_RESPONSES + 20))
        assert "thin_sample" not in stat.flags
        assert "provisional" not in stat.message


class TestFacility:
    def test_reports_an_item_everyone_gets_right(self):
        stat = analyse_item("q", responses([True] * 60))
        assert stat.facility == 1.0
        # Discrimination is undefined here, not zero: nothing varies.
        assert stat.discrimination is None
        assert "too_easy" in stat.flags
        assert "separates nobody" in stat.message

    def test_reports_an_item_nobody_gets_right(self):
        stat = analyse_item("q", responses([False] * 60))
        assert stat.facility == 0.0
        assert stat.discrimination is None
        assert "answer key" in stat.message

    def test_flags_a_near_universal_item_as_too_easy(self):
        # The two who miss it are the weakest students, which is what a merely
        # easy item looks like — the ordering matters, or this is a miskey.
        stat = analyse_item("q", responses([False] * 2 + [True] * 58))
        assert "too_easy" in stat.flags
        assert "negative_discrimination" not in stat.flags
        assert stat.verdict == "review"

    def test_flags_an_item_at_the_guess_rate_as_too_hard(self):
        # Only the strongest fifth get it: hard, but working correctly.
        stat = analyse_item("q", responses([False] * 48 + [True] * 12))
        assert "too_hard" in stat.flags
        assert "answerable as written" in stat.message


class TestDiscrimination:
    def test_a_good_item_passes_cleanly(self):
        stat = analyse_item("q", discriminating(120))
        assert stat.verdict == "ok"
        assert stat.discrimination > 0.3
        assert stat.flags == []

    def test_a_miskeyed_item_is_urgent_not_merely_weak(self):
        # The strongest students get it wrong: the signature of a wrong key.
        rs = [
            Response(f"u{i}", correct=(i * 100 / 120) < 50, rest_percent=i * 100 / 120)
            for i in range(120)
        ]
        stat = analyse_item("q", rs)
        assert stat.discrimination < 0
        assert "negative_discrimination" in stat.flags
        assert stat.verdict == "urgent"
        assert "miskeyed" in stat.message

    def test_a_coin_flip_item_is_flagged_as_not_discriminating(self):
        # Correctness alternates independently of ability.
        rs = [
            Response(f"u{i}", correct=(i % 2 == 0), rest_percent=i * 100 / 120)
            for i in range(120)
        ]
        stat = analyse_item("q", rs)
        assert abs(stat.discrimination) < 0.1
        assert "not_discriminating" in stat.flags
        assert stat.verdict == "review"

    def test_a_faintly_negative_coefficient_is_noise_not_a_miskey(self):
        # -0.03 is not evidence of anything. Calling it urgent would bury the
        # handful of items that genuinely are miskeyed.
        rs = [
            Response(f"u{i}", correct=(i % 2 == 0), rest_percent=i * 100 / 120)
            for i in range(120)
        ]
        stat = analyse_item("q", rs)
        assert stat.discrimination < 0
        assert "negative_discrimination" not in stat.flags
        assert stat.verdict != "urgent"

    def test_discrimination_uses_the_rest_of_the_paper_not_the_total(self):
        # Documents the contract the caller must honour: rest_percent excludes
        # this item, so a perfect item cannot correlate with itself.
        stat = analyse_item("q", discriminating(120))
        assert stat.discrimination <= 1.0

    def test_carries_a_p_value_for_the_correlation(self):
        stat = analyse_item("q", discriminating(120))
        assert stat.discrimination_p is not None
        assert stat.discrimination_p < 0.05


class TestDistractors:
    def _mcq(self, picks: list[str], scores: list[float]) -> list[Response]:
        return [
            Response(f"u{i}", correct=(p == "A"), rest_percent=s, selected_option_id=p)
            for i, (p, s) in enumerate(zip(picks, scores))
        ]

    OPTIONS = [
        ("A", "Correct answer", True),
        ("B", "Plausible wrong", False),
        ("C", "Never chosen", False),
    ]

    def test_reports_selection_share_per_option(self):
        picks = ["A"] * 30 + ["B"] * 20 + ["C"] * 10
        scores = [40.0 + i for i in range(60)]
        stat = analyse_item("q", self._mcq(picks, scores), self.OPTIONS)
        shares = {d.option_id: d.share for d in stat.distractors}
        assert shares["A"] == pytest.approx(0.5)
        assert shares["B"] == pytest.approx(1 / 3)

    def test_a_flat_cohort_reports_that_discrimination_was_not_measurable(self):
        # Everyone scored the same on the rest of the paper, so there is
        # nothing to correlate against. Not "ok", and not a fault in the item.
        picks = ["A"] * 30 + ["B"] * 30
        stat = analyse_item("q", self._mcq(picks, [50.0] * 60), self.OPTIONS)
        assert stat.discrimination is None
        assert "no_variance" in stat.flags
        assert stat.verdict == "review"
        assert "could not be measured" in stat.message

    def test_flags_a_distractor_nobody_picks(self):
        picks = ["A"] * 40 + ["B"] * 19 + ["C"] * 1
        scores = [40.0 + i for i in range(60)]
        stat = analyse_item("q", self._mcq(picks, scores), self.OPTIONS)
        dead = next(d for d in stat.distractors if d.option_id == "C")
        assert "dead_distractor" in dead.flags
        assert "dead_distractor" in stat.flags

    def test_never_flags_the_key_as_a_dead_distractor(self):
        # A hard item has a rarely-chosen key. That is difficulty, not a fault
        # in an option.
        picks = ["A"] * 2 + ["B"] * 58
        scores = [40.0 + i for i in range(60)]
        stat = analyse_item("q", self._mcq(picks, scores), self.OPTIONS)
        key = next(d for d in stat.distractors if d.option_id == "A")
        assert key.flags == []

    def test_flags_a_distractor_that_outscores_the_key(self):
        # The strong students pick B; the weak ones pick the key. Either the
        # key is wrong or both options are defensible.
        picks = ["A"] * 30 + ["B"] * 30
        scores = [20.0] * 30 + [90.0] * 30
        stat = analyse_item("q", self._mcq(picks, scores), self.OPTIONS)
        attractive = next(d for d in stat.distractors if d.option_id == "B")
        assert "attractive_distractor" in attractive.flags
        assert stat.verdict == "urgent"

    def test_records_the_calibre_of_who_chose_each_option(self):
        picks = ["A"] * 30 + ["B"] * 30
        scores = [80.0] * 30 + [30.0] * 30
        stat = analyse_item("q", self._mcq(picks, scores), self.OPTIONS)
        by_id = {d.option_id: d for d in stat.distractors}
        assert by_id["A"].mean_rest_percent == pytest.approx(80.0)
        assert by_id["B"].mean_rest_percent == pytest.approx(30.0)
        assert by_id["C"].mean_rest_percent is None

    def test_handles_an_item_with_no_options_at_all(self):
        # Short-answer and code questions have no distractors to analyse.
        stat = analyse_item("q", discriminating(120), [])
        assert stat.distractors == []
        assert stat.verdict == "ok"


class TestBankReport:
    def test_counts_each_verdict(self):
        miskeyed = [
            Response(f"u{i}", correct=(i * 100 / 120) < 50, rest_percent=i * 100 / 120)
            for i in range(120)
        ]
        report = analyse_bank(
            {
                "good": discriminating(120),
                "broken": miskeyed,
                "easy": responses([True] * 60),
                "tiny": discriminating(5),
            }
        )
        assert report.urgent == 1
        assert report.ok == 1
        assert report.skipped == 1
        assert report.analysed == 3

    def test_orders_the_worst_items_first(self):
        miskeyed = [
            Response(f"u{i}", correct=(i * 100 / 120) < 50, rest_percent=i * 100 / 120)
            for i in range(120)
        ]
        report = analyse_bank({"good": discriminating(120), "broken": miskeyed})
        # The short list at the top is the point of the report.
        assert report.items[0].question_id == "broken"

    def test_an_empty_bank_is_an_empty_report_not_an_error(self):
        report = analyse_bank({})
        assert report.analysed == 0
        assert report.items == []
