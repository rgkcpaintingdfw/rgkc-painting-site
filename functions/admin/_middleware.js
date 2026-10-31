// Password lock for everything under /admin. The password lives only in Cloudflare (ADMIN_PASSWORD).
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const A = new Uint8Array(x), B = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  const secret = env.ADMIN_PASSWORD;
  if (!secret) {
    return new Response(
      'The admin password is not set yet.\nIn Cloudflare: Workers & Pages → rgkc-painting-site → Settings → Variables and Secrets → add ADMIN_PASSWORD, then redeploy.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }
    );
  }
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    let pass = '';
    try { const raw = atob(auth.slice(6)); pass = raw.slice(raw.indexOf(':') + 1); } catch (e) {}
    if (pass && await sameSecret(pass, secret)) {
      const res = await next();
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'no-store');
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return out;
    }
    await new Promise(r => setTimeout(r, 900)); // slow down password guessing
  }
  return new Response('Password required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="RG & KC Admin", charset="UTF-8"', 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  });
}
