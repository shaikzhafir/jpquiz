import type { KanjiSubMode, PackCard, Script } from "@/types/pack";

export function displayExpectedAnswers(
  card: PackCard,
  script: Script,
  kanjiSubMode: KanjiSubMode,
): string {
  if (script === "kanji" && kanjiSubMode === "meaning") {
    return (card.meaningsEn ?? []).join(" • ");
  }
  return (card.readingsRomaji ?? []).join(" • ");
}
