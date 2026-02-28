/**
 * js/render.js
 * =============================================================
 * Rendering layer — SVG map drawing and DOM panel builders.
 *
 * All functions are pure side-effects against the DOM.
 * They read global state (floor, pos, haz) but never modify it.
 *
 * Depends on: data.js, routing.js
 * =============================================================
 */

'use strict';

// ── SVG helpers ───────────────────────────────────────────────
function svgel(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function svgline(svg, x1, y1, x2, y2, stroke, width = 1) {
  svg.appendChild(svgel('line', { x1, y1, x2, y2, stroke, 'stroke-width': width }));
}

// ── Node centre lookup ────────────────────────────────────────
function getNodeCenter(id, rooms, exits) {
  const r = rooms.find((r) => r.id === id);
  if (r) return { x: r.cx, y: r.cy };
  const e = exits.find((e) => e.id === id);
  if (e) return { x: e.cx, y: e.cy };
  return null;
}

// ── Orthogonal path segments ──────────────────────────────────
/**
 * orthoPoints(ax, ay, bx, by)
 * Return 2–3 waypoints that form a corridor-aligned path
 * from (ax, ay) to (bx, by):
 *
 *   Same column (ax ≈ bx) → straight vertical
 *   Same row    (ay ≈ by) → straight horizontal
 *   Diagonal              → vertical-first L-shape
 *                           (column spine → row spine)
 */
function orthoPoints(ax, ay, bx, by) {
  const sameCol = Math.abs(ax - bx) < 2;
  const sameRow = Math.abs(ay - by) < 2;

  if (sameCol || sameRow) {
    return [{ x: ax, y: ay }, { x: bx, y: by }];
  }

  // Vertical first, then horizontal
  return [{ x: ax, y: ay }, { x: ax, y: by }, { x: bx, y: by }];
}

// ─────────────────────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────────────────────
function drawMap(route) {
  const svg = document.getElementById('mapSvg');
  svg.innerHTML = '';

  const fd = BLDG[floor];
  const { rooms, exits } = computeCoords(fd);
  const pathSet = new Set(route?.path || []);

  // ── Background grid ──
  for (let x = 0; x < 720; x += 60) {
    svgline(svg, x, 0, x, 510, 'rgba(0,200,140,0.025)');
  }
  for (let y = 0; y < 510; y += 60) {
    svgline(svg, 0, y, 720, y, 'rgba(0,200,140,0.025)');
  }

  // Building boundary
  svg.appendChild(svgel('rect', {
    x: 15, y: 15, width: 690, height: 480, rx: 4,
    fill: 'rgba(0,200,140,0.012)',
    stroke: 'rgba(0,200,140,0.07)',
    'stroke-width': 1,
  }));

  // Floor watermark
  const wm = svgel('text', {
    x: 360, y: 255,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': 'Rajdhani,sans-serif',
    'font-size': '90',
    'font-weight': '700',
    fill: 'rgba(0,200,140,0.025)',
    'pointer-events': 'none',
  });
  wm.textContent = floor;
  svg.appendChild(wm);

  // ── Corridor lines ──
  const corridorPairs = [];

  // Horizontal — same row, adjacent columns
  [0, 1, 2].forEach((row) => {
    [0, 1].forEach((col) => {
      corridorPairs.push([
        GCOL[col] + RW / 2, GROW[row],
        GCOL[col + 1] - RW / 2, GROW[row],
      ]);
    });
  });

  // Vertical — same column, adjacent rows
  [0, 1, 2].forEach((col) => {
    [0, 1].forEach((row) => {
      corridorPairs.push([
        GCOL[col], GROW[row] + RH / 2,
        GCOL[col], GROW[row + 1] - RH / 2,
      ]);
    });
  });

  corridorPairs.forEach(([x1, y1, x2, y2]) => {
    svgline(svg, x1, y1, x2, y2, 'rgba(0,200,140,0.07)', 8);
  });

  // ── Evacuation path ──
  if (route && route.path.length > 1) {
    const allPts = [];

    for (let i = 0; i < route.path.length; i++) {
      const c = getNodeCenter(route.path[i], rooms, exits);
      if (!c) continue;

      if (i === 0) {
        allPts.push({ x: c.x, y: c.y });
        continue;
      }

      const pc = getNodeCenter(route.path[i - 1], rooms, exits);
      if (!pc) continue;

      const pts = orthoPoints(pc.x, pc.y, c.x, c.y);
      pts.slice(1).forEach((p) => allPts.push({ x: p.x, y: p.y }));
    }

    if (allPts.length > 1) {
      // Deduplicate consecutive identical points
      const deduped = [allPts[0]];
      for (let i = 1; i < allPts.length; i++) {
        const last = deduped[deduped.length - 1];
        if (Math.abs(allPts[i].x - last.x) > 1 || Math.abs(allPts[i].y - last.y) > 1) {
          deduped.push(allPts[i]);
        }
      }
      const pStr = deduped.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      svg.appendChild(svgel('polyline', { points: pStr, class: 'evac-path' }));
    }
  }

  // ── Rooms ──
  rooms.forEach((room) => {
    const h      = getHaz(room.id);
    const isSel  = room.id === pos;
    const onPath = pathSet.has(room.id) && !isSel;

    let cls = 'room ';
    if      (room.isStair)   cls += 'r-stair';
    else if (isSel)          cls += 'r-sel';
    else if (h === 'fire')   cls += 'r-fire';
    else if (h === 'smoke')  cls += 'r-smoke';
    else if (h === 'blocked')cls += 'r-blocked';
    else if (h === 'closed') cls += 'r-closed';
    else if (onPath)         cls += 'r-path';
    else                     cls += 'r-clear';

    const rect = svgel('rect', {
      x: room.x, y: room.y, width: room.w, height: room.h, rx: 4, class: cls,
    });
    if (!room.isStair) {
      rect.addEventListener('click', () => setPos(room.id));
    }
    svg.appendChild(rect);

    // Stair hatching
    if (room.isStair) {
      for (let d = 0; d < room.w + room.h; d += 12) {
        const x1 = room.x + Math.min(d, room.w);
        const y1 = room.y + Math.max(0, d - room.w);
        const x2 = room.x + Math.max(0, d - room.h);
        const y2 = room.y + Math.min(d, room.h);
        svgline(svg, x1, y1, x2, y2, 'rgba(255,255,255,0.06)', 1);
      }
    }

    // Room label
    let lcls = 'rlbl';
    if      (isSel)          lcls += ' ll-sel';
    else if (h === 'fire')   lcls += ' ll-fire';
    else if (h === 'smoke')  lcls += ' ll-smoke';
    else if (h === 'blocked')lcls += ' ll-blk';
    else if (h === 'closed') lcls += ' ll-cls';
    else if (onPath)         lcls += ' ll-path';

    const lbl = svgel('text', { x: room.cx, y: room.cy, class: lcls });
    lbl.textContent = room.label;
    svg.appendChild(lbl);

    // Hazard icon
    if (h && !room.isStair) {
      const ico = { fire: '🔥', smoke: '💨', blocked: '🚧', closed: '🔒' }[h];
      if (ico) {
        const it = svgel('text', {
          x: room.cx, y: room.cy + 16,
          'text-anchor': 'middle', 'font-size': '11', 'pointer-events': 'none',
        });
        it.textContent = ico;
        svg.appendChild(it);
      }
    }

    // User position marker
    if (isSel) {
      const { cx, cy } = room;
      svg.appendChild(svgel('circle', { cx, cy: cy - 18, r: 12, class: 'u-ring' }));
      svg.appendChild(svgel('circle', {
        cx, cy: cy - 18, r: 6,
        fill: 'var(--blue)', stroke: '#fff', 'stroke-width': '2',
      }));
    }
  });

  // ── Exits ──
  exits.forEach((exit) => {
    const isBlocked = getHaz(exit.id) === 'exit-blocked';
    const isTarget  = route?.exitId === exit.id;

    const rx = svgel('rect', {
      x: exit.x, y: exit.y, width: exit.w, height: exit.h, rx: 2, class: 'r-exit',
      fill:   isBlocked ? 'rgba(255,53,53,0.18)' : isTarget ? 'rgba(0,200,140,0.2)' : 'rgba(255,255,255,0.04)',
      stroke: isBlocked ? 'var(--red)'            : isTarget ? 'var(--green)'        : 'rgba(255,255,255,0.12)',
      'stroke-width': (isTarget || isBlocked) ? '2' : '1',
    });
    if (isTarget) rx.setAttribute('filter', 'drop-shadow(0 0 7px var(--green))');
    svg.appendChild(rx);

    const tl = svgel('text', {
      x: exit.cx, y: exit.cy,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Rajdhani,sans-serif', 'font-size': '9', 'font-weight': '700',
      'pointer-events': 'none',
      class: 'rlbl ' + (isBlocked ? 'll-eblk' : isTarget ? 'll-etgt' : 'll-exit'),
    });
    tl.textContent = (isBlocked ? '✗ ' : isTarget ? '✓ ' : '') + exit.label;
    svg.appendChild(tl);
  });
}

// ─────────────────────────────────────────────────────────────
// LEFT PANEL — room hazard controls
// ─────────────────────────────────────────────────────────────
function buildRoomList() {
  const fd = BLDG[floor];
  const { rooms } = computeCoords(fd);
  const el = document.getElementById('roomList');
  const ICO = { fire: '🔥', smoke: '💨', blocked: '🚧', closed: '🔒', '': '🟢' };

  el.innerHTML = rooms
    .filter((r) => !r.isStair)
    .map((r) => {
      const h = getHaz(r.id);
      return `<div class="rrow ${h ? 'h-' + h : ''}" id="rr-${r.id}">
        <div class="rico">${ICO[h] || '🟢'}</div>
        <div class="rinfo">
          <div class="rname">${r.label}</div>
          <div class="rsub">${h ? h.toUpperCase() : 'CLEAR'}</div>
        </div>
        <select class="hdd" data-room="${r.id}">
          <option value=""        ${!h           ? 'selected' : ''}>CLEAR</option>
          <option value="fire"    ${h === 'fire'    ? 'selected' : ''}>🔥 Fire</option>
          <option value="smoke"   ${h === 'smoke'   ? 'selected' : ''}>💨 Smoke</option>
          <option value="blocked" ${h === 'blocked' ? 'selected' : ''}>🚧 Blocked</option>
          <option value="closed"  ${h === 'closed'  ? 'selected' : ''}>🔒 Closed</option>
        </select>
      </div>`;
    })
    .join('');

  // Use event delegation on the container to avoid stale listeners
  el.querySelectorAll('.hdd').forEach((sel) => {
    sel.addEventListener('change', () => {
      setHaz(sel.dataset.room, sel.value);
      render();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// LEFT PANEL — exit status controls
// ─────────────────────────────────────────────────────────────
function buildExitList(route) {
  const fd = BLDG[floor];
  const { exits } = computeCoords(fd);
  document.getElementById('floorExitNote').textContent = fd.note;

  const el = document.getElementById('exitList');

  el.innerHTML = exits
    .map((e) => {
      const isBlocked = getHaz(e.id) === 'exit-blocked';
      const isTarget  = route?.exitId === e.id;
      return `<div class="xrow ${isBlocked ? 'xblk' : isTarget ? 'xtgt' : ''}">
        <div class="rico">${isBlocked ? '🚫' : isTarget ? '✅' : '🚪'}</div>
        <div class="rinfo">
          <div class="rname">${e.label}</div>
          <div class="rsub">${isBlocked ? 'BLOCKED' : isTarget ? 'TARGET' : 'OPEN'}</div>
        </div>
        <span class="xbadge ${isBlocked ? 'xb-b' : isTarget ? 'xb-t' : 'xb-o'}">
          ${isBlocked ? 'BLOCKED' : isTarget ? 'TARGET' : 'OPEN'}
        </span>
        <select class="hdd" style="margin-left:4px;" data-exit="${e.id}">
          <option value=""             ${!isBlocked ? 'selected' : ''}>OPEN</option>
          <option value="exit-blocked" ${isBlocked  ? 'selected' : ''}>🚫 Block</option>
        </select>
      </div>`;
    })
    .join('');

  el.querySelectorAll('[data-exit]').forEach((sel) => {
    sel.addEventListener('change', () => {
      setHaz(sel.dataset.exit, sel.value);
      render();
    });
  });
}

// ─────────────────────────────────────────────────────────────
// RIGHT PANEL — route result card + step list
// ─────────────────────────────────────────────────────────────
function buildRoutePanel(route) {
  const rb = document.getElementById('routeBox');
  const sl = document.getElementById('stepList');
  const fd = BLDG[floor];
  const { rooms, exits } = computeCoords(fd);

  const lbl = (id) => {
    const r = rooms.find((r) => r.id === id);
    if (r) return r.label;
    const e = exits.find((e) => e.id === id);
    if (e) return e.label;
    return id;
  };

  // No position selected
  if (!pos) {
    rb.className = 'rbox';
    rb.innerHTML = `
      <div class="rbtag">// AWAITING POSITION INPUT</div>
      <p class="rbox-hint">Select your room to compute safest evacuation route.</p>`;
    sl.innerHTML = '';
    return;
  }

  // No safe route exists
  if (!route) {
    const reason = isNodeBlocked(pos)
      ? 'Your current room is a hazard zone. No safe direction to move.'
      : 'All reachable paths pass through hazard zones or all exits are blocked.';

    rb.className = 'rbox fail';
    rb.innerHTML = `
      <div class="rbtag">// EVACUATION FAILED</div>
      <div class="rbfail">⚠ NO SAFE ROUTE</div>
      <p style="font-family:var(--mono);font-size:8px;color:var(--muted);line-height:1.9;margin-top:6px;">
        ${reason}<br><br>Hazard-free evacuation is not possible from this position.
      </p>`;

    sl.innerHTML = `
      <li class="step">
        <div class="si">🚨</div>
        <div class="st">
          <strong style="color:var(--red)">Evacuation not possible.</strong><br>
          <span style="font-size:12px;color:var(--muted)">${reason}</span>
        </div>
      </li>
      <li class="step">
        <div class="si">🛑</div>
        <div class="st">Do <strong>NOT</strong> attempt to travel through fire, smoke, or blocked zones.</div>
      </li>
      <li class="step">
        <div class="si">🚪</div>
        <div class="st">Seal gaps under doors to slow smoke. Move to a window if possible.</div>
      </li>
      <li class="step">
        <div class="si">📞</div>
        <div class="st">Call <strong>emergency services</strong> immediately and report your floor and room.</div>
      </li>`;
    return;
  }

  // Route found — build breadcrumb chain
  const chainHtml = route.path
    .map((id, i) => {
      const cls = i === 0 ? 'cn cs' : i === route.path.length - 1 ? 'cn ce' : 'cn';
      const arr = i < route.path.length - 1 ? '<span class="ca">→</span>' : '';
      return `<span class="${cls}">${lbl(id)}</span>${arr}`;
    })
    .join('');

  rb.className = 'rbox found';
  rb.innerHTML = `
    <div class="rbtag">✓ SAFE EVACUATION ROUTE FOUND</div>
    <div class="rbxit">${lbl(route.exitId)}</div>
    <div class="rbmeta">
      <div>HOPS <span>${route.path.length - 1}</span></div>
      <div>STATUS <span style="color:var(--green)">CLEAR</span></div>
    </div>
    <div class="chain">${chainHtml}</div>`;

  // Step list
  const steps = [{ i: '📍', h: `Start at <strong>${lbl(route.path[0])}</strong>` }];

  for (let i = 1; i < route.path.length; i++) {
    const id     = route.path[i];
    const isLast = i === route.path.length - 1;
    const isStair = !!(rooms.find((r) => r.id === id) || {}).isStair;
    const h = getHaz(id);
    const warn = h === 'fire'  ? '<span class="swarn">⚠ FIRE NEARBY — MOVE FAST</span>'
               : h === 'smoke' ? '<span class="swarn">⚠ SMOKE — STAY LOW</span>'
               : '';

    steps.push({
      i: isLast ? '🚪' : isStair ? '🪜' : '→',
      h: isLast
        ? `Proceed to <strong>${lbl(id)}</strong> — <strong style="color:var(--green)">EXIT HERE</strong>${warn}`
        : `Move to <strong>${lbl(id)}</strong>${warn}`,
    });
  }

  sl.innerHTML = steps
    .map((s) => `<li class="step"><div class="si">${s.i}</div><div class="st">${s.h}</div></li>`)
    .join('');
}

// ─────────────────────────────────────────────────────────────
// RIGHT PANEL — active hazard chip strip
// ─────────────────────────────────────────────────────────────
function buildHazTags() {
  const el = document.getElementById('hazTags');
  const floorHaz = haz[floor] || {};
  const active = Object.entries(floorHaz).filter(([, v]) => v);

  if (!active.length) {
    el.innerHTML = '<span class="none-label">// none active</span>';
    return;
  }

  const fd = BLDG[floor];
  const { rooms, exits } = computeCoords(fd);

  const lbl = (id) => {
    const r = rooms.find((r) => r.id === id);
    if (r) return r.label;
    const e = exits.find((e) => e.id === id);
    if (e) return e.label;
    return id;
  };

  const ICO = { fire: '🔥', smoke: '💨', blocked: '🚧', closed: '🔒', 'exit-blocked': '🚫' };

  el.innerHTML = active
    .map(([id, h]) => `<div class="aht at-${h}">${ICO[h]} ${lbl(id)}</div>`)
    .join('');
}

// ─────────────────────────────────────────────────────────────
// HEADER — status bar
// ─────────────────────────────────────────────────────────────
function updateStatus() {
  const floorHaz = haz[floor] || {};
  const activeCount = Object.values(floorHaz).filter(Boolean).length;

  const fd = BLDG[floor];
  const { exits } = computeCoords(fd);
  const openCount = exits.filter((e) => getHaz(e.id) !== 'exit-blocked').length;

  document.getElementById('ecount').textContent = `${openCount}/${exits.length} OPEN`;

  const dot   = document.getElementById('sdot');
  const txt   = document.getElementById('stext');
  const strip = document.getElementById('strip');

  if (!activeCount) {
    dot.className = 'sdot ok';
    txt.textContent = 'NORMAL';
    strip.classList.remove('on');
  } else if (activeCount < 3) {
    dot.className = 'sdot warn';
    txt.textContent = 'CAUTION';
    strip.classList.add('on');
  } else {
    dot.className = 'sdot crit';
    txt.textContent = 'EMERGENCY';
    strip.classList.add('on');
  }
}

// ─────────────────────────────────────────────────────────────
// POSITION DROPDOWN
// ─────────────────────────────────────────────────────────────
function populateSel() {
  const fd = BLDG[floor];
  const { rooms } = computeCoords(fd);
  const sel = document.getElementById('posSelect');

  sel.innerHTML =
    '<option value="">— Select your room —</option>' +
    rooms
      .filter((r) => !r.isStair)
      .map((r) => `<option value="${r.id}" ${r.id === pos ? 'selected' : ''}>${r.label}</option>`)
      .join('');
}

// ─────────────────────────────────────────────────────────────
// RENDER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────
function render() {
  const route = findRoute();
  drawMap(route);
  buildRoomList();
  buildExitList(route);
  buildRoutePanel(route);
  buildHazTags();
  updateStatus();
}
