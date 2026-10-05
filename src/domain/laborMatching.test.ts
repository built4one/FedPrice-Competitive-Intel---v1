import test from 'node:test';
import assert from 'node:assert/strict';
import { laborFamily, laborRoleMatch } from './laborMatching';

test('maps bespoke IAM and security titles to benchmarkable families', () => {
  assert.equal(laborFamily('Conditional Access Policy Manager'), 'Cybersecurity Engineer');
  assert.equal(laborFamily('Identity and Entitlement Admin'), 'Cybersecurity Engineer');
  assert.equal(laborFamily('IT Infrastructure Security Specialist'), 'Cybersecurity Engineer');
  assert.equal(laborFamily('E-Discovery Administrator (Security/FOIA/CAPSTONE)'), 'Systems Administrator');
});

test('family mappings match adjacent GSA role titles without changing the solicitation title', () => {
  assert.ok(laborRoleMatch('Conditional Access Policy Manager', 'Cybersecurity Engineer') >= 0.8);
  assert.ok(laborRoleMatch('Identity and Entitlement Admin', 'Cybersecurity Engineer') >= 0.8);
  assert.ok(laborRoleMatch('IT Infrastructure Security Specialist', 'Cybersecurity Engineer') >= 0.8);
  assert.ok(laborRoleMatch('E-Discovery Administrator (Security/FOIA/CAPSTONE)', 'Systems Administrator') >= 0.8);
});
