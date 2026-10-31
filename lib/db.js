// Shared helpers for the Cloudflare Pages Functions (database, responses, privacy-safe visitor ids).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL,
     name TEXT, path TEXT, ref TEXT, city TEXT, region TEXT, country TEXT, device TEXT, vid TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
  `CREATE TABLE IF NOT EXISTS leads (
     id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
     name TEXT, phone TEXT, email TEXT, city TEXT, zip TEXT, property TEXT, services TEXT,
     timing TEXT, price_range TEXT, offer TEXT, notes TEXT, details TEXT,
     status TEXT NOT NULL DEFAULT 'new', emailed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads(ts)`
];

let ready = false;
export async function getDb(env) {
  if (!env.DB) throw new Error('NO_DB');
  if (!ready) { await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))); ready = true; }
  return env.DB;
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export const clip = (v, n) => (v == null ? '' : String(v)).slice(0, n);

export function deviceOf(ua = '') {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export const isBot = (ua = '') =>
  !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|httpclient|facebookexternalhit|whatsapp|discord|telegram/i.test(ua);

export function refHost(ref, siteHost) {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    return h === siteHost.replace(/^www\./, '') ? '' : h;
  } catch (e) { return ''; }
}

// A visitor id that changes every day and never stores the raw IP address.
export async function visitorId(request, salt) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
