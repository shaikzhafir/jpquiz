import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import "./App.css";
import { BatchProgress } from "@/components/BatchProgress";
import { ModePicker } from "@/components/ModePicker";
import { PackPicker } from "@/components/PackPicker";
import { filterCardsForMode } from "@/lib/filterCards";
import { loadManifest } from "@/lib/loadManifest";
import { loadPack } from "@/lib/loadPack";
import {
  loadPackStats,
  recordPackSessionSummary,
  type PackLifetimeStats,
} from "@/lib/packStats";
import {
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  type QuizSettings,
} from "@/lib/persistence";
import { formatEnglishGloss, hasExampleSentence } from "@/lib/cardGloss";
import { displayExpectedAnswers } from "@/lib/displayExpected";
import type { KanjiSubMode, PackCard, PackManifest, Script } from "@/types/pack";
import {
  buildSessionSnapshot,
  quizRunReducer,
  type QuizRunState,
} from "@/quizSessionReducer";

function clampBatchSize(n: number): number {
  if (!Number.isFinite(n)) return 20;
  return Math.min(200, Math.max(3, Math.round(n)));
}

const SCRIPT_LABEL: Record<Script, string> = {
  hiragana: "Hiragana",
  katakana: "Katakana",
  kanji: "Kanji",
};

