/* 两个 bug 的回归测试：标题页的「不了」死屏，和客厅里叠在一起的点击框。
 *
 * 为什么要有这个文件：这两处都是「玩家点了，屏幕不给回应」，
 * 光看代码看不出来，必须真按键、真点鼠标，把当初的故障路径原样走一遍。
 *
 * 一、标题页（Bug 1：选「重新过一次暑假」→ 确认菜单点「不了」→ 整屏死掉）
 *   1. 主菜单会自己端上来，光标在第一项
 *   2. 走到「重新过一次暑假」按 A，弹出确认菜单
 *   3. 键盘选「不了」→ 主菜单必须回来，且光标就停在「重新过一次暑假」上，
 *      底部键位提示跟着回到主菜单那一套
 *   4. 回来的菜单是活的：能再打开一次确认菜单，B 键取消也退得回来
 *   5. 鼠标路径同样走一遍（真机上玩家多半是用鼠标点的）
 *   6. 选「重新开始」还是要能真的开新档，进客厅
 *   7. 兜底机制单测：强行把主菜单关掉（模拟任何一条以后可能漏掉的出口），
 *      半秒内主菜单必须自己回来 —— 这一屏永远不许出现「一个能点的都没有」
 *
 * 二、客厅（Bug 2：小方桌和门的点击框重叠 56×22，选中反馈几乎看不见）
 *   8. 13 个点击框两两算一遍：不许重叠，且至少留 2px 缝
 *   9. 每个框的中心点 hover 下去，命中的必须是它自己
 *  10. 小方桌中心点下去开的是小方桌菜单，门中心点下去开的是门菜单
 *  11. TAB 走完一圈 13 个目标：底部提示、选中框、物件名标签三处说的是同一个东西
 *
 * 用法：先在本仓库根目录起 python3 -m http.server 8100，
 *       再 node tools/gametest/bugfix_title_room_test.js  [端口]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARG = process.env.PORT || process.argv[2] || '8100';
// 传端口就跑本地，传完整 http(s) 地址就直接跑线上那一份
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/$/, '') : 'http://localhost:' + ARG;
const OUT = path.join(__dirname, 'bugfix');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const shot = (tag) => page.screenshot({ path: path.join(OUT, tag + '.png') });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(240); } };

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);   // 「点击开机」，顺手解锁音频
  await sleep(1400);

  /* 游戏内逻辑坐标 → 页面坐标（Scale.FIT，等比铺在 canvas 里） */
  const scale = box.w / 480;
  const moveTo = async (gx, gy) => {
    await page.mouse.move(box.x + gx * scale, box.y + gy * scale);
    await sleep(200);
  };
  const clickGame = async (gx, gy) => {
    await moveTo(gx, gy);
    await page.mouse.down(); await sleep(90); await page.mouse.up();
    await sleep(520);
  };

  /* 干净存档 + 直接开某一屏（妈妈不来敲门，免得对话打断测试） */
  const startScene = async (sceneKey, patch, data) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.__nomom = true;
      if (a.patch) Object.keys(a.patch).forEach(k => { S.Save.d[k] = a.patch[k]; });
      S.Save.save();
      const g = S.game;
      const target = g.scene.getScene(a.k);
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== a.k) s.scene.stop(); });
      /* 同一帧里 stop 又 start 同一个场景，旧的 shutdown 会把新建出来的东西一起清掉
       * （菜单看着在、其实已经被摘掉了）。已经在这一屏就老实 restart。 */
      if (target && target.scene.isActive()) target.scene.restart(a.d || {});
      else g.scene.start(a.k, a.d || {});
    }, { k: sceneKey, patch: patch, d: data });
    await sleep(2600);
  };

  /* 把本机的存档抹掉，回到「从没玩过」的状态 */
  const noSave = async () => page.evaluate(() => { window.SB.Save.wipe(); });

  /* 这一屏现在是什么状态：有没有菜单、光标在哪、提示条写着什么、在哪个场景 */
  const state = () => page.evaluate(() => {
    const S = window.SB;
    const m = S.__menu;
    const sc = S.game.scene.getScene('Title');
    const open = !!(m && m.isOpen && m.isOpen());
    return {
      open: open,
      labels: open ? m.debug().labels : null,
      cur: open ? m.debug().cur : -1,
      label: open ? m.debug().labels[m.debug().cur] : null,
      sceneMenu: !!(sc && sc.menu && sc.menu.isOpen && sc.menu.isOpen()),
      hint: sc && sc.hint ? sc.hint.full() : '',
      /* 「屏幕上一个能点的都没有」= 死屏。判定只看外部可观测的状态
       * （没有菜单、没有对话、没有过场），不依赖修复本身引入的任何辅助函数，
       * 这样这份脚本拿去跑修复前的代码一样能亮红。 */
      idle: !open && !(S.__dialogOpen > 0) && !(S.__interludeOpen > 0),
      at: S.game.scene.getScenes(true).map(s => s.scene.key).join(',')
    };
  });

  const clearDialog = async () => {
    for (let i = 0; i < 14; i++) {
      if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
      await page.keyboard.press('x'); await sleep(240);
    }
    await sleep(300);
  };

  /* ================================================================ 一、标题页 */
  console.log('\n【标题页】选「重新过一次暑假」再点「不了」，不许死屏');
  await startScene('Title', { day: 3, money: 20 });

  let st = await state();
  ok(st.open && st.cur === 0, '进标题就有菜单，光标在第一项（现在是「' + st.label + '」）');
  const NEW = '重新过一次暑假';
  const idxNew = st.labels ? st.labels.indexOf(NEW) : -1;
  ok(idxNew > 0, '菜单里有「' + NEW + '」这一项（第 ' + idxNew + ' 行）');

  /* --- 键盘路径 --- */
  for (let i = 0; i < 6; i++) {
    st = await state();
    if (st.label === NEW) break;
    await key('ArrowDown');
  }
  st = await state();
  ok(st.label === NEW, '方向键能走到「' + NEW + '」');
  const hintMain = st.hint;

  await key('x');                                   // A 键：打开确认菜单
  st = await state();
  ok(st.open && String(st.labels) === '不了,重新开始', '弹出确认菜单：' + st.labels);
  ok(/返回/.test(st.hint), '确认菜单的提示里写着「返回」（这一层是可以退的）');
  await shot('01_title_confirm');

  await key('x');                                   // 光标停在「不了」，A 键选它
  st = await state();
  ok(!st.idle, '点了「不了」之后屏幕不是死的（还有能操作的东西）');
  ok(st.open && st.sceneMenu, '主菜单被端回来了');
  ok(st.label === NEW, '光标就停在「' + NEW + '」上（实际：' + st.label + '）');
  ok(st.hint === hintMain, '底部提示恢复成主菜单那一套：' + st.hint);
  ok(st.at.indexOf('Title') >= 0, '还留在标题页，没有莫名跳走');
  await shot('02_title_back');

  /* --- 回来的菜单必须是活的：再进一次，这次用 B 键退 --- */
  await key('x');
  st = await state();
  ok(String(st.labels) === '不了,重新开始', '退回来的主菜单还能再打开确认菜单');
  await key('z');                                   // B 键：取消
  st = await state();
  ok(st.open && st.sceneMenu && st.label === NEW, 'B 键取消也退回主菜单，光标不动');

  /* --- 鼠标路径：玩家真机上多半是用鼠标点的 --- */
  /* 主菜单：y=136、无标题（titleH=8）、行高 20 → 第 i 行中心 */
  const mainRowY = (i) => 136 + 8 + i * 20 + 2 + 10;
  /* 确认菜单：默认居中，宽 260、有标题（titleH=22）、两行、行高 20 */
  const confirmRowY = (i) => {
    const H = 22 + 2 * 20 + 10;
    const Y = Math.round((270 - H) / 2);
    return Y + 22 + i * 20 + 2 + 10;
  };
  await clickGame(240, mainRowY(idxNew));            // 点「重新过一次暑假」
  st = await state();
  ok(String(st.labels) === '不了,重新开始', '鼠标点「' + NEW + '」也能弹出确认菜单');
  await clickGame(240, confirmRowY(0));              // 第 0 行 = 「不了」
  st = await state();
  ok(!st.idle && st.open && st.label === NEW, '鼠标点「不了」同样退回主菜单，光标停在原处');

  /* --- 兜底机制单测：强行制造「一个菜单都不剩」的局面 --- */
  await page.evaluate(() => {
    const m = window.SB.__menu;
    if (m && m.isOpen && m.isOpen()) m.close();   // 已经是死屏时就不用再关了
  });
  await sleep(140);
  const dead = await state();
  ok(dead.idle && !dead.open, '（构造）主菜单被强行关掉，此刻屏幕确实是空的');
  await sleep(1200);
  st = await state();
  ok(st.open && st.sceneMenu, '兜底机制在半秒内把主菜单端了回来');
  ok(st.label === NEW, '端回来的光标还在「' + NEW + '」上');
  await shot('03_title_watchdog');

  /* --- 「重新开始」得真的能开新档 --- */
  await startScene('Title', { day: 3, money: 20 });  // 回到干净的标题页再走一次
  for (let i = 0; i < 6; i++) {
    st = await state();
    if (st.label === NEW) break;
    await key('ArrowDown');
  }
  await key('x');                                   // 打开确认菜单
  await key('ArrowDown');                           // 走到「重新开始」
  st = await state();
  ok(st.label === '重新开始', '确认菜单里能走到「重新开始」');
  await key('x');
  await sleep(2600);
  await clearDialog();
  const newGame = await page.evaluate(() => ({
    at: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','),
    day: window.SB.Save.d.day
  }));
  /* 新档现在先看 2026 年那个晚上（序章），走完 / 跳过才进客厅。
   * 这一条守的是「点了重新开始必须真的换屏」，序章和客厅都算过。 */
  ok(newGame.at.indexOf('Prologue') >= 0 || newGame.at.indexOf('Room') >= 0,
    '选「重新开始」真的开了新档，进到序章或客厅（' + newGame.at + '）');
  ok(newGame.day === 1, '新档从第 1 天开始（实际 day=' + newGame.day + '）');

  /* --- 没有存档时不该问「要把上一个夏天忘掉吗」 --- */
  await noSave();
  await page.evaluate(() => {
    const g = window.SB.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Title', {});
  });
  await sleep(2600);
  st = await state();
  ok(st.open && st.labels.indexOf('开始这个暑假') >= 0, '没存档时第一项是「开始这个暑假」：' + st.labels);
  await key('x');
  await sleep(2400);
  const fresh = await page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  ok(fresh.indexOf('Prologue') >= 0 || fresh.indexOf('Room') >= 0,
    '没存档时不弹确认，直接开始（现在在 ' + fresh + '）');

  /* ================================================================ 二、客厅热区 */
  console.log('\n【客厅】13 个点击框互不重叠，选中反馈看得见');
  await startScene('Room', { day: 2, money: 20 }, { from: 'test' });
  await clearDialog();

  const spots = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Room');
    return sc.spots.map(function (s) {
      const b = s.zone.getBounds();
      return {
        id: s.id, name: s.name, x: s.x, y: s.y, w: s.w, h: s.h,
        bx: Math.round(b.x), by: Math.round(b.y), bw: Math.round(b.width), bh: Math.round(b.height)
      };
    });
  });
  ok(spots.length === 13, '客厅一共 13 个可点的东西（实际 ' + spots.length + '）');

  let zoneMatch = true;
  spots.forEach(s => {
    if (s.bx !== s.x || s.by !== s.y || s.bw !== s.w || s.bh !== s.h) {
      zoneMatch = false;
      console.log('    ' + s.id + ' 声明 [' + s.x + ',' + s.y + ' ' + s.w + 'x' + s.h +
        '] 实际 [' + s.bx + ',' + s.by + ' ' + s.bw + 'x' + s.bh + ']');
    }
  });
  ok(zoneMatch, '每个热区的实际范围和声明的一致（点得到的就是写下来的）');

  /* 两两算一遍：GAP=2 —— 擦边点到的一定是玩家看见的那个东西 */
  const GAP = 2;
  const bad = [];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      /* 只要有一个方向分得开（缝 ≥ GAP），两个框就不会打架 */
      if (ox > -GAP && oy > -GAP) bad.push(a.id + ' × ' + b.id + '（x 相交 ' + ox + '，y 相交 ' + oy + '）');
    }
  }
  bad.forEach(s => console.log('    ' + s));
  ok(bad.length === 0, '13 个热区两两都不重叠，且至少留 ' + GAP + 'px 缝（犯规 ' + bad.length + ' 对）');

  /* 每个框的中心点 hover 下去，必须命中它自己 */
  const hoverInfo = async (gx, gy) => {
    await moveTo(gx, gy);
    return page.evaluate(() => {
      const S = window.SB;
      const sc = S.game.scene.getScene('Room');
      const sp = sc.spots[sc.cur];
      /* 选中态的物件名：v2 在舞台上挂 DOM 小标签，v1 画在画布上 */
      let tag = '';
      const el = document.querySelector('.focus-tag');
      if (el && el.offsetParent !== null) tag = (el.textContent || '').trim();
      if (!tag) {
        sc.children.list.forEach(function (o) {
          if (o.visible && typeof o.text === 'string' && o.depth >= S.D.FOCUS && o.text === sp.name) tag = o.text;
        });
      }
      const card = document.getElementById('focus-name');
      return {
        id: sp.id, name: sp.name, cur: sc.cur,
        hint: sc.hint ? sc.hint.full() : '',
        tag: tag,
        card: card ? (card.textContent || '').trim() : null
      };
    });
  };

  const miss = [];
  for (const s of spots) {
    const r = await hoverInfo(s.x + s.w / 2, s.y + s.h / 2);
    if (r.id !== s.id) miss.push(s.id + ' 的中心点却选中了 ' + r.id);
  }
  miss.forEach(s => console.log('    ' + s));
  ok(miss.length === 0, '13 个热区的中心点各自命中自己（错 ' + miss.length + ' 个）');

  const deskSp = spots.filter(s => s.id === 'desk')[0];
  const doorSp = spots.filter(s => s.id === 'door')[0];
  let r = await hoverInfo(deskSp.x + deskSp.w / 2, deskSp.y + deskSp.h / 2);
  ok(r.id === 'desk', '鼠标停在桌面正中 → 选中「小方桌」（实际：' + r.name + '）');
  ok(r.hint.indexOf('小方桌') === 0, '底部提示第一句就是「小方桌」：' + r.hint);
  ok(r.tag === '小方桌', '选中框边上的名字标签写着「小方桌」（实际：「' + r.tag + '」）');
  if (r.card !== null) ok(r.card === '小方桌', '舞台旁「眼下」卡片同步写着「小方桌」');
  await shot('04_room_desk');

  r = await hoverInfo(doorSp.x + doorSp.w / 2, doorSp.y + doorSp.h / 2);
  ok(r.id === 'door', '鼠标停在门中间 → 选中「门」（实际：' + r.name + '）');
  ok(r.tag === '门', '名字标签写着「门」（实际：「' + r.tag + '」）');
  await shot('05_room_door');

  /* 点下去开的菜单，必须是这个物件自己的菜单 */
  const menuLabels = () => page.evaluate(() => {
    const m = window.SB.__menu;
    return (m && m.isOpen && m.isOpen()) ? m.debug().labels : null;
  });
  await clickGame(deskSp.x + deskSp.w / 2, deskSp.y + deskSp.h / 2);
  let labels = await menuLabels();
  ok(!!labels && String(labels).indexOf('作业') >= 0, '点桌面开的是小方桌的菜单：' + labels);
  await key('z'); await sleep(400); await clearDialog();

  await clickGame(doorSp.x + doorSp.w / 2, doorSp.y + doorSp.h / 2);
  labels = await menuLabels();
  const doorMenu = !!labels && String(labels).indexOf('集市') >= 0 && String(labels).indexOf('睡觉') >= 0;
  ok(doorMenu, '点门开的是门的菜单：' + labels);
  await key('z'); await sleep(400); await clearDialog();

  /* TAB 走一圈：三处说的必须是同一个东西，且正好一圈回到原点 */
  const start = await page.evaluate(() => window.SB.game.scene.getScene('Room').cur);
  const seen = {}; let sync = true;
  for (let i = 0; i < spots.length; i++) {
    await page.keyboard.press('Tab'); await sleep(220);
    const cur = await page.evaluate(() => {
      const S = window.SB;
      const sc = S.game.scene.getScene('Room');
      const sp = sc.spots[sc.cur];
      let tag = '';
      const el = document.querySelector('.focus-tag');
      if (el && el.offsetParent !== null) tag = (el.textContent || '').trim();
      if (!tag) {
        sc.children.list.forEach(function (o) {
          if (o.visible && typeof o.text === 'string' && o.depth >= S.D.FOCUS && o.text === sp.name) tag = o.text;
        });
      }
      const card = document.getElementById('focus-name');
      return {
        cur: sc.cur, name: sp.name, hint: sc.hint ? sc.hint.full() : '', tag: tag,
        card: card ? (card.textContent || '').trim() : null
      };
    });
    seen[cur.cur] = 1;
    const same = cur.hint.indexOf(cur.name) === 0 && cur.tag === cur.name
      && (cur.card === null || cur.card === cur.name);
    if (!same) { sync = false; console.log('    第 ' + (i + 1) + ' 站不一致：' + JSON.stringify(cur)); }
  }
  ok(Object.keys(seen).length === spots.length, 'TAB 一圈走遍全部 ' + spots.length + ' 个目标（走到 ' + Object.keys(seen).length + ' 个）');
  const back = await page.evaluate(() => window.SB.game.scene.getScene('Room').cur);
  ok(back === start, 'TAB 正好一圈回到出发那个目标');
  ok(sync, 'TAB 每走一站：底部提示、名字标签、（v2）眼下卡片说的都是同一个物件');

  /* ================================================================ 收尾 */
  ok(errs.length === 0, '全程零 JS 报错' + (errs.length ? '：' + errs.slice(0, 4).join(' | ') : ''));

  console.log('\n通过 ' + pass + '，失败 ' + fail + '，截图在 ' + OUT);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
