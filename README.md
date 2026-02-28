# LifeRoute

> **Smart Emergency Evacuation System** — A browser-based, multi-floor building evacuation tool that computes the shortest hazard-free escape route in real time.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-none-green)

---

## Overview

LifeRoute is a zero-dependency, single-page web application that simulates emergency evacuation routing across a multi-floor building. Users select their current room, mark active hazards (fire, smoke, blockages), and receive the shortest safe path to the nearest open exit — updated instantly.

If no hazard-free route exists, the app displays a clear "Evacuation Not Possible" warning with shelter-in-place instructions.

---

## Features

- **Real-time Dijkstra pathfinding** — shortest-path algorithm recalculates on every hazard change
- **Absolute hazard exclusion** — hazardous nodes are fully removed from the graph; no path ever passes through fire, smoke, blocked, or closed zones
- **Multi-floor support** — Basement, Ground Floor, Floor 1, Floor 2, Floor 3
- **Animated SVG map** — orthogonal, corridor-following evacuation path with animated dashes
- **Per-room hazard controls** — set each room to Fire / Smoke / Blocked / Closed independently, per floor
- **Exit management** — individual exits can be marked as blocked
- **Status bar** — real-time NORMAL / CAUTION / EMERGENCY indicator based on active hazard count
- **Step-by-step directions** — numbered instructions with stair and hazard-proximity warnings
- **No server required** — runs entirely in the browser; open `index.html` directly

---

## Project Structure

```
liferoute/
├── index.html          # Semantic HTML shell — no inline styles or scripts
├── css/
│   └── style.css       # All styles — design tokens, layout, SVG classes, animations
└── js/
    ├── data.js         # Building layout: rooms, exits, corridor edges
    ├── routing.js      # Dijkstra engine + hazard-exclusion logic
    ├── render.js       # SVG map drawing + DOM panel builders
    └── main.js         # Global state, event wiring, app bootstrap
```

### Script load order

The four JS files must load in order (as declared in `index.html`):

| Order | File | Purpose |
|-------|------|---------|
| 1 | `data.js` | Defines `BLDG`, `GCOL`, `GROW`, `computeCoords()` |
| 2 | `routing.js` | Reads `BLDG`; defines `findRoute()`, `getHaz()`, `setHaz()` |
| 3 | `render.js` | Reads everything above; defines `render()`, `drawMap()`, etc. |
| 4 | `main.js` | Declares global state (`floor`, `pos`, `haz`); wires events; calls `render()` |

> **Note:** `main.js` declares the global state variables (`let floor`, `let pos`, `let haz`) that `routing.js` and `render.js` access via closure. This is intentional — all business logic reads a single source of truth.

---

## Getting Started

### Run locally

No build step or server required:

```bash
git clone https://github.com/your-username/liferoute.git
cd liferoute
open index.html   # macOS
# or
start index.html  # Windows
# or just drag index.html into your browser
```

### Run with a local dev server (optional)

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Install the "Live Server" extension, then right-click index.html → Open with Live Server
```

Then visit `http://localhost:8080`.

---

## How It Works

### Building graph model

Each floor is represented as a weighted graph:

- **Nodes** — rooms and exit points
- **Edges** — physical corridors between adjacent rooms (all cost = 1)
- **Grid system** — 3 columns × 3 rows; pixel positions derived from `GCOL` and `GROW` constants

```
Floor GF layout (col, row):

  [0,0] Main Entrance   [1,0] Reception    [2,0] Control Room
                        [1,1] Main Hall     [2,1] Kitchen
  [0,2] Washroom                           [2,2] Stairs ↓ Bsmt

  Exit A ── bottom-col0 (Main Door)
  Exit B ── top-col2   (Side Door)
```

### Pathfinding (three-layer hazard exclusion)

`findRoute()` in `routing.js` operates in three stages:

1. **Snapshot** — hazard state is captured as a plain object at the start of each call, so no function in the pipeline reads stale global state.

2. **Graph build** (`buildAdjacency`) — any node with an active blocking hazard (`fire`, `smoke`, `blocked`, `closed`) is silently omitted from the adjacency list. No edge can be added to or from a hazardous node.

3. **Dijkstra** — standard single-source shortest-path. Two additional guards:
   - Skip relaxation of the current node if it is hazardous
   - Skip relaxation *into* a neighbour if it is hazardous

4. **Path verification** — after reconstruction, every intermediate node is checked. If any hazardous node is found, the entire route is discarded and `null` is returned.

`null` → the UI shows **"EVACUATION NOT POSSIBLE"** with shelter-in-place instructions.

### Visual path rendering

The SVG path follows real corridor geometry using `orthoPoints()`:

| Condition | Behaviour |
|-----------|-----------|
| Same column (`ax ≈ bx`) | Straight vertical line |
| Same row (`ay ≈ by`) | Straight horizontal line |
| Diagonal | Vertical-first L-shape (column spine → row spine) |

---

## Hazard Types

| Type | Effect | Visual |
|------|--------|--------|
| 🔥 Fire | Node removed from graph | Red fill + red border |
| 💨 Smoke | Node removed from graph | Orange fill + orange border |
| 🚧 Blocked | Node removed from graph | Yellow dashed border |
| 🔒 Closed | Node removed from graph | Purple fill + purple border |
| 🚫 Exit Blocked | Exit excluded from candidates | Red exit label |

All four room hazard types cause the node to be fully excluded. The distinction exists for UI clarity and future extensibility (e.g. partial traversal costs, hazmat suits).

---

## Adding a New Floor

1. Add a new entry to the `BLDG` object in `js/data.js`:

```js
BLDG.F4 = {
  note: 'Floor 4 — evacuate via Stairs → F3 → … → GF',
  rooms: [
    { id: 'lobby4',  label: 'Lobby 4',    col: 1, row: 1 },
    { id: 'stairF4', label: 'Stairs → F3', col: 1, row: 2, isStair: true },
    // … more rooms
  ],
  exits: [
    { id: 'stairF4_exit', label: 'Stairs → F3 → GF', side: 'bottom', col: 1 },
  ],
  edges: [
    ['lobby4',  'stairF4',       1],
    ['stairF4', 'stairF4_exit',  1],
    // … more edges
  ],
};
```

2. Add a tab button in `index.html`:

```html
<button class="ftab" data-floor="F4">FLOOR 4</button>
```

No other changes needed — the rest of the app adapts automatically.

---

## Customising the Building Layout

The grid is defined by two constants at the top of `js/data.js`:

```js
const GCOL = [110, 360, 610]; // column centre x-values (px) — 3 columns
const GROW = [130, 260, 390]; // row centre y-values (px)    — 3 rows
const RW   = 180;             // room width  (px)
const RH   = 80;              // room height (px)
```

Change these to rearrange the entire grid. All room positions and corridor lines are derived from them at runtime.

---

## Browser Support

Requires a modern browser with support for:

- CSS Custom Properties (variables)
- SVG `polyline` and animations
- ES6+ (`const`, `let`, arrow functions, spread, optional chaining)

Tested in Chrome 120+, Firefox 121+, Safari 17+, Edge 120+.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss the proposed change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a pull request
