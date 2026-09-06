"""Outcome-driven calibration.

Correlates diagnostic scores against real placement outcomes to recalibrate the
"hiring bar" per skill area.

This module is deliberately conservative. The whole value of a calibrated
benchmark is that it is *earned* by data, so every function here is built to
refuse rather than to guess: too few students, too few placements, or a
correlation indistinguishable from noise all produce `insufficient_data`, not a
number. A fabricated benchmark presented as validated would be worse than the
provisional one it replaced, because it would carry unearned authority into
conversations with students and universities.

Pure functions, no database access — the CLI in `calibrate.py` supplies data
and persists results.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import mean, pstdev

#: Minimum students with BOTH a score and a recorded outcome.
MIN_SAMPLE = 30
#: Minimum in each outcome group. A 100-student sample with two placements
#: tells you almost nothing about where the bar sits.
MIN_PER_GROUP = 8
#: Two-sided significance level for the correlation.
ALPHA = 0.05


@dataclass
class Observation:
    """One student's score in one skill area, and whether they were placed."""

    user_id: str
    percent: float
    placed: bool


@dataclass
class AreaCalibration:
    skill_area_code: str
    sample_size: int
    placed_count: int
    correlation: float | None
    p_value: float | None
    #: Recommended bar, or None when the data did not support one.
    threshold: float | None
    #: Share of placed students at or above the threshold.
    sensitivity: float | None
    #: Share of unplaced students below it.
    specificity: float | None
    significant: bool
    reason: str

    def as_dict(self) -> dict:
        return {
            "skillArea": self.skill_area_code,
            "sampleSize": self.sample_size,
            "placedCount": self.placed_count,
            "correlation": self.correlation,
            "pValue": self.p_value,
            "threshold": self.threshold,
            "sensitivity": self.sensitivity,
            "specificity": self.specificity,
            "significant": self.significant,
            "reason": self.reason,
        }


@dataclass
class CalibrationResult:
    status: str  # "succeeded" | "insufficient_data"
    sample_size: int
    placed_count: int
    overall_correlation: float | None
    areas: list[AreaCalibration] = field(default_factory=list)
    message: str = ""

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "sampleSize": self.sample_size,
            "placedCount": self.placed_count,
            "overallCorrelation": self.overall_correlation,
            "areas": [a.as_dict() for a in self.areas],
            "message": self.message,
        }


def point_biserial(scores: list[float], placed: list[bool]) -> float | None:
    """Correlation between a continuous score and a binary outcome.

    Returns None when it is undefined — one group empty, or no variance in the
    scores. Those are real conditions in small cohorts, not errors, and they
    must not be papered over with a zero.
    """
    if len(scores) != len(placed) or len(scores) < 3:
        return None

    yes = [s for s, p in zip(scores, placed) if p]
    no = [s for s, p in zip(scores, placed) if not p]
    if not yes or not no:
        return None

    sd = pstdev(scores)
    if sd == 0:
        return None

    n = len(scores)
    n1, n0 = len(yes), len(no)
    return ((mean(yes) - mean(no)) / sd) * math.sqrt((n1 * n0) / (n * n))


def _t_distribution_sf(t: float, df: int) -> float:
    """Two-sided survival function for Student's t, via the incomplete beta.

    Implemented here rather than pulling in SciPy: this service otherwise needs
    no numerical stack, and a single well-tested function is a smaller cost to
    carry than a large dependency in a container that also parses PDFs.
    """
    if df <= 0:
        return 1.0
    x = df / (df + t * t)
    return _incomplete_beta(df / 2.0, 0.5, x)


def _incomplete_beta(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta function I_x(a, b), by continued fraction."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0

    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(lbeta + a * math.log(x) + b * math.log(1 - x))

    # Lentz's algorithm for the continued fraction.
    f, c, d = 1.0, 1.0, 0.0
    for i in range(200):
        m = i // 2
        if i == 0:
            numerator = 1.0
        elif i % 2 == 0:
            numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
        else:
            numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))

        d = 1.0 + numerator * d
        if abs(d) < 1e-30:
            d = 1e-30
        d = 1.0 / d

        c = 1.0 + numerator / c
        if abs(c) < 1e-30:
            c = 1e-30

        delta = c * d
        f *= delta
        if abs(1.0 - delta) < 1e-10:
            break

    result = front * (f - 1.0) / a
    return min(max(result, 0.0), 1.0)


def correlation_p_value(r: float, n: int) -> float | None:
    """Two-sided p-value for a correlation of r over n observations."""
    if n < 3 or abs(r) >= 1.0:
        return 0.0 if abs(r) >= 1.0 else None
    df = n - 2
    t = r * math.sqrt(df / (1 - r * r))
    return _t_distribution_sf(abs(t), df)


