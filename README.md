# Wardrobe Studio

A personal fashion journal and AI stylist that plans outfits **only from clothes you actually own** – around the weather, your plans, your laundry and your taste.

- **Describe your wardrobe in plain English.** “A dark brown, almost charcoal blazer, relaxed fit, for dark academia and smart-casual outfits” becomes a structured garment record. Several garments in one paragraph become several records. You review, correct, de-duplicate and approve everything before it's saved.
- **Every garment is drawn.** A local SVG illustration system draws each piece from its attributes – wide-leg vs slim trousers, overcoats vs blazers, chelsea boots vs loafers, lapels, collars, sleeves, lengths, patterns (plaid, herringbone, pinstripe…) and fabric textures (tweed, corduroy, denim, knit…). Outfits are shown as clothing boards.
- **A stylist that can't make things up.** Claude suggests outfits, plans weeks, swaps single pieces and adjusts looks (smarter, warmer, more comfortable…). The app – not the model – enforces the rules: every garment must exist and be available, outfits must be complete (one pair of shoes, a bottom, something on the torso…), and your exclusions and “never combine” rules hold. Invalid ideas are discarded, Claude gets one chance to repair them, and the rest is filled by the rule-based stylist.
- **Works fully without an API key.** A deterministic rule-based stylist (clearly labelled “Rule-based”), offline text/CSV import, the planner, laundry, illustrations, history and backups all work with no paid services.
- **Weather and plans shape the outfit.** Open-Meteo forecasts (morning / afternoon / evening, apparent temperature, rain, wind) drive layers, outerwear and shoes. Add activities with times, dress codes and indoor/outdoor settings – or just describe your day.
- **Laundry that matches real life.** Clean, worn, in the wash, drying, needs ironing, needs repair, packed, unavailable, retired. Marking an outfit worn applies per-category (and per-garment) wash-after-N-wears rules – a t-shirt goes to the wash, an overcoat doesn't.
- **A weekly planner** with locking, single-day regeneration, saved-outfit reuse, manual weather overrides and flags when a planned garment becomes unavailable (you choose the replacement – nothing changes silently).
- **Personalisation you can see**: a style profile in your own words, preferences, enforced rules, and feedback (love it, not my style, too warm, too formal, don't combine these again) with permanent / 30-day / one-off scopes. Plus an optional wardrobe-gap analysis grounded in what you own.

Everything is stored in a local SQLite database. Nothing leaves your machine except weather lookups (coordinates only) and, if you enable it, requests to the Anthropic API.

---

## Quick start

Requirements: **Node.js 20.19+** (22 LTS recommended) and npm. Works on Windows, macOS and Linux.

```bash
npm install
npm run build
npm start            # http://127.0.0.1:3000
```

For development with hot reload: `npm run dev`.

On first launch you can describe a few garments, add them one at a time, import a CSV, or **load the sample wardrobe** to explore.

### Enabling Claude (optional)

```bash
cp .env.example .env.local
# then set ANTHROPIC_API_KEY=… in .env.local and restart
```

Settings → *Claude stylist* shows the status and has a **Test connection** button. You can switch Claude off there at any time.

### Weather (optional)

Settings → *Location & weather*: search for your town (Open-Meteo geocoding) or enter coordinates manually. No account or key is needed. Without a location, the stylist assumes typical seasonal weather and you can set any day's weather by hand in the planner.

---

## Configuration

All settings are optional – see [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Enables Claude. Read on the server only; never sent to the browser. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model for styling, imports and planning. |
| `ANTHROPIC_EFFORT` | `medium` | Reasoning effort (`low`…`max`); empty to omit. |
| `ANTHROPIC_REFUSAL_FALLBACK` | `default` | Uses the API's server-side refusal fallback; set `off` for models that don't support it. |
| `AI_DISABLED` | – | `1` switches Claude off regardless of other settings. |
| `DATABASE_PATH` | `./data/wardrobe.db` | SQLite file (created and migrated automatically). |
| `UPLOADS_DIR` | `./data/uploads` | Garment photos. |
| `ALLOWED_HOSTS` | – | Extra host names allowed to reach the API (see *Security*). |
| `OPEN_METEO_FORECAST_URL`, `OPEN_METEO_GEOCODING_URL` | Open-Meteo | Endpoint overrides. |

---

## Using it

| Section | What it's for |
| --- | --- |
| **Home** | Today's outfit, weather, plans, the next six days and laundry at a glance. |
| **Wardrobe** | Search, filter (category, status, season) and sort; quick status changes on every card; garment detail with illustration, photo, attributes, wear history and saved outfits; add / edit / duplicate / delete / redraw; **Import** (natural language or CSV) and CSV export. |
| **Outfits** | The stylist (free text, occasion chips, date, must-include / leave-out pieces); saved, favourite, recent and archived outfits; worn history (with undo); build an outfit by hand. Every outfit can be saved, renamed, tagged, duplicated, archived, planned, marked worn, adjusted, or have a single piece swapped. |
| **Planner** | Seven days (rolling from today by default, or calendar weeks). Generate the week, lock days, regenerate one day, use a saved outfit, edit activities, describe your day, override the weather. |
| **Laundry** | Worn → in the wash → drying → (ironing) → ready, individually or in bulk; repairs; packed/away items; pieces due a wash soon. |
| **Style profile** | Your style in your own words, aesthetics, colours, fits, materials, formality, comfort, boldness, repetition; enforced rules; feedback history; gap analysis. |
| **Settings** | Location, units, planner layout, Claude, wash-after-wear defaults per category, backup / restore / CSV. |

### How suggestions are made

1. The server builds a context: available garments, the day's weather (for the hours you're out), activities and dress codes, your profile, active rules, recent feedback, and recently worn or planned outfits.
2. If Claude is enabled, it receives that context and returns outfits as **structured output** (validated with Zod by the SDK and again by the app).
3. Each outfit is checked against hard constraints: garments exist, are available, appear once, form a complete outfit, include required pieces, avoid excluded pieces, and respect “never combine” / “avoid” rules. For week plans, pieces that would need washing before they're due are also rejected.
4. Failures trigger one repair attempt with the specific errors; anything still invalid is replaced by the rule-based stylist. Rate limits, network errors, refusals, malformed output and missing credentials all fall back the same way, with a notice explaining why.
5. The rule-based stylist searches combinations and scores them on formality, warmth vs. the forecast, rain/wind suitability, season, colour harmony, pattern balance, your preferences, rotation (resting recently worn pieces), feedback and repetition. It's deterministic.

Personalisation comes from stored preferences, rules, feedback and history – no model is trained.

### Care defaults

Wash-after-N-wears per category (editable in Settings; 0 = never automatic), overridable per garment. Defaults: tops 1, shirts 2 (iron), knitwear 6, trousers 5, shorts 3, skirts 4, dresses 2 (iron), formalwear 6 (iron), outerwear / footwear / accessories never automatic.

---

## Data, backup and restore

- **Database**: SQLite via Drizzle ORM with versioned SQL migrations in [`drizzle/`](drizzle), applied automatically on start. Foreign keys are on; multi-step writes use transactions.
- **History is preserved**: outfit items and wear-log items store a snapshot of each garment, so outfits and history still render (and are drawn) after a garment is edited or deleted. Planned outfits and actual wear logs are separate records.
- **Full backup**: Settings → *Full backup (JSON)* (or `GET /api/export/backup`; `?photos=0` to skip photos). Contains every table plus photos as base64.
- **Restore**: Settings → *Restore from backup…* The file is schema-validated first and applied in a single transaction (all or nothing). Illustrations are regenerated rather than trusted from the file.
- **CSV**: export from the Wardrobe page; import via Wardrobe → Import → CSV (rows go through the same review screen and duplicate checks).
- To move to another computer, copy the `data/` folder or use a JSON backup.

## Security notes

Wardrobe Studio is designed for a single person on their own computer:

- The server binds to `127.0.0.1` by default (`npm start` / `npm run dev`).
- The API only answers requests whose `Host` is localhost (blocks DNS-rebinding) and refuses cross-site writes (checks `Origin` / `Sec-Fetch-Site`). To use it from another device, start with `npm start -- -H 0.0.0.0` and set `ALLOWED_HOSTS` – there are no accounts, so only do this on a network you trust.
- All input is validated with Zod on the server. Photos are limited to 5 MB, identified by their bytes (JPEG/PNG/WebP only), stored under random names, and served with `nosniff` and a restrictive CSP; names are validated against path traversal.
- Illustrations are generated from sanitised values only and served as images. CSV exports neutralise spreadsheet formulas.
- The Anthropic API key is only read server-side.

---

## Development

```bash
npm run dev          # dev server on 127.0.0.1:3000
npm run lint         # ESLint (next/core-web-vitals + TypeScript)
npm run typecheck    # route types + tsc
npm test             # Vitest unit/integration tests (in-memory SQLite, no network, AI mocked)
npm run test:e2e     # production build + Playwright end-to-end journey (temporary DB, Claude disabled)
npm run db:generate  # create a migration after changing src/server/db/schema.ts
```

The e2e suite needs a Chromium for Playwright (`npx playwright install chromium` if you don't have one).

### Project layout

```
src/
  app/                 Next.js App Router pages and /api route handlers
  components/          UI (garment cards & editor, outfit board & card, planner, laundry…)
  lib/                 Shared, pure logic: domain vocabulary, schemas, colours, dates,
                       outfit rules, weather needs, CSV, and the SVG illustration renderer
  server/
    db/                Drizzle schema + connection/migrations
    services/          Garments, outfits, plans, wear, preferences, settings, backup, import
    stylist/           Context builder, rule-based engine, AI orchestration, gap analysis
    ai/                Anthropic SDK wrapper (structured outputs, error mapping) and prompts
    weather/           Open-Meteo client, caching, summaries
    import/            Offline garment and activity parsers
  proxy.ts             Local-only / same-origin guard for the API
drizzle/               SQL migrations
tests/unit, tests/e2e  Vitest and Playwright suites
```

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Drizzle ORM + better-sqlite3, Zod 4, the official Anthropic TypeScript SDK, Vitest and Playwright. Fonts (Fraunces, Inter) are self-hosted via Fontsource, so builds work offline.

## Known limitations

- **No AI image generation.** All visuals are the local SVG illustrations (plus your own photos). They're stylised drawings, not photorealistic renders.
- **Without Claude**, free-text understanding is keyword-based: the offline import parser recognises common garment, colour, material, fit and pattern words; the stylist reads occasion and “use / avoid my …” phrases from requests but not nuanced instructions. Free-text outfit adjustments (“swap in something burgundy”) need Claude; the quick adjustments work without it.
- The Claude integration is covered by tests with a mocked SDK client; it was not exercised against the live API while building this (no key was available).
- Weather periods use the location's local time (morning 7–11, afternoon 12–17, evening 18–22). Weather overrides are entered in °C and km/h.
- Single user, no accounts or sync; one wardrobe per database file.
