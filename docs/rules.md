# Game Rules

A central reference for the games in this arcade collection. Each game
page already shows a short *How to play* footer; this document is the
long form.

Every game here fits the same "arcade" mould:

- Needs real-time input / reaction.
- Has countdown, speed, or rhythm pressure.
- Chases score, time, or combo.
- Simple rules, understood within seconds of starting.
- Suited to short, repeated play.
- Instant retry after a failed run.

## Shared conventions

All games share the same chrome and lifecycle:

- **Start**: from the overlay button, or press `Space` / `Enter`.
- **Pause / Resume**: `P` or `Esc` (also the Pause button). Switching
  browser tabs auto-pauses.
- **Restart**: `R` or the Restart button. Some games (e.g. Colour
  Ladder) return to the ready screen first; others restart instantly.
- **Sound**: `M` toggles mute (also the speaker button). The choice is
  remembered across games.
- **HUD**: a row of stat pills plus any per-game gauges. Each game owns
  its own HUD and scoring. **Best** is the local high score, stored in
  the browser via `localStorage`.
- **Language**: EN / 中 toggle in the top-right of every page.

---

## Colour Ladder

A real-time **ghost leg** (amidakuji). Colour-coded balls fall down a
ladder of vertical lanes; you **move** a fixed set of horizontal **rungs**
to steer each ball into the basket of its own colour.

### The board

- **Lanes**: vertical lines the balls fall down.
- **Rung zone**: on each lane the brighter segment (with a cap at the top and
  bottom) marks where rungs live; a rung can sit between any two neighbouring
  lanes, at any height within that band.
- **Baskets**: one per lane at the bottom, each a **distinct** colour in a
  **fixed order** every run (lanes = colours). Every ball's colour matches one.

### Rungs

- A **rung** is a bar joining two neighbouring lanes; a ball that meets it
  **steps across** to the next lane. You have a fixed set you **move** (never add
  or remove), so you redirect the falls by repositioning them.
- On **Easy / Normal** the rungs are **plain** (colour-agnostic) — they step
  *every* ball. On **Hard** the rungs are **colour-coded** and a rung lets its
  **own colour pass straight through** (a "safe gate"), so you juggle the whole
  set's side-effects.
- After you move a rung it briefly **recharges** (the end-rings sweep back to
  full) before it can move again — so you can't just shuffle one rung for
  everything. The lock shortens as the **wave rate** climbs, keeping pace late.
- A few **fixed obstacle rungs** (thin, muted grey cross-bars) are scattered
  near the top each run. They **block every colour**, can't be moved, and you
  route around them.
- **Pick up / drop**: press and hold a rung (mouse or touch), drag it, and
  release to drop it. You can place it at **any height** — not just on a node.
  While you hold it the rung stays where it was (still steering balls) and a
  translucent **ghost** shows where it will land.
- **Auto-dodge**: if the ghost gets too close to another rung that shares a
  lane, it slides to the nearest free height to make room, so rungs never
  conflict. Only if a column is completely full does the ghost turn red (and
  the rung snaps back on release).

### Goal & scoring

- Steer each falling ball into the basket matching **its colour**. Each correct
  delivery scores **one point** (so the score is simply the number of balls
  delivered), capped at 999999.
- A **wrong basket** costs one **life** (shown as **pips**, not a number); the
  run ends when lives reach zero and the score goes to the per-difficulty
  **Best**.
- A **heal ball** (marked `+`, and faster than normal) is a bonus that arrives
  **on its own timing** — about one every dozen waves, a bit more often as it
  gets busier — and never replaces a normal ball. Land it in its matching
  colour to **regain a life** (max 5); misplacing or ignoring one costs nothing.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best).
Each difficulty has one **fixed layout** (lanes = colours, so every basket is
a distinct colour). **Every ball falls at the same constant speed** — the same
across all three difficulties — so difficulty comes from the layout, how often
balls spawn, and the wave makeup:

- **Easy**: 3×3. Every wave is a single ball.
- **Normal**: 4×4. A wave is **occasionally two** balls; same spawn-rate curve
  as Easy.
- **Hard**: 5×5. Two-ball waves come **more often**, and the overall spawn rate
  is a little higher.

A wave is never more than **two** balls. In a two-ball wave each ball picks a
lane independently (always different colours), so they sometimes land **stacked
in one lane** — peel one off with its colour's rung — and sometimes on two. The spawn rate
**rises over time** on an unbounded, ever-gentler curve — it never plateaus but
keeps slowing, so the late game stays fair; the rhythm itself stays even. Each run opens with a short
**3‑2‑1 countdown** over the frozen board, and a ball or two is seeded at the
top of the ladder, so the first moments aren't a scramble.

