/* 第二段真流程：集市一口价买卡 → 发小家借卡 → 妈妈进门（被抓 / 逃过）→ 第 48 天结局。
 * 杂货摊、砍价、双打、写作业、手机触屏在 flow3_test.js 里，这里不重复。
 * 只用玩家能用的操作（方向键 / A / B / START、鼠标点），跑完打印 PASS / FAIL。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'flow2');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ok = (c, msg) => { (c ? pass : fail).push(msg); console.log((c ? '  PASS ' : '  FAIL ') + msg); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1200);

  const key = async (k, n = 1, gap = 280) => {
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
  const pick = async (re) => {
    const m = await menu();
    if (!m) { console.log('    ！没菜单'); return false; }
    const idx = m.labels.findIndex(l => re.test(l));
    if (idx < 0) { console.log('    ！菜单里没有 ' + re + '：' + m.labels.join(' / ')); return false; }
    let guard = 0;
    while (guard++ < 30) {
      const cur = await menu();
      if (!cur || cur.cur === idx) break;
      await key(cur.cur < idx ? 'ArrowDown' : 'ArrowUp', 1, 170);
    }
    console.log('    选「' + m.labels[idx] + '」');
    await key('x', 1, 420);
    return true;
  };
  /* 切场景。注意：同一帧里对同一个场景先 stop 再 start，会被 Phaser 的场景队列
   * 处理成「刚开就被关掉」，所以正在跑的场景要走 restart。 */
  const goto = (sceneKey, data) => page.evaluate((a) => {
    const g = window.SB.game;
    g.scene.getScenes(true).forEach(s => {
      if (s.scene.key !== 'Sys' && s.scene.key !== a.sceneKey) s.scene.stop();
    });
    const target = g.scene.getScene(a.sceneKey);
    if (target && g.scene.isActive(a.sceneKey)) target.scene.restart(a.data || {});
    else g.scene.start(a.sceneKey, a.data || {});
  }, { sceneKey, data });

  /* 开一局干净的档，然后直接落到指定场景 */
  const start = async (sceneKey, data, patch) => {
    await page.evaluate((p) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      Object.assign(S.Save.d, p || {});
      S.Save.save();
    }, patch);
    await goto(sceneKey, data);
  };

  /* ================= 1. 集市一口价买卡 ================= */
  console.log('=== 集市 · 一口价 ===');
  await start('Market', { from: 'test' }, { money: 60, ap: 4, __nomom: true });
  await sleep(2000);
  await clearDialog();
  await shot('01_market');
  const b0 = await page.evaluate(() => ({ money: window.SB.Save.d.money, n: window.SB.Save.ownedCarts().length }));
  await key('x', 1, 800);                       // 光标默认在老王摊上
  const lm = await menu();
  console.log('    摊上有：' + (lm ? lm.labels.slice(0, 6).join(' / ') : '（没菜单）'));
  ok(!!lm, '老王摊上的卡带菜单能打开');
  if (lm) {
    await key('x', 1, 700);                     // 挑第一张
    await clearDialog();                        // 听他吹一段
    await sleep(400);
    const ch = await menu();
    console.log('    能干：' + (ch ? ch.labels.join(' / ') : '（没菜单）'));
    ok(!!ch && ch.labels.some(l => /就这个价/.test(l)), '给出「买 / 砍 / 再看看」三个选择');
    await pick(/就这个价/);
    await sleep(700);
    await clearDialog();
    await sleep(400);
    const b1 = await page.evaluate(() => ({ money: window.SB.Save.d.money, n: window.SB.Save.ownedCarts().length }));
    console.log('    一口价之后：卡 ' + b0.n + '→' + b1.n + '，钱 ¥' + b0.money + '→¥' + b1.money);
    ok(b1.n === b0.n + 1, '卡带真的到手了');
    ok(b1.money < b0.money, '钱扣掉了');
    await shot('02_bought');
  }

  /* ================= 2. 发小家借卡 ================= */
  console.log('=== 发小家 · 借卡 ===');
  await start('Friend', { from: 'test' }, { ap: 4, __nomom: true });
  await sleep(2000);
  await clearDialog();
  await shot('03_friend');
  /* 走到发小身上（不是电视） */
  let guard = 0, at = '';
  while (guard++ < 6) {
    at = await page.evaluate(() => { const f = window.SB.game.scene.getScene('Friend'); return f.spots[f.cur].id; });
    if (at !== 'tv') break;
    await key('ArrowDown', 1, 300);
  }
  console.log('    光标停在：' + at);
  const borrowedNow = () => page.evaluate(() => {
    const o = {};
    Object.keys(window.SB.Save.d.carts).forEach(k => {
      const c = window.SB.Save.d.carts[k];
      if (c.borrowed > 0) o[k] = c.borrowed;
    });
    return o;
  });
  /* 他会随机不肯借（稀有卡更不肯），所以多问几次 */
  let borrowed = {}, menuSeen = false;
  for (let tryN = 0; tryN < 5 && !Object.keys(borrowed).length; tryN++) {
    await key('x', 1, 800);
    const fm = await menu();
    if (!fm) { await clearDialog(); continue; }
    menuSeen = true;
    if (tryN === 0) console.log('    能干：' + fm.labels.join(' / '));
    if (!(await pick(/借/))) { await clearDialog(); continue; }
    await sleep(700);
    const sub = await menu();
    if (!sub) { await clearDialog(); continue; }
    if (tryN === 0) console.log('    他有：' + sub.labels.join(' / '));
    /* 挑一张不同的（越往后越常见，越容易借到） */
    const idx = Math.min(tryN, Math.max(0, sub.labels.length - 2));
    while ((await menu()) && (await menu()).cur !== idx) await key('ArrowDown', 1, 170);
    await key('x', 1, 700);
    await clearDialog();
    await sleep(300);
    borrowed = await borrowedNow();
    console.log('    第 ' + (tryN + 1) + ' 次问：' + (Object.keys(borrowed).length ? JSON.stringify(borrowed) : '他没借'));
  }
  ok(menuSeen, '发小这儿的菜单能打开');
  ok(Object.keys(borrowed).length > 0, '借来的卡带记在存档里（' + JSON.stringify(borrowed) + '，七天后要还）');
  await shot('04_borrowed');
  /* 回自己家的鞋盒看一眼，借来的卡要认得出来 */
  await goto('Shelf', { from: 'test' });
  await sleep(1800);
  await clearDialog();
  const shelf = await page.evaluate(() => {
    const sh = window.SB.game.scene.getScene('Shelf');
    const ids = Object.keys(window.SB.Save.d.carts).filter(k => window.SB.Save.d.carts[k].borrowed > 0);
    return { ids: ids, cells: sh && sh.cells ? sh.cells.length : -1 };
  });
  console.log('    鞋盒里：借来的 ' + JSON.stringify(shelf.ids) + '，格子 ' + shelf.cells);
  ok(shelf.cells === 12, '鞋盒还是 12 格');
  ok(shelf.ids.length > 0, '借来的卡也躺在鞋盒里');
  await shot('05_shelf_borrowed');

  /* ================= 3. 妈妈进门 ================= */
  /* 这段不设 __nomom，让妈妈真的回来。她原本要走完一整个时段，
   * 这里把 eta 压到几秒，等价于「玩了很久」。 */
  const enterPlayWithMom = async (etaMs) => {
    await page.evaluate((eta) => {
      const S = window.SB;
      S.Parent.disarm();                 // 上一场的状态别带过来
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.inserted = '02'; S.Save.d.seated = true; S.Save.d.tvOn = true;
      S.Save.d.carts['02'].dirt = 0; S.Save.d.carts['02'].wear = 0; S.Save.d.slotDirt = 0;
      S.Save.save();
      const g = S.game;
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
      g.scene.start('Play', { cartId: '02' });
      /* PlayScene 起来之后自己会 arm 一次，等它 arm 完再压表 */
      S.Parent.lastResult = null;        // 别把上一场的清算结果读成这一场的
      setTimeout(function () { S.Parent.eta = eta; S.Parent.t = 0; }, 2600);
    }, etaMs);
  };
  const waitFor = async (fn, tries = 20, gap = 700) => {
    for (let i = 0; i < tries; i++) {
      const v = await page.evaluate(fn);
      if (v) return v;
      await sleep(gap);
    }
    return null;
  };

  console.log('=== 妈妈进门 · 坐着不动 ===');
  await enterPlayWithMom(6000);
  const warned = await waitFor(() => {
    const st = window.SB.Parent.state;
    return (st === 'w1' || st === 'w2' || st === 'w3') ? st : null;
  }, 20, 600);
  console.log('    预警到了：' + warned);
  ok(!!warned, '玩到一半会先给预警（' + warned + '）');
  await shot('06_mom_warn');
  const busted = await waitFor(() => window.SB.Parent.lastResult ? {
    res: window.SB.Parent.lastResult,
    caught: window.SB.Save.d.caught, hw: window.SB.Save.d.homework, trust: window.SB.Save.d.momTrust
  } : null, 20, 700);
  console.log('    清算：' + JSON.stringify(busted));
  ok(busted && busted.res.level === 2, '开着电视被抓 = 现行（level 2）');
  ok(busted && busted.caught === 1, '被抓次数记上了');
  ok(busted && !!busted.res.punish, '有惩罚（' + (busted && busted.res.punish) + '）');
  ok(busted && busted.hw === 100, '第一次被抓 = 罚写作业（homework 直接顶满）');
  /* 妈妈走进来 → 说完话 → 计时器归位，这几步都要等 */
  await waitFor(() => /Room/.test(window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',')) ? 1 : null, 14, 700);
  await clearDialog(14);
  const backRoom = await waitFor(() => {
    const sc = window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',');
    return (/Room/.test(sc) && window.SB.Parent.state === 'idle')
      ? { sc: sc, parent: window.SB.Parent.state, tvOn: window.SB.Save.d.tvOn }
      : null;
  }, 14, 700) || await page.evaluate(() => ({
    sc: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
    parent: window.SB.Parent.state, tvOn: window.SB.Save.d.tvOn
  }));
  console.log('    收场：' + JSON.stringify(backRoom));
  ok(!!backRoom, '被抓之后回到客厅');
  ok(backRoom && backRoom.tvOn === false, '她把电视关了');
  ok(backRoom && backRoom.parent === 'idle', '妈妈状态归位（下一个时段还能再来）');
  await shot('07_mom_busted');

  console.log('=== 妈妈进门 · 抢救那三下 ===');
  await enterPlayWithMom(12000);
  const warned2 = await waitFor(() => {
    const st = window.SB.Parent.state;
    return (st === 'w1' || st === 'w2') ? st : null;
  }, 24, 500);
  console.log('    听见动静：' + warned2);
  ok(!!warned2, '第二次也照样先给预警');

  /* 预警时按 START 不再是「一键关电视」，而是开始收拾：
   * 关电视、拔卡带、塞沙发缝，三下都要看着判定条按。
   * 自动化里把光标按在正中间再按，否则手滑与否全凭运气。 */
  const aim = () => page.evaluate(() => {
    const R = window.SB.Rescue;
    if (R.live) { R.cursor = R.center; R.speed = 0; }
  });
  await key('Enter', 1, 800);
  const inRescue = await page.evaluate(() => {
    const P = window.SB.game.scene.getScene('Play');
    return { on: !!(P && P.rescueOn), n: window.SB.Rescue.steps.length };
  });
  console.log('    进抢救：' + JSON.stringify(inRescue));
  ok(inRescue.on && inRescue.n === 3, 'START 开始收拾，三件事排好了队');

  for (let i = 0; i < 3; i++) { await aim(); await key('x', 1, 340); }
  await sleep(1800);
  const afterRescue = await page.evaluate(() => ({
    scene: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
    tvOn: window.SB.Save.d.tvOn,
    inserted: window.SB.Save.d.inserted,
    hidden: window.SB.Save.d.hidden,
    clean: window.SB.Save.d.stats.rescueClean
  }));
  console.log('    三下按完：' + JSON.stringify(afterRescue));
  ok(afterRescue.tvOn === false, '第一下：电视关了');
  ok(!afterRescue.inserted, '第二下：卡带拔出来了');
  ok(afterRescue.hidden === '02', '第三下：卡带塞进沙发缝了');
  ok(afterRescue.clean >= 1, '一下没滑 = 干净收场记上了');
  await waitFor(() => /Room/.test(window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',')) ? 1 : null, 10, 600);
  await clearDialog();
  await shot('08_rescue_room');

  const safe = await waitFor(() => window.SB.Parent.lastResult ? {
    res: window.SB.Parent.lastResult, escaped: window.SB.Save.d.escaped, trust: window.SB.Save.d.momTrust
  } : null, 26, 700);
  console.log('    清算：' + JSON.stringify(safe));
  ok(safe && safe.res.level === 0, '电视关了、卡也收了 = 蒙过去了（level 0）');
  ok(safe && safe.escaped >= 1, '躲过次数记上了');
  ok(safe && safe.trust > 50, '妈妈的信任还涨了一点（' + (safe && safe.trust) + '）');
  await clearDialog(14);
  await shot('10_mom_safe');

  /* ================= 4. 第 48 天 → 结局 ================= */
  console.log('=== 暑假最后一天 ===');
  await page.evaluate(() => {
    const S = window.SB;
    S.Parent.disarm();
    S.Save.reset();
    S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
    S.Save.d.day = S.Time.summerDayCount;      // 8 月 31 日
    S.Save.d.slot = 4;                         // 天已经黑了，门口菜单第一项就是睡觉
    S.Save.d.album = ['第一次开机'];
    S.Save.save();
  });
  await goto('Room', { from: 'test' });
  await sleep(2400);
  await clearDialog();
  const lastDay = await page.evaluate(() => ({ day: window.SB.Save.d.day, isLast: window.SB.Time.isLastDay() }));
  console.log('    今天：第 ' + lastDay.day + ' 天，最后一天=' + lastDay.isLast);
  ok(lastDay.isLast, '第 48 天就是暑假最后一天');
  /* 去门口选「睡觉」：先点门，点不开就用方向键走过去按 A */
  let dm = null;
  for (let i = 0; i < 4 && !dm; i++) {
    if (i % 2 === 0) {
      await page.mouse.click(box.x + box.w * (424 / 480), box.y + box.h * (150 / 270));  // 门
      await sleep(800);
    } else {
      let g2 = 0;
      while (g2++ < 16) {
        const now = await page.evaluate(() => {
          const r = window.SB.game.scene.getScene('Room');
          return r && !r.busy ? r.spots[r.cur].id : 'busy';
        });
        if (now === 'door') break;
        await key('ArrowRight', 1, 200);
      }
      await key('x', 1, 800);
    }
    dm = await menu();
    if (!dm) {
      console.log('    没开：' + JSON.stringify(await page.evaluate(() => {
        const r = window.SB.game.scene.getScene('Room');
        return {
          scene: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
          busy: r && r.busy, cur: r && r.spots && r.spots[r.cur] && r.spots[r.cur].id,
          dlg: window.SB.__dialogOpen
        };
      })));
      await clearDialog();
    }
  }
  console.log('    门口能干：' + (dm ? dm.labels.join(' / ') : '（没菜单）'));
  ok(!!dm, '门口菜单能打开');
  if (dm) await pick(/睡觉/);
  /* 结局的过场文字要一段段按过去 */
  for (let i = 0; i < 24; i++) {
    await key('x', 1, 320);
    const sc = await scenes();
    if (/Album/.test(sc)) break;
  }
  await sleep(1500);
  await clearDialog(10);
  const endState = await page.evaluate(() => ({
    scene: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
    finished: !!window.SB.Save.d.flags.finished,
    album: window.SB.Save.d.album.slice(0, 8),
    stats: window.SB.Save.d.stats
  }));
  console.log('    ' + JSON.stringify(endState));
  ok(/Album/.test(endState.scene), '过场读完落在回忆册页');
  ok(endState.finished, '存档记下「这个暑假过完了」（flags.finished）');
  ok(endState.album.length >= 1, '回忆册里有条目：' + endState.album.join(' / '));
  await shot('11_ending');

  console.log('--- 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 8).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '整段没有 JS 报错');
  await browser.close();

  console.log('\n=== ' + pass.length + ' 过 / ' + fail.length + ' 挂 ===');
  fail.forEach(f => console.log('  挂：' + f));
})();
