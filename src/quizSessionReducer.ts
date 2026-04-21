import { gradeEnglish, gradeRomaji } from "@/lib/grade";
import type { KanjiSubMode, PackCard, Script } from "@/types/pack";
import { shuffledCopy } from "@/lib/shuffle";
import type { SessionSnapshot } from "@/lib/persistence";
import { sessionFingerprint } from "@/lib/persistence";

export type ActiveQuizState = {
  packId: string;
  fingerprint: string;
  filteredCards: PackCard[];
  sessionPool: number[];
  batch: number[];
  batchIndex: number;
  phase: "quiz" | "submitted";
  draftAnswer: string;
  lastGraded: { input: string; correct: boolean } | null;
  script: Script;
  kanjiSubMode: KanjiSubMode;
  batchSize: number;
  correctCount: number;
  answeredCount: number;
  cyclesCompleted: number;
  /** Card ids the user got wrong at least once this session. Deduped. */
  missedCardIds: string[];
};

export type SummaryState = {
  /** Stable id so lifetime stats merge once per ended session. */
  sessionId: string;
  packId: string;
  script: Script;
  kanjiSubMode: KanjiSubMode;
  correctCount: number;
  answeredCount: number;
  cyclesCompleted: number;
  missed: PackCard[];
};

export type QuizRunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "active"; quiz: ActiveQuizState }
  | { status: "summary"; summary: SummaryState }
  | { status: "error"; message: string };

export type StartPayload = {
  filteredCards: PackCard[];
  batchSize: number;
  script: Script;
  kanjiSubMode: KanjiSubMode;
  packId: string;
  revision: number;
  restored: SessionSnapshot | null;
};

export type QuizRunAction =
  | { type: "START_LOAD" }
  | { type: "START_OK"; payload: StartPayload }
  | { type: "START_ERR"; message: string }
  | { type: "SET_ANSWER"; value: string }
  | { type: "SUBMIT" }
  | { type: "NEXT" }
  | { type: "RESTART" }
  | { type: "STOP" }
  | { type: "DISMISS_SUMMARY" };

