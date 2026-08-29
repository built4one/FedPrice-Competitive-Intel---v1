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

- Gemini extracts, classifies, researches, and explains.
- Gemini does not create or revise authoritative Market Position dollars.
- The server recalculates authoritative values before saving or exporting.
- Raw hourly CALC+ rates and BLS percentages cannot enter total-contract-value weighting.
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
# Add GEMINI_API_KEY to .env
npm run dev
```

## Quality checks

```bash
npm run check
```

The suite covers connector resilience, comparable scoring, normalization, weighted Expected, unlike-unit exclusion, strong and sparse evidence, uncertainty ranges, reproducibility, validation boundaries, and AI overwrite resistance.

## Configuration

- `GEMINI_API_KEY` — required for solicitation analysis.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-pro`.
- `ENABLE_GOOGLE_SEARCH` — optional; defaults to enabled.
- `SAM_API_KEY` — optional supplemental opportunity intelligence.
- `BLS_API_KEY` — optional higher BLS quota.

USAspending and GSA CALC+ do not require API keys.

## Current persistence boundary

Runs are versioned in browser storage and synchronized with the active Express server session. The current server store is memory-backed and does not survive a server restart. Durable database persistence remains a separate future work package.

## V1 exclusions

- Company Position
- Probability of win
- Confidential competitor rates, wrap, margin, or bid price
- Full competitor should-cost
- SAM bulk ingestion
- MCP or ContextForge
- Monte Carlo simulation
