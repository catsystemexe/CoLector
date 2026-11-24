import { adminActions, publicActions } from './actions.js';
import { RequestError } from './forms.js';
import { exportConfigured, flushSheetExports } from './google-export.js';

const views = new Map([
  ['home', 'Home'], ['editor', 'Admin'], ['forms', 'Forms'], ['data', 'Data'],
  ['session', 'Session'], ['form', 'Participant'], ['demo', 'Index']
]);
const cookieName = 'colector_session';
const sessionSeconds = 14 * 86400;
const maxRequestBytes = 250_000;
const textEncoder = new TextEncoder();
const commonHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin'
};
const htmlHeaders = {
  ...commonHeaders,
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: commonHeaders });
}

async function key(secret) {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(secret, content) {
  const signature = await crypto.subtle.sign('HMAC', await key(secret), textEncoder.encode(content));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function signedBy(secret, content, hex) {
  if (!secret || !/^[0-9a-f]{64}$/.test(hex)) return false;
  const signature = Uint8Array.from(hex.match(/../g), part => parseInt(part, 16));
  return crypto.subtle.verify('HMAC', await key(secret), signature, textEncoder.encode(content));
}

async function signedIn(request, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 24) return false;
  const cookies = (request.headers.get('Cookie') || '').split(';').map(part => part.trim());
  const encoded = cookies.find(part => part.startsWith(cookieName + '='));
  if (!encoded) return false;
  const [payload, signature] = encoded.slice(cookieName.length + 1).split('.');
  const deadline = Number(payload);
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now()) return false;
  return signedBy(env.ADMIN_PASSWORD, 'colector-session:' + payload, signature);
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function loginPage(next, message = '', status = 200) {
  return new Response(`<!doctype html><html lang="cs"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>CoLector</title>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fb;color:#27334a;font:16px system-ui}main{width:min(320px,85vw);background:white;border:1px solid #e4e8f0;border-radius:18px;padding:24px;box-sizing:border-box}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;margin:8px 0 0;padding:12px;border:1px solid #d9e1ed;border-radius:10px}button{color:white;background:#087c8b;border:0;font-weight:700}p{color:#a03d3d}</style>
  <main><h1>CoLector</h1>
  <form action="/login" method="post">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="password">Heslo lektora</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button>Přihlásit se</button>
  </form>${message ? '<p role="alert">' + escapeHtml(message) + '</p>' : ''}</main></html>`,
  { status, headers: htmlHeaders });
}

function sameOrigin(request, url) {
  return request.headers.get('Origin') === url.origin;
}

async function boundedBody(request, maximum = maxRequestBytes) {
  if (Number(request.headers.get('Content-Length')) > maximum) throw new RequestError('Požadavek je příliš velký.', 413);
  if (!request.body) return '';
  const decoder = new TextDecoder();
  const reader = request.body.getReader();
  let size = 0;
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new RequestError('Požadavek je příliš velký.', 413);
    }
    body += decoder.decode(value, { stream: true });
  }
}

async function authenticate(request, env, url) {
  if (!sameOrigin(request, url)) return new Response('Forbidden', { status: 403, headers: commonHeaders });
  const data = new URLSearchParams(await boundedBody(request, 4096));
  const requestedPath = data.get('next') || '';
  const next = requestedPath.startsWith('/?') && !/[\x00-\x20\\]/.test(requestedPath) ? requestedPath : '/';
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 24) {
    return loginPage(next, 'Přístup lektora připravuje správce aplikace.', 503);
  }
  const password = data.get('password') || '';
  const signature = await sign(env.ADMIN_PASSWORD, 'colector-operator-login');
  if (!await signedBy(password, 'colector-operator-login', signature)) {
    return loginPage(next, 'Nesprávné heslo.', 401);
  }
  const deadline = Date.now() + sessionSeconds * 1000;
  const signed = await sign(env.ADMIN_PASSWORD, 'colector-session:' + deadline);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return new Response(null, { status: 303, headers: {
    ...commonHeaders, Location: next,
    'Set-Cookie': `${cookieName}=${deadline}.${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${secure}`
  } });
}

async function api(request, env, ctx, url) {
  if (request.method !== 'POST') return json({ error: 'Použij POST.' }, 405);
  if (!sameOrigin(request, url)) return json({ error: 'Nepovolený původ požadavku.' }, 403);
  const raw = await boundedBody(request);
  let payload;
  try { payload = JSON.parse(raw); } catch {
    return json({ error: 'Neplatný požadavek.' }, 400);
  }
  const { method, args } = payload || {};
  if (typeof method !== 'string' || !Array.isArray(args) || args.length > 1) {
    return json({ error: 'Neplatný požadavek.' }, 400);
  }
  const isAdminAction = Object.hasOwn(adminActions, method);
  const actions = isAdminAction ? adminActions : publicActions;
  if (!Object.hasOwn(actions, method)) return json({ error: 'Akce neexistuje.' }, 404);
  if (isAdminAction && !await signedIn(request, env)) {
    return json({ error: 'Přihlas se jako lektor.' }, 401);
  }
  if (method === 'retrySheetExport' && !exportConfigured(env)) {
    return json({ error: 'Google export zatím nemá připojení.' }, 503);
  }
  const result = await actions[method](env.DB, ...args);
  if (method === 'getSessionView') result.exportConfigured = exportConfigured(env);
  if (method === 'retrySheetExport') ctx.waitUntil(flushSheetExports(env));
  return json({ result });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/action') return await api(request, env, ctx, url);
      if (url.pathname === '/login' && request.method === 'POST') return await authenticate(request, env, url);
      if (url.pathname !== '/' || !['GET', 'HEAD'].includes(request.method)) {
        return new Response('Nenalezeno', { status: 404, headers: commonHeaders });
      }
      const view = url.searchParams.get('view') || (url.searchParams.has('card') ? 'demo' : 'home');
      const page = views.get(view);
      if (!page) return new Response('Nenalezeno', { status: 404, headers: commonHeaders });
      if (!['form', 'demo'].includes(view) && !await signedIn(request, env)) return loginPage('/' + url.search);
      const asset = await env.ASSETS.fetch(new URL('/views/' + page + '.html', url.origin));
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(htmlHeaders)) headers.set(name, value);
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers });
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Aplikace požadavek nezpracovala. Zkus to znovu.' }, 500);
    }
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(flushSheetExports(env));
  }
};
