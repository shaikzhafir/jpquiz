import type { KanjiSubMode, Script } from "@/types/pack";

export type QuizSettings = {
  script: Script;
  kanjiSubMode: KanjiSubMode;
  packId: string;
  batchSize: number;
};

export type QuizPhase = "setup" | "quiz" | "submitted";

export type SessionSnapshot = {
  fingerprint: string;
  /** Fixed pool of card indices for the session (added in v2 — optional for old snapshots). */
  sessionPool?: number[];
  batch: number[];
  batchIndex: number;
  phase: Exclude<QuizPhase, "setup">;
  lastInput: string;
  lastCorrect: boolean | null;
  /** Running session stats — optional for backward compat with older snapshots. */
  correctCount?: number;
  answeredCount?: number;
  cyclesCompleted?: number;
  /** Card ids missed this session (added later — optional for old snapshots). */
  missedCardIds?: string[];
};

const SETTINGS_KEY = "jpquiz:v1:settings";
const SESSION_KEY = "jpquiz:v1:session";

export function sessionFingerprint(
  packId: string,
  revision: number,
  script: Script,
  kanjiSubMode: KanjiSubMode,
  filteredLen: number,
): string {
  return `${packId}|r${revision}|${script}|${kanjiSubMode}|n${filteredLen}`;
}

export function loadSettings(): Partial<QuizSettings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<QuizSettings>;
  } catch {
    return null;
  }
}

export function saveSettings(s: QuizSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionSnapshot;
  } catch {
    return null;
  }
}

export function saveSession(snapshot: SessionSnapshot | null): void {
  if (!snapshot) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
}
