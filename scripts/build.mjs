import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('public/fonts', { recursive: true });
for (const weight of [400, 500]) {
  const name = `geist-mono-latin-${weight}-normal.woff2`;
  await copyFile(`node_modules/@fontsource/geist-mono/files/${name}`, `public/fonts/${name}`);
}
await copyFile('node_modules/@fontsource/geist-mono/LICENSE', 'public/fonts/LICENSE.txt');
console.log('Built local fonts. Project content is managed through the admin editor.');
