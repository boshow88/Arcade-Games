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
- **Restart**: `R` or the Restart button. Some games (e.g. Ladder
  Connect) return to the ready screen first; others restart instantly.
- **Sound**: `M` toggles mute (also the speaker button). The choice is
  remembered across games.
- **HUD**: a row of stat pills plus any per-game gauges. Each game owns
  its own HUD and scoring. **Best** is the local high score, stored in
  the browser via `localStorage`.
- **Language**: EN / 中 toggle in the top-right of every page.

---

## Ladder Connect

A real-time **ghost leg** (amidakuji). Colour-coded balls fall down a
ladder of vertical lanes; you **move** a fixed set of horizontal **rungs**
to steer each ball into the basket of its own colour.

### The board

- **Lanes**: vertical lines the balls fall down.
- **Slots**: a rung can sit between any two neighbouring lanes, at any row.
- **Baskets**: one per lane at the bottom, each a **distinct** colour for
  the run (lanes = colours). Every ball's colour matches one of them.

### Rungs

- A **rung** is a horizontal bar joining two neighbouring lanes. A ball
  reaching a rung **swaps to the next lane**.
- There is a **fixed number** of rungs per difficulty — you **move** them,
  never add or remove any.
- **Pick up / drop**: press and hold a rung (mouse or touch), drag it, and
  release to drop it in a new slot. While you hold it the rung stays where it
  was (still steering balls) and a translucent **ghost** shows the target.
- Rungs **never block each other**: each lane's left-side and right-side rung
  endpoints are staggered in height (a brick pattern), so neighbouring rungs
  sit at slightly different heights and never conflict. A drop is only refused
  if the exact target slot is already taken (the ghost turns red).

### Goal & scoring

- Steer each falling ball into the basket matching **its colour** for a
  fixed score per correct delivery.
- A **wrong basket** costs one **life**.
- The run ends when **lives** reach zero; the score is submitted to the
  per-difficulty **Best**.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best).
Each difficulty has one **fixed layout** (lanes = colours, so every basket is
a distinct colour). **Every ball falls at the same constant speed** — the same
across all three difficulties — so difficulty comes from the layout, how often
balls spawn, and the wave makeup:

- **Easy**: 3×3. Every wave is a single ball, all one colour.
- **Normal**: 4×4. A wave is **occasionally two** balls (still single-colour);
  same spawn-rate curve as Easy.
- **Hard**: 5×5. Two-ball waves come **more often**, some balls are
  **two-colour**, and the overall spawn rate is a little higher.

A wave is never more than **two** balls, and the two take different lanes (and
usually different colours). The spawn rate **rises steadily over time** toward
a cap it approaches but never reaches (a log-paced curve); the rhythm itself
stays even. A ball or two is seeded at the top of the ladder at the start so
the first seconds aren't empty.

A **two-colour** ball (Hard) is split down the middle and may be delivered into
a basket of **either** colour — handy when the matching basket is far.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/ladder-connect.js`.
