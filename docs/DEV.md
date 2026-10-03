# Developer notes

How this collection is put together, the conventions to follow, and how
to add another game. For per-game *rules* see [`rules.md`](rules.md).

## Philosophy

- **No build step.** Plain HTML/CSS/JS. It runs from `file://`,
  `python -m http.server`, or GitHub Pages with no tooling.
- **Framework-free.** Everything shared lives on one global,
  `window.ArcadeCommon` (`js/common.js`), created by an IIFE.
- **Offline-capable.** No CDNs. Icons are an inlined subset of Lucide;
  sound is synthesised with WebAudio (no asset files).
- **Relative paths everywhere**, so the site can live at any base URL.
- **Each game owns its own HUD + scoring.** The shared chrome only
  provides the lifecycle, overlay, loop and a generic high-score store —
  it never hard-codes a game's stats. A game defines whatever HUD pills
  it wants in its own page and updates them itself.

## File layout

```
index.html                   Launcher (game picker)
favicon.svg                  Four arcade buttons
css/common.css               Theme tokens (CSS variables) + launcher styles + toast
css/game.css                 Shared game-page chrome: topbar, HUD pills, stamina bar,
                             controls, canvas stage, start/pause/over overlay
js/common.js                 ArcadeCommon — all shared plumbing (see below)
js/games/ladder-connect.js   One file per game: logic + Canvas 2D rendering
docs/rules.md                Player-facing rules
docs/DEV.md                  This file
```

## `ArcadeCommon` surface (`js/common.js`)

| Namespace | What |
| --- | --- |
| `storage` | `readJSON` / `writeJSON` / `storageKey` — namespaced `localStorage` (prefix `arcadeGames`). |
| `prefs` | `get(game)` / `set(game, patch)` — per-game preferences. |
| `scores` | `best(game, mode)` / `submit(game, mode, score, meta)` / `stats(game)` — per-(game, mode) high scores + a recent-runs ring buffer. |
| `rng` | `make(seed)` (mulberry32) + `int` / `float` / `one` / `shuffle`. |
| `math` | `clamp` / `lerp` / `dist`. |
| `format` | `score(n)` (thousands) / `clock(ms|sec, asSeconds)` (mm:ss). |
| `el` / `svgEl` | Tiny DOM/SVG builders. |
| `icon(name)` / `icons.render(root)` | Inline Lucide-subset icons; fills every `[data-icon]` placeholder. |
| `i18n` | EN/中 strings, `t(key, ...args)`, `setLocale`, `subscribe`, `translateNode`, and the mutable `STRINGS` table. |
| `toast` | One shared bottom-centre notice: `toast.show(text, ms)`. |
| `input.keyboard(opts)` | Window-level key state + edge (`onPress`) callbacks. |
| `loop.create(opts)` | Fixed-timestep rAF loop (accumulator). |
| `audio` | WebAudio blip synth. `play(name)`; `unlock()`; `isMuted` / `toggleMuted`. |
| `shell.create(opts)` | Lifecycle + overlay + loop glue (below). |

### The shell

`shell.create(opts)` owns the state machine
`idle → playing → paused → over`, the fixed-timestep loop, the
start/pause/over overlay, and the Pause / Restart / Sound buttons and
their keyboard shortcuts. The game supplies `update(dt)` / `render()` /
`reset()` and calls `shell.gameOver({ score, win, meta })` when the run
ends. It intentionally knows nothing about the game's own HUD.

Config keys: `gameId`, `mode()` (leaderboard bucket), `step`,
`preventKeys`, `update`, `render`, `reset`, `onStart` / `onPause` /
`onResume` / `onGameOver`, `restartToReady` (Restart → ready screen), and `overlayContent(state, result)` returning
`{ badge, title, message, button, hint }`.

DOM ids the shell looks for (all optional): `#overlay`,
`#overlay-badge`, `#overlay-title`, `#overlay-message`, `#overlay-btn`,
`#overlay-hint`, `#pause-btn`, `#restart-btn`, `#sound-btn`, `#best`.

Global shortcuts: `Space`/`Enter` start from idle/over, `P`/`Esc` pause,
`R` restart (to the ready screen if `restartToReady`), `M` mute.
Switching tabs mid-run auto-pauses.

### i18n conventions

- `data-i18n="key"` sets `textContent`; keys ending in **`Html`** set
  `innerHTML` (may contain markup / `[data-icon]`).
- `data-i18n-title` / `data-i18n-aria-label` handle those attributes.
- A game registers its strings by mutating
  `ArcadeCommon.i18n.STRINGS.en` / `.zh` at load time (top of the game
  file, synchronously) — before the DOM-ready translate pass.
- Dynamic text subscribes with `ArcadeCommon.i18n.subscribe(cb)`.

## Adding a new game

1. **Launcher card** in `index.html`: copy a `.game-card` block, give it
   a class (e.g. `panda-dash`) and `href="./games/panda-dash.html"`.
2. **Accent colour**: add `.game-card.<class> { --game-color: #…; }` in
   `css/common.css`, and set `body { --game-color: #…; }` in the game
   page's inline `<style>`.
