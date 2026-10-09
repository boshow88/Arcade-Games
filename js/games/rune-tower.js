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
        rtBlocked: 'Blocked!',
        rtShEnhanced: 'Clear enhanced',
        rtShComboMin: (n) => `Need ${n}+ combo`,
        rtShFirstMax: (n) => `First wave \u2264 ${n}`,
        rtShNeed: (els) => `Clear ${els}`,
        rtShBan: (els) => `Don't clear ${els}`,
        rtGuarded: 'Guarded!',
        rtSk_mend: 'Mend', rtSk_empower: 'Empower', rtSk_focus: 'Focus', rtSk_shuffle: 'Shuffle',
        rtSk_smite: 'Smite', rtSk_guard: 'Guard', rtSk_freeze: 'Freeze', rtSk_enchant: 'Enchant', rtSk_bless: 'Bless',
        rtRole_warrior: 'Warrior', rtRole_warden: 'Warden', rtRole_mage: 'Mage', rtRole_priest: 'Priest',
        rtCast: 'Cast', rtOnCd: 'On cooldown', rtPopupHint: 'Tap outside to cancel', rtCdLabel: 'Cooldown',
        rtSkd_mend: 'Heal 30% of max HP.',
        rtSkd_empower: 'This spin: all damage ×1.75.',
        rtSkd_focus: 'This spin: +3s of spin time.',
        rtSkd_shuffle: 'Reshuffle the whole board.',
        rtSkd_smite: 'Fixed true damage (15% of max HP), ignoring element.',
        rtSkd_guard: "Block the foe's next attack.",
        rtSkd_freeze: "Push the foe's strike countdown back 2 turns.",
        rtSkd_enchant: 'Turn 3 random runes into enhanced runes.',
        rtSkd_bless: 'Turn 4 random runes into hearts.',
        rtRecruitTitle: 'Recruit', rtRecruitHint: 'Pick a recruit, then the member to replace — swap several, then Done', rtDone: 'Done',
        rtStatAtk: 'ATK', rtStatHp: 'HP', rtStatRec: 'REC',
        rtP_pAtk: '+Attack', rtP_pHp: '+HP', rtP_pRec: '+Recovery', rtP_pLifesteal: 'Lifesteal',
        rtP_pLastStand: 'Last Stand', rtP_pStoneskin: 'Stoneskin', rtP_pUndying: 'Undying', rtP_pElement: 'Element+',
        rtP_pGlass: 'Glass Cannon', rtP_pHeal: 'Regen', rtP_pWarband: 'Warband', rtP_pFaith: 'Faith',
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
        rtBlocked: '擋下！',
        rtShEnhanced: '需消強化',
        rtShComboMin: (n) => `需 ${n}+ 連擊`,
        rtShFirstMax: (n) => `首批 \u2264 ${n} 連擊`,
        rtShNeed: (els) => `需消 ${els}`,
        rtShBan: (els) => `禁消 ${els}`,
        rtGuarded: '格擋！',
        rtSk_mend: '療癒', rtSk_empower: '增幅', rtSk_focus: '凝神', rtSk_shuffle: '洗盤',
        rtSk_smite: '制裁', rtSk_guard: '守護', rtSk_freeze: '凍結', rtSk_enchant: '附魔', rtSk_bless: '祝福',
        rtRole_warrior: '戰士', rtRole_warden: '守衛', rtRole_mage: '法師', rtRole_priest: '祭司',
        rtCast: '施放', rtOnCd: '冷卻中', rtPopupHint: '點擊外面取消', rtCdLabel: '冷卻',
        rtSkd_mend: '回復 30% 最大生命。',
        rtSkd_empower: '本回合所有傷害 ×1.75。',
        rtSkd_focus: '本次轉珠時間 +3 秒。',
        rtSkd_shuffle: '重新排列整個盤面。',
        rtSkd_smite: '對敵造成固定真傷（最大生命的 15%），無視屬性。',
        rtSkd_guard: '擋下敵人的下一次攻擊。',
        rtSkd_freeze: '敵人攻擊倒數延後 2 回合。',
        rtSkd_enchant: '隨機 3 顆符石變成強化符石。',
        rtSkd_bless: '隨機 4 顆符石變成心珠。',
        rtRecruitTitle: '招募', rtRecruitHint: '選新成員→點要換掉的隊員（可換多位，完成後按「完成」）', rtDone: '完成',
        rtStatAtk: '攻', rtStatHp: '血', rtStatRec: '復',
        rtP_pAtk: '加攻', rtP_pHp: '加血', rtP_pRec: '加回復', rtP_pLifesteal: '吸血',
        rtP_pLastStand: '背水', rtP_pStoneskin: '減傷', rtP_pUndying: '不倒', rtP_pElement: '本屬強化',
        rtP_pGlass: '玻璃大砲', rtP_pHeal: '每回合回血', rtP_pWarband: '戰團', rtP_pFaith: '信仰',
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
    // Lucide icon geometry (24×24 viewBox) per element, drawn as stroked Path2D
    // on the runes: water=bubbles, fire=flame, wood=leaf, light=sparkle,
    // dark=eclipse, heart=heart. `p` = path data, `c` = [cx, cy, r] circle.
    const ICON_OPS = {
        water: [{ p: 'M7.001 15.085A1.5 1.5 0 0 1 9 16.5' }, { c: [18.5, 8.5, 3.5] }, { c: [7.5, 16.5, 5.5] }, { c: [7.5, 4.5, 2.5] }],
        fire:  [{ p: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4' }],
        wood:  [{ p: 'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20' }, { p: 'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13' }],
        light: [{ p: 'M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203' }],
        dark:  [{ c: [12, 12, 10] }, { p: 'M12 2a7 7 0 1 0 10 10' }],
        heart: [{ p: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5' }],
    };
    // Pre-build a Path2D per element ONCE (parsing SVG path strings every frame,
    // 30+ times, was the main source of GC stutter). Reused every frame.
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
    // Config + balance + upgrades
    // =================================================================

    const CONFIG = {
        orbRadius: 40,
        iconScale: 0.8,         // rune icon diameter = orbRadius × this (smaller = more margin)
        iconStroke: 0.12,       // rune icon stroke width = orbRadius × this (bigger = bolder/less hollow)
        iconTint: -0.15,        // normal rune icon = shade(element colour, this): near the stone for a unified look (enhanced is white, so it pops)
        popTime: 0.13,
        fallAnim: 0.16,
        bigThreshold: 5,        // clearing this many of a colour forges an enhanced rune
        draftEvery: 2,          // offer an upgrade draft every N floors
        recruitEvery: 8,        // offer a recruit (team swap) every N floors (takes that floor's draft slot)
        teamSize: 5,            // members in your team (each drives HP / per-element attack / heal / a skill)
        scoreCap: 999999,
    };

    const BALANCE = {
        baseHp: 10,             // flat HP before the team's HP is added
        spinTime: 6,
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
        { id: 'heavyStrike',   tier: 'C', max: 0, apply: (G) => { G.run.atkFlat += 4; } },
        { id: 'attunement',    tier: 'R', max: 3, apply: (G) => { G.run.dmgMult += 0.08; } },
        { id: 'shapewright',   tier: 'R', max: 3, apply: (G) => { G.run.enhancedMult += 0.25; } },
        { id: 'enrich',        tier: 'R', max: 2, apply: (G) => { G.run.enhanceOnBig += 1; } },
        { id: 'piercingFirst', tier: 'R', max: 1, apply: (G) => { G.run.piercingFirst = true; } },
        { id: 'chainReaction', tier: 'R', max: 2, apply: (G) => { G.run.chainBonus += 0.5; } },
        { id: 'vitality',      tier: 'C', max: 4, apply: (G) => { G.run.hpBonus += 25; G.playerHp += 25; recomputeMaxHp(); } },
        { id: 'morningDew',    tier: 'C', max: 5, apply: (G) => { G.run.healPerTurnFrac += 0.03; } },
        { id: 'soulEater',     tier: 'C', max: 3, apply: (G) => { G.run.healOnKillFrac += 0.20; } },
        { id: 'lastStand',     tier: 'R', max: 1, apply: (G) => { G.run.lastStand = true; } },
        { id: 'stoneskin',     tier: 'C', max: 3, apply: (G) => { G.run.stoneskinFrac = Math.min(0.45, G.run.stoneskinFrac + 0.12); } },
        { id: 'undying',       tier: 'E', max: 1, apply: (G) => { G.run.undying = true; } },
        { id: 'snowball',      tier: 'R', max: 1, apply: (G) => { G.run.snowball = true; } },
        { id: 'glassCannon',   tier: 'E', max: 1, apply: (G) => { G.run.dmgMult += 0.40; G.run.hpMult *= 0.75; recomputeMaxHp(); } },
    ];
    const TIER_WEIGHT = { C: 3, R: 2, E: 1 };
    const TIER_COLOR = { C: '#6fb0ff', R: '#b483ff', E: '#f6c24a' }; // blue / purple / gold

    // Active skills — tap to cast. Casting is a FREE action; a turn (and every
    // skill's cooldown) only advances when you spin. CD is in turns.
    const SKILLS = [
        { id: 'mend',    cd: 6, run: () => { const h = Math.round(G.playerMaxHp * 0.3); G.playerHp = Math.min(G.playerMaxHp, G.playerHp + h); addFloat(W / 2, BOARD_TOP - 40, '+' + h, ELEMENT_COLORS.heart, 20); } },
        { id: 'empower', cd: 6, run: () => { G.empowerNext = 1.75; } },
        { id: 'focus',   cd: 4, run: () => { G.bonusTimeNext = 3; } },
        { id: 'shuffle', cd: 5, run: () => reshuffleBoard() },
        { id: 'smite',   cd: 7, run: () => smiteEnemy() },
        { id: 'guard',   cd: 5, run: () => { G.guardNext = true; } },
        { id: 'freeze',  cd: 7, run: () => { if (G.enemy) G.enemy.cd += 2; } },
        { id: 'enchant', cd: 5, run: () => enchantRandom(3) },
        { id: 'bless',   cd: 5, run: () => blessRandom(4) },
    ];
    function skillDef(id) { return SKILLS.find((s) => s.id === id); }
    function effectiveSpinTime() { return G.run.spinTime + (G.bonusTimeNext || 0); }
    function reshuffleBoard() {
        for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o) { o.el = randomEl(); o.enhanced = false; o.shape = makeShape(G.rng); o.gfx = null; } }
        let guard = 0, groups = findMatches();
        while (groups.length > 0 && guard++ < 200) { for (const g of groups) for (const idx of g.cells) { board[idx].el = randomEl(); board[idx].gfx = null; } groups = findMatches(); }
    }
    function enchantRandom(n) {
        const c = []; for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && !o.enhanced) c.push(i); }
        for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); board[c[j]].enhanced = true; c.splice(j, 1); }
    }
    function blessRandom(n) {
        const c = []; for (let i = 0; i < COLS * ROWS; i++) { const o = board[i]; if (o && o.el !== 'heart') c.push(i); }
        for (let k = 0; k < n && c.length; k++) { const j = AC.rng.int(G.rng, 0, c.length); const idx = c[j]; board[idx].el = 'heart'; board[idx].gfx = null; c.splice(j, 1); }
    }
    function smiteEnemy() {
        const dmg = Math.round(G.playerMaxHp * 0.15);
        damageEnemy(dmg);
        addFloat(W / 2, 96, '-' + dmg, '#ffe08a', 24);
        if (G.enemy.hp <= 0) defeatEnemy();
        updateHud();
    }
    function activateSkill(i) {
        const m = G.team[i];
        if (!m || !m.active || m.cd > 0 || !shell.isPlaying() || G.resolving || G.held || G.draft) return;
        const def = skillDef(m.active);
        if (!def) return;
        def.run();
        m.cd = def.cd;
        AC.audio.play('gem');
        addFloat(W / 2, 170, t('rtSk_' + m.active), accent(), 18);   // brief cast feedback
        updateHud();
    }

    // =================================================================
    // Team — up to CONFIG.teamSize members drive HP, per-element attack,
    // healing (recovery) and your active skills. Each member has a role, an
    // element, a (maybe null) active skill, and a passive that patches stats.
    // =================================================================

    const ROLES = {
        warrior: { atk: 13, hp: 28, rec: 3 },   // balanced
        warden:  { atk: 8,  hp: 44, rec: 3 },   // low attack, high HP
        mage:    { atk: 18, hp: 16, rec: 2 },   // high attack, low HP
        priest:  { atk: 11, hp: 22, rec: 7 },   // balanced, support-leaning
    };
    const ROLE_IDS = Object.keys(ROLES);
    const ROLE_ACTIVES = {
        warrior: ['empower', 'smite', 'enchant'],
        warden:  ['guard', 'freeze', 'mend'],
        mage:    ['empower', 'smite', 'enchant', 'shuffle'],
        priest:  ['mend', 'bless', 'focus', 'shuffle'],
    };
    const ROLE_PASSIVES = {
        warrior: ['pAtk', 'pLifesteal', 'pLastStand', 'pWarband'],
        warden:  ['pHp', 'pStoneskin', 'pUndying'],
        mage:    ['pAtk', 'pElement', 'pGlass'],
        priest:  ['pRec', 'pHeal', 'pFaith'],
    };
    // Passives patch the derived team-stats object `ts` (see recomputeTeam).
    const PASSIVES = {
        pAtk:       { apply: (ts) => { ts.atkFlat += 3; } },
        pHp:        { apply: (ts) => { ts.hp += 25; } },
        pRec:       { apply: (ts) => { ts.rec += 4; } },
        pLifesteal: { apply: (ts) => { ts.lifestealFrac += 0.10; } },
        pLastStand: { apply: (ts) => { ts.lastStand = true; } },
        pStoneskin: { apply: (ts) => { ts.stoneskinFrac = Math.min(0.4, ts.stoneskinFrac + 0.1); } },
        pUndying:   { apply: (ts) => { ts.undying = true; } },
        pElement:   { apply: (ts, team, m) => { ts.elementBonus[m.element] = (ts.elementBonus[m.element] || 1) * 1.25; } },
        pGlass:     { apply: (ts) => { ts.dmgMult *= 1.25; ts.hpMult *= 0.85; } },
        pHeal:      { apply: (ts) => { ts.healPerTurnFrac += 0.03; } },
        pWarband:   { apply: (ts, team) => { ts.atkFlat += 2 * team.filter((x) => x.role === 'warrior').length; } },  // synergy
        pFaith:     { apply: (ts, team) => { ts.rec += 3 * team.filter((x) => x.role === 'priest').length; } },       // synergy
    };
    function pickOne(list) { return list[AC.rng.int(G.rng, 0, list.length)]; }
    function makeMember() {
        const role = pickOne(ROLE_IDS);
        const base = ROLES[role];
        return {
            role,
            element: ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)],
            atk: base.atk, hp: base.hp, rec: base.rec,
            active: AC.rng.float(G.rng, 0, 1) < 0.75 ? pickOne(ROLE_ACTIVES[role]) : null, // some are passive-only
            passive: pickOne(ROLE_PASSIVES[role]),
            cd: 0,
        };
    }
    function makeTeam(n) { const t2 = []; for (let i = 0; i < n; i++) t2.push(makeMember()); return t2; }
    function recomputeTeam() {
        const ts = { atk: { fire: 0, water: 0, wood: 0, light: 0, dark: 0 }, rec: 0, hp: 0, atkFlat: 0, dmgMult: 1, hpMult: 1, elementBonus: {}, lifestealFrac: 0, lastStand: false, stoneskinFrac: 0, undying: false, healPerTurnFrac: 0 };
        for (const m of G.team) { ts.atk[m.element] += m.atk; ts.rec += m.rec; ts.hp += m.hp; }
        for (const m of G.team) { const p = PASSIVES[m.passive]; if (p) p.apply(ts, G.team, m); }
        G.ts = ts;
        recomputeMaxHp();
    }
    function recomputeMaxHp() {
        if (!G.ts) return;
        const prev = G.playerMaxHp;
        const run = G.run || {};
        G.playerMaxHp = Math.max(1, Math.round((BALANCE.baseHp + G.ts.hp + (run.hpBonus || 0)) * G.ts.hpMult * (run.hpMult || 1)));
        G.playerHp = prev > 0 ? Math.min(G.playerHp, G.playerMaxHp) : G.playerMaxHp;
    }
    function openRecruit() { G.recruit = { candidates: [makeMember(), makeMember(), makeMember()], used: [false, false, false], selected: null }; }
    function doRecruitSwap(candIdx, memberIdx) {
        G.team[memberIdx] = G.recruit.candidates[candIdx];
        G.recruit.used[candIdx] = true;    // consume this recruit; keep the panel open for more swaps
        G.recruit.selected = null;
        recomputeTeam();                   // new member may change HP / attack coverage
        updateHud();
        AC.audio.play('levelup');
    }

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
        resolve: null,          // { stage, t, combos, pending, popIndex, wave }
        draft: null,            // { options: [upgradeId, ...] } while choosing
        skillPopup: null,       // { i } while a member's skill confirm popup is open
        recruit: null,          // { candidates:[member×3], selected } while recruiting
        team: [],               // members: [{ role, element, atk, hp, rec, active, passive, cd }]
        ts: null,               // derived team stats (recomputed on team change)
        undyingUsed: false,
        empowerNext: 1,         // damage × for the next spin (Empower skill)
        bonusTimeNext: 0,       // extra seconds for the next spin (Focus skill)
        guardNext: false,       // block the foe's next attack (Guard skill)
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
    // Input — drag a rune; or pick a draft card
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
        if (G.draft) { handleDraftClick(p); if (e.cancelable) e.preventDefault(); return; }
        if (G.skillPopup) {                  // confirm / cancel the skill popup
            const L = skillPopupLayout(), m = G.team[G.skillPopup.i];
            if (m && m.active && m.cd <= 0 && inRect(p, L.cast)) { const i = G.skillPopup.i; G.skillPopup = null; AC.audio.unlock(); activateSkill(i); }
            else if (!inRect(p, L.card)) { G.skillPopup = null; }
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.recruit) {                     // pick a candidate, then a member to replace; swap several, then Done
            const L = recruitLayout();
            for (const c of L.cands) if (inRect(p, c) && !G.recruit.used[c.i]) { G.recruit.selected = c.i; AC.audio.unlock(); if (e.cancelable) e.preventDefault(); return; }
            if (G.recruit.selected != null) for (const mb of L.members) if (inRect(p, mb)) { AC.audio.unlock(); doRecruitSwap(G.recruit.selected, mb.i); if (e.cancelable) e.preventDefault(); return; }
            if (inRect(p, L.done)) G.recruit = null;
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (G.resolving || G.held) return;
        if (p.y < BOARD_TOP) {               // above the board: team skill tiles live here
            for (const b of teamTileRects()) {
                if (inRect(p, b)) {
                    AC.audio.unlock();
                    if (G.team[b.i].active) G.skillPopup = { i: b.i };   // show the skill before casting
                    if (e.cancelable) e.preventDefault();
                    return;
                }
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
        // Forge enhanced rune(s) IN PLACE: pick random just-cleared cell(s) of this
        // group and birth an enhanced rune of that colour right there. It then
        // falls with gravity (and grows from scale 0) like any other rune, while
        // the remaining gaps are filled from above.
        if (g.cells.length >= CONFIG.bigThreshold) {
            const count = 1 + G.run.enhanceOnBig;
            const spots = g.cells.slice();
            for (let k = 0; k < count && spots.length; k++) {
                const pick = spots.splice(AC.rng.int(G.rng, 0, spots.length), 1)[0];
                const o = newOrb(g.el, cellCX(pick), cellCY(pick), true);
                o.scale = 0;
                board[pick] = o;
            }
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

    // --- Damage / combat (centralised so Phase 3 shields & team mods hook here) ---

    // Does the foe's shield block damage this turn? `stats` is derived from the
    // resolved combo groups. Hearts/healing are never blocked — only damage.
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
                return !shield.elements.every((el) => stats.elements.has(el)); // 'contains'
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

    function computeSpinResult(combos) {
        const n = combos.length;
        const stats = { combos: n, firstWave: 0, enhancedCleared: 0, elements: new Set() };
        if (n === 0) return { dmg: 0, heal: 0, n: 0, blocked: false };
        const comboMult = 1 + G.run.comboStep * (n - 1);
        const ts = G.ts;
        let dmg = 0, heal = 0;
        for (const g of combos) {
            if (g.wave === 0) stats.firstWave++;
            stats.enhancedCleared += (g.enhanced || 0);
            stats.elements.add(g.el);
            const enh = g.enhanced || 0;
            const count = g.cells.length + enh * (G.run.enhancedMult - 1);
            if (g.el === 'heart') { heal += count * ts.rec; continue; }   // healing = team recovery
            const perCell = (ts.atk[g.el] || 0) + G.run.atkFlat;          // attack = team's attack for this element
            let em = elementMult(g.el, G.enemy.element);
            if (G.run.piercingFirst && g.wave === 0 && em < 1) em = 1;   // 首批 ignores weakness
            let gd = count * perCell * em;
            if (g.wave > 0) gd *= (1 + G.run.chainBonus);                 // 非首批 cascade bonus
            gd *= (G.run.elementBonus[g.el] || 1) * (ts.elementBonus[g.el] || 1);
            dmg += gd;
        }
        let total = dmg * comboMult * G.run.dmgMult * ts.dmgMult * (G.empowerNext || 1);
        if ((G.run.lastStand || ts.lastStand) && G.playerMaxHp > 0 && G.playerHp / G.playerMaxHp < 0.3) total *= 1.5;
        const blocked = shieldBlocks(G.enemy.shield, stats);
        if (blocked) total = 0;
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
                if (G.ts.lifestealFrac > 0) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + Math.round(dmg * G.ts.lifestealFrac));
            }
            addFloat(W / 2, 130, t('rtCombo', n), accent(), 18);
        }
        const hpt = G.run.healPerTurnFrac + G.ts.healPerTurnFrac;
        if (hpt > 0) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + G.playerMaxHp * hpt);

        G.empowerNext = 1;            // consume this-turn skill buffs
        G.bonusTimeNext = 0;
        for (const m of G.team) if (m.active && m.cd > 0) m.cd--;   // skill cooldowns advance one turn

        G.resolving = false;
        G.resolve = null;

        if (G.enemy.hp <= 0) defeatEnemy();
        else enemyTurn();
        updateHud();
    }

    function enemyTurn() {
        G.enemy.cd -= 1;
        if (G.enemy.cd <= 0) {
            G.enemy.cd = G.enemy.cdMax;
            if (G.guardNext) {   // Guard skill blocks this strike (the one allowed full-block source)
                G.guardNext = false;
                addFloat(W / 2, BOARD_TOP - 70, t('rtGuarded'), '#9fe0ff', 22);
                AC.audio.play('empty');
                return;
            }
            const sk = Math.min(0.6, G.run.stoneskinFrac + G.ts.stoneskinFrac);
            const dmg = Math.max(1, Math.round(G.enemy.atk * (1 - sk)));
            G.playerHp -= dmg;
            G.shake = 0.4;
            addFloat(W / 2, BOARD_TOP - 70, '-' + dmg, '#ff6b6b', 24);
            AC.audio.play('rock');
            if (G.playerHp <= 0) {
                if ((G.run.undying || G.ts.undying) && !G.undyingUsed) { G.undyingUsed = true; G.playerHp = 1; addFloat(W / 2, BOARD_TOP - 70, '1 HP', '#ffe08a', 22); }
                else { G.playerHp = 0; die(); }
            }
        }
    }
    function defeatEnemy() {
        AC.audio.play('levelup');
        if (G.run.healOnKillFrac > 0) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + G.playerMaxHp * G.run.healOnKillFrac);
        if (G.run.snowball) G.run.atkFlat += 1;
        const next = G.enemy.index + 1;
        spawnEnemy(next);
        if (next % CONFIG.recruitEvery === 0) openRecruit();
        else if (next % CONFIG.draftEvery === 0) openDraft();
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
    function spawnEnemy(index) {
        const maxHp = Math.round(BALANCE.enemyHp + BALANCE.enemyHpGrow * index);
        G.enemy = {
            index,
            element: ATTACK_ELEMENTS[AC.rng.int(G.rng, 0, ATTACK_ELEMENTS.length)],
            hp: maxHp, maxHp,
            atk: Math.round(BALANCE.enemyAtk + BALANCE.enemyAtkGrow * index),
            cd: BALANCE.enemyCd, cdMax: BALANCE.enemyCd,
            shield: rollShield(index),
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

    function upgradeAvailable(u) { if (u.avail && !u.avail()) return false; const lv = G.run.levels[u.id] || 0; return u.max === 0 || lv < u.max; }
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

        drawTeam();
        drawSpinTimer();
        if (G.skillPopup) drawSkillPopup();
        if (G.recruit) drawRecruit();
        if (G.draft) drawDraft();
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
    // Build (once per rune) the stone's Path2D outline, speckle paths, sheen and
    // fill gradient at a REFERENCE radius (orbRadius). drawStone then just scales
    // the context — no per-frame path/gradient allocation. Cached on the shape.
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
        const R = CONFIG.orbRadius, k = r / R;   // all geometry is cached at radius R; scale to r

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

        // centre icon (rotated with the stone, actual size, cached paths)
        const iconColor = enhanced ? 'rgba(255,255,255,0.97)' : shade(col, CONFIG.iconTint);
        drawRuneIcon(el, 0, 0, r * CONFIG.iconScale, iconColor, Math.max(2.4, r * CONFIG.iconStroke));
        ctx.restore();
    }
    // Draw a Lucide icon (24×24 stroke paths from ICON_OPS) centred on (cx, cy),
    // scaled to `size`, stroked in `color` at roughly `lw` px.
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

        // shield requirement pill (right side of the attack row)
        if (e.shield) {
            const label = shieldLabel(e.shield);
            ctx.font = `700 13px ${f}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const pw = ctx.measureText(label).width + 20, px = W - 16 - pw, py = 88;
            ctx.fillStyle = 'rgba(127,212,255,0.16)';
            roundRect(px, py, pw, 24, 12); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(127,212,255,0.6)';
            roundRect(px, py, pw, 24, 12); ctx.stroke();
            ctx.fillStyle = '#a9e3ff';
            ctx.fillText(label, px + pw / 2, py + 13);
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

    // Team panel, in the gap between the player bar and the board. Each tile is a
    // member (element-tinted border, role, and its active skill); tap a ready one
    // to cast. Passive-only members show "—" and aren't tappable.
    function teamTileRects() {
        const n = G.team.length;
        if (n === 0) return [];
        const gap = 8, h = 56, y = 180;
        const w = Math.min(112, (W - 32 - gap * (n - 1)) / n);
        const x0 = (W - (w * n + gap * (n - 1))) / 2;
        return G.team.map((m, i) => ({ i, x: x0 + i * (w + gap), y, w, h }));
    }
    function drawTeam() {
        if (!shell || !shell.isPlaying()) return;
        const f = getFont();
        for (const b of teamTileRects()) {
            const m = G.team[b.i];
            const ecol = ELEMENT_COLORS[m.element];
            const castable = !!m.active, ready = castable && m.cd <= 0;
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = ready ? ecol : shade(ecol, -0.25);
            roundRect(b.x, b.y, b.w, b.h, 9); ctx.stroke();
            // element dot + role
            ctx.fillStyle = ecol;
            ctx.beginPath(); ctx.arc(b.x + 12, b.y + 13, 4, 0, PI2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = `600 10px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(t('rtRole_' + m.role), b.x + 22, b.y + 13);
            // active skill name (or dash)
            ctx.textAlign = 'center';
            ctx.fillStyle = castable ? (ready ? '#fff' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.3)';
            ctx.font = `700 14px ${f}`;
            ctx.fillText(castable ? t('rtSk_' + m.active) : '—', b.x + b.w / 2, b.y + 38);
            if (castable && !ready) {
                ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `800 20px ${f}`; ctx.textBaseline = 'middle';
                ctx.fillText(String(m.cd), b.x + b.w / 2, b.y + b.h / 2);
            }
            ctx.restore();
        }
    }
    function recruitLayout() {
        const n = G.recruit.candidates.length, pad = 16, gap = 12;
        const cw = (W - pad * 2 - gap * (n - 1)) / n, cy = BOARD_TOP + 44, ch = 176;
        const cands = G.recruit.candidates.map((m, i) => ({ i, x: pad + i * (cw + gap), y: cy, w: cw, h: ch }));
        const mN = G.team.length, mgap = 8, mw = Math.min(104, (W - 32 - mgap * (mN - 1)) / mN), mh = 46;
        const mx0 = (W - (mw * mN + mgap * (mN - 1))) / 2, my = cy + ch + 24;
        const members = G.team.map((m, i) => ({ i, x: mx0 + i * (mw + mgap), y: my, w: mw, h: mh }));
        return { cands, members, done: { x: W / 2 - 70, y: my + mh + 16, w: 140, h: 38 } };
    }
    function drawRecruitCandidate(c, f) {
        const m = G.recruit.candidates[c.i], ecol = ELEMENT_COLORS[m.element], sel = G.recruit.selected === c.i;
        ctx.save();
        if (G.recruit.used[c.i]) ctx.globalAlpha = 0.3;   // already recruited this candidate
        ctx.fillStyle = sel ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
        roundRect(c.x, c.y, c.w, c.h, 12); ctx.fill();
        ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = ecol;
        roundRect(c.x, c.y, c.w, c.h, 12); ctx.stroke();
        const cx = c.x + c.w / 2;
        ctx.fillStyle = ecol; ctx.beginPath(); ctx.arc(c.x + 24, c.y + 26, 13, 0, PI2); ctx.fill();
        drawRuneIcon(m.element, c.x + 24, c.y + 26, 20, 'rgba(255,255,255,0.95)', 2);
        ctx.fillStyle = shade(ecol, 0.3); ctx.font = `700 15px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rtRole_' + m.role), c.x + 42, c.y + 26);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = m.active ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.font = `700 15px ${f}`;
        ctx.fillText(m.active ? t('rtSk_' + m.active) : '—', cx, c.y + 70);
        ctx.fillStyle = 'rgba(200,210,255,0.75)'; ctx.font = `600 12px ${f}`;
        ctx.fillText(t('rtP_' + m.passive), cx, c.y + 94);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `600 12px ${f}`;
        ctx.fillText(t('rtStatAtk') + ' ' + m.atk + '   ' + t('rtStatHp') + ' ' + m.hp + '   ' + t('rtStatRec') + ' ' + m.rec, cx, c.y + 122);
        ctx.restore();
    }
    function drawRecruit() {
        const f = getFont(), L = recruitLayout();
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.9)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = '#eaf0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = `800 22px ${f}`; ctx.fillText(t('rtRecruitTitle'), W / 2, BOARD_TOP + 30);
        for (const c of L.cands) drawRecruitCandidate(c, f);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 12px ${f}`; ctx.textAlign = 'center';
        ctx.fillText(t('rtRecruitHint'), W / 2, L.members[0].y - 8);
        for (const mb of L.members) {
            const m = G.team[mb.i], ecol = ELEMENT_COLORS[m.element], active = G.recruit.selected != null;
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(mb.x, mb.y, mb.w, mb.h, 8); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = active ? ecol : shade(ecol, -0.25); roundRect(mb.x, mb.y, mb.w, mb.h, 8); ctx.stroke();
            ctx.fillStyle = ecol; ctx.beginPath(); ctx.arc(mb.x + 11, mb.y + mb.h / 2, 4, 0, PI2); ctx.fill();
            ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.55)'; ctx.font = `600 11px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t('rtRole_' + m.role), mb.x + mb.w / 2 + 6, mb.y + mb.h / 2);
            ctx.textBaseline = 'alphabetic';
        }
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(L.done.x, L.done.y, L.done.w, L.done.h, 10); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 14px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('rtDone'), L.done.x + L.done.w / 2, L.done.y + L.done.h / 2);
        ctx.restore();
    }
    function skillPopupLayout() {
        const cw = 400, ch = 250, cx = (W - cw) / 2, cy = BOARD_TOP + 60;
        return { card: { x: cx, y: cy, w: cw, h: ch }, cast: { x: cx + cw / 2 - 85, y: cy + ch - 60, w: 170, h: 44 } };
    }
    function drawSkillPopup() {
        const m = G.team[G.skillPopup.i];
        if (!m || !m.active) { G.skillPopup = null; return; }
        const f = getFont(), ecol = ELEMENT_COLORS[m.element], ready = m.cd <= 0;
        const L = skillPopupLayout(), c = L.card, cx = c.x + c.w / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(8,6,16,0.74)';
        ctx.fillRect(0, BOARD_TOP - 4, W, H - (BOARD_TOP - 4));
        ctx.fillStyle = 'rgba(22,19,32,0.98)';
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = ecol;
        roundRect(c.x, c.y, c.w, c.h, 14); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff'; ctx.font = `800 22px ${f}`;
        ctx.fillText(t('rtSk_' + m.active), cx, c.y + 42);
        ctx.fillStyle = shade(ecol, 0.3); ctx.font = `600 13px ${f}`;
        ctx.fillText(t('rtRole_' + m.role) + ' · ' + t('el_' + m.element), cx, c.y + 64);

        ctx.fillStyle = 'rgba(230,236,255,0.9)'; ctx.font = `500 15px ${f}`;
        let y = c.y + 100;
        for (const ln of wrapLines(t('rtSkd_' + m.active), c.w - 48)) { ctx.fillText(ln, cx, y); y += 23; }

        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `600 13px ${f}`;
        ctx.fillText(t('rtCdLabel') + ': ' + skillDef(m.active).cd + (ready ? '' : '  (' + m.cd + ')'), cx, c.y + c.h - 80);

        const bt = L.cast;
        ctx.fillStyle = ready ? accent() : 'rgba(255,255,255,0.1)';
        roundRect(bt.x, bt.y, bt.w, bt.h, 10); ctx.fill();
        ctx.fillStyle = ready ? '#1a1526' : 'rgba(255,255,255,0.4)';
        ctx.font = `800 16px ${f}`; ctx.textBaseline = 'middle';
        ctx.fillText(ready ? t('rtCast') : t('rtOnCd'), bt.x + bt.w / 2, bt.y + bt.h / 2);

        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `500 12px ${f}`;
        ctx.fillText(t('rtPopupHint'), cx, c.y + c.h - 12);
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
            atkFlat: 0,
            comboStep: BALANCE.comboStep,
            enhancedMult: BALANCE.enhancedMult,
            dmgMult: 1,
            hpBonus: 0, hpMult: 1,
            enhanceOnBig: 0,
            healPerTurnFrac: 0,
            healOnKillFrac: 0,
            piercingFirst: false,
            chainBonus: 0,
            lastStand: false,
            stoneskinFrac: 0,
            undying: false,
            snowball: false,
            elementBonus: {},
            levels: {},
        };
        G.score = 0;
        G.held = null;
        G.spinTimer = 0;
        G.resolving = false;
        G.resolve = null;
        G.draft = null;
        G.skillPopup = null;
        G.recruit = null;
        G.team = makeTeam(CONFIG.teamSize);
        G.ts = null;
        G.playerHp = G.playerMaxHp = 0;
        recomputeTeam();          // sets G.ts, playerMaxHp, and full HP
        G.undyingUsed = false;
        G.empowerNext = 1;
        G.bonusTimeNext = 0;
        G.guardNext = false;
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
            'dmg ' + G.score + '  aF ' + G.run.atkFlat,
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
            shield(type) {
                const map = { enhanced: { type: 'enhanced' }, combo: { type: 'combo', mode: 'min', n: 5 }, first: { type: 'firstWaveMax', n: 2 }, need: { type: 'element', mode: 'contains', elements: ['fire'] }, ban: { type: 'element', mode: 'ban', elements: ['water'] }, none: null };
                if (G.enemy && type in map) G.enemy.shield = map[type];
                return G.enemy && G.enemy.shield;
            },
            cast(i) { activateSkill(i | 0); return G.team; },
            team() { return G.team; },
            reroll() { G.team = makeTeam(CONFIG.teamSize); recomputeTeam(); updateHud(); return G.team; },
            recruit() { openRecruit(); return G.recruit; },
            info() { return { run: G.run, ts: G.ts, foe: G.enemy, hp: G.playerHp, dmg: G.score, team: G.team }; },
        };
        console.log('%c[Rune Tower] debug on', 'color:#f5b23d;font-weight:700');
        console.log('RT.kill() hp(n) foe(n) draft() give("timeSand"…) shield(...) cast(i) team() reroll() info()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
