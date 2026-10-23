# Wardrobe Studio

A personal fashion journal and AI stylist that plans outfits **only from clothes you actually own** – around the weather, your plans, your laundry and your taste.

Runs as a **local web app** (Node.js) and as an **installable Android app** that works offline – see [docs/ANDROID.md](docs/ANDROID.md). AI is optional and **provider-independent**: Anthropic Claude, OpenAI, Google Gemini, or any OpenAI-compatible server (including self-hosted and local models) – see [docs/AI-PROVIDERS.md](docs/AI-PROVIDERS.md).

- **Describe your wardrobe in plain English.** “Black Nike polyester shorts for the gym” becomes a structured garment record (athletic shorts · Nike · polyester · black). Classification is factual – it records what the garment is, in your words, and never assigns a style you didn't mention. Several garments in one paragraph become several records. You review, correct, de-duplicate and approve everything before it's saved.
- **Every garment is drawn.** A local SVG illustration system draws each piece from its attributes – wide-leg vs slim trousers, leggings and track pants, rain jackets vs blazers, sneakers vs boots vs loafers, lapels, collars, sleeves, lengths, patterns (plaid, herringbone, pinstripe…) and fabric textures (tweed, corduroy, denim, knit…). Outfits are shown as clothing boards.
- **A stylist that can't make things up – whichever model you choose.** The AI suggests outfits, plans weeks, swaps single pieces and adjusts looks (smarter, warmer, more comfortable…). The app – not the model – enforces the rules: every garment must exist and be available, outfits must be complete (one pair of shoes, a bottom, something on the torso…), and your exclusions and “never combine” rules hold. Invalid ideas are discarded, the model gets one chance to repair them, and the rest is filled by the rule-based stylist. Every outfit shows which provider and model made it, or “Rule-based”.
- **Pick your AI provider and model.** Settings → *AI providers*: add keys, fetch the live model list, run a real connection test, choose a main model and optionally different models for import, daily styling and weekly planning. Switching never touches your wardrobe, preferences or history.
- **Works fully without an API key.** A deterministic rule-based stylist (clearly labelled “Rule-based”), offline text/CSV import, the planner, laundry, illustrations, history and backups all work with no paid services.
- **Weather and plans shape the outfit.** Open-Meteo forecasts (morning / afternoon / evening, apparent temperature, rain, wind) drive layers, outerwear and shoes. Add activities with times, dress codes and indoor/outdoor settings – or just describe your day.
- **Laundry that matches real life.** Clean, worn, in the wash, drying, needs ironing, needs repair, packed, unavailable, retired. Marking an outfit worn applies per-category (and per-garment) wash-after-N-wears rules – a t-shirt goes to the wash, an overcoat doesn't.
- **A weekly planner** with locking, single-day regeneration, saved-outfit reuse, manual weather overrides and flags when a planned garment becomes unavailable (you choose the replacement – nothing changes silently).
- **A universal stylist, not a house style.** Nothing in the app assumes a look: the default profile is empty, the sample wardrobe carries no style tags, and both stylists work toward *your* stated taste – sportswear, streetwear, tailoring, boho, anything – or, if you haven't stated one, simply toward weather, plans and what goes together.
- **Personalisation you can see**: a style profile in your own words, preferences, enforced rules, and feedback (love it, not my style, too warm, too formal, don't combine these again) with permanent / 30-day / one-off scopes. Plus an optional wardrobe-gap analysis grounded in what you own.

Everything is stored in a local SQLite database. Nothing leaves your machine except weather lookups (coordinates only) and, if you set one up, requests to the AI provider you chose.

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

### AI providers (optional)

Settings → *AI providers*: paste a key for Anthropic, OpenAI or Google Gemini (or add an OpenAI-compatible endpoint such as Ollama, LM Studio, vLLM or OpenRouter), press **Test connection**, then **Use** a model. Keys entered there are stored on the server only, in `data/secrets.json` (mode 600) – never in the database, backups, logs or the browser. Environment variables still work and need no setup:

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY=… (or OPENAI_API_KEY / GEMINI_API_KEY) and restart
```

When a request fails, the notice says *what* failed and from whom – e.g. “OpenAI rejected the request [400, unsupported_value]: …”, “Gemini rejected the API key”, “that model isn't available from Claude”, “Claude's answer was cut off”, or, only for genuine refusals, “Claude declined this request [category: …]” – and the server log has the same line prefixed with `[ai]`. The built-in stylist then answers as usual. Full details: [docs/AI-PROVIDERS.md](docs/AI-PROVIDERS.md).

### Weather (optional)

Settings → *Location & weather*: search for your town (Open-Meteo geocoding) or enter coordinates manually. No account or key is needed. Without a location, the stylist assumes typical seasonal weather and you can set any day's weather by hand in the planner.

---

## Configuration

All settings are optional – see [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | – | Claude key (or OAuth bearer token). Server-side only. |
| `OPENAI_API_KEY` | – | OpenAI key. |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | – | Google Gemini key. |
| `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL` | documented defaults | Initial model until you choose one in Settings. |
| `ANTHROPIC_EFFORT`, `ANTHROPIC_REFUSAL_FALLBACK` | model default, on | Initial Claude settings (migrated from earlier versions). |
| `SECRETS_PATH` | `./data/secrets.json` | Where keys entered in Settings are kept (mode 600). |
| `AI_DISABLED` | – | `1` switches AI off regardless of other settings. |
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
| **Settings** | Location, units, planner layout, AI providers and models, wash-after-wear defaults per category, backup / restore / CSV. |

### How suggestions are made

1. The server builds a context: available garments, the day's weather (for the hours you're out), activities and dress codes, your profile, active rules, recent feedback, and recently worn or planned outfits.
2. If an AI model is configured for the task, it receives that context and returns outfits as **structured output** in the provider's own format (Claude `output_config.format`, OpenAI Structured Outputs, Gemini `responseJsonSchema`, or `response_format` / schema-in-prompt for compatible servers). Every reply is parsed and validated with the same Zod schemas and the hard constraints below, whichever provider sent it. Schemas avoid nullable unions (`""`, `"unspecified"` and `0` mean unknown) so they stay within every provider's documented limits – a test checks every schema.
3. Each outfit is checked against hard constraints: garments exist, are available, appear once, form a complete outfit, include required pieces, avoid excluded pieces, and respect “never combine” / “avoid” rules. For week plans, pieces that would need washing before they're due are also rejected.
4. Failures trigger one repair attempt with the specific errors; anything still invalid is replaced by the rule-based stylist. Rate limits, rejected requests, network errors, refusals, truncated or malformed output and missing credentials all fall back the same way, with a notice that names the actual cause.
5. The rule-based stylist searches combinations and scores them on formality, warmth vs. the forecast, rain/wind suitability, season, colour harmony, pattern balance, your preferences, rotation (resting recently worn pieces), feedback and repetition. It's deterministic.

Personalisation comes from stored preferences, rules, feedback and history – no model is trained.

### Care defaults

Wash-after-N-wears per category (editable in Settings; 0 = never automatic), overridable per garment. Defaults: tops 1, shirts 2 (iron), knitwear 6, trousers 5, shorts 3, skirts 4, dresses 2 (iron), formalwear 6 (iron), outerwear / footwear / accessories never automatic.

---

## Data, backup and restore

- **Database**: SQLite via Drizzle ORM with versioned SQL migrations in [`drizzle/`](drizzle), applied automatically on start. Foreign keys are on; multi-step writes use transactions.
- **History is preserved**: outfit items and wear-log items store a snapshot of each garment, so outfits and history still render (and are drawn) after a garment is edited or deleted. Planned outfits and actual wear logs are separate records.
- **Full backup**: Settings → *Full backup (JSON)* (or `GET /api/export/backup`; `?photos=0` to skip photos). Contains every table plus photos as base64 – but never API keys, and not this device's AI provider settings (a restore keeps them).
- **Restore**: Settings → *Restore from backup…* The file is schema-validated first and applied in a single transaction (all or nothing). Illustrations are regenerated rather than trusted from the file.
- **CSV**: export from the Wardrobe page; import via Wardrobe → Import → CSV (rows go through the same review screen and duplicate checks).
- To move to another computer, copy the `data/` folder or use a JSON backup.

## Security notes

Wardrobe Studio is designed for a single person on their own computer:

- The server binds to `127.0.0.1` by default (`npm start` / `npm run dev`).
- The API only answers requests whose `Host` is localhost (blocks DNS-rebinding) and refuses cross-site writes (checks `Origin` / `Sec-Fetch-Site`). To use it from another device, start with `npm start -- -H 0.0.0.0` and set `ALLOWED_HOSTS` – there are no accounts, so only do this on a network you trust.
- All input is validated with Zod on the server. Photos are limited to 5 MB, identified by their bytes (JPEG/PNG/WebP only), stored under random names, and served with `nosniff` and a restrictive CSP; names are validated against path traversal.
- Illustrations are generated from sanitised values only and served as images. CSV exports neutralise spreadsheet formulas.
- AI keys are only read server-side (web) or from the Android Keystore (app), and are write-only in the UI. See [docs/AI-PROVIDERS.md › Security](docs/AI-PROVIDERS.md#security-and-privacy) for the direct-call vs proxy trade-offs.

---

## Development

```bash
npm run dev          # dev server on 127.0.0.1:3000
npm run lint         # ESLint (next/core-web-vitals + TypeScript)
npm run typecheck    # route types + tsc
npm test             # Vitest unit/integration tests (in-memory SQLite, no network, AI mocked)
npm run test:e2e     # web production build + Android web bundle + Playwright: web journeys, dialogs under `next dev`
                     # (StrictMode), the Android bundle in a phone-sized browser, and a mock OpenAI-compatible server
npm run db:generate  # create a migration after changing src/server/db/schema.ts

npm run mobile:dev       # the Android app's UI in a desktop browser (no device needed)
npm run mobile:build     # build the Android web bundle into mobile/dist
npm run android:apk      # build + sync + ./gradlew assembleDebug (needs the Android SDK, see docs/ANDROID.md)
npm run android:release  # signed release APK + AAB (needs a keystore, see docs/ANDROID.md)
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
    ai/                Provider-independent AI layer: config, adapters (providers/), prompts, validation
    platform/          Node implementations of storage, keys and HTTP (swapped on Android)
    weather/           Open-Meteo client, caching, summaries
    import/            Offline garment and activity parsers
  proxy.ts             Local-only / same-origin guard for the API
mobile/                The Android app's web bundle: Vite config, Next.js shims, in-app router,
                       server-component renderer, in-process API, sql.js storage, Keystore secrets
android/               Capacitor Android project (app id app.wardrobestudio)
assets/                Icon artwork (scripts/android-assets.mjs renders the Android icons/splash)
drizzle/               SQL migrations
docs/                  ANDROID.md, AI-PROVIDERS.md
tests/unit, tests/e2e  Vitest and Playwright suites
```

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Drizzle ORM + better-sqlite3 (web) / sql.js (Android), Zod 4, the official Anthropic, OpenAI and Google Gen AI SDKs, Capacitor 8, Vite, Vitest and Playwright. Fonts (Fraunces, Inter) are self-hosted via Fontsource, so builds work offline.

## Known limitations

- **No AI image generation.** All visuals are the local SVG illustrations (plus your own photos). They're stylised drawings, not photorealistic renders.
- **Without an AI provider**, free-text understanding is keyword-based: the offline import parser recognises common garment, colour, material, fit and pattern words; the stylist reads occasion and “use / avoid my …” phrases from requests but not nuanced instructions. Free-text outfit adjustments (“something warmer, keep the shoes”) need an AI model; the quick adjustments work without it.
- The provider integrations are tested against faithful fakes of each API's wire format (through the real SDKs) and end-to-end against a local OpenAI-compatible mock server. They were **not** exercised against the live Anthropic, OpenAI or Gemini APIs while building this (no keys were available). Use *Test connection* after adding a key.
- The Android app was built and its web bundle tested in a phone-sized Chromium, but it was not run on a device or emulator here (no KVM). See [docs/ANDROID.md › What was tested](docs/ANDROID.md#what-was-tested).
- Weather periods use the location's local time (morning 7–11, afternoon 12–17, evening 18–22). Weather overrides are entered in °C and km/h.
- Single user, no accounts or sync; one wardrobe per database file.
