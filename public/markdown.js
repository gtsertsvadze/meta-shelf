export const validPath = path => /^[\w.-]+\.md$/.test(path) && path.length <= 120;

export function parseTags(value) {
  const tags = JSON.parse(value);
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new Error('tags must be a JSON object.');
  if (Object.values(tags).some(value => typeof value !== 'string')) throw new Error('every tag value must be a string.');
  return tags;
}

export function parse(path, source) {
  if (!validPath(path)) throw new Error('file must match /^[\\w.-]+\\.md$/.');
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 65536) throw new Error('file must be text under 64 KB.');
  const raw = source.replace(/\r\n?/g, '\n');
  if (path === 'README.md') {
    return { path, raw, fm: '', tags: {}, name: '', url: '', h1: '', body: raw, paras: raw.trim() ? raw.trim().split(/\n\s*\n/) : [] };
  }
  const match = raw.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error('expected frontmatter between --- lines.');
  const lines = match[1].split('\n');
  const fields = Object.create(null);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const field = lines[i].match(/^(name|url|tags):\s*(.*)$/);
    if (!field) throw new Error('frontmatter accepts name, url, and tags.');
    const [, key, value] = field;
    if (Object.hasOwn(fields, key)) throw new Error(`duplicate ${key} field.`);
    if (key === 'tags') {
      let json = value;
      while (true) {
        try { fields.tags = parseTags(json); break; }
        catch (error) {
          if (!(error instanceof SyntaxError) || i === lines.length - 1) throw error;
          json += '\n' + lines[++i];
        }
      }
    } else {
      fields[key] = value.startsWith('"') ? JSON.parse(value) : value;
      if (typeof fields[key] !== 'string' || /[\r\n]/.test(fields[key])) throw new Error(`${key} must be a single-line string.`);
    }
  }
  if (!Object.hasOwn(fields, 'name') || !Object.hasOwn(fields, 'url') || !Object.hasOwn(fields, 'tags')) throw new Error('frontmatter needs name, url, and tags.');
  const content = raw.slice(match[0].length).trim();
  const bodyMatch = content.match(/^# ([^\n]+)(?:\n\s*\n([\s\S]*))?$/);
  if (!bodyMatch) throw new Error('body needs one # title, followed by paragraphs separated by blank lines.');
  const body = bodyMatch[2] || '';
  if (/^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/m.test(body)) throw new Error('body supports one title and plain paragraphs only.');
  const fm = match[0].trimEnd();
  return { path, raw, fm, ...fields, h1: bodyMatch[1], body, paras: body ? body.split(/\n\s*\n/) : [] };
}

export function serialize({ name, url, tags, h1, body }) {
  if ([name, url, h1].some(value => /[\r\n]/.test(value))) throw new Error('name, url, and title must be single-line strings.');
  const scalar = value => value.startsWith('"') || value !== value.trim() ? JSON.stringify(value) : value;
  return `---\nname: ${scalar(name)}\nurl: ${scalar(url)}\ntags: ${JSON.stringify(tags, null, 2)}\n---\n\n# ${h1.trim()}\n${body.trim() ? '\n' + body.trim() + '\n' : ''}`;
}
