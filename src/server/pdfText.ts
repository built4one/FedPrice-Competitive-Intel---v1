import type { IntelligenceFile } from './openaiIntelligence';

// PDF.js 5 can reference browser canvas globals at module load in Node/serverless runtimes.
// Text extraction does not render pages, so lightweight shims are sufficient and avoid
// making a native canvas package a hard runtime dependency on Vercel.
function installPdfTextGlobals() {
  const g = globalThis as any;
  if (!g.DOMMatrix) {
    g.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; is2D = true;
      constructor(init?: ArrayLike<number>) {
        if (init && typeof init !== 'string' && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init).slice(0, 6).map(Number);
        }
      }
      multiplySelf(other: any) {
        const { a, b, c, d, e, f } = this;
        this.a = a * other.a + c * other.b;
        this.b = b * other.a + d * other.b;
        this.c = a * other.c + c * other.d;
        this.d = b * other.c + d * other.d;
        this.e = a * other.e + c * other.f + e;
        this.f = b * other.e + d * other.f + f;
        return this;
      }
      preMultiplySelf(other: any) {
        const current = new g.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
        this.a = other.a; this.b = other.b; this.c = other.c;
        this.d = other.d; this.e = other.e; this.f = other.f;
        return this.multiplySelf(current);
      }
      translateSelf(tx = 0, ty = 0) { return this.multiplySelf(new g.DOMMatrix([1, 0, 0, 1, tx, ty])); }
      scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new g.DOMMatrix([sx, 0, 0, sy, 0, 0])); }
      rotateSelf(angle = 0) {
        const r = angle * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
        return this.multiplySelf(new g.DOMMatrix([cos, sin, -sin, cos, 0, 0]));
      }
      transformPoint(point: any = {}) {
        const x = Number(point.x ?? 0), y = Number(point.y ?? 0);
        return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: point.z ?? 0, w: point.w ?? 1 };
      }
    };
  }
  if (!g.ImageData) g.ImageData = class ImageData {};
  if (!g.Path2D) g.Path2D = class Path2D {};
}

// Preserve page locators while avoiding image-token processing for digital PDFs.
// Any page without a usable text layer keeps the original PDF for visual reading.
export async function normalizePdfText<T extends IntelligenceFile & { size: number }>(file: T): Promise<T> {
  if (!/\.pdf$/i.test(file.originalname)) return file;
  // Security forms may have checkboxes or markings outside their text layer.
  if (/\bdd[\s+_-]*254\b/i.test(file.originalname)) return file;

  let task: any;
  try {
    installPdfTextGlobals();
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = getDocument({
      data: new Uint8Array(file.buffer),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
      verbosity: 0,
    });
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')
        .join('')
        .trim();
      // SF1449 eligibility is conveyed by selected boxes, which a text layer can
      // list without preserving selection. Keep the visual form for extraction.
      if (i === 1 && /SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL|STANDARD FORM\s*1449|SF\s*1449/i.test(text)
        && /SET.?ASIDE|WOSB|WOMEN.OWNED|SMALL BUSINESS/i.test(text)) return file;
      // Scanned/image-only pages must stay as PDFs so the AI can inspect the visual page.
      if (text.replace(/\s/g, '').length < 25) return file;
      pages.push(`SOURCE: ${file.originalname} | PAGE ${i}\n${text}`);
      page.cleanup();
    }
    const buffer = Buffer.from(pages.join('\n\n'), 'utf8');
    return { ...file, originalname: `${file.originalname}.txt`, mimetype: 'text/plain', buffer, size: buffer.length };
  } catch (error) {
    // Never fail an RFP upload because the optional text-normalization path is unavailable.
    console.warn(`PDF text normalization skipped for ${file.originalname}:`, error);
    return file;
  } finally {
    try { await task?.destroy?.(); } catch { /* best-effort cleanup */ }
  }
}
