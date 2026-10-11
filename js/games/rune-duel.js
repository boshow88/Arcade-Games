/**
 * Rune Duel — an orb-spinning versus duel (vs AI; online PvP is a later mode).
 *
 * A bounded duel: you and a rival each have an HP pool; it's a turn-based race to
 * zero. Each ROUND you draw a HAND of enhance cards and spend ENERGY to play them
 * (break the rival's shields, buff your spin, recolour runes…), then drag a rune
 * on your 6×5 board to clear 3+ of a colour, chain COMBOS and damage the rival —
 * but the rival raises SHIELDS each round (clear enhanced / N+ combos / a colour…)
 * that you must satisfy or your attack is blocked. HEART runes heal you; 5+ of a
 * colour forges an ENHANCED rune (×1.5). Then the rival strikes back.
 *
 * This is the vs-AI card core. Defense cards (your own shields), timed phases and
 * online PvP come next. Built on window.ArcadeCommon. Canvas 2D at 600×760.
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
        rdThinking: 'Rival is thinking…', rdYourTurn: 'Your turn — play & spin!',
        rdRivalMend: 'Rival mends', rdRivalEmpower: 'Rival empowers',
        rdEnergy: 'Energy', rdPlay: 'Play', rdCost: 'Cost',
        rdIntro: 'A turn-based orb duel. Each round, spend energy on cards, then spin: clear 3+ of a colour to hit the rival, meet their shields, and heal with hearts. Drop their HP to 0 to win.',
        rdStartHintHtml: 'Play cards, then drag a rune · <kbd>P</kbd> pause',
        rdHelp1Html: 'Each round has two steps: play <strong>defense</strong> cards (shields), tap <strong>To attack</strong>, then play <strong>enhance</strong> cards and <strong>spin</strong> to hit the rival. Cards cost <strong>energy</strong>.',
        rdHelp2Html: 'Then <strong>drag a rune</strong>, line up <strong>3+ of a colour</strong> to clear and damage the rival. Meet the rival\u2019s <strong>shields</strong> or it\u2019s blocked. <strong>Heart</strong> heals; <strong>5+</strong> forges an <strong>enhanced</strong> rune.',
        rdHelp3Html: 'The rival strikes back each round. Drop their HP to <strong>0</strong> to win. <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>M</kbd> mute.',
        rdWin: 'Victory!', rdLose: 'Defeated',
        rdOverWinHtml: (dmg, round) => `You won in <strong>${round}</strong> rounds (dealt ${dmg} damage).`,
        rdOverLoseHtml: (dmg, round) => `You fell on round <strong>${round}</strong> (dealt ${dmg} damage).`,
        rdOverHint: 'Press R or the button to duel again.',
        rdCard_break: 'Break', rdCardd_break: 'Remove one of the rival\u2019s shields.',
        rdCard_focus: 'Focus', rdCardd_focus: 'This spin: +3s of spin time.',
        rdCard_empower: 'Empower', rdCardd_empower: 'This spin: damage ×1.5.',
        rdCard_transmute: 'Transmute', rdCardd_transmute: 'Pick a colour, then a target \u2014 all runes of that colour become it.',
        rdCard_enchant: 'Enchant', rdCardd_enchant: 'Turn 3 random runes into enhanced runes.',
        rdCard_shEnhanced: 'Rune Shield', rdCardd_shEnhanced: 'Shield: the rival must clear an enhanced rune to hit you.',
        rdCard_shCombo: 'Combo Shield', rdCardd_shCombo: 'Shield: the rival needs 5+ combos to hit you.',
        rdCard_shBan: 'Taboo Shield', rdCardd_shBan: 'Shield: if the rival clears the named colour, its attack is blocked.',
        rdCard_hasten: 'Hasten', rdCardd_hasten: 'Cramp the rival\u2019s spin this round (fewer combos).',
        rdDefense: 'Defense — play shields', rdAttack: 'Attack — cards & spin', rdDone: 'To attack \u2192', rdDraw: 'Draw +1', rdTimeUp: 'Time up!',
        rdOnline: 'Online duel', rdOnlineBtn: 'Online', rdClose: 'Close',
        rdSignInGoogle: 'Sign in with Google', rdSignInGuest: 'Play as guest', rdSignOut: 'Sign out', rdGuest: 'Guest',
        rdSignedIn: (name) => `Signed in: ${name}`, rdSignInFirst: 'Sign in to create or join a room.',
        rdCreateRoom: 'Create room', rdJoinRoom: 'Join', rdRoomCode: 'Code', rdLeaveRoom: 'Leave room',
        rdRoomCreated: (code) => `Room ${code} — waiting for opponent\u2026`, rdWaitingOpp: 'Waiting for opponent\u2026',
        rdMatched: (name) => `Matched with ${name}!`, rdStartDuel: 'Start duel', rdWaitHost: 'Waiting for host to start\u2026',
        rdRoomNotFound: 'Room not found', rdRoomFull: 'Room is full', rdNetErr: 'Network error',
        rdDiscard: 'Discard', rdOppBoard: 'Rival\u2019s board', rdYouWin: 'You win!', rdYouLose: 'You lose',
        rtBlocked: 'Blocked!', rtCombo: (n) => `${n} Combo`,
        rtShEnhanced: 'Clear enhanced', rtShComboMin: (n) => `Need ${n}+ combo`, rtShFirstMax: (n) => `First wave \u2264 ${n}`,
        rtShNeed: (els) => `Clear ${els}`, rtShBan: (els) => `Don't clear ${els}`,
        rtPopupHint: 'Tap outside to cancel',
        rtTransmuteFrom: 'Tap a colour to change', rtTransmuteTo: 'Tap the target colour',
        el_fire: 'Fire', el_water: 'Water', el_wood: 'Wood', el_light: 'Light', el_dark: 'Dark', el_heart: 'Heart',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        rdRound: '回合', rdHp: '生命', rdReady: '準備好了', rdRival: '對手',
        rdThinking: '對手思考中…', rdYourTurn: '你的回合——出牌、轉珠！',
        rdRivalMend: '對手治療', rdRivalEmpower: '對手增幅',
        rdEnergy: '能量', rdPlay: '出牌', rdCost: '消耗',
        rdIntro: '回合制轉珠對決。每回合花能量出牌，再轉珠：消除同色 3+ 攻擊對手、破對手的盾、用心珠回血。把對手血打到 0 就贏。',
        rdStartHintHtml: '先出牌，再拖動符石 · <kbd>P</kbd> 暫停',
        rdHelp1Html: '每回合兩步：先出<strong>防禦牌</strong>（護盾），按「<strong>進入攻擊</strong>」，再出<strong>強化牌</strong>並<strong>轉珠</strong>攻擊對手。出牌花<strong>能量</strong>。',
        rdHelp2Html: '接著<strong>拖動符石</strong>、把<strong>同色 3 顆以上</strong>連線消除攻擊對手。要破對手的<strong>盾</strong>否則被擋。<strong>心</strong>珠回血；<strong>5+</strong> 生成<strong>強化符石</strong>。',
        rdHelp3Html: '對手每回合反擊。把對手血打到 <strong>0</strong> 就贏。<kbd>P</kbd> 暫停 · <kbd>R</kbd> 重新開始 · <kbd>M</kbd> 靜音。',
        rdWin: '勝利！', rdLose: '落敗',
        rdOverWinHtml: (dmg, round) => `你在第 <strong>${round}</strong> 回合獲勝（造成 ${dmg} 傷害）。`,
        rdOverLoseHtml: (dmg, round) => `你在第 <strong>${round}</strong> 回合倒下（造成 ${dmg} 傷害）。`,
        rdOverHint: '按 R 或按鈕再對決一次。',
        rdCard_break: '破盾', rdCardd_break: '移除對手的一個盾。',
        rdCard_focus: '凝神', rdCardd_focus: '本次轉珠時間 +3 秒。',
        rdCard_empower: '增幅', rdCardd_empower: '本次轉珠傷害 ×1.5。',
        rdCard_transmute: '轉換', rdCardd_transmute: '選一個顏色，再選目標色；盤上該色全變目標色。',
        rdCard_enchant: '附魔', rdCardd_enchant: '隨機 3 顆符石變成強化符石。',
        rdCard_shEnhanced: '強化盾', rdCardd_shEnhanced: '盾：對手這回合要消到強化符石才打得到你。',
        rdCard_shCombo: '連擊盾', rdCardd_shCombo: '盾：對手要 5+ 連擊才打得到你。',
        rdCard_shBan: '禁消盾', rdCardd_shBan: '盾：對手若消到指定顏色，攻擊被擋。',
        rdCard_hasten: '催促', rdCardd_hasten: '這回合干擾對手轉珠（連擊變少）。',
        rdDefense: '防禦階段——出防禦牌', rdAttack: '攻擊階段——出牌並轉珠', rdDone: '進入攻擊 \u2192', rdDraw: '抽牌 +1', rdTimeUp: '時間到！',
        rdOnline: '線上對戰', rdOnlineBtn: '線上', rdClose: '關閉',
        rdSignInGoogle: '用 Google 登入', rdSignInGuest: '以訪客身分遊玩', rdSignOut: '登出', rdGuest: '訪客',
        rdSignedIn: (name) => `已登入：${name}`, rdSignInFirst: '登入後即可建立或加入房間。',
        rdCreateRoom: '建立房間', rdJoinRoom: '加入', rdRoomCode: '房號', rdLeaveRoom: '離開房間',
        rdRoomCreated: (code) => `房號 ${code}——等待對手加入\u2026`, rdWaitingOpp: '等待對手\u2026',
        rdMatched: (name) => `已配對：${name}！`, rdStartDuel: '開始對戰', rdWaitHost: '等待房主開始\u2026',
        rdRoomNotFound: '找不到房間', rdRoomFull: '房間已滿', rdNetErr: '連線錯誤',
        rdDiscard: '丟棄', rdOppBoard: '對手盤面', rdYouWin: '你贏了！', rdYouLose: '你輸了',
        rtBlocked: '擋下！', rtCombo: (n) => `${n} 連擊`,
        rtShEnhanced: '需消強化', rtShComboMin: (n) => `需 ${n}+ 連擊`, rtShFirstMax: (n) => `首批 \u2264 ${n} 連擊`,
        rtShNeed: (els) => `需消 ${els}`, rtShBan: (els) => `禁消 ${els}`,
        rtPopupHint: '點擊外面取消',
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
    // Config + balance + cards
    // =================================================================

    const CONFIG = {
        orbRadius: 40, iconScale: 0.8, iconStroke: 0.12, iconTint: -0.15,
        popTime: 0.13, fallAnim: 0.16, bigThreshold: 5, scoreCap: 999999,
    };
    const BALANCE = {
        spinTime: 6, baseDamage: 12, heartHeal: 12, comboStep: 0.25, enhancedMult: 1.5,
    };
    const DUEL = {
        hp: 2500, maxRounds: 30,
        energy: 10, handSize: 4, maxHand: 7, drawCost: 2,   // extra draw digs for a card you need
        phaseTime: 20,                  // seconds to decide in the defense / attack phase
        aiThink: 1.1,
        aiBase: 40, aiPerCombo: 28,     // rival damage ≈ aiBase + combos·aiPerCombo
        aiComboMin: 3, aiComboMax: 7,   // its simulated combos (before meeting your shields)
        aiSkill: 0.7,                   // chance it meets each of your shields
        aiHasten: 0.3,                  // chance it hastens your spin (from round 3)
        stallSec: 45,                   // online: opponent idle this long → they forfeit
        takeoverSec: 6,                 // online: both attacked but host didn't tally → take over
    };
    // Card pool. type = which phase it's played in. cost = energy.
    const CARDS = {
        // defense (defense phase → shields the rival's attack must satisfy, or a debuff)
        shEnhanced: { type: 'defense', cost: 4 },   // rival must clear an enhanced rune
        shCombo:    { type: 'defense', cost: 4 },   // rival needs 5+ combos
        shBan:      { type: 'defense', cost: 3 },   // rival mustn't clear a named colour
        hasten:     { type: 'defense', cost: 3 },   // cramp the rival's spin (fewer combos)
        // enhance (attack phase → buff your spin / break rival shields)
        break:     { type: 'enhance', cost: 4 },   // remove one rival shield
        focus:     { type: 'enhance', cost: 2 },   // +3s this spin
        empower:   { type: 'enhance', cost: 4 },   // ×1.5 damage this spin
        transmute: { type: 'enhance', cost: 3 },   // recolour one colour → another
        enchant:   { type: 'enhance', cost: 3 },   // 3 random runes → enhanced
    };
    const DEF_IDS = Object.keys(CARDS).filter((id) => CARDS[id].type === 'defense');
    const ENH_IDS = Object.keys(CARDS).filter((id) => CARDS[id].type === 'enhance');
    const ALL_IDS = Object.keys(CARDS);   // one persistent hand draws from the whole pool

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        board: [],
        clearing: [],
        youHp: 0, youMaxHp: 0,
        aiHp: 0, aiMaxHp: 0,
        aiShields: [],          // rival shields you must satisfy (all)
        round: 1,
        phase: 'defense',       // 'defense' | 'attack' | 'ai' | 'over'
        phaseTimer: 0,          // seconds left to decide in defense / attack
        aiTimer: 0,
        score: 0,
        energy: 0,
        hand: [],               // card ids (of the current phase's type)
        youShields: [],         // shields you played (the rival must satisfy to hit you)
        spinPenalty: 0,         // your spin-time reduction this round (rival hasten)
        aiSpinPenalty: 0,       // the rival's combo reduction this round (your hasten)
        cardPopup: null,        // { i } while a card's confirm popup is open
        transmute: null,        // { fromEl }
        empowerNext: 1,
        bonusTimeNext: 0,
        held: null,
        spinTimer: 0,
        resolving: false,
        resolve: null,
        floats: [],
        shake: 0,
    };

    let board = G.board;
    let seedCounter = 1;
    let shell = null;
    let fontCache = null;
    let accentCache = null;
    let defaultShape = null;
    let needsRender = true;     // render-on-demand: only repaint when something changed/animates
    let lastSecShown = -1;
    function markDirty() { needsRender = true; }

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
    function enchantRandom(n) {
        const c = []; for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && !o.enhanced) c.push(i); }
        for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); board[c[j]].enhanced = true; c.splice(j, 1); }
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
        markDirty();
        if (e.target.closest('button, a')) return;
        if (!e.target.closest('.stage-pad')) return;
        const p = boardPos(e);
        if (G.cardPopup) {
            const L = cardPopupLayout(), id = G.hand[G.cardPopup.i], c = id && CARDS[id];
            if (c && G.energy >= c.cost && playable(id) && cardPhaseOk(id) && inRect(p, L.cast)) { const i = G.cardPopup.i; G.cardPopup = null; AC.audio.unlock(); playCard(i); }
            else if (inRect(p, L.discard)) { const i = G.cardPopup.i; G.cardPopup = null; AC.audio.unlock(); discardCard(i); }
            else if (!inRect(p, L.card)) { G.cardPopup = null; }
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
        if (G.resolving || G.held || (G.phase !== 'defense' && G.phase !== 'attack')) return;
        if (onlineWaiting()) { if (e.cancelable) e.preventDefault(); return; }
        if (p.y < BOARD_TOP) {
            if (G.phase === 'defense' && inRect(p, doneButtonRect())) { AC.audio.unlock(); if (G.online) submitDefense(); else startAttackPhase(); if (e.cancelable) e.preventDefault(); return; }
            if (canDrawMore() && inRect(p, drawMoreRect())) { AC.audio.unlock(); drawOneCard(); if (e.cancelable) e.preventDefault(); return; }
            for (const b of handTileRects()) {
                if (inRect(p, b)) { AC.audio.unlock(); G.cardPopup = { i: b.i }; if (e.cancelable) e.preventDefault(); return; }
            }
            return;
        }
        if (G.phase !== 'attack') return;   // can only spin in the attack phase
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
        markDirty();
        dragTo(boardPos(e).x, boardPos(e).y);
        if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
        if (!G.held) return;
        if (G.held.moved) startResolve();
        else G.held = null;
    }

    // =================================================================
    // Cards
    // =================================================================

    function effectiveSpinTime() { return Math.max(2, BALANCE.spinTime - (G.spinPenalty || 0)) + (G.bonusTimeNext || 0); }
    // One persistent hand: deal once at the start, then draw a single new card each
    // round. Unplayed cards carry over (they no longer re-roll every phase).
    function dealStartingHand() {
        G.hand = [];
        for (let i = 0; i < DUEL.handSize; i++) G.hand.push(ALL_IDS[AC.rng.int(G.rng, 0, ALL_IDS.length)]);
    }
    function drawRoundCard() {
        if (G.hand.length >= DUEL.maxHand) return;
        G.hand.push(ALL_IDS[AC.rng.int(G.rng, 0, ALL_IDS.length)]);
    }
    function canDrawMore() {
        return (G.phase === 'defense' || G.phase === 'attack') && !G.resolving && !G.held && !G.cardPopup && !G.transmute && !onlineWaiting()
            && G.hand.length < DUEL.maxHand && G.energy >= DUEL.drawCost;
    }
    function drawOneCard() {
        if (!canDrawMore()) return;
        G.hand.push(ALL_IDS[AC.rng.int(G.rng, 0, ALL_IDS.length)]);
        G.energy -= DUEL.drawCost;
        AC.audio.play('click');
        updateHud();
    }
    function discardCard(i) {
        if (i == null || i < 0 || i >= G.hand.length) return;
        G.hand.splice(i, 1);
        AC.audio.play('click');
        updateHud();
    }
    function playable(id) {   // some cards need a legal target
        if (id === 'break') return G.aiShields.length > 0;
        return true;
    }
    function cardPhaseOk(id) { return (CARDS[id].type === 'defense') === (G.phase === 'defense'); }
    function playCard(i) {
        const id = G.hand[i];
        const c = id && CARDS[id];
        if (!c || G.resolving || G.held || G.energy < c.cost || !playable(id) || !cardPhaseOk(id)) return;
        if (id === 'shEnhanced') { G.youShields.push({ type: 'enhanced' }); }
        else if (id === 'shCombo') { G.youShields.push({ type: 'combo', mode: 'min', n: 5 }); }
        else if (id === 'shBan') { G.youShields.push({ type: 'element', mode: 'ban', elements: [ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)]] }); }
        else if (id === 'hasten') { G.aiSpinPenalty += 2; }
        else if (id === 'break') { G.aiShields.shift(); AC.audio.play('coin'); }
        else if (id === 'focus') { G.bonusTimeNext += 3; }
        else if (id === 'empower') { G.empowerNext *= 1.5; }
        else if (id === 'enchant') { enchantRandom(3); }
        else if (id === 'transmute') { G.transmute = { fromEl: null }; }
        G.energy -= c.cost;
        G.hand.splice(i, 1);
        if (id !== 'transmute') { AC.audio.play('gem'); addFloat(W / 2, 150, t('rdCard_' + id), accent(), 18); }
        updateHud();
    }
    function applyTransmute(fromEl, toEl) {
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && o.el === fromEl) { o.el = toEl; o.gfx = null; } }
        G.transmute = null;
        AC.audio.play('gem');
        updateHud();
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

    // --- Shields ---

    function shieldUnmet(shield, stats) {
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
    function shieldsBlock(shields, stats) { return shields.some((s) => shieldUnmet(s, stats)); }
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
    function oneShield(round) {
        const el = () => ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)];
        switch (AC.rng.int(G.rng, 0, 5)) {
            case 0: return { type: 'enhanced' };
            case 1: return { type: 'combo', mode: 'min', n: 3 + Math.min(5, (round / 2) | 0) };
            case 2: return { type: 'firstWaveMax', n: 2 };
            case 3: return { type: 'element', mode: 'contains', elements: [el()] };
            default: return { type: 'element', mode: 'ban', elements: [el()] };
        }
    }
    function rollRivalShields(round) {
        if (round < 2) return [];                 // round 1 is free
        const count = round >= 6 ? 2 : 1;         // the rival stacks a 2nd shield later
        const out = [];
        for (let i = 0; i < count; i++) out.push(oneShield(round));
        return out;
    }
    // The rival's whole defense decision for the round: which shields to raise, and
    // whether to hasten your spin. Keeping it in one place (instead of a stray roll)
    // makes AI difficulty a single knob.
    function aiDefend(round) {
        return {
            shields: rollRivalShields(round),
            hastenYou: round >= 3 && AC.rng.float(G.rng, 0, 1) < DUEL.aiHasten,
        };
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
            dmg += count * BALANCE.baseDamage;
        }
        const blocked = shieldsBlock(G.aiShields, stats);
        const total = blocked ? 0 : dmg * comboMult * (G.empowerNext || 1);
        return { dmg: Math.round(total), heal: Math.round(heal * comboMult), n, blocked };
    }
    function finishResolve() {
        const { dmg, heal, n, blocked } = computeSpinResult(G.resolve.combos);
        if (G.online) {
            if (n > 0) {
                if (heal > 0) addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20);
                if (blocked) { addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22); AC.audio.play('empty'); }
                else if (dmg > 0) addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26);
                addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
            }
            G.empowerNext = 1; G.bonusTimeNext = 0;
            G.cardPopup = null; G.transmute = null;
            G.resolving = false; G.resolve = null;
            G.online.sub = 'waitAtk';
            submitAttack(dmg, heal);
            updateHud();
            return;
        }
        if (n > 0) {
            if (heal > 0) { G.youHp = Math.min(G.youMaxHp, G.youHp + heal); addFloat(W / 2, BOARD_TOP - 40, '+' + heal, ELEMENT_COLORS.heart, 20); }
            if (blocked) { addFloat(W / 2, 96, t('rtBlocked'), '#9fe0ff', 22); AC.audio.play('empty'); }
            else if (dmg > 0) { G.aiHp -= dmg; G.score = Math.min(CONFIG.scoreCap, G.score + dmg); addFloat(W / 2, 96, '-' + dmg, '#ffd0d0', 26); }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }
        G.empowerNext = 1;
        G.bonusTimeNext = 0;
        G.cardPopup = null; G.transmute = null;
        G.resolving = false; G.resolve = null;
        if (G.aiHp <= 0) { G.aiHp = 0; updateHud(); duelOver(true); return; }
        G.phase = 'ai';
        G.aiTimer = DUEL.aiThink;
        updateHud();
    }
    function aiAttack() {
        // the rival "plays cards": it may mend itself and/or empower its strike
        let mult = 1;
        if (AC.rng.float(G.rng, 0, 1) < 0.35 && G.aiHp < G.aiMaxHp) {
            const h = Math.round(G.aiMaxHp * 0.06);
            G.aiHp = Math.min(G.aiMaxHp, G.aiHp + h);
            addFloat(W / 2, 48, t('rdRivalMend') + ' +' + h, '#8fd1a0', 18);
        }
        if (AC.rng.float(G.rng, 0, 1) < 0.35) { mult = 1.5; addFloat(W / 2, 72, t('rdRivalEmpower'), '#ffcf5a', 18); }

        // the rival "spins": a simulated profile that tries to meet YOUR shields
        let combos = AC.rng.int(G.rng, DUEL.aiComboMin, DUEL.aiComboMax + 1) + ((G.round / 6) | 0);
        combos = Math.max(1, combos - (G.aiSpinPenalty || 0));   // your Hasten cramps it
        let firstWave = combos;
        let enhancedCleared = AC.rng.float(G.rng, 0, 1) < 0.3 ? 1 : 0;
        const els = new Set();
        const k = 2 + AC.rng.int(G.rng, 0, 2);
        for (let i = 0; i < k; i++) els.add(ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)]);
        for (const s of G.youShields) {                          // it meets each shield with skill chance
            if (AC.rng.float(G.rng, 0, 1) > DUEL.aiSkill) continue;
            if (s.type === 'enhanced') enhancedCleared = Math.max(enhancedCleared, 1);
            else if (s.type === 'combo' && s.mode === 'min') combos = Math.max(combos, s.n);
            else if (s.type === 'firstWaveMax') firstWave = Math.min(firstWave, s.n);
            else if (s.type === 'element' && s.mode === 'ban') els.delete(s.elements[0]);
            else if (s.type === 'element' && s.mode === 'contains') s.elements.forEach((e) => els.add(e));
        }
        const stats = { combos, firstWave, enhancedCleared, elements: els };
        const blocked = shieldsBlock(G.youShields, stats);

        if (blocked) {
            addFloat(W / 2, BOARD_TOP - 70, t('rtBlocked'), '#9fe0ff', 22);
            AC.audio.play('empty');
        } else {
            const dmg = Math.max(1, Math.round((DUEL.aiBase + combos * DUEL.aiPerCombo) * mult));
            G.youHp -= dmg;
            G.shake = 0.4;
            addFloat(W / 2, BOARD_TOP - 70, '-' + dmg, '#ff6b6b', 24);
            AC.audio.play('rock');
        }
        if (G.youHp <= 0) { G.youHp = 0; updateHud(); duelOver(false); return; }
        G.round++;
        if (G.round > DUEL.maxRounds) { duelOver(G.youHp >= G.aiHp); return; }
        startDefensePhase();
    }
    // Defense phase: play shields on yourself; the rival "plays its defense" (the
    // shields your spin must break). Then "To attack" → the attack phase.
    function startDefensePhase() {
        G.phase = 'defense';
        G.energy = DUEL.energy;
        G.youShields = [];
        G.aiSpinPenalty = 0;
        G.spinPenalty = 0;
        G.empowerNext = 1;
        G.bonusTimeNext = 0;
        G.phaseTimer = DUEL.phaseTime;
        if (G.round > 1) drawRoundCard();     // one new card per round; the rest of the hand persists
        if (G.online) { G.online.sub = 'def'; G.online.phaseDeadline = Date.now() + DUEL.phaseTime * 1000; G.aiShields = []; pushMyBoard(); updateHud(); return; }
        const plan = aiDefend(G.round);
        G.aiShields = plan.shields;
        G.spinPenalty = plan.hastenYou ? 2 : 0;   // rival's hasten shortens your spin this round
        updateHud();
    }
    function startAttackPhase() {
        G.phase = 'attack';
        G.energy = DUEL.energy;
        G.cardPopup = null;
        G.phaseTimer = DUEL.phaseTime;
        if (G.online) { G.online.sub = 'atk'; G.online.phaseDeadline = Date.now() + DUEL.phaseTime * 1000; }
        updateHud();
    }
    // Phase clock ran out: defense → go attack; attack (not yet spinning) → forfeit
    // this strike and hand over to the rival.
    function onPhaseTimeout() {
        if (G.online) {
            if (G.phase === 'defense') { submitDefense(); return; }
            if (G.phase === 'attack') {
                addFloat(W / 2, 150, t('rdTimeUp'), '#ff6b6b', 20); AC.audio.play('empty');
                G.empowerNext = 1; G.bonusTimeNext = 0; G.cardPopup = null; G.transmute = null;
                G.online.sub = 'waitAtk';
                submitAttack(0, 0);
                updateHud();
            }
            return;
        }
        if (G.phase === 'defense') { startAttackPhase(); return; }
        if (G.phase === 'attack') {
            addFloat(W / 2, 150, t('rdTimeUp'), '#ff6b6b', 20);
            AC.audio.play('empty');
            G.empowerNext = 1; G.bonusTimeNext = 0; G.cardPopup = null; G.transmute = null;
            G.phase = 'ai'; G.aiTimer = DUEL.aiThink;
            updateHud();
        }
    }
    function duelOver(win) {
        if (G.phase === 'over') return;
        G.phase = 'over';
        const wasOnline = !!G.online;
        G.online = null;
        if (shell.syncButtons) shell.syncButtons();   // re-enable pause/restart after an online match
        if (wasOnline) {
            // Online: show the result and drop back to the in-room pairing screen so the
            // host can start a rematch in the same room (room stays; cleaned on leave/GC).
            lobbyResult = win ? t('rdYouWin') : t('rdYouLose');
            AC.audio.play(win ? 'levelup' : 'gameover');
            openLobby();
        } else {
            shell.gameOver({ score: G.score, win: win, meta: { round: G.round, win } });
        }
    }

    function addFloat(x, y, text, color, size) { G.floats.push({ x, y, text, color, size: size || 18, t: 0, life: 0.9 }); }

    // =================================================================
    // Online duel sync (stage 2)
    // Defense: both pick shields → submit → reveal each other's shields.
    // Attack: both spin (damage already gated by the opponent's shields) →
    // submit {dmg,heal}. When both are in, the host writes resolved HP + round.
    // =================================================================

    function onlineWaiting() { return !!(G.online && (G.online.sub === 'waitDef' || G.online.sub === 'waitAtk')); }
    function onlineRemain() { return G.online ? Math.max(0, (G.online.phaseDeadline - Date.now()) / 1000) : 0; }

    function serializeShields(list) {
        return (list || []).map((s) => {
            const o = { type: s.type };
            if (s.mode) o.mode = s.mode;
            if (s.n != null) o.n = s.n;
            if (s.elements) o.elements = s.elements.slice();
            return o;
        });
    }
    function serializeBoard() {
        const out = [];
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; out.push(o ? { e: o.el, h: o.enhanced ? 1 : 0 } : null); }
        return out;
    }
    function pushMyBoard() {
        if (G.online && room && room.code) net.updateRoom(room.code, { ['game.board.' + G.online.myUid]: serializeBoard() }).catch(() => {});
    }
    function enterOnline(data) {
        if (!netUser) return;
        const myUid = netUser.uid;
        const oppUid = Object.keys(data.players || {}).find((u) => u !== myUid) || null;
        if (!oppUid) return;
        G.online = {
            myUid, oppUid,
            host: data.hostUid === myUid,
            oppName: (data.players[oppUid] && data.players[oppUid].name) || t('rdGuest'),
            sub: null, lastResolvedRound: 0, waitSince: 0, bothAtkSince: 0, phaseDeadline: 0,
        };
        lobbyResult = '';
        closeLobby();
        resetRun();
        if (!shell.isPlaying()) shell.start();
        if (shell.syncButtons) shell.syncButtons();   // disable pause/restart now that we're online
    }
    function submitDefense() {
        if (!G.online || G.online.sub !== 'def') return;
        G.online.sub = 'waitDef';
        G.online.waitSince = Date.now();
        net.updateRoom(room.code, { ['game.def.' + G.online.myUid]: serializeShields(G.youShields) }).catch((e) => console.warn('[duel]', e));
        updateHud();
    }
    function submitAttack(dmg, heal) {
        if (!G.online) return;
        G.online.waitSince = Date.now();
        net.updateRoom(room.code, { ['game.atk.' + G.online.myUid]: { dmg: dmg | 0, heal: heal | 0 } }).catch((e) => console.warn('[duel]', e));
    }
    // Heartbeat: keep our own room's lastActionAt fresh (so it's never GC'd while we're
    // present), and periodically purge rooms others abandoned. Firestore has no
    // onDisconnect, so this is how F5'd/closed rooms get cleaned — reliably & for free,
    // within ~90s, without anyone needing to reopen the lobby.
    function heartbeatAndGc() {
        if (!net) return;
        if (room && room.code && netUser && room.data && room.data.players && room.data.players[netUser.uid]) {
            net.updateRoom(room.code, {}).catch(() => {});
        }
        net.cleanupStaleRooms().catch(() => {});
    }
    function forfeitOpponent() {
        if (!G.online) return;
        net.updateRoom(room.code, { 'game.status': 'over', 'game.winner': G.online.myUid }).catch(() => {});
        duelOver(true);
    }
    function onlineWatchdog() {
        if (!G.online || !room || !room.data || !room.data.game) return;
        const g = room.data.game;
        if (g.status === 'over') return;
        const now = Date.now(), my = G.online.myUid, opp = G.online.oppUid;
        // (0) phase auto-advance on REAL time — fires even when this tab is backgrounded
        // (rAF/update freezes in background, but setInterval keeps ticking), so switching
        // tabs can no longer pause/stall the match: your move auto-submits at the deadline.
        if (!onlineWaiting() && now > (G.online.phaseDeadline || Infinity)) {
            if (G.phase === 'defense' && G.online.sub === 'def') { onPhaseTimeout(); return; }
            // never cut in while a spin is dragging OR its cascade is resolving — once a
            // spin starts it finishes on its own timer and submits via finishResolve,
            // even past the deadline. (This was the mid-cascade "freeze" cause.)
            if (G.phase === 'attack' && G.online.sub === 'atk' && !G.held && !G.resolving) { onPhaseTimeout(); return; }
        }
        // (1) opponent idle too long → they forfeit, you win
        if (onlineWaiting()) {
            const oppIn = G.online.sub === 'waitDef' ? !!(g.def && g.def[opp]) : !!(g.atk && g.atk[opp]);
            if (!oppIn && now - (G.online.waitSince || now) > DUEL.stallSec * 1000) { forfeitOpponent(); return; }
        }
        // (2) both attacked but no one tallied (host gone) → take over the resolve
        if (g.atk && g.atk[my] && g.atk[opp] && G.online.lastResolvedRound >= (g.round || 1)
            && G.online.bothAtkSince && now - G.online.bothAtkSince > DUEL.takeoverSec * 1000) {
            G.online.bothAtkSince = 0;
            hostResolve(g);
        }
    }
    function hostResolve(g) {
        const A = G.online.myUid, B = G.online.oppUid, a = g.atk || {};
        const clamp = (v) => Math.max(0, Math.min(DUEL.hp, Math.round(v)));
        const dA = (a[A] && a[A].dmg) || 0, hA = (a[A] && a[A].heal) || 0;
        const dB = (a[B] && a[B].dmg) || 0, hB = (a[B] && a[B].heal) || 0;
        const hp = Object.assign({}, g.hp);
        hp[A] = clamp((hp[A] || 0) - dB + hA);     // each takes the other's damage, heals self
        hp[B] = clamp((hp[B] || 0) - dA + hB);
        const round = g.round || 1;
        let status = 'playing', winner = null;
        if (hp[A] <= 0 || hp[B] <= 0 || round >= DUEL.maxRounds) {
            status = 'over';
            winner = hp[A] === hp[B] ? null : (hp[A] > hp[B] ? A : B);
        }
        net.updateRoom(room.code, {
            'game.hp': hp, 'game.round': round + 1, 'game.def': {}, 'game.atk': {},
            'game.status': status, 'game.winner': winner,
        }).catch((e) => console.warn('[duel]', e));
    }
    function onRoomGame(data) {
        markDirty();
        if (G.online && !data && G.phase !== 'over') { duelOver(true); return; }   // room vanished → opponent left, you win
        const g = data && data.game;
        if (!g) return;
        if (g.status === 'playing' && !G.online) { enterOnline(data); return; }
        if (!G.online) return;
        const my = G.online.myUid, opp = G.online.oppUid;
        if (g.board && g.board[opp]) G.online.oppBoard = g.board[opp];   // mirror the rival's board for the preview
        // reveal: both defense submitted → attack phase, see the opponent's shields
        if (G.online.sub === 'waitDef' && g.def && g.def[my] && g.def[opp]) {
            G.aiShields = (g.def[opp] || []).slice();
            startAttackPhase();
            return;
        }
        // resolve: both attacks in (animate the opponent's strike once per round)
        if (g.atk && g.atk[my] && g.atk[opp] && G.online.lastResolvedRound < (g.round || 1)) {
            G.online.lastResolvedRound = g.round || 1;
            G.online.bothAtkSince = Date.now();
            const oppDmg = (g.atk[opp] && g.atk[opp].dmg) || 0;
            if (oppDmg > 0) { G.shake = 0.4; addFloat(W / 2, BOARD_TOP - 70, '-' + oppDmg, '#ff6b6b', 24); AC.audio.play('rock'); }
            if (G.online.host) hostResolve(g);
            return;
        }
        // next round
        if (g.status === 'playing' && (g.round || 1) > G.round) {
            G.round = g.round;
            G.online.bothAtkSince = 0;
            if (g.hp) { G.youHp = g.hp[my]; G.aiHp = g.hp[opp]; }
            updateHud();
            startDefensePhase();
            return;
        }
        // over
        if (g.status === 'over' && G.phase !== 'over') {
            if (g.hp) { G.youHp = g.hp[my]; G.aiHp = g.hp[opp]; updateHud(); }
            duelOver(g.winner === my);
        }
    }
    function hostStartGame() {
        if (!room || !room.data) return;
        const h = room.data.hostUid;
        const guest = Object.keys(room.data.players || {}).find((u) => u !== h);
        if (!guest) return;
        const hp = {}; hp[h] = DUEL.hp; hp[guest] = DUEL.hp;
        net.updateRoom(room.code, { 'game.status': 'playing', 'game.round': 1, 'game.hp': hp, 'game.def': {}, 'game.atk': {}, 'game.winner': null }).catch((e) => showLobbyError(e));
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
        if (G.phase === 'defense') {
            if (G.online) { if (!onlineWaiting()) G.phaseTimer = onlineRemain(); }
            else { G.phaseTimer -= dt; if (G.phaseTimer <= 0) onPhaseTimeout(); }
        } else if (G.phase === 'attack') {
            if (G.held && G.held.moved) { G.spinTimer -= dt; if (G.spinTimer <= 0) startResolve(); }
            else if (!G.resolving) {
                if (G.online) { if (!onlineWaiting()) G.phaseTimer = onlineRemain(); }
                else { G.phaseTimer -= dt; if (G.phaseTimer <= 0) onPhaseTimeout(); }
            }
            if (G.resolving) stepResolve(dt);
        } else if (G.phase === 'ai') {
            G.aiTimer -= dt;
            if (G.aiTimer <= 0) aiAttack();
        }
        // repaint once per second while a phase clock is visibly counting down
        if ((G.phase === 'defense' || G.phase === 'attack') && !onlineWaiting() && !(G.held && G.held.moved)) {
            const sec = Math.ceil(G.phaseTimer);
            if (sec !== lastSecShown) { lastSecShown = sec; markDirty(); }
        }
        settleOrbs(dt);
    }

    // =================================================================
    // Rendering
    // =================================================================

    function animating() {
        if (G.held || G.resolving || G.shake > 0 || G.floats.length) return true;
        for (let i = 0; i < COLS * ROWS; i++) {
            const o = board[i];
            if (!o) continue;
            if (Math.abs(o.x - cellCX(i)) > 0.4 || Math.abs(o.y - cellCY(i)) > 0.4) return true;
            if (Math.abs((o.scale == null ? 1 : o.scale) - 1) > 0.01) return true;
        }
        return false;
    }
    function render() {
        // Only skip repaint while genuinely idle (waiting for opponent / AI thinking /
        // over / ready). During active play and animations we always repaint, so the
        // board can never visually "freeze" mid-cascade.
        // Online always repaints (network-driven state must never visually stall);
        // vs-AI still skips repaint while genuinely idle to save resources.
        const idle = !G.online && (G.phase === 'ai' || G.phase === 'over' || G.phase === 'idle');
        if (idle && !needsRender && !animating()) return;
        needsRender = false;
        ctx.fillStyle = '#0d0b16';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (G.shake > 0) { const s = G.shake * 9; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
        drawRivalPanel();
        drawYouBar();
        drawBoard();
        if (G.held) { const o = board[G.held.cell]; drawStone(o.el, o.x, o.y, CONFIG.orbRadius * 1.06, o.shape, true, o.enhanced); }
        drawOppBoard();
        drawFloats();
        ctx.restore();
        drawHand();
        if (G.phase === 'defense') drawDoneButton();
        drawDrawButton();
        drawSpinTimer();
        if (G.transmute) drawTransmuteHint();
        if (G.cardPopup) drawCardPopup();
        if (DEBUG) drawDebug();
    }

    // Rival board preview — shown over the (non-interactive) board during the online
    // defense phase, so you can pick shields based on what the opponent is holding.
    function drawOppBoard() {
        if (!(G.online && (G.phase === 'defense') && G.online.oppBoard)) return;
        const ob = G.online.oppBoard, f = getFont();
        const cell = 46, pad = 12, titleH = 26;
        const gw = COLS * cell, gh = ROWS * cell;
        const ox = (W - gw) / 2, oy = BOARD_TOP + 56;
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.86)';
        roundRect(ox - pad, oy - pad - titleH, gw + pad * 2, gh + pad * 2 + titleH, 14); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        roundRect(ox - pad, oy - pad - titleH, gw + pad * 2, gh + pad * 2 + titleH, 14); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `800 15px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rdOppBoard'), W / 2, oy - pad - 8);
        for (let i = 0; i < COLS * ROWS; i++) {
            const c = ob[i]; if (!c) continue;
            const x = ox + cellCol(i) * cell, y = oy + cellRow(i) * cell;
            ctx.fillStyle = ELEMENT_COLORS[c.e] || '#666';
            roundRect(x + 3, y + 3, cell - 6, cell - 6, 8); ctx.fill();
            if (c.h) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; roundRect(x + 3, y + 3, cell - 6, cell - 6, 8); ctx.stroke(); }
        }
        ctx.restore();
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
        ctx.fillText(G.online ? G.online.oppName : t('rdRival'), 22, 24);
        drawBar(22, 34, W - 44, 18, G.aiHp / G.aiMaxHp, '#ff5566', Math.max(0, Math.ceil(G.aiHp)) + ' / ' + G.aiMaxHp);

        ctx.textBaseline = 'middle';
        ctx.font = `600 13px ${f}`; ctx.textAlign = 'left';
        const status = onlineWaiting() ? t('rdWaitingOpp') : (G.phase === 'ai' ? t('rdThinking') : G.phase === 'defense' ? t('rdDefense') : t('rdAttack'));
        ctx.fillStyle = G.phase === 'ai' ? '#ffcf5a' : accent();
        ctx.fillText(status, 22, 74);
        if ((G.phase === 'defense' || G.phase === 'attack') && !(G.held && G.held.moved) && !onlineWaiting()) {
            const sw = ctx.measureText(status).width;
            ctx.fillStyle = G.phaseTimer <= 5 ? '#ff6b6b' : 'rgba(255,255,255,0.7)';
            ctx.font = `800 13px ${f}`;
            ctx.fillText(Math.max(0, Math.ceil(G.phaseTimer)) + 's', 22 + sw + 12, 74);
        }

        // shield pills (right-aligned, may be several)
        let px = W - 22;
        for (let i = G.aiShields.length - 1; i >= 0; i--) {
            const label = shieldLabel(G.aiShields[i]);
            ctx.font = `700 12px ${f}`; ctx.textAlign = 'center';
            const pw = ctx.measureText(label).width + 18;
            px -= pw;
            ctx.fillStyle = 'rgba(127,212,255,0.16)';
            roundRect(px, 64, pw, 22, 11); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(127,212,255,0.6)';
            roundRect(px, 64, pw, 22, 11); ctx.stroke();
            ctx.fillStyle = '#a9e3ff';
            ctx.fillText(label, px + pw / 2, 75);
            px -= 6;
        }
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(16, 94); ctx.lineTo(W - 16, 94); ctx.stroke();
    }
    function drawYouBar() {
        const f = getFont();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `600 13px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rdHp'), 22, 124);
        const ratio = G.youHp / G.youMaxHp;
        const col = ratio <= 0.3 ? '#ff6b6b' : '#6bd98a';
        drawBar(70, 110, W - 92, 16, ratio, col, Math.max(0, Math.ceil(G.youHp)) + ' / ' + G.youMaxHp);
    }

    // card hand
    function handTileRects() {
        const n = G.hand.length;
        if (n === 0) return [];
        const gap = 8, h = 54, y = 148;
        const w = Math.min(130, (W - 28 - gap * (n - 1)) / Math.max(n, 1));
        const x0 = (W - (w * n + gap * (n - 1))) / 2;
        return G.hand.map((id, i) => ({ i, id, x: x0 + i * (w + gap), y, w, h }));
    }
    function doneButtonRect() { return { x: W / 2 - 90, y: 210, w: 180, h: 36 }; }
    function drawMoreRect() { return { x: 16, y: 210, w: 108, h: 36 }; }
    function drawDrawButton() {
        if (!shell || !shell.isPlaying()) return;
        if (G.phase !== 'defense' && G.phase !== 'attack') return;
        if (G.cardPopup || G.transmute || G.held || G.resolving) return;
        const b = drawMoreRect(), f = getFont(), ok = canDrawMore();
        ctx.save();
        ctx.fillStyle = ok ? 'rgba(217,84,78,0.16)' : 'rgba(255,255,255,0.05)';
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = ok ? accent() : 'rgba(255,255,255,0.15)';
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.stroke();
        ctx.fillStyle = ok ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.font = `700 13px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdDraw') + ' (' + DUEL.drawCost + ')', b.x + b.w / 2, b.y + b.h / 2);
        ctx.restore();
    }
    function drawDoneButton() {
        if (!shell || !shell.isPlaying()) return;
        if (onlineWaiting()) return;
        const b = doneButtonRect(), f = getFont();
        ctx.save();
        ctx.fillStyle = accent();
        roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
        ctx.fillStyle = '#1a1526'; ctx.font = `800 15px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rdDone'), b.x + b.w / 2, b.y + b.h / 2);
        ctx.restore();
    }
    function drawHand() {
        if (!shell || !shell.isPlaying()) return;
        const f = getFont();
        // energy (left) + your active defenses (right)
        ctx.fillStyle = accent();
        ctx.font = `800 14px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('rdEnergy') + ' ' + G.energy + ' / ' + DUEL.energy, 22, 142);
        const defs = G.youShields.map((s) => shieldLabel(s));
        if (G.spinPenalty > 0) defs.push('-' + G.spinPenalty + 's');
        if (defs.length) { ctx.fillStyle = '#9fe0ff'; ctx.font = `700 13px ${f}`; ctx.textAlign = 'right'; ctx.fillText(defs.join(' · '), W - 22, 142); }
        for (const b of handTileRects()) {
            const c = CARDS[b.id];
            const ok = (G.phase === 'defense' || G.phase === 'attack') && cardPhaseOk(b.id) && G.energy >= c.cost && playable(b.id);
            ctx.save();
            ctx.fillStyle = ok ? 'rgba(217,84,78,0.16)' : 'rgba(255,255,255,0.05)';
            roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = ok ? accent() : 'rgba(255,255,255,0.15)';
            roundRect(b.x, b.y, b.w, b.h, 9); ctx.stroke();
            ctx.fillStyle = ok ? '#fff' : 'rgba(255,255,255,0.45)';
            ctx.font = `700 14px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t('rdCard_' + b.id), b.x + b.w / 2, b.y + b.h / 2 + 2);
            // cost chip
            ctx.fillStyle = ok ? accent() : 'rgba(255,255,255,0.3)';
            ctx.font = `800 12px ${f}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(String(c.cost), b.x + b.w - 8, b.y + 16);
            ctx.restore();
        }
    }
    function cardPopupLayout() {
        const cw = 400, ch = 230, cx = (W - cw) / 2, cy = BOARD_TOP + 60;
        const by = cy + ch - 58, bw = 170, bh = 44, gap = 14;
        return {
            card: { x: cx, y: cy, w: cw, h: ch },
            cast: { x: cx + cw / 2 - bw - gap / 2, y: by, w: bw, h: bh },
            discard: { x: cx + cw / 2 + gap / 2, y: by, w: bw, h: bh },
        };
    }
    function drawCardPopup() {
        const id = G.hand[G.cardPopup.i];
        if (!id) { G.cardPopup = null; return; }
        const c = CARDS[id];
        const f = getFont(), ac = accent();
        const ok = G.energy >= c.cost && playable(id) && cardPhaseOk(id);
        const L = cardPopupLayout(), card = L.card, cx = card.x + card.w / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.74)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = 'rgba(22,19,32,0.98)';
        roundRect(card.x, card.y, card.w, card.h, 14); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = ac;
        roundRect(card.x, card.y, card.w, card.h, 14); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff'; ctx.font = `800 22px ${f}`;
        ctx.fillText(t('rdCard_' + id), cx, card.y + 44);
        ctx.fillStyle = shade(ac, 0.3); ctx.font = `600 13px ${f}`;
        ctx.fillText(t('rdCost') + ': ' + c.cost + '  ·  ' + t('rdEnergy') + ' ' + G.energy, cx, card.y + 66);
        ctx.fillStyle = 'rgba(230,236,255,0.9)'; ctx.font = `500 15px ${f}`;
        let y = card.y + 100;
        for (const ln of wrapLines(t('rdCardd_' + id), card.w - 48)) { ctx.fillText(ln, cx, y); y += 23; }
        const bt = L.cast;
        ctx.fillStyle = ok ? ac : 'rgba(255,255,255,0.1)';
        roundRect(bt.x, bt.y, bt.w, bt.h, 10); ctx.fill();
        ctx.fillStyle = ok ? '#1a1526' : 'rgba(255,255,255,0.4)';
        ctx.font = `800 16px ${f}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        ctx.fillText(t('rdPlay'), bt.x + bt.w / 2, bt.y + bt.h / 2);
        const db = L.discard;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(db.x, db.y, db.w, db.h, 10); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        roundRect(db.x, db.y, db.w, db.h, 10); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(t('rdDiscard'), db.x + db.w / 2, db.y + db.h / 2);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `500 12px ${f}`;
        ctx.fillText(t('rtPopupHint'), cx, card.y + card.h - 12);
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
        markDirty();
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
        G.rng = AC.rng.make((((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0xffffff)) >>> 0);   // random board each run
        G.youHp = G.youMaxHp = DUEL.hp;
        G.aiHp = G.aiMaxHp = DUEL.hp;
        G.round = 1;
        G.aiTimer = 0;
        G.phaseTimer = 0;
        G.score = 0;
        G.cardPopup = null;
        G.transmute = null;
        G.empowerNext = 1;
        G.bonusTimeNext = 0;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.clearing = [];
        G.floats = [];
        G.shake = 0;
        G.youShields = [];
        G.spinPenalty = 0;
        G.aiSpinPenalty = 0;
        board = G.board = new Array(COLS * ROWS).fill(null);
        fillBoardNoMatches();
        dealStartingHand();
        startDefensePhase();
        if (shell) shell.refreshBest();
    }
    // =================================================================
    // Online lobby (Google / guest sign-in + room-code matchmaking)
    // Stage 1: auth + pairing. Per-round sync arrives next.
    // =================================================================

    let net = null;             // window.ArcadeNet once it's ready & ok
    let netUser = undefined;    // undefined = unknown, null = signed out, else {uid,name,...}
    let room = null;            // { code, data, unsub }
    let lobbyEl = null, lobbyRefs = null;
    let lobbyResult = '';       // "You win/lose" banner shown in the lobby after an online match

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function lbtn(label, cls) { const b = el('button', cls || 'btn', label); b.type = 'button'; return b; }
    function lrow() { const r = el('div', 'lobby-row'); for (const a of arguments) if (a) r.appendChild(a); return r; }

    function buildLobby() {
        const wrap = document.querySelector('.stage-wrap') || document.body;
        const ov = el('div', 'overlay');
        ov.id = 'lobby';
        ov.hidden = true;
        ov.addEventListener('pointerdown', (e) => e.stopPropagation());   // never fall through to the board
        const card = el('div', 'overlay-card');
        const title = el('h2', 'overlay-title');
        const auth = el('div', 'lobby-auth');
        const roomBox = el('div', 'lobby-room');
        const status = el('p', 'lobby-status');
        const close = lbtn('', 'btn');
        close.addEventListener('click', closeLobby);
        card.append(title, auth, roomBox, status, close);
        ov.appendChild(card);
        wrap.appendChild(ov);
        lobbyEl = ov;
        lobbyRefs = { title, auth, room: roomBox, status, close };
    }

    function opponentName(data) {
        if (!data || !data.players || !netUser) return null;
        for (const uid in data.players) if (uid !== netUser.uid) return data.players[uid].name || t('rdGuest');
        return null;
    }
    function detachRoom() { if (room && room.unsub) { try { room.unsub(); } catch (e) { /* ignore */ } } room = null; }
    function attachRoom(code) {
        detachRoom();
        lobbyResult = '';
        room = { code, data: null, unsub: null };
        room.unsub = net.watchRoom(code, (data, err) => {
            if (err) { showLobbyError(err); return; }
            if (room) room.data = data;
            renderLobby();
            onRoomGame(data);
        });
        renderLobby();
    }
    function showLobbyError(e) {
        const m = String((e && e.message) || e);
        let msg = t('rdNetErr');
        if (m.indexOf('not found') !== -1) msg = t('rdRoomNotFound');
        else if (m.indexOf('full') !== -1) msg = t('rdRoomFull');
        if (lobbyRefs) lobbyRefs.status.textContent = msg;
        console.warn('[lobby]', e);
    }
    async function doSignIn(kind) {
        try { if (kind === 'google') await net.signInGoogle(); else await net.signInGuest(); }
        catch (e) { showLobbyError(e); }
    }
    async function doCreate() { try { const code = await net.createRoom(seedCounter + 1000); attachRoom(code); } catch (e) { showLobbyError(e); } }
    async function doJoin(code) {
        code = String(code || '').trim().toUpperCase();
        if (!code) return;
        try { const c = await net.joinRoom(code); attachRoom(c); } catch (e) { showLobbyError(e); }
    }
    async function doLeave() { lobbyResult = ''; if (room) { const c = room.code; detachRoom(); try { await net.leaveRoom(c); } catch (e) { /* ignore */ } } renderLobby(); }

    function renderLobby() {
        if (!lobbyEl) return;
        lobbyRefs.title.textContent = lobbyResult || t('rdOnline');
        lobbyRefs.close.textContent = t('rdClose');
        const u = netUser;
        // auth
        const auth = lobbyRefs.auth; auth.innerHTML = '';
        if (!u) {
            const g = lbtn(t('rdSignInGoogle'), 'btn btn-primary'); g.onclick = () => doSignIn('google');
            const a = lbtn(t('rdSignInGuest'), 'btn'); a.onclick = () => doSignIn('guest');
            auth.appendChild(lrow(g, a));
        } else {
            const info = el('span', null, t('rdSignedIn', u.name || t('rdGuest')));
            const out = lbtn(t('rdSignOut'), 'btn'); out.onclick = () => { doLeave(); net.signOut(); };
            auth.appendChild(lrow(info, out));
        }
        // room
        const r = lobbyRefs.room; r.innerHTML = '';
        if (u && !(room && room.data)) {
            const create = lbtn(t('rdCreateRoom'), 'btn btn-primary'); create.onclick = doCreate;
            const input = el('input'); input.placeholder = t('rdRoomCode'); input.maxLength = 4;
            const join = lbtn(t('rdJoinRoom'), 'btn'); join.onclick = () => doJoin(input.value);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(input.value); });
            r.appendChild(lrow(create));
            r.appendChild(lrow(input, join));
        } else if (u && room && room.data && !opponentName(room.data)) {
            const leave = lbtn(t('rdLeaveRoom'), 'btn'); leave.onclick = doLeave;
            r.appendChild(lrow(leave));
        } else if (u && room && room.data && opponentName(room.data)) {
            if (room.data.hostUid === u.uid) { const start = lbtn(t('rdStartDuel'), 'btn btn-primary'); start.onclick = hostStartGame; r.appendChild(lrow(start)); }
            else { r.appendChild(lrow(el('span', null, t('rdWaitHost')))); }
            const leave = lbtn(t('rdLeaveRoom'), 'btn'); leave.onclick = doLeave;
            r.appendChild(lrow(leave));
        }
        // status
        let s = '';
        if (!u) s = t('rdSignInFirst');
        else if (room && room.data) { const opp = opponentName(room.data); s = opp ? t('rdMatched', opp) : t('rdRoomCreated', room.code); }
        lobbyRefs.status.textContent = s;
    }
    function openLobby() { if (!net || !net.ok) return; if (!lobbyEl) buildLobby(); lobbyEl.hidden = false; renderLobby(); markDirty(); if (net.cleanupStaleRooms) net.cleanupStaleRooms().catch(() => {}); }
    function closeLobby() { if (lobbyEl) lobbyEl.hidden = true; markDirty(); }

    function setupOnline() {
        const onReady = () => {
            const N = window.ArcadeNet;
            const btn = document.getElementById('online-btn');
            if (!N || !N.ok) { if (btn) btn.hidden = true; return; }
            net = N;
            buildLobby();
            net.onAuth((u) => { netUser = u; renderLobby(); });
            if (net.cleanupStaleRooms) net.cleanupStaleRooms().catch(() => {});   // purge abandoned rooms on load
            if (btn) { btn.hidden = false; btn.addEventListener('click', openLobby); }
        };
        if (window.ArcadeNet) onReady();
        else window.addEventListener('arcade-net-ready', onReady, { once: true });
    }

    function init() {
        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); markDirty(); render(); });
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
            canPause: () => !G.online,     // no pausing during online PvP
            canRestart: () => !G.online,   // no restart during online PvP
        });
        document.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', () => { if (G.held && !G.held.moved) G.held = null; else if (G.held) startResolve(); });
        AC.i18n.subscribe(() => { markDirty(); updateHud(); if (lobbyEl && !lobbyEl.hidden) renderLobby(); });
        setupOnline();
        setInterval(onlineWatchdog, 1000);
        setInterval(heartbeatAndGc, 30000);
        window.addEventListener('pagehide', () => {
            if (!(G.online && room && room.code)) return;
            try {
                if (G.online.host) net.deleteRoom(room.code);                                                   // host leaves → room gone
                else net.updateRoom(room.code, { 'game.status': 'over', 'game.winner': G.online.oppUid });        // guest leaves → host wins
            } catch (e) { /* ignore */ }
        });
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
            'you ' + Math.ceil(G.youHp) + '/' + G.youMaxHp + '  energy ' + G.energy,
            'rival ' + Math.max(0, Math.ceil(G.aiHp)) + '/' + G.aiMaxHp,
            'shields ' + (G.aiShields.map((s) => s.type).join(',') || 'none'),
            'hand ' + G.hand.join(',') + '  dealt ' + G.score,
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
            energy(n) { G.energy = n | 0; return G.energy; },
            hand() { return G.hand; },
            shields(k) { const kk = k | 0; G.aiShields = []; for (let i = 0; i < kk; i++) G.aiShields.push(oneShield(G.round)); return G.aiShields; },
            play(i) { playCard(i | 0); return G.hand; },
            info() { return { round: G.round, phase: G.phase, you: G.youHp, rival: G.aiHp, energy: G.energy, hand: G.hand, youShields: G.youShields, spinPenalty: G.spinPenalty, shields: G.aiShields, dealt: G.score }; },
        };
        console.log('%c[Rune Duel] debug on', 'color:#d9544e;font-weight:700');
        console.log('RD.kill() hp(n) energy(n) hand() shields(k) play(i) info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
