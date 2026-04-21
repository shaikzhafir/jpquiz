/**
 * Convert Anki .apkg to jpquiz pack JSON.
 *
 * Uses `anki-reader` (`readAnkiPackage`) to read the `.apkg`; `wanakana` for kana→romaji.
 *
 * iKnow-style decks store **vocabulary** (`item`) and **sample sentences** (`sentence`)
 * on *different* notes. Vocab rows usually have no sentence text—this script can **link**
 * each item to the shortest `sentence` note whose Expression contains that word
 * (`--link-examples`, default on).
 *
 * Usage:
 *   node scripts/convert-apkg.mjs --input "./deck.apkg" --pack-id mydeck
 *
 * Multiple decks: use a unique `--pack-id` per file; manifests merge into
 * `public/data/packs/anki.manifest.json` (replacing only packs with the same id prefix).
 *
 * Options:
 *   --input <path>       .apkg file (required)
 *   --out <dir>          Output directory (default: ./public/data/packs)
 *   --pack-id <id>       Base id slug (default: from filename)
 *   --only <all|item|sentence>
 *   --chunk-size <n>
 *   --no-link-examples   Do not attach sentence notes to vocabulary items
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAnkiPackage } from "anki-reader";
import { toRomaji } from "wanakana";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    input: "",
    outDir: path.join(repoRoot, "public", "data", "packs"),
    packId: "",
    only: "all",
    chunkSize: 400,
    linkExamples: true,
    kanaDuplicates: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) out.input = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) out.outDir = path.resolve(argv[++i]);
    else if (a === "--pack-id" && argv[i + 1]) out.packId = argv[++i];
    else if (a === "--only" && argv[i + 1]) out.only = String(argv[++i]).toLowerCase();
    else if (a === "--chunk-size" && argv[i + 1])
      out.chunkSize = Math.max(200, Number(argv[++i]) || 400);
    else if (a === "--no-link-examples") out.linkExamples = false;
    else if (a === "--no-kana-duplicates") out.kanaDuplicates = false;
  }
  if (!out.input) {
    console.error("Missing --input path/to.apkg");
    process.exit(1);
  }
  if (!out.packId) {
    const base = path.basename(out.input, path.extname(out.input));
    out.packId = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  }
  return out;
}

function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function primaryEnglishMeaning(meaningRaw) {
  const t = stripHtml(meaningRaw);
  const firstLine = t.split(/\n+/)[0] ?? t;
  return firstLine.split("|")[0].trim() || t.slice(0, 200);
}

function glossList(meaningRaw) {
  const primary = primaryEnglishMeaning(meaningRaw);
  if (!primary) return [];
  const rest = stripHtml(meaningRaw)
    .split(/\n+/)[0]
    ?.split("|")
    .slice(1)
    .map((x) => x.trim())
    .filter(Boolean);
  return [primary, ...(rest ?? [])].slice(0, 8);
}

function normalizeRomaji(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[']/g, "");
}

function isAsciiRomaji(s) {
  return (
    /^[a-z0-9.\s'’-]+$/i.test(s) &&
    !/[\u3040-\u30ff\u4e00-\u9fff\u3400-\u4dbf]/u.test(s)
  );
}

function rebToRomajiVariants(kana) {
  const t = stripHtml(kana).replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/u.test(t)) return [];
  const compact = normalizeRomaji(toRomaji(t.replace(/\s+/g, "")));
  const spaced = normalizeRomaji(
    t
      .split(/\s+/)
      .map((chunk) => toRomaji(chunk))
      .join(" "),
  );
  const out = [];
  if (compact && isAsciiRomaji(compact)) out.push(compact);
  if (spaced && isAsciiRomaji(spaced) && spaced !== compact) out.push(spaced);
  return [...new Set(out)];
}

function detectScript(surface) {
  const plain = stripHtml(surface);
  if (/\p{Script=Han}/u.test(plain)) return "kanji";
  if (/[\u30a1-\u30fa\u30fd-\u30ff\u31f0-\u31ff]/u.test(plain)) return "katakana";
  return "hiragana";
}

function hasJapanese(plain) {
  return /[\u3041-\u3096\u30a1-\u30fa\u30fd-\u30ff\u4e00-\u9fff]/u.test(plain);
}

function modelFieldNames(model) {
  const flds = [...model.flds].sort((a, b) => a.ord - b.ord);
  return flds.map((f) => f.name);
}

function splitFlds(flds, n) {
  const parts = flds.split("\x1f");
  while (parts.length < n) parts.push("");
  return parts;
}

function fieldMapFromNames(names) {
  const idx = Object.fromEntries(names.map((n, i) => [n, i]));
  return {
    expression: idx.Expression ?? idx.expression ?? idx.Word ?? idx.Front,
    meaning: idx.Meaning ?? idx.meaning ?? idx.Back,
    reading: idx.Reading ?? idx.reading ?? idx.Kana,
    iknowType: idx.iKnowType ?? idx.IKnowType,
  };
}

function parseModels(modelsJson) {
  const raw = JSON.parse(modelsJson);
  const out = new Map();
  for (const [id, m] of Object.entries(raw)) {
    out.set(Number(id), m);
  }
  return out;
}

function noteToCard(noteRow, models, opts) {
  const nid = noteRow[0];
  const mid = noteRow[1];
  const flds = noteRow[2];
  const model = models.get(mid);
  if (!model) return null;

  const names = modelFieldNames(model);
  const parts = splitFlds(flds, names.length);
  const fm = fieldMapFromNames(names);

  if (fm.expression == null) return null;

  const expressionRaw = parts[fm.expression] ?? "";
  const meaningRaw = fm.meaning != null ? (parts[fm.meaning] ?? "") : "";
  const readingRaw = fm.reading != null ? (parts[fm.reading] ?? "") : "";
  const readingPlain = stripHtml(readingRaw).replace(/\s+/g, " ").trim();
  const iknowType =
    fm.iknowType != null ? String(parts[fm.iknowType] ?? "").toLowerCase() : "";

  if (opts.only === "item" && iknowType && iknowType !== "item") return null;
  if (opts.only === "sentence" && iknowType && iknowType !== "sentence")
    return null;

  const prompt = stripHtml(expressionRaw);
  if (!prompt || !hasJapanese(prompt)) return null;

  const fromReading = rebToRomajiVariants(readingRaw);
  const fromExpr =
    fromReading.length === 0 && !/\p{Script=Han}/u.test(prompt)
      ? rebToRomajiVariants(expressionRaw)
      : [];
  const readingsRomaji = [...new Set([...fromReading, ...fromExpr])].filter(
    Boolean,
  );
  if (readingsRomaji.length === 0) return null;

  const meaningsEn = glossList(meaningRaw);
  if (meaningsEn.length === 0) return null;

  const script = detectScript(prompt);

  const card = {
    id: `anki-${nid}`,
    prompt,
    readingsRomaji,
    meaningsEn,
  };

  if (iknowType === "sentence") {
    card.exampleJa = prompt;
    card.exampleEn = primaryEnglishMeaning(meaningRaw);
    if (readingPlain) card.exampleReading = readingPlain;
  }

  return {
    card,
    script,
    iknowType,
    exprPlain: prompt,
    readingPlain,
  };
}

function findSentenceForItem(exprPlain, sentenceRows) {
  if (!exprPlain || exprPlain.length < 2) return null;
  const hits = sentenceRows.filter((s) => s.exprPlain.includes(exprPlain));
  if (!hits.length) return null;
  return hits.reduce((a, b) =>
    a.exprPlain.length <= b.exprPlain.length ? a : b,
  );
}

function hasKanji(s) {
  return /\p{Script=Han}/u.test(s);
}

function detectKanaScript(reading) {
  if (/[\u30a1-\u30fa\u30fd-\u30ff\u31f0-\u31ff]/u.test(reading)) return "katakana";
  return "hiragana";
}

/**
 * For vocab items whose prompt contains kanji, emit a second card that
 * uses the kana Reading as the prompt. Gives you hiragana/katakana drills
 * over every vocab entry, not just the handful of pure-kana lemmas.
 */
