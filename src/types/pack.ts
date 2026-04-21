export type Script = "hiragana" | "katakana" | "kanji";

export type KanjiSubMode = "reading" | "meaning";

export type PackCard = {
  id: string;
  prompt: string;
  /** Acceptable romaji readings (hiragana, katakana, or kanji reading mode). */
  readingsRomaji?: string[];
  /**
   * English glosses: used for kanji “meaning” mode grading and shown after
   * submit (with optional example) for every script when present.
   */
  meaningsEn?: string[];
  /** Example sentence in Japanese (shown after submit with `exampleEn`). */
  exampleJa?: string;
  /**
   * Kana reading of the example sentence (whole-sentence hiragana rendering,
   * used as a furigana-substitute when the deck has no per-kanji ruby data).
   */
  exampleReading?: string;
  /** English gloss of the example sentence. */
  exampleEn?: string;
};

export type Pack = {
  id: string;
  title: string;
  /** Bump when card content changes to invalidate saved sessions. */
  revision?: number;
  script: Script;
  cards: PackCard[];
};

export type PackManifestEntry = {
  id: string;
  title: string;
  script: Script;
  /** Packs with the same groupId appear under one heading in the deck picker. */
  groupId?: string;
  groupTitle?: string;
};

export type PackManifest = {
  version: number;
  packs: PackManifestEntry[];
};
