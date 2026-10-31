// GET /admin/api/leads — latest estimate requests. POST — change a lead's status.
import { getDb, json } from '../../../lib/db.js';

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export async function onRequestGet({ env }) {
  try {
    const db = await getDb(env);
    const { results } = await db.prepare('SELECT * FROM leads ORDER BY ts DESC LIMIT 500').all();
    return json({ ok: true, leads: results });
  } catch (e) {
    return json({ ok: false, error: e.message === 'NO_DB' ? 'no_database' : 'db_error' }, e.message === 'NO_DB' ? 503 : 500);
  }
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
  if (!Number.isInteger(b.id) || !STATUSES.includes(b.status)) return json({ ok: false, error: 'invalid' }, 400);
  try {
    const db = await getDb(env);
    await db.prepare('UPDATE leads SET status=? WHERE id=?').bind(b.status, b.id).run();
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: 'db_error' }, 500); }
}
