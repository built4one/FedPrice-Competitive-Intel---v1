# Weekend private-test gate

Branch: `codex/market-intelligence-openai-weekend`, integrated from the existing
market-intelligence branch. Use this exact branch for private preview testing.

## What exists now

One integrated Market Intelligence pipeline accepts an uploaded package or SAM.gov reference, extracts opportunity facts with OpenAI, queries public adapters, optionally researches public sources with OpenAI web search, computes deterministic Aggressive/Expected/Conservative market scenarios, and exports a PDF and Excel brief. Results include evidence, confidence, exclusions, assumptions, and gaps. Runs now use private signed-in workspaces and a durable database. These are not four separate agent services or four independent PDFs/JSON handoffs.

The output is a **market-position planning range**, not a known competitor bid, guaranteed winning price, approved IBM price, or substitute for a company cost model. When evidence cannot support a number, the app states why and points to a missing input. The model must never invent a dollar value to satisfy an always-answer target.

## Release blockers

1. Configure a private preview with `OPENAI_API_KEY`, `DATABASE_URL`, `STUDIO_USERS_JSON`, and `SESSION_SECRET`. Set a distinct tester account/workspace for each participant.
2. Connect and deploy this exact branch to the intended Vercel project. Existing production is not updated by local commits.
3. Run at least one real current RFP end to end: upload, check extraction and period/options, inspect cited public evidence and excluded values, confirm the range or a clear insufficient-evidence answer, save, reopen after redeployment, and compare PDF/XLSX with the screen.
4. Run a second sparse or outdated package. Confirm the app gives a useful assessment and one concrete missing-input request, without a fabricated number.
5. Verify each tester can access only their own saved runs. Do not upload IBM confidential or DCA material to this commercial preview.

## Monday test brief

Give each tester a private account and one public or approved-for-testing solicitation. Ask them to record: input package and date; extraction corrections; source links that did or did not support claims; whether scope/period/units match the range; missing evidence; PDF/XLSX discrepancies; save/reopen result; and any error with the exact step. Ask them to label the output *usable*, *usable with analyst corrections*, or *blocked*. Do not use a result for an actual bid or approval during the trial.

## Later architecture

Split the existing pipeline into versioned Opportunity, Competitor, Benchmark, and Synthesis handoffs only after the combined workflow is reliable with real packages. The commercial product cannot ingest IBM internal rates, signings logs, or DCA records. A separate governed internal WinLens integration would require permissions, redaction, schema, and approval; it remains downstream of synthesis.