Because each rung deflects every colour but its own, every rung on the board
acts on the balls at once — you juggle the whole set, dropping a ball's
own-colour rung in its path when you need it to pass straight through.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/colour-ladder.js`.

---

## Bullet Storm

An omnidirectional **bullet-dodge survival**. Dots stream in from every edge
of the field; you fly a single dot and avoid them. You have a few **lives**;
your **score is simply how long you last**.

### Bullets

- Dots spawn just outside a **random edge** and cross the field. Their spawn
  point runs a little **past the corners**, so shots can enter diagonally and
  bullet density stays **even across the whole board** (no calm corners to camp).
- Most are **straight** shots (soft round dots) fired inward at a random angle,
  **at a mix of speeds** (some fast, some slow).
- Some are **homing**, shown in **red** — they **track you**, turning at a capped
  rate (a sharp juke makes them overshoot). The red stays solid while tracking,
  then **fades to white near the end**; once white they **commit to a straight
  line** and are just a plain bullet. They appear on **Hard** only, phasing in
  over time toward a fixed share of the bullets.
- **Lasers** (Easy & Normal) flash a thin **warning line**, then fire a lethal
  **beam** across the field for a moment — reposition before it fires. They grow
  more frequent over time, toward a fixed share of the bullets, and several can
  be on screen at once.
- Every hitbox is a **circle you can see**: a bullet's hitbox is its visible
  circle, and your dot's is its **solid disk** (the glow is cosmetic). Collision
  uses **swept** (continuous) tests, so even fast shots — or fast dodges — can't
  tunnel through in a single frame.
- Bullets are **type-driven** (`kind`), and lasers are a separate telegraphed
  beam, so new behaviours can be added for late game without touching the rest.

### Controls

- **Mouse (desktop)**: the dot **follows the cursor** — it *is* your pointer (the
  OS cursor is hidden over the board). Nothing to press, so you can never "whiff".
- **Touch (mobile)**: **relative drag** — press on the board **or the margin
  around it** and the dot moves with your finger's **motion**, not to it. Lift and
  press again to **re-anchor**. Starting in that margin means your hand never hides
  the board, and a tap just outside it never whiffs. (Only this play zone ignores
  scroll gestures; the rest of the page scrolls normally.)
- There is **no speed cap** — the dot moves 1:1 with your input, so dodging is
  pure skill. The swept collision test keeps this fair: a fast dodge still
  collides if its path crosses a bullet, so you can't phase through them.

### Lives

- You start with **three lives** (every difficulty). A hit **costs one life** and
  grants a brief **invulnerability** (the dot flashes) so a single dense cluster
  can't drain several at once. At **zero lives** the run ends.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best). Both
the **spawn rate** and **bullet speed** rise over time on a **softplus** curve
(`a + ln(B + e^(c·t))`): flat-ish early, then roughly linear with slope `c`, so a
run keeps escalating without end. Difficulty changes that rate/speed curve, its
special attack (Easy & Normal get telegraphed **lasers**, Hard gets **homing**
shots), and bullet size — Hard's bullets are smaller,
and on every difficulty sizes **skew small** so big ones are rare. Each run opens
with a short **3‑2‑1 countdown** so the first moment isn't a scramble.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/bullet-storm.js`.

---

## Rune Tower (WIP — Phase 2)

An orb-matching **combat climb**, in the spirit of Tower of Saviors but built
as a short run: no long-term cultivation, just spin → fight → climb. Your
**best is the highest floor reached** (total damage is shown too, as a
tiebreak). **Phase 2** adds enhanced runes and between-floor upgrade drafts;
team / active skills / enemy shields / bosses are Phase 3. Full design notes
live in the local `docs/rune-tower-design.md`.

### Board & spinning

- A **6×5** board (30 runes), 6 elements: **fire · water · wood · light · dark ·
  heart**. Press and **drag one rune**; it swaps with each cell it moves into
  (diagonals allowed), so a drag sweeps a whole path. The **spin timer only
  starts on the first swap** (picking a rune up just to look around costs
  nothing); it resolves on **release or timeout**. A stray tap with no swap is
  cancelled — no turn is spent.
- On resolve, every **horizontal/vertical run of 3+** of a colour clears, and
  each connected group **pops one at a time** (its own rising chime) for feel.
  Runes fall, new ones pour in from the top, and any new runs **cascade**. We
  call the groups cleared before any fall the **first wave (首批)** and the
  cascade-produced ones **非首批**.
- **Enhanced runes**: clearing a group of **5+** of a colour forges one
  **enhanced** rune of that colour (gold rim). When later cleared it counts
  **×1.5** — and it's the key to breaking future "enhanced shields".

### Combat (turn-based)

- **One spin = one turn.** Cleared groups deal damage: `Σ(runes, enhanced ×1.5)
  × elementMult × comboMult`, where `comboMult = 1 + 0.25·(combos−1)`. **Heart**
  groups heal you instead of attacking.
- **Element wheel**: water→fire→wood→water and light↔dark. Hitting a foe's weak
  element deals **×2**, its strong element **×0.5**, else ×1.
- The foe **strikes on a countdown** (every `enemyCd` turns); spinning badly =
  the foe lives longer = you eat more hits. Clear a foe and a **stronger one**
  steps up (more HP and attack) — you **climb a floor**. At **0 HP** the run ends.

### The climb & upgrade drafts

There is **no difficulty selector** — one shared leaderboard. The challenge
curve lives in the **per-floor growth**: each foe has more HP and attack than
the last. Every `CONFIG.draftEvery` floors you pick **one of three upgrades**
(leveled stat / board / relic picks) that patch your run.

### Tuning

All balance lives at the top of `js/games/rune-tower.js`: `BALANCE` (HP, spin
time, damage, enhanced multiplier, per-floor `enemy*Grow`), `CONFIG` (timings,
`bigThreshold`, `draftEvery`), and the `UPGRADES` draft pool. Each run copies
the mutable knobs into `G.run`, which upgrades patch; damage math is in
`computeSpinResult()` and all foe damage flows through `damageEnemy()`.