function allIndices(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function drawSessionPool(n: number, poolSize: number): number[] {
  const size = Math.max(1, Math.min(poolSize, n));
  return shuffledCopy(allIndices(n)).slice(0, size);
}

function validSnapshot(
  snap: SessionSnapshot,
  n: number,
  fingerprint: string,
): boolean {
  if (snap.fingerprint !== fingerprint) return false;
  if (snap.batch.length === 0) return false;
  const ok = (idx: number) => Number.isInteger(idx) && idx >= 0 && idx < n;
  if (!snap.batch.every(ok)) return false;
  if (snap.sessionPool && !snap.sessionPool.every(ok)) return false;
  if (!ok(snap.batchIndex) || snap.batchIndex >= snap.batch.length) return false;
  if (snap.phase === "submitted" && typeof snap.lastCorrect !== "boolean") {
    return false;
  }
  return true;
}

function gradeAnswer(
  card: PackCard,
  script: Script,
  kanjiSubMode: KanjiSubMode,
  input: string,
): boolean {
  if (script === "kanji" && kanjiSubMode === "meaning") {
    return gradeEnglish(input, card.meaningsEn ?? []);
  }
  return gradeRomaji(input, card.readingsRomaji ?? []);
}

export function buildSessionSnapshot(quiz: ActiveQuizState): SessionSnapshot {
  return {
    fingerprint: quiz.fingerprint,
    sessionPool: quiz.sessionPool,
    batch: quiz.batch,
    batchIndex: quiz.batchIndex,
    phase: quiz.phase,
    lastInput: quiz.lastGraded?.input ?? "",
    lastCorrect: quiz.lastGraded?.correct ?? null,
    correctCount: quiz.correctCount,
    answeredCount: quiz.answeredCount,
    cyclesCompleted: quiz.cyclesCompleted,
    missedCardIds: quiz.missedCardIds,
  };
}

function buildSummary(q: ActiveQuizState): SummaryState {
  const byId = new Map(q.filteredCards.map((c) => [c.id, c] as const));
  const missed = q.missedCardIds
    .map((id) => byId.get(id))
    .filter((c): c is PackCard => Boolean(c));
  return {
    sessionId: crypto.randomUUID(),
    packId: q.packId,
    script: q.script,
    kanjiSubMode: q.kanjiSubMode,
    correctCount: q.correctCount,
    answeredCount: q.answeredCount,
    cyclesCompleted: q.cyclesCompleted,
    missed,
  };
}

export function quizRunReducer(
  state: QuizRunState,
  action: QuizRunAction,
): QuizRunState {
  switch (action.type) {
    case "START_LOAD":
      return { status: "loading" };
    case "START_ERR":
      return { status: "error", message: action.message };
    case "STOP": {
      if (state.status === "active") {
        return { status: "summary", summary: buildSummary(state.quiz) };
      }
      return { status: "idle" };
    }
    case "DISMISS_SUMMARY":
      return { status: "idle" };
    case "START_OK": {
      const {
        filteredCards,
        batchSize,
        script,
        kanjiSubMode,
        packId,
        revision,
        restored,
      } = action.payload;
      const n = filteredCards.length;
      if (n === 0) {
        return { status: "error", message: "No cards in this pack for the selected mode." };
      }
      const fingerprint = sessionFingerprint(
        packId,
        revision,
        script,
        kanjiSubMode,
        n,
      );

      if (
        restored &&
        restored.sessionPool &&
        restored.sessionPool.length > 0 &&
        validSnapshot(restored, n, fingerprint)
      ) {
        const quiz: ActiveQuizState = {
          packId,
          fingerprint,
          filteredCards,
          sessionPool: [...restored.sessionPool],
          batch: [...restored.batch],
          batchIndex: restored.batchIndex,
          phase: restored.phase,
          draftAnswer:
            restored.phase === "submitted" ? restored.lastInput : "",
          lastGraded:
            restored.phase === "submitted" &&
            restored.lastCorrect != null &&
            restored.lastInput
              ? { input: restored.lastInput, correct: restored.lastCorrect }
              : null,
          script,
          kanjiSubMode,
          batchSize,
          correctCount: Math.max(0, restored.correctCount ?? 0),
          answeredCount: Math.max(0, restored.answeredCount ?? 0),
          cyclesCompleted: Math.max(0, restored.cyclesCompleted ?? 0),
          missedCardIds: Array.isArray(restored.missedCardIds)
            ? [...restored.missedCardIds]
            : [],
        };
        return { status: "active", quiz };
      }

      const sessionPool = drawSessionPool(n, batchSize);
      const batch = shuffledCopy(sessionPool);
      const quiz: ActiveQuizState = {
        packId,
        fingerprint,
        filteredCards,
        sessionPool,
        batch,
        batchIndex: 0,
        phase: "quiz",
        draftAnswer: "",
        lastGraded: null,
        script,
        kanjiSubMode,
        batchSize,
        correctCount: 0,
        answeredCount: 0,
        cyclesCompleted: 0,
        missedCardIds: [],
      };
      return { status: "active", quiz };
    }
    case "SET_ANSWER": {
      if (state.status !== "active") return state;
      if (state.quiz.phase !== "quiz") return state;
      return {
        status: "active",
        quiz: { ...state.quiz, draftAnswer: action.value },
      };
    }
    case "SUBMIT": {
      if (state.status !== "active") return state;
      const q = state.quiz;
      if (q.phase !== "quiz") return state;
      const card = q.filteredCards[q.batch[q.batchIndex]!]!;
      const correct = gradeAnswer(card, q.script, q.kanjiSubMode, q.draftAnswer);
      const missedCardIds =
        !correct && !q.missedCardIds.includes(card.id)
          ? [...q.missedCardIds, card.id]
          : q.missedCardIds;
      return {
        status: "active",
        quiz: {
          ...q,
          phase: "submitted",
          lastGraded: { input: q.draftAnswer, correct },
          answeredCount: q.answeredCount + 1,
          correctCount: q.correctCount + (correct ? 1 : 0),
          missedCardIds,
        },
      };
    }
    case "NEXT": {
      if (state.status !== "active") return state;
      const q = state.quiz;
      if (q.phase !== "submitted") return state;
      let batchIndex = q.batchIndex + 1;
      let batch = q.batch;
      let cyclesCompleted = q.cyclesCompleted;
      if (batchIndex >= batch.length) {
        batch = shuffledCopy(q.sessionPool);
        batchIndex = 0;
        cyclesCompleted += 1;
      }
      return {
        status: "active",
        quiz: {
          ...q,
          batch,
          batchIndex,
          cyclesCompleted,
          phase: "quiz",
          draftAnswer: "",
          lastGraded: null,
        },
      };
    }
    case "RESTART": {
      if (state.status !== "active") return state;
      const q = state.quiz;
      const n = q.filteredCards.length;
      const sessionPool = drawSessionPool(n, q.batchSize);
      const batch = shuffledCopy(sessionPool);
      return {
        status: "active",
        quiz: {
          ...q,
          sessionPool,
          batch,
          batchIndex: 0,
          phase: "quiz",
          draftAnswer: "",
          lastGraded: null,
          correctCount: 0,
          answeredCount: 0,
          cyclesCompleted: 0,
          missedCardIds: [],
        },
      };
    }
    default:
      return state;
  }
}
