# Federal Market Position

Evidence-led federal pricing intelligence that turns a solicitation and comparable public evidence into one traceable Market Position.

## Product outcome

The application answers:

> Where is the defensible competitive market position for this opportunity, what evidence supports it, and what could move it?

The completed-run experience is the Decision Center. It presents deterministic Aggressive, Expected, and Conservative positions, Evidence Readiness, included and excluded numeric anchors, normalization, comparability, weights, uncertainty, assumptions, and next actions.

## Golden path

1. Upload a PDF, DOCX, DOC, or TXT solicitation.
2. Extract solicitation facts, requirements, labor signals, pricing signals, and typed numeric evidence.
3. Retrieve available USAspending, GSA CALC+, BLS, and optional SAM.gov evidence.
4. Keep evaluated prices, ceilings, award amounts, obligations, hourly rates, and percentages distinct.
5. Run the versioned deterministic engine: **Collect → Normalize → Score → Weight → Range → Explain**.
6. Review the authoritative Decision Center and evidence methodology.
7. Save, export, or freeze the run for like-for-like award validation.

## Intelligence boundary

- OpenAI extracts, classifies, researches, and explains.
- OpenAI does not create or revise authoritative Market Position dollars.
- The server recalculates authoritative values before saving or exporting.
- Raw hourly CALC+ rates and BLS percentages cannot enter total-contract-value weighting.
- Program funding, multiple-award pools, order limits, and past-performance thresholds cannot be treated as one expected award value.
- Solicitation-stated individual-award ranges retain their native low and high bounds.
- Qualitative competitive factors never add or subtract an arbitrary percentage.
- Insufficient evidence returns null scenarios rather than a manufactured range.

## Engine V2

Eligible total-value anchors receive deterministic comparability, evidence-quality, and normalization-confidence scores.

```text
Anchor weight = Comparability² × Evidence Quality × Normalization Confidence
Expected = Σ(Normalized Value × Anchor Weight) ÷ Σ(Anchor Weight)
```

Range width is derived from weighted anchor dispersion, Evidence Readiness, and evidence sparsity. The engine and thresholds are versioned in `src/domain/marketPosition/engineConfig.ts`.

## Run locally

```bash
npm ci
cp .env.example .env
# Add OPENAI_API_KEY to .env
STUDIO_LOCAL_MODE=1 npm run dev
```

## Quality checks

```bash
npm run check
```

The suite covers connector resilience, comparable scoring, normalization, weighted Expected, unlike-unit exclusion, strong and sparse evidence, uncertainty ranges, reproducibility, validation boundaries, and AI overwrite resistance.

## Configuration

- `OPENAI_API_KEY` — required for solicitation analysis; server-side only.
- `OPENAI_MODEL` — optional; defaults to `gpt-5.4`.
- `ENABLE_OPENAI_WEB_SEARCH` — optional; defaults to enabled. Public research uses OpenAI web search; government adapters remain separate.
- `SAM_API_KEY` — optional supplemental opportunity intelligence.
- `BLS_API_KEY` — optional higher BLS quota.

The hosted Vercel demo accepts up to 10 files with a combined package size of 4 MB. Larger production packages require direct object-storage upload rather than routing binary files through a serverless request.

USAspending and GSA CALC+ do not require API keys.

OpenAI Responses processes solicitation files as input, returns structured extraction, and can enrich the qualitative market view through web search. The app sends public opportunity facts to web search, not private company rates. The deterministic market engine still calculates the scenario dollars. OpenAI requests use `store: false`; this does not replace durable app-side storage. Configure an API account, billing, and the key in the deployment's server environment before live analysis. The health route reports whether a key is configured without exposing it.

## Private tester setup and persistence

The API requires a signed-in tester. Set `STUDIO_USERS_JSON` to a JSON array of accounts with distinct `username`, `workspace`, and `passwordHash` fields. Generate one account object at a time with `node scripts/create-tester-account.mjs USERNAME`, then combine the objects into one array. Set a random `SESSION_SECRET` of at least 32 characters. Keep both values in server environment settings, never in the repository or browser. Each tester's workspace is isolated.

Set `DATABASE_URL` to a PostgreSQL connection string for hosted deployment; hosted run storage fails closed if it is missing. Local development uses a SQLite file at `STUDIO_DB_PATH` (default `./data/market-intelligence.sqlite`). For local testing only, `STUDIO_LOCAL_MODE=1 npm run dev` allows loopback access as one local analyst. Saved runs are authoritative in the database, with optimistic version checks; older browser runs can be explicitly imported after sign-in. The uploaded original files are not yet stored, so retain the original RFP package outside the app.

The OpenAI branch still needs a private preview deployment, credentials, and one complete live-RFP test before external testers should rely on it. No IBM confidential data or internal rates belong in this commercial app.

## V1 exclusions

- Company Position
- Probability of win
- Confidential competitor rates, wrap, margin, or bid price
- Full competitor should-cost
- SAM bulk ingestion
- MCP or ContextForge
- Monte Carlo simulation
