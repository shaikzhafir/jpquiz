/**
 * Split a large jpquiz pack JSON into multiple files (same id prefix pattern as convert-apkg).
 *
 * Usage:
 *   node scripts/split-pack-json.mjs --file public/data/packs/core2000-kanji-0001.json --chunk-size 400
 *
 * Replaces one file with N numbered parts; update anki.manifest.json afterward (or use --update-manifest).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { file: "", chunkSize: 400, updateManifest: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" && argv[i + 1]) out.file = path.resolve(argv[++i]);
    else if (a === "--chunk-size" && argv[i + 1])
      out.chunkSize = Math.max(50, Number(argv[++i]) || 400);
    else if (a === "--update-manifest") out.updateManifest = true;
  }
  return out;
}

function splitOne(absFile, chunkSize) {
  const dir = path.dirname(absFile);
  const raw = fs.readFileSync(absFile, "utf8");
  const data = JSON.parse(raw);
  const { id, script, revision = 1, cards } = data;
  if (!id || !script || !Array.isArray(cards)) {
    throw new Error(`Invalid pack JSON: ${absFile}`);
  }
  const m = String(id).match(/^(.+)-(\d{4})$/);
  if (!m) throw new Error(`Pack id must end with -NNNN: ${id}`);
  const idPrefix = m[1];

  if (cards.length <= chunkSize) {
    console.log(`Skip (≤${chunkSize} cards): ${id}`);
    return { idPrefix, script, files: [path.basename(absFile)] };
  }

  const parts = Math.ceil(cards.length / chunkSize);
  fs.unlinkSync(absFile);

  const written = [];
  for (let i = 0; i < parts; i++) {
    const chunk = cards.slice(i * chunkSize, (i + 1) * chunkSize);
    const part = i + 1;
    const newId = `${idPrefix}-${String(part).padStart(4, "0")}`;
    const sub = idPrefix.startsWith("core2000-")
      ? idPrefix.slice("core2000-".length)
      : idPrefix.replace(/-/g, " ");
    const title =
      idPrefix.startsWith("core2000") || idPrefix.includes("core2000")
        ? `Anki: Core 2000 — ${sub} · part ${part}/${parts}`
        : `Anki: ${sub} — ${script} · part ${part}/${parts}`;

    const pack = {
      id: newId,
      title,
      revision,
      script,
      cards: chunk,
    };

    const outName = `${newId}.json`;
    fs.writeFileSync(path.join(dir, outName), JSON.stringify(pack));
    written.push(outName);
  }
  console.log(`Split ${id} (${cards.length} cards) → ${written.length} file(s).`);
  return { idPrefix, script, files: written };
}

function updateAnkiManifest(outDir, idPrefix, newBasenames) {
  const overlayPath = path.join(outDir, "anki.manifest.json");
  let existing = [];
  if (fs.existsSync(overlayPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(overlayPath, "utf8")).packs ?? [];
    } catch {
      existing = [];
    }
  }
  const prefix = `${idPrefix}-`;
  const kept = existing.filter((p) => !p.id.startsWith(prefix));
  const groupId = idPrefix.split("-")[0] ?? idPrefix;
  const groupTitle =
    groupId === "core2000" ? "Core 2000 (Anki)" : `Anki: ${idPrefix}`;
  const newRows = newBasenames.map((bn) => {
    const pack = JSON.parse(fs.readFileSync(path.join(outDir, bn), "utf8"));
    return {
      id: pack.id,
      title: pack.title,
      script: pack.script,
      groupId,
      groupTitle,
    };
  });
  newRows.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
  );
  const merged = [...kept, ...newRows];
  merged.sort((a, b) => {
    const ga = a.groupTitle ?? "";
    const gb = b.groupTitle ?? "";
    if (ga !== gb) return ga.localeCompare(gb);
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  });
  fs.writeFileSync(
    overlayPath,
    JSON.stringify({ version: 1, packs: merged }, null, 2),
  );
  console.log(`Updated ${overlayPath} (${newRows.length} pack(s) for ${idPrefix}).`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.file) {
    console.error("Usage: node scripts/split-pack-json.mjs --file <pack.json> [--chunk-size 400] [--update-manifest]");
    process.exit(1);
  }
  if (!fs.existsSync(opts.file)) {
    console.error(`Not found: ${opts.file}`);
    process.exit(1);
  }
  const { idPrefix, files } = splitOne(opts.file, opts.chunkSize);
  if (opts.updateManifest) {
    const outDir = path.dirname(opts.file);
    updateAnkiManifest(outDir, idPrefix, files);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
