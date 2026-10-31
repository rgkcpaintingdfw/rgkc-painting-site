// Password lock for everything under /admin. The password lives only in Cloudflare (ADMIN_PASSWORD).
// Signing in sets a signed, HttpOnly cookie for 30 days. Changing the password signs everyone out.
const COOKIE = 'rgkc_admin';
const MAX_AGE = 60 * 60 * 24 * 30;
const enc = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode('rgkc-admin|' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeToken(secret) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(exp));
  return exp + '.' + b64(sig);
}
async function validToken(token, secret) {
  if (!token || token.indexOf('.') < 0) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || +exp < Date.now() / 1000) return false;
  const expect = b64(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(exp)));
  return sameText(expect, sig);
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function samePassword(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return sameText(b64(x), b64(y));
}
function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : '';
}
const cookieHeader = (value, age) =>
  `${COOKIE}=${value}; Path=/admin; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;

const noStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

function loginPage(error) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Sign in · RG &amp; KC Admin</title>
<link rel="icon" href="/img/mark.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#F5F4EE;--card:#fff;--line:#E2E1D6;--ink:#17241D;--muted:#6B746D;--brand:#1E3A2F;--brand-2:#2C5242;--err:#B42318;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);font:15px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);display:grid;place-items:center;padding:24px}
.card{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:36px 32px 32px;box-shadow:0 24px 60px -36px rgba(23,36,29,.35);text-align:center}
.mark{width:52px;height:52px;margin:0 auto 18px;display:block}
h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;text-transform:uppercase;font-size:28px;line-height:1.1;margin:0;letter-spacing:.01em}
p{color:var(--muted);margin:6px 0 26px;font-size:14px}
label{display:block;text-align:left;font-size:13px;font-weight:600;margin-bottom:8px}
input{width:100%;height:48px;border:1px solid var(--line);border-radius:6px;padding:0 14px;font:inherit;font-size:16px;color:var(--ink);background:#fff;transition:border-color .2s,box-shadow .2s}
input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(30,58,47,.14)}
input.bad{border-color:var(--err)}
.err{color:var(--err);font-size:13.5px;text-align:left;margin:8px 0 0;min-height:1em}
button{width:100%;height:48px;margin-top:18px;border:0;border-radius:6px;background:var(--brand);color:#fff;font:inherit;font-size:15px;font-weight:600;letter-spacing:.01em;cursor:pointer;transition:background .2s}
button:hover{background:var(--brand-2)}
button:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
.back{display:inline-block;margin-top:20px;font-size:13px;color:var(--muted);text-decoration:none}
.back:hover{color:var(--ink)}
</style></head>
<body>
<form class="card" method="post" action="/admin/login">
  <img class="mark" src="/img/mark.svg" alt="RG &amp; KC Painting">
  <h1>Admin</h1>
  <p>Enter your password to see the dashboard.</p>
  <label for="pw">Password</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus${error ? ' class="bad" aria-describedby="err"' : ''}>
  <div class="err" id="err" role="alert">${error ? 'That password isn’t right. Try again.' : ''}</div>
  <button type="submit">Sign in</button>
  <a class="back" href="/">&larr; Back to the website</a>
</form>
</body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8', ...noStore } });
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const secret = env.ADMIN_PASSWORD;
  if (!secret) {
    return new Response(
      'The admin password is not set yet.\nIn Cloudflare: Workers & Pages → rgkc-painting-site → Settings → Variables and Secrets → add ADMIN_PASSWORD, then redeploy.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore } }
    );
  }

  if (url.pathname === '/admin/logout') {
    return new Response(null, { status: 303, headers: { Location: '/admin', 'Set-Cookie': cookieHeader('', 0), ...noStore } });
  }

  if (url.pathname === '/admin/login') {
    if (request.method !== 'POST') return Response.redirect(new URL('/admin', url), 303);
    let pass = '';
    try { pass = String((await request.formData()).get('password') || ''); } catch (e) {}
    if (pass && await samePassword(pass, secret)) {
      return new Response(null, { status: 303, headers: { Location: '/admin', 'Set-Cookie': cookieHeader(await makeToken(secret), MAX_AGE), ...noStore } });
    }
    await new Promise(r => setTimeout(r, 900)); // slow down password guessing
    return loginPage(true);
  }

  if (await validToken(readCookie(request), secret)) {
    const res = await next();
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(noStore)) out.headers.set(k, v);
    return out;
  }

  if (url.pathname.startsWith('/admin/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'signed_out' }), { status: 401, headers: { 'content-type': 'application/json', ...noStore } });
  }
  return loginPage(false);
}
