import { startCheckAction, startPracticeAction } from "@/lib/practice/actions";

/**
 * The two ways out of a gap: practise it, or measure it.
 *
 * Placed on the report next to the curated resources, because a gap the
 * student cannot act on from where they are told about it is a report card,
 * not a platform.
 *
 * Each button appears only when the bank can actually serve it. A real
 * question bank does not hold a practice set and eight fresh diagnostic items
 * for every skill area, and offering a button that can only fail is worse than
 * offering nothing — so when neither is available the card says so plainly and
 * points at the resources above.
 */
export function GapLoopActions({
  skillAreaId,
  hasPractice,
  canCheck,
}: {
  skillAreaId: string;
  hasPractice: boolean;
  canCheck: boolean;
}) {
  if (!hasPractice && !canCheck) {
    return (
      <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-600">
        No practice set or skill check exists for this area yet — the resources
        above are the way in for now.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
      {hasPractice ? (
        <form action={startPracticeAction}>
          <input type="hidden" name="skillAreaId" value={skillAreaId} />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Practise this
          </button>
        </form>
      ) : null}
      {canCheck ? (
        <form action={startCheckAction}>
          <input type="hidden" name="skillAreaId" value={skillAreaId} />
          <button
            type="submit"
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100"
          >
            Skill check
          </button>
        </form>
      ) : null}
    </div>
  );
}
