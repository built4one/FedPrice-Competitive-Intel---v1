#!/bin/bash
# We will just write a new script to update the schema in server.ts
# Using a python script might be easier to safely manipulate the string, or just node script.
cat << 'NODE_SCRIPT' > patch_schema.js
const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const affordabilitySchema = `affordability: { type: 'OBJECT', properties: { estimatedCeiling: { type: 'NUMBER' }, budgetSignals: stringArray, obligationsHistory: { type: 'STRING' }, fundingAvailability: { type: 'STRING' }, confidence: { type: 'STRING' } }, required: ['budgetSignals', 'fundingAvailability', 'confidence'] },`;
const gaoSchema = `gaoFindings: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: { type: 'STRING' }, implication: { type: 'STRING' }, sourceUrl: { type: 'STRING' }, relevanceScore: { type: 'NUMBER' } }, required: ['topic', 'implication', 'relevanceScore'] } },`;
const preRfpSchema = `preRfpSignals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: { type: 'STRING' }, date: { type: 'STRING' }, summary: { type: 'STRING' }, impact: { type: 'STRING' } }, required: ['type', 'date', 'summary', 'impact'] } },`;

// Insert the new schemas into baseSchema
code = code.replace(
  /guidance: \{ type: 'OBJECT'/,
  `${affordabilitySchema} ${gaoSchema} ${preRfpSchema} guidance: { type: 'OBJECT'`
);

// Add to required list of baseSchema if needed (maybe don't make them required, or just make them optional in the prompt)
// Wait, the prompt says "produce a decision-grade market-position brief".

// Expand competitors schema
code = code.replace(
  /evidenceType: \{ type: 'STRING' \},\n    \}, required: \['name', 'role'/,
  `evidenceType: { type: 'STRING' }, demonstratedCapabilities: stringArray, deliveryModel: { type: 'STRING' }, techPlatform: { type: 'STRING' }, laborShape: { type: 'STRING' }, partnerEcosystem: stringArray, vehicleAccess: stringArray, incumbentAdvantage: { type: 'STRING' }, automationClaims: stringArray, costDrivers: stringArray, unknowns: stringArray }, required: ['name', 'role'`
);

fs.writeFileSync('server.ts', code);
NODE_SCRIPT
node patch_schema.js
