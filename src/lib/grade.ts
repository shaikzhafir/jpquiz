import { toHiragana } from "wanakana";

export function normalizeRomaji(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Canonical form for romaji comparison: convert via wanakana to hiragana so
 * "tu"/"tsu", "si"/"shi", "zi"/"ji", "ti"/"chi", long-vowel macrons, etc.
 * collapse to the same kana. Falls back to the plain normalized string when
 * wanakana can't convert cleanly (e.g. English glosses accidentally passed in).
 */
function canonicalKana(s: string): string {
  const trimmed = normalizeRomaji(s);
  if (!trimmed) return "";
  try {
    return toHiragana(trimmed, { passRomaji: false });
  } catch {
    return trimmed;
  }
}

export function gradeRomaji(
  user: string,
  acceptable: readonly string[],
): boolean {
  const uPlain = normalizeRomaji(user);
  if (!uPlain) return false;
  const uKana = canonicalKana(user);
  for (const a of acceptable) {
    const aPlain = normalizeRomaji(a);
    if (aPlain === uPlain) return true;
    if (canonicalKana(a) === uKana) return true;
  }
  return false;
}

/**
 * Normalize an English gloss for comparison: strip surrounding punctuation,
 * collapse whitespace, drop leading articles ("a ", "an ", "the ") and the
 * dictionary-form verb marker "to ". So "to eat" / "To Eat." / "eat" all match.
 */
export function normalizeEnglish(s: string): string {
  let out = s.toLowerCase().trim();
  out = out.replace(/[.,;:!?"'`()\[\]]/g, "");
  out = out.replace(/\s+/g, " ");
  out = out.replace(/^(?:to|a|an|the)\s+/, "");
  return out.trim();
}

export function gradeEnglish(
  user: string,
  acceptable: readonly string[],
): boolean {
  const u = normalizeEnglish(user);
  if (!u) return false;
  return acceptable.some((a) => normalizeEnglish(a) === u);
}
