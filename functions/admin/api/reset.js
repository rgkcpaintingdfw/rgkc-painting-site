// POST /admin/api/reset — wipes visit and click history (estimate requests are kept).
import { getDb, json } from '../../../lib/db.js';

export async function onRequestPost({ request, env }) {
  let b = {};
  try { b = await request.json(); } catch (e) {}
  if (b.confirm !== 'RESET') return json({ ok: false, error: 'not_confirmed' }, 400);
  try {
    const db = await getDb(env);
    const r = await db.prepare('DELETE FROM events').run();
    return json({ ok: true, removed: r.meta.changes || 0 });
  } catch (e) { return json({ ok: false, error: 'db_error' }, 500); }
}
