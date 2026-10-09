/**
 * Rune Tower — an orb-matching combat climb (Phase 1 vertical slice).
 *
 * Drag one orb around a 6×5 board (it swaps along the path, diagonals allowed)
 * within a short per-spin time limit. On release, horizontal/vertical runs of
 * 3+ same-colour orbs clear, cascade, and chain COMBOS. Each spin is one TURN:
 * cleared orbs deal damage to the foe (scaled by combo count and element
 * matchup), HEART orbs heal you, and the foe strikes on its own turn countdown.
 * Clear a foe and a stronger one steps up — your score is the total damage dealt.
 *
 * Elements (6): fire · water · wood · light · dark · heart. Counter wheel:
 * water→fire→wood→water and light↔dark (strong = ×2, weak = ×0.5). Heart heals.
 *
 * Phase 1 is the core loop only: no team / drafts / enemy shields yet — those are
 * Phase 2+. Everything that matters for balance lives in CONFIG + DIFFICULTIES.
 *
 * Built on window.ArcadeCommon (shell / loop / input / audio / i18n / scores /
 * rng / math / format). Rendering is Canvas 2D at a fixed 600×760 portrait space.
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
        rtEasy: 'Easy',
        rtNormal: 'Normal',
        rtHard: 'Hard',
        rtHp: 'HP',
        rtReady: 'Ready',
        rtFoe: 'Foe',
        rtIntro: 'Drag an orb to line up 3+ of a colour and clear them. Chain combos, strike the foe\u2019s weak element, and heal with hearts. Each spin is a turn \u2014 climb as high as you can.',
        rtStartHintHtml: 'Drag an orb on the board · <kbd>P</kbd> pause',
        rtAttackIn: (n) => `Strikes in ${n}`,
        rtCombo: (n) => `${n} Combo`,
        rtOverMsgHtml: (s, f) => `You reached <strong>foe #${f}</strong> for <strong>${s}</strong> damage.`,
        rtOverHintHtml: 'Press <kbd>R</kbd> or the button to climb again.',
        rtHelp1Html: 'Press and <strong>drag an orb</strong> \u2014 it swaps along the path. Line up <strong>3+ of a colour</strong> in a row or column to clear them and hit the foe.',
        rtHelp2Html: 'Chain <strong>combos</strong> for more damage, and match the foe\u2019s <strong>weak element</strong> to hit harder. <strong>Heart</strong> orbs heal you.',
        rtHelp3Html: 'Each spin is one turn; the foe strikes on its countdown. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
        el_fire: 'Fire',
        el_water: 'Water',
        el_wood: 'Wood',
        el_light: 'Light',
        el_dark: 'Dark',
        el_heart: 'Heart',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rtEasy: '簡單',
        rtNormal: '普通',
        rtHard: '困難',
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
    const CELL = 100;                 // 6×100 wide, 5×100 tall
    const BOARD_TOP = H - ROWS * CELL; // = 260; board occupies the bottom

    const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
    const ATTACK_ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark']; // foe elements (not heart)
    const ELEMENT_COLORS = {
        fire: '#ff5a4d', water: '#4db5ff', wood: '#57c766',
        light: '#ffd24a', dark: '#b06bff', heart: '#ff7fb0',
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
    // Config + difficulty
    // =================================================================

    const CONFIG = {
        orbRadius: 40,          // orb radius inside a 100px cell
        baseDamage: 12,         // damage per cleared orb (before combo / element)
        comboStep: 0.25,        // +25% total damage per extra combo
        clearAnim: 0.20,        // sec to flash + shrink a cleared group
        fallAnim: 0.16,         // sec for orbs to settle before the next cascade
        scoreCap: 999999,
    };

    // Per-difficulty balance. playerHp = your health pool. spinTime = seconds you
    // may drag per turn. Foe n (0-based) has hp = enemyHp + enemyHpGrow·n and
    // atk = enemyAtk + enemyAtkGrow·n; it strikes every enemyCd turns.
    const DIFFICULTIES = {
        easy:   { playerHp: 140, spinTime: 6, enemyHp: 70,  enemyHpGrow: 22, enemyAtk: 9,  enemyAtkGrow: 3, enemyCd: 4 },
        normal: { playerHp: 110, spinTime: 5, enemyHp: 90,  enemyHpGrow: 32, enemyAtk: 13, enemyAtkGrow: 4, enemyCd: 3 },
        hard:   { playerHp: 90,  spinTime: 4, enemyHp: 110, enemyHpGrow: 44, enemyAtk: 19, enemyAtkGrow: 6, enemyCd: 3 },
    };

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        difficulty: 'normal',
        diffCfg: null,
        board: [],              // COLS*ROWS orbs or null; orb = { el, x, y, scale }
        clearing: [],           // orbs mid-clear (shrinking), drawn until gone
        enemy: null,            // { index, element, hp, maxHp, atk, cd, cdMax }
        playerHp: 0, playerMaxHp: 0,
        score: 0,
        held: null,             // { cell, px, py, moved } while dragging
        spinTimer: 0,
        resolving: false,
        resolve: null,          // { stage:'flash'|'fall', t, combos:[] }
        floats: [],             // floating feedback text
        shake: 0,
        ended: false,
    };

    let board = G.board;        // local alias (reassigned in resetRun)
    let seedCounter = 1;
    let shell = null;
    let staged = 'normal';      // difficulty chosen for the NEXT run
    let fontCache = null;
    let accentCache = null;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        score: document.getElementById('score'),
        hp: document.getElementById('hp'),
        diffSeg: document.getElementById('difficulty-seg'),
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
    // Board model
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
    function newOrb(el, x, y) { return { el, x, y, scale: 1 }; }
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
        // horizontal
        for (let r = 0; r < ROWS; r++) {
            let c = 0;
            while (c < COLS) {
                const el = elAt(r, c);
                let c2 = c; while (c2 < COLS && elAt(r, c2) === el && el != null) c2++;
                if (el != null && c2 - c >= 3) for (let k = c; k < c2; k++) matched[r * COLS + k] = true;
                c = Math.max(c2, c + 1);
            }
        }
        // vertical
        for (let c = 0; c < COLS; c++) {
            let r = 0;
            while (r < ROWS) {
                const el = elAt(r, c);
                let r2 = r; while (r2 < ROWS && elAt(r2, c) === el && el != null) r2++;
                if (el != null && r2 - r >= 3) for (let k = r; k < r2; k++) matched[k * COLS + c] = true;
                r = Math.max(r2, r + 1);
            }
        }
        // group connected matched same-element cells
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

    // Collapse each column downward, then pour new orbs in from above (they ease
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
            // fill the empty top cells with new orbs, stacked above the board
            let above = 1;
            for (let r = write; r >= 0; r--) {
                const idx = r * COLS + c;
                board[idx] = newOrb(randomEl(), cellCX(idx), BOARD_TOP - above * CELL + CELL / 2);
                above++;
            }
        }
    }

    // =================================================================
    // Input — drag an orb (absolute, on the board), swapping along the path
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
    // The held orb follows the cursor; as the cursor enters a new cell the held
    // orb swaps with it (one step at a time so a fast drag still sweeps the path).
    function dragTo(px, py) {
        if (!G.held) return;
        G.held.px = px; G.held.py = py;
        const target = cellAtPixel(px, py);
        let guard = 0;
        while (G.held.cell !== target && guard++ < 12) {
            const next = stepToward(G.held.cell, target);
            swapCells(G.held.cell, next);
            G.held.cell = next;
            G.held.moved = true;
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }

    function onPointerDown(e) {
        if (!shell.isPlaying() || G.resolving || G.held) return;
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (p.y < BOARD_TOP) return;         // only the board picks up an orb
        AC.audio.unlock();
        const cell = cellAtPixel(p.x, p.y);
        G.held = { cell, px: p.x, py: p.y, moved: false };
        G.spinTimer = G.diffCfg.spinTime;
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
        else G.held = null;                 // a stray tap → cancel, orb eases back
    }

    // =================================================================
    // Turn resolution (cascade state machine)
    // =================================================================

    function startResolve() {
        G.held = null;
        G.resolving = true;
        G.resolve = { stage: 'flash', t: 0, combos: [] };
        matchStep();
    }
    // Pull the next set of matches off the board; if none remain, finish the turn.
    function matchStep() {
        const groups = findMatches();
        if (groups.length === 0) { finishResolve(); return; }
        for (const g of groups) {
            for (const idx of g.cells) {
                const o = board[idx];
                o.scale = 1;
                G.clearing.push(o);
                board[idx] = null;
            }
            G.resolve.combos.push(g);
        }
        G.resolve.stage = 'flash';
        G.resolve.t = 0;
        AC.audio.play('coin');
    }
    function stepResolve(dt) {
        const R = G.resolve;
        R.t += dt;
        if (R.stage === 'flash') {
            const p = Math.min(1, R.t / CONFIG.clearAnim);
            for (const o of G.clearing) o.scale = 1 - p;
            if (R.t >= CONFIG.clearAnim) {
                G.clearing.length = 0;   // cleared orbs gone
                applyGravity();
                R.stage = 'fall';
                R.t = 0;
            }
        } else if (R.stage === 'fall') {
            if (R.t >= CONFIG.fallAnim) matchStep();   // next cascade, or finish
        }
    }

    function finishResolve() {
        const combos = G.resolve.combos;
        const n = combos.length;
        if (n > 0) {
            const mult = 1 + CONFIG.comboStep * (n - 1);
            let dmg = 0, heal = 0;
            for (const g of combos) {
                const base = g.cells.length * CONFIG.baseDamage;
                if (g.el === 'heart') heal += base;
                else dmg += base * elementMult(g.el, G.enemy.element);
            }
            dmg = Math.round(dmg * mult);
            heal = Math.round(heal * mult);
            if (heal > 0) {
                G.playerHp = Math.min(G.playerMaxHp, G.playerHp + heal);
                addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20);
            }
            if (dmg > 0) {
                G.enemy.hp -= dmg;
                G.score = Math.min(CONFIG.scoreCap, G.score + dmg);
                addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26);
            }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }

        G.resolving = false;
        G.resolve = null;

        if (G.enemy.hp <= 0) { defeatEnemy(); }
        else { enemyTurn(); }
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
        const d = G.diffCfg;
        const maxHp = Math.round(d.enemyHp + d.enemyHpGrow * index);
        G.enemy = {
            index,
            element: ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)],
            hp: maxHp, maxHp,
            atk: Math.round(d.enemyAtk + d.enemyAtkGrow * index),
            cd: d.enemyCd, cdMax: d.enemyCd,
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
            if (G.held && idx === G.held.cell) continue;   // held orb follows the cursor
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

        if (G.held) {
            G.spinTimer -= dt;
            if (G.spinTimer <= 0) startResolve();   // time's up → resolve the turn
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
        if (G.held) drawSphere(board[G.held.cell].el, board[G.held.cell].x, board[G.held.cell].y, CONFIG.orbRadius * 1.06, true);
        drawFloats();
        ctx.restore();

        drawSpinTimer();
        if (DEBUG) drawDebug(); // [DEBUG-HOOK]
    }

    // A glossy element sphere with a white glyph, drawn at an arbitrary radius.
    function drawSphere(el, x, y, r, highlight) {
        if (r <= 0.5) return;
        const col = ELEMENT_COLORS[el];
        ctx.save();
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
        g.addColorStop(0, shade(col, 0.55));
        g.addColorStop(0.55, col);
        g.addColorStop(1, shade(col, -0.32));
        ctx.fillStyle = g;
        if (highlight) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
        drawGlyph(el, x, y, r * 0.42);
        if (highlight) {
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(x, y, r + 3, 0, PI2); ctx.stroke();
        }
        ctx.restore();
    }
    // A distinct white glyph per element (also helps colour-blind readability).
    function drawGlyph(el, cx, cy, s) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = Math.max(2, s * 0.16);
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
        // highlight the held orb's current cell
        if (G.held) {
            const idx = G.held.cell, r = cellRow(idx), c = cellCol(idx);
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
            roundRect(c * CELL + 3, BOARD_TOP + r * CELL + 3, CELL - 6, CELL - 6, 10); ctx.stroke();
            ctx.restore();
        }
        // orbs (held drawn later, on top)
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o || (G.held && idx === G.held.cell)) continue;
            drawSphere(o.el, o.x, o.y, CONFIG.orbRadius * (o.scale == null ? 1 : o.scale), false);
        }
        for (const o of G.clearing) drawSphere(o.el, o.x, o.y, CONFIG.orbRadius * o.scale, false);
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

        drawSphere(e.element, 62, 70, 34, false);

        ctx.fillStyle = ELEMENT_COLORS[e.element];
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
        if (!G.held) return;
        const ratio = AC.math.clamp(G.spinTimer / G.diffCfg.spinTime, 0, 1);
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
    // HUD + difficulty selector + overlay
    // =================================================================

    function updateHud() {
        if (dom.score) dom.score.textContent = AC.format.score(G.score);
        if (dom.hp) dom.hp.textContent = String(Math.max(0, Math.ceil(G.playerHp)));
        if (hpStat) hpStat.classList.toggle('danger', G.playerMaxHp > 0 && G.playerHp / G.playerMaxHp <= 0.3);
    }

    function syncDiffButtons() {
        if (!dom.diffSeg) return;
        for (const b of dom.diffSeg.querySelectorAll('button[data-diff]')) {
            const d = b.dataset.diff;
            b.classList.toggle('active', d === staged);
            b.classList.toggle('committed', d === G.difficulty && G.difficulty !== staged);
            b.setAttribute('aria-checked', d === staged ? 'true' : 'false');
        }
    }
    function setDifficulty(d) {
        if (!DIFFICULTIES[d] || d === staged) return;
        staged = d;
        AC.prefs.set('rune-tower', { difficulty: d });
        if (shell && shell.state === 'idle') { resetRun(); render(); }
        else syncDiffButtons();
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
        G.difficulty = staged;
        G.diffCfg = DIFFICULTIES[G.difficulty];
        G.playerHp = G.playerMaxHp = G.diffCfg.playerHp;
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
        syncDiffButtons();
    }

    function init() {
        const pref = AC.prefs.get('rune-tower');
        staged = DIFFICULTIES[pref.difficulty] ? pref.difficulty : 'normal';
        G.difficulty = staged;

        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'rune-tower',
            mode: () => G.difficulty,   // high scores are per-difficulty
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

        if (dom.diffSeg) {
            dom.diffSeg.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-diff]');
                if (btn) { AC.audio.unlock(); setDifficulty(btn.dataset.diff); }
            });
        }

        AC.i18n.subscribe(() => { updateHud(); });

        if (DEBUG) setupDebug(); // [DEBUG-HOOK]

        syncDiffButtons();
        resetRun();
        render();
    }

    // =================================================================
    // [DEBUG-HOOK] window.RT console API + overlay (?debug=1 only)
    // =================================================================

    function drawDebug() {
        const e = G.enemy;
        const lines = [
            'DEBUG [' + G.difficulty + ']',
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
            kill() { if (G.enemy) { G.enemy.hp = 0; } return 'foe marked dead (resolve a spin)'; },
            hp(n) { G.playerHp = AC.math.clamp(n, 0, G.playerMaxHp); updateHud(); return G.playerHp; },
            foe(n) { spawnEnemy(Math.max(0, n | 0)); return G.enemy; },
            diff(d) { setDifficulty(d); return G.difficulty; },
            info() { return { difficulty: G.difficulty, foe: G.enemy, hp: G.playerHp, score: G.score }; },
        };
        console.log('%c[Rune Tower] debug on', 'color:#f5b23d;font-weight:700');
        console.log('RT.kill() hp(n) foe(n) diff("easy"|"normal"|"hard") info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
