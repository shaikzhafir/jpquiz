import type { KanjiSubMode, Script } from "@/types/pack";

type Props = {
  script: Script;
  onScript: (s: Script) => void;
  kanjiSubMode: KanjiSubMode;
  onKanjiSubMode: (m: KanjiSubMode) => void;
  disabled?: boolean;
};

const scripts: { id: Script; label: string }[] = [
  { id: "hiragana", label: "Hiragana" },
  { id: "katakana", label: "Katakana" },
  { id: "kanji", label: "Kanji" },
];

export function ModePicker({
  script,
  onScript,
  kanjiSubMode,
  onKanjiSubMode,
  disabled,
}: Props) {
  return (
    <fieldset className="setup-block" disabled={disabled}>
      <legend className="legend">Script</legend>
      <div className="chips">
        {scripts.map((s) => (
          <label key={s.id} className="chip">
            <input
              type="radio"
              name="script"
              value={s.id}
              checked={script === s.id}
              onChange={() => onScript(s.id)}
            />
            {s.label}
          </label>
        ))}
      </div>
      {script === "kanji" ? (
        <div className="submode">
          <span className="legend">Kanji prompt</span>
          <div className="chips">
            <label className="chip">
              <input
                type="radio"
                name="kanjiSub"
                checked={kanjiSubMode === "reading"}
                onChange={() => onKanjiSubMode("reading")}
              />
              Reading (romaji)
            </label>
            <label className="chip">
              <input
                type="radio"
                name="kanjiSub"
                checked={kanjiSubMode === "meaning"}
                onChange={() => onKanjiSubMode("meaning")}
              />
              Meaning (English)
            </label>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
