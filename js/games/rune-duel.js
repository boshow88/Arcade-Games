/**
 * Rune Duel — an orb-spinning versus duel (vs AI; online PvP is a later mode).
 *
 * A bounded duel instead of an endless climb: you and a rival each have an HP
 * pool. Each ROUND you drag a rune on your 6×5 board, line up 3+ of a colour,
 * chain COMBOS and the cleared runes damage the rival — but the rival raises a
 * SHIELD each round (clear enhanced / N+ combos / a named colour…) you must meet
 * or your attack is blocked. HEART runes heal you; 5+ of a colour forges an
 * ENHANCED rune (×1.5). Then the rival strikes back. Drop their HP to 0 to win;
 * after a round cap, the higher HP wins.
 *
 * This is the vs-AI core; the full design generalises shields + tools into a
 * card/energy hand for both sides, and later swaps the AI for an online rival.
 * Built on window.ArcadeCommon. Canvas 2D at a fixed 600×760 portrait space.
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;
    const t = (k, ...a) => AC.i18n.t(k, ...a);

    const PARAMS = new URLSearchParams(location.search);
    const DEBUG = PARAMS.has('debug');

    // =================================================================
    // i18n
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        rdRound: 'Round', rdHp: 'HP', rdReady: 'Ready', rdRival: 'Rival',
        rdThinking: 'Rival is thinking…', rdYourTurn: 'Your turn — spin!',
        rdIntro: 'A turn-based orb duel. Clear 3+ of a colour to hit the rival; meet their shield each round, heal with hearts, and drop their HP to 0. The higher HP wins at the round cap.',
        rdStartHintHtml: 'Drag a rune on the board · <kbd>P</kbd> pause',
        rdHelp1Html: 'Each round, <strong>drag a rune</strong> and line up <strong>3+ of a colour</strong> to clear, chaining <strong>combos</strong> — cleared runes <strong>damage the rival</strong>.',
        rdHelp2Html: 'The rival raises a <strong>shield</strong> each round. Meet it or your attack is blocked. <strong>Heart</strong> runes heal you; <strong>5+</strong> of a colour forges an <strong>enhanced</strong> rune.',
        rdHelp3Html: 'Then the rival strikes back. Drop their HP to <strong>0</strong> to win. <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        rdWin: 'Victory!', rdLose: 'Defeated',
        rdOverWinHtml: (dmg, round) => `You won in <strong>${round}</strong> rounds (dealt ${dmg} damage).`,
        rdOverLoseHtml: (dmg, round) => `You fell on round <strong>${round}</strong> (dealt ${dmg} damage).`,
        rdOverHint: 'Press R or the button to duel again.',
        // ported shared keys
        rtBlocked: 'Blocked!', rtCombo: (n) => `${n} Combo`,
        rtShEnhanced: 'Clear enhanced', rtShComboMin: (n) => `Need ${n}+ combo`, rtShFirstMax: (n) => `First wave \u2264 ${n}`,
        rtShNeed: (els) => `Clear ${els}`, rtShBan: (els) => `Don't clear ${els}`,
        rtCast: 'Cast', rtOnCd: 'On cooldown', rtPopupHint: 'Tap outside to cancel', rtCdLabel: 'Cooldown',
        rtSk_focus: 'Focus', rtSkd_focus: 'This spin: +3s of spin time.',
        rtSk_transmute: 'Transmute', rtSkd_transmute: 'Pick a colour, then a target \u2014 all runes of that colour become the target colour.',
        rtTransmuteFrom: 'Tap a colour to change', rtTransmuteTo: 'Tap the target colour',
        el_fire: 'Fire', el_water: 'Water', el_wood: 'Wood', el_light: 'Light', el_dark: 'Dark', el_heart: 'Heart',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rdRound: '回合', rdHp: '生命', rdReady: '準備好了', rdRival: '對手',
        rdThinking: '對手思考中…', rdYourTurn: '你的回合——轉珠！',
        rdIntro: '回合制轉珠對決。消除同色 3+ 攻擊對手；每回合要破對手的盾、用心珠回血，把對手血打到 0。到回合上限時血多者勝。',
        rdStartHintHtml: '在盤面上拖動符石 · <kbd>P</kbd> 暫停',
        rdHelp1Html: '每回合<strong>拖動符石</strong>、把<strong>同色 3 顆以上</strong>連線消除、串<strong>連擊</strong>——消掉的符石<strong>對對手造成傷害</strong>。',
        rdHelp2Html: '對手每回合會升起一個<strong>盾</strong>，沒達成攻擊就被擋。<strong>心</strong>珠回血；<strong>同色 5+</strong> 生成<strong>強化符石</strong>。',
        rdHelp3Html: '接著對手反擊。把對手血打到 <strong>0</strong> 就贏。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重新開始 · <kbd>M</kbd> 靜音。',
        rdWin: '勝利！', rdLose: '落敗',
        rdOverWinHtml: (dmg, round) => `你在第 <strong>${round}</strong> 回合獲勝（造成 ${dmg} 傷害）。`,
        rdOverLoseHtml: (dmg, round) => `你在第 <strong>${round}</strong> 回合倒下（造成 ${dmg} 傷害）。`,
        rdOverHint: '按 R 或按鈕再對決一次。',
        rtBlocked: '擋下！', rtCombo: (n) => `${n} 連擊`,
        rtShEnhanced: '需消強化', rtShComboMin: (n) => `需 ${n}+ 連擊`, rtShFirstMax: (n) => `首批 \u2264 ${n} 連擊`,
        rtShNeed: (els) => `需消 ${els}`, rtShBan: (els) => `禁消 ${els}`,
        rtCast: '施放', rtOnCd: '冷卻中', rtPopupHint: '點擊外面取消', rtCdLabel: '冷卻',
        rtSk_focus: '凝神', rtSkd_focus: '本次轉珠時間 +3 秒。',
        rtSk_transmute: '轉換', rtSkd_transmute: '選一個顏色，再選目標色；盤上該色符石全變成目標色。',
        rtTransmuteFrom: '點選要轉換的顏色', rtTransmuteTo: '點選目標顏色',
        el_fire: '火', el_water: '水', el_wood: '木', el_light: '光', el_dark: '暗', el_heart: '心',
    });

    // =================================================================
    // Board geometry + element data
    // =================================================================

    const W = 600, H = 760;
    const COLS = 6, ROWS = 5;
    const CELL = 100;
    const BOARD_TOP = H - ROWS * CELL; // = 260

    const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
    const ATTACK_ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark'];
    const ELEMENT_COLORS = {
        fire: '#c35540', water: '#4f7ba4', wood: '#5f8a52',
        light: '#c3a24a', dark: '#7b6a99', heart: '#c1738a',
    };
    const ICON_OPS = {
        water: [{ p: 'M7.001 15.085A1.5 1.5 0 0 1 9 16.5' }, { c: [18.5, 8.5, 3.5] }, { c: [7.5, 16.5, 5.5] }, { c: [7.5, 4.5, 2.5] }],
        fire:  [{ p: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4' }],
        wood:  [{ p: 'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20' }, { p: 'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13' }],
        light: [{ p: 'M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203' }],
        dark:  [{ c: [12, 12, 10] }, { p: 'M12 2a7 7 0 1 0 10 10' }],
        heart: [{ p: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5' }],
    };
    const ICON_PATHS = {};
    for (const _el in ICON_OPS) {
        ICON_PATHS[_el] = ICON_OPS[_el].map((op) => {
            if (op.p) return new Path2D(op.p);
            const pp = new Path2D(); pp.arc(op.c[0], op.c[1], op.c[2], 0, PI2); return pp;
        });
    }
    const WEIGHTS = { fire: 1, water: 1, wood: 1, light: 1, dark: 1, heart: 0.75 };
    const WEIGHT_TOTAL = ELEMENTS.reduce((s, e) => s + WEIGHTS[e], 0);

    // =================================================================
    // Config + balance
    // =================================================================

    const CONFIG = {
        orbRadius: 40, iconScale: 0.8, iconStroke: 0.12, iconTint: -0.15,
        popTime: 0.13, fallAnim: 0.16, bigThreshold: 5, scoreCap: 999999,
    };
    const BALANCE = {
        spinTime: 6,
        baseDamage: 12,
        heartHeal: 12,
        comboStep: 0.25,
        enhancedMult: 1.5,
    };
    // Duel numbers (tunable; the full card version will raise HP a lot).
    const DUEL = {
        hp: 2000,
        maxRounds: 30,
        aiThink: 1.1,       // seconds the rival "thinks" before striking
        aiBase: 110, aiGrow: 10, aiVar: 30,   // rival damage = aiBase + aiGrow·(round-1) ± aiVar
    };

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
        youHp: 0, youMaxHp: 0,
        aiHp: 0, aiMaxHp: 0,
        aiShield: null,
        round: 1,
        phase: 'your',          // 'your' | 'ai' | 'over'
        aiTimer: 0,
        score: 0,               // damage dealt to the rival
        held: null,
        spinTimer: 0,
        resolving: false,
        resolve: null,
        skills: [],
        skillPopup: null,
        transmute: null,
        bonusTimeNext: 0,
        floats: [],
        shake: 0,
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
        round: document.getElementById('round'),
        hp: document.getElementById('hp'),
    };
    const hpStat = dom.hp ? dom.hp.closest('.hud-stat') : null;

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function getFont() {
        if (!fontCache) fontCache = getComputedStyle(document.body).getPropertyValue('--font-display') || '"Segoe UI", system-ui, sans-serif';
        return fontCache;
    }
    function accent() {
        if (!accentCache) accentCache = (getComputedStyle(document.body).getPropertyValue('--game-color') || '').trim() || '#d9544e';
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
        let c = Math.floor(px / CELL), r = Math.floor((py - BOARD_TOP) / CELL);
        c = AC.math.clamp(c, 0, COLS - 1); r = AC.math.clamp(r, 0, ROWS - 1);
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
        for (let i = 0; i < k; i++) speckles.push({ dx: AC.rng.float(rng, -0.55, 0.55), dy: AC.rng.float(rng, -0.55, 0.55), r: AC.rng.float(rng, 0.06, 0.15), light: AC.rng.float(rng, 0, 1) < 0.4 });
        return { rot: AC.rng.float(rng, -0.1, 0.1), jit, speckles, toneShift: AC.rng.float(rng, -0.07, 0.07) };
    }
    function newOrb(el, x, y, enhanced) { return { el, x, y, scale: 1, shape: makeShape(G.rng), enhanced: !!enhanced }; }
    function elAt(r, c) { const o = board[r * COLS + c]; return o ? o.el : null; }

    function fillBoardNoMatches() {
        for (let idx = 0; idx < COLS * ROWS; idx++) board[idx] = newOrb(randomEl(), cellCX(idx), cellCY(idx));
        let guard = 0, groups = findMatches();
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
            for (let r = write; r >= 0; r--) { const idx = r * COLS + c; board[idx] = newOrb(randomEl(), cellCX(idx), BOARD_TOP - above * CELL + CELL / 2); above++; }
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
            if (!G.held.moved) { G.held.moved = true; G.spinTimer = effectiveSpinTime(); }
        }
        const o = board[G.held.cell];
        if (o) { o.x = px; o.y = py; o.scale = 1; }
    }
    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (G.skillPopup) {
            const L = skillPopupLayout(), s = G.skills[G.skillPopup.i];
            if (s && s.cd <= 0 && inRect(p, L.cast)) { const i = G.skillPopup.i; G.skillPopup = null; AC.audio.unlock(); activateSkill(i); }
            else if (!inRect(p, L.card)) { G.skillPopup = null; }
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.transmute) {
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
        if (G.phase !== 'your' || G.resolving || G.held) return;
        if (p.y < BOARD_TOP) {
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
        dragTo(boardPos(e).x, boardPos(e).y);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
        if (!G.held) return;
        if (G.held.moved) startResolve();
        else G.held = null;
    }

    // =================================================================
    // Turn resolution
    // =================================================================

    function startResolve() {
        G.held = null;
        G.resolving = true;
        G.resolve = { stage: 'pop', t: 0, combos: [], pending: [], popIndex: 0, wave: -1 };
        beginCascade();
    }
    function beginCascade() {
        G.resolve.wave++;
        G.resolve.pending = findMatches();
        G.resolve.popIndex = 0;
        if (G.resolve.pending.length === 0) { finishResolve(); return; }
        popGroup();
    }
    function popGroup() {
        G.clearing.length = 0;
        if (G.resolve.popIndex >= G.resolve.pending.length) { applyGravity(); G.resolve.stage = 'fall'; G.resolve.t = 0; return; }
        const g = G.resolve.pending[G.resolve.popIndex++];
        g.wave = G.resolve.wave;
        let enh = 0;
        for (const idx of g.cells) { const o = board[idx]; if (o.enhanced) enh++; o.scale = 1; G.clearing.push(o); board[idx] = null; }
        g.enhanced = enh;
        if (g.cells.length >= CONFIG.bigThreshold) {
            const pick = g.cells[AC.rng.int(G.rng, 0, g.cells.length)];
            const o = newOrb(g.el, cellCX(pick), cellCY(pick), true); o.scale = 0; board[pick] = o;
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

    // --- Shields (rival ability) ---

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
        if (!s) return '';
        if (s.type === 'enhanced') return t('rtShEnhanced');
        if (s.type === 'combo') return t('rtShComboMin', s.n);
        if (s.type === 'firstWaveMax') return t('rtShFirstMax', s.n);
        if (s.type === 'element') {
            const names = s.elements.map((el) => t('el_' + el)).join('·');
            return s.mode === 'ban' ? t('rtShBan', names) : t('rtShNeed', names);
        }
        return '';
    }
    function rollDuelShield(round) {
        if (round < 2) return null;   // round 1 is free, to ease in
        const el = () => ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];
        switch (AC.rng.int(G.rng, 0, 5)) {
            case 0: return { type: 'enhanced' };
            case 1: return { type: 'combo', mode: 'min', n: 3 + Math.min(5, (round / 2) | 0) };
            case 2: return { type: 'firstWaveMax', n: 2 };
            case 3: return { type: 'element', mode: 'contains', elements: [el()] };
            default: return { type: 'element', mode: 'ban', elements: [el()] };
        }
    }

    // --- Damage / duel flow ---

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
            dmg += count * BALANCE.baseDamage;   // no element wheel in a duel; colours matter via shields
        }
        const blocked = shieldBlocks(G.aiShield, stats);
        const total = blocked ? 0 : dmg * comboMult;
        return { dmg: Math.round(total), heal: Math.round(heal * comboMult), n, blocked };
    }

    function finishResolve() {
        const { dmg, heal, n, blocked } = computeSpinResult(G.resolve.combos);
        if (n > 0) {
            if (heal > 0) { G.youHp = Math.min(G.youMaxHp, G.youHp + heal); addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20); }
            if (blocked) { addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22); AC.audio.play('empty'); }
            else if (dmg > 0) { G.aiHp -= dmg; G.score = Math.min(CONFIG.scoreCap, G.score + dmg); addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26); }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }
        for (const s of G.skills) if (s.cd > 0) s.cd--;
        G.bonusTimeNext = 0;
        G.skillPopup = null; G.transmute = null;
        G.resolving = false; G.resolve = null;

        if (G.aiHp <= 0) { G.aiHp = 0; updateHud(); duelOver(true); return; }
        G.phase = 'ai';
        G.aiTimer = DUEL.aiThink;
        updateHud();
    }

    function aiAttack() {
        const dmg = Math.max(1, Math.round(DUEL.aiBase + DUEL.aiGrow * (G.round - 1) + AC.rng.float(G.rng, -DUEL.aiVar, DUEL.aiVar)));
        G.youHp -= dmg;
        G.shake = 0.4;
        addFloat(W / 2, BOARD_TOP - 70, '-' + dmg, '#ff6b6b', 24);
        AC.audio.play('rock');
        if (G.youHp <= 0) { G.youHp = 0; updateHud(); duelOver(false); return; }
        G.round++;
        if (G.round > DUEL.maxRounds) { duelOver(G.youHp >= G.aiHp); return; }
        G.aiShield = rollDuelShield(G.round);
        G.phase = 'your';
        updateHud();
    }
    function duelOver(win) {
        if (G.phase === 'over') return;
        G.phase = 'over';
        shell.gameOver({ score: G.score, win: win, meta: { round: G.round, win } });
    }

    function addFloat(x, y, text, color, size) { G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 0.9 }); }

    // =================================================================
    // Skills (Focus + Transmute)
    // =================================================================

    function effectiveSpinTime() { return BALANCE.spinTime + (G.bonusTimeNext || 0); }
    function activateSkill(i) {
        const s = G.skills[i];
        if (!s || s.cd > 0 || !shell.isPlaying() || G.phase !== 'your' || G.resolving || G.held) return;
        if (s.id === 'transmute') { G.transmute = { skillIndex: i, fromEl: null }; }
        else { G.bonusTimeNext = 3; s.cd = skillDef(s.id).cd; AC.audio.play('gem'); addFloat(W / 2, 170, t('rtSk_' + s.id), accent(), 18); }
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
        if (G.phase === 'over') return;
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
        for (let i = G.floats.length - 1; i >= 0; i--) {
            const fl = G.floats[i];
            fl.t += dt; fl.y -= 22 * dt;
            if (fl.t >= fl.life) G.floats.splice(i, 1);
        }
        if (G.phase === 'your') {
            if (G.held && G.held.moved) { G.spinTimer -= dt; if (G.spinTimer <= 0) startResolve(); }
            if (G.resolving) stepResolve(dt);
        } else if (G.phase === 'ai') {
            G.aiTimer -= dt;
            if (G.aiTimer <= 0) aiAttack();
        }
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
        drawRivalPanel();
        drawYouBar();
        drawBoard();
        if (G.held) { const o = board[G.held.cell]; drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true, o.enhanced); }
        drawFloats();
        ctx.restore();

        drawSkills();
        drawSpinTimer();
        if (G.transmute) drawTransmuteHint();
        if (G.skillPopup) drawSkillPopup();
        if (DEBUG) drawDebug();
    }

    function defShape() { if (!defaultShape) defaultShape = makeShape(AC.rng.make(7)); return defaultShape; }
    function buildRoundedPoly(pts, rad) {
        const n = pts.length, prev = pts[n - 1];
        const p = new Path2D();
        p.moveTo((prev[0] + pts[0][0]) / 2, (prev[1] + pts[0][1]) / 2);
        for (let i = 0; i < n; i++) { const cur = pts[i], nxt = pts[(i + 1) % n]; p.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, rad); }
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
        for (const sp of sh.speckles) { const p = sp.light ? lightS : darkS; p.moveTo(sp.dx * R + sp.r * R, sp.dy * R); p.arc(sp.dx * R, sp.dy * R, sp.r * R, 0, PI2); }
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
        if (highlight) { ctx.scale(1.08, 1.08); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(gfx.path); }
        ctx.restore();
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
            ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
            roundRect(c * CELL + 3, BOARD_TOP + r * CELL + 3, CELL - 6, CELL - 6, 10); ctx.stroke(); ctx.restore();
        }
        if (G.transmute && G.transmute.fromEl != null) {
            ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
            for (let idx = 0; idx < COLS * ROWS; idx++) { const o = board[idx]; if (o && o.el === G.transmute.fromEl) { const r = cellRow(idx), c = cellCol(idx); roundRect(c * CELL + 4, BOARD_TOP + r * CELL + 4, CELL - 8, CELL - 8, 10); ctx.stroke(); } }
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
    function drawRivalPanel() {
        const f = getFont();
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `700 15px ${f}`; ctx.textAlign = 'left';
        ctx.fillText(t('rdRival'), 22, 28);

        drawBar(22, 38, W - 44, 18, G.aiHp / G.aiMaxHp, '#ff5566', Math.max(0, Math.ceil(G.aiHp)) + ' / ' + G.aiMaxHp);

        // status (left) + shield pill (right) on the next row
        ctx.textBaseline = 'middle';
        ctx.font = `600 13px ${f}`; ctx.textAlign = 'left';
        ctx.fillStyle = G.phase === 'ai' ? '#ffcf5a' : 'rgba(255,255,255,0.6)';
        ctx.fillText(G.phase === 'ai' ? t('rdThinking') : t('rdYourTurn'), 22, 78);

        if (G.aiShield) {
            const label = shieldLabel(G.aiShield);
            ctx.font = `700 13px ${f}`; ctx.textAlign = 'center';
            const pw = ctx.measureText(label).width + 20, px = W - 22 - pw, py = 66;
            ctx.fillStyle = 'rgba(127,212,255,0.16)';
            roundRect(px, py, pw, 24, 12); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(127,212,255,0.6)';
            roundRect(px, py, pw, 24, 12); ctx.stroke();
            ctx.fillStyle = '#a9e3ff';
            ctx.fillText(label, px + pw / 2, py + 12);
        }
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(16, 100); ctx.lineTo(W - 16, 100); ctx.stroke();
    }
    function drawYouBar() {
        const f = getFont();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `600 14px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rdHp'), 22, 134);
        const ratio = G.youHp / G.youMaxHp;
        const col = ratio <= 0.3 ? '#ff6b6b' : '#6bd98a';
        drawBar(112, 120, W - 134, 18, ratio, col, Math.max(0, Math.ceil(G.youHp)) + ' / ' + G.youMaxHp);
    }
    function skillButtonRects() {
        const n = G.skills.length;
        if (n === 0) return [];
        const gap = 12, h = 50, y = 160;
        const w = Math.min(160, (W - 48 - gap * (n - 1)) / n);
        const x0 = (W - (w * n + gap * (n - 1))) / 2;
        return G.skills.map((s, i) => ({ i, x: x0 + i * (w + gap), y, w, h }));
    }
    function drawSkills() {
        if (!shell || !shell.isPlaying()) return;
        const f = getFont();
        for (const b of skillButtonRects()) {
            const s = G.skills[b.i], ready = s.cd <= 0 && G.phase === 'your';
            ctx.save();
            ctx.fillStyle = ready ? 'rgba(217,84,78,0.16)' : 'rgba(255,255,255,0.05)';
            roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = ready ? accent() : 'rgba(255,255,255,0.15)';
            roundRect(b.x, b.y, b.w, b.h, 10); ctx.stroke();
            ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)';
            ctx.font = `700 15px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t('rtSk_' + s.id), b.x + b.w / 2, b.y + b.h / 2);
            if (s.cd > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `800 20px ${f}`;
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
        if (dom.round) dom.round.textContent = String(G.round);
        if (dom.hp) dom.hp.textContent = String(Math.max(0, Math.ceil(G.youHp)));
        if (hpStat) hpStat.classList.toggle('danger', G.youMaxHp > 0 && G.youHp / G.youMaxHp <= 0.3);
    }
    function overlayContent(state, result) {
        if (state === 'idle') {
            return { badge: 'swords', title: t('rdReady'), message: t('rdIntro'), button: t('play'), hint: t('rdStartHintHtml') };
        }
        if (state === 'over') {
            const win = result && result.meta ? result.meta.win : false;
            const round = result && result.meta ? result.meta.round : G.round;
            const dmg = AC.format.score(result ? result.score : G.score);
            let msg = win ? t('rdOverWinHtml', dmg, round) : t('rdOverLoseHtml', dmg, round);
            if (result && result.isNewBest) msg += ` <strong>${t('newBest')}</strong>`;
            return { badge: win ? 'trophy' : 'skull', title: win ? t('rdWin') : t('rdLose'), message: msg, button: t('restart'), hint: t('rdOverHint') };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.youHp = G.youMaxHp = DUEL.hp;
        G.aiHp = G.aiMaxHp = DUEL.hp;
        G.round = 1;
        G.phase = 'your';
        G.aiTimer = 0;
        G.aiShield = rollDuelShield(1);
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
        board = G.board = new Array(COLS * ROWS).fill(null);
        fillBoardNoMatches();
        updateHud();
        if (shell) shell.refreshBest();
    }
    function init() {
        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });
        shell = AC.shell.create({
            gameId: 'rune-duel',
            mode: () => 'duel',
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
        if (DEBUG) setupDebug();
        resetRun();
        render();
    }

    // =================================================================
    // [DEBUG-HOOK] window.RD (?debug=1 only)
    // =================================================================

    function drawDebug() {
        const lines = [
            'DEBUG  round ' + G.round + '/' + DUEL.maxRounds + '  ' + G.phase,
            'you ' + Math.ceil(G.youHp) + '/' + G.youMaxHp,
            'rival ' + Math.max(0, Math.ceil(G.aiHp)) + '/' + G.aiMaxHp,
            'shield ' + (G.aiShield ? G.aiShield.type : 'none'),
            'dealt ' + G.score,
        ];
        ctx.save();
        ctx.font = `600 12px ${getFont()}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const bx = W - w - 20, by = BOARD_TOP + 10;
        ctx.fillStyle = 'rgba(10,8,20,0.72)';
        roundRect(bx - 6, by - 4, w + 12, lines.length * 16 + 8, 8); ctx.fill();
        ctx.fillStyle = '#8fe36b';
        let y = by; for (const l of lines) { ctx.fillText(l, bx, y); y += 16; }
        ctx.restore();
    }
    function setupDebug() {
        window.RD = {
            kill() { G.aiHp = 0; return 'rival marked dead (resolve a spin)'; },
            hp(n) { G.youHp = AC.math.clamp(n, 0, G.youMaxHp); updateHud(); return G.youHp; },
            aiShield(type) {
                const map = { enhanced: { type: 'enhanced' }, combo: { type: 'combo', mode: 'min', n: 5 }, first: { type: 'firstWaveMax', n: 2 }, need: { type: 'element', mode: 'contains', elements: ['fire'] }, ban: { type: 'element', mode: 'ban', elements: ['water'] }, none: null };
                if (type in map) G.aiShield = map[type];
                return G.aiShield;
            },
            cast(i) { activateSkill(i | 0); return G.skills; },
            info() { return { round: G.round, phase: G.phase, you: G.youHp, rival: G.aiHp, shield: G.aiShield, dealt: G.score }; },
        };
        console.log('%c[Rune Duel] debug on', 'color:#d9544e;font-weight:700');
        console.log('RD.kill() hp(n) aiShield("enhanced"|"combo"|"first"|"need"|"ban"|"none") cast(i) info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
