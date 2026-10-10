/**
 * Rune Tower — an orb-matching combat climb (simplified).
 *
 * Drag one rune around a 6×5 board (it swaps along the path, diagonals allowed)
 * within a per-spin time limit that only starts on the first swap. On release /
 * timeout the spin resolves: 3+ same-colour runs clear, cascade and chain
 * COMBOS (each pops one at a time). Each spin is one TURN: cleared groups damage
 * the foe (scaled by combo count and element matchup), HEART runes heal you, and
 * the foe strikes on its countdown. Clearing 5+ of a colour forges an ENHANCED
 * rune (×1.5). Clear a foe → climb a floor; your best is the highest floor.
 *
 * The depth is on the ENEMY side (shields + bosses). The player is deliberately
 * simple: a fixed HP pool, a fixed per-cell attack, and just TWO light tools —
 * Focus (extend this spin's time) and Transmute (recolour one colour into
 * another). No team / upgrades / passives — the focus is the spinning itself.
 *
 * Built on window.ArcadeCommon. Canvas 2D at a fixed 600×760 portrait space.
 * Balance lives in CONFIG + BALANCE; enemy abilities in rollShield / bossShield.
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
        rtFloor: 'Floor',
        rtReady: 'Ready',
        rtFoe: 'Foe',
        rtBoss: 'BOSS', rtBossSpecial: 'ELITE BOSS', rtPhase: (n) => `Phase ${n}`,
        rtIntro: 'Drag a rune to line up 3+ of a colour and clear them. Chain combos, strike the foe\u2019s weak element, and heal with hearts. Each spin is a turn \u2014 climb as high as you can.',
        rtStartHintHtml: 'Drag a rune on the board · <kbd>P</kbd> pause',
        rtAttackIn: (n) => `Strikes in ${n}`,
        rtCombo: (n) => `${n} Combo`,
        rtOverMsgHtml: (floor, dmg) => `You climbed to <strong>floor ${floor}</strong> (dealt ${dmg} damage).`,
        rtOverHintHtml: 'Press <kbd>R</kbd> or the button to climb again.',
        rtHelp1Html: 'Press and <strong>drag a rune</strong> \u2014 it swaps along the path. Line up <strong>3+ of a colour</strong> in a row or column to clear them and hit the foe.',
        rtHelp2Html: 'Chain <strong>combos</strong>, match the foe\u2019s <strong>weak element</strong>, and clear <strong>5+</strong> of a colour to forge an <strong>enhanced</strong> rune. <strong>Heart</strong> runes heal you.',
        rtHelp3Html: 'Each spin is one turn; the foe strikes on its countdown. Tap a <strong>skill</strong> (extend time / transmute) to use it. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
        el_fire: 'Fire', el_water: 'Water', el_wood: 'Wood', el_light: 'Light', el_dark: 'Dark', el_heart: 'Heart',
        rtBlocked: 'Blocked!',
        rtShEnhanced: 'Clear enhanced',
        rtShComboMin: (n) => `Need ${n}+ combo`,
        rtShFirstMax: (n) => `First wave \u2264 ${n}`,
        rtShNeed: (els) => `Clear ${els}`,
        rtShBan: (els) => `Don't clear ${els}`,
        rtCast: 'Cast', rtOnCd: 'On cooldown', rtPopupHint: 'Tap outside to cancel', rtCdLabel: 'Cooldown',
        rtSk_focus: 'Focus', rtSkd_focus: 'This spin: +3s of spin time.',
        rtSk_transmute: 'Transmute', rtSkd_transmute: 'Pick a colour, then a target \u2014 all runes of that colour become the target colour.',
        rtTransmuteFrom: 'Tap a colour to change', rtTransmuteTo: 'Tap the target colour',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rtHp: '生命',
        rtFloor: '層',
        rtReady: '準備好了',
        rtFoe: '敵人',
        rtBoss: '首領', rtBossSpecial: '強首領', rtPhase: (n) => `第 ${n} 階段`,
        rtIntro: '拖動符石，把同色連成 3 顆以上消除。串連擊、打敵人的弱屬性、用心珠回血。每轉一次就是一回合——盡量往上爬。',
        rtStartHintHtml: '在盤面上拖動符石 · <kbd>P</kbd> 暫停',
        rtAttackIn: (n) => `${n} 回合後攻擊`,
        rtCombo: (n) => `${n} 連擊`,
        rtOverMsgHtml: (floor, dmg) => `你爬到<strong>第 ${floor} 層</strong>（造成 ${dmg} 傷害）。`,
        rtOverHintHtml: '按 <kbd>R</kbd> 或按鈕再爬一次。',
        rtHelp1Html: '按住並<strong>拖動一顆符石</strong>，它會沿路交換。把<strong>同色 3 顆以上</strong>連成一橫列或一直行即可消除並攻擊敵人。',
        rtHelp2Html: '串<strong>連擊</strong>、打敵人的<strong>弱屬性</strong>；單次消除<strong>同色 5 顆以上</strong>會生成<strong>強化符石</strong>。<strong>心</strong>珠回血。',
        rtHelp3Html: '每轉一次就是一回合；敵人依倒數出手。點<strong>技能</strong>（延長時間／轉換符石）可使用。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
        el_fire: '火', el_water: '水', el_wood: '木', el_light: '光', el_dark: '暗', el_heart: '心',
        rtBlocked: '擋下！',
        rtShEnhanced: '需消強化',
        rtShComboMin: (n) => `需 ${n}+ 連擊`,
        rtShFirstMax: (n) => `首批 \u2264 ${n} 連擊`,
        rtShNeed: (els) => `需消 ${els}`,
        rtShBan: (els) => `禁消 ${els}`,
        rtCast: '施放', rtOnCd: '冷卻中', rtPopupHint: '點擊外面取消', rtCdLabel: '冷卻',
        rtSk_focus: '凝神', rtSkd_focus: '本次轉珠時間 +3 秒。',
        rtSk_transmute: '轉換', rtSkd_transmute: '選一個顏色，再選目標色；盤上該色符石全變成目標色。',
        rtTransmuteFrom: '點選要轉換的顏色', rtTransmuteTo: '點選目標顏色',
    });

    // =================================================================
    // Board geometry + element data
    // =================================================================

    const W = 600, H = 760;
    const COLS = 6, ROWS = 5;
    const CELL = 100;
    const BOARD_TOP = H - ROWS * CELL; // = 260; board occupies the bottom

    const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
    const ATTACK_ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark'];
    const ELEMENT_COLORS = {
        fire: '#c35540', water: '#4f7ba4', wood: '#5f8a52',
        light: '#c3a24a', dark: '#7b6a99', heart: '#c1738a',
    };
    // Lucide icon geometry (24×24 viewBox): water=bubbles, fire=flame, wood=leaf,
    // light=astroid, dark=eclipse, heart=heart. `p` = path, `c` = [cx,cy,r] circle.
    const ICON_OPS = {
        water: [{ p: 'M7.001 15.085A1.5 1.5 0 0 1 9 16.5' }, { c: [18.5, 8.5, 3.5] }, { c: [7.5, 16.5, 5.5] }, { c: [7.5, 4.5, 2.5] }],
        fire:  [{ p: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4' }],
        wood:  [{ p: 'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20' }, { p: 'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13' }],
        light: [{ p: 'M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203' }],
        dark:  [{ c: [12, 12, 10] }, { p: 'M12 2a7 7 0 1 0 10 10' }],
        heart: [{ p: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5' }],
    };
    // Pre-build a Path2D per element ONCE (re-parsing SVG every frame stutters).
    const ICON_PATHS = {};
    for (const _el in ICON_OPS) {
        ICON_PATHS[_el] = ICON_OPS[_el].map((op) => {
            if (op.p) return new Path2D(op.p);
            const pp = new Path2D(); pp.arc(op.c[0], op.c[1], op.c[2], 0, PI2); return pp;
        });
    }
    const WEIGHTS = { fire: 1, water: 1, wood: 1, light: 1, dark: 1, heart: 0.75 };
    const WEIGHT_TOTAL = ELEMENTS.reduce((s, e) => s + WEIGHTS[e], 0);
    const STRONG = { fire: 'wood', wood: 'water', water: 'fire', light: 'dark', dark: 'light' };

    function elementMult(atk, def) {
        if (atk === 'heart') return 0;
        if (STRONG[atk] === def) return 2;
        if (STRONG[def] === atk) return 0.5;
        return 1;
    }

    // =================================================================
    // Config + balance
    // =================================================================

    const CONFIG = {
        orbRadius: 40,
        iconScale: 0.8,         // rune icon diameter = orbRadius × this
        iconStroke: 0.12,       // rune icon stroke width = orbRadius × this
        iconTint: -0.15,        // normal rune icon = shade(element colour, this)
        popTime: 0.13,
        fallAnim: 0.16,
        bigThreshold: 5,        // clearing this many of a colour forges an enhanced rune
        scoreCap: 999999,
    };

    const BALANCE = {
        playerHp: 120,
        spinTime: 6,
        baseDamage: 12,         // damage per cleared rune (before combo / element)
        heartHeal: 12,          // HP healed per cleared heart rune (before combo)
        comboStep: 0.25,        // +25% total damage per extra combo
        enhancedMult: 1.5,      // an enhanced rune's cell counts this × in damage
        enemyHp: 80, enemyHpGrow: 30,
        enemyAtk: 11, enemyAtkGrow: 4,
        enemyCd: 3,
    };

    // Two light player tools. Casting is free; a turn (and cooldowns, in turns)
    // advances only when you spin. Transmute is handled specially (board pick).
    const SKILLS = [
        { id: 'focus', cd: 4 },
        { id: 'transmute', cd: 5 },
    ];
    function skillDef(id) { return SKILLS.find((s) => s.id === id); }

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        board: [],
        clearing: [],
        enemy: null,
        playerHp: 0, playerMaxHp: 0,
        score: 0,               // cumulative damage (display / tiebreak)
        held: null,
        spinTimer: 0,
        resolving: false,
        resolve: null,          // { stage, t, combos, pending, popIndex, wave }
        skills: [],             // [{ id, cd }]
        skillPopup: null,       // { i } while a skill's confirm popup is open
        transmute: null,        // { skillIndex, fromEl } while picking colours
        bonusTimeNext: 0,       // extra seconds for the next spin (Focus)
        floats: [],
        shake: 0,
        ended: false,
    };

    let board = G.board;
    let seedCounter = 1;
    let shell = null;
    let fontCache = null;
    let accentCache = null;
    let defaultShape = null;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        floor: document.getElementById('floor'),
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
            accentCache = (getComputedStyle(document.body).getPropertyValue('--game-color') || '').trim() || '#f5b23d';
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
    function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
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
    function makeShape(rng) {
        const jit = [];
        for (let i = 0; i < 8; i++) jit.push([AC.rng.float(rng, -0.05, 0.05), AC.rng.float(rng, -0.05, 0.05)]);
        const speckles = [];
        const k = 4 + AC.rng.int(rng, 0, 3);
        for (let i = 0; i < k; i++) {
            speckles.push({
                dx: AC.rng.float(rng, -0.55, 0.55), dy: AC.rng.float(rng, -0.55, 0.55),
                r: AC.rng.float(rng, 0.06, 0.15), light: AC.rng.float(rng, 0, 1) < 0.4,
            });
        }
        return { rot: AC.rng.float(rng, -0.1, 0.1), jit, speckles, toneShift: AC.rng.float(rng, -0.07, 0.07) };
    }
    function newOrb(el, x, y, enhanced) { return { el, x, y, scale: 1, shape: makeShape(G.rng), enhanced: !!enhanced }; }
    function elAt(r, c) { const o = board[r * COLS + c]; return o ? o.el : null; }

    function fillBoardNoMatches() {
        for (let idx = 0; idx < COLS * ROWS; idx++) board[idx] = newOrb(randomEl(), cellCX(idx), cellCY(idx));
        let guard = 0;
        let groups = findMatches();
        while (groups.length > 0 && guard++ < 200) {
            for (const g of groups) for (const idx of g.cells) board[idx].el = randomEl();
            groups = findMatches();
        }
    }

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
    // Input
    // =================================================================

    function boardPos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
    }
    function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
    function swapCells(a, b) { const tmp = board[a]; board[a] = board[b]; board[b] = tmp; }
    function stepToward(from, to) {
        const nr = cellRow(from) + Math.sign(cellRow(to) - cellRow(from));
        const nc = cellCol(from) + Math.sign(cellCol(to) - cellCol(from));
        return nr * COLS + nc;
    }
    function dragTo(px, py) {
        if (!G.held) return;
        G.held.px = px; G.held.py = py;
        const target = cellAtPixel(px, py);
        let guard = 0;
        while (G.held.cell !== target && guard++ < 12) {
            const next = stepToward(G.held.cell, target);
            swapCells(G.held.cell, next);
            G.held.cell = next;
            if (!G.held.moved) { G.held.moved = true; G.spinTimer = effectiveSpinTime(); } // first swap starts the clock
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);

        if (G.skillPopup) {                  // confirm / cancel the skill popup
            const L = skillPopupLayout(), s = G.skills[G.skillPopup.i];
            if (s && s.cd <= 0 && inRect(p, L.cast)) { const i = G.skillPopup.i; G.skillPopup = null; AC.audio.unlock(); activateSkill(i); }
            else if (!inRect(p, L.card)) { G.skillPopup = null; }
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.transmute) {                   // pick source colour, then target (tap runes); tap above board cancels
            if (p.y >= BOARD_TOP) {
                const o = board[cellAtPixel(p.x, p.y)];
                if (o) {
                    if (G.transmute.fromEl == null) { G.transmute.fromEl = o.el; AC.audio.play('grab'); }
                    else if (o.el !== G.transmute.fromEl) applyTransmute(G.transmute.fromEl, o.el);
                }
            } else { G.transmute = null; }
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.resolving || G.held) return;
        if (p.y < BOARD_TOP) {               // above the board: skill buttons live here
            for (const b of skillButtonRects()) {
                if (inRect(p, b)) { AC.audio.unlock(); G.skillPopup = { i: b.i }; if (e.cancelable) e.preventDefault(); return; }
            }
            return;
        }
        AC.audio.unlock();
        const cell = cellAtPixel(p.x, p.y);
        G.held = { cell, px: p.x, py: p.y, moved: false };
        G.spinTimer = effectiveSpinTime();
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
        if (G.held.moved) startResolve();
        else G.held = null;
    }

    // =================================================================
    // Turn resolution (combos pop one at a time, then cascade)
    // =================================================================

    function startResolve() {
        G.held = null;
        G.resolving = true;
        G.resolve = { stage: 'pop', t: 0, combos: [], pending: [], popIndex: 0, wave: -1 };
        beginCascade();
    }
    function beginCascade() {
        G.resolve.wave++;                          // wave 0 = 首批 (first wave), >0 = cascade
        G.resolve.pending = findMatches();
        G.resolve.popIndex = 0;
        if (G.resolve.pending.length === 0) { finishResolve(); return; }
        popGroup();
    }
    function popGroup() {
        G.clearing.length = 0;
        if (G.resolve.popIndex >= G.resolve.pending.length) {
            applyGravity();
            G.resolve.stage = 'fall'; G.resolve.t = 0;
            return;
        }
        const g = G.resolve.pending[G.resolve.popIndex++];
        g.wave = G.resolve.wave;
        let enh = 0;
        for (const idx of g.cells) {
            const o = board[idx];
            if (o.enhanced) enh++;
            o.scale = 1;
            G.clearing.push(o);
            board[idx] = null;
        }
        g.enhanced = enh;
        // Forge an enhanced rune IN PLACE in a random just-cleared cell of a 5+ group.
        if (g.cells.length >= CONFIG.bigThreshold) {
            const pick = g.cells[AC.rng.int(G.rng, 0, g.cells.length)];
            const o = newOrb(g.el, cellCX(pick), cellCY(pick), true);
            o.scale = 0;
            board[pick] = o;
        }
        G.resolve.combos.push(g);
        G.resolve.stage = 'pop'; G.resolve.t = 0;
        comboSound(G.resolve.combos.length);
    }
    function comboSound(n) { AC.audio.tone(430 + Math.min(n, 12) * 60, 0.09, { type: 'triangle', volume: 0.14 }); }
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

    // --- Shields (enemy ability; checked against the resolved spin) ---

    function shieldBlocks(shield, stats) {
        if (!shield) return false;
        switch (shield.type) {
            case 'enhanced': return stats.enhancedCleared <= 0;
            case 'combo':
                if (shield.mode === 'min') return stats.combos < shield.n;
                if (shield.mode === 'exact') return stats.combos !== shield.n;
                return false;
            case 'firstWaveMax': return stats.firstWave > shield.n;
            case 'element':
                if (shield.mode === 'ban') return shield.elements.some((el) => stats.elements.has(el));
                return !shield.elements.every((el) => stats.elements.has(el));
            default: return false;
        }
    }
    function shieldLabel(s) {
        if (s.type === 'enhanced') return t('rtShEnhanced');
        if (s.type === 'combo') return t('rtShComboMin', s.n);
        if (s.type === 'firstWaveMax') return t('rtShFirstMax', s.n);
        if (s.type === 'element') {
            const names = s.elements.map((el) => t('el_' + el)).join('·');
            return s.mode === 'ban' ? t('rtShBan', names) : t('rtShNeed', names);
        }
        return '';
    }

    // --- Damage / combat ---

    function computeSpinResult(combos) {
        const n = combos.length;
        const stats = { combos: n, firstWave: 0, enhancedCleared: 0, elements: new Set() };
        if (n === 0) return { dmg: 0, heal: 0, n: 0, blocked: false };
        const comboMult = 1 + BALANCE.comboStep * (n - 1);
        let dmg = 0, heal = 0;
        for (const g of combos) {
            if (g.wave === 0) stats.firstWave++;
            stats.enhancedCleared += (g.enhanced || 0);
            stats.elements.add(g.el);
            const count = g.cells.length + (g.enhanced || 0) * (BALANCE.enhancedMult - 1);
            if (g.el === 'heart') { heal += count * BALANCE.heartHeal; continue; }
            dmg += count * BALANCE.baseDamage * elementMult(g.el, G.enemy.element);
        }
        const blocked = shieldBlocks(G.enemy.shield, stats);
        const total = blocked ? 0 : dmg * comboMult;
        return { dmg: Math.round(total), heal: Math.round(heal * comboMult), n, blocked };
    }
    function damageEnemy(dmg) {
        G.enemy.hp -= dmg;
        G.score = Math.min(CONFIG.scoreCap, G.score + dmg);
    }

    function finishResolve() {
        const combos = G.resolve.combos;
        const { dmg, heal, n, blocked } = computeSpinResult(combos);

        if (n > 0) {
            if (heal > 0) {
                G.playerHp = Math.min(G.playerMaxHp, G.playerHp + heal);
                addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20);
            }
            if (blocked) {
                addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22);
                AC.audio.play('empty');
            } else if (dmg > 0) {
                damageEnemy(dmg);
                addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26);
            }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }

        for (const s of G.skills) if (s.cd > 0) s.cd--;   // cooldowns advance one turn
        G.bonusTimeNext = 0;                              // consume Focus
        G.resolving = false;
        G.resolve = null;

        if (G.enemy.hp <= 0) { if (enemyDefeatedOrPhase()) defeatEnemy(); }   // boss phase-break skips its turn
        else enemyTurn();
        updateHud();
    }

    function enemyTurn() {
        G.enemy.cd -= 1;
        if (G.enemy.cd <= 0) {
            G.enemy.cd = G.enemy.cdMax;
            const dmg = G.enemy.atk;
            G.playerHp -= dmg;
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

    // Roll a shield for the foe on floor `index` (0-based). None for the first
    // couple of floors; then a growing chance of a random mechanic, scaled up.
    function rollShield(index) {
        if (index < 2) return null;
        const chance = Math.min(0.6, 0.12 + index * 0.035);
        if (AC.rng.float(G.rng, 0, 1) > chance) return null;
        const el = () => ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];
        switch (AC.rng.int(G.rng, 0, 5)) {
            case 0: return { type: 'enhanced' };
            case 1: return { type: 'combo', mode: 'min', n: 4 + Math.min(4, (index / 3) | 0) };
            case 2: return { type: 'firstWaveMax', n: 2 };
            case 3: return { type: 'element', mode: 'contains', elements: [el()] };
            default: return { type: 'element', mode: 'ban', elements: [el()] };
        }
    }
    // A forced, escalating shield for bosses. phase 0 = first bar, 1 = second bar.
    function bossShield(index, phase) {
        const el = () => ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];
        if (phase === 0) {
            return AC.rng.int(G.rng, 0, 2) === 0
                ? { type: 'enhanced' }
                : { type: 'combo', mode: 'min', n: 5 + Math.min(3, (index / 5) | 0) };
        }
        return AC.rng.int(G.rng, 0, 2) === 0
            ? { type: 'firstWaveMax', n: 2 }
            : { type: 'element', mode: 'contains', elements: [el()] };
    }
    function spawnEnemy(index) {
        const floor = index + 1;
        const isBoss = floor % 5 === 0;
        const isSpecial = floor % 20 === 0;
        let maxHp = Math.round(BALANCE.enemyHp + BALANCE.enemyHpGrow * index);
        let atk = Math.round(BALANCE.enemyAtk + BALANCE.enemyAtkGrow * index);
        let bars = 1, shield = rollShield(index);
        if (isBoss) {
            maxHp = Math.round(maxHp * (isSpecial ? 3.2 : 2.2));
            atk = Math.round(atk * (isSpecial ? 1.4 : 1.2));
            bars = 2;
            shield = bossShield(index, 0);
        }
        G.enemy = {
            index, floor,
            element: ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)],
            hp: maxHp, maxHp, atk,
            cd: BALANCE.enemyCd, cdMax: BALANCE.enemyCd,
            shield,
            shape: makeShape(G.rng),
            boss: isBoss, special: isSpecial, bars, bar: 0,
        };
    }
    // Call when hp <= 0. Returns true if fully dead; a boss with bars left instead
    // refills, advances a phase (new shield) and returns false.
    function enemyDefeatedOrPhase() {
        const e = G.enemy;
        if (e.hp > 0) return false;
        if (e.boss && e.bar < e.bars - 1) {
            e.bar++;
            e.hp = e.maxHp;
            e.shield = bossShield(e.index, e.bar);
            e.cd = e.cdMax;
            G.shake = 0.5;
            addFloat(W / 2, 70, t('rtPhase', e.bar + 1), '#ffcf5a', 24);
            AC.audio.play('levelup');
            return false;
        }
        return true;
    }
    function die() {
        if (G.ended) return;
        G.ended = true;
        const floor = G.enemy.index + 1;
        shell.gameOver({ score: floor, win: false, meta: { floor, damage: G.score } });
    }

    function addFloat(x, y, text, color, size) { G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 0.9 }); }

    // =================================================================
    // Skills (Focus + Transmute)
    // =================================================================

    function effectiveSpinTime() { return BALANCE.spinTime + (G.bonusTimeNext || 0); }
    function activateSkill(i) {
        const s = G.skills[i];
        if (!s || s.cd > 0 || !shell.isPlaying() || G.resolving || G.held) return;
        if (s.id === 'transmute') {
            G.transmute = { skillIndex: i, fromEl: null };   // cd is set when the pick completes
        } else { // focus
            G.bonusTimeNext = 3;
            s.cd = skillDef(s.id).cd;
            AC.audio.play('gem');
            addFloat(W / 2, 170, t('rtSk_' + s.id), accent(), 18);
        }
        updateHud();
    }
    function applyTransmute(fromEl, toEl) {
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && o.el === fromEl) { o.el = toEl; o.gfx = null; } }
        const s = G.skills[G.transmute.skillIndex];
        if (s) s.cd = skillDef('transmute').cd;
        G.transmute = null;
        AC.audio.play('gem');
        addFloat(W / 2, 170, t('rtSk_transmute'), accent(), 18);
        updateHud();
    }

    // =================================================================
    // Simulation
    // =================================================================

    function settleOrbs(dt) {
        const f = Math.min(1, dt * 18);
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o) continue;
            if (G.held && idx === G.held.cell) continue;
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
        if (G.held) { const o = board[G.held.cell]; drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true, o.enhanced); }
        drawFloats();
        ctx.restore();

        drawSkills();
        drawSpinTimer();
        if (G.transmute) drawTransmuteHint();
        if (G.skillPopup) drawSkillPopup();
        if (DEBUG) drawDebug(); // [DEBUG-HOOK]
    }

    function defShape() { if (!defaultShape) defaultShape = makeShape(AC.rng.make(7)); return defaultShape; }
    function buildRoundedPoly(pts, rad) {
        const n = pts.length, prev = pts[n - 1];
        const p = new Path2D();
        p.moveTo((prev[0] + pts[0][0]) / 2, (prev[1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) {
            const cur = pts[i], nxt = pts[(i + 1) % n];
            p.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, rad);
        }
        p.closePath();
        return p;
    }
    function ensureGfx(sh, el) {
        if (sh.gfx && sh.gfxEl === el) return sh.gfx;
        const R = CONFIG.orbRadius, c = R * 0.42;
        const base = [[-R + c, -R], [R - c, -R], [R, -R + c], [R, R - c], [R - c, R], [-R + c, R], [-R, R - c], [-R, -R + c]];
        const pts = base.map((p, i) => [p[0] + sh.jit[i][0] * R, p[1] + sh.jit[i][1] * R]);
        const path = buildRoundedPoly(pts, R * 0.16);
        const darkS = new Path2D(), lightS = new Path2D();
        for (const sp of sh.speckles) {
            const p = sp.light ? lightS : darkS;
            p.moveTo(sp.dx * R + sp.r * R, sp.dy * R);
            p.arc(sp.dx * R, sp.dy * R, sp.r * R, 0, PI2);
        }
        const sheen = new Path2D();
        sheen.ellipse(-R * 0.25, -R * 0.42, R * 0.55, R * 0.3, -0.5, 0, PI2);
        const col = ELEMENT_COLORS[el];
        const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.15);
        grad.addColorStop(0, shade(col, 0.26 + sh.toneShift));
        grad.addColorStop(0.6, shade(col, sh.toneShift));
        grad.addColorStop(1, shade(col, -0.34 + sh.toneShift));
        sh.gfx = { path, darkS, lightS, sheen, grad };
        sh.gfxEl = el;
        return sh.gfx;
    }
    function drawStone(el, x, y, r, shape, highlight, enhanced) {
        if (r <= 0.5) return;
        const col = ELEMENT_COLORS[el];
        const sh = shape || defShape();
        const gfx = ensureGfx(sh, el);
        const R = CONFIG.orbRadius, k = r / R;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sh.rot);

        ctx.save();
        ctx.scale(k, k);

        if (highlight) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        ctx.fillStyle = gfx.grad;
        ctx.fill(gfx.path);
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.clip(gfx.path);
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill(gfx.darkS);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill(gfx.lightS);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(gfx.sheen);
        ctx.restore();

        ctx.lineWidth = R * 0.07;
        ctx.strokeStyle = 'rgba(0,0,0,0.33)';
        ctx.stroke(gfx.path);

        if (enhanced) {
            ctx.lineWidth = R * 0.1;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.shadowColor = 'rgba(255,255,255,0.85)'; ctx.shadowBlur = 12;
            ctx.stroke(gfx.path);
            ctx.shadowBlur = 0;
        }
        if (highlight) {
            ctx.scale(1.08, 1.08);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.stroke(gfx.path);
        }
        ctx.restore();   // undo scale(k)

        const iconColor = enhanced ? 'rgba(255,255,255,0.97)' : shade(col, CONFIG.iconTint);
        drawRuneIcon(el, 0, 0, r * CONFIG.iconScale, iconColor, Math.max(2.4, r * CONFIG.iconStroke));
        ctx.restore();
    }
    function drawRuneIcon(el, cx, cy, size, color, lw) {
        const paths = ICON_PATHS[el];
        if (!paths) return;
        const s = size / 24;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-12, -12);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw / s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const p of paths) ctx.stroke(p);
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
        // transmute: highlight the chosen source colour
        if (G.transmute && G.transmute.fromEl != null) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
            for (let idx = 0; idx < COLS * ROWS; idx++) {
                const o = board[idx];
                if (o && o.el === G.transmute.fromEl) { const r = cellRow(idx), c = cellCol(idx); roundRect(c * CELL + 4, BOARD_TOP + r * CELL + 4, CELL - 8, CELL - 8, 10); ctx.stroke(); }
            }
            ctx.restore();
        }
        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const o = board[idx];
            if (!o || (G.held && idx === G.held.cell)) continue;
            drawStone(o.el, o.x, o.y, CONFIG.orbRadius * (o.scale == null ? 1 : o.scale), o.shape, false, o.enhanced);
        }
        for (const o of G.clearing) drawStone(o.el, o.x, o.y, CONFIG.orbRadius * o.scale, o.shape, false, o.enhanced);
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
        const label = e.boss ? t(e.special ? 'rtBossSpecial' : 'rtBoss') : t('rtFoe');
        ctx.fillStyle = e.boss ? '#ffcf5a' : 'rgba(255,255,255,0.5)';
        ctx.font = (e.boss ? '800 14px ' : '600 14px ') + f; ctx.textAlign = 'left';
        ctx.fillText(label + ' #' + e.floor, 22, 28);

        drawStone(e.element, 62, 70, e.boss ? 42 : 34, e.shape, e.boss, false);

        ctx.fillStyle = shade(ELEMENT_COLORS[e.element], 0.35);
        ctx.font = `700 18px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('el_' + e.element), 112, 52);

        if (e.boss) {
            for (let i = 0; i < e.bars; i++) {
                ctx.fillStyle = i < (e.bars - e.bar) ? '#ffcf5a' : 'rgba(255,255,255,0.2)';
                ctx.save(); ctx.translate(W - 24 - i * 18, 46); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
            }
        }

        drawBar(112, 62, 466, 16, e.hp / e.maxHp, e.boss ? '#ff7a4d' : '#ff5566', Math.max(0, Math.ceil(e.hp)) + ' / ' + e.maxHp);

        ctx.fillStyle = e.cd <= 1 ? '#ff8f8f' : 'rgba(255,255,255,0.7)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('rtAttackIn', e.cd) + '  ·  ' + e.atk, 112, 102);

        if (e.shield) {
            const label2 = shieldLabel(e.shield);
            ctx.font = `700 13px ${f}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const pw = ctx.measureText(label2).width + 20, px = W - 16 - pw, py = 88;
            ctx.fillStyle = 'rgba(127,212,255,0.16)';
            roundRect(px, py, pw, 24, 12); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(127,212,255,0.6)';
            roundRect(px, py, pw, 24, 12); ctx.stroke();
            ctx.fillStyle = '#a9e3ff';
            ctx.fillText(label2, px + pw / 2, py + 13);
            ctx.textBaseline = 'alphabetic';
        }

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

    // Skill buttons, in the gap between the player bar and the board.
    function skillButtonRects() {
        const n = G.skills.length;
        if (n === 0) return [];
        const gap = 12, h = 56, y = 182;
        const w = Math.min(160, (W - 48 - gap * (n - 1)) / n);
        const x0 = (W - (w * n + gap * (n - 1))) / 2;
        return G.skills.map((s, i) => ({ i, x: x0 + i * (w + gap), y, w, h }));
    }
    function drawSkills() {
        if (!shell || !shell.isPlaying()) return;
        const f = getFont();
        for (const b of skillButtonRects()) {
            const s = G.skills[b.i], ready = s.cd <= 0;
            ctx.save();
            ctx.fillStyle = ready ? 'rgba(245,178,61,0.14)' : 'rgba(255,255,255,0.05)';
            roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = ready ? accent() : 'rgba(255,255,255,0.15)';
            roundRect(b.x, b.y, b.w, b.h, 10); ctx.stroke();
            ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)';
            ctx.font = `700 16px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t('rtSk_' + s.id), b.x + b.w / 2, b.y + b.h / 2);
            if (!ready) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `800 22px ${f}`;
                ctx.fillText(String(s.cd), b.x + b.w / 2, b.y + b.h / 2);
            }
            ctx.restore();
        }
    }

    function skillPopupLayout() {
        const cw = 400, ch = 240, cx = (W - cw) / 2, cy = BOARD_TOP + 60;
        return { card: { x: cx, y: cy, w: cw, h: ch }, cast: { x: cx + cw / 2 - 85, y: cy + ch - 60, w: 170, h: 44 } };
    }
    function drawSkillPopup() {
        const s = G.skills[G.skillPopup.i];
        if (!s) { G.skillPopup = null; return; }
        const f = getFont(), ready = s.cd <= 0, ac = accent();
        const L = skillPopupLayout(), c = L.card, cx = c.x + c.w / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.74)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = 'rgba(22,19,32,0.98)';
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = ac;
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff'; ctx.font = `800 22px ${f}`;
        ctx.fillText(t('rtSk_' + s.id), cx, c.y + 46);

        ctx.fillStyle = 'rgba(230,236,255,0.9)'; ctx.font = `500 15px ${f}`;
        let y = c.y + 92;
        for (const ln of wrapLines(t('rtSkd_' + s.id), c.w - 48)) { ctx.fillText(ln, cx, y); y += 23; }

        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `600 13px ${f}`;
        ctx.fillText(t('rtCdLabel') + ': ' + skillDef(s.id).cd + (ready ? '' : '  (' + s.cd + ')'), cx, c.y + c.h - 80);

        const bt = L.cast;
        ctx.fillStyle = ready ? ac : 'rgba(255,255,255,0.1)';
        roundRect(bt.x, bt.y, bt.w, bt.h, 10); ctx.fill();
        ctx.fillStyle = ready ? '#1a1526' : 'rgba(255,255,255,0.4)';
        ctx.font = `800 16px ${f}`; ctx.textBaseline = 'middle';
        ctx.fillText(ready ? t('rtCast') : t('rtOnCd'), bt.x + bt.w / 2, bt.y + bt.h / 2);

        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `500 12px ${f}`;
        ctx.fillText(t('rtPopupHint'), cx, c.y + c.h - 12);
        ctx.restore();
    }
    function drawTransmuteHint() {
        const f = getFont();
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, BOARD_TOP - 30, W, 26);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 15px ${f}`;
        ctx.fillText(G.transmute.fromEl == null ? t('rtTransmuteFrom') : t('rtTransmuteTo'), W / 2, BOARD_TOP - 17);
        ctx.restore();
    }
    function drawSpinTimer() {
        if (!G.held || !G.held.moved) return;
        const ratio = AC.math.clamp(G.spinTimer / effectiveSpinTime(), 0, 1);
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
            ctx.globalAlpha = Math.max(0, 1 - fl.t / fl.life);
            ctx.fillStyle = fl.color;
            ctx.font = `800 ${fl.size}px ${f}`;
            ctx.fillText(fl.text, fl.x, fl.y);
        }
        ctx.restore();
    }

    // Split text to fit maxWidth (per-character, so Chinese wraps too).
    function wrapLines(text, maxWidth) {
        const lines = []; let cur = '';
        for (const ch of String(text)) {
            const test = cur + ch;
            if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = ch; }
            else cur = test;
        }
        if (cur) lines.push(cur);
        return lines;
    }

    // =================================================================
    // HUD + overlay
    // =================================================================

    function updateHud() {
        if (dom.floor) dom.floor.textContent = String(G.enemy ? G.enemy.index + 1 : 1);
        if (dom.hp) dom.hp.textContent = String(Math.max(0, Math.ceil(G.playerHp)));
        if (hpStat) hpStat.classList.toggle('danger', G.playerMaxHp > 0 && G.playerHp / G.playerMaxHp <= 0.3);
    }

    function overlayContent(state, result) {
        if (state === 'idle') {
            return { badge: 'gem', title: t('rtReady'), message: t('rtIntro'), button: t('play'), hint: t('rtStartHintHtml') };
        }
        if (state === 'over') {
            const floor = result ? result.score : (G.enemy ? G.enemy.index + 1 : 1);
            const dmg = result && result.meta ? result.meta.damage : G.score;
            let msg = t('rtOverMsgHtml', floor, AC.format.score(dmg));
            if (result && result.isNewBest) msg += ` <strong>${t('newBest')}</strong>`;
            return { badge: 'skull', title: t('gameOver'), message: msg, button: t('restart'), hint: t('rtOverHintHtml') };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.playerHp = G.playerMaxHp = BALANCE.playerHp;
        G.score = 0;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.skillPopup = null;
        G.transmute = null;
        G.skills = SKILLS.map((s) => ({ id: s.id, cd: 0 }));
        G.bonusTimeNext = 0;
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
            mode: () => 'climb',
            scoreEpoch: 20261009,
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
            'floor ' + (e.index + 1) + '  ' + e.element + (e.boss ? (e.special ? '  ELITE' : '  BOSS') : ''),
            'foe hp ' + Math.ceil(e.hp) + '/' + e.maxHp + (e.boss ? ('  bar ' + (e.bar + 1) + '/' + e.bars) : ''),
            'foe atk ' + e.atk + '  cd ' + e.cd + '/' + e.cdMax,
            'you ' + Math.ceil(G.playerHp) + '/' + G.playerMaxHp,
            'dmg ' + G.score,
        ];
        ctx.save();
        ctx.font = `600 12px ${getFont()}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const bx = W - w - 20, by = 132;
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
            foe(n) { spawnEnemy(Math.max(0, n | 0)); updateHud(); return G.enemy; },
            shield(type) {
                const map = { enhanced: { type: 'enhanced' }, combo: { type: 'combo', mode: 'min', n: 5 }, first: { type: 'firstWaveMax', n: 2 }, need: { type: 'element', mode: 'contains', elements: ['fire'] }, ban: { type: 'element', mode: 'ban', elements: ['water'] }, none: null };
                if (G.enemy && type in map) G.enemy.shield = map[type];
                return G.enemy && G.enemy.shield;
            },
            cast(i) { activateSkill(i | 0); return G.skills; },
            info() { return { foe: G.enemy, hp: G.playerHp, dmg: G.score, skills: G.skills }; },
        };
        console.log('%c[Rune Tower] debug on', 'color:#f5b23d;font-weight:700');
        console.log('RT.kill() hp(n) foe(n) shield("enhanced"|"combo"|"first"|"need"|"ban"|"none") cast(i) info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
