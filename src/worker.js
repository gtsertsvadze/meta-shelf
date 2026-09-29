import { parse, validPath } from '../public/markdown.js';

const encoder = new TextEncoder();
const lifetime = 60 * 60 * 24;
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function equal(a, b) {
  const [left, right] = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(left, right);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function authenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)metashelf_session=([^;]+)/)?.[1];
  if (!token || !/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split('.');
  if (Number(expires) <= Date.now()) return false;
  return equal(signature, await sign(`${expires}.${nonce}`, env.SESSION_SECRET));
}

function cookie(request, value, age) {
  return `metashelf_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail('expected application/json.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw fail('expected a JSON body.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); throw fail('request is too large.', 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw fail('invalid JSON.'); }
}

async function readFile(env, path) {
  const saved = await env.FILES.get(`file:${path}`);
  return path === 'README.md' ? (saved ?? '') : (saved || null);
}

async function files(env) {
  // The protected README starts blank; all authored content lives in KV.
  const values = new Map([['README.md', '']]);
  let cursor;
  do {
    const page = await env.FILES.list({ prefix: 'file:', cursor });
    const entries = await Promise.all(page.keys.map(async key => [key.name.slice(5), await env.FILES.get(key.name)]));
    for (const [path, raw] of entries) {
      // Ignore legacy project deletion tombstones; an empty README is valid.
      if (raw !== null && (raw !== '' || path === 'README.md')) values.set(path, raw);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return [...values].map(([path, raw]) => ({ path, raw }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.get('Origin');
        if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw fail('origin not allowed.', 403);
      }

      if (url.pathname === '/api/auth') {
        if (request.method === 'GET') return json({ authenticated: await authenticated(request, env) });
        if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
        if (request.method !== 'POST') throw fail('method not allowed.', 405);
        if (!env.ADMIN_PASSPHRASE || !env.SESSION_SECRET) throw fail('admin authentication is not configured.', 503);
        const { success } = await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
        if (!success) return json({ error: 'too many attempts. try again in a minute.' }, 429, { 'Retry-After': '60' });
        const payload = await body(request);
        if (typeof payload?.passphrase !== 'string' || !(await equal(payload.passphrase, env.ADMIN_PASSPHRASE))) throw fail('permission denied', 401);
        const token = `${Date.now() + lifetime * 1000}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
        return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, `${token}.${await sign(token, env.SESSION_SECRET)}`, lifetime) });
      }

      if (url.pathname === '/api/files' && request.method === 'GET') return json(await files(env));

      if (url.pathname.startsWith('/api/files/')) {
        let path;
        try { path = decodeURIComponent(url.pathname.slice(11)); } catch { throw fail('invalid file path.'); }
        if (!validPath(path)) throw fail('invalid file path.');
        if (request.method === 'GET') {
          const raw = await readFile(env, path);
          if (raw === null) throw fail('file not found.', 404);
          return json({ path, raw });
        }
        if (!['PUT', 'DELETE'].includes(request.method)) throw fail('method not allowed.', 405);
        if (!(await authenticated(request, env))) throw fail('permission denied. try sudo.', 401);
        const existing = await readFile(env, path);
        if (request.method === 'DELETE') {
          if (path === 'README.md') throw fail('README.md is protected.', 403);
          if (existing === null) throw fail('file not found.', 404);
          await env.FILES.delete(`file:${path}`);
          return json({ ok: true });
        }
        if (request.headers.get('If-None-Match') === '*' && existing !== null) throw fail('file already exists.', 409);
        const payload = await body(request);
        let file;
        try { file = parse(path, payload?.raw); } catch (error) { throw fail(error.message); }
        await env.FILES.put(`file:${path}`, file.raw);
        return json({ path, raw: file.raw }, existing === null ? 201 : 200);
      }

      if (url.pathname.startsWith('/api/')) throw fail('not found.', 404);
      if (url.pathname.endsWith('.md') && ['GET', 'HEAD'].includes(request.method)) {
        const path = decodeURIComponent(url.pathname.slice(1));
        const raw = validPath(path) ? await readFile(env, path) : null;
        if (raw === null) throw fail('file not found.', 404);
        return new Response(request.method === 'HEAD' ? null : raw, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (!error.status) console.error('request failed:', error.message);
      return json({ error: error.status ? error.message : 'something went wrong. try again.' }, error.status || 500);
    }
  },
};
