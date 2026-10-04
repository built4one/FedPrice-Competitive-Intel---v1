# Federal PTW pilot review — October 4, 2026

## Source of truth

Repository: built4one/FedPrice-Competitive-Intel---v1.
Branch: codex/market-intelligence-openai-weekend.
Reviewed baseline: 066cc1c14841740f69c537c5853380aa9a0f0a5c.
The original scratch copy was older and Gemini-based. The deployed branch already uses OpenAI, authenticated workspace storage, deterministic market references, and validated qualitative PTW strategy synthesis.

## Repairs in this change

- Intake extracts solicitation eligibility with a source locator and distinguishes current competitive RFPs, expired packages, sole-source notices, preliminary notices, unrelated files and unresolved cases. Explicitly disqualified packages return an actionable 422; unresolved eligibility remains visible for analyst review.
- Empty, mislabeled PDF, unsupported legacy DOC and oversized uploads fail explicitly. DOCX normalization uses paragraphs; spreadsheet scalar inputs preserve cell addresses.
- Model calls are bounded: extraction 110 seconds, public enrichment 90 seconds, and strategy in its separate request. Research receives explicit output shapes.
- Completed analysis stays in the intake component after a save failure, allowing a save retry without repeating paid analysis. It is retained only while that page remains open.
- Price Scenarios accepts explicit evaluated CLIN quantities and lower/target/upper offered unit prices, source/assumption notes, and the full evaluation basis. No rate, quantity, option period or percentage spread is supplied automatically.
- The server recalculates scenario totals from accepted inputs when saving, reopening and exporting. Client-supplied totals cannot control the result.
- Decimal arithmetic sums quantity × offered unit price and rounds once to cents. Every priced scenario remains conditional; source-backed market references and the qualitative competitive recommendation remain separate.
- PDF and Excel contain the same priced scenario, evaluation basis and assumptions. Excel also preserves source URLs and excerpts.

## Verified here

65 automated tests pass, including scoped private storage, stale-save detection, source and numeric authority, eligibility cases, decimal scenario arithmetic, invalid assumptions, server rejection of forged scenario totals, save/reopen and matching Excel totals, and PDF generation. TypeScript and the production build pass. A local development server starts with the declared runtime.

## Not yet verified

No live OpenAI RFP run, hosted database write, browser desktop/mobile pass, or executive acceptance has been completed in this turn. The cloud browser cannot reach the local development server. The existing preview additionally requires Vercel sign-in.

The connected Vercel project has OPENAI_API_KEY configured for preview and production. DATABASE_URL was added to preview after the previous deployment; the reviewed deployment reports storage unconfigured until redeployed. STUDIO_USERS_JSON is absent. SESSION_SECRET has now been created.

Automatic approval review blocked the creation of pilot accounts (including a reduced owner-only preview proposal). It also blocked expanding an environment variable to production. No account was created, no authentication bypass was added, no production database scope was changed, and no protection was disabled. Tester access and a live end-to-end RFP test remain blocked on explicit access authorization.

## Release gate

After approved preview accounts are configured: deploy the branch, verify authenticated storage, run one current public RFP through intake → research → strategy → save/reopen → price scenarios → PDF/Excel, then test sparse evidence and a disqualified package. Record model/provider and source failures distinctly. Repeat on desktop and mobile. Until that gate passes, describe this as a repaired pilot awaiting live validation, not an executive-ready PTW authority.

Internal IBM WinLens/DCA integration remains future scope. This commercial pilot should use public or explicitly approved test materials.
