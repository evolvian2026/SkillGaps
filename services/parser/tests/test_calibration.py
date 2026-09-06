"""Tests for outcome-driven calibration.

The property that matters most here is the refusal: a benchmark presented as
validated when it is not would carry unearned authority into conversations
with students and universities.
"""

import random

from app.calibration import (
    ALPHA,
    MIN_PER_GROUP,
    MIN_SAMPLE,
    Observation,
    calibrate,
    calibrate_area,
    choose_threshold,
    correlation_p_value,
    point_biserial,
)


def make(n_placed, n_unplaced, placed_scores, unplaced_scores, prefix="u"):
    obs = []
    for i in range(n_placed):
        obs.append(Observation(f"{prefix}p{i}", placed_scores(i), True))
    for i in range(n_unplaced):
        obs.append(Observation(f"{prefix}u{i}", unplaced_scores(i), False))
    return obs


class TestPointBiserial:
    def test_positive_when_placed_students_score_higher(self):
        obs = make(20, 20, lambda i: 80 + i % 5, lambda i: 40 + i % 5)
        r = point_biserial([o.percent for o in obs], [o.placed for o in obs])
        assert r is not None and r > 0.8

    def test_negative_when_the_relationship_inverts(self):
        obs = make(20, 20, lambda i: 40 + i % 5, lambda i: 80 + i % 5)
        r = point_biserial([o.percent for o in obs], [o.placed for o in obs])
        assert r is not None and r < -0.8

    def test_near_zero_when_unrelated(self):
        rng = random.Random(7)
        obs = make(40, 40, lambda i: rng.uniform(30, 90), lambda i: rng.uniform(30, 90))
        r = point_biserial([o.percent for o in obs], [o.placed for o in obs])
        assert r is not None and abs(r) < 0.35

    def test_undefined_with_one_empty_group(self):
        assert point_biserial([50, 60, 70], [True, True, True]) is None

    def test_undefined_without_score_variance(self):
        assert point_biserial([50, 50, 50, 50], [True, False, True, False]) is None

    def test_undefined_on_a_tiny_sample(self):
        assert point_biserial([50, 60], [True, False]) is None


class TestPValue:
    def test_strong_correlation_on_a_decent_sample_is_significant(self):
        assert correlation_p_value(0.8, 40) < 0.001

    def test_weak_correlation_is_not(self):
        assert correlation_p_value(0.05, 40) > 0.5

    def test_sits_between_zero_and_one(self):
        for r in (0.0, 0.1, 0.5, 0.9, -0.5):
            p = correlation_p_value(r, 50)
            assert 0.0 <= p <= 1.0


class TestChooseThreshold:
    def test_finds_a_cut_that_separates_the_groups(self):
        obs = make(20, 20, lambda i: 80, lambda i: 40)
        cut, sensitivity, specificity = choose_threshold(obs)
        assert 40 < cut <= 80
        assert sensitivity == 1.0 and specificity == 1.0

    def test_returns_nothing_when_a_group_is_empty(self):
        assert choose_threshold(make(10, 0, lambda i: 70, lambda i: 0))[0] is None

    def test_prefers_the_lower_bar_when_two_separate_equally_well(self):
        # 60 and 70 both separate perfectly; the lower one discourages fewer
        # students, and the cost of a bar set too high falls on them.
        obs = make(10, 10, lambda i: 80, lambda i: 50)
        cut, _, _ = choose_threshold(obs)
        assert cut <= 80


class TestCalibrateAreaRefuses:
    def test_on_too_few_students(self):
        result = calibrate_area("SQL", make(5, 5, lambda i: 80, lambda i: 40))
        assert result.threshold is None
        assert str(MIN_SAMPLE) in result.reason

    def test_on_too_few_placed_students(self):
        obs = make(3, 40, lambda i: 85, lambda i: 40)
        result = calibrate_area("SQL", obs)
        assert result.threshold is None
        assert "placed" in result.reason

    def test_on_too_few_unplaced_students(self):
        obs = make(40, 3, lambda i: 85, lambda i: 40)
        result = calibrate_area("SQL", obs)
        assert result.threshold is None
        assert "unplaced" in result.reason

    def test_when_score_and_outcome_are_unrelated(self):
        rng = random.Random(11)
        obs = make(30, 30, lambda i: rng.uniform(40, 80), lambda i: rng.uniform(40, 80))
        result = calibrate_area("SQL", obs)
        assert result.threshold is None
        assert result.significant is False

    def test_when_the_correlation_is_negative(self):
        # Higher scorers placed less often: a data-quality problem, not a bar
        # to publish upside down.
        obs = make(25, 25, lambda i: 35 + i % 4, lambda i: 85 + i % 4)
        result = calibrate_area("SQL", obs)
        assert result.threshold is None
        assert result.correlation is not None and result.correlation < 0
        assert "negative" in result.reason.lower()


class TestCalibrateAreaSucceeds:
    def test_produces_a_threshold_on_clean_separated_data(self):
        obs = make(25, 25, lambda i: 78 + i % 8, lambda i: 42 + i % 8)
        result = calibrate_area("SQL", obs)

        assert result.threshold is not None
        assert 42 <= result.threshold <= 86
        assert result.significant is True
        assert result.correlation > 0
        assert result.sensitivity is not None and result.specificity is not None

    def test_reports_the_evidence_behind_the_threshold(self):
        obs = make(25, 25, lambda i: 78 + i % 8, lambda i: 42 + i % 8)
        result = calibrate_area("SQL", obs).as_dict()
        for key in ("sampleSize", "placedCount", "correlation", "pValue", "threshold"):
            assert result[key] is not None


class TestCalibrateRun:
    def test_reports_insufficient_data_when_nothing_calibrates(self):
        result = calibrate({"SQL": make(4, 4, lambda i: 80, lambda i: 40)})
        assert result.status == "insufficient_data"
        assert "provisional" in result.message.lower()
        assert all(a.threshold is None for a in result.areas)

    def test_succeeds_when_at_least_one_area_calibrates(self):
        good = make(25, 25, lambda i: 80 + i % 6, lambda i: 40 + i % 6, prefix="g")
        thin = make(3, 3, lambda i: 80, lambda i: 40, prefix="t")
        result = calibrate({"SQL": good, "DSA": thin})

        assert result.status == "succeeded"
        by_area = {a.skill_area_code: a for a in result.areas}
        assert by_area["SQL"].threshold is not None
        # The thin area is still refused, not carried along by the good one.
        assert by_area["DSA"].threshold is None

    def test_counts_distinct_students_not_observations(self):
        # One student appears in two skill areas; the sample is one student.
        obs_a = [Observation("shared", 80, True)]
        obs_b = [Observation("shared", 70, True)]
        result = calibrate({"SQL": obs_a, "DSA": obs_b})
        assert result.sample_size == 1

    def test_handles_an_empty_input(self):
        result = calibrate({})
        assert result.status == "insufficient_data"
        assert result.sample_size == 0


def test_alpha_is_a_conventional_significance_level():
    assert 0 < ALPHA <= 0.05
    assert MIN_PER_GROUP >= 5
