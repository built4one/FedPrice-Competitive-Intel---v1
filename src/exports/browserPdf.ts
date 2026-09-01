import type { OpportunityAnalysis } from '../types';

const ascii = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const escapePdf = (value: string) => ascii(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const money = (value: number | null | undefined) => value == null
  ? 'Not supportable'
  : new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);

function wrap(value: string, max = 88) {
  const words = ascii(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createBrowserExecutivePdf(analysis: OpportunityAnalysis) {
  const position = analysis.marketPosition;
  const lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }> = [
    { text: 'FEDERAL MARKET POSITION - EXECUTIVE DECISION BRIEF', size: 9, bold: true, gap: 18 },
    ...wrap(analysis.deal.title, 56).slice(0, 2).map((text, index) => ({ text, size: 17, bold: true, gap: index === 0 ? 21 : 24 })),
    { text: [analysis.deal.agency, analysis.deal.solicitationNumber].filter(Boolean).join(' | '), size: 9, gap: 22 },
    { text: `AGGRESSIVE  ${money(position.aggressive)}`, size: 13, bold: true, gap: 19 },
    { text: `EXPECTED    ${money(position.expected)}`, size: 17, bold: true, gap: 23 },
    { text: `CONSERVATIVE  ${money(position.conservative)}`, size: 13, bold: true, gap: 25 },
    { text: `METHOD: ${position.methodLabel}`, size: 9, bold: true, gap: 14 },
    { text: `STATUS: ${position.rangeStatus.replaceAll('_', ' ')} | CONFIDENCE: ${position.confidence} | EVIDENCE READINESS: ${position.evidenceReadiness.score}/100`, size: 9, gap: 22 },
    { text: 'RECOMMENDATION', size: 10, bold: true, gap: 16 },
    ...wrap(analysis.narrative.rationale, 92).slice(0, 5).map((text) => ({ text, size: 9, gap: 13 })),
    { text: 'WHY THIS POSITION', size: 10, bold: true, gap: 18 },
    ...[...analysis.narrative.decisionFactors, ...position.basis].slice(0, 3).flatMap((item) =>
      wrap(`- ${item}`, 92).slice(0, 3).map((text) => ({ text, size: 9, gap: 13 }))),
    { text: 'WHAT COULD MOVE IT', size: 10, bold: true, gap: 18 },
    ...[...position.sensitivities, ...analysis.narrative.guardrails].slice(0, 3).flatMap((item) =>
      wrap(`- ${item}`, 92).slice(0, 3).map((text) => ({ text, size: 9, gap: 13 }))),
    { text: 'NEXT ACTIONS', size: 10, bold: true, gap: 18 },
    ...analysis.narrative.nextActions.slice(0, 3).flatMap((item) =>
      wrap(`- ${item}`, 92).slice(0, 2).map((text) => ({ text, size: 9, gap: 13 }))),
  ];

  let y = 748;
  const commands: string[] = [];
  for (const line of lines) {
    if (y < 45) break;
    const font = line.bold ? '/F2' : '/F1';
    commands.push(`BT ${font} ${line.size ?? 9} Tf 42 ${y} Td (${escapePdf(line.text)}) Tj ET`);
    y -= line.gap ?? 13;
  }
  commands.push('BT /F1 7 Tf 42 24 Td (Generated from the authoritative Market Position result. See Excel export for full evidence lineage.) Tj ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