function buildKanaDuplicates(cardsWithMeta) {
  const dupes = [];
  for (const row of cardsWithMeta) {
    if (!row) continue;
    if (row.iknowType !== "item") continue;
    const { card, readingPlain } = row;
    if (!readingPlain) continue;
    if (!hasKanji(card.prompt)) continue;
    if (readingPlain === card.prompt) continue;
    const dupCard = {
      id: `${card.id}-kana`,
      prompt: readingPlain,
      readingsRomaji: card.readingsRomaji,
      meaningsEn: card.meaningsEn,
    };
    if (card.exampleJa) dupCard.exampleJa = card.exampleJa;
    if (card.exampleReading) dupCard.exampleReading = card.exampleReading;
    if (card.exampleEn) dupCard.exampleEn = card.exampleEn;
    dupes.push({
      card: dupCard,
      script: detectKanaScript(readingPlain),
      iknowType: "item",
      exprPlain: readingPlain,
      readingPlain,
    });
  }
  return dupes;
}

function linkItemExamples(cardsWithMeta, sentenceRows, enabled) {
  if (!enabled || sentenceRows.length === 0) return;
  for (const row of cardsWithMeta) {
    if (!row) continue;
    const { card, iknowType } = row;
    if (card.exampleJa) continue;
    if (iknowType && iknowType !== "item") continue;
    const hit = findSentenceForItem(row.exprPlain, sentenceRows);
    if (!hit) continue;
    card.exampleJa = hit.exampleJa;
    card.exampleEn = hit.exampleEn;
    if (hit.exampleReading) card.exampleReading = hit.exampleReading;
  }
}

