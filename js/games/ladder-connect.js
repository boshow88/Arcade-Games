/**
 * Ladder Connect — a real-time "ghost leg" (amidakuji).
 *
 * Colour-coded balls fall down a ladder of vertical lanes. The player
 * draws and removes horizontal rungs on the fly; a ball crossing a rung
 * swaps to the neighbouring lane. Land each ball in the basket of its
 * own colour to score; a wrong basket costs a life. Lives at zero ends
 * the run.
 *
 * Difficulty is a named preset (easy / normal / hard). Each preset owns
 * a set of lane/colour layouts (one picked at random per run), the row
 * count, base fall speed, lives, and a rising "field-complexity" cap
 * that drives spawning. Spawning is soft: the fuller the board, the
 * less likely a new wave — so it self-balances to how fast you clear.
 *
 * Built on window.ArcadeCommon (shell / loop / input / audio / i18n /
 * scores). Rendering is Canvas 2D at a fixed 600×760 portrait space.
 * All balance lives in CONFIG + DIFFICULTIES at the top.
 *
 * Step 1 scope: single-colour balls, multi-ball waves, no rung limit.
 * (Dual-colour balls and high-speed waves come next; the hooks are
 * stubbed with b.dual / b.fast so they slot in cleanly.)
 */
(function () {
    'use strict';

    const AC = window.ArcadeCommon;
    const PI2 = Math.PI * 2;

    // [DEBUG-HOOK] Dev affordances, enabled with ?debug=1 (see docs/DEV.md).
    const PARAMS = new URLSearchParams(location.search);
    const DEBUG = PARAMS.has('debug');
    const START_T = Math.max(0, parseFloat(PARAMS.get('t')) || 0);

    // =================================================================
    // i18n
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        lcEasy: 'Easy',
        lcNormal: 'Normal',
        lcHard: 'Hard',
        lcReady: 'Ready',
        lcIntro: 'Colour-coded balls fall down the ladder. Drag between two neighbouring dots to draw a rung that swaps a ball sideways; tap a rung to remove it. Land each ball in its matching-colour basket.',
        lcStartHintHtml: 'Drag to draw a rung · tap a rung to remove · <kbd>P</kbd> pause',
        lcOverMsgHtml: (score) => `You scored <strong>${score}</strong>.`,
        lcOverHintHtml: 'Press <kbd>R</kbd> or the button to play again.',
        lcHelp1Html: 'Coloured balls fall down the <strong>lanes</strong>. Steer each one into the basket of the same colour at the bottom.',
        lcHelp2Html: 'Drag from a dot to a neighbouring dot on the same row to <strong>draw a rung</strong>. A ball crossing a rung swaps to the next lane.',
        lcHelp3Html: 'Tap a rung you drew to <strong>remove</strong> it. Draw as many as you like — there\u2019s no limit.',
        lcHelp4Html: 'Match the colour to score; a wrong basket costs a <strong>life</strong>. Pick a <strong>difficulty</strong> above.',
        lcHelp5Html: 'It speeds up and gets busier over time. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
    });

    Object.assign(AC.i18n.STRINGS.zh, {
        lcEasy: '簡單',
        lcNormal: '普通',
        lcHard: '困難',
        lcReady: '準備開始',
        lcIntro: '彩色球會沿著直線往下掉。在相鄰兩點之間拖曳可畫出一條橫線，讓球換到隔壁線；點一下橫線可移除。把每顆球導進同色的籃子。',
        lcStartHintHtml: '拖曳畫橫線 · 點橫線移除 · <kbd>P</kbd> 暫停',
        lcOverMsgHtml: (score) => `你得了 <strong>${score}</strong> 分。`,
        lcOverHintHtml: '按 <kbd>R</kbd> 或按鈕再玩一次。',
        lcHelp1Html: '彩色球沿著<strong>直線</strong>往下掉。把每顆導進底部同色的籃子。',
        lcHelp2Html: '在同一排、相鄰兩點之間拖曳可<strong>畫出橫線</strong>。球碰到橫線會換到隔壁線。',
        lcHelp3Html: '點一下自己畫的橫線可<strong>移除</strong>。想畫幾條都行，沒有上限。',
        lcHelp4Html: '顏色配對正確會得分；進錯籃子會扣一條<strong>命</strong>。上方可選<strong>難度</strong>。',
        lcHelp5Html: '隨時間會越來越快、越來越忙。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
    });

    // =================================================================
    // CONFIG — shared tuning
    // =================================================================

    const CONFIG = {
        ballRadius: 15,
        basketGapRatio: 2.5,    // basket width : gap — kept constant across lane counts
        reachMaxLanes: 3,       // soft: a ball's matching basket is within N lanes of its spawn
        fallMult: 1.75,         // fall speed asymptotes toward base × mult …
        fallTau: 90,            // … at this log pace
        laneSlowPerLane: 5,     // px/s slower per lane beyond 4 (wider board → gentler)
        waveMaxBalls: 3,        // cap balls in a single wave
        spawn: { rate: 0.75, pow: 1.5, minGap: 0.45 }, // soft spawn: rate × headroom^pow
        scorePerCorrect: 100,
    };

    // Difficulty presets. `combos` = layouts (one chosen at random per run).
    // `dual` on a combo marks layouts allowed to use dual-colour balls (a
    // later step). `field` is the rising on-board complexity cap that drives
    // spawning. Single-colour ball = complexity 1 (dual = 2, fast = +1).
    const DIFFICULTIES = {
        easy: {
            combos: [{ lanes: 3, colors: 3 }, { lanes: 4, colors: 2 }],
            rows: 9, lives: 5, fallBase: 70,
            field: { base: 1, cap: 2, tau: 120 },
            dual: { enabled: false }, fast: { enabled: false },
        },
        normal: {
            combos: [{ lanes: 4, colors: 4, dual: true }, { lanes: 5, colors: 5, dual: true }, { lanes: 6, colors: 3 }],
            rows: 11, lives: 5, fallBase: 72,
            field: { base: 2, cap: 5, tau: 110 },
            dual: { enabled: true }, fast: { enabled: true },
        },
        hard: {
            combos: [{ lanes: 5, colors: 5, dual: true }, { lanes: 6, colors: 6, dual: true }, { lanes: 7, colors: 7, dual: true }],
            rows: 12, lives: 4, fallBase: 76,
            field: { base: 2, cap: 6, tau: 100 },
            dual: { enabled: true }, fast: { enabled: true },
        },
    };
    const DIFF_ORDER = ['easy', 'normal', 'hard'];

    // Fixed, well-separated colour sets chosen by colour count (not a random
    // subset), so a given layout always uses easy-to-tell-apart colours.
    const COLOR_SETS = {
        2: ['#ff5d6c', '#4aa3ff'],
        3: ['#ff5d6c', '#46d07f', '#4aa3ff'],
        4: ['#ff5d6c', '#ffcf3f', '#46d07f', '#4aa3ff'],
        5: ['#ff5d6c', '#ffcf3f', '#46d07f', '#4aa3ff', '#b57bff'],
        6: ['#ff5d6c', '#ff9f45', '#ffcf3f', '#46d07f', '#4aa3ff', '#b57bff'],
        7: ['#ff5d6c', '#ff9f45', '#ffcf3f', '#46d07f', '#4aa3ff', '#b57bff', '#ff78c8'],
    };

    // =================================================================
    // Geometry (fixed logical space; lane/row counts vary per run)
    // =================================================================

    const W = 600, H = 760;
    const TOP_SPAWN_Y = 46;
    const POINT_TOP = 140;
    const POINT_BOTTOM = 584;
    const DELIVER_Y = 648;
    const LANE_TOP = POINT_TOP - 24;
    const BASKET_TOP = 656;
    const BASKET_BOTTOM = 742;

    let LANE_X = [], ROW_Y = [], LANE_SP = 0, ROW_SP = 0, BASKET_W = 0;
    // The width splits as gap / basket / gap / basket / … / gap, keeping the
    // basket-width : gap ratio the SAME for every lane count (more lanes just
    // scale everything down). Lanes sit on the basket centres.
    function computeLayout(lanes, rows) {
        const R = CONFIG.basketGapRatio;
        const gap = W / (lanes * R + lanes + 1);         // N baskets (= R·gap) + (N+1) gaps = W
        BASKET_W = R * gap;
        LANE_SP = gap + BASKET_W;
        LANE_X = Array.from({ length: lanes }, (_, i) => gap + BASKET_W / 2 + i * LANE_SP);
        ROW_SP = (POINT_BOTTOM - POINT_TOP) / (rows - 1);
        ROW_Y = Array.from({ length: rows }, (_, i) => POINT_TOP + i * ROW_SP);
    }

    // =================================================================
    // DOM + canvas
    // =================================================================

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        score: document.getElementById('score'),
        lives: document.getElementById('lives'),
        time: document.getElementById('time'),
        diffSeg: document.getElementById('difficulty-seg'),
    };
    const livesStat = dom.lives.closest('.hud-stat');

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // =================================================================
    // State
    // =================================================================

    const G = {
        difficulty: 'easy',
        diffCfg: null,
        lanes: 4, colors: 2, rows: 11, allowDual: false,
        effFallBase: 70,
        score: 0, lives: 0, elapsed: 0,
        balls: [], floaters: [],
        side: [],            // [row][lane]: +1 left-endpoint (go right), -1 right-endpoint, 0 none
        rungs: [],           // { row, lane }
        basketColor: [],
        spawnAccum: 0,
        lastWaveT: 0,
        shake: 0,
        ended: false,
        rng: AC.rng.make(1),
    };

    let shell = null;
    let seedCounter = (Date.now() >>> 0);
    let staged = 'easy';   // difficulty picked in the toolbar; applied on next run (Puzzle-style)

    // =================================================================
    // Difficulty ramp (log-paced, asymptotic — never actually reached)
    // =================================================================

    function timePressure(tauSec) {
        const l = Math.log(1 + G.elapsed / tauSec);
        return l / (1 + l);
    }
    function fallSpeed() {
        return G.effFallBase * (1 + (CONFIG.fallMult - 1) * timePressure(CONFIG.fallTau));
    }
    function maxField() {
        const f = G.diffCfg.field;
        return f.base + (f.cap - f.base) * timePressure(f.tau);
    }

    // =================================================================
    // Rungs (no budget — unlimited)
    // =================================================================

    function emptyGrid(rows, lanes) {
        return Array.from({ length: rows }, () => new Array(lanes).fill(0));
    }
    function canPlace(row, lane) {
        return lane >= 0 && lane < G.lanes - 1
            && G.side[row][lane] === 0 && G.side[row][lane + 1] === 0;
    }
    function addRung(row, lane) {
        if (!canPlace(row, lane)) return false;
        G.side[row][lane] = 1;
        G.side[row][lane + 1] = -1;
        G.rungs.push({ row, lane });
        return true;
    }
    function removeRungAt(row, lane) {
        const idx = G.rungs.findIndex((r) => r.row === row && r.lane === lane);
        if (idx < 0) return false;
        G.side[row][lane] = 0;
        G.side[row][lane + 1] = 0;
        G.rungs.splice(idx, 1);
        return true;
    }

    // =================================================================
    // Baskets + colours
    // =================================================================

    function makeBaskets(lanes, colorsCount) {
        const set = COLOR_SETS[colorsCount] || COLOR_SETS[4];
        const arr = [];
        for (let i = 0; i < lanes; i++) arr.push(set[i % set.length]);
        return AC.rng.shuffle(arr, G.rng); // fixed colours, random lane placement
    }

    // A colour whose matching basket is within reachMaxLanes of `lane`.
    function pickColorForLane(lane) {
        const N = CONFIG.reachMaxLanes;
        const near = [];
        for (let j = Math.max(0, lane - N); j <= Math.min(G.lanes - 1, lane + N); j++) {
            near.push(G.basketColor[j]);
        }
        const uniq = [...new Set(near)];
        return AC.rng.one(G.rng, uniq.length ? uniq : G.basketColor);
    }

    // =================================================================
    // Balls + waves (soft complexity-based spawning)
    // =================================================================

    function ballComplexity(b) { return 1 + (b.dual ? 1 : 0) + (b.fast ? 1 : 0); }

    function fieldComplexity() {
        let c = 0;
        for (const b of G.balls) if (!b.delivered) c += ballComplexity(b);
        return c;
    }
    function headroom() {
        const m = maxField();
        return AC.math.clamp((m - fieldComplexity()) / m, 0, 1);
    }

    function spawnWave() {
        const remaining = maxField() - fieldComplexity();
        const cap = Math.min(G.lanes, CONFIG.waveMaxBalls);
        const count = AC.math.clamp(Math.round(remaining), 1, cap);
        const lanesShuffled = AC.rng.shuffle(
            Array.from({ length: G.lanes }, (_, i) => i), G.rng);
        for (let i = 0; i < count; i++) {
            const lane = lanesShuffled[i];
            const color = pickColorForLane(lane);
            G.balls.push({
                x: LANE_X[lane], y: TOP_SPAWN_Y, lane, color,
                dual: false, fast: false, nextRow: 0, delivered: false,
            });
        }
    }

    function deliver(b) {
        const lane = b.lane;
        const base = G.basketColor[lane];
        const ok = b.dual ? (base === b.color || base === b.color2) : (base === b.color);
        if (ok) {
            G.score += CONFIG.scorePerCorrect;
            spawnFloater(LANE_X[lane], DELIVER_Y - 12, '+' + AC.format.score(CONFIG.scorePerCorrect), b.color);
            flashScore();
            AC.audio.play('coin');
        } else {
            G.lives--;
            G.shake = Math.max(G.shake, 0.45);
            spawnFloater(LANE_X[lane], DELIVER_Y - 12, '\u2715', '#ff5470');
            AC.audio.play('rock');
            if (G.lives <= 0) { endRun(); return; }
        }
    }

    function endRun() {
        if (G.ended) return;
        G.ended = true;
        shell.gameOver({ score: G.score, win: false, meta: { seconds: G.elapsed } });
    }

    // =================================================================
    // Update
    // =================================================================

    function update(dt) {
        if (G.ended) return;
        G.elapsed += dt;
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
        updateFloaters(dt);

        // Soft spawn: accumulate at a rate that falls as the board fills.
        G.spawnAccum += dt * CONFIG.spawn.rate * Math.pow(headroom(), CONFIG.spawn.pow);
        if (G.spawnAccum >= 1 && (G.elapsed - G.lastWaveT) >= CONFIG.spawn.minGap) {
            spawnWave();
            G.spawnAccum = 0;
            G.lastWaveT = G.elapsed;
        }

        const v = fallSpeed();
        for (const b of G.balls) {
            b.y += v * dt;
            while (b.nextRow < G.rows && b.y >= ROW_Y[b.nextRow]) {
                const s = G.side[b.nextRow][b.lane];
                if (s > 0) b.lane++;
                else if (s < 0) b.lane--;
                b.nextRow++;
            }
            b.x += (LANE_X[b.lane] - b.x) * Math.min(1, dt * 14);
            if (b.y >= DELIVER_Y) { deliver(b); b.delivered = true; }
            if (G.ended) break;
        }
        G.balls = G.balls.filter((b) => !b.delivered);
        updateHud();
    }

    // =================================================================
    // Floaters (+score popups)
    // =================================================================

    function spawnFloater(x, y, text, color) {
        G.floaters.push({ x, y, vy: -46, text, color: color || '#ffe08a', life: 1.0, maxLife: 1.0 });
    }
    function updateFloaters(dt) {
        const fs = G.floaters;
        for (let i = fs.length - 1; i >= 0; i--) {
            const f = fs[i];
            f.life -= dt;
            if (f.life <= 0) { fs.splice(i, 1); continue; }
            f.y += f.vy * dt;
            f.vy += 36 * dt;
        }
    }

    // =================================================================
    // HUD + difficulty selector
    // =================================================================

    function flashScore() {
        dom.score.classList.remove('flash');
        void dom.score.offsetWidth;
        dom.score.classList.add('flash');
    }
    function updateHud() {
        dom.score.textContent = AC.format.score(G.score);
        dom.lives.textContent = String(Math.max(0, G.lives));
        dom.time.textContent = AC.format.clock(G.elapsed, true);
        livesStat.classList.toggle('danger', G.lives <= 1);
    }
    function syncDiffButtons() {
        if (!dom.diffSeg) return;
        for (const b of dom.diffSeg.querySelectorAll('button[data-diff]')) {
            const d = b.dataset.diff;
            // active = staged selection; committed = what the current run uses
            // (tinted only when it differs from the staged pick).
            b.classList.toggle('active', d === staged);
            b.classList.toggle('committed', d === G.difficulty && G.difficulty !== staged);
            b.setAttribute('aria-checked', d === staged ? 'true' : 'false');
        }
    }
    // Picking a difficulty only *stages* it; it applies on the next run
    // (Restart, or Start / Play again from the overlay) — like Puzzle Games.
    function setDifficulty(d) {
        if (!DIFFICULTIES[d] || d === staged) return;
        staged = d;
        AC.prefs.set('ladder-connect', { difficulty: d });
        syncDiffButtons();
    }

    // =================================================================
    // Rendering
    // =================================================================

    function render() {
        const t = performance.now() / 1000;
        ctx.save();
        if (G.shake > 0) {
            const s = G.shake * 9;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        drawBackground();
        drawLanes();
        drawRungs();
        drawPreview();
        drawBaskets();
        drawBalls();
        drawFloaters();
        ctx.restore();
        if (DEBUG) drawDebugOverlay(); // [DEBUG-HOOK]
    }

    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#15122a');
        g.addColorStop(1, '#0c0a1a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    function drawLanes() {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 3;
        for (let i = 0; i < G.lanes; i++) {
            ctx.beginPath();
            ctx.moveTo(LANE_X[i], LANE_TOP);
            ctx.lineTo(LANE_X[i], DELIVER_Y);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (let r = 0; r < G.rows; r++) {
            for (let i = 0; i < G.lanes; i++) {
                ctx.beginPath();
                ctx.arc(LANE_X[i], ROW_Y[r], 3, 0, PI2);
                ctx.fill();
            }
        }
    }

    function drawRung(row, lane, color, glow) {
        const y = ROW_Y[row], x0 = LANE_X[lane], x1 = LANE_X[lane + 1];
        ctx.save();
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x0, y, 6, 0, PI2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y, 6, 0, PI2); ctx.fill();
    }

    const RUNG_COLOR = '#aab0bd'; // neutral grey — balls carry the colour
    function drawRungs() {
        for (const r of G.rungs) drawRung(r.row, r.lane, RUNG_COLOR, false);
    }

    function drawPreview() {
        if (!drag || !drag.preview) return;
        const { row, lane } = drag.preview;
        const y = ROW_Y[row], x0 = LANE_X[lane], x1 = LANE_X[lane + 1];
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([7, 6]);
        ctx.strokeStyle = '#c3c8d2';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.restore();
    }

    function drawBaskets() {
        const w = BASKET_W, h = BASKET_BOTTOM - BASKET_TOP;
        for (let i = 0; i < G.lanes; i++) {
            const x = LANE_X[i], col = G.basketColor[i];
            roundRect(x - w / 2, BASKET_TOP, w, h, 9);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(x - w / 2, BASKET_TOP, w, 7);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 2;
            roundRect(x - w / 2, BASKET_TOP, w, h, 9);
            ctx.stroke();
        }
    }

    function drawBall(b) {
        const r = CONFIG.ballRadius;
        ctx.save();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        if (b.dual) {
            // Left half b.color, right half b.color2 (future).
            ctx.beginPath(); ctx.arc(b.x, b.y, r, Math.PI / 2, Math.PI * 1.5); ctx.fillStyle = b.color; ctx.fill();
            ctx.beginPath(); ctx.arc(b.x, b.y, r, -Math.PI / 2, Math.PI / 2); ctx.fillStyle = b.color2; ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, PI2); ctx.fillStyle = b.color; ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(b.x - r * 0.32, b.y - r * 0.32, r * 0.3, 0, PI2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, PI2);
        ctx.stroke();
    }
    function drawBalls() { for (const b of G.balls) drawBall(b); }

    function drawFloaters() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 22px ${getFont()}`;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        for (const f of G.floaters) {
            ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
            ctx.strokeStyle = 'rgba(10,8,20,0.85)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    let fontCache = null;
    function getFont() {
        if (!fontCache) {
            fontCache = getComputedStyle(document.body).getPropertyValue('--font-display')
                || '"Segoe UI", system-ui, sans-serif';
        }
        return fontCache;
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

    // =================================================================
    // Input — draw / remove rungs
    // =================================================================

    let drag = null;

    function toLogical(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }
    function nearestPoint(x, y) {
        const lane = Math.round((x - LANE_X[0]) / LANE_SP);
        const row = Math.round((y - POINT_TOP) / ROW_SP);
        if (lane < 0 || lane >= G.lanes || row < 0 || row >= G.rows) return null;
        if (Math.abs(x - LANE_X[lane]) > LANE_SP * 0.5) return null;
        if (Math.abs(y - ROW_Y[row]) > ROW_SP * 0.6) return null;
        return { row, lane };
    }
    function rungAt(x, y) {
        for (const r of G.rungs) {
            if (Math.abs(y - ROW_Y[r.row]) > ROW_SP * 0.42) continue;
            if (x >= LANE_X[r.lane] - 8 && x <= LANE_X[r.lane + 1] + 8) return r;
        }
        return null;
    }

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        e.preventDefault();
        const p = toLogical(e);
        const pt = nearestPoint(p.x, p.y);
        drag = {
            startX: p.x, startY: p.y, moved: false,
            from: (pt && G.side[pt.row][pt.lane] === 0) ? pt : null,
            removeCand: rungAt(p.x, p.y),
            preview: null,
        };
    }
    function onPointerMove(e) {
        if (!drag) return;
        const p = toLogical(e);
        if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 6) drag.moved = true;
        if (drag.from) {
            const row = drag.from.row, lane = drag.from.lane;
            const dx = p.x - LANE_X[lane];
            let prev = null;
            if (dx > LANE_SP * 0.33 && canPlace(row, lane)) prev = { row, lane };
            else if (dx < -LANE_SP * 0.33 && canPlace(row, lane - 1)) prev = { row, lane: lane - 1 };
            drag.preview = prev;
        }
    }
    function onPointerUp() {
        if (!drag) return;
        if (drag.from && drag.preview) {
            addRung(drag.preview.row, drag.preview.lane);
            AC.audio.play('grab');
        } else if (drag.removeCand && !drag.moved) {
            removeRungAt(drag.removeCand.row, drag.removeCand.lane);
            AC.audio.play('click');
        }
        drag = null;
    }

    // =================================================================
    // Overlay
    // =================================================================

    function overlayContent(state, result) {
        if (state === 'idle') {
            return {
                badge: 'ladder',
                title: AC.i18n.t('lcReady'),
                message: AC.i18n.t('lcIntro'),
                button: AC.i18n.t('play'),
                hint: AC.i18n.t('lcStartHintHtml'),
            };
        }
        if (state === 'over') {
            const score = AC.format.score(result ? result.score : G.score);
            let msg = AC.i18n.t('lcOverMsgHtml', score);
            if (result && result.isNewBest) msg += ` <strong>${AC.i18n.t('newBest')}</strong>`;
            return {
                badge: 'trophy',
                title: AC.i18n.t('gameOver'),
                message: msg,
                button: AC.i18n.t('restart'),
                hint: AC.i18n.t('lcOverHintHtml'),
            };
        }
        return {};
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.difficulty = staged;        // commit the staged difficulty for this run
        G.diffCfg = DIFFICULTIES[G.difficulty];
        const combo = AC.rng.one(G.rng, G.diffCfg.combos);
        G.lanes = combo.lanes;
        G.colors = combo.colors;
        G.allowDual = !!combo.dual && G.diffCfg.dual.enabled; // used in a later step
        G.rows = G.diffCfg.rows;
        G.lives = G.diffCfg.lives;
        G.effFallBase = G.diffCfg.fallBase - Math.max(0, G.lanes - 4) * CONFIG.laneSlowPerLane;

        computeLayout(G.lanes, G.rows);
        G.basketColor = makeBaskets(G.lanes, G.colors);
        G.side = emptyGrid(G.rows, G.lanes);
        G.rungs = [];
        G.balls = [];
        G.floaters.length = 0;
        G.score = 0;
        G.elapsed = START_T;   // [DEBUG-HOOK] ?t=<sec> jumps the difficulty clock
        G.spawnAccum = 0.5;    // first wave soon, not instant
        G.lastWaveT = START_T;
        G.shake = 0;
        G.ended = false;
        drag = null;
        updateHud();
        if (shell) shell.refreshBest();  // Best now reflects the committed difficulty
        syncDiffButtons();               // committed == staged again
    }

    function init() {
        // Difficulty from prefs (default easy).
        const pref = AC.prefs.get('ladder-connect');
        staged = DIFFICULTIES[pref.difficulty] ? pref.difficulty : 'easy';
        G.difficulty = staged;

        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'ladder-connect',
            mode: () => G.difficulty,   // high scores are per-difficulty
            step: 1 / 60,
            preventKeys: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            update,
            render,
            reset: resetRun,
            overlayContent,
        });

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', () => { drag = null; });

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
    // [DEBUG-HOOK] window.LC console API + overlay + keys (?debug=1 only)
    // =================================================================

    function drawDebugOverlay() {
        const lines = [
            'DEBUG  [' + G.difficulty + ']',
            't = ' + G.elapsed.toFixed(0) + 's',
            'layout = ' + G.lanes + 'x' + G.colors,
            'fall = ' + fallSpeed().toFixed(0),
            'field = ' + fieldComplexity().toFixed(1) + ' / ' + maxField().toFixed(1),
            'balls = ' + G.balls.length,
        ];
        ctx.save();
        ctx.font = `600 13px ${getFont()}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let w = 0;
        for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
        const bw = w + 14, bh = lines.length * 17 + 10;
        const bx = W - bw - 12, by = 12;
        ctx.fillStyle = 'rgba(10,8,20,0.72)';
        roundRect(bx, by, bw, bh, 8); ctx.fill();
        ctx.fillStyle = '#8fe36b';
        let y = by + 6;
        for (const l of lines) { ctx.fillText(l, bx + 7, y); y += 17; }
        ctx.restore();
    }

    function setupDebug() {
        window.LC = {
            setTime(sec) { G.elapsed = Math.max(0, sec || 0); return G.elapsed; },
            addTime(sec) { G.elapsed = Math.max(0, G.elapsed + (sec == null ? 30 : sec)); return G.elapsed; },
            addLife(n) { G.lives += (n == null ? 1 : n); updateHud(); return G.lives; },
            diff(d) { setDifficulty(d); return G.difficulty; },
            info() {
                return {
                    difficulty: G.difficulty, layout: G.lanes + 'x' + G.colors, rows: G.rows,
                    t: +G.elapsed.toFixed(1), score: G.score, lives: G.lives,
                    balls: G.balls.length, field: +fieldComplexity().toFixed(1),
                    maxField: +maxField().toFixed(1), fall: +fallSpeed().toFixed(0),
                };
            },
        };
        shell.keyboard.onPress((k) => {
            if (k === ']') window.LC.addTime(30);
            else if (k === '[') window.LC.addTime(-30);
            else if (k === 'l' || k === 'L') window.LC.addLife(1);
        });
        console.log('%c[Ladder Connect] debug on', 'color:#5ad0e0;font-weight:700');
        console.log('LC.setTime(s) addTime(s) addLife(n) diff("easy"|"normal"|"hard") info()');
        console.log('keys:  ] +30s   [ -30s   L +life');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
