import type { SummaryState } from "@/quizSessionReducer";

export type PackLifetimeStats = {
  answersCorrect: number;
  answersTotal: number;
  sessionsCompleted: number;
  lastPlayedAt: number;
};

const STATS_KEY = "jpquiz:v1:packStats";
const MERGED_KEY = "jpquiz:v1:statsMergedSessions";
const MAX_MERGED_IDS = 3000;

function loadMergedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MERGED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveMergedIds(ids: Set<string>): void {
  const arr = [...ids];
  const trimmed =
    arr.length > MAX_MERGED_IDS ? arr.slice(arr.length - MAX_MERGED_IDS) : arr;
  localStorage.setItem(MERGED_KEY, JSON.stringify(trimmed));
}

export function loadPackStats(): Record<string, PackLifetimeStats> {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return {};
    return data as Record<string, PackLifetimeStats>;
  } catch {
    return {};
  }
}

function savePackStats(stats: Record<string, PackLifetimeStats>): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/**
 * Merge session summary into lifetime totals for that pack. Idempotent per
 * `summary.sessionId` so React strict mode / retries do not double-count.
 */
export function recordPackSessionSummary(summary: SummaryState): void {
  const merged = loadMergedIds();
  if (merged.has(summary.sessionId)) return;
  merged.add(summary.sessionId);
  saveMergedIds(merged);

  const stats = loadPackStats();
  const prev = stats[summary.packId] ?? {
    answersCorrect: 0,
    answersTotal: 0,
    sessionsCompleted: 0,
    lastPlayedAt: 0,
  };
  stats[summary.packId] = {
    answersCorrect: prev.answersCorrect + summary.correctCount,
    answersTotal: prev.answersTotal + summary.answeredCount,
    sessionsCompleted: prev.sessionsCompleted + 1,
    lastPlayedAt: Date.now(),
  };
  savePackStats(stats);
}

export function formatPackStatLine(s: PackLifetimeStats | undefined): string | null {
  if (!s || s.answersTotal <= 0) return null;
  const pct = Math.round((100 * s.answersCorrect) / s.answersTotal);
  const sessions =
    s.sessionsCompleted === 1 ? "1 session" : `${s.sessionsCompleted} sessions`;
  return `${sessions} · ${pct}% · ${s.answersTotal} answers`;
}
