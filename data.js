/**
 * js/data.js
 * =============================================================
 * Building data — floor layouts, room definitions, corridor
 * edges, and exit positions.
 *
 * Grid system
 * -----------
 * Every floor uses a 3-column × 3-row pixel grid:
 *   Columns (cx): [110, 360, 610]
 *   Rows    (cy): [130, 260, 390]
 *   Room size:     W=180, H=80
 *
 * Each room is placed by { col: 0|1|2, row: 0|1|2 }.
 * computeCoords() converts col/row to pixel coordinates at
 * runtime, so all layout logic stays in one place here.
 *
 * Edge format
 * -----------
 * ['nodeA', 'nodeB', cost]
 * All costs are 1 (uniform hop cost) so Dijkstra finds the
 * true minimum-hop path. Every edge is bidirectional.
 * =============================================================
 */

'use strict';

// ── Grid constants ────────────────────────────────────────────
const GCOL = [110, 360, 610]; // column centre x-values (px)
const GROW = [130, 260, 390]; // row centre y-values (px)
const RW   = 180;             // room width  (px)
const RH   = 80;              // room height (px)

// Exit pixel geometry — keyed by side name
const EXIT_DEFS = {
  bottom: (col) => ({ x: GCOL[col] - 90, y: 462, w: 180, h: 28 }),
  top:    (col) => ({ x: GCOL[col] - 90, y: 20,  w: 180, h: 28 }),
  left:   (_)   => ({ x: 20,             y: GROW[1] - 22, w: 28, h: 44 }),
  right:  (_)   => ({ x: 672,            y: GROW[1] - 22, w: 28, h: 44 }),
};

/**
 * computeCoords(fd)
 * Convert a floor definition's col/row room specs into full
 * pixel-coordinate objects used by the renderer.
 * @param {object} fd - Floor definition from BLDG
 * @returns {{ rooms: object[], exits: object[] }}
 */
function computeCoords(fd) {
  const rooms = fd.rooms.map((r) => {
    const cx = GCOL[r.col];
    const cy = GROW[r.row];
    return { ...r, x: cx - RW / 2, y: cy - RH / 2, w: RW, h: RH, cx, cy };
  });

  const exits = fd.exits.map((e) => {
    const d = EXIT_DEFS[e.side](e.col);
    return { ...e, ...d, cx: d.x + d.w / 2, cy: d.y + d.h / 2 };
  });

  return { rooms, exits };
}

