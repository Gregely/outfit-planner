# AI providers and models

AI is optional. Without it, the built-in rule-based stylist, the offline import parser and every non-AI feature work as usual. With it, you choose **which provider and which model** – and you can change your mind at any time without touching your wardrobe, preferences, saved outfits or history.

## Supported providers

| Provider | How it's called | Structured answers | Reasoning control | Model list |
| --- | --- | --- | --- | --- |
| **Anthropic Claude** | Official `@anthropic-ai/sdk`, Messages API (streamed) | `output_config.format` JSON schema, enforced by the API | `output_config.effort` (`low`…`max`); omitted on models that reject it. Server-side refusal fallback (`fallbacks: "default"`) on models that support it | `GET /v1/models` |
| **OpenAI** | Official `openai` SDK, Responses API, `store: false` | Structured Outputs: `text.format` json_schema, `strict: true` | `reasoning.effort` (supported values vary by model) | `GET /v1/models` (text models only) |
| **Google Gemini** | Official `@google/genai` SDK, `generateContent` | `responseMimeType: application/json` + `responseJsonSchema` | `thinkingConfig.thinkingLevel` (`minimal`…`high`, varies by model) | `models.list` (models that support generateContent) |
| **OpenAI-compatible endpoints** (Ollama, LM Studio, vLLM, llama.cpp server, OpenRouter, others) | Official `openai` SDK with your base URL, Chat Completions | Configurable: **Automatic** (json_schema, falling back to JSON mode, then schema-in-prompt if the server rejects it), JSON schema, JSON mode, or prompt only | `reasoning_effort` if you set one (many servers ignore it) | `GET {base}/models` if the server has it; otherwise type the model ID |

Each provider's capabilities are different, so the app doesn't pretend they're the same: request shapes, refusal and truncation signals, and error formats are handled per provider in `src/server/ai/providers/`. What *is* the same is everything after the answer arrives (below).

### Model catalogue

The Settings screen suggests a few models per provider, copied from each provider's own model documentation on **2026-10-23** (`CATALOGUE_CHECKED` in `src/lib/ai-providers.ts`):

- Anthropic: `claude-opus-5-5` (default), `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`
- OpenAI: `gpt-6.1-sol` (default), `gpt-6-astra`, `gpt-6-luna`
- Gemini: `gemini-3.8-flash` (default), `gemini-4-argon`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`

Model line-ups change, so **Models** (refresh) fetches the live list your key can actually use, and “Another model ID…” accepts any ID. The app never claims a model exists: a model that the provider rejects is reported as “that model isn't available from …”.

## Setting it up

1. Settings → **AI providers**.
2. Open a provider, paste an **API key** (Anthropic, OpenAI, Gemini), or **Add an OpenAI-compatible endpoint** with its base URL (e.g. `http://192.168.1.20:11434/v1` for Ollama on your network; tick *Needs an API key* if it does).
3. **Models** to fetch the live list, pick one, **Test connection**. The test is real: it lists models (where supported) and asks the model for a small structured answer, which is validated exactly like a real one. It passes only if that answer is valid; otherwise it shows each step and the provider's own error.
4. **Use …** to make it the main model. Optionally, under *Use different models for specific tasks*, choose separate models for **Garment import** (reading descriptions of clothes and plans), **Daily styling** (suggestions, swaps, adjustments, gap checks) and **Weekly planning** (the longest answers).
5. Optional per provider: effort / thinking level (“Model default” is safest), the API address, and for Claude the server-side refusal fallback.

Status for each task is shown at the top: which provider · model will answer, or “Built-in stylist” and why (no provider, no key, switched off, offline).

