/**
 * js/main.js
 * =============================================================
 * Application entry point — global state, event wiring,
 * and initial bootstrap.
 *
 * Global state
 * ------------
 * These three variables are the single source of truth and are
 * read by routing.js and render.js via closure:
 *
 *   floor  {string}  Active floor key ('GF' | 'F1' | 'F2' | 'F3' | 'B')
 *   pos    {string|null}  Currently selected room id, or null
 *   haz    {object}  Per-floor hazard map: haz[floor][roomId] = hazardType
 *
 * Depends on: data.js, routing.js, render.js
 * =============================================================
 */

'use strict';

// ── Global state ──────────────────────────────────────────────
let floor = 'GF';   // active floor
let pos   = null;   // selected room id (null = none)
let haz   = {};     // haz[floorKey][nodeId] = hazard string

// ── Floor switching ───────────────────────────────────────────
/**
 * setFloor(f)
 * Switch to a different floor. Clears pos if the current room
 * does not exist on the new floor.
 * @param {string} f - Floor key
 */
function setFloor(f) {
  floor = f;

  // Highlight the active tab
  document.querySelectorAll('.ftab').forEach((t) => {
    t.classList.toggle('active', t.dataset.floor === f);
  });

  // Drop position if that room doesn't exist on this floor
  const { rooms } = computeCoords(BLDG[f]);
  if (pos && !rooms.find((r) => r.id === pos)) {
    pos = null;
  }

  populateSel();
  render();
}

// ── Position selection ────────────────────────────────────────
/**
 * setPos(id)
 * Select a room as the user's current position.
 * Clicking the already-selected room deselects it (toggle).
 * @param {string} id - Room id
 */
function setPos(id) {
  pos = (pos === id) ? null : (id || null);
  document.getElementById('posSelect').value = pos || '';
  render();
}

// ── Event wiring ──────────────────────────────────────────────
// Floor tab buttons
document.querySelectorAll('.ftab').forEach((btn) => {
  btn.addEventListener('click', () => setFloor(btn.dataset.floor));
});

// Position dropdown
document.getElementById('posSelect').addEventListener('change', function () {
  pos = this.value || null;
  render();
});

// ── Bootstrap ─────────────────────────────────────────────────
populateSel();
render();
