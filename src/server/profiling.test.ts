import test from 'node:test';
import assert from 'node:assert/strict';
import {profiling,timed,type Span} from './profiling';
test('progress persistence failures never discard successful stage results',async()=>{
 const spans:Span[]=[];const result=await profiling(spans,async()=>{throw Error('progress unavailable');},()=>timed('stage',async()=>42));
 assert.equal(result,42);assert.equal(spans[0].ok,true);assert.ok(spans[0].end);
});
test('overlapping requests keep timing records isolated and retain failures',async()=>{
 const a:Span[]=[],b:Span[]=[];
 await Promise.all([profiling(a,async()=>{},()=>timed('A',async()=>1)),profiling(b,async()=>{},()=>assert.rejects(timed('B',async()=>{throw Error('provider');}),/provider/))]);
 assert.deepEqual(a.map(s=>s.name),['A']);assert.deepEqual(b.map(s=>s.name),['B']);assert.equal(b[0].ok,false);
});
