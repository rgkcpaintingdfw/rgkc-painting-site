// POST /api/lead — saves an estimate request so it shows up on the admin page.
import { getDb, json, clip } from '../../lib/db.js';

const FIELDS = [
  ['name', 'name', 120], ['phone', 'phone', 40], ['email', 'email', 160], ['city', 'city', 80],
  ['zip', 'zip', 12], ['property', 'property', 40], ['services', 'services', 200],
  ['timing', 'timing', 60], ['range', 'price_range', 60], ['offer', 'offer', 200], ['notes', 'notes', 2000]
];

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }
  if (b.botcheck) return json({ ok: true });
  if (!b.name || (!b.phone && !b.email)) return json({ ok: false, error: 'missing_contact' }, 400);
  const cols = FIELDS.map(f => f[1]);
  const vals = FIELDS.map(([k, , n]) => clip(b[k], n));
  try {
    const db = await getDb(env);
    const r = await db.prepare(
      `INSERT INTO leads (ts,${cols.join(',')},details,emailed) VALUES (?,${cols.map(() => '?').join(',')},?,?)`
    ).bind(Date.now(), ...vals, clip(JSON.stringify(b.details || {}), 4000), b.emailed ? 1 : 0).run();
    return json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return json({ ok: false, error: e.message === 'NO_DB' ? 'no_database' : 'db_error' }, 500);
  }
}
