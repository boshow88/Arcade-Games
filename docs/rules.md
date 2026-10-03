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
ladder of vertical lanes; you draw and remove horizontal **rungs** on
the fly to steer each ball into the basket of its own colour.

### The board

- **Lanes**: vertical lines the balls fall down.
- **Rows of dots**: the only places a rung may sit.
- **Baskets**: one per lane at the bottom, each a fixed colour for the
  run. Every colour in play is represented, and ball colours are drawn
  from the baskets, so the two always match in proportion.

### Rungs

- A **rung** is a horizontal bar joining two neighbouring lanes at one
  row. A ball reaching a rung **swaps to the next lane**.
- **Draw**: drag from a dot to the neighbouring dot on the same row.
- **Remove**: tap a rung you drew.
- There is **no limit** on how many rungs you place.
- A dot can be the endpoint of only one rung, so rungs never overlap at
  a row.

### Goal & scoring

- Steer each falling ball into the basket matching **its colour** for a
  fixed score per correct delivery.
- A **wrong basket** costs one **life**.
- The run ends when **lives** reach zero; the score is submitted to the
  per-difficulty **Best**.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best).
A layout is chosen at random each run:

- **Easy**: 3×3 or 4×2 lanes×colours, single-colour balls, fewer rows.
- **Normal**: 4×4, 5×5, or 6×3 (6×3 stays single-colour; others may use
  dual-colour balls).
- **Hard**: 5×5, 6×6, or 7×7 — all may use dual-colour balls; wider
  boards fall a little slower to stay fair.

Over time the board gets busier and faster, both **approaching a cap
without ever reaching it** (a log-paced curve). Spawning is **soft**: the
more total "complexity" already on the board, the less likely a new wave
— so the pressure adapts to how fast you clear. A wave never contains
more balls of a colour than that colour has baskets, so every wave can
be routed without a forced mistake; the opening wave starts about
half-way down so you're not left waiting.

On Normal and Hard (only on layouts that allow it), some balls are
**two-colour** (split down the middle) and may be delivered into a basket
of **either** colour — handy when the single matching basket is far. They
appear more often the longer you play.

*Planned (not yet enabled): high-speed waves and per-layout difficulty
balancing.*

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/ladder-connect.js`.
