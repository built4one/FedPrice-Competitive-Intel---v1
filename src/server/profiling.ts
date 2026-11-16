import {AsyncLocalStorage} from 'node:async_hooks';
export interface Span {name:string;start:number;end?:number;ms?:number;ok?:boolean}
const context=new AsyncLocalStorage<{spans:Span[];update:()=>Promise<void>}>();
export async function timed<T>(name:string,fn:()=>Promise<T>):Promise<T>{
 const c=context.getStore();if(!c)return fn();const span:Span={name,start:Date.now()};c.spans.push(span);await c.update().catch(()=>{});
 try{const value=await fn();span.ok=true;return value;}catch(e){span.ok=false;throw e;}finally{span.end=Date.now();span.ms=span.end-span.start;await c.update().catch(()=>{});}
}
export const profiling=<T>(spans:Span[],update:()=>Promise<void>,fn:()=>Promise<T>)=>context.run({spans,update},fn);
