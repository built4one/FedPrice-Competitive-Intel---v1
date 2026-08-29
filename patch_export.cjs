const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const exportRegex = /app\.post\('\/api\/export-brief'.*?\n\}\);/s;

// We need to inject an update to the ExcelJS creation.
// Rather than fully rewriting with regex, I'll just write a replace logic for the specific addWorksheet parts.

code = code.replace(
  /const summary = workbook\.addWorksheet\('Market Position'\);.*?const evidence = workbook\.addWorksheet\('Evidence Ledger'\);/s,
  `
    const summary = workbook.addWorksheet('Market Position');
    summary.columns = [{ header: 'Field', key: 'field', width: 30 }, { header: 'Value', key: 'value', width: 90 }];
    
    summary.addRows([
      { field: 'Opportunity', value: analysis.deal.title },
      { field: 'Agency', value: analysis.deal.agency },
      { field: 'Solicitation', value: analysis.deal.solicitationNumber },
      { field: 'Market Low', value: analysis.marketPosition.low || 'Insufficient evidence' },
      { field: 'Market Target', value: analysis.marketPosition.target || 'Insufficient evidence' },
      { field: 'Market High', value: analysis.marketPosition.high || 'Insufficient evidence' },
      { field: 'Range Status', value: analysis.marketPosition.rangeStatus },
      { field: 'Confidence', value: analysis.marketPosition.confidenceScore + '%' }
    ]);
    
    // Add Intelligence
    const intel = workbook.addWorksheet('Intelligence');
    intel.columns = [{ header: 'Category', key: 'cat', width: 20 }, { header: 'Finding', key: 'find', width: 100 }];
    if (analysis.affordability) {
      intel.addRow({ cat: 'Affordability', find: 'Est. Ceiling: ' + analysis.affordability.estimatedCeiling });
      intel.addRow({ cat: 'Budget Signals', find: analysis.affordability.budgetSignals?.join('; ') });
    }
    analysis.gaoFindings?.forEach(g => intel.addRow({ cat: 'GAO Protest', find: g.topic + ' - ' + g.implication }));
    analysis.preRfpSignals?.forEach(p => intel.addRow({ cat: 'Pre-RFP Signal', find: p.type + ': ' + p.summary }));

    // Add Competitors
    const comps = workbook.addWorksheet('Competitors');
    comps.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'Role', key: 'role', width: 20 }, { header: 'Capabilities', key: 'cap', width: 50 }, { header: 'Tech', key: 'tech', width: 30 }];
    analysis.competitors.forEach(c => {
      comps.addRow({ name: c.name, role: c.role, cap: c.demonstratedCapabilities?.join(', '), tech: c.techPlatform });
    });

    const evidence = workbook.addWorksheet('Evidence Ledger');
`
);

fs.writeFileSync('server.ts', code);
