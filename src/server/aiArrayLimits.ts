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