3. **Game page** `games/<id>.html`: copy `ladder-connect.html` — topbar,
   the HUD pills **your** game needs, a `.stage-wrap` with the
   `<canvas id="stage">` + overlay, controls, and the *How to play*
   footer. Load `../js/common.js` then `../js/games/<id>.js`.
4. **Game module** `js/games/<id>.js`: an IIFE that
   - registers its strings on `AC.i18n.STRINGS`,
   - grabs the canvas + its own HUD nodes,
   - builds state,
   - calls `AC.shell.create({ gameId, update, render, reset, … })`,
   - wires its own input and updates its own HUD,
   - calls `shell.gameOver({ score, win })` when the run ends.
5. **Launcher strings** for the card go in `js/common.js` `STRINGS`
   (EN + 中); per-game gameplay strings stay in the game file.
6. Add a rules section to `docs/rules.md`.

Canvas convention: render at a fixed logical resolution (Ladder Connect
uses 600×760 portrait, capped/centred via a `.stage-wrap { max-width }`
on its page) and scale the backing store by `devicePixelRatio` in a
`fitCanvas()`.

## Ladder Connect internals

- **Tuning lives up top** in `CONFIG` (shared) + `DIFFICULTIES` (per
  preset: layout combos, rows, lives, base fall speed, the rising
  field-complexity cap). Change balance there.
- **Difficulty** is a preset (`easy` / `normal` / `hard`), chosen with
  the on-page selector and stored in prefs; high scores are kept
  per-difficulty (`shell.mode` returns `G.difficulty`). Each run picks
  one of the preset's `combos` (lane×colour layouts) at random.
- **Ladder model.** `G.side[row][lane]` is `+1` if a lane is a rung's
  left endpoint (a ball there goes right), `-1` for the right endpoint,
  `0` otherwise. A ball tracks its logical `lane` and eases its `x`
  toward it, so crossing a rung reads as a diagonal slide.
- **Rungs are unlimited.** `addRung` / `removeRungAt` keep `G.side` and
  the `G.rungs` list in sync. (Fixed/pre-placed rungs are a kept-but-off
  feature; player rungs are drawn by dragging, removed by tapping.)
- **Baskets** (`makeBaskets`) assign the layout's colours across the
  lanes (every colour present); ball colours are drawn from the baskets,
  so the two ratios match. `pickColorForLane` keeps a ball's target
  within `CONFIG.reachMaxLanes` lanes of its spawn.
- **Soft, complexity-based spawning.** `maxField(t)` is a log-paced,
  asymptotic cap on the total "complexity" on the board (every ball = 1;
  high-speed = +1, not yet enabled). Each frame a spawn accumulator
  grows by `rate × headroom^pow` (headroom = how far below the cap the
  board is), so a full board rarely spawns and an empty one fills up —
  it self-balances to the player's clear rate. A wave drops several balls
  at the same height on distinct lanes; a wave never gives a colour more
  balls than it has baskets (always fully routable), and the opening wave
  starts about half-way down.
- **Difficulty over time** is all asymptotic (`timePressure`): fall speed
  approaches `base × CONFIG.fallMult`, and `maxField` approaches its cap
  — neither is ever actually reached.
- **Delivery** compares the ball's colour to its final lane's basket:
  correct → fixed score + `+score` floater; wrong → a life lost; zero
  lives ends the run. (No combo system.)

## Debug / dev affordances

All gated behind `?debug=1` on the game page and tagged in code with a
`[DEBUG-HOOK]` comment (find them with `rg "\[DEBUG-HOOK\]"`).

### URL flags (`games/ladder-connect.html`)

| Flag | Effect |
| --- | --- |
| `?debug=1` | Enables the debug overlay, keyboard shortcuts and the `window.LC` console API. |
| `?t=<seconds>` | Starts every run at that elapsed time — jumps the difficulty (fall speed, spawn rate) to that moment. Works with or without `?debug`. |

Example: `games/ladder-connect.html?debug=1&t=120`.

### Console API — `window.LC` (debug only)

| Call | What |
| --- | --- |
| `LC.setTime(sec)` / `LC.addTime(sec=30)` | Jump the difficulty clock. |
| `LC.addLife(n=1)` | Add lives. |
| `LC.diff("easy"\|"normal"\|"hard")` | Switch difficulty (restarts). |
| `LC.info()` | Snapshot of the live state. |

### Debug keys (debug only)

`]` +30s difficulty · `[` −30s difficulty · `L` +1 life. A readout in
the top-right shows difficulty, elapsed, layout, fall speed, field
complexity vs cap, and ball count.

### Stripping the debug code later

Everything above is gated behind `?debug=1` and tagged `[DEBUG-HOOK]`.
To remove: `rg "\[DEBUG-HOOK\]"`, delete those lines (`PARAMS` /
`DEBUG` / `START_T`, the two `if (DEBUG) …` calls), set the run's start
time back from `START_T` to `0` in `resetRun`, and delete the
`setupDebug` / `drawDebugOverlay` functions. Nothing else references
them.

### Ungated logging

Defensive `console.warn` in `js/common.js` (storage read/write + i18n
subscriber failures). Find with `rg "console\.(log|warn)"`.

## Run locally & deploy

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

GitHub Pages: Settings → Pages → Source `main` / root. All paths are
relative, so pushes to `main` redeploy automatically. No build step.
