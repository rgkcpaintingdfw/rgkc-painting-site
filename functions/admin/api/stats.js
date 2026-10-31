// GET /admin/api/stats?days=1|7|30|90 — everything the dashboard shows, counted in Dallas time.
import { getDb, json } from '../../../lib/db.js';

const DAY = 86400000;
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = ts => fmtDay.format(new Date(ts));

function lastDays(n) {
  const [y, m, d] = dayOf(Date.now()).split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i, 12)).toISOString().slice(0, 10));
  return out;
}

function sourceName(host) {
  if (!host) return 'Direct / typed in';
  const h = host.toLowerCase();
  if (/(^|\.)google\./.test(h)) return 'Google';
  if (/facebook|fb\.com|fb\.me/.test(h)) return 'Facebook';
  if (/instagram/.test(h)) return 'Instagram';
  if (/nextdoor/.test(h)) return 'Nextdoor';
  if (/bing\./.test(h)) return 'Bing';
  if (/yelp\./.test(h)) return 'Yelp';
  if (/tiktok/.test(h)) return 'TikTok';
  if (/yahoo\.|duckduckgo/.test(h)) return 'Other search';
  return h;
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
const inc = (map, k, v = 1) => map.set(k, (map.get(k) || 0) + v);

export async function onRequestGet({ request, env }) {
  const days = [1, 7, 30, 90].includes(+new URL(request.url).searchParams.get('days')) ? +new URL(request.url).searchParams.get('days') : 7;
  const chartLen = Math.max(days, 14);
  const cur = lastDays(days), both = lastDays(days * 2), chartDays = lastDays(chartLen);
  const prev = both.slice(0, days);
  const curSet = new Set(cur), prevSet = new Set(prev);
  const since = Date.now() - (Math.max(days * 2, chartLen) + 2) * DAY;

  let db;
  try { db = await getDb(env); }
  catch (e) { return json({ ok: false, error: e.message === 'NO_DB' ? 'no_database' : 'db_error' }, e.message === 'NO_DB' ? 503 : 500); }

  const [{ results: ev }, { results: ld }, allLeads, allViews] = await Promise.all([
    db.prepare('SELECT ts,type,name,ref,city,region,country,device,vid FROM events WHERE ts>=? ORDER BY ts').bind(since).all(),
    db.prepare('SELECT ts FROM leads WHERE ts>=?').bind(since).all(),
    db.prepare('SELECT COUNT(*) AS n FROM leads').first(),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='view'").first()
  ]);

  const dVis = new Map(), dViews = new Map(), dLeads = new Map();
  const sources = new Map(), cities = new Map(), devices = new Map(), services = new Map(), offers = new Map();
  const seen = new Set();
  const funnel = { started: new Set(), contact: new Set() };
  const t = { cur: { views: 0, calls: 0, emails: 0, submits: 0 }, prev: { views: 0, calls: 0, emails: 0 } };

  for (const e of ev) {
    const d = dayOf(e.ts), key = e.vid + '|' + d;
    if (e.type === 'view') {
      inc(dViews, d);
      if (!dVis.has(d)) dVis.set(d, new Set());
      dVis.get(d).add(e.vid);
      if (curSet.has(d)) {
        t.cur.views++;
        if (!seen.has(key)) {
          seen.add(key);
          inc(sources, sourceName(e.ref));
          const place = e.city ? (e.country && e.country !== 'US' ? `${e.city}, ${e.country}` : e.city) : 'Unknown';
          inc(cities, place);
          inc(devices, e.device || 'desktop');
        }
      } else if (prevSet.has(d)) t.prev.views++;
      continue;
    }
    const n = e.name || '', bucket = curSet.has(d) ? t.cur : prevSet.has(d) ? t.prev : null;
    if (!bucket) continue;
    if (n === 'call') bucket.calls++;
    else if (n === 'email') bucket.emails++;
    if (bucket !== t.cur) continue;
    if (n === 'est_start') funnel.started.add(key);
    else if (n === 'est_step4') funnel.contact.add(key);
    else if (n === 'est_submit') t.cur.submits++;
    else if (n.startsWith('svc:')) inc(services, n.slice(4));
    else if (n.startsWith('offer:')) inc(offers, n.slice(6));
  }
  for (const l of ld) inc(dLeads, dayOf(l.ts));

  const sumVis = list => list.reduce((s, d) => s + (dVis.get(d)?.size || 0), 0);
  const sumLeads = list => list.reduce((s, d) => s + (dLeads.get(d) || 0), 0);
  const visitors = sumVis(cur), leads = sumLeads(cur);

  return json({
    ok: true,
    days, from: cur[0], to: cur[cur.length - 1],
    totals: {
      visitors, views: t.cur.views, leads,
      conversion: visitors ? leads / visitors : 0,
      calls: t.cur.calls, emails: t.cur.emails
    },
    previous: {
      visitors: sumVis(prev), views: t.prev.views, leads: sumLeads(prev),
      calls: t.prev.calls, emails: t.prev.emails
    },
    daily: chartDays.map(d => ({ date: d, visitors: dVis.get(d)?.size || 0, views: dViews.get(d) || 0, leads: dLeads.get(d) || 0 })),
    funnel: { visitors, started: funnel.started.size, contact: funnel.contact.size, sent: leads },
    sources: top(sources, 8), cities: top(cities, 8), devices: top(devices, 3),
    services: top(services, 9), offers: top(offers, 4),
    allTime: { views: allViews?.n || 0, leads: allLeads?.n || 0 }
  });
}
