import type { IntelligenceFile } from './openaiIntelligence';

// Preserve page locators while avoiding image-token processing for digital PDFs.
// Any page without a usable text layer keeps the original PDF for visual reading.
export async function normalizePdfText<T extends IntelligenceFile & {size:number}>(file: T): Promise<T> {
  if (!/\.pdf$/i.test(file.originalname)) return file;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(file.buffer), isEvalSupported:false, disableFontFace:true, useSystemFonts:true, verbosity:0 });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
      if (text.replace(/\s/g,'').length < 200) return file;
      pages.push(`SOURCE: ${file.originalname} | PAGE ${i}\n${text}`);
      page.cleanup();
    }
    const buffer = Buffer.from(pages.join('\n\n'),'utf8');
    return {...file,originalname:`${file.originalname}.txt`,mimetype:'text/plain',buffer,size:buffer.length};
  } catch {
    return file;
  } finally {
    await task.destroy();
  }
}
