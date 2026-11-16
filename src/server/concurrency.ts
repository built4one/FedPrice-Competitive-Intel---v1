/** Bounded concurrency preserves input order and waits for every result. */
export async function mapConcurrent<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>):Promise<R[]> {
 const results:R[]=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{
  for(;;){const index=cursor++;if(index>=items.length)return;results[index]=await fn(items[index],index);}
 }));
 return results;
}
