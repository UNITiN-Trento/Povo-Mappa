// Test di sicurezza/comportamento per server.js. Nessuna rete: global.fetch mockato.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const handler = require('../server.js');

let server;
let base;
const realFetch = global.fetch;
let fetchImpl = async () => okPayload();
let fetchCalls = [];

function okPayload(over = {}) {
  return {
    ok: true,
    json: async () => ({
      all_rooms: { A101: { room_name: 'Aula A101', capacity: 40 } },
      events: [
        {
          id: 1, CodiceAula: 'A101', NomeAula: 'Aula A101', CodiceSede: 'E0503',
          from: '09:00:00', to: '11:00:00', timestamp_from: 1, timestamp_to: 2,
          name: 'Lezione', tipo: 'Lezione', Utenti: [{ Nome: 'Mario', Cognome: 'Rossi' }],
          Annullato: '0', PublicNotes: '',
        },
      ],
      file_date: '01/01/2025',
      ...over,
    }),
  };
}

async function request(pathname, opts = {}) {
  const res = await fetch(`${base}${pathname}`, { redirect: 'manual', ...opts });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body, json: () => JSON.parse(body) };
}

function dateOffset(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  global.fetch = (...args) => {
    if (String(args[0]).startsWith('https://easyacademy.')) {
      fetchCalls.push(args);
      return fetchImpl(...args);
    }
    return realFetch(...args);
  };
  server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  global.fetch = realFetch;
  server.close();
});

test('malformed URL encodings -> 400, no crash', async () => {
  for (const p of ['/%', '/%zz', '/api/rooms?date=%']) {
    const r = await request(p);
    assert.strictEqual(r.status, 400, p);
  }
});

test('traversal and sibling escape -> not found', async () => {
  for (const p of ['/%2e%2e%2fserver.js', '/%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/../server.js']) {
    const r = await request(p);
    assert.strictEqual(r.status, 404, p);
  }
});

test('non-GET/HEAD -> 405 with Allow', async () => {
  for (const m of ['POST', 'PUT', 'DELETE']) {
    const r = await request('/', { method: m });
    assert.strictEqual(r.status, 405, m);
    assert.strictEqual(r.headers.get('allow'), 'GET, HEAD');
  }
  const r = await request('/api/rooms', { method: 'POST' });
  assert.strictEqual(r.status, 405);
});

test('HEAD returns headers without body', async () => {
  const r = await request('/', { method: 'HEAD' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body, '');
  assert.ok(Number(r.headers.get('content-length')) > 0);
});

test('static file served with security headers + woff2 mime', async () => {
  const r = await request('/index.html');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  const f = await request('/fonts/barlow-400.woff2');
  assert.strictEqual(f.status, 200);
  assert.strictEqual(f.headers.get('content-type'), 'font/woff2');
});

test('date validation: bad format, fake date, empty, out of range -> 400', async () => {
  for (const d of ['2025-13-01', '2025-02-30', 'not-a-date', '2025-1-1', '2020-01-01', dateOffset(400), dateOffset(-8), dateOffset(121)]) {
    const r = await request(`/api/rooms?date=${d}`);
    assert.strictEqual(r.status, 400, d);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  }
  const empty = await request('/api/rooms?date=');
  assert.strictEqual(empty.status, 400);
});

test('API 200: fresh Cache-Control, slim payload, dedup same date', async () => {
  const d = dateOffset(1);
  const [a, b] = await Promise.all([request(`/api/rooms?date=${d}`), request(`/api/rooms?date=${d}`)]);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  const payload = a.json();
  assert.strictEqual(payload.date, d);
  assert.strictEqual(payload.events.length, 1);
  assert.strictEqual(payload.events[0].from, '09:00');
  assert.strictEqual(payload.rooms.A101.capacity, 40);
  assert.deepStrictEqual(Object.keys(payload.events[0]).sort(), ['cancelled', 'from', 'name', 'room', 'teachers', 'to', 'type']);
  assert.strictEqual(a.headers.get('cache-control'), 'public, max-age=60, s-maxage=600, stale-while-revalidate=300');
  assert.strictEqual(fetchCalls.length, 1, 'dedup: single upstream call for two concurrent requests');
  const c = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(c.headers.get('x-cache'), 'HIT');
  assert.strictEqual(fetchCalls.length, 1);
});

test('concurrency cap: 9th distinct date -> 429 + Retry-After', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  fetchImpl = () => gate.then(() => okPayload());
  fetchCalls = [];
  const dates = Array.from({ length: 8 }, (_, i) => dateOffset(10 + i));
  const pending = dates.map((d) => request(`/api/rooms?date=${d}`));
  await new Promise((r) => setTimeout(r, 50));
  const ninth = await request(`/api/rooms?date=${dateOffset(20)}`);
  assert.strictEqual(ninth.status, 429);
  assert.ok(ninth.headers.get('retry-after'));
  assert.strictEqual(ninth.headers.get('cache-control'), 'no-store');
  release();
  const results = await Promise.all(pending);
  assert.ok(results.every((r) => r.status === 200));
  assert.strictEqual(fetchCalls.length, 8);
  fetchImpl = async () => okPayload();
});

