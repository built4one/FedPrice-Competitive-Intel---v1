import type {LegacySchema} from './openaiIntelligence';

/** Missing measurements stay missing. Required measurement rows are dropped, never priced as zero. */
export function repairExtraction(value:unknown,schema:LegacySchema,notes:string[],path=''):any {
 const note=(message:string)=>notes.push(`AI output coverage: ${path||'root'}: ${message}.`);
 const type=schema.type.toLowerCase();
 if(type==='object'){
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  if(input!==value)note('replaced missing or invalid object');
  const result:Record<string,unknown>={};
  for(const [key,child] of Object.entries(schema.properties||{})){
   if(input[key]==null&&!schema.required?.includes(key))continue;
   const fixed=repairExtraction(input[key],child,notes,path?`${path}.${key}`:key);
   if(fixed===undefined&&schema.required?.includes(key)&&child.type.toLowerCase()==='number'){note(`dropped object with unavailable required measurement ${key}`);return undefined;}
   if(fixed!==undefined)result[key]=fixed;
  }
  return result;
 }
 if(type==='array'){
  if(!Array.isArray(value)){note('defaulted invalid or missing array to empty');return [];}
  return value.flatMap((v,i)=>{const fixed=repairExtraction(v,schema.items!,notes,`${path}[${i}]`);return fixed===undefined?[]:[fixed];});
 }
 if(schema.enum&&!schema.enum.includes(value as string)){
  const fallback=['UNKNOWN','PARTIAL','OPEN','OTHER','HIGH'].find(v=>schema.enum!.includes(v));
  note(`defaulted invalid enum to ${fallback||'unavailable'}`);return fallback;
 }
 if(type==='number'&&(typeof value!=='number'||!Number.isFinite(value))){note('omitted invalid measurement');return undefined;}
 if(type==='boolean'&&typeof value!=='boolean'){note('defaulted unverified flag to false');return false;}
 if(type==='string'&&typeof value!=='string'){note('defaulted unavailable text to empty');return '';}
 return value;
}