The web app also reads keys from the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`) and initial models from `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`. **Existing installs keep working unchanged:** until you save a choice in Settings, the configuration is derived from those variables exactly as before (including `ANTHROPIC_EFFORT` and `ANTHROPIC_REFUSAL_FALLBACK`).

## The same rules for every model

Whichever provider answers:

1. The answer is parsed and validated with the same Zod schemas (enum values that differ only in case are normalised; anything else invalid is rejected as “didn't match the expected format”).
2. Every outfit goes through the same hard constraints: garments must exist and be available, appear once and form a complete outfit; required pieces must be present, excluded pieces and “never combine” / “avoid” rules respected; week plans can't use pieces that will be in the wash.
3. Invalid suggestions are discarded; the model gets one repair attempt; anything still missing comes from the rule-based stylist.
4. Each AI outfit records **which provider and model made it** (shown on the outfit card, e.g. “OpenAI · gpt-6.1-sol”); rule-based outfits say “Rule-based”, hand-made ones “Hand-picked”.

Schemas are kept free of nullable unions (unknowns are `""`, `"unspecified"` or `0`) so they stay within Anthropic's documented structured-output limits (≤16 union-typed, ≤24 optional parameters) and avoid the deep `anyOf` / optional runs other providers reject. A unit test checks every schema.

## When something goes wrong

Every failure is reported for what it is, with the provider's own message, HTTP status, error type and request ID where available – in the notice on screen and in the server log (`[ai] …`). The built-in stylist then answers.

| Message | Meaning | What to do |
| --- | --- | --- |
| *X rejected the API key* | 401/403, or “API key not valid” | Check or replace the key |
| *that model isn't available from X* | Unknown model, retired, or not enabled for your key | Refresh the model list and pick another |
| *X doesn't support a setting this request used* | e.g. an effort level or `response_format` the model rejects | Set effort to “Model default”; for custom endpoints try another *How to ask for JSON* mode |
| *X rejected the request […]* | Any other 400 | The provider's message says why |
| *X is rate-limiting requests* / *temporarily overloaded* | 429 / 5xx (after the SDK's own retries) | Try again later |
| *X couldn't be reached* / *timed out* | Network | Check the connection or the endpoint address |
| *X declined this request – … [category: …]* | A genuine refusal (Claude `stop_reason: refusal`, OpenAI refusal content, Gemini safety block) | Rephrase; it's never used for API errors |
| *X's answer was cut off* | Output limit reached | Usually transient; choose a model with a larger output limit |
| *X's answer didn't match the expected format* | Invalid JSON or schema mismatch | Common with small local models: try JSON schema mode or a larger model |
| *you're offline* (Android) | No connection | Everything local still works |

## Security and privacy

**What is sent:** when AI is used, the chosen provider receives your *available* garments (names, types, colours, materials and similar attributes), your style profile, rules and recent feedback, what you wore or planned in the last week or so (to avoid repeats), the day's weather and plans, and your request. Photos, older history, backups and keys for other providers are never sent. OpenAI requests use `store: false`.

**Where keys live:**

- *Web app:* on the server only – environment variables, or keys entered in Settings saved to `data/secrets.json` (mode 600, next to the database; `SECRETS_PATH` to move it). Never in the database, never sent to the browser (the UI is write-only and only shows “configured / from environment”), never in backups or exports, never in logs (messages are scrubbed of key-shaped strings).
- *Android app:* encrypted with an Android Keystore key (see [ANDROID.md › Security](ANDROID.md#security)); excluded from cloud backup; read only for the request being made.
- Backups never contain keys **or** this device's AI provider settings, and restoring a backup keeps the current device's AI setup.

**Direct calls vs a backend proxy.** Wardrobe Studio calls providers directly with *your own* key – from your computer's local server (web) or from your phone (Android). There is no shared Wardrobe Studio server or key.

| | Direct (what this app does) | Through a backend proxy |
| --- | --- | --- |
| Who sees your wardrobe data | Only you and the provider you chose | You, the proxy operator, and the provider |
| Where the key lives | Your machine / your phone's Keystore | The proxy; the app holds only a user credential |
| Risk if the device is compromised | An attacker with full control of the unlocked app could use your key – limit it with provider spending caps and revoke it if lost | They get a user session instead; the operator can revoke it and rate-limit centrally |
| Shared costs, quotas, abuse controls | Not needed – it's your own account | Required: per-user authentication, quotas and logging |
| Works with a model on your own network | Yes | Only if the proxy can reach it |
| Operating cost | None | A server to run and secure |

For a personal, single-user app, direct calls with a user-supplied key are the more private and simpler option, so that's what is built. If you ever distribute the app with a *shared* key, **don't embed it in the APK** (anything in an APK can be extracted): put it behind a proxy that authenticates each user (e.g. OAuth/OIDC), enforces per-user quotas, forwards only the structured-output request, and keeps the provider key server-side. The provider adapters accept a base URL, so pointing the app at such a proxy needs no changes to the stylist.

## Adding another provider

1. Add a descriptor to `PROVIDERS` in `src/lib/ai-providers.ts` (label, docs, key/env vars, effort levels, catalogue, whether it can list models).
2. Implement `ProviderAdapter` in `src/server/ai/providers/<name>.ts`: `generate()` sends the system prompt, user prompt and JSON schema in that API's format and returns the answer text (throwing `AiUnavailableError` with the right reason for refusals, truncation and HTTP errors – `shared.ts` classifies most), and `listModels()`.
3. Register it in `src/server/ai/providers/index.ts` and add its key's environment variables to `src/server/platform/secrets.ts`.
4. Add tests next to `tests/unit/providers.test.ts` (the fake network in `tests/helpers.ts` speaks each API's wire format).

Nothing in the stylist, planner, importer or validation needs to change.

## Testing notes

The adapters are tested through the **real SDKs** against fakes of each provider's wire format (streaming events for Claude, Responses API objects for OpenAI, `generateContent` responses for Gemini, Chat Completions for compatible servers), including refusals, truncation, invalid keys, unknown models, unsupported settings and network failures. End-to-end tests drive the Settings screen against a local OpenAI-compatible mock server (`scripts/e2e-mock-ai.mjs`), in both the web app and the Android bundle. **No live calls to Anthropic, OpenAI or Google were made while building this** (no keys were available), so run *Test connection* after adding a key.
