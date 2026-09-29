import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { parse } from '../public/markdown.js';
import { readdir } from 'node:fs/promises';

await mkdir('public/fonts', { recursive: true });
for (const weight of [400, 500]) {
  const name = `geist-mono-latin-${weight}-normal.woff2`;
  await copyFile(`node_modules/@fontsource/geist-mono/files/${name}`, `public/fonts/${name}`);
}
await copyFile('node_modules/@fontsource/geist-mono/LICENSE', 'public/fonts/LICENSE.txt');
const files = (await readdir('content')).filter(path => path.endsWith('.md'));
for (const path of files) parse(path, await readFile(`content/${path}`, 'utf8'));
console.log(`Built local fonts; validated ${files.length} markdown files.`);
