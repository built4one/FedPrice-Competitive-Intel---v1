# Federal Price-to-Win Intelligence Suite

This is the controlling product contract, restored on September 27, 2026 UTC from the owner's original vision and correction. Legacy implementation choices do not narrow it.

## Product promise

Give a Federal Pricer the coordinated work product of a PTW department: procurement interpretation, competitor assessment, external market research, economic scenario analysis, and a defensible recommendation with a reviewable record of the decision. One upload starts the workflow. The final output must explain **what to bid and how to compete, why that approach can win under this solicitation, what must change in delivery/pricing to support it, and what evidence would change the recommendation**.

The product must make the pricing decision better. A market average, an executive summary, a generic competitor list, or a fixed percentage range does not satisfy that promise.

## Controlling architecture

- Agent 1: Opportunity Intelligence owns the procurement facts, applicable amendments, qualification, mandatory requirements, evaluation model, evaluated-price basis, acquisition risks, and source-level gaps. It delivers its PDF and versioned JSON to Agents 2 and 3.
- Agent 2: Competitor Intelligence owns the evidence-supported competitive field and rival hypotheses: intent, strengths/weaknesses, delivery approach, relationships, incumbent position, cost advantages, plausible pricing behavior, and evidence that would contradict each hypothesis. It delivers its PDF and JSON to Agent 4. Capability, agency experience, and vehicle membership never establish intent to bid.
- Agent 3: Market and Pricing Benchmarks owns comparable selection and normalization, labor/contract benchmarks, public affordability context, exclusions, uncertainty, and the economic basis of pricing hypotheses. It delivers its PDF and JSON to Agent 4. Ceiling rates, obligations, budgets, pooled ceilings, and actual evaluated prices remain distinct.
- Agent 4: PTW Synthesis remains the final decision-support lead. It reconciles Agents 1–3, compares competing delivery/pricing approaches, evaluates their implications under the actual selection method, selects and defends a conditional recommendation, identifies the corridor and sensitivities supportable by evidence, and prepares the Federal Pricer's validation/approval packet.
- Future Agent 5: Federal WinLens brings governed IBM historical signings/DCA evidence into Agent 4. It never becomes the final synthesis agent. Schema, permissions, redaction, comparability, extraction, and governance must precede internal-data ingestion.

## How strategic numbers must be earned

1. Establish the government's evaluated-price basis: units, CLINs, period/options, quantities, evaluation factors, affordability signals, and mandatory constraints. Record facts and uncertainties.
2. Develop specific rival hypotheses from sources. Each hypothesis separates established facts, inferences, and assumptions; records a plausible delivery/price mechanism; and identifies confirming or disconfirming evidence. Do not present estimated competitor prices as known bids.
3. Build materially different strategies. Each changes explicit variables such as staffing mix, transition overlap, delivery location, subcontracting, automation scope, productive hours, non-labor items, fee, or contract structure **only where permitted and supported**. Explain the evaluation benefit and sacrificed benefit/risk.
4. Use approved deterministic calculation logic to price each scenario on the same evaluation basis. Accept approved cost-model outputs as feasibility inputs where available. Identify omitted costs and uncertain quantities. Preserve input provenance and analyst acceptance.
5. Compare strategic alternatives against government evaluation, credible rival scenarios, affordability, and delivery/economic constraints. Preserve uncertainty; do not turn a heuristically generated range into a confidence interval or a probability of winning.
6. Recommend a target/corridor with conditions, sensitivities, and validation actions. A recommendation must answer why this approach is preferred and why the alternatives were rejected. If dollars cannot yet be supported, still provide the best defensible strategic posture and exact missing evidence; do not manufacture a number.

Source-selection interpretation must use the actual solicitation and applicable rules. FAR tradeoff and LPTA illustrate different decisions; the system must not assume every solicitation uses either one, invent factor weights, or create a price-score formula when the solicitation provides none. References: https://www.acquisition.gov/far/15.101-1 and https://www.acquisition.gov/far/15.101-2 (reviewed September 27, 2026 UTC).

## Required decision packet

- Recommended strategy, target/corridor when supported, and the reasons it is preferred.
- Procurement/evaluation model and qualification findings.
- Rival hypotheses and expected responses, with uncertainty visible.
- At least two genuine strategic alternatives, each with causal pricing levers, evaluation effects, delivery implications, and risk.
- Scenario arithmetic, source/assumption lineage, relevant affordability constraints, and sensitivities.
- Claims linked to evidence; conflicting sources and unknowns explicit.
- Human review status, unresolved validation tasks, and a record of changed inputs and decisions.
- Agent PDFs plus versioned JSON handoffs; UI and exports derived from the same validated data.

## Current implementation truth and sequence

The inherited benchmark engine is supporting evidence. Its 20%/35% bottom-up bands and evidence-width calculations are heuristic references. They do not model how a selected delivery strategy changes evaluated price, rival response, or award prospects.

The September 27 correction introduces a separate strategic synthesis contract and request: evaluation, rival hypotheses, differentiated options, explicit selection/rejection reasons, change triggers, and validation tasks. It validates shape and source references, labels all output unreviewed, invalidates it when inputs change, and presents market values as reference data. Citation validation does not prove semantic source support. The UI, PDF, and Excel carry the same strategic assessment.

This is an initial Agent 4 capability built on the inherited combined upstream analysis. It is not the completed four-agent suite, a priced-scenario engine, independent research validation, durable job orchestration, or evidence of live-RFP quality.

Build next in dependency order:

1. Restore a usable private test environment: PostgreSQL, tester identities/session secret, live OpenAI smoke test, and a public/approved RFP. Verify isolation, save/reopen, and export parity.
2. Formalize Agent 1's qualification/evaluation contract and preserve document/page/amendment provenance. Test LPTA, tradeoff, ambiguous evaluation, amended dates, sole-source, expired, and incomplete packages.
3. Split Agents 2 and 3 into bounded research roles with independent structured handoffs, claim-level sources, uncertainty, budgets, and partial-failure recovery.
4. Implement explicit priced strategy scenarios and sensitivities using approved inputs and deterministic formulas. Remove reliance on generic benchmark bands as proposed bid scenarios. Test price-basis equivalence, CLIN/options, duplicate costs, missing ODCs, and constraint conflicts.
5. Feed those priced scenarios and research handoffs to Agent 4, validate source support and recommendation consistency, generate all required PDFs/JSON, and add analyst review/versioning and rerun behavior.
6. Add persisted job/step state, bounded retries, cancellation/resume, audit, cost/latency visibility, and realistic package handling. Prove one complete private workflow before declaring the MVP ready.
7. Add WinLens only through the separate governed internal-evidence workstream.

For the Monday private trial, demonstrate strategic value as well as reliable plumbing. Do not call an upload-to-benchmark-only flow the PTW MVP. Report exactly which parts of the controlling vision the test exercises, what remains provisional, and what is blocked.
