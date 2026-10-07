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

- A **rung** is a coloured bar joining two neighbouring lanes. It **deflects
  every colour except its own** — a ball of the rung's colour slips straight
  through — and a deflected ball steps to the next lane.
- There is **one rung per colour**, a fixed set — you **move** them, never add
  or remove any. Since each rung touches every colour but its own, the whole
  set is always interacting with the falling balls; a ball's own-colour rung is
  a **safe gate** you can use to let it carry on straight.
- After you move a rung it briefly **recharges** (the end-rings sweep back to
  full) before it can move again — so you can't frantically shuffle one rung.
  The lock is short and gets shorter as the balls speed up.
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
`js/games/ladder-connect.js`.

---

## Dot Dodge

An omnidirectional **bullet-dodge survival**. Dots stream in from every edge
of the field; you fly a single dot and avoid them. You have a few **lives**;
your **score is simply how long you last**.

### Bullets

- Dots spawn just outside a **random edge** and cross the field. Their spawn
  point runs a little **past the corners**, so shots can enter diagonally and
  bullet density stays **even across the whole board** (no calm corners to camp).
- Most are **straight** shots (soft round dots) fired inward at a random angle.
- Some are **homing** — an **orange circle marked with an arrow** — that
  **track you**, turning at a capped rate (a sharp juke makes them overshoot).
  After a moment they **commit to a straight line** and fly off (and revert to
  the plain look). The fraction that home rises with difficulty.
- Every hitbox is a **circle you can see**: a bullet's hitbox is its visible
  circle, and your dot's is its **solid disk** (the glow is cosmetic). Collision
  uses **swept** (continuous) tests, so even fast shots — or fast dodges — can't
  tunnel through in a single frame.
- Bullets are **type-driven** (`kind`), so new behaviours (curving shots,
  lasers, …) can be added for late game / hard mode without touching the rest.

### Controls

- **Relative drag**: press **anywhere** on the board and drag — the dot moves
  with the pointer's **motion**, not to the pointer. Lift and press again to
  **re-anchor**, so you can steer a dot in a far corner from a comfortable spot.
  Desktop and touch behave the same (hold and drag).
- There is **no speed cap** — the dot moves 1:1 with your drag, so dodging is
  pure skill. The swept collision test keeps this fair: a fast dodge still
  collides if its path crosses a bullet, so you can't phase through them.

### Lives

- You start with a few **lives** (Easy 5 · Normal 4 · Hard 3). A hit **costs one
  life** and grants a brief **invulnerability** (the dot flashes) so a single
  dense cluster can't drain several at once. At **zero lives** the run ends.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best). Both
the **spawn rate** and **bullet speed** rise over time on an unbounded,
ever-gentler log curve (`base + k·ln(1 + t/tau)`), so a run always escalates
without a sudden cliff. Difficulty changes the starting **lives**, the base
rate/speed, the **homing** fraction, and bullet size (Hard shots are smaller and
harder to spot). Each run
opens with a short **3‑2‑1 countdown** so the first moment isn't a scramble.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/dot-dodge.js`.
