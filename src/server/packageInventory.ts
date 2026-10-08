import crypto from 'node:crypto';
import unzipper from 'unzipper';
import {PACKAGE_LIMITS, type PackageDocument} from '../packageTypes';
export interface PackageFile {originalname:string;mimetype:string;size:number;buffer:Buffer}
export const digest=(buffer:Buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
const mime:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain',csv:'text/plain'};
const signals:Array<[string,RegExp,number]>=[['Amendment',/amendment|sf.?30|supersed|revis(?:ed|ion)|questions? and answers|\bQ\s*&\s*A\b/i,5],['Evaluation',/evaluation|section m\b|52\.212-2|basis (?:for|of) award|lowest.price|trade.?off/i,5],['Pricing',/pricing|price schedule|\bCLIN\b|section b\b|unit price|evaluated price|rate schedule|\bhours\b|quantit/i,5],['Scope',/statement of work|\bPWS\b|\bSOW\b|performance work|specification|drawing|deliverable|staffing/i,3],['Wages',/wage determination|52\.222|prevailing wage|collective bargaining/i,3],['Solicitation',/solicitation|\bRFP\b|\bRFQ\b|\bIFB\b|sf.?1449|sf.?33/i,4]];
export function classifyDocument(name:string,text='') {
  const categories=signals.filter(([,re])=>re.test(name+'\n'+text)).map(([label])=>label);
  return {categories,priority:Math.max(1,...signals.filter(([,re])=>re.test(name+'\n'+text)).map(([, ,weight])=>weight))};
}
export function safeArchivePath(name:string) {return !name.includes('\0')&&!/^(?:[a-z]:|\/|\\)/i.test(name)&&!name.replace(/\\/g,'/').split('/').includes('..');}
export async function inventoryPackage(inputs:PackageFile[]) {
  const documents:PackageDocument[]=[],files:Array<PackageFile & {documentId:string}>=[],seen=new Set<string>();let expanded=0,entries=0;
  const record=(name:string,size:number,status:PackageDocument['status'],note?:string,sha256?:string)=>{
    const row={id:`doc-${documents.length+1}`,name,bytes:size,status,note,sha256,...classifyDocument(name)};documents.push(row);return row;
  };
  const visit=async(file:PackageFile,depth=0):Promise<void>=>{
    if(++entries>PACKAGE_LIMITS.entries)throw new Error('Package exceeds 500 entries. Split the package into smaller ZIP files.');
    if(!safeArchivePath(file.originalname)){record(file.originalname,file.size,'UNREADABLE','Unsafe archive path rejected.');return;}
    if(/\.zip$/i.test(file.originalname)){
      if(depth>2){record(file.originalname,file.size,'UNSUPPORTED','Nested ZIP exceeds two folder-archive levels. Upload its documents separately.');return;}
      let archive:any;
      try{archive=await unzipper.Open.buffer(file.buffer);}catch{record(file.originalname,file.size,'UNREADABLE','ZIP is damaged or encrypted.');return;}
      if(entries+archive.files.length>PACKAGE_LIMITS.entries)throw new Error('Package exceeds 500 entries. Split the package into smaller ZIP files.');
      for(const entry of archive.files){
        if(entry.type==='Directory')continue;
        const name=`${file.originalname}/${entry.path}`;
        if(!safeArchivePath(entry.path)||(entry.flags&1)||((entry.externalFileAttributes>>>16)&0xf000)===0xa000){record(name,entry.uncompressedSize,'UNREADABLE','Encrypted entries, links, or unsafe paths cannot be read.');continue;}
        if(/(?:^|\/)__MACOSX\/|(?:^|\/)\._|(?:^|\/)\.DS_Store$/.test(entry.path))continue;
        if(entry.uncompressedSize>PACKAGE_LIMITS.fileBytes){record(name,entry.uncompressedSize,'UNREADABLE','File exceeds 25 MB; split it into smaller documents.');continue;}
        if(expanded+entry.uncompressedSize>PACKAGE_LIMITS.expandedBytes)throw new Error('Expanded package exceeds 200 MB. Split the package.');
        const chunks:Buffer[]=[];let bytes=0;
        try{for await(const chunk of entry.stream()){bytes+=chunk.length;if(bytes>PACKAGE_LIMITS.fileBytes||expanded+bytes>PACKAGE_LIMITS.expandedBytes)throw new Error('Expanded file limit exceeded.');chunks.push(chunk);}
          expanded+=bytes;await visit({originalname:name,mimetype:'',size:bytes,buffer:Buffer.concat(chunks)},depth+1);
        }catch(e){record(name,bytes,'UNREADABLE',e instanceof Error?e.message:'Could not decompress this file.');}
      }
      return;
    }
    if(file.size>PACKAGE_LIMITS.fileBytes){record(file.originalname,file.size,'UNREADABLE','File exceeds 25 MB; split it into smaller documents.');return;}
    const ext=file.originalname.split('.').pop()!.toLowerCase();
    if(!mime[ext]){record(file.originalname,file.size,'UNSUPPORTED','Supported documents: PDF, DOCX, XLSX, TXT and CSV. Convert this attachment if it affects pricing.');return;}
    const hash=digest(file.buffer);
    if(seen.has(hash)){record(file.originalname,file.size,'DUPLICATE','Identical content already included.',hash);return;}seen.add(hash);
    const row=record(file.originalname,file.size,'QUEUED',undefined,hash);
    files.push({...file,documentId:row.id,mimetype:mime[ext],originalname:row.name});
  };
  for(const file of inputs)await visit(file);
  return {documents,files};
}

/** Screen all text. Preserve complete short documents; select intact relevant pages/paragraphs in long ones. */
export function screenDocument(name:string,text:string){
  const tags=classifyDocument(name,text),references=[...new Set((text.match(/(?:attachment|appendix|exhibit)\s+[A-Z0-9][A-Z0-9 ._-]{0,45}/gi)||[]).map(v=>v.trim()))].slice(0,40);
  if(text.length<=90000)return {...tags,text,references,excerpted:false};
  const blocks=text.split(/(?=SOURCE: .*?\| PAGE \d+)|\n\s*\n/).flatMap(block=>block.length>60000?block.match(/[\s\S]{1,60000}/g)!:[block]);
  const ranked=blocks.map((v,i)=>({v,i,score:classifyDocument('',v).priority+(i<3?5:0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
  const selected:Array<{v:string;i:number}>=[];let size=0;
  for(const b of ranked){if(size+b.v.length>160000)continue;selected.push(b);size+=b.v.length;}
  return {...tags,text:selected.sort((a,b)=>a.i-b.i).map(b=>b.v).join('\n\n'),references,excerpted:true};
}
