# OpenAI Market Intelligence handoff (2026-09-26)

Integration branch: `codex/market-intelligence-openai-weekend`, based on the existing
`codex/market-intelligence-tonight` remote branch at `7ecfecd`. The existing
provisional bottom-up estimate, low-confidence rule, and period parsing fixes
remain in the integrated branch.

## Implemented

- Gemini calls replaced with one server-side OpenAI Responses adapter in `src/server/openaiIntelligence.ts`.
- Solicitation files use structured extraction. Public web search is optional and records returned source URLs. Official SAM.gov, USAspending, GSA CALC+, and BLS adapters remain in the application.
- The deterministic market-position engine is still the only authority for scenario dollars.
- `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5.4`), and `ENABLE_OPENAI_WEB_SEARCH` are documented in `.env.example`.
- Requests use `store: false`; API keys remain server-side. The research prompt receives public lookup keys, rather than private cost/rate records.
- The previous PDF font packaging fix was included in the same checkpoint so the built function can load its font assets.

## Verified

`npm run check` passed TypeScript, 45 tests, and Vite/serverless build. The local production server returned `/api/health` with `aiConfigured: false`, and analysis returned an explicit 503 for the missing key. The OpenAI request shape, nullable structured fields, web source handling, and missing-search behavior were tested with mock responses.

## Required before live use

1. Set a project API key as `OPENAI_API_KEY` in the server/deployment environment, with API access and billing enabled. Do not paste it into source or a browser field.
2. Build/deploy a private preview from this commit. Verify health, one real solicitation extraction, public citations, fallback behavior, PDF, and Excel against a representative package.
3. A later local checkpoint wired `src/server/auth.ts` and `src/server/store.ts` into the API and UI. Its tests cover restart persistence and workspace isolation. Hosted deployment still requires `DATABASE_URL`, `STUDIO_USERS_JSON`, and `SESSION_SECRET`; original uploaded files are not stored. Recheck the latest commit before release.
4. Production remains on the earlier `main` deployment until a reviewed release. Public deployment requires user approval.

OpenAI API Skills are a separate integration using shell/agent sandboxes. This app currently uses Responses structured output and web search, not an uploaded Skill bundle.