export function App() {
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const saved = useMemo(() => loadSettings(), []);

  const [script, setScript] = useState<Script>(saved?.script ?? "hiragana");
  const [kanjiSubMode, setKanjiSubMode] = useState<KanjiSubMode>(
    saved?.kanjiSubMode ?? "reading",
  );
  const [packId, setPackId] = useState(saved?.packId ?? "");
  const [batchSize, setBatchSize] = useState(
    clampBatchSize(saved?.batchSize ?? 10),
  );

  const [packStats, setPackStats] = useState<Record<string, PackLifetimeStats>>(
    () => loadPackStats(),
  );

  const [run, dispatch] = useReducer(quizRunReducer, { status: "idle" } satisfies QuizRunState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await loadManifest();
        if (cancelled) return;
        setManifest(m);
        setManifestError(null);
      } catch {
        if (!cancelled) {
          setManifestError("Could not load pack list. Check that /data/packs exists.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const packsForScript = manifest.packs
      .filter((p) => p.script === script)
      .slice()
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
      );
    setPackId((current) =>
      packsForScript.some((p) => p.id === current)
        ? current
        : (packsForScript[0]?.id ?? ""),
    );
  }, [manifest, script]);

  useEffect(() => {
    const settings: QuizSettings = {
      script,
      kanjiSubMode,
      packId,
      batchSize,
    };
    saveSettings(settings);
  }, [script, kanjiSubMode, packId, batchSize]);

  useEffect(() => {
    if (run.status === "active") {
      saveSession(buildSessionSnapshot(run.quiz));
    } else if (run.status === "summary" || run.status === "idle") {
      saveSession(null);
    }
  }, [run]);

  useEffect(() => {
    if (run.status !== "summary") return;
    recordPackSessionSummary(run.summary);
    setPackStats(loadPackStats());
  }, [run]);

  const startQuiz = useCallback(async () => {
    if (!packId) return;
    dispatch({ type: "START_LOAD" });
    try {
      const pack = await loadPack(packId);
      const filtered = filterCardsForMode(pack, script, kanjiSubMode);
      if (filtered.length === 0) {
        dispatch({
          type: "START_ERR",
          message: "This pack has no cards for the selected mode.",
        });
        return;
      }
      const restored = loadSession();
      dispatch({
        type: "START_OK",
        payload: {
          filteredCards: filtered,
          batchSize,
          script,
          kanjiSubMode,
          packId: pack.id,
          revision: pack.revision ?? 1,
          restored,
        },
      });
    } catch (e) {
      dispatch({
        type: "START_ERR",
        message: e instanceof Error ? e.message : "Failed to start quiz.",
      });
    }
  }, [packId, script, kanjiSubMode, batchSize]);

  const answerHint =
    script === "kanji" && kanjiSubMode === "meaning"
      ? "Type the English meaning."
      : "Type the reading in romaji (Hepburn).";

  const packs = manifest?.packs ?? [];

  const activePackTitle = useMemo(() => {
    const id =
      run.status === "active"
        ? run.quiz.packId
        : run.status === "summary"
          ? run.summary.packId
          : null;
    if (!id) return null;
    return manifest?.packs.find((p) => p.id === id)?.title ?? id;
  }, [run, manifest]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">JP Quiz</h1>
        <span className="app-mark" aria-hidden="true">仮</span>
      </header>

      {manifestError ? <div className="error">{manifestError}</div> : null}
      {run.status === "error" ? <div className="error">{run.message}</div> : null}

      {run.status === "idle" || run.status === "loading" || run.status === "error" ? (
        <section aria-label="Quiz setup">
          <ModePicker
            script={script}
            onScript={setScript}
            kanjiSubMode={kanjiSubMode}
            onKanjiSubMode={setKanjiSubMode}
            disabled={run.status === "loading"}
          />
          <div className="setup-block">
            <PackPicker
              script={script}
              packs={packs}
              packId={packId}
              onPackId={setPackId}
              statsByPackId={packStats}
              disabled={run.status === "loading" || packs.length === 0}
            />
            <label className="field">
              <span className="label">Round size</span>
              <input
                type="number"
                inputMode="numeric"
                min={3}
                max={200}
                value={batchSize}
                disabled={run.status === "loading"}
                onChange={(e) => setBatchSize(clampBatchSize(Number(e.target.value)))}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                onClick={() => void startQuiz()}
                disabled={run.status === "loading" || !packId}
              >
                {run.status === "loading" ? "Loading…" : "Begin"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {run.status === "active" ? (
        <section className="quiz" aria-label="Quiz">
          <BatchProgress
            batchIndex={run.quiz.batchIndex}
            batchLength={run.quiz.batch.length}
            cyclesCompleted={run.quiz.cyclesCompleted}
            correctCount={run.quiz.correctCount}
            answeredCount={run.quiz.answeredCount}
            packTitle={activePackTitle}
            onRestart={() => dispatch({ type: "RESTART" })}
            onEnd={() => dispatch({ type: "STOP" })}
          />
          <div className="prompt" lang="ja">
            {
              run.quiz.filteredCards[run.quiz.batch[run.quiz.batchIndex]!]!
                .prompt
            }
          </div>
          <p className="hint">{answerHint}</p>
          <form
            className="answer-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (run.quiz.phase === "quiz") {
                if (!run.quiz.draftAnswer.trim()) return;
                dispatch({ type: "SUBMIT" });
              } else {
                dispatch({ type: "NEXT" });
              }
            }}
          >
            <label className="answer-field" htmlFor="answer">
              <span className="label">Your answer</span>
              <input
                id="answer"
                className="answer-input"
                type="text"
                inputMode="text"
                enterKeyHint={run.quiz.phase === "quiz" ? "send" : "next"}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={run.quiz.draftAnswer}
                disabled={run.quiz.phase === "submitted"}
                onChange={(e) =>
                  dispatch({ type: "SET_ANSWER", value: e.target.value })
                }
              />
            </label>
            <div className="actions">
              {run.quiz.phase === "quiz" ? (
                <button type="submit" disabled={!run.quiz.draftAnswer.trim()}>
                  Submit
                </button>
              ) : (
                <button type="submit">Next</button>
              )}
            </div>
            {run.quiz.phase === "submitted" ? (
              <AnswerResult
                card={
                  run.quiz.filteredCards[run.quiz.batch[run.quiz.batchIndex]!]!
                }
                input={run.quiz.lastGraded?.input ?? ""}
                correct={run.quiz.lastGraded?.correct ?? false}
                script={run.quiz.script}
                kanjiSubMode={run.quiz.kanjiSubMode}
              />
            ) : null}
          </form>
        </section>
      ) : null}

      {run.status === "summary" ? (
        <section className="summary" aria-label="Session summary">
          <p className="summary-kicker">
            {activePackTitle ? activePackTitle : "Session"} · {SCRIPT_LABEL[run.summary.script]}
            {run.summary.script === "kanji"
              ? ` · ${run.summary.kanjiSubMode === "meaning" ? "Meaning" : "Reading"}`
              : ""}
          </p>
          <h2 className="summary-heading">Session ended</h2>
          <dl className="summary-stats">
            <div>
              <dt>Correct</dt>
              <dd>
                {run.summary.correctCount}
                <span className="muted"> / {run.summary.answeredCount}</span>
              </dd>
            </div>
            <div>
              <dt>Rounds</dt>
              <dd>{run.summary.cyclesCompleted + (run.summary.answeredCount > 0 ? 1 : 0)}</dd>
            </div>
            <div>
              <dt>To review</dt>
              <dd>{run.summary.missed.length}</dd>
            </div>
          </dl>

          <h3 className="summary-section-label">Cards to review</h3>
          {run.summary.missed.length === 0 ? (
            <p className="clean-sweep">No misses this session.</p>
          ) : (
            <ul className="missed-list">
              {run.summary.missed.map((card) => (
                <li key={card.id} className="missed-item">
                  <span className="missed-prompt" lang="ja">{card.prompt}</span>
                  <div className="missed-detail">
                    <span className="missed-answer">
                      {displayExpectedAnswers(
                        card,
                        run.summary.script,
                        run.summary.kanjiSubMode,
                      )}
                    </span>
                    {formatEnglishGloss(card) ? (
                      <span className="missed-gloss">
                        {formatEnglishGloss(card)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="actions">
            <button
              type="button"
              onClick={() => dispatch({ type: "DISMISS_SUMMARY" })}
            >
              Back to setup
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

type AnswerResultProps = {
  card: PackCard;
  input: string;
  correct: boolean;
  script: Script;
  kanjiSubMode: KanjiSubMode;
};

function AnswerResult({ card, input, correct, script, kanjiSubMode }: AnswerResultProps) {
  const gloss = formatEnglishGloss(card);
  const hasExample = hasExampleSentence(card);
  return (
    <div className={`result ${correct ? "ok" : "bad"}`} role="status">
      <p className="result-title">{correct ? "Correct" : "Incorrect"}</p>
      <div className="result-grid">
        <span className="result-label">You typed</span>
        <span className="mono">{input || "—"}</span>
        <span className="result-label">Accepted</span>
        <span className="mono">
          {displayExpectedAnswers(card, script, kanjiSubMode)}
        </span>
      </div>

      <div className="example">
        <p className="example-heading">Meaning</p>
        {gloss ? (
          <p className="gloss">{gloss}</p>
        ) : (
          <p className="example-empty">
            Add <span className="mono">meaningsEn</span> in the pack JSON to
            show a gloss here.
          </p>
        )}

        <p className="example-heading" style={{ marginTop: "var(--space-5)" }}>
          Example
        </p>
        {hasExample ? (
          <>
            <p className="example-ja" lang="ja">{card.exampleJa}</p>
            {card.exampleReading ? (
              <p
                className="example-reading"
                lang="ja"
                aria-label="Kana reading of example sentence"
              >
                {card.exampleReading}
              </p>
            ) : null}
            <p className="example-en">{card.exampleEn}</p>
          </>
        ) : (
          <p className="example-empty">
            {gloss == null
              ? "Add exampleJa / exampleEn in the pack JSON."
              : "No example sentence for this card."}
          </p>
        )}
      </div>
    </div>
  );
}
