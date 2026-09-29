import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseTags, serialize, validPath } from '../public/markdown.js';

test('markdown round trips and preserves arbitrary tag keys', () => {
  const raw = serialize({ name: 'Test', url: 'example.invalid', tags: { type: 'test' }, h1: 'Test', body: 'First paragraph.\n\nSecond paragraph.' });
  const file = parse('test.md', raw);
  const tags = { ...file.tags, 'any key': 'any value', none: 'valid too' };
  const result = parse('project.md', serialize({ ...file, tags }));
  assert.deepEqual(result.tags, tags);
  assert.equal(result.h1, file.h1);
  assert.equal(result.body, file.body);
  assert.equal(parse('README.md', 'one\ntwo\nthree').raw, 'one\ntwo\nthree');
});

test('rejects malformed tags, frontmatter, and paths', () => {
  for (const tags of ['[]', 'null', '{"type": 2}', '{broken}']) assert.throws(() => parseTags(tags));
  assert.equal(validPath('../test.md'), false);
  assert.equal(validPath('project-name.md'), true);
  assert.throws(() => parse('test.md', '# no frontmatter'));
  assert.deepEqual(parse('README.md', '').paras, []);
  assert.throws(() => parse('test.md', serialize({ name: 'test', url: '', tags: {}, h1: '', body: '' })));
});
