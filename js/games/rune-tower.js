/**
 * Rune Tower — an orb-matching combat climb.
 *
 * Drag one rune around a 6×5 board (it swaps along the path, diagonals allowed).
 * The per-spin timer only starts once the rune first swaps with a neighbour, so
 * picking one up to think costs nothing. On release (or timeout) the spin
 * resolves: horizontal/vertical runs of 3+ clear, cascade, and chain COMBOS —
 * and within a resolve each combo pops ONE AT A TIME (its own rising chime).
 *
 * Each spin is one TURN: cleared groups deal damage (scaled by combo count and
 * element matchup), HEART runes heal you, and the foe strikes on its turn
 * countdown. Clear a foe and a stronger one steps up — you CLIMB a floor, and
 * your best is the highest floor reached.
 *
 * Phase 2 adds: ENHANCED runes (clearing 5+ of a colour spawns a ×1.5 rune —
 * the key to breaking future shields), and a between-floor THREE-PICK upgrade
 * draft (every CONFIG.draftEvery floors) whose picks patch `G.run`.
 *
 * Elements (6): fire · water · wood · light · dark · heart. Counter wheel:
 * water→fire→wood→water and light↔dark (strong = ×2, weak = ×0.5). Heart heals.
 *
 * No difficulty selector by design — the challenge curve lives in per-floor
 * growth (BALANCE.enemy*Grow). Per-run tunables live in `G.run` (upgrades patch
 * it); damage math is centralised in computeSpinResult(); damage to the foe
 * flows through damageEnemy() (future shields hook there). Canvas 2D at 600×760.
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
        rtIntro: 'Drag a rune to line up 3+ of a colour and clear them. Chain combos, strike the foe\u2019s weak element, and heal with hearts. Each spin is a turn \u2014 climb as high as you can.',
        rtStartHintHtml: 'Drag a rune on the board · <kbd>P</kbd> pause',
        rtAttackIn: (n) => `Strikes in ${n}`,
        rtCombo: (n) => `${n} Combo`,
        rtDraftTitle: 'Choose an upgrade',
        rtOverMsgHtml: (floor, dmg) => `You climbed to <strong>floor ${floor}</strong> (dealt ${dmg} damage).`,
        rtOverHintHtml: 'Press <kbd>R</kbd> or the button to climb again.',
        rtHelp1Html: 'Press and <strong>drag a rune</strong> \u2014 it swaps along the path. Line up <strong>3+ of a colour</strong> in a row or column to clear them and hit the foe.',
        rtHelp2Html: 'Chain <strong>combos</strong> for more damage, match the foe\u2019s <strong>weak element</strong>, and clear <strong>5+</strong> of a colour to forge an <strong>enhanced</strong> rune. <strong>Heart</strong> runes heal you.',
        rtHelp3Html: 'Each spin is one turn; the foe strikes on its countdown. Every few floors you draft an upgrade. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
        el_fire: 'Fire', el_water: 'Water', el_wood: 'Wood', el_light: 'Light', el_dark: 'Dark', el_heart: 'Heart',
        // upgrades — name + short desc
        rtU_timeSand: 'Time Sand',        rtUd_timeSand: '+1s spin time',
        rtU_comboFervor: 'Combo Fervor',  rtUd_comboFervor: 'Bigger combo scaling',
        rtU_heavyStrike: 'Heavy Strike',  rtUd_heavyStrike: '+4 base damage',
        rtU_attunement: 'Attunement',     rtUd_attunement: '+8% all damage',
        rtU_shapewright: 'Enhancement',   rtUd_shapewright: '+25% enhanced-rune damage',
        rtU_enrich: 'Enrich',             rtUd_enrich: '5+ clears forge +1 enhanced rune',
        rtU_piercingFirst: 'Piercing First', rtUd_piercingFirst: 'First-wave clears ignore weakness',
        rtU_chainReaction: 'Chain Reaction', rtUd_chainReaction: '+50% cascade combo damage',
        rtU_vitality: 'Vitality',         rtUd_vitality: '+25 max HP',
        rtU_morningDew: 'Morning Dew',    rtUd_morningDew: 'Heal 3% HP each turn',
        rtU_soulEater: 'Soul Eater',      rtUd_soulEater: 'Heal 20% HP on kill',
        rtU_lastStand: 'Last Stand',      rtUd_lastStand: '+50% damage below 30% HP',
        rtU_stoneskin: 'Stoneskin',       rtUd_stoneskin: 'Take 12% less damage',
        rtU_undying: 'Undying',           rtUd_undying: 'Survive a lethal hit once',
        rtU_snowball: 'Snowball',         rtUd_snowball: '+1 base damage per kill',
        rtU_glassCannon: 'Glass Cannon',  rtUd_glassCannon: '+40% damage, \u221225% max HP',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rtHp: '生命',
        rtFloor: '層',
        rtReady: '準備好了',
        rtFoe: '敵人',
        rtIntro: '拖動符石，把同色連成 3 顆以上消除。串連擊、打敵人的弱屬性、用心珠回血。每轉一次就是一回合——盡量往上爬。',
        rtStartHintHtml: '在盤面上拖動符石 · <kbd>P</kbd> 暫停',
        rtAttackIn: (n) => `${n} 回合後攻擊`,
        rtCombo: (n) => `${n} 連擊`,
        rtDraftTitle: '選一個強化',
        rtOverMsgHtml: (floor, dmg) => `你爬到<strong>第 ${floor} 層</strong>（造成 ${dmg} 傷害）。`,
        rtOverHintHtml: '按 <kbd>R</kbd> 或按鈕再爬一次。',
        rtHelp1Html: '按住並<strong>拖動一顆符石</strong>，它會沿路交換。把<strong>同色 3 顆以上</strong>連成一橫列或一直行即可消除並攻擊敵人。',
        rtHelp2Html: '串<strong>連擊</strong>、打敵人的<strong>弱屬性</strong>；單次消除<strong>同色 5 顆以上</strong>會生成<strong>強化符石</strong>。<strong>心</strong>珠回血。',
        rtHelp3Html: '每轉一次就是一回合；敵人依倒數出手。每隔幾層可抽一個強化。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
        el_fire: '火', el_water: '水', el_wood: '木', el_light: '光', el_dark: '暗', el_heart: '心',
        rtU_timeSand: '時之沙',      rtUd_timeSand: '轉珠時間 +1 秒',
        rtU_comboFervor: '連擊狂熱',  rtUd_comboFervor: '連擊加成更高',
        rtU_heavyStrike: '重擊',      rtUd_heavyStrike: '基礎傷害 +4',
        rtU_attunement: '元素共鳴',   rtUd_attunement: '全屬傷害 +8%',
        rtU_shapewright: '強化精工',  rtUd_shapewright: '強化符石傷害 +25%',
        rtU_enrich: '強化礦脈',       rtUd_enrich: '5+ 消除多生成 1 顆強化符石',
        rtU_piercingFirst: '穿透首擊', rtUd_piercingFirst: '首批消除無視被剋',
        rtU_chainReaction: '連鎖反應', rtUd_chainReaction: '非首批連擊傷害 +50%',
        rtU_vitality: '體魄',         rtUd_vitality: '最大生命 +25',
        rtU_morningDew: '晨露',       rtUd_morningDew: '每回合回 3% 生命',
        rtU_soulEater: '噬魂',        rtUd_soulEater: '擊殺回 20% 生命',
        rtU_lastStand: '背水之勇',    rtUd_lastStand: '生命低於 30% 時傷害 +50%',
        rtU_stoneskin: '石膚',        rtUd_stoneskin: '受到傷害 −12%',
        rtU_undying: '不倒',          rtUd_undying: '整局一次免死',
        rtU_snowball: '複利',         rtUd_snowball: '每擊殺基礎傷害 +1',
        rtU_glassCannon: '玻璃大砲',  rtUd_glassCannon: '傷害 +40%、最大生命 −25%',
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
    // Muted, weathered "stone" tones — earthy rather than candy-bright.
    const ELEMENT_COLORS = {
        fire: '#c35540', water: '#4f7ba4', wood: '#5f8a52',
        light: '#c3a24a', dark: '#7b6a99', heart: '#c1738a',
    };
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
    // Config + balance + upgrades
    // =================================================================

    const CONFIG = {
        orbRadius: 40,
        popTime: 0.13,
        fallAnim: 0.16,
        bigThreshold: 5,        // clearing this many of a colour forges an enhanced rune
        draftEvery: 2,          // offer an upgrade draft every N floors
        scoreCap: 999999,
    };

    const BALANCE = {
        playerHp: 120,
        spinTime: 6,
        baseDamage: 12,
        comboStep: 0.25,
        enhancedMult: 1.5,      // an enhanced rune's cell counts this × in damage
        enemyHp: 80, enemyHpGrow: 30,
        enemyAtk: 11, enemyAtkGrow: 4,
        enemyCd: 3,
    };

    // Draft pool. tier → draft weight (C common, R rare, E epic). max = highest
    // level (0 = unlimited; 1 = a one-off flag). apply(G) mutates G.run (or G).
    const UPGRADES = [
        { id: 'timeSand',      tier: 'C', max: 3, apply: (G) => { G.run.spinTime += 1; } },
        { id: 'comboFervor',   tier: 'R', max: 3, apply: (G) => { G.run.comboStep += 0.08; } },
        { id: 'heavyStrike',   tier: 'C', max: 0, apply: (G) => { G.run.baseDamage += 4; } },
        { id: 'attunement',    tier: 'R', max: 3, apply: (G) => { G.run.dmgMult += 0.08; } },
        { id: 'shapewright',   tier: 'R', max: 3, apply: (G) => { G.run.enhancedMult += 0.25; } },
        { id: 'enrich',        tier: 'R', max: 2, apply: (G) => { G.run.enhanceOnBig += 1; } },
        { id: 'piercingFirst', tier: 'R', max: 1, apply: (G) => { G.run.piercingFirst = true; } },
        { id: 'chainReaction', tier: 'R', max: 2, apply: (G) => { G.run.chainBonus += 0.5; } },
        { id: 'vitality',      tier: 'C', max: 4, apply: (G) => { G.playerMaxHp += 25; G.playerHp += 25; } },
        { id: 'morningDew',    tier: 'C', max: 5, apply: (G) => { G.run.healPerTurnFrac += 0.03; } },
        { id: 'soulEater',     tier: 'C', max: 3, apply: (G) => { G.run.healOnKillFrac += 0.20; } },
        { id: 'lastStand',     tier: 'R', max: 1, apply: (G) => { G.run.lastStand = true; } },
        { id: 'stoneskin',     tier: 'C', max: 3, apply: (G) => { G.run.stoneskinFrac = Math.min(0.45, G.run.stoneskinFrac + 0.12); } },
        { id: 'undying',       tier: 'E', max: 1, apply: (G) => { G.run.undying = true; } },
        { id: 'snowball',      tier: 'R', max: 1, apply: (G) => { G.run.snowball = true; } },
        { id: 'glassCannon',   tier: 'E', max: 1, apply: (G) => { G.run.dmgMult += 0.40; G.playerMaxHp = Math.round(G.playerMaxHp * 0.75); G.playerHp = Math.min(G.playerHp, G.playerMaxHp); } },
    ];
    const TIER_WEIGHT = { C: 3, R: 2, E: 1 };
    const TIER_COLOR = { C: '#8fd1a0', R: '#7fb4ff', E: '#d79bff' };

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        run: null,              // per-run mutable tunables (upgrades patch THIS)
        board: [],
        clearing: [],
        enemy: null,
        playerHp: 0, playerMaxHp: 0,
        score: 0,               // cumulative damage (display / tiebreak)
        held: null,
        spinTimer: 0,
        resolving: false,
        resolve: null,          // { stage, t, combos, pending, popIndex, wave, bigColors }
        draft: null,            // { options: [upgradeId, ...] } while choosing
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
    // Turn a random non-enhanced rune of `el` on the (settled) board into an
    // enhanced rune — called after a 5+ clear of that colour.
    function forgeEnhanced(el) {
        const cands = [];
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && o.el === el && !o.enhanced) cands.push(i); }
        if (cands.length === 0) return;
        board[cands[AC.rng.int(G.rng, 0, cands.length)]].enhanced = true;
    }

    // =================================================================
    // Input — drag a rune; or pick a draft card
    // =================================================================

    function boardPos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
    }
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
            if (!G.held.moved) { G.held.moved = true; G.spinTimer = G.run.spinTime; } // first swap starts the clock
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (G.draft) { handleDraftClick(p); if (e.cancelable) e.preventDefault(); return; }
        if (G.resolving || G.held) return;
        if (p.y < BOARD_TOP) return;
        AC.audio.unlock();
        const cell = cellAtPixel(p.x, p.y);
        G.held = { cell, px: p.x, py: p.y, moved: false };
        G.spinTimer = G.run.spinTime;
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
        G.resolve = { stage: 'pop', t: 0, combos: [], pending: [], popIndex: 0, wave: -1, bigColors: [] };
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
        if (g.cells.length >= CONFIG.bigThreshold) G.resolve.bigColors.push({ el: g.el, count: 1 + G.run.enhanceOnBig });
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

    // --- Damage / combat (centralised so Phase 3 shields & team mods hook here) ---

    function computeSpinResult(combos) {
        const n = combos.length;
        if (n === 0) return { dmg: 0, heal: 0, n: 0 };
        const comboMult = 1 + G.run.comboStep * (n - 1);
        let dmg = 0, heal = 0;
        for (const g of combos) {
            const enh = g.enhanced || 0;
            const base = (g.cells.length + enh * (G.run.enhancedMult - 1)) * G.run.baseDamage;
            if (g.el === 'heart') { heal += base; continue; }
            let em = elementMult(g.el, G.enemy.element);
            if (G.run.piercingFirst && g.wave === 0 && em < 1) em = 1;   // 首批 ignores weakness
            let gd = base * em;
            if (g.wave > 0) gd *= (1 + G.run.chainBonus);                 // 非首批 cascade bonus
            if (G.run.elementBonus[g.el]) gd *= G.run.elementBonus[g.el];
            dmg += gd;
        }
        let total = dmg * comboMult * G.run.dmgMult;
        if (G.run.lastStand && G.playerMaxHp > 0 && G.playerHp / G.playerMaxHp < 0.3) total *= 1.5;
        return { dmg: Math.round(total), heal: Math.round(heal * comboMult), n };
    }
    function damageEnemy(dmg) {
        G.enemy.hp -= dmg;
        G.score = Math.min(CONFIG.scoreCap, G.score + dmg);
    }

    function finishResolve() {
        const combos = G.resolve.combos;
        const bigColors = G.resolve.bigColors;
        const { dmg, heal, n } = computeSpinResult(combos);

        for (const bc of bigColors) for (let i = 0; i < bc.count; i++) forgeEnhanced(bc.el);

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
        if (G.run.healPerTurnFrac > 0) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + G.playerMaxHp * G.run.healPerTurnFrac);

        G.resolving = false;
        G.resolve = null;

        if (G.enemy.hp <= 0) defeatEnemy();
        else enemyTurn();
        updateHud();
    }

    function enemyTurn() {
        G.enemy.cd -= 1;
        if (G.enemy.cd <= 0) {
            const dmg = Math.max(1, Math.round(G.enemy.atk * (1 - G.run.stoneskinFrac)));
            G.playerHp -= dmg;
            G.enemy.cd = G.enemy.cdMax;
            G.shake = 0.4;
            addFloat(W / 2, BOARD_TOP - 70, '-' + dmg, '#ff6b6b', 24);
            AC.audio.play('rock');
            if (G.playerHp <= 0) {
                if (G.run.undying && !G.run.undyingUsed) { G.run.undyingUsed = true; G.playerHp = 1; addFloat(W / 2, BOARD_TOP - 70, '1 HP', '#ffe08a', 22); }
                else { G.playerHp = 0; die(); }
            }
        }
    }
    function defeatEnemy() {
        AC.audio.play('levelup');
        if (G.run.healOnKillFrac > 0) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + G.playerMaxHp * G.run.healOnKillFrac);
        if (G.run.snowball) G.run.baseDamage += 1;
        const next = G.enemy.index + 1;
        spawnEnemy(next);
        if (next % CONFIG.draftEvery === 0) openDraft();
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
        const floor = G.enemy.index + 1;
        shell.gameOver({ score: floor, win: false, meta: { floor, damage: G.score } });
    }

    function addFloat(x, y, text, color, size) { G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 0.9 }); }

    // =================================================================
    // Upgrade draft
    // =================================================================

    function upgradeAvailable(u) { const lv = G.run.levels[u.id] || 0; return u.max === 0 || lv < u.max; }
    function openDraft() {
        const pool = UPGRADES.filter(upgradeAvailable);
        const picks = [];
        const copy = pool.slice();
        while (picks.length < 3 && copy.length) {
            let total = 0; for (const u of copy) total += TIER_WEIGHT[u.tier] || 1;
            let x = AC.rng.float(G.rng, 0, total), i = 0;
            for (; i < copy.length; i++) { x -= TIER_WEIGHT[copy[i].tier] || 1; if (x <= 0) break; }
            picks.push(copy[i].id); copy.splice(i, 1);
        }
        if (picks.length) G.draft = { options: picks };
    }
    function draftCardRects() {
        const opts = G.draft.options, n = opts.length;
        const pad = 18, gap = 12, top = BOARD_TOP + 56, bottom = H - 24;
        const w = (W - pad * 2 - gap * (n - 1)) / n;
        return opts.map((id, i) => ({ id, x: pad + i * (w + gap), y: top, w, h: bottom - top }));
    }
    function handleDraftClick(p) {
        for (const c of draftCardRects()) {
            if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) { AC.audio.unlock(); applyUpgrade(c.id); return; }
        }
    }
    function applyUpgrade(id) {
        const u = UPGRADES.find((x) => x.id === id);
        if (!u) return;
        G.run.levels[id] = (G.run.levels[id] || 0) + 1;
        u.apply(G);
        AC.audio.play('coin');
        G.draft = null;
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

        drawSpinTimer();
        if (G.draft) drawDraft();
        if (DEBUG) drawDebug(); // [DEBUG-HOOK]
    }

    function defShape() { if (!defaultShape) defaultShape = makeShape(AC.rng.make(7)); return defaultShape; }
    function roundedPolyPath(pts, rad) {
        const n = pts.length, prev = pts[n - 1];
        ctx.beginPath();
        ctx.moveTo((prev[0] + pts[0][0]) / 2, (prev[1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) {
            const cur = pts[i], nxt = pts[(i + 1) % n];
            ctx.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, rad);
        }
        ctx.closePath();
    }
    function drawStone(el, x, y, r, shape, highlight, enhanced) {
        if (r <= 0.5) return;
        const col = ELEMENT_COLORS[el];
        const sh = shape || defShape();
        const c = r * 0.42;
        const base = [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]];
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

        ctx.save();
        ctx.clip();
        for (const sp of sh.speckles) {
            ctx.beginPath();
            ctx.fillStyle = sp.light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
            ctx.arc(sp.dx * r, sp.dy * r, sp.r * r, 0, PI2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.ellipse(-r * 0.25, -r * 0.42, r * 0.55, r * 0.3, -0.5, 0, PI2);
        ctx.fill();
        ctx.restore();

        roundedPolyPath(pts, r * 0.16);
        ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.strokeStyle = 'rgba(0,0,0,0.33)';
        ctx.stroke();

        // enhanced runes wear a glowing golden rim
        if (enhanced) {
            roundedPolyPath(pts, r * 0.16);
            ctx.lineWidth = Math.max(2.5, r * 0.1);
            ctx.strokeStyle = 'rgba(255,214,120,0.95)';
            ctx.shadowColor = 'rgba(255,200,90,0.9)'; ctx.shadowBlur = 14;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        drawGlyph(el, 1, 2, r * 0.4, 'rgba(0,0,0,0.30)');
        drawGlyph(el, 0, 0, r * 0.4, enhanced ? 'rgba(255,244,214,0.96)' : 'rgba(244,238,228,0.92)');

        if (highlight) {
            roundedPolyPath(pts.map((p) => [p[0] * 1.08, p[1] * 1.08]), r * 0.16);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.stroke();
        }
        ctx.restore();
    }
    function drawGlyph(el, cx, cy, s, style) {
        ctx.save();
        ctx.fillStyle = style; ctx.strokeStyle = style;
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
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('rtFoe') + ' #' + (e.index + 1), 22, 28);

        drawStone(e.element, 62, 70, 34, e.shape, false, false);

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
        if (!G.held || !G.held.moved) return;
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
    function drawDraft() {
        const f = getFont();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.84)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = '#eaf0ff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = `800 24px ${f}`;
        ctx.fillText(t('rtDraftTitle'), W / 2, BOARD_TOP + 38);
        for (const c of draftCardRects()) drawDraftCard(c, f);
        ctx.restore();
    }
    function drawDraftCard(c, f) {
        const u = UPGRADES.find((x) => x.id === c.id);
        const lv = G.run.levels[c.id] || 0;
        const tc = TIER_COLOR[u.tier] || '#aaa';
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = tc;
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.stroke();

        // tier pill
        ctx.fillStyle = tc;
        ctx.font = `800 12px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(u.tier, c.x + 12, c.y + 22);

        // name
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `800 17px ${f}`;
        const cx = c.x + c.w / 2;
        let y = c.y + 60;
        for (const ln of wrapLines(t('rtU_' + c.id), c.w - 20)) { ctx.fillText(ln, cx, y); y += 22; }

        // desc
        ctx.fillStyle = 'rgba(228,234,255,0.82)';
        ctx.font = `500 13px ${f}`;
        y += 8;
        for (const ln of wrapLines(t('rtUd_' + c.id), c.w - 22)) { ctx.fillText(ln, cx, y); y += 19; }

        // level
        ctx.fillStyle = tc;
        ctx.font = `700 12px ${f}`;
        const lvText = u.max > 1 ? `Lv.${lv + 1} / ${u.max}` : (lv > 0 ? '' : '');
        if (lvText) ctx.fillText(lvText, cx, c.y + c.h - 16);
        ctx.restore();
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
        G.run = {
            spinTime: BALANCE.spinTime,
            baseDamage: BALANCE.baseDamage,
            comboStep: BALANCE.comboStep,
            enhancedMult: BALANCE.enhancedMult,
            dmgMult: 1,
            enhanceOnBig: 0,
            healPerTurnFrac: 0,
            healOnKillFrac: 0,
            piercingFirst: false,
            chainBonus: 0,
            lastStand: false,
            stoneskinFrac: 0,
            undying: false, undyingUsed: false,
            snowball: false,
            elementBonus: {},
            levels: {},
        };
        G.playerHp = G.playerMaxHp = BALANCE.playerHp;
        G.score = 0;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.draft = null;
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
            'floor ' + (e.index + 1) + '  ' + e.element,
            'foe hp ' + Math.ceil(e.hp) + '/' + e.maxHp,
            'foe atk ' + e.atk + '  cd ' + e.cd + '/' + e.cdMax,
            'you ' + Math.ceil(G.playerHp) + '/' + G.playerMaxHp,
            'dmg ' + G.score + '  bD ' + G.run.baseDamage,
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
            draft() { openDraft(); return G.draft; },
            give(id) { applyUpgrade(id); return G.run; },
            info() { return { run: G.run, foe: G.enemy, hp: G.playerHp, dmg: G.score }; },
        };
        console.log('%c[Rune Tower] debug on', 'color:#f5b23d;font-weight:700');
        console.log('RT.kill() hp(n) foe(n) draft() give("timeSand"…) info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