// ── Building definition ───────────────────────────────────────
const BLDG = {

  // ─────────────────────────────────────────────────────────
  // GROUND FLOOR
  //
  //   [0,0] Main Entrance   [1,0] Reception    [2,0] Control Room
  //                         [1,1] Main Hall     [2,1] Kitchen
  //   [0,2] Washroom                           [2,2] Stairs ↓ Bsmt
  //
  //   Exit A — bottom-col0 (Main Door)
  //   Exit B — top-col2   (Side Door)
  // ─────────────────────────────────────────────────────────
  GF: {
    note: 'Ground Floor — 2 real exits',
    rooms: [
      { id: 'entrance',  label: 'Main Entrance', col: 0, row: 0 },
      { id: 'reception', label: 'Reception',     col: 1, row: 0 },
      { id: 'control',   label: 'Control Room',  col: 2, row: 0 },
      { id: 'main_hall', label: 'Main Hall',     col: 1, row: 1 },
      { id: 'kitchen',   label: 'Kitchen',       col: 2, row: 1 },
      { id: 'washroom',  label: 'Washroom',      col: 0, row: 2 },
      { id: 'stairGF',   label: 'Stairs ↓ Bsmt', col: 2, row: 2, isStair: true },
    ],
    exits: [
      { id: 'exitA', label: 'Exit A — Main Door', side: 'bottom', col: 0 },
      { id: 'exitB', label: 'Exit B — Side Door',  side: 'top',    col: 2 },
    ],
    edges: [
      // Row 0 — horizontal
      ['entrance',  'reception',  1],
      ['reception', 'control',    1],
      // Row 0→1 — vertical connections
      ['entrance',  'main_hall',  1],
      ['reception', 'main_hall',  1],
      ['control',   'kitchen',    1],
      // Row 1 — horizontal
      ['main_hall', 'kitchen',    1],
      // Row 1→2 — vertical connections
      ['main_hall', 'washroom',   1],
      ['kitchen',   'stairGF',    1],
      // Row 2 — horizontal
      ['washroom',  'stairGF',    1],
      // Exit connections (shortest direct links)
      ['entrance',  'exitA',      1],
      ['washroom',  'exitA',      1],
      ['stairGF',   'exitA',      1],
      ['control',   'exitB',      1],
      ['reception', 'exitB',      1],
      ['kitchen',   'exitB',      1],
    ],
  },

  // ─────────────────────────────────────────────────────────
  // FLOOR 1
  //
  //   [0,0] Room 101    [1,0] —           [2,0] Office
  //   [0,1] —           [1,1] Lobby 1     [2,1] Washroom 1
  //   [0,2] Room 102    [1,2] Stairs→GF   [2,2] Storage
  //
  //   Exit — bottom-col1 (Stairs → GF)
  // ─────────────────────────────────────────────────────────
  F1: {
    note: 'No direct exits — evacuate via Stairs to GF',
    rooms: [
      { id: 'r101',     label: 'Room 101',   col: 0, row: 0 },
      { id: 'office1',  label: 'Office',     col: 2, row: 0 },
      { id: 'lobby1',   label: 'Lobby 1',    col: 1, row: 1 },
      { id: 'wash1',    label: 'Washroom 1', col: 2, row: 1 },
      { id: 'r102',     label: 'Room 102',   col: 0, row: 2 },
      { id: 'stairF1',  label: 'Stairs → GF', col: 1, row: 2, isStair: true },
      { id: 'storage1', label: 'Storage',    col: 2, row: 2 },
    ],
    exits: [
      { id: 'stairF1_exit', label: 'Stairs → GF (Exit A/B)', side: 'bottom', col: 1 },
    ],
    edges: [
      // Row 0→1
      ['r101',    'lobby1',       1],
      ['office1', 'lobby1',       1],
      ['office1', 'wash1',        1],
      // Row 1
      ['lobby1',  'wash1',        1],
      // Row 1→2
      ['lobby1',  'r102',         1],
      ['lobby1',  'stairF1',      1],
      ['wash1',   'storage1',     1],
      // Row 2
      ['r102',    'stairF1',      1],
      ['stairF1', 'storage1',     1],
      // Exit
      ['stairF1', 'stairF1_exit', 1],
    ],
  },

  // ─────────────────────────────────────────────────────────
  // FLOOR 2
  //
  //   [0,0] Room 201    [1,0] —           [2,0] Kitchen
  //   [0,1] —           [1,1] Lobby 2     [2,1] Washroom 2
  //   [0,2] Room 202    [1,2] Stairs→F1   [2,2] Server Room
  //
  //   Exit — bottom-col1 (Stairs → F1 → GF)
  // ─────────────────────────────────────────────────────────
  F2: {
    note: 'No direct exits — evacuate via Stairs to F1 → GF',
    rooms: [
      { id: 'r201',     label: 'Room 201',   col: 0, row: 0 },
      { id: 'kitchen2', label: 'Kitchen',    col: 2, row: 0 },
      { id: 'lobby2',   label: 'Lobby 2',   col: 1, row: 1 },
      { id: 'wash2',    label: 'Washroom 2', col: 2, row: 1 },
      { id: 'r202',     label: 'Room 202',   col: 0, row: 2 },
      { id: 'stairF2',  label: 'Stairs → F1', col: 1, row: 2, isStair: true },
      { id: 'server',   label: 'Server Room', col: 2, row: 2 },
    ],
    exits: [
      { id: 'stairF2_exit', label: 'Stairs → F1 → GF', side: 'bottom', col: 1 },
    ],
    edges: [
      // Row 0→1
      ['r201',     'lobby2',       1],
      ['kitchen2', 'lobby2',       1],
      ['kitchen2', 'wash2',        1],
      // Row 1
      ['lobby2',   'wash2',        1],
      // Row 1→2
      ['lobby2',   'r202',         1],
      ['lobby2',   'stairF2',      1],
      ['wash2',    'server',       1],
      // Row 2
      ['r202',     'stairF2',      1],
      ['stairF2',  'server',       1],
      // Exit
      ['stairF2',  'stairF2_exit', 1],
    ],
  },

  // ─────────────────────────────────────────────────────────
  // FLOOR 3
  //
  //   [0,0] Room 301    [1,0] —           [2,0] Room 303
  //   [0,1] Washroom 3  [1,1] Lobby 3     [2,1] Balcony
  //   [0,2] Room 302    [1,2] Stairs→F2   [2,2] —
  //
  //   Exit — bottom-col1 (Stairs → F2 → F1 → GF)
  // ─────────────────────────────────────────────────────────
  F3: {
    note: 'No direct exits — evacuate via Stairs → F2 → F1 → GF',
    rooms: [
      { id: 'r301',    label: 'Room 301',   col: 0, row: 0 },
      { id: 'r303',    label: 'Room 303',   col: 2, row: 0 },
      { id: 'wash3',   label: 'Washroom 3', col: 0, row: 1 },
      { id: 'lobby3',  label: 'Lobby 3',    col: 1, row: 1 },
      { id: 'balcony', label: 'Balcony',    col: 2, row: 1 },
      { id: 'r302',    label: 'Room 302',   col: 0, row: 2 },
      { id: 'stairF3', label: 'Stairs → F2', col: 1, row: 2, isStair: true },
    ],
    exits: [
      { id: 'stairF3_exit', label: 'Stairs → F2 → F1 → GF', side: 'bottom', col: 1 },
    ],
    edges: [
      // Row 0→1
      ['r301',    'wash3',         1],
      ['r301',    'lobby3',        1],
      ['r303',    'lobby3',        1],
      ['r303',    'balcony',       1],
      // Row 1
      ['wash3',   'lobby3',        1],
      ['lobby3',  'balcony',       1],
      // Row 1→2
      ['wash3',   'r302',          1],
      ['lobby3',  'stairF3',       1],
      ['balcony', 'stairF3',       1],
      // Row 2
      ['r302',    'stairF3',       1],
      // Exit
      ['stairF3', 'stairF3_exit',  1],
    ],
  },

  // ─────────────────────────────────────────────────────────
  // BASEMENT
  //
  //   [0,0] —           [1,0] Storage B     [2,0] Electrical Rm
  //   [0,1] Parking     [1,1] —             [2,1] —
  //   [0,2] —           [1,2] Stairs→GF     [2,2] Generator
  //
  //   Exit A — left-col0   (Emergency Exit)
  //   Exit B — bottom-col1 (Stairs → GF)
  // ─────────────────────────────────────────────────────────
  B: {
    note: 'Basement — 1 emergency exit + stairs to GF',
    rooms: [
      { id: 'storage_b',  label: 'Storage B',     col: 1, row: 0 },
      { id: 'electrical', label: 'Electrical Rm', col: 2, row: 0 },
      { id: 'parking',    label: 'Parking',       col: 0, row: 1 },
      { id: 'generator',  label: 'Generator',     col: 2, row: 2 },
      { id: 'stairB',     label: 'Stairs → GF',   col: 1, row: 2, isStair: true },
    ],
    exits: [
      { id: 'emExit',      label: 'Emergency Exit',         side: 'left',   col: 0 },
      { id: 'stairB_exit', label: 'Stairs → GF (Exit A/B)', side: 'bottom', col: 1 },
    ],
    edges: [
      // Horizontal
      ['storage_b',  'electrical',  1],
      ['parking',    'storage_b',   1],
      ['stairB',     'generator',   1],
      // Vertical
      ['parking',    'stairB',      1],
      ['electrical', 'generator',   1],
      ['storage_b',  'stairB',      1],
      // Exits
      ['parking',    'emExit',      1],
      ['stairB',     'stairB_exit', 1],
    ],
  },
};
