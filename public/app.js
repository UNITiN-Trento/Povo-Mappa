/* global FLOORS */
(() => {
  const SOON_MIN = 30;
  const REFRESH_MS = 5 * 60 * 1000;
  const TZ = 'Europe/Rome';

  const $ = (sel) => document.querySelector(sel);
  const el = {
    topbar: $('.topbar'),
    tabs: $('#floor-tabs'),
    date: $('#date-input'),
    time: $('#time-input'),
    timeLabel: $('#time-label'),
    now: $('#now-btn'),
    title: $('#floor-title'),
    hint: $('#floor-hint'),
    status: $('#status-msg'),
    map: $('#map'),
    list: $('#room-list'),
    detail: $('#detail'),
    search: $('#search'),
    tooltip: $('#tooltip'),
    lastUpdate: $('#last-update'),
  };

  const ctrlToggle = document.createElement('button');
  ctrlToggle.id = 'ctrl-toggle';
  ctrlToggle.className = 'btn ctrl-toggle';
  ctrlToggle.setAttribute('aria-expanded', 'false');
  ctrlToggle.textContent = '🕒 Ora';
  el.topbar.insertBefore(ctrlToggle, el.tabs);
  ctrlToggle.addEventListener('click', () => {
    const open = el.topbar.classList.toggle('show-controls');
    ctrlToggle.setAttribute('aria-expanded', String(open));
  });

  const state = {
    floorId: FLOORS[0].id,
    date: null,
    minutes: 0,
    live: true,
    data: null,
    loading: false,
    error: null,
    selected: null,
    query: '',
  };

  // ---------- tempo (Europe/Rome) ----------
  function romeNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    const hour = Number(g('hour')) % 24;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: hour * 60 + Number(g('minute')) };
  }
  const hm2min = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const min2hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const clampSlider = (m) => Math.min(Number(el.time.max), Math.max(Number(el.time.min), Math.round(m / 15) * 15));

  // ---------- dati ----------
  async function load(date) {
    state.loading = true; state.error = null; renderStatus();
    try {
      const res = await fetch(`/api/rooms?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      if (state.date === date) { state.data = json; state.fetchedAt = Date.now(); }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  function roomEvents(code) {
    if (!state.data || !code) return [];
    return state.data.events.filter((e) => e.room === code && !e.cancelled);
  }

  function statusOf(code) {
    if (!code || !state.data) return { status: 'nodata', now: null, next: null, events: [] };
    const events = roomEvents(code);
    const t = state.minutes;
    const now = events.find((e) => hm2min(e.from) <= t && t < hm2min(e.to)) || null;
    const next = events.find((e) => hm2min(e.from) > t) || null;
    let status = 'free';
    if (now) status = now.type === 'Indisponibile' ? 'unavailable' : 'busy';
    else if (next && hm2min(next.from) - t <= SOON_MIN) status = 'soon';
    return { status, now, next, events };
  }

  const STATUS_LABEL = {
    busy: 'Occupata', soon: 'Libera, a breve occupata', free: 'Libera', unavailable: 'Indisponibile', nodata: 'Nessun dato',
  };

  function roomMeta(room) {
    const info = state.data && state.data.rooms[room.code];
    return { name: info ? info.name : room.label, capacity: info ? info.capacity : null };
  }

  function shortInfo(st) {
    if (st.status === 'busy' || st.status === 'unavailable') return `${st.now.name} · fino alle ${st.now.to}`;
    if (st.next) return `Libera fino alle ${st.next.from}`;
    if (st.status === 'nodata') return '';
    return 'Libera per il resto della giornata';
  }

  // ---------- rendering SVG ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const currentFloor = () => FLOORS.find((f) => f.id === state.floorId);

  function textIn(r, label, sub, badge) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const small = r.small || Math.min(r.w, r.h) < 40;
    let size = small ? 13 : Math.min(24, Math.max(15, Math.min(r.w, r.h) / 2.8));
    const avail = (r.vertical ? r.h : r.w) - 8;
    size = Math.max(10, Math.min(size, avail / (String(label).length * 0.62)));
    if (r.vertical) {
      return `<text x="${cx}" y="${cy}" font-size="${size}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${cx} ${cy})">${esc(label)}</text>`;
    }
    const lines = [];
    let y = cy;
    if (sub && badge) y = cy - 4;
    else if (sub || badge) y = cy - (sub ? 2 : 6);
    lines.push(`<text x="${cx}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
    if (sub) lines.push(`<text class="sub" x="${cx}" y="${y + size * 0.8}" font-size="${Math.max(9, size * 0.55)}" text-anchor="middle" dominant-baseline="central">${esc(sub)}</text>`);
    if (badge && r.h >= (sub ? 80 : 45)) lines.push(`<text class="badge" x="${cx}" y="${r.y + r.h - 8}" text-anchor="middle">${esc(badge)}</text>`);
    return lines.join('');
  }

  function badgeFor(st) {
    if (st.status === 'busy' || st.status === 'unavailable') return `→ ${st.now.to}`;
    if (st.status === 'soon') return `dalle ${st.next.from}`;
    if (st.status === 'free' && st.next) return `fino ${st.next.from}`;
    return '';
  }

  function renderMap() {
    const f = currentFloor();
    const rect = (r, cls, rx = 2) => `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}"/>`;
    const parts = [];
    parts.push(`<svg viewBox="${f.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mappa ${f.building} ${f.name}">`);
    parts.push('<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fafafa"/></marker></defs>');
    f.outline.forEach((o) => parts.push(rect(o, 'outline')));
    (f.corridors || []).forEach((c) => parts.push(rect(c, 'corridor')));
    (f.areas || []).forEach((a) => {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      const size = a.small ? 10 : 14;
      const t = a.vertical
        ? `<text x="${cx}" y="${cy}" font-size="12" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${cx} ${cy})">${esc(a.label)}</text>`
        : `<text x="${cx}" y="${cy}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${esc(a.label)}</text>`;
      parts.push(`<g class="area ${a.kind || ''}">${rect(a, '')}${t}</g>`);
    });
    f.rooms.forEach((r) => {
      const st = statusOf(r.code);
      const cls = ['room', r.kind === 'dark' ? 'dark' : st.status, state.selected === r.code ? 'selected' : ''].join(' ');
      const badge = r.kind === 'open' || r.kind === 'study' ? '' : badgeFor(st);
      parts.push(`<g class="${cls}" data-code="${esc(r.code || '')}" data-label="${esc(r.label)}" tabindex="0">${rect(r, '', 4)}${textIn(r, r.label, r.sub, badge)}</g>`);
    });
    (f.texts || []).forEach((t) => parts.push(`<text class="free-text" x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="${t.weight || 400}" text-anchor="middle">${esc(t.text)}</text>`));
    (f.arrows || []).forEach((a) => parts.push(`<line class="arrow" x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}"/>`));
    parts.push('</svg>');
    el.map.innerHTML = parts.join('');
    const vbw = Number(f.viewBox.split(' ')[2]) || 1000;
    el.map.style.setProperty('--mapw', `${vbw / 10}%`);
    el.title.textContent = `${f.building} · ${f.name}`;
    el.hint.textContent = f.hint;
  }

  // ---------- tooltip ----------
  function tooltipHtml(room) {
    const st = statusOf(room.code);
    const meta = roomMeta(room);
    const pill = `<span class="pill ${st.status}">${STATUS_LABEL[st.status]}</span>`;
    let body = '';
    if (st.now) {
      body += `<div class="row"><div class="k">${esc(st.now.type)} in corso</div><b>${esc(st.now.name)}</b><br>${esc(st.now.from)} – ${esc(st.now.to)}${st.now.teachers.length ? `<br><span class="k">${esc(st.now.teachers.join(', '))}</span>` : ''}</div>`;
    }
    if (st.next) {
      body += `<div class="row"><div class="k">Prossimo</div>${esc(st.next.name)} · ${esc(st.next.from)} – ${esc(st.next.to)}</div>`;
    } else if (room.code && state.data && !st.now) {
      body += `<div class="row">Nessun altro evento oggi</div>`;
    }
    if (!room.code) body += `<div class="row">Spazio non gestito su EasyAcademy</div>`;
    const cap = meta.capacity ? ` · ${esc(meta.capacity)} posti` : '';
    return `<h4>${esc(meta.name)} ${pill}</h4><div class="k">${esc(room.sub || '')}${cap}</div>${body}<div class="hintline">Clic per il programma completo</div>`;
  }

  function positionTooltip(x, y) {
    const t = el.tooltip;
    const pad = 14;
    let left = x + pad, top = y + pad;
    const { width, height } = t.getBoundingClientRect();
    if (left + width > window.innerWidth - 8) left = x - width - pad;
    if (top + height > window.innerHeight - 8) top = y - height - pad;
    t.style.left = `${Math.max(4, left)}px`;
    t.style.top = `${Math.max(4, top)}px`;
  }

  function findRoom(code, label) {
    const f = currentFloor();
    return f.rooms.find((r) => (code ? r.code === code : r.label === label));
  }

  const noHover = window.matchMedia('(hover: none)');
  el.map.addEventListener('mouseover', (e) => {
    const g = e.target.closest('.room');
    if (!g || noHover.matches) return;
    const room = findRoom(g.dataset.code, g.dataset.label);
    if (!room) return;
    el.tooltip.innerHTML = tooltipHtml(room);
    el.tooltip.classList.remove('hidden');
    positionTooltip(e.clientX, e.clientY);
  });
  el.map.addEventListener('mousemove', (e) => {
    if (!el.tooltip.classList.contains('hidden')) positionTooltip(e.clientX, e.clientY);
  });
  el.map.addEventListener('mouseout', (e) => {
    if (e.target.closest('.room') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.room'))) el.tooltip.classList.add('hidden');
  });
  el.map.addEventListener('click', (e) => {
    const g = e.target.closest('.room');
    if (!g) { select(null); return; }
    const room = findRoom(g.dataset.code, g.dataset.label);
    select(room ? room.code || room.label : null);
    el.tooltip.classList.add('hidden');
  });
  el.map.addEventListener('keydown', (e) => {
    const g = e.target.closest('.room');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.click(); }
  });

  // ---------- selezione / dettaglio ----------
  function allRooms() {
    return FLOORS.flatMap((f) => f.rooms.filter((r) => r.kind !== 'dark').map((r) => ({ ...r, floor: f })));
  }

  function select(key) {
    state.selected = key;
    renderMap();
    renderList();
    renderDetail();
    if (key && window.matchMedia('(max-width: 700px)').matches) {
      requestAnimationFrame(() => {
        const wrap = el.map.closest('.map-wrap');
        if (wrap.getBoundingClientRect().top > 0) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function renderDetail() {
    const room = allRooms().find((r) => (r.code || r.label) === state.selected);
    if (!room) { el.detail.classList.add('hidden'); el.detail.innerHTML = ''; return; }
    const st = statusOf(room.code);
    const meta = roomMeta(room);
    const items = st.events.length
      ? st.events.map((ev) => {
        const cls = ev === st.now ? 'now' : hm2min(ev.to) <= state.minutes ? 'past' : '';
        return `<li class="${cls}"><span class="t">${esc(ev.from)} – ${esc(ev.to)}</span><span><span class="n">${esc(ev.name)}</span><br><span class="m">${esc(ev.type)}${ev.teachers.length ? ' · ' + esc(ev.teachers.join(', ')) : ''}</span></span></li>`;
      }).join('')
      : `<li><span class="t">—</span><span class="m">${room.code ? 'Nessun evento in questa data' : 'Spazio non gestito su EasyAcademy'}</span></li>`;
    el.detail.innerHTML = `
      <button class="close" aria-label="Chiudi" id="detail-close">×</button>
      <h3>${esc(meta.name)} <span class="pill ${st.status}">${STATUS_LABEL[st.status]}</span></h3>
      <div class="cap">${esc(room.floor.building)} · ${esc(room.floor.name)}${meta.capacity ? ` · ${esc(meta.capacity)} posti` : ''}${room.code ? ` · <code>${esc(room.code)}</code>` : ''}</div>
      <ul class="events">${items}</ul>`;
    el.detail.classList.remove('hidden');
    $('#detail-close').onclick = () => select(null);
  }

  function renderList() {
    const q = state.query.trim().toLowerCase();
    const rooms = q
      ? allRooms().filter((r) => `${r.label} ${roomMeta(r).name} ${r.sub || ''}`.toLowerCase().includes(q))
      : allRooms().filter((r) => r.floor.id === state.floorId);
    rooms.sort((a, b) => a.label.localeCompare(b.label, 'it', { numeric: true }));
    el.list.innerHTML = rooms.map((r) => {
      const st = statusOf(r.code);
      const key = r.code || r.label;
      const when = st.status === 'busy' || st.status === 'unavailable' ? st.now.to : st.next ? st.next.from : '';
      return `<li data-key="${esc(key)}" data-floor="${r.floor.id}" class="${state.selected === key ? 'selected' : ''}">
        <span class="dot ${st.status}" title="${STATUS_LABEL[st.status]}"></span>
        <span><span class="name">${esc(r.label)}</span>${q ? `<span class="floor-tag">${esc(r.floor.building)} · ${esc(r.floor.name)}</span>` : ''}<br><span class="info">${esc(shortInfo(st))}</span></span>
        <span class="when">${when ? (st.now ? '→ ' : 'dalle ') + esc(when) : ''}</span>
      </li>`;
    }).join('') || '<li><span></span><span class="info">Nessuna aula trovata</span></li>';
  }

  el.list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-key]');
    if (!li) return;
    if (li.dataset.floor !== state.floorId) { state.floorId = li.dataset.floor; renderTabs(); }
    select(li.dataset.key);
  });

  el.search.addEventListener('input', () => { state.query = el.search.value; renderList(); });

  // ---------- controlli ----------
  function renderTabs() {
    el.tabs.innerHTML = FLOORS.map((f) => `<button data-id="${f.id}" class="${f.id === state.floorId ? 'active' : ''}">${f.building}<small>${f.name}</small></button>`).join('');
  }
  el.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    state.floorId = b.dataset.id;
    renderTabs();
    renderAll();
  });

  function setLive(on) {
    state.live = on;
    el.now.classList.toggle('on', on);
    if (on) {
      const n = romeNow();
      const changed = n.date !== state.date;
      state.date = n.date; state.minutes = n.minutes;
      el.date.value = n.date;
      if (changed || !state.data) load(n.date);
    }
    renderTime();
  }

  function renderTime() {
    el.time.value = clampSlider(state.minutes);
    el.timeLabel.textContent = min2hm(state.minutes) + (state.live ? ' (adesso)' : '');
    const [, m, d] = (state.date || '').split('-').map(Number);
    ctrlToggle.textContent = `🕒 ${d ? `${d}/${m} ` : ''}${min2hm(state.minutes)}`;
  }

  el.time.addEventListener('input', () => {
    state.minutes = Number(el.time.value);
    state.live = false; el.now.classList.remove('on');
    renderTime();
    renderAll();
  });
  el.date.addEventListener('change', () => {
    if (!el.date.value) return;
    state.date = el.date.value;
    state.live = false; el.now.classList.remove('on');
    state.data = null;
    renderTime();
    load(state.date);
  });
  el.now.addEventListener('click', () => { setLive(true); renderAll(); });

  function renderStatus() {
    if (state.loading) el.status.textContent = 'Caricamento orari…';
    else if (state.error) el.status.textContent = `Errore: ${state.error}`;
    else if (state.data && state.data.stale) el.status.textContent = 'Dati in cache (EasyAcademy non raggiungibile)';
    else if (state.data && state.data.events.length === 0) el.status.textContent = 'Nessun evento in questa data';
    else el.status.textContent = '';
    let rel = '';
    if (state.fetchedAt) {
      const s = Math.floor((Date.now() - state.fetchedAt) / 1000);
      rel = s < 60 ? 'proprio ora' : s < 3600 ? `${Math.floor(s / 60)} min fa` : `${Math.floor(s / 3600)} h fa`;
    }
    el.lastUpdate.textContent = state.data
      ? `aggiornato ${rel}${state.data.lastUpdate ? ` · EasyAcademy: ${state.data.lastUpdate}` : ''}`
      : '';
  }

  function renderAll() {
    renderMap();
    renderList();
    renderDetail();
    renderStatus();
  }

  // ---------- avvio ----------
  // URL condivisibile: ?floor=povo2-0&date=YYYY-MM-DD&time=HH:MM
  const params = new URLSearchParams(location.search);
  if (params.get('floor') && FLOORS.some((f) => f.id === params.get('floor'))) state.floorId = params.get('floor');
  renderTabs();
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') || /^\d{1,2}:\d{2}$/.test(params.get('time') || '')) {
    const n = romeNow();
    state.live = false;
    state.date = params.get('date') || n.date;
    state.minutes = params.get('time') ? hm2min(params.get('time')) : n.minutes;
    el.date.value = state.date;
    renderTime();
    load(state.date);
  } else {
    setLive(true);
  }
  renderAll();

  setInterval(() => {
    if (!state.live) return;
    const n = romeNow();
    const dateChanged = n.date !== state.date;
    state.date = n.date; state.minutes = n.minutes; el.date.value = n.date;
    renderTime();
    if (dateChanged) load(n.date); else renderAll();
  }, 60 * 1000);

  setInterval(() => { if (state.live && state.date) load(state.date); }, REFRESH_MS);
})();
