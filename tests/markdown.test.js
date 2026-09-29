import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, parseTags, serialize, validPath } from '../public/markdown.js';

test('markdown round trips and preserves arbitrary tag keys', async () => {
  const raw = await readFile('content/tomfoolery.md', 'utf8');
  const file = parse('tomfoolery.md', raw);
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
  assert.throws(() => parse('README.md', ''));
  assert.throws(() => parse('test.md', serialize({ name: 'test', url: '', tags: {}, h1: '', body: '' })));
});
