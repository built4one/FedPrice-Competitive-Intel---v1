import {z} from 'zod';

type Select = (rows:unknown[], limit:number, path:string) => unknown[];

/** Normalize cardinality only. Types, minimums and semantic validators still run. */
export function trimAiArrays(value:unknown,schema:z.ZodTypeAny,notes:string[],select?:Select,path=''):unknown {
  if(schema instanceof z.ZodDefault || schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return trimAiArrays(value,schema._def.innerType,notes,select,path);
  if(schema instanceof z.ZodEffects)return trimAiArrays(value,schema.innerType(),notes,select,path);
  if(schema instanceof z.ZodArray && Array.isArray(value)){
    const limit=schema._def.maxLength?.value;
    let rows=value;
    if(limit!==undefined && rows.length>limit){
      rows=select?select(rows,limit,path):rows.slice(0,limit);
      notes.push(`AI output coverage: ${path}: kept ${rows.length} of ${value.length}; dropped ${value.length-rows.length} (limit ${limit}).`);
    }
    return rows.map((item,i)=>trimAiArrays(item,schema.element,notes,select,`${path}[${i}]`));
  }
  if(schema instanceof z.ZodObject && value && typeof value==='object' && !Array.isArray(value)){
    const result={...value} as Record<string,unknown>;
    for(const [key,child] of Object.entries(schema.shape))if(key in result)
      result[key]=trimAiArrays(result[key],child as z.ZodTypeAny,notes,select,path?`${path}.${key}`:key);
    return result;
  }
  return value;
}

/** Stable ties preserve model order; scores must come from source support. */
export function strongest(rows:unknown[],limit:number,score:(value:any)=>number):unknown[]{
  return rows.map((value,index)=>({value,index,score:score(value)}))
    .sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,limit).map(r=>r.value);
}

/** Repair structural output only. Never manufacture numeric evidence or source classifications. */
export function repairAiOutput(value:unknown,schema:z.ZodTypeAny,notes:string[],path=''):unknown {
  const note=(action:string)=>notes.push(`AI output coverage: ${path||'root'}: ${action}.`);
  if(schema instanceof z.ZodDefault){if(value==null){note('used schema default');return schema._def.defaultValue();}return repairAiOutput(value,schema._def.innerType,notes,path);}
  if(schema instanceof z.ZodOptional || schema instanceof z.ZodNullable){if(value==null)return undefined;return repairAiOutput(value,schema._def.innerType,notes,path);}
  if(schema instanceof z.ZodEffects)return repairAiOutput(value,schema.innerType(),notes,path);
  if(schema instanceof z.ZodObject){
    const input=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
    if(input!==value)note('replaced invalid object with empty fields');
    return Object.fromEntries(Object.entries(schema.shape).map(([k,s])=>[k,repairAiOutput(input[k],s as z.ZodTypeAny,notes,path?`${path}.${k}`:k)]));
  }
  if(schema instanceof z.ZodArray){
    if(!Array.isArray(value)){note('replaced invalid or missing array with empty array');return [];}
    return value.flatMap((v,i)=>{const fixed=repairAiOutput(v,schema.element,notes,`${path}[${i}]`);if(!schema.element.safeParse(fixed).success){note(`dropped invalid item ${i}`);return [];}return [fixed];});
  }
  if(schema instanceof z.ZodEnum && !schema.options.includes(value)){
    const fallback=['UNKNOWN','ASSUMPTION'].find(v=>schema.options.includes(v));
    note(`invalid enum defaulted to ${fallback||'unavailable'}`);return fallback;
  }
  if(schema instanceof z.ZodString){
    if(typeof value!=='string'){note('replaced invalid or missing text with empty text');return '';}
    const max=schema._def.checks.find(c=>c.kind==='max');
    if(max&&max.kind==='max'&&value.length>max.value){note(`trimmed text from ${value.length} to ${max.value} characters`);return value.slice(0,max.value);}
  }
  return value;
}
