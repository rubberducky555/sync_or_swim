/**
 * js/routing.js
 * =============================================================
 * Pathfinding engine — Dijkstra shortest-path with absolute
 * hazard exclusion.
 *
 * Hazard contract (iron-clad, three layers)
 * ------------------------------------------
 * 1. GRAPH BUILD  — hazardous nodes are never added to the
 *    adjacency list. No edge can lead into or out of them.
 * 2. RELAXATION   — an explicit guard blocks relaxation into
 *    any hazardous node, even if somehow reached.
 * 3. PATH VERIFY  — after reconstruction, every intermediate
 *    node is checked. A contaminated path is discarded → null.
 *
 * null return from findRoute() → UI shows "EVACUATION NOT
 * POSSIBLE". A hazardous path is NEVER shown to the user.
 *
 * Depends on: data.js  (BLDG, computeCoords)
 * State used: floor, haz  (set by main.js)
 * =============================================================
 */

'use strict';

// Hazard types that make a node completely impassable
const ROOM_HAZARD_TYPES = new Set(['fire', 'smoke', 'blocked', 'closed']);

// ── State accessors (state owned by main.js) ─────────────────
function getHaz(id) {
  return (haz[floor] || {})[id] || '';
}

function setHaz(id, val) {
  if (!haz[floor]) haz[floor] = {};
  if (val) {
    haz[floor][id] = val;
  } else {
    delete haz[floor][id];
  }
}

// Used by render.js for visual highlighting (reads global state)
function isNodeBlocked(id) {
  return ROOM_HAZARD_TYPES.has(getHaz(id));
}

// ── Hazard snapshot ──────────────────────────────────────────
/**
 * Capture current floor hazards as a plain object.
 * Called once at the top of findRoute() so the entire
 * pathfinding run operates on a consistent, frozen snapshot —
 * no function inside the call chain reads global state.
 */
function snapshotHazards() {
  return Object.assign({}, haz[floor] || {});
}

/** Is a node hazardous given an explicit snapshot? */
function nodeIsHazardous(id, hazSnap) {
  return ROOM_HAZARD_TYPES.has(hazSnap[id] || '');
}

// ── Graph construction ───────────────────────────────────────
/**
 * buildAdjacency(fd, hazSnap)
 * Build the traversable adjacency list for a floor.
 * Any node that appears in hazSnap as a blocking hazard is
 * silently dropped — no edge to or from it is ever added.
 *
 * @param {object} fd       - Floor definition (from BLDG)
 * @param {object} hazSnap  - Frozen hazard state for this run
 * @returns {object}        - { nodeId: [{ to, w }, …], … }
 */
function buildAdjacency(fd, hazSnap) {
  const { rooms, exits } = computeCoords(fd);
  const adj = {};

  [...rooms, ...exits].forEach((n) => {
    adj[n.id] = [];
  });

  fd.edges.forEach(([a, b, w]) => {
    // Drop the edge if either endpoint is hazardous
    if (nodeIsHazardous(a, hazSnap) || nodeIsHazardous(b, hazSnap)) return;
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  });

  return adj;
}

// ── Dijkstra ─────────────────────────────────────────────────
/**
 * dijkstra(fd, startId, hazSnap)
 * Standard single-source shortest-path using a linear-scan
 * priority queue (adequate for the small graphs used here).
 *
 * All hazard checks use the explicit hazSnap — no globals.
 *
 * @param {object} fd       - Floor definition
 * @param {string} startId  - Source node id
 * @param {object} hazSnap  - Frozen hazard state
 * @returns {{ dist: object, prev: object }}
 */
function dijkstra(fd, startId, hazSnap) {
  const { rooms, exits } = computeCoords(fd);
  const allIds = [...rooms.map((r) => r.id), ...exits.map((e) => e.id)];

  const dist = {};
  const prev = {};
  allIds.forEach((id) => {
    dist[id] = Infinity;
    prev[id] = null;
  });

  // If the user's own room is hazardous, no traversal is possible
  if (nodeIsHazardous(startId, hazSnap)) {
    return { dist, prev };
  }

  const adj = buildAdjacency(fd, hazSnap);
  dist[startId] = 0;

  const pq = [{ id: startId, d: 0 }];

  while (pq.length) {
    // Linear-scan extract-min (fine for ≤ ~20 nodes per floor)
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i].d < pq[minIdx].d) minIdx = i;
    }
    const { id: u, d: du } = pq.splice(minIdx, 1)[0];

    if (du > dist[u]) continue;                    // stale entry
    if (nodeIsHazardous(u, hazSnap)) continue;     // safety guard

    for (const { to, w } of (adj[u] || [])) {
      if (nodeIsHazardous(to, hazSnap)) continue;  // never relax into hazard
      const nd = du + w;
      if (nd < dist[to]) {
        dist[to] = nd;
        prev[to] = u;
        pq.push({ id: to, d: nd });
      }
    }
  }

  return { dist, prev };
}

// ── Path reconstruction ──────────────────────────────────────
function mkPath(prev, endId) {
  const path = [];
  let cur = endId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

// ── Public API ───────────────────────────────────────────────
/**
 * findRoute()
 * Compute the safest, shortest evacuation route from the
 * currently selected position (global `pos`) to the nearest
 * open exit on the current floor.
 *
 * Returns null if:
 *   - No position is selected
 *   - No hazard-free path exists to any open exit
 *
 * @returns {{ exitId, d, path }|null}
 */
function findRoute() {
  if (!pos) return null;

  // Snapshot hazards once — used for the entire search
  const hazSnap = snapshotHazards();

  const fd = BLDG[floor];
  const { exits } = computeCoords(fd);
  const { dist, prev } = dijkstra(fd, pos, hazSnap);

  // Find nearest open exit
  let best = null;
  exits.forEach((e) => {
    if ((hazSnap[e.id] || '') === 'exit-blocked') return;
    const d = dist[e.id];
    if (isFinite(d) && (best === null || d < best.d)) {
      best = { exitId: e.id, d, path: mkPath(prev, e.id) };
    }
  });

  if (!best) return null;

  // Layer 3 — verify every intermediate node is hazard-free
  // (belt-and-suspenders; should never trigger with correct graph build)
  for (let i = 1; i < best.path.length - 1; i++) {
    if (nodeIsHazardous(best.path[i], hazSnap)) {
      return null; // discard — never show a dangerous path
    }
  }

  return best;
}
