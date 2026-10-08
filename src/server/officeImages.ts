import unzipper from 'unzipper';
import PDFDocument from 'pdfkit';
import type {PackageFile} from './packageInventory';
/** Preserve embedded drawings/photos that spreadsheet and DOCX text readers omit. */
export async function officeImages(file:PackageFile):Promise<{file?:PackageFile;warning?:string}>{
 if(!/\.(xlsx|docx)$/i.test(file.originalname))return {};
 const zip=await unzipper.Open.buffer(file.buffer);
 const entries=zip.files.filter(e=>/^(xl|word)\/media\//.test(e.path)&&e.type!=='Directory');
 if(!entries.length)return {};
 const supported=entries.filter(e=>/\.(png|jpe?g)$/i.test(e.path));
 const selected=supported.slice(0,20);let skipped=entries.length-selected.length,total=0;
 const doc=new PDFDocument({autoFirstPage:false});const chunks:Buffer[]=[];
 const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 let added=0;
 for(const entry of selected){
  if(entry.uncompressedSize>10*1024*1024||total+entry.uncompressedSize>25*1024*1024){skipped++;continue;}
  try{const buffer=await entry.buffer();total+=buffer.length;doc.addPage();doc.fontSize(9).text(`${file.originalname} — embedded image ${entry.path}`,36,25,{width:540});doc.image(buffer,36,65,{fit:[540,670],align:'center',valign:'center'});added++;}catch{skipped++;}
 }
 doc.end();const buffer=await done;
 return {file:added?{originalname:file.originalname+'-embedded-images.pdf',mimetype:'application/pdf',size:buffer.length,buffer}:undefined,warning:skipped?`${skipped} embedded images could not be included in visual review. Review original drawings/photos before adopting price.`:undefined};
}

export async function validateOfficeArchive(file:PackageFile){
 if(!/\.(xlsx|docx)$/i.test(file.originalname))return;
 const zip=await unzipper.Open.buffer(file.buffer);
 if(zip.files.length>5000)throw new Error('Office document contains too many internal entries. Export it to PDF.');
 let bytes=0;
 for(const entry of zip.files){
  if(entry.type==='Directory')continue;
  if(bytes+entry.uncompressedSize>50*1024*1024)throw new Error('Office document expands beyond 50 MB. Export a smaller PDF or workbook.');
  for await(const chunk of entry.stream()){bytes+=chunk.length;if(bytes>50*1024*1024)throw new Error('Office document expanded-size limit exceeded.');}
 }
}
