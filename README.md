# JP Quiz

Vite + React + TypeScript quiz for **hiragana**, **katakana**, and **kanji** (reading in romaji or English meaning). Card data lives in JSON packs under `public/data/packs/`.

## Scripts

```bash
npm install
npm run dev          # local dev
npm run build        # production bundle -> dist/
npm run preview      # preview the production build
npm run pages:dev    # serve dist/ like Cloudflare Pages (run build first)
npm run pages:deploy # deploy dist/ to Cloudflare Pages (needs wrangler auth)
npm run convert:apkg -- --input "./YourDeck.apkg"  # Anki → jpquiz (see below)
```

## Anki `.apkg` → jpquiz packs

Anki packages are a **ZIP** with a **SQLite** collection (`collection.anki2` / `collection.anki21`). This app does **not** run the Anki scheduler in the browser; you **convert** decks to JSON packs (same shape as hand-written packs).

The converter uses **[anki-reader](https://www.npmjs.com/package/anki-reader)** (`readAnkiPackage`) so we do not maintain our own unzip/SQLite glue. Install deps with `npm install` (if npm complains about `anki-reader`’s old TypeScript peer range, use `npm install --legacy-peer-deps`).

```bash
npm run convert:apkg -- --input "./Japanese_Core_2000_Step_01-10_FULL_PACKAGE.apkg" --pack-id core2000
```

### Why a “vocab” row often had no sample sentence

In **Japanese Core 2000 / iKnow** exports, **words** and **sample sentences** are stored on **different notes**: `iKnowType: item` (e.g. 見る) vs `iKnowType: sentence` (full line + translation). The vocab note’s fields usually do **not** include the long sentence—that lives on the sentence note. Anki shows both through **templates / separate cards**, not as one flat row.

The converter therefore **links** vocabulary items to the **shortest** `sentence` note whose Expression **contains** that word (default **`--link-examples`**). Use **`--no-link-examples`** to disable that behaviour.

### Multiple Anki decks

Use a **unique `--pack-id` per deck** (e.g. `core2000`, `genki-ch03`). Each run **removes only** packs whose ids start with `<pack-id>-` from `anki.manifest.json` and deletes those JSON files, then **appends** the new export. Other decks’ entries in `anki.manifest.json` are left in place so you can stack several conversions before `npm run build`.

To **split an existing oversized JSON pack** (for example after an old conversion used a large chunk size), use:

```bash
node scripts/split-pack-json.mjs --file public/data/packs/core2000-kanji-0001.json --chunk-size 400 --update-manifest
```

### Options

| Flag | Purpose |
|------|---------|
| `--pack-id` | Prefix for output ids (`<pack-id>-kanji-0001`, …). Required to tell decks apart. |
| `--only item\|sentence\|all` | Filter by `iKnowType` when present. |
| `--chunk-size` | Max cards per JSON file per script (default 400). |
| `--no-link-examples` | Do not attach sentence notes to vocab items. |
| `--no-kana-duplicates` | Skip emitting kana-prompt duplicates of kanji vocab items (see below). |

**Kana duplicates (on by default).** For every `item` whose Expression contains kanji and whose Reading is non-empty, the converter emits a second card with the kana Reading as the prompt. So 見る (kanji pack) is also drilled as みる (hiragana pack). This gives every vocab entry a hiragana/katakana drill — otherwise the Core 2000 hiragana bucket only has the handful of pure-kana lemmas (それ, これ, おもちゃ, …).

Output: `public/data/packs/<pack-id>-<script>-0001.json` plus **`anki.manifest.json`**. [`src/lib/loadManifest.ts`](src/lib/loadManifest.ts) merges `manifest.json` + optional `anki.manifest.json`.

**Field mapping** (see [`scripts/convert-apkg.mjs`](scripts/convert-apkg.mjs)): **Expression**, **Meaning**, **Reading**, **iKnowType**; fallback **Front** / **Back**. HTML and `[sound:…]` are stripped.

**Romaji**: from **Reading**, with spaced + compact variants when useful; kana-only prompts can fall back to Expression.

`.apkg` files are **gitignored**; commit generated JSON if you want packs in the repo.

### Other useful npm libraries (Anki / `.apkg`)

| Package | Notes |
|---------|--------|
| [anki-reader](https://www.npmjs.com/package/anki-reader) | **Used here.** Reads `.apkg` / collection in Node or browser; exposes `sql.js` DB. |
| [anki-apkg-parser](https://www.npmjs.com/package/anki-apkg-parser) | Unpack + typed helpers + raw SQL; native `sqlite` dependency. |
| [@seangenabe/apkg](https://www.npmjs.com/package/@seangenabe/apkg) | Read/write apkg (older; uses `better-sqlite3` / `sql.js`). |
| [anki](https://www.npmjs.com/package/anki) (`anki.js`) | Legacy, tiny API around sqlite-in-zip. |


## Cloudflare Pages

**Dashboard (Git integration)**

- Framework preset: none (static)
- **Build command:** `npm run build`
- **Build output directory:** `dist`

**CLI**

```bash
npm run build
npx wrangler pages deploy ./dist --project-name=<your-pages-project>
```

Wrangler is configured in [`wrangler.toml`](wrangler.toml) with `pages_build_output_dir = "dist"`. SPA fallback for client-side routing uses [`public/_redirects`](public/_redirects) (`/* /index.html 200`).

## Packs

- Manifest: [`public/data/packs/manifest.json`](public/data/packs/manifest.json)
- Each pack file: `public/data/packs/<id>.json` matching manifest `id`.
- Bump optional `revision` on a pack when you change cards so saved in-browser sessions reset cleanly.

Each **card** supports:

| Field | Role |
|--------|------|
| `prompt` | Shown to the user (kana / kanji / phrase) |
| `readingsRomaji` | Acceptable romaji answers (required for hiragana / katakana / kanji reading mode) |
| `meaningsEn` | English glosses (required for kanji *meaning* mode; also shown after every submit) |
| `exampleJa` / `exampleEn` | Optional sample sentence + translation (shown after submit) |

This app only reads **your** JSON packs; dictionary or deck dumps must be converted into the shape above (see the Anki converter).
