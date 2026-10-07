import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Workspace from '../Workspace';
import PricingScenarioPanel from './PricingScenarioPanel';
import { pricedServicesFixture } from '../../testFixtures/pricedServices';
import { enforceAuthoritativeAnalysis } from '../../domain/marketPosition/authoritative';

test('partial pricing is identified in the workspace and its full source schedule is prefilled for analyst rates',()=>{
  const raw=pricedServicesFixture();raw.evidence=raw.evidence.filter(e=>e.id!=='SYN-RATE-1');
  const a=enforceAuthoritativeAnalysis(raw);
  const workspace=renderToStaticMarkup(<Workspace analysis={a} onBack={()=>{}} onUpdate={async()=>{}} />);
  assert.match(workspace,/PRICING MODEL: COMPONENT VALIDATION OPEN/);
  assert.match(workspace,/PARTIAL SUBTOTAL/);
  assert.match(workspace,/1,050,240/);
  assert.doesNotMatch(workspace,/NUMERIC: SUPPORTED/);
  const prices=renderToStaticMarkup(<PricingScenarioPanel analysis={a} onUpdate={async()=>{}} />);
  assert.equal((prices.match(/<fieldset/g)||[]).length,97);
  assert.match(prices,/Systems Administrator \/ Year 1/);
  assert.match(prices,/Rate or role mapping unresolved/);
  assert.match(prices,/readonly=""/i);
  assert.match(prices,/Sources and assumptions 97/);
});