function flushChunk(outDir, basePackId, script, part, cards, manifestRows) {
  const id = `${basePackId}-${script}-${String(part).padStart(4, "0")}`;
  const pack = {
    id,
    title: `Anki: ${basePackId} (${script} ${part})`,
    revision: 1,
    script,
    cards,
  };
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(pack));
  manifestRows.push({
    id,
    title: pack.title,
    script,
    groupId: basePackId,
    groupTitle:
      basePackId === "core2000"
        ? "Core 2000 (Anki)"
        : `Anki: ${basePackId.replace(/-/g, " ")}`,
  });
}

function purgeOldPacksForPrefix(outDir, packId) {
  const overlayPath = path.join(outDir, "anki.manifest.json");
  const prefix = `${packId}-`;
  let existing = [];
  if (fs.existsSync(overlayPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(overlayPath, "utf8")).packs ?? [];
    } catch {
      existing = [];
    }
  }
  for (const p of existing) {
    if (p.id.startsWith(prefix)) {
      const fp = path.join(outDir, `${p.id}.json`);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  }
  return existing.filter((p) => !p.id.startsWith(prefix));
}

function writeAnkiManifest(outDir, keptPacks, newRows) {
  const overlayPath = path.join(outDir, "anki.manifest.json");
  const merged = [...keptPacks, ...newRows];
  fs.writeFileSync(
    overlayPath,
    JSON.stringify({ version: 1, packs: merged }, null, 2),
  );
  return { overlayPath, keptCount: keptPacks.length, newCount: newRows.length };
}

async function openNotesDb(apkgPath) {
  const buf = fs.readFileSync(apkgPath);
  const { collection } = await readAnkiPackage(new Blob([buf]));
  const db = collection.getRawCollection();
  const colRow = db.exec("SELECT models FROM col LIMIT 1");
  if (!colRow.length) throw new Error("Empty collection");
  const models = parseModels(colRow[0].values[0][0]);
  const noteRows = db.exec("SELECT id, mid, flds FROM notes");
  if (!noteRows.length) throw new Error("No notes");
  return { db, models, rows: noteRows[0].values };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.input)) {
    console.error(`Not found: ${opts.input}`);
    process.exit(1);
  }
  fs.mkdirSync(opts.outDir, { recursive: true });

  const keptPacks = purgeOldPacksForPrefix(opts.outDir, opts.packId);

  const { db, models, rows } = await openNotesDb(opts.input);

  const parsed = [];
  for (const row of rows) {
    const p = noteToCard(row, models, { only: opts.only });
    if (p) parsed.push(p);
  }

  const sentenceRows = parsed
    .filter((p) => p.iknowType === "sentence")
    .map((p) => ({
      exprPlain: stripHtml(p.card.exampleJa ?? p.card.prompt),
      exampleJa: p.card.exampleJa ?? p.card.prompt,
      exampleEn: p.card.exampleEn ?? "",
      exampleReading: p.card.exampleReading ?? "",
    }))
    .filter((s) => s.exprPlain.length > 0);

  linkItemExamples(parsed, sentenceRows, opts.linkExamples);

  let kanaDupeCount = 0;
  if (opts.kanaDuplicates) {
    const dupes = buildKanaDuplicates(parsed);
    kanaDupeCount = dupes.length;
    parsed.push(...dupes);
  }

  const buffers = { hiragana: [], katakana: [], kanji: [] };
  const part = { hiragana: 0, katakana: 0, kanji: 0 };
  const manifestRows = [];

  const flushIfNeeded = (script) => {
    const buf = buffers[script];
    while (buf.length >= opts.chunkSize) {
      part[script] += 1;
      const chunk = buf.splice(0, opts.chunkSize);
      flushChunk(opts.outDir, opts.packId, script, part[script], chunk, manifestRows);
    }
  };

  for (const p of parsed) {
    buffers[p.script].push(p.card);
    flushIfNeeded(p.script);
  }

  for (const script of ["hiragana", "katakana", "kanji"]) {
    const buf = buffers[script];
    if (buf.length > 0) {
      part[script] += 1;
      flushChunk(opts.outDir, opts.packId, script, part[script], buf.splice(0), manifestRows);
    }
  }

  db.close();

  if (manifestRows.length === 0) {
    console.error("No cards exported. Try --only all or check deck fields.");
    process.exit(1);
  }

  const { overlayPath, keptCount, newCount } = writeAnkiManifest(
    opts.outDir,
    keptPacks,
    manifestRows,
  );

  const linked = parsed.filter(
    (p) => p.card.exampleJa && p.iknowType === "item",
  ).length;
  console.log(
    `Exported ${parsed.length} cards → ${manifestRows.length} pack file(s).`,
  );
  console.log(
    `Examples: sentence notes=${sentenceRows.length}; vocab cards with linked example=${linked}.`,
  );
  if (opts.kanaDuplicates) {
    console.log(`Kana duplicates added (kanji items → kana prompt): ${kanaDupeCount}.`);
  }
  console.log(
    `Merged ${overlayPath} (${keptCount} other pack(s) + ${newCount} for "${opts.packId}").`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
