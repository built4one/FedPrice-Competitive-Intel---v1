import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { OpportunityAnalysis } from '../types';

const colors = {
  navy: '#10243E',
  blue: '#1769E0',
  paleBlue: '#EAF2FF',
  ink: '#172033',
  muted: '#667085',
  line: '#DDE3EC',
  panel: '#F6F8FB',
  amber: '#A65F00',
  paleAmber: '#FFF6E6',
  green: '#087A55',
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const regularFont = 'FMP-Regular';
const boldFont = 'FMP-Bold';
const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
const regularFontPath = requireFromProject.resolve('@fontsource/inter/files/inter-latin-400-normal.woff');
const boldFontPath = requireFromProject.resolve('@fontsource/inter/files/inter-latin-700-normal.woff');

function clean(value: unknown) {
  return String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: unknown, length = 220) {
  const normalized = clean(value);
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 3).trim()}...`;
}

function money(value: number | null | undefined) {
  return value == null
    ? 'Not supportable'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function label(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number, color = colors.muted) {
  doc.font(boldFont).fontSize(7.5).fillColor(color).text(clean(value).toUpperCase(), x, y, {
    width,
    lineBreak: false,
  });
}

function bulletList(
  doc: PDFKit.PDFDocument,
  values: string[],
  x: number,
  y: number,
  width: number,
  maxItems = 3,
) {
  let currentY = y;
  const items = values.filter(Boolean).slice(0, maxItems);
  if (!items.length) {
    doc.font(regularFont).fontSize(9).fillColor(colors.muted).text('No additional items were recorded.', x, currentY, { width });
    return currentY + 18;
  }
  for (const item of items) {
    doc.circle(x + 3, currentY + 5, 1.6).fill(colors.blue);
    doc.font(regularFont).fontSize(8.7).fillColor(colors.ink).text(truncate(item, 170), x + 11, currentY, {
      width: width - 11,
      lineGap: 2,
      height: 38,
      ellipsis: true,
    });
    currentY += Math.max(24, doc.heightOfString(truncate(item, 170), { width: width - 11, lineGap: 2 }) + 8);
  }
  return currentY;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  label(doc, title, margin, y, contentWidth);
  doc.moveTo(margin, y + 14).lineTo(pageWidth - margin, y + 14).strokeColor(colors.line).lineWidth(0.7).stroke();
  return y + 25;
}

function scenarioCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  value: number | null,
  emphasized = false,
) {
  const fill = emphasized ? colors.blue : colors.panel;
  const text = emphasized ? '#FFFFFF' : colors.ink;
  doc.roundedRect(x, y, width, 72, 8).fill(fill);
  label(doc, title, x + 14, y + 14, width - 28, emphasized ? '#DCE9FF' : colors.muted);
  doc.font(boldFont).fontSize(emphasized ? 17 : 14).fillColor(text).text(money(value), x + 14, y + 34, {
    width: width - 28,
    lineBreak: false,
    ellipsis: true,
  });
}

function pageHeader(doc: PDFKit.PDFDocument, analysis: OpportunityAnalysis) {
  doc.rect(0, 0, pageWidth, 108).fill(colors.navy);
  label(doc, 'Federal Market Position - Executive Decision Brief', margin, 24, contentWidth, '#AFCBFA');
  doc.font(boldFont).fontSize(18).fillColor('#FFFFFF').text(truncate(analysis.deal.title, 105), margin, 42, {
    width: contentWidth,
    height: 43,
    ellipsis: true,
    lineGap: 2,
  });
  doc.font(regularFont).fontSize(8.5).fillColor('#D6E0EE').text(
    clean([analysis.deal.agency, analysis.deal.solicitationNumber].filter(Boolean).join('  |  ')),
    margin,
    88,
    { width: contentWidth - 120, lineBreak: false, ellipsis: true },
  );
  doc.font(boldFont).fontSize(8).fillColor('#D6E0EE').text(
    new Date(analysis.meta.analyzedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    pageWidth - margin - 105,
    88,
    { width: 105, align: 'right', lineBreak: false },
  );
}

function buildFirstPage(doc: PDFKit.PDFDocument, analysis: OpportunityAnalysis) {
  const position = analysis.marketPosition;
  pageHeader(doc, analysis);

  label(doc, 'Recommended basis', margin, 128, 120);
  doc.font(boldFont).fontSize(10).fillColor(colors.ink).text(truncate(position.methodLabel, 70), margin, 144, { width: 260, lineBreak: false, ellipsis: true });
  label(doc, 'Confidence', 334, 128, 80);
  doc.font(boldFont).fontSize(10).fillColor(position.confidence === 'HIGH' ? colors.green : position.confidence === 'MEDIUM' ? colors.amber : '#B42318')
    .text(position.confidence, 334, 144, { width: 70, lineBreak: false });
  label(doc, 'Evidence readiness', 432, 128, 138);
  doc.font(boldFont).fontSize(10).fillColor(colors.ink).text(`${position.evidenceReadiness.score}/100`, 432, 144, { width: 138, lineBreak: false });

  const gap = 10;
  const cardWidth = (contentWidth - gap * 2) / 3;
  scenarioCard(doc, margin, 176, cardWidth, 'Aggressive', position.aggressive);
  scenarioCard(doc, margin + cardWidth + gap, 176, cardWidth, 'Expected', position.expected, true);
  scenarioCard(doc, margin + (cardWidth + gap) * 2, 176, cardWidth, 'Conservative', position.conservative);

  let y = sectionTitle(doc, 'Executive recommendation', 272);
  doc.font(boldFont).fontSize(12).fillColor(colors.navy).text(truncate(analysis.narrative.headline, 150), margin, y, { width: contentWidth, lineGap: 3 });
  y += doc.heightOfString(truncate(analysis.narrative.headline, 150), { width: contentWidth, lineGap: 3 }) + 7;
  doc.font(regularFont).fontSize(9.3).fillColor(colors.ink).text(truncate(analysis.narrative.rationale, 370), margin, y, { width: contentWidth, lineGap: 3, height: 58, ellipsis: true });

  const columnsY = 385;
  const columnWidth = (contentWidth - 20) / 2;
  doc.roundedRect(margin, columnsY, columnWidth, 154, 8).fill(colors.panel);
  doc.roundedRect(margin + columnWidth + 20, columnsY, columnWidth, 154, 8).fill(colors.paleAmber);
  label(doc, 'Why this position', margin + 14, columnsY + 14, columnWidth - 28, colors.blue);
  bulletList(doc, [...analysis.narrative.decisionFactors, ...position.basis], margin + 14, columnsY + 36, columnWidth - 28, 3);
  label(doc, 'What could move it', margin + columnWidth + 34, columnsY + 14, columnWidth - 28, colors.amber);
  bulletList(doc, [...position.sensitivities, ...analysis.narrative.guardrails], margin + columnWidth + 34, columnsY + 36, columnWidth - 28, 3);

  y = sectionTitle(doc, 'Recommended next actions', 568);
  const actions = analysis.narrative.nextActions.slice(0, 3);
  actions.forEach((action, index) => {
    doc.roundedRect(margin, y - 2, 19, 19, 9.5).fill(colors.paleBlue);
    doc.font(boldFont).fontSize(8).fillColor(colors.blue).text(String(index + 1), margin, y + 4, { width: 19, align: 'center', lineBreak: false });
    doc.font(regularFont).fontSize(8.8).fillColor(colors.ink).text(truncate(action, 155), margin + 29, y, { width: contentWidth - 29, height: 30, ellipsis: true, lineGap: 2 });
    y += 34;
  });

  const benchmarkY = 672;
  doc.roundedRect(margin, benchmarkY, contentWidth, 38, 7).fill(colors.panel);
  label(doc, 'Public market benchmark', margin + 12, benchmarkY + 9, 145);
  doc.font(boldFont).fontSize(8.5).fillColor(colors.ink).text(
    `${position.publicBenchmark.status.replaceAll('_', ' ')}${position.publicBenchmark.expected !== null ? `  |  ${money(position.publicBenchmark.expected)}` : ''}`,
    margin + 170,
    benchmarkY + 13,
    { width: contentWidth - 182, align: 'right', lineBreak: false, ellipsis: true },
  );
}

function buildSecondPage(doc: PDFKit.PDFDocument, analysis: OpportunityAnalysis) {
  const position = analysis.marketPosition;
  doc.addPage();
  label(doc, 'Federal Market Position - Evidence Basis', margin, 36, contentWidth, colors.blue);
  doc.font(boldFont).fontSize(16).fillColor(colors.navy).text('Decision support and calculation lineage', margin, 55, { width: contentWidth });
  doc.moveTo(margin, 84).lineTo(pageWidth - margin, 84).strokeColor(colors.line).stroke();

  let y = sectionTitle(doc, 'Primary calculation inputs', 104);
  const used = position.anchors.filter((anchor) => anchor.included).slice(0, 7);
  if (!used.length) {
    doc.roundedRect(margin, y, contentWidth, 46, 7).fill(colors.paleAmber);
    doc.font(regularFont).fontSize(9).fillColor(colors.amber).text('No eligible numeric input supported a responsible estimate.', margin + 12, y + 16, { width: contentWidth - 24 });
    y += 60;
  } else {
    label(doc, 'Source / evidence', margin, y, 260);
    label(doc, 'Normalized value', 392, y, 178);
    y += 17;
    for (const anchor of used) {
      doc.moveTo(margin, y + 29).lineTo(pageWidth - margin, y + 29).strokeColor('#EDF0F5').lineWidth(0.6).stroke();
      doc.font(boldFont).fontSize(8.5).fillColor(colors.ink).text(truncate(anchor.sourceLabel, 72), margin, y, { width: 250, lineBreak: false, ellipsis: true });
      doc.font(regularFont).fontSize(7.7).fillColor(colors.muted).text(truncate(`${anchor.evidenceId} | ${anchor.valueType.replaceAll('_', ' ')}`, 88), margin, y + 13, { width: 310, lineBreak: false, ellipsis: true });
      doc.font(boldFont).fontSize(9).fillColor(colors.ink).text(money(anchor.normalizedValue ?? anchor.originalValue), 392, y + 5, { width: 178, align: 'right', lineBreak: false, ellipsis: true });
      y += 34;
    }
    y += 10;
  }

  const sourceStatuses = analysis.meta.connectors || [];
  y = sectionTitle(doc, 'Source coverage', y);
  const statusWidth = (contentWidth - 24) / 4;
  sourceStatuses.slice(0, 4).forEach((connector, index) => {
    const x = margin + index * (statusWidth + 8);
    doc.roundedRect(x, y, statusWidth, 48, 6).fill(colors.panel);
    label(doc, connector.name, x + 9, y + 9, statusWidth - 18);
    doc.font(boldFont).fontSize(8.5).fillColor(colors.ink).text(clean(connector.status.replaceAll('_', ' ')), x + 9, y + 26, { width: statusWidth - 18, lineBreak: false, ellipsis: true });
  });
  y += 67;

  y = sectionTitle(doc, 'Assumptions and constraints', y);
  y = bulletList(doc, [...position.assumptions, ...position.constraints], margin, y, contentWidth, 5) + 7;

  y = sectionTitle(doc, 'Critical gaps and sensitivities', y);
  const gaps = [...new Set([
    ...position.sensitivities,
    ...analysis.gaps.filter((gap) => gap.priority === 'HIGH').map((gap) => `${gap.question} ${gap.impact}`),
  ])];
  bulletList(doc, gaps, margin, y, contentWidth, 5);

  doc.font(regularFont).fontSize(7.5).fillColor(colors.muted).text(
    `Method: ${clean(position.methodLabel)} | Engine: ${clean(position.formulaVersion)} | Status: ${clean(position.rangeStatus.replaceAll('_', ' '))}`,
    margin,
    704,
    { width: contentWidth, align: 'left', lineBreak: false, ellipsis: true },
  );
}

function addFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.moveTo(margin, 720).lineTo(pageWidth - margin, 720).strokeColor(colors.line).lineWidth(0.6).stroke();
    doc.font(regularFont).fontSize(7).fillColor(colors.muted).text('Federal Market Position | Decision support - validate before bid submission', margin, 725, {
      width: contentWidth - 65,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font(boldFont).fontSize(7).fillColor(colors.muted).text(`${index + 1} / ${range.count}`, pageWidth - margin - 55, 725, {
      width: 55,
      align: 'right',
      lineBreak: false,
    });
  }
}

export function createExecutivePdf(analysis: OpportunityAnalysis): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: margin, bottom: margin, left: margin, right: margin }, bufferPages: true, autoFirstPage: true });
    doc.registerFont(regularFont, regularFontPath);
    doc.registerFont(boldFont, boldFontPath);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    buildFirstPage(doc, analysis);
    buildSecondPage(doc, analysis);
    addFooters(doc);
    doc.end();
  });
}

export const executivePdfLayout = { pageWidth, pageHeight, margin, contentWidth };