def choose_threshold(observations: list[Observation]) -> tuple[float | None, float, float]:
    """Pick the score that best separates placed from unplaced students.

    Maximises Youden's J (sensitivity + specificity - 1) over candidate cut
    points. Ties break toward the LOWER threshold: when two bars separate the
    data equally well, the lower one wrongly discourages fewer students, and
    the cost of a bar set too high falls entirely on them.
    """
    placed = [o for o in observations if o.placed]
    unplaced = [o for o in observations if not o.placed]
    if not placed or not unplaced:
        return None, 0.0, 0.0

    candidates = sorted({round(o.percent) for o in observations})
    best: tuple[float, float, float] | None = None

    for cut in candidates:
        sensitivity = sum(1 for o in placed if o.percent >= cut) / len(placed)
        specificity = sum(1 for o in unplaced if o.percent < cut) / len(unplaced)
        j = sensitivity + specificity - 1
        if best is None or j > best[0] + 1e-9:
            best = (j, sensitivity, specificity)
            best_cut = float(cut)

    if best is None:
        return None, 0.0, 0.0
    return best_cut, best[1], best[2]


def calibrate_area(
    skill_area_code: str, observations: list[Observation]
) -> AreaCalibration:
    """Calibrate one skill area, refusing where the data does not support it."""
    n = len(observations)
    placed_count = sum(1 for o in observations if o.placed)
    unplaced_count = n - placed_count

    def refuse(reason: str) -> AreaCalibration:
        return AreaCalibration(
            skill_area_code=skill_area_code,
            sample_size=n,
            placed_count=placed_count,
            correlation=None,
            p_value=None,
            threshold=None,
            sensitivity=None,
            specificity=None,
            significant=False,
            reason=reason,
        )

    if n < MIN_SAMPLE:
        return refuse(f"Only {n} students with both a score and an outcome; {MIN_SAMPLE} needed.")
    if placed_count < MIN_PER_GROUP:
        return refuse(f"Only {placed_count} placed students; {MIN_PER_GROUP} needed.")
    if unplaced_count < MIN_PER_GROUP:
        return refuse(f"Only {unplaced_count} unplaced students; {MIN_PER_GROUP} needed.")

    scores = [o.percent for o in observations]
    placed_flags = [o.placed for o in observations]
    r = point_biserial(scores, placed_flags)
    if r is None:
        return refuse("Correlation undefined — no variance in scores.")

    p = correlation_p_value(r, n)
    significant = p is not None and p < ALPHA

    if not significant:
        return AreaCalibration(
            skill_area_code=skill_area_code,
            sample_size=n,
            placed_count=placed_count,
            correlation=round(r, 4),
            p_value=None if p is None else round(p, 5),
            threshold=None,
            sensitivity=None,
            specificity=None,
            significant=False,
            reason=(
                "Score and placement are not significantly related in this sample "
                f"(r={r:.2f}, p={p:.3f}); keeping the existing bar."
                if p is not None
                else "Significance could not be computed."
            ),
        )

    # A negative relationship means higher scorers were placed LESS often. That
    # is a data-quality signal, not a bar to publish upside down.
    if r <= 0:
        return AreaCalibration(
            skill_area_code=skill_area_code,
            sample_size=n,
            placed_count=placed_count,
            correlation=round(r, 4),
            p_value=round(p, 5) if p is not None else None,
            threshold=None,
            sensitivity=None,
            specificity=None,
            significant=True,
            reason=(
                f"Correlation is negative (r={r:.2f}). This needs investigation "
                "before any bar is derived from it."
            ),
        )

    threshold, sensitivity, specificity = choose_threshold(observations)
    if threshold is None:
        return refuse("No usable cut point.")

    return AreaCalibration(
        skill_area_code=skill_area_code,
        sample_size=n,
        placed_count=placed_count,
        correlation=round(r, 4),
        p_value=round(p, 5) if p is not None else None,
        threshold=threshold,
        sensitivity=round(sensitivity, 3),
        specificity=round(specificity, 3),
        significant=True,
        reason="Calibrated from observed outcomes.",
    )


def calibrate(
    observations_by_area: dict[str, list[Observation]],
) -> CalibrationResult:
    """Run the full calibration across every skill area.

    The overall result is `succeeded` only if at least one area produced a
    threshold. A run where nothing could be calibrated is recorded as
    `insufficient_data` — which is itself the evidence for why the published
    benchmarks are still marked provisional.
    """
    areas = [
        calibrate_area(code, observations)
        for code, observations in sorted(observations_by_area.items())
    ]

    students = {o.user_id for obs in observations_by_area.values() for o in obs}
    placed = {
        o.user_id
        for obs in observations_by_area.values()
        for o in obs
        if o.placed
    }

    calibrated = [a for a in areas if a.threshold is not None]
    correlations = [a.correlation for a in areas if a.correlation is not None]

    if not calibrated:
        return CalibrationResult(
            status="insufficient_data",
            sample_size=len(students),
            placed_count=len(placed),
            overall_correlation=round(mean(correlations), 4) if correlations else None,
            areas=areas,
            message=(
                "Not enough outcome data to calibrate any skill area. "
                "Benchmarks remain provisional."
            ),
        )

    return CalibrationResult(
        status="succeeded",
        sample_size=len(students),
        placed_count=len(placed),
        overall_correlation=round(mean(correlations), 4) if correlations else None,
        areas=areas,
        message=(
            f"Calibrated {len(calibrated)} of {len(areas)} skill areas from "
            f"{len(students)} students ({len(placed)} placed)."
        ),
    )
