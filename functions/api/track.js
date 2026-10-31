// POST /api/track  — records a page view or a click event. Always answers 204 so the site never waits on it.
import { getDb, clip, deviceOf, isBot, isDatacenter, refHost, visitorId } from '../../lib/db.js';

const done = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  const ua = request.headers.get('User-Agent') || '';
  if (isBot(ua) || isDatacenter(request.cf)) return done();
  let b;
  try { b = JSON.parse((await request.text()) || '{}'); } catch (e) { return done(); }
  const type = b.t === 'event' ? 'event' : 'view';
  const cf = request.cf || {};
  const host = new URL(request.url).hostname;
  try {
    const db = await getDb(env);
    await db.prepare(
      'INSERT INTO events (ts,type,name,path,ref,city,region,country,device,vid) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      Date.now(), type, clip(b.n, 40), clip(b.p, 120),
      type === 'view' ? refHost(clip(b.r, 300), host) : '',
      clip(cf.city, 60), clip(cf.region, 60), clip(cf.country, 4),
      deviceOf(ua), await visitorId(request, env.SALT || 'rgkc-painting')
    ).run();
  } catch (e) { /* tracking must never break the site */ }
  return done();
}
