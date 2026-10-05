import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OpenAIIntelligence } from './openaiIntelligence.js';

const response = (output: unknown) => new Response(JSON.stringify({ status: 'completed', output }), {
  status: 200, headers: { 'content-type': 'application/json' },
});

test('extract sends files and strict schema without retaining API response', async () => {
  let request: Record<string, any> = {};
  const client = new OpenAIIntelligence('test-key', 'gpt-5.4', async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return response([{ type: 'message', content: [{ type: 'output_text', text: '{"title":"Notice","optional":null}' }] }]);
  });
  const result = await client.extract<{ title: string }>('Extract facts', [
    { originalname: 'notice.txt', mimetype: 'text/plain', buffer: Buffer.from('A solicitation') },
  ], { type: 'OBJECT', properties: { title: { type: 'STRING' }, optional: { type: 'STRING' } }, required: ['title'] });
  assert.deepEqual(result, { title: 'Notice' });
  assert.equal(request.store, false);
  assert.equal(request.input[0].content[1].type, 'input_text');
  assert.match(request.input[0].content[1].text,/A solicitation/);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.deepEqual(request.text.format.schema.required, ['title', 'optional']);
  assert.deepEqual(request.text.format.schema.properties.optional.anyOf[1], { type: 'null' });
});

test('research requires an actual search and returns cited sources', async () => {
  let request: Record<string, any> = {};
  const client = new OpenAIIntelligence('test-key', 'gpt-5.4', async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return response([
      { type: 'web_search_call', action: { sources: [{ url: 'https://sam.gov/notice', title: 'SAM' }] } },
      { type: 'message', content: [{ type: 'output_text', text: '```json\n{"narrative":"Evidence only"}\n```' }] },
    ]);
  });
  const result = await client.research<{ narrative: string }>('Public facts');
  assert.equal(result.sources[0].url, 'https://sam.gov/notice');
  assert.equal(result.analysis.narrative, 'Evidence only');
  assert.equal(request.tool_choice, 'required');
  assert.equal(request.tools[0].type, 'web_search');
  assert.equal(request.text.format, undefined, 'Web search cannot be combined with JSON response mode');
});

test('research fails when no web search occurred', async () => {
  const client = new OpenAIIntelligence('test-key', 'gpt-5.4', async () => response([
    { type: 'message', content: [{ type: 'output_text', text: '{}' }] },
  ]));
  await assert.rejects(client.research('Public facts'), /did not perform public web research/);
});
