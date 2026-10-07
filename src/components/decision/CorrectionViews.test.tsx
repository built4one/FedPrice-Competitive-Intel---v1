import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Workspace from '../Workspace';
import PricingScenarioPanel from './PricingScenarioPanel';
import { pricedServicesFixture } from '../../testFixtures/pricedServices';
import { enforceAuthoritativeAnalysis } from '../../domain/marketPosition/authoritative';
import CompetitiveRecommendation from './CompetitiveRecommendation';

test('partial pricing is identified in the workspace and its full source schedule is prefilled for analyst rates',()=>{
  const raw=pricedServicesFixture();raw.evidence=raw.evidence.filter(e=>e.id!=='SYN-RATE-2');
  const a=enforceAuthoritativeAnalysis(raw);
  const workspace=renderToStaticMarkup(<Workspace analysis={a} onBack={()=>{}} onUpdate={async()=>{}} />);
  assert.match(workspace,/Price basis needs clarification/);
  assert.match(workspace,/known-scope subtotal/i);
  assert.match(workspace,/Analyst workspace/);
  assert.doesNotMatch(workspace,/NUMERIC: SUPPORTED/);
  const prices=renderToStaticMarkup(<PricingScenarioPanel analysis={a} onUpdate={async()=>{}} />);
  assert.equal((prices.match(/<fieldset/g)||[]).length,97);
  assert.match(prices,/Systems Administrator \/ Year 1/);
  assert.match(prices,/Rate or role mapping unresolved/);
  assert.match(prices,/readonly=""/i);
  assert.match(prices,/Sources and assumptions 97/);
});

test('complete modeled arithmetic retains low PTW confidence in the executive view',()=>{
  const html=renderToStaticMarkup(<CompetitiveRecommendation analysis={pricedServicesFixture()} />);
  assert.match(html,/Recommendation Confidence/);
  assert.match(html,/Moderate/);
  assert.doesNotMatch(html,/\/100/);
  assert.match(html,/Company costs/);
  assert.doesNotMatch(html,/overall: HIGH/);
});
