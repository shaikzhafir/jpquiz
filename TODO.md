# TODO

Open follow-ups for jpquiz. Touch `src/quizSessionReducer.ts` unless noted.

## 1. Cycle-complete screen

**Problem.** `NEXT` currently reshuffles the whole pool when `remaining` empties (`takeNextBatch` in `quizSessionReducer.ts`), so the quiz loops forever and never shows end-of-pack stats.

**Plan.**
- Add `phase: "cycleDone"` to `ActiveQuizState` (union with `"quiz" | "submitted"`).
- In the `NEXT` handler, when `batchIndex + 1 >= batch.length` **and** `remaining.length === 0`, transition to `phase: "cycleDone"` instead of calling `takeNextBatch`.
- Track a `missedIndices: number[]` on the state — append whenever `SUBMIT` grades wrong.
- New actions: `RESTART_CYCLE` (fresh shuffle of all indices, zero stats), `REDRILL_MISSED` (shuffle `missedIndices` into a new pool, keep stats), `STOP` (existing).
- Render a new panel in `App.tsx` when `phase === "cycleDone"` showing `correctCount / answeredCount`, `%`, list of prompts for `missedIndices`, and the three buttons.
- On restart, reset `correctCount`, `answeredCount`, `missedIndices`.

**Out of scope.** Cross-session persistence — existing `SessionSnapshot` already handles mid-cycle resume.

## 2. Requeue wrong answers within the session (Leitner-lite)

**Problem.** Getting a card wrong has no consequence — it won't come back until the whole pool wraps.

**Plan.**
- On `SUBMIT` with `correct === false`, remember the current card index and insert it back into `remaining` at a random position ~6–10 entries ahead (clamped to `remaining.length`) during the `NEXT` transition.
- Edge case: if `remaining.length < 6`, append to the end.
- Tune offset later — start with `min + floor(random * (max - min))` where `min=6`, `max=10`.
- No new actions needed; mutate inside the `NEXT` reducer branch.
- Leave "known" cards alone — they only reappear on wrap-around.

**Interaction with (1).** A wrong answer on the last card of the cycle should push that card into a fresh mini-pool rather than triggering `cycleDone` immediately — i.e. re-check `remaining.length` *after* the requeue when deciding whether to end the cycle.

## 3. (Optional, larger) True cross-session SRS

Only worth doing if you actually drill daily.

- Per-card state in `localStorage` keyed by `packId + cardId`: `{ ease, intervalDays, dueAt, reps, lapses }`.
- SM-2 scheduler (Anki's original algorithm — simple, well documented).
- Quiz start mode: `due` (only cards with `dueAt <= now`) vs. `explore` (current behavior).
- New component to show "N due today" on the pack picker.
- Needs a storage-size budget for large packs (Core 2000 kanji has 3616 cards → ~200KB of state, fine).
- Consider a `clear progress` button per pack.

This is a real feature, not a tweak. Do (1) and (2) first and see if that's enough.
