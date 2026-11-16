import test from 'node:test';
import assert from 'node:assert/strict';
import {mapConcurrent} from './concurrency';
test('bounded parallel work retains every result in deterministic order',async()=>{
 let active=0,peak=0;const seen:number[]=[];
 const out=await mapConcurrent([0,1,2,3,4,5,6],3,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,7-n));active--;seen.push(n);return n*2;});
 assert.equal(peak,3);assert.equal(seen.length,7);assert.deepEqual(out,[0,2,4,6,8,10,12]);
});
