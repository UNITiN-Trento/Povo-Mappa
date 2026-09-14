// Mini server: serve i file statici di /public e fa da proxy (con cache) verso
// l'endpoint pubblico di EasyAcademy usato dalla pagina "Occupazione delle aule"
// di UniTrento. Nessuna dipendenza esterna, nessuna autenticazione richiesta.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const EA_URL = 'https://easyacademy.unitn.it/AgendaStudentiUnitn/rooms_call.php';
const SEDE = 'E0503'; // "Dipartimenti - POVO"
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map(); // date -> { at, payload }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

function toDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function slimEvent(e) {
  return {
    id: e.id,
    room: e.CodiceAula,
    roomName: e.NomeAula,
    from: e.from.slice(0, 5),
    to: e.to.slice(0, 5),
    tsFrom: e.timestamp_from * 1000,
    tsTo: e.timestamp_to * 1000,
    name: e.name,
    type: e.tipo,
    teachers: (e.Utenti || []).map((u) => `${u.Nome} ${u.Cognome}`.trim()),
    cancelled: e.Annullato === '1',
    notes: e.PublicNotes || '',
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
    rooms[code] = { code, name: r.room_name, capacity: r.capacity };
  }
  const events = (data.events || [])
    .filter((e) => e.CodiceSede === SEDE)
    .map(slimEvent)
    .sort((a, b) => a.tsFrom - b.tsFrom);

  return {
    date,
    fetchedAt: Date.now(),
    lastUpdate: data.file_date || null,
    rooms,
    events,
  };
}

async function handleApi(req, res, url) {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!isValidDate(date)) return sendJson(res, 400, { error: 'invalid date, use YYYY-MM-DD' });

  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return sendJson(res, 200, hit.payload, true);

  try {
    const payload = await fetchRooms(date);
    cache.set(date, { at: Date.now(), payload });
    sendJson(res, 200, payload);
  } catch (err) {
    console.error(`[api] ${date}: ${err.message}`);
    if (hit) return sendJson(res, 200, { ...hit.payload, stale: true });
    sendJson(res, 502, { error: 'EasyAcademy non raggiungibile', detail: err.message });
  }
}

function sendJson(res, status, obj, cached = false) {
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-store',
    'X-Cache': cached ? 'HIT' : 'MISS',
  });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.readFile(file, (err, buf) => {
    if (err) return notFound(res);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/rooms') return handleApi(req, res, url);
    serveStatic(req, res, url);
  })
  .listen(PORT, () => console.log(`Povo Mappa → http://localhost:${PORT}`));
