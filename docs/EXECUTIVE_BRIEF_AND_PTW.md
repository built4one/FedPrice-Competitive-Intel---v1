# Federal Market Position: executive output and PTW decision model

The executive brief leads with a selected provisional market planning price when the complete quantity/rate basis exists. Otherwise it leads with model incompleteness and clearly labeled partial subtotals. Supporting public-rate benchmarks remain separate from that recommendation and from company costs. This release changes the existing analysis workflow and its exports; it does not add IBM integrations.

## Six core sections

1. Executive decision: selected modeled evaluated price, scenario envelope, rationale, confidence, critical conditions and decision request.
2. Government decision: controlling eligibility and NAICS, evaluation sequence, scored factors, complete evaluated basket, extension and ceiling distinctions, and source conflicts.
3. Market and competition: public labor references, comparable-award treatment, pursuit-specific competitor evidence, unknowns and crosswalk priorities.
4. Reconciled price: period labor totals, specified evaluated components, aggressive/recommended/defensive cases and deterministic calculation lineage.
5. Sensitivity and accountability: isolated changes, owners, unresolved inputs and conditions that move the recommendation.
6. Sources and limits: source locators, frozen inputs, assumptions, analysis timestamp and separate model/competitive confidence.

Long procurement requirements or material unresolved issues can produce continuation pages. Validated qualitative delivery strategies are an appendix; their unquantified savings are not silently embedded in the selected price.

## Calculation contract

- Use documented aggregate row hours once. Do not multiply by FTE or prorate an extension a second time.
- Extend matched public loaded-rate proxies using explicit performance-year factors. Historical ECI carried forward is a planning assumption, not a forecast.
- Respect the documented extension-rate convention, including final-option rates without an additional uplift where required. Unknown conventions remain visible validation items.
- Add specified evaluated travel/ODCs and applicable indirect treatment. An unknown indirect rate uses zero only as a disclosed provisional assumption and prevents a claim of complete evaluated-price coverage.
- Public loaded rates already contain burdens and embedded fee. Do not add them again. Public lower-quartile rates are not an execution floor.
- The aggressive case uses role lower quartiles. In price-ordered evaluation, the selected case protects senior/specialist roles, small samples and weak proxy mappings at the median and applies lower-quartile pressure elsewhere. Each protection is a visible analyst assumption, not a discovered competitor cost.
- Under tradeoff/unknown evaluation, the selected case uses median economics; no unsupported premium is manufactured. The upper case uses upper quartiles as a stress case.
- The displayed envelope spans planning scenarios. It is not a statistical confidence interval, validated competitor-price corridor, optimized winning price or approved offer band.
- A missing evaluated component lowers completeness and remains a validation condition; it does not automatically erase a model with a complete labor basis. Missing quantities/rates retain labeled partial working rows and prevent presentation of a complete price.
- A program ceiling does not establish PTW or automatically clip an unlike evaluated-price basket.

## Source controls

SF1449 and security forms retain visual checkbox context. Crosswalks preserve pricing titles, PWS duties/titles, qualifications and source conflicts. Personnel-security duties are distinct from cybersecurity; intelligence-target network samples are excluded from enterprise network roles. Known experience/worksite/education mismatches are filtered; exact certifications and clearance level remain unvalidated where the source does not establish them.

Named rivals require a claim-specific source linking the company to the pursuit or documented predecessor. General industry capability and generic web source lists are insufficient. Bidding intent still requires explicit evidence.

The workbook includes Government Decision, Pricing Inputs, Rate Distribution, Rate Statistics, Rate Source Records, Quantity Coverage, Competitive Labor, Evaluated Components, Competitive Strategies, Sensitivity and Actions and Source Snapshots. Formula cells include cached results and request recalculation when opened. All retrieved matched rate values are preserved; detailed rate records are bounded to 40 examples per category, with source-sample fingerprints and sampling limitations.

## Phase 2: company position

Company costs, workforce commitments, suppliers, internal benefits and contribution thresholds require authorized company records and a separately validated cost bridge. Phase 1 neither invents IBM inputs nor requires confidential economics to produce independent market planning guidance. An internal floor is a company economic constraint, not evidence that the government will accept that price.

## Release verification

Type checking, existing application/export/auth tests and new calculation tests cover the deterministic bridge. A synthetic 16-role/6-period schedule exercises 96 rows and 1,050,240 evaluated hours; its invented rates and $20,000 travel input deliberately differ from the Navy output so no recommendation is hard-coded.

The four original Navy procurement source files were not supplied in this implementation conversation. The synthetic fixture is not a fresh real-package extraction test or an executive-readiness certification. Rerun the four-file package and independently inspect eligibility, quantities, duty mappings, extension, required travel and source-selection branches before executive use.

Saved runs without the new evaluation and qualification fields are recalculated but remain explicitly partial. Re-upload the source package to obtain those fields. Prior qualitative strategy drafts are invalidated by the new synthesis version and must be regenerated.

## October 6 correction release

