/**
 * Dot Dodge — an omnidirectional bullet-dodge survival.
 *
 * Dots stream in from every edge of the field. Most fly in a straight line;
 * some (marked with an arrow) HOME in on you for a while, then commit to a
 * straight line and fly off. You have a few lives; your score is how long you last.
 *
 * Control is RELATIVE: press anywhere and drag, and your dot moves by the
 * pointer's *motion* (not to the pointer). Lift and press again to re-anchor,
 * so you can steer a dot in a far corner from a comfortable spot. There is no
 * speed cap — the dot tracks your drag 1:1, so dodging is pure skill.
 *
 * Difficulty (easy / normal / hard) changes lives, the spawn rate, bullet speed,
 * how many home, and bullet size. Both the spawn rate and bullet speed rise
 * over time on an unbounded, ever-gentler log curve (base + k·ln(1 + t/tau)),
 * so a run always escalates but never has a sudden cliff.
 *
 * Bullets are TYPE-DRIVEN: each has a `kind` with its own motion + look, so new
 * kinds (curving shots, lasers, …) can be added for late game / hard mode by
 * extending spawnBullet / updateBulletKind / drawBullet — see those functions.
 *
 * Built on window.ArcadeCommon (shell / loop / input / audio / i18n / scores /
 * rng / math / format). Rendering is Canvas 2D at a fixed 600×760 portrait space.
 * All balance lives in CONFIG + DIFFICULTIES at the top.
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
    // i18n (gameplay strings; launcher card strings live in common.js)
    // =================================================================

    Object.assign(AC.i18n.STRINGS.en, {
        ddEasy: 'Easy',
        ddNormal: 'Normal',
        ddHard: 'Hard',
        ddReady: 'Ready',
        ddIntro: 'Fly your dot through the crossfire and survive. Hold anywhere and drag — you move the pointer, not the dot.',
        ddStartHintHtml: 'Hold anywhere and drag to move · <kbd>P</kbd> pause',
        ddOverMsgHtml: (s) => `You survived <strong>${s}</strong> s.`,
        ddOverHintHtml: 'Press <kbd>R</kbd> or the button to try again.',
        ddHelp1Html: 'Dots stream in from <strong>every edge</strong>. Weave through them \u2014 your <strong>score is your survival time</strong>.',
        ddHelp2Html: 'Hold <strong>anywhere</strong> and drag: the dot moves with the pointer\u2019s <strong>motion</strong>, not to it. Lift and press again to <strong>re-anchor</strong>, so you can steer from a comfy spot.',
        ddHelp3Html: 'Most shots fly <strong>straight</strong>; ones marked with an <strong>arrow</strong> <strong>track you</strong> for a while, then straighten and fly off. A bullet\u2019s hitbox is exactly its <strong>circle</strong>.',
        ddHelp4Html: 'You have a few <strong>lives</strong> \u2014 a hit costs one and briefly makes you <strong>invincible</strong>; at zero the run ends. <kbd>P</kbd> pause \u00b7 <kbd>R</kbd> restart \u00b7 <kbd>M</kbd> mute.',
    });
    Object.assign(AC.i18n.STRINGS.zh, {
        ddEasy: '簡單',
        ddNormal: '普通',
        ddHard: '困難',
        ddReady: '準備好了',
        ddIntro: '操控你的主角，在四面八方的彈幕中求生。在任意處按住拖曳——你移動的是指標，不是主角。',
        ddStartHintHtml: '在任意處按住拖曳移動 · <kbd>P</kbd> 暫停',
        ddOverMsgHtml: (s) => `你撐了 <strong>${s}</strong> 秒。`,
        ddOverHintHtml: '按 <kbd>R</kbd> 或按鈕再玩一次。',
        ddHelp1Html: '點點從<strong>四面八方</strong>湧入。穿梭閃避——<strong>分數就是你的存活時間</strong>。',
        ddHelp2Html: '在<strong>任意處</strong>按住拖曳：主角跟著指標的<strong>移動量</strong>走，而不是跳到指標位置。放開再按可<strong>重新定錨</strong>，讓你在舒服的位置操控。',
        ddHelp3Html: '多數子彈<strong>直線</strong>飛行；<strong>帶箭頭</strong>的會<strong>追蹤你</strong>一段時間，之後轉成直線飛離。子彈的判定範圍就是它的<strong>圓形</strong>本體。',
        ddHelp4Html: '你有數條<strong>生命</strong>——被擊中會扣一條並短暫<strong>無敵</strong>；歸零就結束。<kbd>P</kbd> 暫停 \u00b7 <kbd>R</kbd> 重新開始 \u00b7 <kbd>M</kbd> 靜音。',
    });

    // =================================================================
    // Config + difficulty
    // =================================================================

    const W = 600, H = 760;

    const CONFIG = {
        playerRadius: 8,
        playerMaxSpeed: 0,      // px/s cap on the dot's speed; 0 = unlimited (pure 1:1 control)
        invulnSec: 1.2,         // brief invulnerability after a hit (one cluster ≠ instant wipe)
        spawnMargin: 26,        // bullets appear this far outside the field edge
        spawnOverscan: 0.4,     // spawn point runs this × past each corner, so shots can
                                // enter diagonally and coverage stays even (no calm corners)
        straightSpread: 0.62,   // max angle (rad) a straight shot deviates from straight-in
        homingTurnRate: 1.6,    // rad/s — max steering of a homing bullet (lower = easier to shake)
        homingTime: 5.0,        // sec it tracks before committing to a straight line (so it always leaves)
        homingSpeedMul: 0.9,    // homing bullets fly this × normal speed (a touch slower = fairer)
        speedVariance: 0.15,    // ± fraction applied to each bullet's speed
        tau: 25,                // difficulty "drift": larger = gentler early ramp
        countdownSec: 3,        // "get ready" countdown before a run starts
    };

    // Per-difficulty balance. lives = hits you can take (each grants brief
    // invulnerability). rate = bullets/sec, speed = px/sec, each a log curve
    // base + k·ln(1 + t/tau). homing = fraction of shots that track you.
    // bulletR = [min, max] radius (hard = smaller, harder to spot).
    const DIFFICULTIES = {
        easy:   { lives: 5, rate: { base: 2.0, k: 2.4 }, speed: { base: 130, k: 60 }, homing: 0.10, bulletR: [7, 12] },
        normal: { lives: 4, rate: { base: 2.8, k: 3.2 }, speed: { base: 150, k: 78 }, homing: 0.20, bulletR: [6, 11] },
        hard:   { lives: 3, rate: { base: 3.8, k: 4.0 }, speed: { base: 175, k: 95 }, homing: 0.33, bulletR: [5, 10] },
    };

    // =================================================================
    // State
    // =================================================================

    const G = {
        rng: null,
        difficulty: 'normal',
        diffCfg: null,
        px: W / 2, py: H / 2,   // player position
        tx: W / 2, ty: H / 2,   // player target (driven by the relative drag)
        bullets: [],
        elapsed: 0,
        score: 0,
        spawnAcc: 0,
        countdown: 0,
        lives: 3, maxLives: 3,
        invuln: 0,              // seconds of post-hit invulnerability remaining
        shake: 0,
        ended: false,
        deadBullet: null,
    };

    let seedCounter = 1;
    let shell = null;
    let staged = 'normal';      // difficulty chosen for the NEXT run
    let drag = null;            // { ax, ay, sx, sy } relative-control anchor
    let accentCache = null;
    let fontCache = null;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const dom = {
        time: document.getElementById('time'),
        lives: document.getElementById('lives'),
        diffSeg: document.getElementById('difficulty-seg'),
    };
    const livesStat = dom.lives ? dom.lives.closest('.hud-stat') : null;

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
                || '#a78bfa';
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

    // =================================================================
    // Difficulty-over-time curves (unbounded, ever-gentler log)
    // =================================================================

    function spawnRate() {
        const r = G.diffCfg.rate;
        return r.base + r.k * Math.log(1 + G.elapsed / CONFIG.tau);
    }
    function bulletSpeed() {
        const s = G.diffCfg.speed;
        return s.base + s.k * Math.log(1 + G.elapsed / CONFIG.tau);
    }

    // =================================================================
    // Input — relative drag control (press anchors, motion steers)
    // =================================================================

    function toLogical(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width * W,
            y: (e.clientY - rect.top) / rect.height * H,
        };
    }

    function onPointerDown(e) {
        if (!shell.isPlaying()) return;
        AC.audio.unlock();
        const p = toLogical(e);
        // Anchor where you pressed; the dot does NOT jump here. Subsequent
        // motion is added to the dot's position at press time.
        drag = { ax: p.x, ay: p.y, sx: G.px, sy: G.py };
        G.tx = G.px; G.ty = G.py;
    }
    function onPointerMove(e) {
        if (!drag || !shell.isPlaying()) return;
        const p = toLogical(e);   // tracked on window, so dragging off-canvas still works
        G.tx = AC.math.clamp(drag.sx + (p.x - drag.ax), CONFIG.playerRadius, W - CONFIG.playerRadius);
        G.ty = AC.math.clamp(drag.sy + (p.y - drag.ay), CONFIG.playerRadius, H - CONFIG.playerRadius);
    }
    function onPointerUp() {
        drag = null;   // release freezes the target where it is; next press re-anchors
    }

    // Ease the dot toward its target, but never faster than the speed cap.
    function stepPlayer(dt) {
        // 0 = unlimited: the dot tracks the pointer 1:1. The swept collision
        // test still checks the whole old→new segment, so fast moves can't
        // tunnel through a bullet — speed is pure skill expression.
        const maxD = CONFIG.playerMaxSpeed > 0 ? CONFIG.playerMaxSpeed * dt : Infinity;
        const dx = G.tx - G.px, dy = G.ty - G.py;
        const d = Math.hypot(dx, dy);
        if (d <= maxD || d === 0) { G.px = G.tx; G.py = G.ty; }
        else { G.px += dx / d * maxD; G.py += dy / d * maxD; }
    }

    // =================================================================
    // Bullets (type-driven)
    // =================================================================

    function spawnBullet() {
        const r = AC.rng.float(G.rng, G.diffCfg.bulletR[0], G.diffCfg.bulletR[1]);
        const m = CONFIG.spawnMargin + r;
        const ox = W * CONFIG.spawnOverscan, oy = H * CONFIG.spawnOverscan;
        const edge = AC.rng.int(G.rng, 0, 4);   // 0 top · 1 right · 2 bottom · 3 left
        let x, y, inAng;                          // spawn point + inward direction
        if (edge === 0)      { x = AC.rng.float(G.rng, -ox, W + ox); y = -m;      inAng = Math.PI / 2; }
        else if (edge === 1) { x = W + m; y = AC.rng.float(G.rng, -oy, H + oy);   inAng = Math.PI; }
        else if (edge === 2) { x = AC.rng.float(G.rng, -ox, W + ox); y = H + m;   inAng = -Math.PI / 2; }
        else                 { x = -m; y = AC.rng.float(G.rng, -oy, H + oy);      inAng = 0; }

        let speed = bulletSpeed() * (1 + AC.rng.float(G.rng, -CONFIG.speedVariance, CONFIG.speedVariance));
        const homing = AC.rng.float(G.rng, 0, 1) < G.diffCfg.homing;

        let ang;
        if (homing) {
            speed *= CONFIG.homingSpeedMul;
            ang = Math.atan2(G.py - y, G.px - x);   // start heading at you, then keep tracking
        } else {
            ang = inAng + AC.rng.float(G.rng, -CONFIG.straightSpread, CONFIG.straightSpread);
        }

        G.bullets.push({
            x, y, r,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            kind: homing ? 'homing' : 'straight',
            homing: homing,    // true while still tracking; cleared after homingTime
            age: 0,
        });
    }

    // Per-kind steering, applied BEFORE integration each step. 'straight' shots
    // fly in a line; 'homing' shots track the player (capped turn rate) for a
    // while, then straighten so they always leave. New kinds (e.g. a charging
    // laser) hook in here by nudging b.vx / b.vy — keep them leaving eventually.
    function updateBulletKind(b, dt) {
        b.age += dt;
        if (b.kind === 'homing' && b.homing) {
            if (b.age >= CONFIG.homingTime) {
                b.homing = false;   // commit to a straight line so it always leaves the field
            } else {
                // Steer toward the player, capped by the turn rate — a sharp juke
                // can make it overshoot, so it's dodgeable, not a guaranteed hit.
                const speed = Math.hypot(b.vx, b.vy);
                const cur = Math.atan2(b.vy, b.vx);
                let diff = Math.atan2(G.py - b.y, G.px - b.x) - cur;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // wrap to [-PI, PI]
                const maxTurn = CONFIG.homingTurnRate * dt;
                if (diff > maxTurn) diff = maxTurn;
                else if (diff < -maxTurn) diff = -maxTurn;
                const ang = cur + diff;
                b.vx = Math.cos(ang) * speed;
                b.vy = Math.sin(ang) * speed;
            }
        }
    }

    function offField(b) {
        const m = CONFIG.spawnMargin + b.r + 48;
        return b.x < -m || b.x > W + m || b.y < -m || b.y > H + m;
    }

    // Swept circle-vs-circle test over one step (continuous, so fast shots
    // can't tunnel through the dot). Returns true if they overlap at any point
    // along both bodies' linear motion this frame. Uses squared distance.
    function collideSwept(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, R) {
        const ox = ax0 - bx0, oy = ay0 - by0;                         // relative start offset
        const dx = (ax1 - ax0) - (bx1 - bx0), dy = (ay1 - ay0) - (by1 - by0); // relative motion
        const a = dx * dx + dy * dy;
        const b = 2 * (ox * dx + oy * dy);
        const c = ox * ox + oy * oy;
        const t = a > 0 ? AC.math.clamp(-b / (2 * a), 0, 1) : 0;
        const minDist2 = a * t * t + b * t + c;
        return minDist2 <= R * R;
    }

    // A hit costs a life + grants brief invulnerability. Returns true if that
    // was the last life (the run is over).
    function onHit(b) {
        G.lives--;
        G.shake = 0.4;
        updateHud();
        if (G.lives <= 0) { die(b); return true; }
        G.invuln = CONFIG.invulnSec;
        AC.audio.play('rock');
        return false;
    }

    function die(b) {
        if (G.ended) return;
        G.ended = true;
        G.deadBullet = b;
        AC.audio.play('rock');
        shell.gameOver({ score: Math.floor(G.elapsed), win: false, meta: { seconds: +G.elapsed.toFixed(1) } });
    }

    // =================================================================
    // Simulation
    // =================================================================

    function update(dt) {
        if (G.ended) return;

        // Brief "get ready" countdown: let the player pre-position, no bullets yet.
        if (G.countdown > 0) {
            G.countdown -= dt;
            stepPlayer(dt);
            return;
        }

        G.elapsed += dt;
        G.score = G.elapsed;
        if (G.invuln > 0) G.invuln = Math.max(0, G.invuln - dt);
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

        // Spawn on a smooth accumulator (fixed-timestep loop keeps the cadence
        // even without any per-frame probability smoothing).
        G.spawnAcc += dt * spawnRate();
        let guard = 0;
        while (G.spawnAcc >= 1 && guard++ < 40) { spawnBullet(); G.spawnAcc -= 1; }

        // Move the dot, then sweep every bullet against the dot's motion.
        const px0 = G.px, py0 = G.py;
        stepPlayer(dt);
        const px1 = G.px, py1 = G.py;

        for (let i = G.bullets.length - 1; i >= 0; i--) {
            const b = G.bullets[i];
            updateBulletKind(b, dt);
            const bx0 = b.x, by0 = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (G.invuln <= 0 &&
                collideSwept(px0, py0, px1, py1, bx0, by0, b.x, b.y, CONFIG.playerRadius + b.r)) {
                if (onHit(b)) return;   // out of lives → run over
            }
            if (offField(b)) G.bullets.splice(i, 1);
        }

        updateHud();
    }

    // =================================================================
    // Rendering
    // =================================================================

    function render() {
        ctx.fillStyle = '#0c0a18';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        if (G.shake > 0) {
            const s = G.shake * 10;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        for (const b of G.bullets) drawBullet(b);
        drawPlayer();
        if (G.ended) drawDeath();
        ctx.restore();

        if (G.countdown > 0) drawCountdown();
        if (DEBUG) drawDebugOverlay(); // [DEBUG-HOOK]
    }

    function drawBullet(b) {
        // The base circle IS the hitbox (radius b.r). Base colour is reserved to
        // encode a bullet's class; for now every bullet is the same soft white.
        ctx.save();
        ctx.shadowColor = 'rgba(226, 232, 240, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, PI2);
        ctx.fill();
        ctx.restore();

        // A dark arrow marks a bullet that is CURRENTLY homing + shows its
        // heading. When it stops tracking the arrow is gone — it becomes a plain
        // bullet again (no jarring colour change).
        if (b.kind === 'homing' && b.homing) {
            const ang = Math.atan2(b.vy, b.vx);
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(ang);
            ctx.fillStyle = 'rgba(14, 11, 26, 0.9)';
            const s = b.r * 0.9;
            ctx.beginPath();
            ctx.moveTo(s, 0);
            ctx.lineTo(-s * 0.55, s * 0.72);
            ctx.lineTo(-s * 0.12, 0);
            ctx.lineTo(-s * 0.55, -s * 0.72);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    function drawPlayer() {
        const c = accent();
        ctx.save();
        // Blink while invulnerable after a hit.
        if (G.invuln > 0) ctx.globalAlpha = (Math.floor(G.invuln * 12) % 2 === 0) ? 0.35 : 0.95;
        ctx.shadowColor = c;
        ctx.shadowBlur = 18;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius, 0, PI2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius * 0.45, 0, PI2);
        ctx.fill();
        ctx.restore();
    }

    function drawDeath() {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 90, 112, 0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(G.px, G.py, CONFIG.playerRadius * 2.4, 0, PI2);
        ctx.stroke();
        ctx.restore();
    }

    function drawCountdown() {
        const n = Math.ceil(G.countdown);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = `800 120px ${getFont()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n > 0 ? n : '', W / 2, H / 2);
        ctx.restore();
    }

    // =================================================================
    // HUD + difficulty selector
    // =================================================================

    function updateHud() {
        if (dom.time) dom.time.textContent = String(Math.floor(G.elapsed));
        renderLives();
        if (livesStat) livesStat.classList.toggle('danger', G.lives <= 1);
    }
    // Lives as pips (easier to read at a glance than a number).
    function renderLives() {
        if (!dom.lives) return;
        const max = G.maxLives || 1, cur = Math.max(0, G.lives);
        let html = '';
        for (let i = 0; i < max; i++) html += '<i class="life-pip' + (i < cur ? '' : ' lost') + '"></i>';
        dom.lives.innerHTML = html;
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
    // Picking a difficulty stages it; it applies on the next run (or right away
    // on the ready screen, so the preview + Start match the choice).
    function setDifficulty(d) {
        if (!DIFFICULTIES[d] || d === staged) return;
        staged = d;
        AC.prefs.set('dot-dodge', { difficulty: d });
        if (shell && shell.state === 'idle') {
            resetRun();
            render();
        } else {
            syncDiffButtons();
        }
    }

    // =================================================================
    // Overlay content
    // =================================================================

    function overlayContent(state, result) {
        if (state === 'idle') {
            return {
                badge: 'target',
                title: AC.i18n.t('ddReady'),
                message: AC.i18n.t('ddIntro'),
                button: AC.i18n.t('play'),
                hint: AC.i18n.t('ddStartHintHtml'),
            };
        }
        if (state === 'over') {
            const score = AC.format.score(result ? result.score : Math.floor(G.elapsed));
            let msg = AC.i18n.t('ddOverMsgHtml', score);
            if (result && result.isNewBest) msg += ` <strong>${AC.i18n.t('newBest')}</strong>`;
            return {
                badge: 'skull',
                title: AC.i18n.t('gameOver'),
                message: msg,
                button: AC.i18n.t('restart'),
                hint: AC.i18n.t('ddOverHintHtml'),
            };
        }
        return {};   // paused uses the shell default
    }

    // =================================================================
    // Reset + init
    // =================================================================

    function resetRun() {
        G.rng = AC.rng.make(seedCounter++);
        G.difficulty = staged;
        G.diffCfg = DIFFICULTIES[G.difficulty];
        G.lives = G.maxLives = G.diffCfg.lives;
        G.px = G.tx = W / 2;
        G.py = G.ty = H / 2;
        G.bullets = [];
        G.elapsed = START_T;   // [DEBUG-HOOK] ?t=<sec> jumps the difficulty clock
        G.score = START_T;
        G.spawnAcc = 0;
        G.countdown = 0;
        G.invuln = 0;
        G.shake = 0;
        G.ended = false;
        G.deadBullet = null;
        drag = null;
        updateHud();
        if (shell) shell.refreshBest();   // Best reflects the committed difficulty
        syncDiffButtons();
    }

    function init() {
        const pref = AC.prefs.get('dot-dodge');
        staged = DIFFICULTIES[pref.difficulty] ? pref.difficulty : 'normal';
        G.difficulty = staged;

        fitCanvas();
        window.addEventListener('resize', () => { fitCanvas(); render(); });

        shell = AC.shell.create({
            gameId: 'dot-dodge',
            mode: () => G.difficulty,   // high scores are per-difficulty
            step: 1 / 60,
            preventKeys: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            update,
            render,
            reset: resetRun,
            onStart: () => { G.countdown = CONFIG.countdownSec; },
            onPause: () => { drag = null; },
            onResume: () => { drag = null; },
            overlayContent,
            restartToReady: true,
        });

        // Press starts on the stage; movement/release track on window so a
        // drag that strays off the canvas still controls the dot.
        canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
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
    // [DEBUG-HOOK] window.DD console API + overlay + keys (?debug=1 only)
    // =================================================================

    function drawDebugOverlay() {
        const lines = [
            'DEBUG  [' + G.difficulty + ']',
            't = ' + G.elapsed.toFixed(0) + 's',
            'lives = ' + G.lives + '/' + G.maxLives,
            'rate = ' + spawnRate().toFixed(2) + '/s',
            'speed = ' + bulletSpeed().toFixed(0) + ' px/s',
            'homing = ' + G.diffCfg.homing,
            'bullets = ' + G.bullets.length,
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
        window.DD = {
            setTime(sec) { G.elapsed = Math.max(0, sec || 0); return G.elapsed; },
            addTime(sec) { G.elapsed = Math.max(0, G.elapsed + (sec == null ? 30 : sec)); return G.elapsed; },
            addLife(n) { G.lives += (n == null ? 1 : n); G.maxLives = Math.max(G.maxLives, G.lives); updateHud(); return G.lives; },
            clear() { G.bullets = []; return 0; },
            diff(d) { setDifficulty(d); return G.difficulty; },
            info() {
                return {
                    difficulty: G.difficulty, t: +G.elapsed.toFixed(1),
                    lives: G.lives, maxLives: G.maxLives,
                    ratePerSec: +spawnRate().toFixed(2), speed: +bulletSpeed().toFixed(0),
                    homing: G.diffCfg.homing, bullets: G.bullets.length,
                };
            },
        };
        shell.keyboard.onPress((k) => {
            if (k === ']') window.DD.addTime(30);
            else if (k === '[') window.DD.addTime(-30);
            else if (k === 'l' || k === 'L') window.DD.addLife(1);
            else if (k === 'c' || k === 'C') window.DD.clear();
        });
        console.log('%c[Dot Dodge] debug on', 'color:#a78bfa;font-weight:700');
        console.log('DD.setTime(s) addTime(s) addLife(n) clear() diff("easy"|"normal"|"hard") info()');
        console.log('keys:  ] +30s   [ -30s   L +life   C clear bullets');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
