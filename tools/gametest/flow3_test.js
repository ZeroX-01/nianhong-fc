/* 第三段补测：把 flow2 里没跑通的四件事单独拎出来，用正确的操作方式重跑。
 *   1. 集市杂货摊：真的买到棉签 / AV 线
 *   2. 集市砍价：一直砍到老王点头
 *   3. 发小家双打：选坦克，两个手柄都动
 *   4. 写作业：照真笔顺写字，进度要涨
 *   5. 手机：Play 和 Homework 的虚拟手柄都要在，点了要有反应
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'flow3');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ok = (c, msg) => { (c ? pass : fail).push(msg); console.log((c ? '  PASS ' : '  FAIL ') + msg); };

async function bootPage(page) {
  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1200);
  return box;
}

function helpers(page, scale) {
  const key = async (k, n = 1, gap = 260) => {
    for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); }
  };
  const scenes = () => page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  const shot = async (tag) => {
    const sc = await scenes();
    await page.screenshot({ path: path.join(OUT, tag + '.png') });
    console.log('    [' + tag + '] ' + sc);
  };
  const menu = () => page.evaluate(() => { const m = window.SB.__menu; return (m && m.isOpen()) ? m.debug() : null; });
  const clearDialog = async (max = 10) => {
    for (let i = 0; i < max; i++) {
      if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
      await key('x', 1, 200);
    }
    await sleep(200);
  };
  /* 在菜单里挑一项：先按方向键把光标走过去，再按 A */
  const pick = async (re) => {
    const m = await menu();
    if (!m) return false;
    const idx = m.labels.findIndex(l => re.test(l));
    if (idx < 0) { console.log('    菜单里没有 ' + re + '：' + m.labels.join(' / ')); return false; }
    let guard = 0;
    while (guard++ < 30) {
      const cur = await menu();
      if (!cur || cur.cur === idx) break;
      await key(cur.cur < idx ? 'ArrowDown' : 'ArrowUp', 1, 180);
    }
    console.log('    选「' + m.labels[idx] + '」');
    await key('x', 1, 400);
    return true;
  };
  const start = async (sceneKey, data, patch) => page.evaluate((a) => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true;
    S.Save.d.__nomom = true;
    Object.assign(S.Save.d, a.patch || {});
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start(a.sceneKey, a.data || {});
  }, { sceneKey, data, patch });
  return { key, scenes, shot, menu, clearDialog, pick, start };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  /* DEBUG_UI=1 时把每个对话框 / 菜单的开框记录打出来，排查「谁把菜单顶掉了」很好用 */
  if (process.env.DEBUG_UI) {
    page.on('console', m => { if (m.type() === 'log' && /^(DIALOG|MENU)@/.test(m.text())) console.log('      ~ ' + m.text()); });
    await page.exposeBinding('__trace', (_s, t) => console.log('      ~ ' + t)).catch(() => {});
  }
  await bootPage(page);
  if (process.env.DEBUG_UI) {
    await page.evaluate(() => {
      const S = window.SB;
      const od = S.UI.dialog.bind(S.UI), om = S.UI.menu.bind(S.UI);
      S.UI.dialog = function (sc, lines, opts) { console.log('DIALOG@' + sc.scene.key + ' :: ' + JSON.stringify(lines).slice(0, 80)); return od(sc, lines, opts); };
      S.UI.menu = function (sc, opts) { console.log('MENU@' + sc.scene.key + ' :: ' + (opts.title || '')); return om(sc, opts); };
    });
  }
  const H = helpers(page);

  /* ============ 1. 杂货摊 ============ */
  console.log('=== 集市 · 张老板的杂货摊 ===');
  await H.start('Market', { from: 'test' }, { money: 60, ap: 4 });
  await sleep(2000);
  await H.clearDialog();
  /* 键盘走到右边那个摊子，别用点击，免得被 busy 吃掉 */
  await H.key('ArrowRight', 1, 400);
  const spot = await page.evaluate(() => {
    const m = window.SB.game.scene.getScene('Market');
    return m.spots[m.cur].id;
  });
  console.log('    光标停在：' + spot);
  await H.key('x', 1, 800);
  let gm = await H.menu();
  console.log('    摊上有：' + (gm ? gm.labels.join(' / ') : '（没菜单）'));
  ok(!!gm, '张老板的杂货菜单能打开');
  await H.shot('01_goods_menu');
  if (gm) {
    const bag = () => page.evaluate(() => ({
      money: window.SB.Save.d.money,
      owned: Object.assign({}, window.SB.Save.d.owned),
      goods: Object.assign({}, window.SB.Save.d.goods)
    }));
    const before = await bag();
    /* 先买一件耗材（棉签，记在 goods），再买一件一次性的（AV 线，记在 owned） */
    await H.pick(/棉签/);
    await sleep(600);
    await H.clearDialog();
    await sleep(400);
    const mid = await bag();
    console.log('    买棉签：钱 ¥' + before.money + '→¥' + mid.money + '　goods=' + JSON.stringify(mid.goods));
    ok((mid.goods.swab || 0) > (before.goods.swab || 0), '耗材进包（goods.swab=' + (mid.goods.swab || 0) + '）');
    ok(mid.money < before.money, '买杂货扣了钱');

    await H.key('x', 1, 800);
    if (await H.pick(/AV/)) {
      await sleep(600);
      await H.clearDialog();
      await sleep(400);
      const after = await bag();
      console.log('    买 AV 线：钱 ¥' + mid.money + '→¥' + after.money + '　owned=' + JSON.stringify(after.owned));
      ok(!!after.owned.avline, '一次性物件进 owned（AV 线）');
      /* 再点一次，应该显示「已经有了」并且买不动 */
      await H.key('x', 1, 800);
      const again = await H.menu();
      const avRow = again ? again.labels.find(l => /AV/.test(l)) : null;
      console.log('    再看一眼 AV 线那行：' + avRow);
      await H.key('z', 1, 400);
      await H.clearDialog();
      const last = await bag();
      ok(last.money === after.money, '同一件一次性杂货不会重复卖给你');
    }
    await H.shot('02_goods_bought');
  }

  /* ============ 2. 砍价砍到成 ============ */
  console.log('=== 集市 · 砍价 ===');
  let haggled = false, rounds = 0;
  for (let attempt = 0; attempt < 3 && !haggled; attempt++) {
    await H.start('Market', { from: 'test' }, { money: 300, ap: 4 });
    await sleep(2000);
    await H.clearDialog();
    const m0 = await page.evaluate(() => ({ money: window.SB.Save.d.money, n: window.SB.Save.ownedCarts().length }));
    await H.key('x', 1, 800);                     // 光标默认在老王摊上
    const lm = await H.menu();
    if (!lm) { console.log('    老王的菜单没开，重来'); continue; }
    console.log('    摊上第一张：' + lm.labels[0]);
    await H.key('x', 1, 700);                     // 挑第一张卡
    await H.clearDialog();                        // 老王先吹一段
    await sleep(400);
    if (!(await H.pick(/砍砍价/))) { console.log('    没找到「砍砍价」'); continue; }
    await sleep(600);
    /* 一轮一轮往上出价：先试 0.88 那档，谈不成就接他的还价 */
    for (let r = 0; r < 5 && !haggled; r++) {
      const bids = await H.menu();
      if (!bids) break;
      rounds++;
      console.log('    第 ' + rounds + ' 轮：' + bids.labels.join(' / '));
      /* 优先接「行，¥x 就 ¥x」的还价，其次出最高那档 */
      const counter = bids.labels.findIndex(l => /^「行，/.test(l));
      const asks = bids.labels.map((l, i) => ({ l, i })).filter(o => /行不行/.test(o.l));
      const target = counter >= 0 ? counter : (asks.length ? asks[asks.length - 1].i : -1);
      if (target < 0) break;
      await H.pick(new RegExp(bids.labels[target].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await sleep(800);
      await H.clearDialog();
      await sleep(500);
      const now = await page.evaluate(() => ({ money: window.SB.Save.d.money, n: window.SB.Save.ownedCarts().length }));
      if (now.n > m0.n) {
        haggled = true;
        console.log('    砍成了：卡 ' + m0.n + '→' + now.n + '，钱 ¥' + m0.money + '→¥' + now.money +
          '（省了 ¥' + Math.round((m0.money - now.money) * 10) / 10 + ' 以内）');
      }
    }
  }
  ok(haggled, '砍价能真的砍成一单（' + rounds + ' 轮出价）');
  await H.shot('03_haggle_done');

  /* ============ 3. 发小家双打 ============ */
  console.log('=== 发小家 · 双打 ===');
  await H.start('Friend', { from: 'test' }, { ap: 4 });
  await sleep(2000);
  await H.clearDialog();
  /* 走到电视那儿 */
  let guard = 0, at = '';
  while (guard++ < 6) {
    at = await page.evaluate(() => { const f = window.SB.game.scene.getScene('Friend'); return f.spots[f.cur].id; });
    if (at === 'tv') break;
    await H.key('ArrowDown', 1, 300);
  }
  console.log('    光标停在：' + at);
  await H.key('x', 1, 900);
  let tv = await H.menu();
  console.log('    电视菜单：' + (tv ? tv.labels.join(' / ') : '（没菜单）'));
  ok(!!tv, '发小家电视能列出可玩的卡');
  if (tv) {
    await H.pick(/坦克/);                       // 坦克 = 能双打
    await sleep(600);
    await H.clearDialog(6);                     // 「他把 2P 手柄塞你手里」
    /* 等开机动画 + 小游戏起来 */
    let st = null;
    for (let i = 0; i < 14; i++) {
      await sleep(900);
      st = await page.evaluate(() => {
        const p = window.SB.game.scene.getScene('Play');
        return {
          scene: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
          twoP: !!(p && p.twoP), friend: !!(p && p.atFriend), inst: !!(p && p.game_)
        };
      });
      if (st.inst) break;
      await H.clearDialog(2);
    }
    console.log('    ' + JSON.stringify(st));
    ok(st && st.friend, '进的是发小家那台电视（atFriend）');
    ok(st && st.twoP, '坦克带起了双打（twoP=true）');
    ok(st && st.inst, '双打模式下小游戏实例真的建起来了');
    await H.shot('04_twoP_boot');
    /* 两边手柄各动一动，看 2P 是不是真的在场 */
    const p2before = await page.evaluate(() => {
      const g = window.SB.game.scene.getScene('Play').game_;
      const t = g && (g.tanks || g.players || g.p2);
      return JSON.stringify(g ? Object.keys(g).filter(k => /p2|two|tank|player/i.test(k)) : []);
    });
    console.log('    小游戏里跟 2P 有关的字段：' + p2before);
    for (const k of ['ArrowRight', 'x']) { await page.keyboard.down(k); await sleep(500); await page.keyboard.up(k); }
    for (const k of ['d', 'h', 'w', 'g']) { await page.keyboard.down(k); await sleep(500); await page.keyboard.up(k); }
    await sleep(700);
    await H.shot('05_twoP_input');
    const alive = await page.evaluate(() => {
      const g = window.SB.game.scene.getScene('Play').game_;
      if (!g) return null;
      const out = {};
      if (g.tanks) out.tanks = g.tanks.length;
      if (g.ps) out.ps = g.ps.length;
      if (g.players) out.players = g.players.length;
      out.twoP = !!g.twoP;
      return out;
    });
    console.log('    场上：' + JSON.stringify(alive));
    ok(alive && alive.twoP, '小游戏内部也认双打');
  }

  /* ============ 4. 写作业（真笔顺） ============ */
  console.log('=== 写作业 · 照笔顺 ===');
  await H.start('Homework', { from: 'test' }, { ap: 4 });
  await sleep(2000);
  await H.clearDialog();
  await H.shot('06_homework');
  const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  let wrote = 0;
  for (let ch = 0; ch < 4; ch++) {
    const cell = await page.evaluate(() => {
      const h = window.SB.game.scene.getScene('Homework');
      if (!h || !h.cells) return null;
      const c = h.cells[h.idx];
      return c ? { ch: c.ch.c, st: c.ch.st.slice(h.step), zoned: !!h.zoned } : null;
    });
    if (!cell) break;
    if (cell.zoned) { await H.key('x', 1, 300); }   // 走神了先醒过来
    console.log('    第 ' + (ch + 1) + ' 个字「' + cell.ch + '」笔顺 ' + cell.st.join('→'));
    for (const st of cell.st) { await page.keyboard.press(KEY[st]); await sleep(260); }
    await sleep(400);
    const now = await page.evaluate(() => window.SB.Save.d.homework);
    console.log('      写完进度 ' + now);
    wrote = now;
    await H.clearDialog(2);
  }
  await H.shot('07_homework_written');
  ok(wrote >= 36, '照笔顺写 4 个字，作业进度到了 ' + wrote + '（每字 +12）');
  const mind = await page.evaluate(() => Math.round(window.SB.game.scene.getScene('Homework').mind || 0));
  console.log('    心思跑了多少：' + mind);

  console.log('--- 桌面端错误 ' + errs.length + ' ---');
  errs.slice(0, 8).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '桌面端整段没有 JS 报错');
  await browser.close();

  /* ============ 5. 手机虚拟手柄 ============ */
  console.log('=== 手机 iPhone 12 横屏 ===');
  const ctx = await chromium.launchPersistentContext('', {
    ...devices['iPhone 12 landscape'], hasTouch: true, isMobile: true
  });
  const mp = ctx.pages()[0] || await ctx.newPage();
  const merrs = [];
  mp.on('pageerror', e => merrs.push('' + (e.message || e)));
  const box = await bootPage(mp);
  const MH = helpers(mp);

  /* 5a. Play 里的手柄 */
  await mp.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
    S.Save.d.inserted = '02'; S.Save.d.seated = true; S.Save.d.tvOn = true;
    S.Save.d.carts['02'].dirt = 0;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Play', { cartId: '02' });
  });
  await sleep(6200);
  await mp.screenshot({ path: path.join(OUT, '08_mobile_play.png') });
  const padInfo = await mp.evaluate(() => {
    const p = window.SB.game.scene.getScene('Play');
    return {
      want: window.SB.Input.wantTouch(),
      pad: !!(p && p.pad),
      parts: p && p.pad ? p.pad.parts.length : 0,
      inst: !!(p && p.game_)
    };
  });
  console.log('  Play 手柄：' + JSON.stringify(padInfo));
  ok(padInfo.want, '手机上判定要显示虚拟手柄');
  ok(padInfo.pad && padInfo.parts > 8, 'Play 里虚拟手柄建起来了（' + padInfo.parts + ' 个热区）');
  ok(padInfo.inst, '手机上小游戏实例正常');

  /* 按住十字键右侧，看输入是不是真的进去了 */
  const holdAt = async (fx, fy, ms = 500) => {
    const x = box.x + box.w * fx, y = box.y + box.h * fy;
    await mp.touchscreen.tap(x, y);
    await sleep(ms);
  };
  /* 逻辑分辨率 480x270 等比铺满，热区位置直接按比例换算到屏幕坐标 */
  const toScreen = (gx, gy) => ({ x: box.x + box.w * (gx / 480), y: box.y + box.h * (gy / 270) });
  const dpadRight = toScreen(6 + 52 + 40, 270 - 100 + 52);
  const btnA = toScreen(480 - 36, 270 - 40);
  await mp.touchscreen.tap(dpadRight.x, dpadRight.y);
  await sleep(300);
  await mp.touchscreen.tap(btnA.x, btnA.y);
  await sleep(400);
  await mp.screenshot({ path: path.join(OUT, '09_mobile_touch.png') });

  /* 5b. Homework 里的手柄（这次新加的） */
  await mp.evaluate(() => {
    const S = window.SB;
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Homework', { from: 'test' });
  });
  await sleep(2600);
  await MH.clearDialog();
  await mp.screenshot({ path: path.join(OUT, '10_mobile_homework.png') });
  const hwPad = await mp.evaluate(() => {
    const h = window.SB.game.scene.getScene('Homework');
    const p = h && h.pad;
    return {
      pad: !!p, parts: p ? p.parts.length : 0,
      dpad: p && p.dpadHit ? p.dpadHit : null,
      /* 方向那一块现在是「一整块按方位判方向」的大热区，不再是四个小方块，
       * 所以不数零件个数，直接看命中范围有多大（手指够不够得着）。 */
      zones: p ? p.parts.filter(o => o && o.type === 'Zone').length : 0
    };
  });
  console.log('  写作业手柄：' + JSON.stringify(hwPad));
  ok(hwPad.pad && !!hwPad.dpad && hwPad.dpad.half >= 60 && hwPad.zones >= 3,
    '手机上写作业也有方向键（命中范围 ' + (hwPad.dpad ? hwPad.dpad.half * 2 + '×' + hwPad.dpad.half * 2 : '?') + '）');
  /* 用触屏照笔顺写一个字 */
  const cell = await mp.evaluate(() => {
    const h = window.SB.game.scene.getScene('Homework');
    const c = h.cells[h.idx];
    return c ? { ch: c.ch.c, st: c.ch.st.slice(h.step) } : null;
  });
  if (cell) {
    console.log('  触屏写「' + cell.ch + '」：' + cell.st.join('→'));
    const cx = 6 + 52, cy = 270 - 100 + 52;
    const P = {
      up: toScreen(cx, cy - 40), down: toScreen(cx, cy + 40),
      left: toScreen(cx - 40, cy), right: toScreen(cx + 40, cy)
    };
    const hw0 = await mp.evaluate(() => window.SB.Save.d.homework);
    for (const st of cell.st) { await mp.touchscreen.tap(P[st].x, P[st].y); await sleep(320); }
    await sleep(500);
    const hw1 = await mp.evaluate(() => window.SB.Save.d.homework);
    console.log('  触屏写完：' + hw0 + ' → ' + hw1);
    ok(hw1 > hw0, '触屏方向键真的能写字（' + hw0 + '→' + hw1 + '）');
    await mp.screenshot({ path: path.join(OUT, '11_mobile_hw_written.png') });
  }

  console.log('--- 手机端错误 ' + merrs.length + ' ---');
  merrs.slice(0, 8).forEach(e => console.log('  ' + e));
  ok(merrs.length === 0, '手机端没有 JS 报错');
  await ctx.close();

  console.log('\n=== ' + pass.length + ' 过 / ' + fail.length + ' 挂 ===');
  fail.forEach(f => console.log('  挂：' + f));
})();
