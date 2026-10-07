import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSamPostedDateWindows, parseSamOpportunityReference, lookupSamOpportunity, resolveSamOpportunityPackage } from './sam';

test('reuses an exact notice across repeated number and URL lookups',async()=>{
  const originalFetch=global.fetch; const originalKey=process.env.SAM_API_KEY;
  process.env.SAM_API_KEY='cache-unit-test'; let calls=0;
  global.fetch=async()=>{calls++;return new Response(JSON.stringify({totalRecords:1,opportunitiesData:[{noticeId:'cache-notice',solicitationNumber:'CACHE-TEST-001',title:'Cached notice'}]}),{status:200});};
  try {
    await Promise.all([lookupSamOpportunity('CACHE-TEST-001'),lookupSamOpportunity('CACHE-TEST-001')]);
    const result=await lookupSamOpportunity('https://sam.gov/opp/cache-notice/view');
    assert.equal(result.solicitationNumber,'CACHE-TEST-001');assert.equal(calls,1);
  } finally {global.fetch=originalFetch;if(originalKey===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=originalKey;}
});

test('parses a solicitation number as the primary SAM lookup key', () => {
  assert.deepEqual(parseSamOpportunityReference('80TECH24R0001'), { solicitationNumber: '80TECH24R0001' });
});

test('parses a canonical SAM opportunity URL', () => {
  assert.deepEqual(
    parseSamOpportunityReference('https://sam.gov/opp/d3567052dd7e4bbe89ed72d2feefdd7c/view'),
    { noticeId: 'd3567052dd7e4bbe89ed72d2feefdd7c' },
  );
});

test('parses a SAM workspace opportunity URL', () => {
  assert.deepEqual(
    parseSamOpportunityReference('https://sam.gov/workspace/contract/opp/d3567052dd7e4bbe89ed72d2feefdd7c/view'),
    { noticeId: 'd3567052dd7e4bbe89ed72d2feefdd7c' },
  );
});

test('SAM posted-date windows remain below the one-year API limit across leap years', () => {
  const windows = buildSamPostedDateWindows(new Date('2024-08-30T12:00:00Z'), 6);
  assert.equal(windows.length, 6);
  for (const window of windows) {
    const [fromMonth, fromDay, fromYear] = window.postedFrom.split('/').map(Number);
    const [toMonth, toDay, toYear] = window.postedTo.split('/').map(Number);
    const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
    const to = Date.UTC(toYear, toMonth - 1, toDay);
    assert.ok((to - from) / (24 * 60 * 60 * 1000) <= 364);
  }
});

test('SAM attachments enforce the package budget and stop before downloading another file', async()=>{
  const originalFetch=global.fetch, originalKey=process.env.SAM_API_KEY;
  process.env.SAM_API_KEY='package-budget-unit-test';
  let downloads=0;
  global.fetch=async(url)=>{
    if (String(url).includes('/opportunities/v2/search')) return new Response(JSON.stringify({totalRecords:1,opportunitiesData:[{
      noticeId:'budget-notice',solicitationNumber:'BUDGET-TEST-001',
      resourceLinks:Array.from({length:4},(_,i)=>`https://sam.gov/attachment/budget-${i}.txt`),
    }]}));
    downloads++;
    return new Response(new Uint8Array(8*1024*1024), {headers:{'content-type':'text/plain'}});
  };
  try {
    const result=await resolveSamOpportunityPackage('BUDGET-TEST-001');
    assert.equal(downloads,3);
    assert.equal(result.files.reduce((sum,f)=>sum+f.size,0),24*1024*1024);
    assert.equal(result.adapterResult.samDocuments!.filter(d=>d.retrievalStatus==='TOO_LARGE').length,1);
  } finally {global.fetch=originalFetch;if(originalKey===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=originalKey;}
});

test('an oversized headerless SAM attachment is cancelled and reported as TOO_LARGE', async()=>{
  const originalFetch=global.fetch, originalKey=process.env.SAM_API_KEY;
  process.env.SAM_API_KEY='oversized-stream-unit-test';
  let cancelled=false,reads=0;
  global.fetch=async(url)=>{
    if (String(url).includes('/opportunities/v2/search')) return new Response(JSON.stringify({totalRecords:1,opportunitiesData:[{
      noticeId:'oversized-notice',solicitationNumber:'OVERSIZED-TEST-001',resourceLinks:['https://sam.gov/attachment/oversized.txt'],
    }]}));
    return new Response(new ReadableStream({
      pull(controller) {reads++;controller.enqueue(new Uint8Array(1024*1024));},
      cancel() {cancelled=true;},
    },{highWaterMark:0}));
  };
  try {
    const result=await resolveSamOpportunityPackage('OVERSIZED-TEST-001');
    assert.equal(result.files.length,0);assert.equal(reads,9);assert.equal(cancelled,true);
    assert.equal(result.adapterResult.samDocuments![0].retrievalStatus,'TOO_LARGE');
  } finally {global.fetch=originalFetch;if(originalKey===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=originalKey;}
});
