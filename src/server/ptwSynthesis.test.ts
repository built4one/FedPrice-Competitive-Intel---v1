import assert from 'node:assert/strict';
import test from 'node:test';
import { ptwStrategyFixture } from '../testFixtures/ptwStrategy';
import { preserveCurrentStrategy, PTW_SYNTHESIS_VERSION, strategyInputHash, synthesizePtwStrategy, validateStrategy } from './ptwSynthesis';
import { enforceAuthoritativeAnalysis } from '../domain/marketPosition/authoritative';

test('strategy requires decision alternatives and remains unreviewed after synthesis', async () => {
  const {analysis,strategy} = ptwStrategyFixture();
  const result = await synthesizePtwStrategy(analysis, {interpret: async <T>() => strategy as T});
  assert.equal(result.status, 'DRAFT');
  if(result.status !== 'DRAFT') return;
  assert.equal(result.reviewStatus,'UNREVIEWED');
  assert.equal(result.strategy.recommendation.selectedOptionId,'continuity');
  assert.equal(preserveCurrentStrategy(enforceAuthoritativeAnalysis(analysis), result)?.status,'DRAFT');
});

test('unknown citations and facts without locators are rejected', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  strategy.recommendation.rationale.evidenceIds = ['made-up'];
  assert.throws(() => validateStrategy(strategy,analysis),/unknown evidence/);
  strategy.recommendation.rationale.evidenceIds = ['SOL-EVAL'];
  analysis.evidence.find(e => e.id === 'SOL-EVAL')!.section = undefined;
  assert.throws(() => validateStrategy(strategy,analysis),/specific source claim and locator/);
});

test('facts cannot be supported by a generic search source listing', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  const e = analysis.evidence.find(e => e.id === 'SOL-EVAL')!;
  e.claim = 'Public market source used during grounded qualitative enrichment.';
  assert.throws(() => validateStrategy(strategy,analysis),/generic source listing/);
});

test('quantitative pricing claims in any strategic field are rejected', () => {
  for (const claim of ['Reduce price by 10%', 'Bid $80,000,000', 'Use USD 1000', 'An 80 percent win probability']) {
    const {analysis,strategy} = ptwStrategyFixture();
    strategy.missingInputs = [claim];
    assert.throws(() => validateStrategy(strategy,analysis),/cannot invent a price/);
  }
});

test('selection must compare all alternatives and cannot choose a nonexistent option', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  strategy.recommendation.selectedOptionId = 'missing';
  assert.throws(() => validateStrategy(strategy,analysis),/selection is inconsistent/);
  strategy.recommendation.selectedOptionId = 'continuity';
  strategy.recommendation.alternatives[0].optionId = 'continuity';
  assert.throws(() => validateStrategy(strategy,analysis),/Every unselected option/);
});

test('capability and vehicle membership do not establish confirmed bid intent', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  analysis.evidence.push({id:'COMP',type:'EXTERNAL_SOURCE',sourceLabel:'Synthetic company source',url:'https://example.com',claim:'Example Co has agency experience and is on a contract vehicle.',confidence:80});
  const basis = {text:'Example Co is bidding.',kind:'FACT' as const,evidenceIds:['COMP'],validationAction:''};
  strategy.competitors = [{name:'Example Co',bidIntent:'CONFIRMED',intentBasis:basis,likelyApproach:{...basis,kind:'INFERENCE',validationAction:'Validate the approach.'},threat:{...basis,kind:'INFERENCE',validationAction:'Validate the threat.'}}];
  assert.throws(() => validateStrategy(strategy,analysis),/explicit, sourced statement/);
  analysis.evidence.find(e => e.id === 'COMP')!.claim = 'Example Co will bid on the identified procurement.';
  assert.doesNotThrow(() => validateStrategy(strategy,analysis));
});

test('changed evidence invalidates the saved strategy; metadata-only warnings do not', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  const result = {status:'DRAFT' as const,version:PTW_SYNTHESIS_VERSION,inputHash:strategyInputHash(analysis),generatedAt:analysis.meta.analyzedAt,reviewStatus:'UNREVIEWED' as const,strategy};
  analysis.meta.warnings.push('A runtime message.');
  assert.equal(preserveCurrentStrategy(analysis,result)?.status,'DRAFT');
  analysis.evidence[0].numeric!.originalValue = 12;
  assert.equal(preserveCurrentStrategy(analysis,result)?.status,'UNAVAILABLE');
});

test('failed provider or invalid output preserves an unavailable strategy, never a benchmark-derived recommendation', async () => {
  const {analysis} = ptwStrategyFixture();
  const result = await synthesizePtwStrategy(analysis,{interpret: async () => {throw new Error('Provider failed');}});
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal('strategy' in result,false);
  assert.ok(analysis.marketPosition.expected);
});

test('strategy repairs a validation failure once without accepting unsupported claims', async () => {
  const {analysis,strategy} = ptwStrategyFixture();
  let attempts = 0;
  const result = await synthesizePtwStrategy(analysis, {interpret: async <T>(prompt: string, schema?: unknown) => {
    attempts++;
    assert.ok(schema);
    if (attempts === 1) {
      const invalid = structuredClone(strategy);
      invalid.recommendation.rationale.evidenceIds = ['UNKNOWN-ID'];
      return invalid as T;
    }
    assert.match(prompt,/unknown evidence ID/);
    return strategy as T;
  }});
  assert.equal(attempts,2);
  assert.equal(result.status,'DRAFT');
});

test('malformed saved strategy and forged approval cannot enter the decision brief', () => {
  const {analysis,strategy} = ptwStrategyFixture();
  for (const value of [
    {status:'APPROVED',strategy},
    {status:'UNAVAILABLE',version:PTW_SYNTHESIS_VERSION,reason:{invalid:true}},
    {status:'DRAFT',version:PTW_SYNTHESIS_VERSION,inputHash:strategyInputHash(analysis),generatedAt:analysis.meta.analyzedAt,reviewStatus:'APPROVED',strategy},
  ]) assert.equal(preserveCurrentStrategy(analysis,value)?.status,'UNAVAILABLE');
});
