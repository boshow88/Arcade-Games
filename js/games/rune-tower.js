/**
 * Rune Tower — an orb-matching combat climb (Phase 1 vertical slice).
 *
 * Drag one rune around a 6×5 board (it swaps along the path, diagonals allowed).
 * The per-spin timer only starts once the rune first swaps with a neighbour, so
 * picking one up to think costs nothing. On release (or timeout) the spin
 * resolves: horizontal/vertical runs of 3+ clear, cascade, and chain COMBOS —
 * and within a resolve each combo pops ONE AT A TIME (its own sound) for feel.
 *
 * Each spin is one TURN: cleared groups deal damage to the foe (scaled by combo
 * count and element matchup), HEART runes heal you, and the foe strikes on its
 * own turn countdown. Clear a foe and a stronger one steps up — your score is
 * the total damage dealt.
 *
 * Elements (6): fire · water · wood · light · dark · heart. Counter wheel:
 * water→fire→wood→water and light↔dark (strong = ×2, weak = ×0.5). Heart heals.
 *
 * There is NO difficulty selector by design: the whole challenge curve lives in
 * the per-floor growth (BALANCE.enemy*Grow). Per-run tunables live in `G.run`,
 * which Phase 2 upgrades will mutate — one place to patch every rule number.
 *
 * Phase 1 is the core loop only: no team / drafts / enemy shields yet — those are
 * Phase 2+. Built on window.ArcadeCommon. Canvas 2D at a fixed 600×760 portrait.
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;
    const t = (k, ...a) => AC.i18n.t(k, ...a);

    // [DEBUG-HOOK] Dev affordances, enabled with ?debug=1 (see docs/DEV.md).
    const PARAMS = new URLSearchParams(location.search);
    const DEBUG = PARAMS.has('debug');

    // =================================================================
    // i18n (gameplay strings; launcher card strings live in common.js)
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        rtHp: 'HP',
        rtReady: 'Ready',
        rtFoe: 'Foe',
        rtIntro: 'Drag a rune to line up 3+ of a colour and clear them. Chain combos, strike the foe\u2019s weak element, and heal with hearts. Each spin is a turn \u2014 climb as high as you can.',
        rtStartHintHtml: 'Drag a rune on the board · <kbd>P</kbd> pause',
        rtAttackIn: (n) => `Strikes in ${n}`,
        rtCombo: (n) => `${n} Combo`,
        rtOverMsgHtml: (s, f) => `You reached <strong>foe #${f}</strong> for <strong>${s}</strong> damage.`,
        rtOverHintHtml: 'Press <kbd>R</kbd> or the button to climb again.',
        rtHelp1Html: 'Press and <strong>drag a rune</strong> \u2014 it swaps along the path. Line up <strong>3+ of a colour</strong> in a row or column to clear them and hit the foe.',
        rtHelp2Html: 'Chain <strong>combos</strong> for more damage, and match the foe\u2019s <strong>weak element</strong> to hit harder. <strong>Heart</strong> runes heal you.',
        rtHelp3Html: 'Each spin is one turn; the foe strikes on its countdown. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
        el_fire: 'Fire',
        el_water: 'Water',
        el_wood: 'Wood',
        el_light: 'Light',
        el_dark: 'Dark',
        el_heart: 'Heart',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rtHp: '生命',
        rtReady: '準備好了',
        rtFoe: '敵人',
        rtIntro: '拖動符石，把同色連成 3 顆以上消除。串連擊、打敵人的弱屬性、用心珠回血。每轉一次就是一回合——盡量往上爬。',
        rtStartHintHtml: '在盤面上拖動符石 · <kbd>P</kbd> 暫停',
        rtAttackIn: (n) => `${n} 回合後攻擊`,
        rtCombo: (n) => `${n} 連擊`,
        rtOverMsgHtml: (s, f) => `你打到<strong>第 ${f} 個敵人</strong>，累計造成 <strong>${s}</strong> 傷害。`,
        rtOverHintHtml: '按 <kbd>R</kbd> 或按鈕再爬一次。',
        rtHelp1Html: '按住並<strong>拖動一顆符石</strong>，它會沿路交換。把<strong>同色 3 顆以上</strong>連成一橫列或一直行即可消除並攻擊敵人。',
        rtHelp2Html: '串<strong>連擊</strong>可提高傷害；打敵人的<strong>弱屬性</strong>傷害更高。<strong>心</strong>珠可以回血。',
        rtHelp3Html: '每轉一次就是一回合；敵人會依倒數出手。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
        el_fire: '火',
        el_water: '水',
        el_wood: '木',
        el_light: '光',
        el_dark: '暗',
        el_heart: '心',
    });

    // =================================================================
    // Board geometry + element data
    // =================================================================

    const W = 600, H = 760;
    const COLS = 6, ROWS = 5;
    const CELL = 100;                  // 6×100 wide, 5×100 tall
    const BOARD_TOP = H - ROWS * CELL; // = 260; board occupies the bottom

    const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
    const ATTACK_ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark']; // foe elements (not heart)
    // Muted, weathered "stone" tones — earthy rather than candy-bright, so the
    // runes read as carved rock. Hues stay distinct for quick reading.
    const ELEMENT_COLORS = {
        fire: '#c35540', water: '#4f7ba4', wood: '#5f8a52',
        light: '#c3a24a', dark: '#7b6a99', heart: '#c1738a',
    };
    // Spawn weights — hearts a touch rarer so healing isn't guaranteed every board.
    const WEIGHTS = { fire: 1, water: 1, wood: 1, light: 1, dark: 1, heart: 0.75 };
    const WEIGHT_TOTAL = ELEMENTS.reduce((s, e) => s + WEIGHTS[e], 0);
    // Counter wheel: key is STRONG against its value (×2); the reverse is ×0.5.
    const STRONG = { fire: 'wood', wood: 'water', water: 'fire', light: 'dark', dark: 'light' };

    function elementMult(atk, def) {
        if (atk === 'heart') return 0;          // hearts never attack
        if (STRONG[atk] === def) return 2;      // strong
        if (STRONG[def] === atk) return 0.5;    // weak
        return 1;
    }

    // =================================================================
    // Config + balance
    // =================================================================

    const CONFIG = {
        orbRadius: 40,          // rune radius inside a 100px cell
        popTime: 0.13,          // sec each combo takes to pop — one at a time, so you HEAR each
        fallAnim: 0.16,         // sec for runes to settle before the next cascade
        scoreCap: 999999,
    };

    // The single baseline — there is NO difficulty selector. The whole challenge
    // curve lives in the per-floor growth: foe n (0-based) has
    // hp = enemyHp + enemyHpGrow·n and atk = enemyAtk + enemyAtkGrow·n, and
    // strikes every enemyCd turns. Tune the climb here.
    const BALANCE = {
        playerHp: 120,
        spinTime: 6,            // seconds you may drag, once the first swap starts the clock
        baseDamage: 12,         // damage per cleared rune (before combo / element)
        comboStep: 0.25,        // +25% total damage per extra combo
        enemyHp: 80, enemyHpGrow: 30,
        enemyAtk: 11, enemyAtkGrow: 4,
        enemyCd: 3,
    };

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        run: null,              // per-run mutable tunables (copied from BALANCE); upgrades patch THIS
        board: [],              // COLS*ROWS runes or null; rune = { el, x, y, scale, shape }
        clearing: [],           // runes mid-pop (shrinking), drawn until gone
        enemy: null,            // { index, element, hp, maxHp, atk, cd, cdMax, shape }
        playerHp: 0, playerMaxHp: 0,
        score: 0,
        held: null,             // { cell, px, py, moved } while dragging
        spinTimer: 0,
        resolving: false,
        resolve: null,          // { stage:'pop'|'fall', t, combos:[], pending:[], popIndex }
        floats: [],             // floating feedback text
        shake: 0,
        ended: false,
    };

    let board = G.board;        // local alias (reassigned in resetRun)
    let seedCounter = 1;
    let shell = null;
    let fontCache = null;
    let accentCache = null;
    let defaultShape = null;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        score: document.getElementById('score'),
        hp: document.getElementById('hp'),
    };
    const hpStat = dom.hp ? dom.hp.closest('.hud-stat') : null;

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function getFont() {
        if (!fontCache) {
            fontCache = getComputedStyle(document.body).getPropertyValue('--font-display')
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
    }
    function accent() {
        if (!accentCache) {
            accentCache = (getComputedStyle(document.body).getPropertyValue('--game-color') || '').trim()
                || '#f5b23d';
        }
        return accentCache;
    }
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function hexToRgb(h) {
        h = h.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    // amt > 0 lightens toward white, amt < 0 darkens toward black.
    function shade(hex, amt) {
        const [r, g, b] = hexToRgb(hex);
        const f = (x) => Math.round(amt > 0 ? x + (255 - x) * amt : x * (1 + amt));
        return `rgb(${f(r)},${f(g)},${f(b)})`;
    }

    // =================================================================
    // Rune model
    // =================================================================

    function cellCol(idx) { return idx % COLS; }
    function cellRow(idx) { return (idx / COLS) | 0; }
    function cellCX(idx) { return cellCol(idx) * CELL + CELL / 2; }
    function cellCY(idx) { return BOARD_TOP + cellRow(idx) * CELL + CELL / 2; }

    function cellAtPixel(px, py) {
        let c = Math.floor(px / CELL);
        let r = Math.floor((py - BOARD_TOP) / CELL);
        c = AC.math.clamp(c, 0, COLS - 1);
        r = AC.math.clamp(r, 0, ROWS - 1);
        return r * COLS + c;
    }
    function randomEl() {
        let x = AC.rng.float(G.rng, 0, WEIGHT_TOTAL);
        for (const el of ELEMENTS) { x -= WEIGHTS[el]; if (x <= 0) return el; }
        return 'fire';
    }
    // A stable per-rune shape: chamfered-square vertex jitter, surface speckles,
    // a small rotation + tone shift — so every stone looks hand-chipped but never
    // flickers (computed once, carried with the rune as it falls / swaps).
    function makeShape(rng) {
        const jit = [];
        for (let i = 0; i < 8; i++) jit.push([AC.rng.float(rng, -0.05, 0.05), AC.rng.float(rng, -0.05, 0.05)]);
        const speckles = [];
        const k = 4 + AC.rng.int(rng, 0, 3);
        for (let i = 0; i < k; i++) {
            speckles.push({
                dx: AC.rng.float(rng, -0.55, 0.55),
                dy: AC.rng.float(rng, -0.55, 0.55),
                r: AC.rng.float(rng, 0.06, 0.15),
                light: AC.rng.float(rng, 0, 1) < 0.4,
            });
        }
        return { rot: AC.rng.float(rng, -0.1, 0.1), jit, speckles, toneShift: AC.rng.float(rng, -0.07, 0.07) };
    }
    function newOrb(el, x, y) { return { el, x, y, scale: 1, shape: makeShape(G.rng) }; }
    function elAt(r, c) { const o = board[r * COLS + c]; return o ? o.el : null; }

    // Fill a fresh board, then re-roll any cells that start in a match so a run
    // always opens on a clean board (no free combos).
    function fillBoardNoMatches() {
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            board[idx] = newOrb(randomEl(), cellCX(idx), cellCY(idx));
        }
        let guard = 0;
        let groups = findMatches();
        while (groups.length > 0 && guard++ < 200) {
            for (const g of groups) for (const idx of g.cells) board[idx].el = randomEl();
            groups = findMatches();
        }
    }

    // Find all 3+ runs (horizontal + vertical), then group connected matched
    // cells of the same element (4-connectivity) into combos — so an L/T of one
    // colour counts as a single combo, matching Tower-of-Saviors behaviour.
    function findMatches() {
        const n = COLS * ROWS;
        const matched = new Array(n).fill(false);
        for (let r = 0; r < ROWS; r++) {
            let c = 0;
            while (c < COLS) {
                const el = elAt(r, c);
                let c2 = c; while (c2 < COLS && elAt(r, c2) === el && el != null) c2++;
                if (el != null && c2 - c >= 3) for (let k = c; k < c2; k++) matched[r * COLS + k] = true;
                c = Math.max(c2, c + 1);
            }
        }
        for (let c = 0; c < COLS; c++) {
            let r = 0;
            while (r < ROWS) {
                const el = elAt(r, c);
                let r2 = r; while (r2 < ROWS && elAt(r2, c) === el && el != null) r2++;
                if (el != null && r2 - r >= 3) for (let k = r; k < r2; k++) matched[k * COLS + c] = true;
                r = Math.max(r2, r + 1);
            }
        }
        const groups = [];
        const seen = new Array(n).fill(false);
        for (let idx = 0; idx < n; idx++) {
            if (!matched[idx] || seen[idx] || !board[idx]) continue;
            const el = board[idx].el;
            const stack = [idx], cells = [];
            seen[idx] = true;
            while (stack.length) {
                const cur = stack.pop();
                cells.push(cur);
                const r = cellRow(cur), c = cellCol(cur);
                const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                for (const [nr, nc] of nb) {
                    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
                    const ni = nr * COLS + nc;
                    if (matched[ni] && !seen[ni] && board[ni] && board[ni].el === el) { seen[ni] = true; stack.push(ni); }
                }
            }
            groups.push({ el, cells });
        }
        return groups;
    }

    // Collapse each column downward, then pour new runes in from above (they ease
    // down via the per-frame settle in update, so this needs no tweening here).
    function applyGravity() {
        for (let c = 0; c < COLS; c++) {
            let write = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                const idx = r * COLS + c;
                if (board[idx] != null) {
                    const w = write * COLS + c;
                    if (w !== idx) { board[w] = board[idx]; board[idx] = null; }
                    write--;
                }
            }
            let above = 1;
            for (let r = write; r >= 0; r--) {
                const idx = r * COLS + c;
                board[idx] = newOrb(randomEl(), cellCX(idx), BOARD_TOP - above * CELL + CELL / 2);
                above++;
            }
        }
    }

    // =================================================================
    // Input — drag a rune (absolute, on the board), swapping along the path
    // =================================================================

    function boardPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }
    function swapCells(a, b) { const tmp = board[a]; board[a] = board[b]; board[b] = tmp; }
    function stepToward(from, to) {
        const nr = cellRow(from) + Math.sign(cellRow(to) - cellRow(from));
        const nc = cellCol(from) + Math.sign(cellCol(to) - cellCol(from));
        return nr * COLS + nc;
    }
    // The held rune follows the cursor; as the cursor enters a new cell the held
    // rune swaps with it (one step at a time so a fast drag still sweeps the
    // path). The spin clock starts on the FIRST swap, not on pickup.
    function dragTo(px, py) {
        if (!G.held) return;
        G.held.px = px; G.held.py = py;
        const target = cellAtPixel(px, py);
        let guard = 0;
        while (G.held.cell !== target && guard++ < 12) {
            const next = stepToward(G.held.cell, target);
            swapCells(G.held.cell, next);
            G.held.cell = next;
            if (!G.held.moved) { G.held.moved = true; G.spinTimer = G.run.spinTime; } // first swap → start the clock
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }

    function onPointerDown(e) {
        if (!shell.isPlaying() || G.resolving || G.held) return;
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (p.y < BOARD_TOP) return;         // only the board picks up a rune
        AC.audio.unlock();
        const cell = cellAtPixel(p.x, p.y);
        G.held = { cell, px: p.x, py: p.y, moved: false };
        G.spinTimer = G.run.spinTime;        // full; the countdown only runs once `moved`
        const o = board[cell]; if (o) { o.x = p.x; o.y = p.y; }
        AC.audio.play('grab');
        if (e.cancelable) e.preventDefault();
    }
    function onPointerMove(e) {
        if (!G.held) return;
        const p = boardPos(e);
        dragTo(p.x, p.y);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
        if (!G.held) return;
        if (G.held.moved) startResolve();   // a real spin → resolve the turn
        else G.held = null;                 // a stray tap (no swap) → cancel, rune eases back
    }

    // =================================================================
    // Turn resolution (combos pop one at a time, then cascade)
    // =================================================================

    function startResolve() {
        G.held = null;
        G.resolving = true;
        G.resolve = { stage: 'pop', t: 0, combos: [], pending: [], popIndex: 0 };
        G.clearing = [];
        beginCascade();
    }
    // Snapshot this cascade's matches; they then pop one group at a time.
    function beginCascade() {
        G.resolve.pending = findMatches();
        G.resolve.popIndex = 0;
        if (G.resolve.pending.length === 0) { finishResolve(); return; }
        popGroup();
    }
    // Pop the next pending group (its own sound + flash); when the cascade's
    // groups are all popped, drop gravity and roll into the next cascade.
    function popGroup() {
        G.clearing.length = 0;   // the previous group's runes have fully vanished
        if (G.resolve.popIndex >= G.resolve.pending.length) {
            applyGravity();
            G.resolve.stage = 'fall';
            G.resolve.t = 0;
            return;
        }
        const g = G.resolve.pending[G.resolve.popIndex++];
        for (const idx of g.cells) {
            const o = board[idx];
            o.scale = 1;
            G.clearing.push(o);
            board[idx] = null;
        }
        G.resolve.combos.push(g);
        G.resolve.stage = 'pop';
        G.resolve.t = 0;
        comboSound(G.resolve.combos.length);
    }
    // Rising pitch per combo — each pop is audibly its own hit (respects mute).
    function comboSound(n) {
        AC.audio.tone(430 + Math.min(n, 12) * 60, 0.09, { type: 'triangle', volume: 0.14 });
    }
    function stepResolve(dt) {
        const R = G.resolve;
        R.t += dt;
        if (R.stage === 'pop') {
            const p = Math.min(1, R.t / CONFIG.popTime);
            for (const o of G.clearing) o.scale = 1 - p;
            if (R.t >= CONFIG.popTime) popGroup();
        } else if (R.stage === 'fall') {
            if (R.t >= CONFIG.fallAnim) beginCascade();
        }
    }

    // --- Damage / combat (centralised so Phase 2 shields & team mods hook here) ---

    // Pure: turn the resolved combo groups into { dmg, heal, n }.
    function computeSpinResult(combos) {
        const n = combos.length;
        if (n === 0) return { dmg: 0, heal: 0, n: 0 };
        const mult = 1 + G.run.comboStep * (n - 1);
        let dmg = 0, heal = 0;
        for (const g of combos) {
            const base = g.cells.length * G.run.baseDamage;
            if (g.el === 'heart') heal += base;
            else dmg += base * elementMult(g.el, G.enemy.element);
        }
        return { dmg: Math.round(dmg * mult), heal: Math.round(heal * mult), n };
    }
    // Single choke-point for damage to the foe (Phase 2: shields check here).
    function damageEnemy(dmg) {
        G.enemy.hp -= dmg;
        G.score = Math.min(CONFIG.scoreCap, G.score + dmg);
    }

    function finishResolve() {
        const { dmg, heal, n } = computeSpinResult(G.resolve.combos);
        if (n > 0) {
            if (heal > 0) {
                G.playerHp = Math.min(G.playerMaxHp, G.playerHp + heal);
                addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20);
            }
            if (dmg > 0) {
                damageEnemy(dmg);
                addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26);
            }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }

        G.resolving = false;
        G.resolve = null;

        if (G.enemy.hp <= 0) defeatEnemy();
        else enemyTurn();
        updateHud();
    }

    function enemyTurn() {
        G.enemy.cd -= 1;
        if (G.enemy.cd <= 0) {
            const dmg = G.enemy.atk;
            G.playerHp -= dmg;
            G.enemy.cd = G.enemy.cdMax;
            G.shake = 0.4;
            addFloat(W / 2, BOARD_TOP - 70, '-' + dmg, '#ff6b6b', 24);
            AC.audio.play('rock');
            if (G.playerHp <= 0) { G.playerHp = 0; die(); }
        }
    }
    function defeatEnemy() {
        AC.audio.play('levelup');
        spawnEnemy(G.enemy.index + 1);
    }
    function spawnEnemy(index) {
        const maxHp = Math.round(BALANCE.enemyHp + BALANCE.enemyHpGrow * index);
        G.enemy = {
            index,
            element: ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)],
            hp: maxHp, maxHp,
            atk: Math.round(BALANCE.enemyAtk + BALANCE.enemyAtkGrow * index),
            cd: BALANCE.enemyCd, cdMax: BALANCE.enemyCd,
            shape: makeShape(G.rng),
        };
    }
    function die() {
        if (G.ended) return;
        G.ended = true;
        shell.gameOver({ score: G.score, win: false, meta: { foe: G.enemy.index + 1 } });
    }

    function addFloat(x, y, text, color, size) {
        G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 0.9 });
    }

    // =================================================================
    // Simulation
    // =================================================================

    function settleOrbs(dt) {
        const f = Math.min(1, dt * 18);   // ease factor toward the grid
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o) continue;
            if (G.held && idx === G.held.cell) continue;   // held rune follows the cursor
            o.x += (cellCX(idx) - o.x) * f;
            o.y += (cellCY(idx) - o.y) * f;
            o.scale += (1 - o.scale) * f;
        }
    }

    function update(dt) {
        if (G.ended) return;
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

        for (let i = G.floats.length - 1; i >= 0; i--) {
            const fl = G.floats[i];
            fl.t += dt; fl.y -= 22 * dt;
            if (fl.t >= fl.life) G.floats.splice(i, 1);
        }

        // The spin clock only runs once the held rune has actually swapped.
        if (G.held && G.held.moved) {
            G.spinTimer -= dt;
            if (G.spinTimer <= 0) startResolve();
        }
        if (G.resolving) stepResolve(dt);

        settleOrbs(dt);
    }

    // =================================================================
    // Rendering
    // =================================================================

    function render() {
        ctx.fillStyle = '#0d0b16';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (G.shake > 0) {
            const s = G.shake * 9;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        drawEnemyPanel();
        drawPlayerBar();
        drawBoard();
        if (G.held) {
            const o = board[G.held.cell];
            drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true);
        }
        drawFloats();
        ctx.restore();

        drawSpinTimer();
        if (DEBUG) drawDebug(); // [DEBUG-HOOK]
    }

    function defShape() {
        if (!defaultShape) defaultShape = makeShape(AC.rng.make(7));
        return defaultShape;
    }
    // A convex rounded polygon (each vertex rounded with radius `rad`).
    function roundedPolyPath(pts, rad) {
        const n = pts.length;
        const prev = pts[n - 1];
        ctx.beginPath();
        ctx.moveTo((prev[0] + pts[0][0]) / 2, (prev[1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) {
            const cur = pts[i], nxt = pts[(i + 1) % n];
            ctx.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, rad);
        }
        ctx.closePath();
    }
    // A carved stone rune: chamfered-square (octagon) with slight per-stone
    // jitter, a mottled gradient + surface speckles, and an engraved glyph.
    function drawStone(el, x, y, r, shape, highlight) {
        if (r <= 0.5) return;
        const col = ELEMENT_COLORS[el];
        const sh = shape || defShape();
        const c = r * 0.42;         // corner chamfer
        const base = [
            [-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c],
            [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c],
        ];
        const pts = base.map((p, i) => [p[0] + sh.jit[i][0] * r, p[1] + sh.jit[i][1] * r]);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sh.rot);

        roundedPolyPath(pts, r * 0.16);
        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.15);
        g.addColorStop(0, shade(col, 0.26 + sh.toneShift));
        g.addColorStop(0.6, shade(col, sh.toneShift));
        g.addColorStop(1, shade(col, -0.34 + sh.toneShift));
        ctx.fillStyle = g;
        if (highlight) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        ctx.fill();
        ctx.shadowBlur = 0;

        // surface texture, clipped to the stone
        ctx.save();
        ctx.clip();
        for (const sp of sh.speckles) {
            ctx.beginPath();
            ctx.fillStyle = sp.light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
            ctx.arc(sp.dx * r, sp.dy * r, sp.r * r, 0, PI2);
            ctx.fill();
        }
        ctx.beginPath();            // a soft top sheen
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.ellipse(-r * 0.25, -r * 0.42, r * 0.55, r * 0.3, -0.5, 0, PI2);
        ctx.fill();
        ctx.restore();

        // chiselled rim
        roundedPolyPath(pts, r * 0.16);
        ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.strokeStyle = 'rgba(0,0,0,0.33)';
        ctx.stroke();

        // engraved glyph: dark offset under a light face
        drawGlyph(el, 1, 2, r * 0.4, 'rgba(0,0,0,0.30)');
        drawGlyph(el, 0, 0, r * 0.4, 'rgba(244,238,228,0.92)');

        if (highlight) {
            roundedPolyPath(pts.map((p) => [p[0] * 1.08, p[1] * 1.08]), r * 0.16);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.stroke();
        }
        ctx.restore();
    }
    // A distinct glyph per element (helps colour-blind readability), filled/stroked
    // in the given style, centred on (cx, cy) in the current (translated) space.
    function drawGlyph(el, cx, cy, s, style) {
        ctx.save();
        ctx.fillStyle = style;
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(2, s * 0.2);
        ctx.lineJoin = 'round';
        if (el === 'fire') {
            ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.9, cy + s * 0.7); ctx.lineTo(cx - s * 0.9, cy + s * 0.7); ctx.closePath(); ctx.fill();
        } else if (el === 'water') {
            ctx.beginPath(); ctx.moveTo(cx, cy + s); ctx.lineTo(cx + s * 0.9, cy - s * 0.7); ctx.lineTo(cx - s * 0.9, cy - s * 0.7); ctx.closePath(); ctx.fill();
        } else if (el === 'wood') {
            ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
        } else if (el === 'light') {
            const q = s * 0.36;
            ctx.beginPath();
            ctx.moveTo(cx, cy - s); ctx.lineTo(cx + q, cy - q); ctx.lineTo(cx + s, cy); ctx.lineTo(cx + q, cy + q);
            ctx.lineTo(cx, cy + s); ctx.lineTo(cx - q, cy + q); ctx.lineTo(cx - s, cy); ctx.lineTo(cx - q, cy - q);
            ctx.closePath(); ctx.fill();
        } else if (el === 'dark') {
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.82, 0, PI2); ctx.stroke();
        } else if (el === 'heart') {
            const u = s * 0.95;
            ctx.beginPath();
            ctx.moveTo(cx, cy + u * 0.78);
            ctx.bezierCurveTo(cx - u * 1.3, cy - u * 0.4, cx - u * 0.5, cy - u * 1.05, cx, cy - u * 0.35);
            ctx.bezierCurveTo(cx + u * 0.5, cy - u * 1.05, cx + u * 1.3, cy - u * 0.4, cx, cy + u * 0.78);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    function drawBoard() {
        ctx.save();
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const r = cellRow(idx), c = cellCol(idx);
            ctx.fillStyle = ((r + c) & 1) ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.055)';
            ctx.fillRect(c * CELL, BOARD_TOP + r * CELL, CELL, CELL);
        }
        ctx.restore();
        if (G.held) {
            const idx = G.held.cell, r = cellRow(idx), c = cellCol(idx);
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
            roundRect(c * CELL + 3, BOARD_TOP + r * CELL + 3, CELL - 6, CELL - 6, 10); ctx.stroke();
            ctx.restore();
        }
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o || (G.held && idx === G.held.cell)) continue;
            drawStone(o.el, o.x, o.y, CONFIG.orbRadius * (o.scale == null ? 1 : o.scale), o.shape, false);
        }
        for (const o of G.clearing) drawStone(o.el, o.x, o.y, CONFIG.orbRadius * o.scale, o.shape, false);
    }

    function drawBar(x, y, w, h, ratio, color, label) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(x, y, w, h, h / 2); ctx.fill();
        ratio = AC.math.clamp(ratio, 0, 1);
        if (ratio > 0) { ctx.fillStyle = color; roundRect(x, y, Math.max(h, w * ratio), h, h / 2); ctx.fill(); }
        if (label) {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `700 12px ${getFont()}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
        }
        ctx.restore();
    }

    function drawEnemyPanel() {
        const e = G.enemy;
        const f = getFont();
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('rtFoe') + ' #' + (e.index + 1), 22, 28);

        drawStone(e.element, 62, 70, 34, e.shape, false);

        ctx.fillStyle = shade(ELEMENT_COLORS[e.element], 0.35);
        ctx.font = `700 18px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('el_' + e.element), 112, 52);

        drawBar(112, 62, 466, 16, e.hp / e.maxHp, '#ff5566', Math.max(0, Math.ceil(e.hp)) + ' / ' + e.maxHp);

        ctx.fillStyle = e.cd <= 1 ? '#ff8f8f' : 'rgba(255,255,255,0.7)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('rtAttackIn', e.cd) + '  ·  ' + e.atk, 112, 102);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(16, 122); ctx.lineTo(W - 16, 122); ctx.stroke();
    }

    function drawPlayerBar() {
        const f = getFont();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rtHp'), 22, 162);
        const ratio = G.playerHp / G.playerMaxHp;
        const col = ratio <= 0.3 ? '#ff6b6b' : '#6bd98a';
        drawBar(112, 148, 466, 18, ratio, col, Math.max(0, Math.ceil(G.playerHp)) + ' / ' + G.playerMaxHp);
    }

    function drawSpinTimer() {
        if (!G.held || !G.held.moved) return;   // only shows once the clock is running
        const ratio = AC.math.clamp(G.spinTimer / G.run.spinTime, 0, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, BOARD_TOP - 8, W, 6);
        ctx.fillStyle = ratio > 0.3 ? '#8fe36b' : '#ff6b6b';
        ctx.fillRect(0, BOARD_TOP - 8, W * ratio, 6);
        ctx.restore();
    }

    function drawFloats() {
        const f = getFont();
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const fl of G.floats) {
            const a = 1 - fl.t / fl.life;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = fl.color;
            ctx.font = `800 ${fl.size}px ${f}`;
            ctx.fillText(fl.text, fl.x, fl.y);
        }
        ctx.restore();
    }

    // =================================================================
    // HUD + overlay
    // =================================================================

    function updateHud() {
        if (dom.score) dom.score.textContent = AC.format.score(G.score);
        if (dom.hp) dom.hp.textContent = String(Math.max(0, Math.ceil(G.playerHp)));
        if (hpStat) hpStat.classList.toggle('danger', G.playerMaxHp > 0 && G.playerHp / G.playerMaxHp <= 0.3);
    }

    function overlayContent(state, result) {
        if (state === 'idle') {
            return {
                badge: 'gem',
                title: t('rtReady'),
                message: t('rtIntro'),
                button: t('play'),
                hint: t('rtStartHintHtml'),
            };
        }
        if (state === 'over') {
            const score = AC.format.score(result ? result.score : G.score);
            const foe = (result && result.meta ? result.meta.foe : G.enemy.index + 1);
            let msg = t('rtOverMsgHtml', score, foe);
            if (result && result.isNewBest) msg += ` <strong>${t('newBest')}</strong>`;
            return {
                badge: 'skull',
                title: t('gameOver'),
                message: msg,
                button: t('restart'),
                hint: t('rtOverHintHtml'),
            };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        // Per-run tunables start from BALANCE; Phase 2 upgrades will patch G.run.
        G.run = { spinTime: BALANCE.spinTime, baseDamage: BALANCE.baseDamage, comboStep: BALANCE.comboStep };
        G.playerHp = G.playerMaxHp = BALANCE.playerHp;
        G.score = 0;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.clearing = [];
        G.floats = [];
        G.shake = 0;
        G.ended = false;
        board = G.board = new Array(COLS * ROWS).fill(null);
        fillBoardNoMatches();
        spawnEnemy(0);
        updateHud();
        if (shell) shell.refreshBest();
    }

    function init() {
        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'rune-tower',
            mode: () => 'climb',        // single leaderboard (no difficulty selector)
            scoreEpoch: 20261009,       // bump (e.g. to today's date) to reset everyone's bests once
            step: 1 / 60,
            preventKeys: ['Space'],
            update,
            render,
            reset: resetRun,
            overlayContent,
            restartToReady: true,
        });

        document.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', () => { if (G.held && !G.held.moved) G.held = null; else if (G.held) startResolve(); });

        AC.i18n.subscribe(() => { updateHud(); });

        if (DEBUG) setupDebug(); // [DEBUG-HOOK]

        resetRun();
        render();
    }

    // =================================================================
    // [DEBUG-HOOK] window.RT console API + overlay (?debug=1 only)
    // =================================================================

    function drawDebug() {
        const e = G.enemy;
        const lines = [
            'DEBUG',
            'foe #' + (e.index + 1) + '  ' + e.element,
            'foe hp ' + Math.ceil(e.hp) + '/' + e.maxHp,
            'foe atk ' + e.atk + '  cd ' + e.cd + '/' + e.cdMax,
            'you ' + Math.ceil(G.playerHp) + '/' + G.playerMaxHp,
            'score ' + G.score,
        ];
        ctx.save();
        ctx.font = `600 12px ${getFont()}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const bx = W - w - 20, by = BOARD_TOP + 8;
        ctx.fillStyle = 'rgba(10,8,20,0.72)';
        roundRect(bx - 6, by - 4, w + 12, lines.length * 16 + 8, 8); ctx.fill();
        ctx.fillStyle = '#8fe36b';
        let y = by; for (const l of lines) { ctx.fillText(l, bx, y); y += 16; }
        ctx.restore();
    }
    function setupDebug() {
        window.RT = {
            kill() { if (G.enemy) G.enemy.hp = 0; return 'foe marked dead (resolve a spin)'; },
            hp(n) { G.playerHp = AC.math.clamp(n, 0, G.playerMaxHp); updateHud(); return G.playerHp; },
            foe(n) { spawnEnemy(Math.max(0, n | 0)); return G.enemy; },
            info() { return { run: G.run, foe: G.enemy, hp: G.playerHp, score: G.score }; },
        };
        console.log('%c[Rune Tower] debug on', 'color:#f5b23d;font-weight:700');
        console.log('RT.kill() hp(n) foe(n) info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
