import type { KanjiSubMode, Pack, PackCard, Script } from "@/types/pack";

export function filterCardsForMode(
  pack: Pack,
  script: Script,
  kanjiSubMode: KanjiSubMode,
): PackCard[] {
  if (pack.script !== script) return [];
  if (script === "kanji") {
    if (kanjiSubMode === "meaning") {
      return pack.cards.filter((c) => (c.meaningsEn?.length ?? 0) > 0);
    }
    return pack.cards.filter((c) => (c.readingsRomaji?.length ?? 0) > 0);
  }
  return pack.cards.filter((c) => (c.readingsRomaji?.length ?? 0) > 0);
}
