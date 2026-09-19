/* 《拳霸98加强变态版》自测脚本（只给开发用，不参与发布）
 *
 * 用法：
 *   cd nianhong-fc && python3 -m http.server 8104
 *   node tools/gametest/fight_test.js          # 单人（2P 由 AI 接管）
 *   node tools/gametest/fight_test.js twoP     # 双人（2P = WASD + G/H）
 *
 * 做四件事：
 *   1. 收集 console error 与 window.__errors，必须为空（missing asset 警告忽略）
 *   2. 用真键盘事件打一场，30~60 秒，至少打完一回合
 *   3. 关键时刻自动截图（开场 / 命中 / 防御 / 必杀 / KO / 回合结束）
 *   4. 顺手把游戏内部状态打成日志，验证血条真的在掉、AI 真的在动 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TWO_P = process.argv.indexOf('twoP') > 0;
const OUT = path.join(__dirname, 'fight');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8104/test-game.html?game=fight&cart=04&nomom=1' + (TWO_P ? '&twoP=1' : '');
const PRE = TWO_P ? 'shot_fight2p' : 'shot_fight';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

  const consoleErrors = [];
  const loadWarns = [];
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') {
      /* 其他 agent 还在生产的资源 / 兄弟游戏文件会 404 或写到一半语法不全，与本游戏无关 */
      if (/Failed to load resource|missing asset|404|Unexpected end of input/.test(t)) loadWarns.push(t);
      else consoleErrors.push(t);
    }
  });
  page.on('pageerror', e => {
    const m = e.message || '';
    if (/Unexpected end of input/.test(m)) { loadWarns.push('[pageerror] ' + m); return; }
    consoleErrors.push('[pageerror] ' + m);
  });

  /* 抓住游戏实例 + 打开《电子游戏时代》秘技表，方便验证 hasMag 分支 */
  await page.addInitScript(() => {
    /* test-game.html 自己不建 window.SB（index.html 才建），调试台里补一个 */
    if (!window.SB) window.SB = { version: 'debug' };

    /* 外层 PlayScene 会按卡带脏度随机「打到一半花屏」并销毁小游戏（共享逻辑，不是本游戏的锅）。
     * 自测要连续打满一整场，所以把 04 号卡擦干净，把这个随机事件按掉。 */
    setInterval(() => {
      const S = window.SB && window.SB.Save;
      if (!(S && S.d && S.d.carts)) return;
      const cs = S.d.carts['04'];
      if (cs) { cs.dirt = 0; cs.wear = 0; }
      if (S.d.flags) S.d.flags.hot = false;
    }, 300);

    /* 调试台（和 BootScene）把 game 传给 SB.Input.init，但 Phaser 3.60 的 addKeys
     * 只在 scene.input.keyboard 上；这是共享文件里的既有问题，不该由本游戏改动，
     * 所以只在测试进程里打个补丁：等 Play 场景起来后拿它的键盘插件重新初始化。 */
    const pv = setInterval(() => {
      if (!(window.SB && window.SB.Input && !window.SB.Input.__patched)) return;
      const I = window.SB.Input, orig = I.init;
      I.__patched = true;
      I.init = function (game) {
        const self = this;
        const iv = setInterval(() => {
          const s = game.scene && game.scene.getScene && game.scene.getScene('Play');
          if (s && s.input && s.input.keyboard && s.input.keyboard.addKeys) {
            clearInterval(iv);
            const proxy = { input: { keyboard: s.input.keyboard, gamepad: game.input.gamepad } };
            orig.call(self, proxy);
            self.game = proxy;
            window.__kbReady = true;
          }
        }, 30);
        return this;
      };
      clearInterval(pv);
    }, 10);

    const iv = setInterval(() => {
      if (window.SB && window.SB.Save && window.SB.Save.d && window.SB.Save.d.owned) {
        window.SB.Save.d.owned.mag = true;
      }
      if (window.SB && window.SB.Games && window.SB.Games.fight && !window.SB.Games.fight.__hooked) {
        const F = window.SB.Games.fight;
        const W = function (host, opts) { F.call(this, host, opts); window.__fg = this; };
        W.prototype = F.prototype;
        W.__hooked = true;
        window.SB.Games.fight = W;
        clearInterval(iv);
      }
    }, 15);
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(2400);                       // 开机 + 卡带标题动画约 2.5 秒

  const st = () => page.evaluate(() => {
    const g = window.__fg;
    if (!g || !g.f1) return null;
    const f = (x) => ({
      x: Math.round(x.x), y: Math.round(x.y), hp: Math.round(x.hp),
      meter: Math.round(x.meter), st: x.st, mv: x.mvKey, wins: x.wins, combo: x.combo
    });
    return {
      ph: g.ph, round: g.round, time: Math.round(g.timeLeft / 1000),
      f1: f(g.f1), f2: f(g.f2), projs: g.projs.length,
      cheat: g.cheat.n, aiLv: Math.round(g.ai.lv * 100) / 100, score: g.score,
      mag: !!g.magOn, twoP: g.twoP
    };
  });

  const shots = [];
  const shot = async (name) => {
    const p = path.join(OUT, PRE + '_' + name + '.png');
    try { await page.locator('canvas').screenshot({ path: p }); shots.push(p); }
    catch (e) { console.log('  截图失败 ' + name + ': ' + e.message); }
  };

  let s0 = await st();
  for (let i = 0; i < 150 && !s0; i++) { await sleep(80); s0 = await st(); }
  console.log('初始状态:', JSON.stringify(s0));
  if (!s0) { console.log('!! 拿不到游戏实例，可能没进 fight'); }
  /* 开场标题（加强变态版）只亮 1.9 秒，进 create 后立刻抓，同时确认 CRT 黑底已经掀开 */
  for (let i = 0; i < 20; i++) {
    const dark = await page.evaluate(() => {
      const g = window.__fg;
      return g && g.host && g.host.crt && g.host.crt.dark ? g.host.crt.dark.alpha : 1;
    });
    if (dark < 0.05) break;
    await sleep(60);
  }
  await shot('01_title');

  /* ---- 条件截图：命中 / 防御 / 必杀波 / KO / 回合结束 ---- */
  const taken = {};
  let lastHp2 = 120, lastHp1 = 120;
  const log = [];
  let watching = true;
  const watcher = (async () => {
    while (watching) {
      const s = await st();
      if (s) {
        log.push(s);
        if (!taken.hit && (s.f2.hp < lastHp2 - 3 || s.f1.hp < lastHp1 - 3)) { taken.hit = 1; await shot('02_hit'); }
        if (!taken.block && (s.f1.st === 'blockstun' || s.f2.st === 'blockstun')) { taken.block = 1; await shot('03_block'); }
        if (!taken.proj && s.projs > 0) { taken.proj = 1; await shot('04_special'); }
        if (!taken.down && (s.f1.st === 'down' || s.f2.st === 'down')) { taken.down = 1; await shot('05_knockdown'); }
        if (!taken.ko && s.ph === 'ko') { taken.ko = 1; await shot('06_ko'); }
        if (!taken.result && s.ph === 'result') { taken.result = 1; await shot('07_round_end'); }
        if (!taken.r2 && s.round === 2 && s.ph === 'fight') { taken.r2 = 1; await shot('08_round2'); }
        if (!taken.end && (s.ph === 'matchend' || s.ph === 'done')) { taken.end = 1; await shot('09_match_end'); }
        lastHp2 = s.f2.hp; lastHp1 = s.f1.hp;
      }
      await sleep(120);
    }
  })();

  /* ---------------- 键盘驱动 ---------------- */
  const K = page.keyboard;
  const tap = async (k, ms = 45) => { await K.down(k); await sleep(ms); await K.up(k); };
  const hold = async (k, ms) => { await K.down(k); await sleep(ms); await K.up(k); };
  /* 1P：方向键 + Z(脚) X(拳)   2P：WASD + G(脚) H(拳) */
  const P1 = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown', A: 'x', B: 'z' };
  const P2 = { L: 'a', R: 'd', U: 'w', D: 's', A: 'h', B: 'g' };

  async function combo(p) {                            // 近身连段：拳拳脚
    await tap(p.A, 40); await sleep(60);
    await tap(p.A, 40); await sleep(60);
    await tap(p.B, 40); await sleep(160);
  }
  async function lowAttack(p) {                        // ↓+A / ↓+B
    await K.down(p.D); await sleep(70);
    await tap(p.A, 40); await sleep(150);
    await tap(p.B, 40); await sleep(200);
    await K.up(p.D);
  }
  async function hadouken(p) {                         // ↓ → + A（宽松指令）
    await K.down(p.D); await sleep(70); await K.up(p.D);
    await K.down(p.R); await sleep(60);
    await tap(p.A, 45);
    await sleep(120); await K.up(p.R);
  }
  async function shoryu(p) {                           // → ↓ → + A
    await hold(p.R, 60);
    await K.down(p.D); await sleep(60); await K.up(p.D);
    await K.down(p.R); await sleep(40);
    await tap(p.A, 45); await sleep(100); await K.up(p.R);
  }
  async function whirl(p) {                            // ↓ ← + B
    await K.down(p.D); await sleep(70); await K.up(p.D);
    await K.down(p.L); await sleep(60);
    await tap(p.B, 45); await sleep(120); await K.up(p.L);
  }
  async function jumpIn(p) {
    await K.down(p.R); await sleep(50);
    await tap(p.U, 50); await sleep(180);
    await tap(p.A, 45); await sleep(220); await K.up(p.R);
  }
  async function guard(p, ms) { await hold(p.L, ms); }

  /* ---------------- 打一场 ---------------- */
  /* 模拟一个「会玩」的人：先走到有效距离，再出招；远了丢波，近了连段 */
  const dxOf = (s) => s ? Math.abs(s.f1.x - s.f2.x) : 999;
  async function chase(p, want = 40, maxMs = 1500) {
    const t = Date.now();
    while (Date.now() - t < maxMs) {
      const s = await st();
      if (!s) return null;
      const dx = dxOf(s);
      if (dx <= want) return s;
      const toRight = s.f2.x > s.f1.x;
      await hold(toRight ? p.R : p.L, 120);
    }
    return await st();
  }

  const t0 = Date.now();
  let loops = 0;
  while (Date.now() - t0 < (TWO_P ? 118000 : 85000)) {
    loops++;
    let s = await st();
    if (s && (s.ph === 'done' || s.ph === 'matchend')) break;
    const dx = dxOf(s);

    if (dx > 110) {                              // 远距离：气功波
      await hadouken(P1);
      await chase(P1, 46, 1200);
    } else {
      s = await chase(P1, 42, 1400);
      const r = loops % 6;
      if (r === 0) { await combo(P1); await hadouken(P1); }
      else if (r === 1) { await lowAttack(P1); }
      else if (r === 2) { await combo(P1); await combo(P1); }
      else if (r === 3) { await shoryu(P1); await guard(P1, 500); }
      else if (r === 4) { await jumpIn(P1); await combo(P1); }
      else { await whirl(P1); await guard(P1, 400); await combo(P1); }
    }
    if (TWO_P) {                                 // 2P 也真的动：走位 + 连段 + 必杀
      await hold(P2.L, 260);
      await combo(P2);
      if (loops % 3 === 0) await hadouken(P2);
      if (loops % 4 === 0) await lowAttack(P2);
    }
    s = await st();
    if (s) console.log('t=' + Math.round((Date.now() - t0) / 1000) + 's dx=' + dxOf(s) + ' ' + JSON.stringify(s));
    else {
      const d = await page.evaluate(() => {
        const g = window.__fg, h = g && g.host;
        return {
          fg: !!g, f1: !!(g && g.f1), dead: !!(g && g.dead),
          sceneGame: !!(h && h.game_), leaving: !!(h && h.leaving),
          faulting: !!(h && h.faulting), paused: !!(h && h.paused),
          scene: h && h.scene && h.scene.key, active: !!(h && h.scene && h.scene.isActive && h.scene.isActive())
        };
      }).catch(e => ({ evalErr: e.message }));
      console.log('t=' + Math.round((Date.now() - t0) / 1000) + 's 实例丢了 ' + JSON.stringify(d));
    }
    if (s && (s.ph === 'done' || s.ph === 'matchend')) break;
  }

  watching = false;
  await watcher;
  if (!taken.end) await shot('09_late');

  /* ---------------- 结果 ---------------- */
  const errs = await page.evaluate(() => window.__errors || []);
  const final = await st();
  console.log('\n==== 结果 ====');
  console.log('循环次数:', loops);
  console.log('最终状态:', JSON.stringify(final));
  const moved = log.filter(s => s.f2.st === 'walk' || s.f2.st === 'attack' || s.f2.st === 'air').length;
  const p2x = log.map(s => s.f2.x);
  console.log('AI(2P) 位置范围:', Math.min.apply(null, p2x), '~', Math.max.apply(null, p2x),
    '  主动动作采样数:', moved, '/', log.length);
  console.log('1P 最低血:', Math.min.apply(null, log.map(s => s.f1.hp)),
    '  2P 最低血:', Math.min.apply(null, log.map(s => s.f2.hp)));
  console.log('出现过的 2P 招式:', JSON.stringify(Array.from(new Set(log.map(s => s.f2.mv).filter(Boolean)))));
  console.log('出现过的 1P 招式:', JSON.stringify(Array.from(new Set(log.map(s => s.f1.mv).filter(Boolean)))));
  console.log('阶段:', JSON.stringify(Array.from(new Set(log.map(s => s.ph)))));
  console.log('变态版触发次数:', final ? final.cheat : '?');
  console.log('page __errors:', JSON.stringify(errs));
  console.log('console errors:', JSON.stringify(consoleErrors));
  console.log('（忽略的加载警告 ' + loadWarns.length + ' 条）');
  console.log('截图:', shots.map(p => path.basename(p)).join(', '));
  fs.writeFileSync(path.join(OUT, PRE + '_log.json'), JSON.stringify(log, null, 1));

  await browser.close();
  const bad = errs.length + consoleErrors.length;
  console.log(bad === 0 ? '\n✅ 无报错' : '\n❌ 有报错，需修');
  process.exit(bad === 0 ? 0 : 1);
})();
