const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /1\) Extract the deal and evaluation facts\. 2\) Identify pricing and staffing signals\. 3\) assemble an evidence ledger\./,
  `1) Extract the deal and evaluation facts. 2) Identify pricing, staffing, affordability, pre-RFP signals, and GAO/protest history if present. 3) assemble an evidence ledger.`
);

code = code.replace(
  /4\) assess likely competition and incumbent posture with explicit fact\/inference labels\./,
  `4) Assess likely competition with structured reconstruction (tech, labor shape, capabilities, etc) and incumbent posture.`
);

fs.writeFileSync('server.ts', code);
