import type { PackCard } from "@/types/pack";

/** Primary English line for display (first gloss or joined list). */
export function formatEnglishGloss(card: PackCard): string | null {
  const m = card.meaningsEn?.filter(Boolean) ?? [];
  if (m.length === 0) return null;
  return m.join(" · ");
}

export function hasExampleSentence(card: PackCard): boolean {
  return Boolean(
    card.exampleJa?.trim() && card.exampleEn?.trim(),
  );
}
