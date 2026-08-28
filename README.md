# FedPrice Competitive Intel

Evidence-led federal capture intelligence for turning a solicitation into a defensible market position and optional company-specific position.

## Golden path

1. Upload a PDF, DOCX, DOC, or TXT solicitation.
2. Extract deal facts, requirements, labor signals, and pricing signals.
3. Separate solicitation facts, external sources, analyst inference, and data gaps.
4. Retrieve and validate official USAspending, GSA CALC+, BLS, and optional SAM.gov evidence.
5. Synthesize official evidence and supplemental Gemini grounding into a market range, posture, recommendation drivers, confidence, and final guidance.
6. Optionally add company cost and price inputs to compare the company position with the market.
7. Save the run locally and export the evidence package to XLSX or PDF.

## Run locally

```bash
npm install
cp .env.example .env
# Add GEMINI_API_KEY to .env
npm run dev
```

## Quality checks

```bash
npm run check
```

## Configuration

- `GEMINI_API_KEY` (required): server-side Gemini credential.
- `GEMINI_MODEL` (optional): defaults to `gemini-2.5-pro`.
- `ENABLE_GOOGLE_SEARCH` (optional): defaults to enabled; set `false` for solicitation-only analysis.
- `SAM_API_KEY` (optional): adds SAM.gov opportunity intelligence. A Notice ID is never required from the user.
- `BLS_API_KEY` (optional): increases BLS quota; unauthenticated BLS access is supported.

USAspending and GSA CALC+ require no API keys. Connectors use schema validation, bounded retries, safe partial results, evidence deduplication, and visible diagnostics. A zero-result query is reported separately from a connector failure.

No real credentials belong in GitHub. Runs persist in the user's browser; the server does not require Postgres for the first complete product workflow.
