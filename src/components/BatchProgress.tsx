import { useEffect, useRef, useState } from "react";

type Props = {
  batchIndex: number;
  batchLength: number;
  cyclesCompleted: number;
  correctCount: number;
  answeredCount: number;
  packTitle?: string | null;
  onRestart: () => void;
  onEnd: () => void;
};

const CONFIRM_MS = 3000;

export function BatchProgress({
  batchIndex,
  batchLength,
  cyclesCompleted,
  correctCount,
  answeredCount,
  packTitle,
  onRestart,
  onEnd,
}: Props) {
  const [restartArmed, setRestartArmed] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const restartTimer = useRef<number | null>(null);
  const endTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      if (endTimer.current) window.clearTimeout(endTimer.current);
    };
  }, []);

  const armRestart = () => {
    if (restartArmed) {
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      setRestartArmed(false);
      onRestart();
      return;
    }
    setRestartArmed(true);
    if (endArmed) setEndArmed(false);
    restartTimer.current = window.setTimeout(
      () => setRestartArmed(false),
      CONFIRM_MS,
    );
  };

  const armEnd = () => {
    if (endArmed) {
      if (endTimer.current) window.clearTimeout(endTimer.current);
      setEndArmed(false);
      onEnd();
      return;
    }
    setEndArmed(true);
    if (restartArmed) setRestartArmed(false);
    endTimer.current = window.setTimeout(
      () => setEndArmed(false),
      CONFIRM_MS,
    );
  };

  return (
    <div className="progress" aria-live="polite">
      <div className="progress-row">
        <div className="progress-where">
          {packTitle ? <span className="progress-pack">{packTitle}</span> : null}
          <span>round {cyclesCompleted + 1}</span>
        </div>
        <div className="progress-actions">
          <button
            type="button"
            className={`linky${restartArmed ? " pending" : ""}`}
            onClick={armRestart}
            aria-label={restartArmed ? "Tap again to restart set" : "Restart set"}
          >
            {restartArmed ? "Tap to confirm" : "Restart"}
          </button>
          <button
            type="button"
            className={`linky${endArmed ? " pending" : ""}`}
            onClick={armEnd}
            aria-label={endArmed ? "Tap again to end session" : "End session"}
          >
            {endArmed ? "Tap to end" : "End"}
          </button>
        </div>
      </div>
      <div className="progress-row">
        <span className="progress-counter">
          {batchIndex + 1} <span className="muted">of</span> {batchLength}
        </span>
        <span className="progress-score" aria-label="Session score">
          correct {correctCount} <span className="rule-slash">/</span>{" "}
          {answeredCount}
        </span>
      </div>
    </div>
  );
}
