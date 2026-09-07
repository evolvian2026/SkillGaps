"""Classical item analysis for the question bank.

Every number the product shows a student, a TPO or an employer rests on the
quality of the items underneath it. Nothing was watching that. This is the same
statistics `calibration` already runs, pointed one level down: instead of
asking whether a skill-area score predicts placement, it asks whether an
individual question predicts the rest of the paper.

Two properties are deliberate and match the calibration job's posture:

  * It refuses on thin data rather than reporting a number that looks like
    evidence. An item answered eleven times has no stable discrimination.
  * A negative discrimination is reported as a *fault*, not as a small
    positive. An item the stronger students get wrong more often than the
    weaker ones is almost always miskeyed, and averaging it away is how a
    broken item survives in a bank for years.

Pure and I/O-free, so all of this is testable without a database.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import mean, pstdev

from .calibration import correlation_p_value, point_biserial

# Below this an item is not analysed at all: a discrimination computed from a
# handful of responses is noise wearing the costume of a statistic.
MIN_RESPONSES = 30

# Above this the estimate is stable enough not to be caveated. Between the two
# it is reported and flagged as thin.
CONFIDENT_RESPONSES = 100

# An item everyone answers correctly separates nobody, and one almost everyone
# fails is usually broken rather than hard. Both are worth a look, neither is
# an error on its own.
EASY_P = 0.95
HARD_P = 0.20

# Conventional CTT bands. An item below 0.10 is contributing almost nothing.
WEAK_DISCRIMINATION = 0.10
GOOD_DISCRIMINATION = 0.30

# Only a discrimination past *minus* the weak band counts as evidence of a
# miskey. A coefficient of -0.03 is noise, and calling it "urgent, probably
# miskeyed" would bury the handful of items that genuinely are — which is the
# failure this report exists to prevent.
NEGATIVE_DISCRIMINATION = -WEAK_DISCRIMINATION

# A distractor chosen by under 5% of candidates is doing no work.
DEAD_DISTRACTOR_RATE = 0.05

ALPHA = 0.05


@dataclass(frozen=True)
class Response:
    """One student's answer to one item, with their score on the rest of the paper.

    `rest_percent` deliberately excludes this item. Correlating an item against
    a total that contains it inflates the coefficient — severely on a short
    paper, which is exactly the shape of paper this product uses.
    """

    user_id: str
    correct: bool
    rest_percent: float
    selected_option_id: str | None = None


@dataclass
class DistractorStat:
    option_id: str
    label: str
    is_correct: bool
    chosen: int
    share: float
    #: Mean rest-of-paper score of the students who picked this option. None
    #: when nobody picked it.
    mean_rest_percent: float | None
    flags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "option_id": self.option_id,
            "label": self.label,
            "is_correct": self.is_correct,
            "chosen": self.chosen,
            "share": round(self.share, 4),
            "mean_rest_percent": (
                None if self.mean_rest_percent is None else round(self.mean_rest_percent, 2)
            ),
            "flags": self.flags,
        }


@dataclass
class ItemStat:
    question_id: str
    responses: int
    #: Proportion answering correctly. The convention is confusing but standard:
    #: a *high* p-value means an *easy* item.
    facility: float | None
    discrimination: float | None
    discrimination_p: float | None
    flags: list[str]
    verdict: str
    message: str
    distractors: list[DistractorStat] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "question_id": self.question_id,
            "responses": self.responses,
            "facility": None if self.facility is None else round(self.facility, 4),
            "discrimination": (
                None if self.discrimination is None else round(self.discrimination, 4)
            ),
            "discrimination_p": (
                None if self.discrimination_p is None else round(self.discrimination_p, 5)
            ),
            "flags": self.flags,
            "verdict": self.verdict,
            "message": self.message,
            "distractors": [d.as_dict() for d in self.distractors],
        }


def _distractor_stats(
    responses: list[Response],
    options: list[tuple[str, str, bool]],
) -> list[DistractorStat]:
    """Per-option selection rates and the calibre of who chose each.

    The interesting signal is not how often a wrong option is picked but *by
    whom*. A distractor whose choosers outscore the students who picked the key
    is the classic signature of a miskeyed or ambiguous item.
    """
    if not options:
        return []

    answered = [r for r in responses if r.selected_option_id is not None]
    total = len(answered)
    if total == 0:
        return []

    key_scores = [r.rest_percent for r in answered if r.correct]
    key_mean = mean(key_scores) if key_scores else None

    stats: list[DistractorStat] = []
    for option_id, label, is_correct in options:
        chosen = [r for r in answered if r.selected_option_id == option_id]
        share = len(chosen) / total
        chooser_mean = mean([r.rest_percent for r in chosen]) if chosen else None

        flags: list[str] = []
        if not is_correct:
            if share < DEAD_DISTRACTOR_RATE:
                flags.append("dead_distractor")
            if (
                chooser_mean is not None
                and key_mean is not None
                and len(chosen) >= 5
                and chooser_mean > key_mean
            ):
                # Stronger students preferring a wrong option is a fault in the
                # item, not a fact about the students.
                flags.append("attractive_distractor")

        stats.append(
            DistractorStat(
                option_id=option_id,
                label=label,
                is_correct=is_correct,
                chosen=len(chosen),
                share=share,
                mean_rest_percent=chooser_mean,
                flags=flags,
            )
        )
    return stats


def analyse_item(
    question_id: str,
    responses: list[Response],
    options: list[tuple[str, str, bool]] | None = None,
) -> ItemStat:
    """Facility, discrimination and distractor behaviour for one item."""

    def refuse(message: str) -> ItemStat:
        return ItemStat(
            question_id=question_id,
            responses=len(responses),
            facility=None,
            discrimination=None,
            discrimination_p=None,
            flags=["insufficient_data"],
            verdict="not_analysed",
            message=message,
        )

    n = len(responses)
    if n < MIN_RESPONSES:
        return refuse(
            f"Answered {n} times; {MIN_RESPONSES} needed before the statistics mean anything."
        )

    correct = [r.correct for r in responses]
    facility = sum(correct) / n

    # Everyone right or everyone wrong: facility is meaningful, discrimination
    # is not defined at all. Say so rather than reporting a zero.
    if facility in (0.0, 1.0):
        stat = ItemStat(
            question_id=question_id,
            responses=n,
            facility=facility,
            discrimination=None,
            discrimination_p=None,
            flags=["no_variance", "too_easy" if facility == 1.0 else "too_hard"],
            verdict="review",
            message=(
                "Every student answered this correctly, so it separates nobody."
                if facility == 1.0
                else "No student has ever answered this correctly — check the answer key."
            ),
            distractors=_distractor_stats(responses, options or []),
        )
        return stat

    discrimination = point_biserial([r.rest_percent for r in responses], correct)
    p_value = (
        correlation_p_value(discrimination, n) if discrimination is not None else None
    )

    flags: list[str] = []
    if facility >= EASY_P:
        flags.append("too_easy")
    if facility <= HARD_P:
        flags.append("too_hard")
    if n < CONFIDENT_RESPONSES:
        flags.append("thin_sample")

    if discrimination is None:
        flags.append("no_variance")
    elif discrimination <= NEGATIVE_DISCRIMINATION:
        flags.append("negative_discrimination")
    elif discrimination < WEAK_DISCRIMINATION:
        flags.append("not_discriminating")

    distractors = _distractor_stats(responses, options or [])
    for d in distractors:
        for flag in d.flags:
            if flag not in flags:
                flags.append(flag)

    verdict, message = _verdict(facility, discrimination, p_value, n, flags)

    return ItemStat(
        question_id=question_id,
        responses=n,
        facility=facility,
        discrimination=discrimination,
        discrimination_p=p_value,
        flags=flags,
        verdict=verdict,
        message=message,
        distractors=distractors,
    )


def _verdict(
    facility: float,
    discrimination: float | None,
    p_value: float | None,
    n: int,
    flags: list[str],
) -> tuple[str, str]:
    """Turn the numbers into one of three actions, with the reason attached.

    Ordered by severity: an item can be easy *and* miskeyed, and the miskey is
    what needs saying first.
    """
    significant = p_value is not None and p_value < ALPHA

    if "negative_discrimination" in flags and discrimination is not None:
        detail = "significant" if significant else "not statistically significant"
        return (
            "urgent",
            f"Stronger students get this wrong more often than weaker ones "
            f"(discrimination {discrimination:.2f}, {detail}). Almost always a "
            f"miskeyed answer or a misleading stem — check the key first.",
        )

    if "attractive_distractor" in flags:
        return (
            "urgent",
            "A wrong option is being chosen by students who outscore those "
            "picking the key. Either the key is wrong or two options are "
            "defensible.",
        )

    if facility == 1.0 or "too_easy" in flags:
        return (
            "review",
            f"{facility:.0%} answer this correctly, so it adds almost nothing "
            f"to a score. Keep it as a warm-up or retire it.",
        )

    if "too_hard" in flags:
        return (
            "review",
            f"Only {facility:.0%} answer this correctly — at or below what "
            f"guessing would produce. Check that it is answerable as written.",
        )

    if discrimination is None:
        return (
            "review",
            "Discrimination could not be measured: every student who answered "
            "this scored the same on the rest of the paper. Not a fault in the "
            "item — there is nothing here to correlate against yet.",
        )

    if "not_discriminating" in flags:
        return (
            "review",
            f"Discrimination {discrimination:.2f}: students who do well overall "
            f"are barely more likely to get this right than students who do not.",
        )

    if "dead_distractor" in flags:
        return (
            "review",
            "One or more wrong options are almost never chosen, so the item is "
            "effectively easier than its option count suggests.",
        )

    caveat = (
        f" Based on {n} responses; treat as provisional until {CONFIDENT_RESPONSES}."
        if "thin_sample" in flags
        else ""
    )
    quality = "strong" if discrimination >= GOOD_DISCRIMINATION else "acceptable"
    return (
        "ok",
        f"Facility {facility:.0%}, discrimination {discrimination:.2f} — {quality}.{caveat}",
    )


@dataclass
class BankReport:
    analysed: int
    skipped: int
    urgent: int
    review: int
    ok: int
    items: list[ItemStat]

    def as_dict(self) -> dict:
        return {
            "analysed": self.analysed,
            "skipped": self.skipped,
            "urgent": self.urgent,
            "review": self.review,
            "ok": self.ok,
            "items": [i.as_dict() for i in self.items],
        }


def analyse_bank(
    responses_by_item: dict[str, list[Response]],
    options_by_item: dict[str, list[tuple[str, str, bool]]] | None = None,
) -> BankReport:
    """Run the analysis across a whole question bank.

    Items are returned worst-first, because the point of the report is the
    short list at the top, not the long tail of items that are fine.
    """
    options_by_item = options_by_item or {}
    items = [
        analyse_item(qid, responses, options_by_item.get(qid, []))
        for qid, responses in responses_by_item.items()
    ]

    rank = {"urgent": 0, "review": 1, "ok": 2, "not_analysed": 3}
    items.sort(
        key=lambda i: (
            rank[i.verdict],
            # Within a verdict, the least discriminating first.
            i.discrimination if i.discrimination is not None else math.inf,
        )
    )

    return BankReport(
        analysed=sum(1 for i in items if i.verdict != "not_analysed"),
        skipped=sum(1 for i in items if i.verdict == "not_analysed"),
        urgent=sum(1 for i in items if i.verdict == "urgent"),
        review=sum(1 for i in items if i.verdict == "review"),
        ok=sum(1 for i in items if i.verdict == "ok"),
        items=items,
    )