- Fixed evaluated travel and other individual basket amounts are COMPONENT records, including previously saved evidence mislabeled EVALUATED_PRICE. They cannot become whole-contract price anchors. Market engine: market-position-v3.3.0.
- Qualified senior/SME GSA matches retain their original requested role and detailed source categories across the family-name crosswalk. Generic and junior samples still fail senior requirements; exact clearance/certification relevance remains a separate limitation.
- Quantity Coverage retains every valid extracted row. Competitive Labor includes priced rows only. Partial strategy subtotals disclose excluded hours and have no selected full target. Quantity confidence is independent of rate coverage. The selected rationale describes actual lower-quartile/median choices, including all-median cases.
- A substantive personnel-security/cybersecurity conflict blocks automatic role pricing. Matching small-business checkboxes and the agreeing clause are resolved corroboration; open role and timing issues remain explicit.
- Sourced requirement and pricing instructions become individually citable RULE records. Claim checks reject unrelated citations for facility clearance, past-performance ratings, required labor coverage, eligibility and transition timing. Strategy version: ptw-strategy-0.4.0. These topic checks support analyst review; they do not certify every claim's semantic entailment.
- Price Scenarios starts with all source quantity rows, available period-adjusted planning rates and evaluated components. Unpriced rates stay blank. Analyst rates and assumptions can change; source quantity rows must reconcile before a full-scope scenario is saved. Earlier unlinked/mismatched offers are retained as explicitly unreconciled conditional scenarios and do not replace the independent model.
- UI model badges, both exports and retrospective comparison use the same completeness distinctions. Partial price models and ceiling/obligation actuals cannot produce a scored full-price comparison.
- Supporting evidence is searchable and grouped by claim type. The PDF uses section names rather than fragile page references, with condensed executive content and full lineage in the workbook.

The attached latest workbook was used as a temporary local regression input, including its frozen public rate records. It retained 96 rows and 1,050,240 hours; the correction priced 84 rows / 986,880 hours. Cloud Application Admin lacks a defensible rate match, and the conflicting IT Infrastructure/Personnel Security role remains unpriced (12 rows / 63,360 hours together). This is a correction of the supplied output, not a fresh extraction of the original four procurement files. Local production export routes returned valid PDF and XLSX files; the six core PDF pages and workbook reconciled these quantities and partial subtotals.

A protected-browser Vercel sign-in prevented live interface interaction in this session. No deployment protection or credentials were changed. Fresh source-package analysis and both exports in a signed-in session remain the final pilot acceptance check; this release does not certify executive bid readiness.

## October 7 credibility and reliability checkpoint

Inspected branch `codex/market-intelligence-openai-weekend` at `335acb4` and its recent PTW, export and SAM fixes before changing the implementation. Baseline: 103 tests passed, but TypeScript failed because the conditional-offer export still compared against the removed `PARTIAL_MODEL` status.

- Corrected the export to label partial planning subtotals using the current `PARTIAL` status; an HTTP export regression checks that no partial case is selected.
- Removed automatic 5/8/10/15 percent ceiling-to-offer discounts. Source-selection method does not establish a competitive discount. Price-led selection uses lower quartiles with documented median protections; tradeoff and unknown evaluation use medians. Explicit supported offered rates remain editable in Price Scenarios. Competitive model version: `competitive-position-1.3.0`; existing saved runs are recalculated through server authority and strategy hashes change with the new inputs.
- Workbook formulas use the same rate choices and cent-rounded rows as the model, including after recalculation. Complete multiplication no longer earns HIGH competitive PTW confidence while rival pricing remains LOW and execution is NOT_ASSESSED. Unknown or uncited selection methods retain conditional targets and an explicit validation task.
- SAM attachment and description streams enforce decoded byte limits and cancel oversized bodies even with missing or misleading Content-Length. Sequential attachment retrieval uses the actual remaining package budget and stops downloads when exhausted. This trades download parallelism for bounded peak memory; real-package latency still needs hosted verification.

Validation: `npm run lint` and all 114 automated tests passed, with zero skipped or failed tests. Coverage includes streamed size limits, full/partial models, evaluation-dependent rates, authoritative save/export behavior, authentication/workspace isolation, and confidence parity in rendered UI, parsed PDF and Excel. Test data remains synthetic or mocked; no fresh original procurement package was supplied for this checkpoint.

The existing application process was preserved. No product rebuild, restart, production deployment, merge to main or remote push was performed. The tracked serverless bundle and existing build outputs were intentionally left unchanged. These source changes need the documented build before an authorized preview/release; current running output does not prove the revised source works live.

Remaining acceptance gate: use an authorized private environment with live OpenAI access and configured storage; analyze a representative current solicitation, inspect source-selection/eligibility, all quantities, role mappings, extension treatment and evaluated components; save/reopen and compare UI/PDF/Excel. Repeat sparse evidence and partial-provider failures, then desktop/mobile review. The current cloud machine has no injected OpenAI, SAM, BLS, database, tester-account or session-secret variables. Local SQLite and test identities exercised the automated workflow; hosted PostgreSQL and live model/provider calls were not verified. Any production merge or deployment still requires owner approval.
