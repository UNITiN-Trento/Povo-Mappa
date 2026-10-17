// Mini server: serve i file statici di /public e fa da proxy (con cache) verso
// l'endpoint pubblico di EasyAcademy usato dalla pagina "Occupazione delle aule"
// di UniTrento. Nessuna dipendenza esterna, nessuna autenticazione richiesta.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PUBLIC_DIR_REAL = fs.realpathSync(PUBLIC_DIR);
const EA_URL = 'https://easyacademy.unitn.it/AgendaStudentiUnitn/rooms_call.php';
const SEDE = 'E0503'; // "Dipartimenti - POVO"
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_UPSTREAM = 8; // max richieste upstream distinte in volo
const PAST_DAYS = 7;
const FUTURE_DAYS = 120;
// La cache contiene tutte le date valide: ciclare date diverse non puo'
// forzare piu' di una richiesta upstream per data ogni CACHE_TTL_MS.
const CACHE_MAX = PAST_DAYS + FUTURE_DAYS + 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const cache = new Map(); // date -> { at, payload }
const inFlight = new Map(); // date -> Promise<payload>

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; connect-src 'self' https://va.vercel-scripts.com; " +
    "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

const CACHE_FRESH = 'public, max-age=60, s-maxage=600, stale-while-revalidate=300';
const CACHE_NONE = 'no-store';

function utcTodayMs() {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

// Ritorna il timestamp UTC della data o null se non e' una data di calendario
// reale nel formato YYYY-MM-DD tra oggi-PAST_DAYS e oggi+FUTURE_DAYS.
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const diff = (t - utcTodayMs()) / DAY_MS;
  if (diff < -PAST_DAYS || diff > FUTURE_DAYS) return null;
  return t;
}

function toDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

function slimEvent(e) {
  return {
    room: str(e.CodiceAula),
    from: str(e.from).slice(0, 5),
    to: str(e.to).slice(0, 5),
    name: str(e.name),
    type: str(e.tipo),
    teachers: (Array.isArray(e.Utenti) ? e.Utenti : []).map((u) =>
      [u && u.Nome, u && u.Cognome].filter(Boolean).join(' ').trim()
    ),
    cancelled: e.Annullato === '1',
  };
}

async function fetchRooms(date) {
  const body = new URLSearchParams({
    'form-type': 'rooms',
    sede: SEDE,
    date: toDMY(date),
    _lang: 'it',
  });
  const res = await fetch(EA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`EasyAcademy HTTP ${res.status}`);
  const data = await res.json();

  const rooms = {};
  for (const [code, r] of Object.entries(data.all_rooms || {})) {
    rooms[code] = { code, name: str(r.room_name), capacity: r.capacity };
  }
  const events = (Array.isArray(data.events) ? data.events : [])
    .filter((e) => e && e.CodiceSede === SEDE)
    .map(slimEvent)
    .sort((a, b) => a.from.localeCompare(b.from));

  return {
    date,
    fetchedAt: Date.now(),
    lastUpdate: str(data.file_date) || null,
    rooms,
    events,
  };
}

function cacheSet(date, payload) {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
  }
  while (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value); // evita la entry piu' vecchia (FIFO)
  }
  cache.set(date, { at: now, payload });
}

async function handleApi(req, res, url) {
  const raw = url.searchParams.get('date');
  const date = raw === null ? new Date(utcTodayMs()).toISOString().slice(0, 10) : raw;
  if (parseDate(date) === null) {
    return sendJson(req, res, 400, { error: `invalid date, use YYYY-MM-DD from ${PAST_DAYS} days ago to ${FUTURE_DAYS} days ahead` });
  }

  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return sendJson(req, res, 200, hit.payload, { fresh: true, cached: true });
  }

  let p = inFlight.get(date);
  if (!p) {
    if (inFlight.size >= MAX_UPSTREAM) {
      return sendJson(req, res, 429, { error: 'too many requests, retry later' }, { retryAfter: 5 });
    }
    // La cache si riempie dentro la promise condivisa: gli awaiter non la
    // ripopolano e inFlight viene rimosso solo dopo il cacheSet.
    p = fetchRooms(date)
      .then((payload) => {
        cacheSet(date, payload);
        return payload;
      })
      .finally(() => inFlight.delete(date));
    inFlight.set(date, p);
  }

  try {
    const payload = await p;
    sendJson(req, res, 200, payload, { fresh: true });
  } catch (err) {
    console.error(`[api] ${date}: ${err.message}`);
    if (hit) {
      return sendJson(req, res, 200, { ...hit.payload, stale: true });
    }
    sendJson(req, res, 502, { error: 'EasyAcademy non raggiungibile' });
  }
}

function sendJson(req, res, status, obj, opts = {}) {
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME['.json'],
    'Cache-Control': opts.fresh ? CACHE_FRESH : CACHE_NONE,
    'X-Cache': opts.cached ? 'HIT' : 'MISS',
  };
  if (opts.retryAfter) headers['Retry-After'] = String(opts.retryAfter);
  const body = JSON.stringify(obj);
  headers['Content-Length'] = Buffer.byteLength(body);
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendText(req, res, status, text, extra = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': CACHE_NONE,
    ...extra,
  });
  res.end(req.method === 'HEAD' ? undefined : text);
}

function notFound(req, res) {
  sendText(req, res, 404, 'Not found');
}

function serveStatic(req, res, url) {
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return sendText(req, res, 400, 'Bad request');
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return notFound(req, res);
  fs.realpath(file, (err, real) => {
    if (err || !real.startsWith(PUBLIC_DIR_REAL + path.sep)) return notFound(req, res);
    fs.readFile(real, (err2, buf) => {
      if (err2) return notFound(req, res);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[path.extname(real)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': buf.length,
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

function handler(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost'); // base fissa: ignora l'header Host
  } catch {
    return sendText(req, res, 400, 'Bad request');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (url.pathname === '/api/rooms') return handleApi(req, res, url);
  serveStatic(req, res, url);
}

if (require.main === module) {
  http
    .createServer(handler)
    .listen(PORT, () => console.log(`Povo Mappa → http://localhost:${PORT}`));
}

module.exports = handler;