test('cache filled inside shared inFlight promise (no redundant upstream at resolution boundary)', async () => {
  const d = dateOffset(100);
  let release;
  const gate = new Promise((r) => { release = r; });
  fetchImpl = () => gate.then(() => okPayload());
  fetchCalls = [];
  const r1 = request(`/api/rooms?date=${d}`);
  await new Promise((r) => setTimeout(r, 20));
  release();
  // richiesta che arriva proprio mentre la promise condivisa si risolve:
  // deve essere coalescata o servita dalla cache appena riempita
  const r2 = await request(`/api/rooms?date=${d}`);
  const res1 = await r1;
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(fetchCalls.length, 1);
  const r3 = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r3.headers.get('x-cache'), 'HIT');
  assert.strictEqual(fetchCalls.length, 1);
  fetchImpl = async () => okPayload();
});

test('upstream failure -> 502 without internal error detail; failure not cached', async () => {
  const d = dateOffset(30);
  fetchImpl = async () => { throw new Error('secret-internal-detail'); };
  fetchCalls = [];
  const r = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  assert.ok(!r.body.includes('secret-internal-detail'));
  // retry works: errors are not cached
  fetchImpl = async () => okPayload();
  const r2 = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(fetchCalls.length, 2);
});

test('stale fallback only on upstream error, with no-store', async (t) => {
  const d = dateOffset(40);
  fetchImpl = async () => okPayload();
  const r1 = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r1.status, 200);
  // fai scadere la entry (TTL 10 min) avanzando il tempo
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 11 * 60 * 1000 });
  fetchImpl = async () => { throw new Error('down'); };
  const r2 = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.json().stale, true);
  assert.strictEqual(r2.headers.get('cache-control'), 'no-store');
  t.mock.timers.reset();
});

test('malformed upstream event fields handled safely', async () => {
  const d = dateOffset(50);
  fetchImpl = async () => okPayload({
    events: [{
      id: 2, CodiceAula: 'A101', CodiceSede: 'E0503',
      from: null, to: null, timestamp_from: null, timestamp_to: undefined,
      name: '<img onerror=x>', tipo: null, Utenti: 'x', Annullato: null, PublicNotes: null,
    }],
  });
  fetchCalls = [];
  const r = await request(`/api/rooms?date=${d}`);
  assert.strictEqual(r.status, 200);
  const ev = r.json().events[0];
  assert.strictEqual(ev.from, '');
  assert.strictEqual(ev.to, '');
  assert.strictEqual(ev.type, '');
  assert.deepStrictEqual(ev.teachers, []);
});

test('cache holds every valid date: cycling dates cannot force extra upstream calls', async () => {
  fetchImpl = async () => okPayload();
  const dates = Array.from({ length: 128 }, (_, i) => dateOffset(i - 7));
  for (const d of dates) {
    const r = await request(`/api/rooms?date=${d}`);
    assert.strictEqual(r.status, 200, d);
  }
  fetchCalls = [];
  for (const d of dates) await request(`/api/rooms?date=${d}`);
  assert.strictEqual(fetchCalls.length, 0);
});

test('API responses carry security headers', async () => {
  const r = await request(`/api/rooms?date=${dateOffset(120)}`);
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
