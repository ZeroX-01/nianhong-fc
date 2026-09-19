/* 键位 + 可点返回 + 详情面板排版：专盯「玩家第一次上手会不会懵」的那几处。
 *
 * 覆盖三件事（都是真按键盘、真点鼠标，不去直接调场景里的函数）：
 *   1. 屏幕上写 A / B，键盘上的 A / B 就必须真的管用；双人同屏时 A 让给 2P，
 *      1P 的提示要自动改口写 X。提示条上的键名一个都不许被行宽截掉。
 *   2. 每个非全屏场景右上角都有一颗看得见、点得到的返回按钮；
 *      小游戏那一屏的「离开」只负责开暂停菜单，绝不一点就关电视。
 *   3. 卡带详情 / 回忆册右板的正文再长也不许压到下面的数值条上，也不许越出面板。
 *      所有卡带、所有回忆条目挨个量一遍。
 *
 * 用法：先起 python3 -m http.server 8100，再 node tools/gametest/keys_ui_test.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'keys_ui');
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

  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(240); } };
  const scenes = () => page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  const at = async (k) => (await scenes()).indexOf(k) >= 0;
  const shot = (tag) => page.screenshot({ path: path.join(OUT, 'test_' + tag + '.png') });

  /* ---------- 开机 ---------- */
  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  let box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);   // 「点击开机」，顺手解锁音频
  await sleep(1400);

  /* 量一段文字占的格子。Phaser 的 getBounds 对点阵字体不总靠得住，
   * 这里直接用游戏自己那套字宽表算，跟排版代码用的是同一把尺子。 */
  await page.evaluate(() => {
    window.__rect = function (o) {
      var S = window.SB;
      var size = o.fontSize || (o.style && parseInt(o.style.fontSize, 10)) || 12;
      size = (size >= 16) ? 16 : 12;
      var txt = (typeof o.text === 'string') ? o.text : '';
      var w = S.Text.width(txt, size), h = S.Text.height(txt, size);
      var x = o.x - (o.originX || 0) * w, y = o.y - (o.originY || 0) * h;
      return { x: x, y: y, w: w, h: h, left: x, top: y, right: x + w, bottom: y + h };
    };
    /* 点阵字库里没有的字会画成一片空白 —— 提示写得再好也白写。
     * 把这一屏所有看得见的字挨个查一遍字库。 */
    window.__missing = function (sceneKey) {
      var sc = window.SB.game.scene.getScene(sceneKey);
      var out = {};
      if (!sc) return [];
      sc.children.list.forEach(function (o) {
        if (!o.visible || typeof o.text !== 'string' || !o.text) return;
        if (!o.font || !sc.cache.bitmapFont.exists(o.font)) return;
        var chars = sc.cache.bitmapFont.get(o.font).data.chars;
        for (var i = 0; i < o.text.length; i++) {
          var ch = o.text[i];
          if (ch === '\n' || ch === ' ' || ch === '\u3000') continue;
          if (!chars[ch.charCodeAt(0)]) out[ch] = 1;
        }
      });
      return Object.keys(out);
    };
  });

  /* 游戏内坐标 → 页面坐标（Scale.FIT，等比铺在 canvas 里） */
  const clickGame = async (gx, gy) => {
    const s = box.w / 480;
    await page.mouse.move(box.x + gx * s, box.y + gy * s);
    await sleep(120);
    await page.mouse.down(); await sleep(90); await page.mouse.up();
    await sleep(500);
  };

  /* 干净存档 + 直接开某个场景（全卡带、妈妈不来、钱够） */
  const startScene = async (sceneKey, data) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.__nomom = true;
      S.Save.d.money = 60;
      S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; });
      S.Save.d.inserted = '02';
      S.Save.d.seated = true;
      S.Save.d.carts['02'].dirt = 0;
      S.Save.save();
      const g = S.game;
      const target = g.scene.getScene(a.k);
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== a.k) s.scene.stop(); });
      /* 同一帧里 stop 又 start 同一个场景，会让旧的 shutdown 把新建出来的东西一起清掉
       * （按钮的热区会被销毁，看着在、点不动）。已经在这一屏就老实 restart。 */
      if (target && target.scene.isActive()) target.scene.restart(a.d || {});
      else g.scene.start(a.k, a.d || {});
    }, { k: sceneKey, d: data });
  };

  const dialogOpen = () => page.evaluate(() => !!window.SB.__dialogOpen);
  const clearDialog = async () => {
    for (let i = 0; i < 14; i++) {
      if (!(await dialogOpen())) break;
      await page.keyboard.press('x');
      await sleep(240);
    }
    await sleep(320);
  };
  /* 等场景里某个标记位变成真（Market 走到摊子、Friend 进屋坐下这类） */
  const waitFlag = async (sceneKey, prop, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await page.evaluate((a) => {
        const s = window.SB.game.scene.getScene(a.k);
        return !!(s && s[a.p]);
      }, { k: sceneKey, p: prop });
      if (v) return true;
      await clearDialog();
      await sleep(300);
    }
    return false;
  };
  /* 一路按 A 把对话推完，直到到达目标场景 */
  const advanceTo = async (target, tries = 14) => {
    for (let i = 0; i < tries; i++) {
      if (await at(target)) return true;
      await page.keyboard.press('x');
      await sleep(320);
    }
    return at(target);
  };

  const menuOpen = () => page.evaluate(() => {
    const m = window.SB.__menu;
    return !!(m && m.isOpen && m.isOpen());
  });
  const hintOf = (sceneKey) => page.evaluate((k) => {
    const s = window.SB.game.scene.getScene(k);
    if (!s || !s.hint || !s.hint.full) return null;
    return { shown: s.hint.text(), full: s.hint.full() };
  }, sceneKey);

  /* ================= 1. 键位映射 ================= */
  console.log('\n--- 1. 键盘上的 A / B 真的管用吗 ---');
  const m1 = await page.evaluate(() => {
    const I = window.SB.Input;
    I.setTwoP(false); I.setSrc('key');
    return {
      KeyA: I.mapCode('KeyA'), KeyB: I.mapCode('KeyB'),
      KeyX: I.mapCode('KeyX'), KeyZ: I.mapCode('KeyZ'),
      Space: I.mapCode('Space'), Enter: I.mapCode('Enter'),
      KeyH: I.mapCode('KeyH'), KeyG: I.mapCode('KeyG'),
      nameA: I.keyName('a'), nameB: I.keyName('b')
    };
  });
  ok(m1.KeyA === '1a', '单人时键盘 A = 1P 的 A 键');
  ok(m1.KeyB === '1b', '单人时键盘 B = 1P 的 B 键');
  ok(m1.KeyX === '1a' && m1.KeyZ === '1b', '老键位 X / Z 照旧管用');
  ok(m1.Space === '1a' && m1.Enter === '1start', '空格 = A，回车 = START');
  ok(m1.KeyH === '2a' && m1.KeyG === '2b', '2P 的 G / H 什么时候都认');
  ok(/A/.test(m1.nameA) && /B/.test(m1.nameB), '提示里的键名带上了字母 A / B（' + m1.nameA + ' / ' + m1.nameB + '）');

  /* 真按一下 A：卡带盒里应该弹出那张卡的菜单 */
  await startScene('Shelf', { from: 'Room' });
  await sleep(1800);
  await clearDialog();
  await key('ArrowRight');                     // 挪到不是「插着」的那张
  await key('a');
  ok(await menuOpen(), '卡带盒里按键盘 A 能打开卡带菜单');
  const mHint = await hintOf('Shelf');
  ok(!!mHint && /选/.test(mHint.full) && /确认/.test(mHint.full) && /返回/.test(mHint.full),
    '菜单开着时底下那行写的是菜单自己的键位（' + (mHint && mHint.full) + '）');
  await shot('01_shelf_keyA_menu');
  await key('b');
  await sleep(400);
  ok(!(await menuOpen()), '按键盘 B 能取消菜单');
  const backHint = await hintOf('Shelf');
  ok(!!backHint && /选卡/.test(backHint.full), '关掉菜单后提示原样还回来（' + (backHint && backHint.full) + '）');
  await key('b');
  await sleep(1600);
  ok(await at('Room'), '再按 B 从卡带盒回客厅');

  /* 提示条上的键名跟着输入方式走，而且不能被行宽截掉 */
  await startScene('Shelf', { from: 'Room' });
  await sleep(1800);
  await clearDialog();
  const hKey = await hintOf('Shelf');
  ok(!!hKey && /X\/A/.test(hKey.full), '键盘玩家看到的是真实键名 X/A（' + (hKey && hKey.full) + '）');
  ok(!!hKey && hKey.shown === hKey.full, '提示条没有被行宽截掉');
  await page.evaluate(() => window.SB.Input.setSrc('touch'));
  await sleep(400);
  const hTouch = await hintOf('Shelf');
  ok(!!hTouch && !/X\/A/.test(hTouch.full) && /A/.test(hTouch.full), '摸屏幕的人看到的是手柄按钮名 A（' + (hTouch && hTouch.full) + '）');
  await page.evaluate(() => window.SB.Input.setSrc('key'));
  await sleep(300);

  /* ================= 2. 详情面板不许重叠 ================= */
  console.log('\n--- 2. 卡带详情面板：正文压不压数值条 ---');
  const shelfLayout = await page.evaluate(() => {
    const S = window.SB;
    const sc = S.game.scene.getScene('Shelf');
    const rect = window.__rect;
    const out = [];
    for (let i = 0; i < S.CARTS.length; i++) {
      sc.cur = i; sc.refresh();
      const body = rect(sc.info.body);
      const lbDirt = sc['_lb脏'] ? rect(sc['_lb脏']) : null;
      const stat = rect(sc.info.stat);
      out.push({
        id: S.CARTS[i].id, name: S.CARTS[i].name,
        lines: sc.info.body.text.split('\n').length,
        bodyBottom: Math.round(body.bottom), bodyRight: Math.round(body.right),
        barTop: lbDirt ? Math.round(lbDirt.top) : null,
        statBottom: Math.round(stat.bottom)
      });
    }
    sc.cur = 0; sc.refresh();
    return { rows: out, panel: { bottom: 40 + 190, right: 300 + 168 } };
  });
  const bad = shelfLayout.rows.filter(r => r.barTop !== null && r.bodyBottom > r.barTop);
  ok(bad.length === 0, '全部 ' + shelfLayout.rows.length + ' 张卡带的描述都没压到「脏/磨」条'
    + (bad.length ? '（越界：' + bad.map(b => b.name + ' ' + b.bodyBottom + '>' + b.barTop).join('、') + '）' : ''));
  const over = shelfLayout.rows.filter(r => r.statBottom > shelfLayout.panel.bottom || r.bodyRight > shelfLayout.panel.right);
  ok(over.length === 0, '面板里的字没有越出面板边框');
  const longest = shelfLayout.rows.reduce((a, b) => (b.lines > a.lines ? b : a), shelfLayout.rows[0]);
  console.log('  描述最长的一张：' + longest.name + '（' + longest.lines + ' 行，底边 ' + longest.bodyBottom + '，条顶 ' + longest.barTop + '）');
  await page.evaluate((id) => {
    const S = window.SB, sc = S.game.scene.getScene('Shelf');
    sc.cur = S.CARTS.findIndex(c => c.id === id); sc.refresh();
  }, longest.id);
  await sleep(400);
  await shot('02_shelf_longest');

  /* 回忆册右板：正文也不许压到统计那几行 */
  await startScene('Album', { from: 'Room' });
  await sleep(1800);
  await clearDialog();
  const albumLayout = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Album');
    const rect = window.__rect;
    const b = rect(sc.detail);
    let statBottom = 0;
    sc.children.list.forEach(o => {
      if (typeof o.text === 'string' && /开机 /.test(o.text)) statBottom = rect(o).bottom;
    });
    let worst = 0;
    for (let i = 0; i < Math.max(1, sc.entries.length); i++) {
      sc.cur = i; sc.refresh();
      worst = Math.max(worst, rect(sc.detail).bottom);
    }
    return {
      n: sc.entries.length,
      detailTop: Math.round(b.top), statBottom: Math.round(statBottom),
      worstBottom: Math.round(worst), panelBottom: 46 + 194
    };
  });
  ok(albumLayout.statBottom <= albumLayout.detailTop,
    '回忆册的统计行没被正文压住（统计底 ' + albumLayout.statBottom + ' ≤ 正文顶 ' + albumLayout.detailTop + '）');
  ok(albumLayout.worstBottom <= albumLayout.panelBottom,
    '最长的一条回忆也没顶出面板（' + albumLayout.worstBottom + ' ≤ ' + albumLayout.panelBottom + '）');
  await shot('03_album');

  /* ================= 3. 右上角那颗按钮点得到吗 ================= */
  console.log('\n--- 3. 用鼠标能不能走出每一屏 ---');
  const CORNERS = [
    { k: 'Shelf', d: { from: 'Room' }, prop: 'backBtn', wait: 1800, to: 'Room' },
    { k: 'Repair', d: { cartId: '02', from: 'Room' }, prop: 'backBtn', wait: 2000, to: 'Room' },
    { k: 'Market', d: { from: 'Room' }, prop: 'backBtn', wait: 2400, to: 'Room', flag: 'arrived' },
    { k: 'Friend', d: { from: 'Room' }, prop: 'backBtn', wait: 2600, to: 'Room', flag: 'ready' },
    { k: 'Homework', d: { from: 'Room' }, prop: 'backBtn', wait: 2200, to: 'Room' },
    { k: 'Settings', d: { from: 'Room' }, prop: 'backBtn', wait: 1800, to: 'Room' },
    { k: 'Album', d: { from: 'Room' }, prop: 'backBtn', wait: 1800, to: 'Room' }
  ];
  for (const c of CORNERS) {
    await startScene(c.k, c.d);
    await sleep(c.wait);
    await clearDialog();
    if (c.flag) await waitFlag(c.k, c.flag);
    const r = await page.evaluate((a) => {
      const s = window.SB.game.scene.getScene(a.k);
      const b = s && s[a.p];
      if (!b || !b.rect) return null;
      return { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, label: b.txt.text };
    }, { k: c.k, p: c.prop });
    ok(!!r, c.k + ' 右上角有一颗常驻按钮' + (r ? '（' + r.label + '）' : ''));
    if (!r) continue;
    ok(r.x + r.w <= 480 && r.y >= 0 && r.y + r.h <= 40, c.k + ' 这颗按钮真的在右上角（x=' + r.x + ' y=' + r.y + '）');
    /* 按钮底下不许压着别的字 */
    const covered = await page.evaluate((a) => {
      const s = window.SB.game.scene.getScene(a.k);
      const btn = s[a.p];
      const rect = window.__rect;
      const hit = [];
      s.children.list.forEach(o => {
        if (!o.visible || o === btn.txt || (btn.sub && o === btn.sub)) return;
        if (typeof o.text !== 'string' || !o.text) return;
        const b = rect(o);
        if (b.left < a.r.x + a.r.w && b.right > a.r.x && b.top < a.r.y + a.r.h && b.bottom > a.r.y) {
          hit.push(o.text.split('\n')[0]);
        }
      });
      return hit;
    }, { k: c.k, p: c.prop, r });
    ok(covered.length === 0, c.k + ' 这颗按钮没和别的文字叠在一起'
      + (covered.length ? '（叠着：' + covered.join(' | ') + '）' : ''));
    await shot('04_corner_' + c.k.toLowerCase());
    await clickGame(r.x + r.w / 2, r.y + r.h / 2);
    const back = await advanceTo(c.to);
    ok(back, c.k + ' 点这颗按钮能回到 ' + c.to);
  }

  /* 客厅是第一屏，没有「上一页」，那颗按钮开的是系统菜单 */
  await startScene('Room', { from: 'test' });
  await sleep(2000);
  await clearDialog();
  const roomBtn = await page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Room');
    const b = s && s.menuBtn;
    return b ? { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, label: b.txt.text } : null;
  });
  ok(!!roomBtn, '客厅右上角有一颗「' + (roomBtn ? roomBtn.label : '?') + '」按钮');
  if (roomBtn) {
    await shot('05_room');
    await clickGame(roomBtn.x + roomBtn.w / 2, roomBtn.y + roomBtn.h / 2);
    await sleep(700);
    ok(await menuOpen(), '客厅点它能开系统菜单（而不是莫名其妙地「返回」）');
    await key('b');
    await sleep(500);
    ok(!(await menuOpen()) && (await at('Room')), '按 B 关掉菜单，人还在客厅');
  }

  /* ================= 4. 小游戏那一屏：离开按钮 + 双人键位 ================= */
  console.log('\n--- 4. 小游戏那一屏 ---');
  await startScene('Play', { cartId: '02', gameKey: 'tank', friend: false });
  await sleep(7000);
  const playBtn = await page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Play');
    const b = s && s.leaveBtn;
    return b ? { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h, label: b.txt.text } : null;
  });
  ok(!!playBtn, '桌面端玩游戏时右上角有「' + (playBtn ? playBtn.label : '?') + '」按钮');
  await shot('06_play');
  if (playBtn) {
    await clickGame(playBtn.x + playBtn.w / 2, playBtn.y + playBtn.h / 2);
    await sleep(900);
    const st = await page.evaluate(() => {
      const s = window.SB.game.scene.getScene('Play');
      return { paused: !!(s && s.pauseMenu && s.pauseMenu.isOpen()), leaving: !!(s && s.leaving) };
    });
    ok(st.paused, '点「离开」先开暂停菜单，给人一次反悔的机会');
    ok(!st.leaving && (await at('Play')), '手一抖也不会当场关掉电视');
    await shot('07_play_pause');
    await key('b');
    await sleep(700);
    ok(await at('Play'), '取消之后还在游戏里');
  }

  /* 双人同屏：键盘 A 归 2P，1P 的提示自动改口写 X */
  await startScene('Play', { cartId: '02', gameKey: 'tank', twoP: true, friend: true });
  await sleep(7000);
  const two = await page.evaluate(() => {
    const I = window.SB.Input;
    return { twoP: I.twoP, KeyA: I.mapCode('KeyA'), KeyD: I.mapCode('KeyD'), KeyX: I.mapCode('KeyX'), nameA: I.keyName('a') };
  });
  ok(two.twoP === true, '双打开局时输入层知道现在是双人同屏');
  ok(two.KeyA === '2left' && two.KeyD === '2right', '双打时 WASD 归 2P（A = 2P 左）');
  ok(two.KeyX === '1a', '双打时 1P 还有 X 可以按');
  ok(two.nameA === 'X', '此时 1P 的提示只写 X，不再写 A（' + two.nameA + '）');
  await shot('08_play_twoP');

  /* 退出这一局，键位要还回单人 */
  await startScene('Shelf', { from: 'Room' });
  await sleep(1600);
  const after = await page.evaluate(() => {
    const I = window.SB.Input;
    return { twoP: I.twoP, KeyA: I.mapCode('KeyA'), nameA: I.keyName('a') };
  });
  ok(after.twoP === false && after.KeyA === '1a', '离开双打后键盘 A 还回 1P');
  ok(/A/.test(after.nameA), '提示也跟着改回 ' + after.nameA);

  /* ================= 5. 标题画面：别让 B 键把人按进死屏 ================= */
  console.log('\n--- 5. 标题画面 ---');
  await startScene('Title', {});
  await sleep(2600);
  await clearDialog();
  const tHint = await hintOf('Title');
  ok(!!tHint && /确认/.test(tHint.full), '标题画面底下写清了确认键（' + (tHint && tHint.full) + '）');
  ok(!!tHint && !/返回/.test(tHint.full), '标题的主菜单退不出去，就不在提示里骗人写「返回」');
  ok(!!tHint && tHint.shown === tHint.full, '标题的提示没被截掉');
  await key('b', 2);
  await sleep(600);
  const tSt = await page.evaluate(() => {
    const m = window.SB.__menu;
    return { menu: !!(m && m.isOpen && m.isOpen()), at: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',') };
  });
  ok(tSt.menu && /Title/.test(tSt.at), '在标题画面按 B 不会把菜单取消掉变成死屏');
  await shot('09_title');
  const missTitle = await page.evaluate(() => window.__missing('Title'));
  ok(missTitle.length === 0, '标题画面（含菜单光标）没有字库里画不出来的字'
    + (missTitle.length ? '（缺：' + missTitle.join(' ') + '）' : ''));

  /* ================= 6. 屏幕上的字都画得出来吗 ================= */
  console.log('\n--- 6. 缺字检查 ---');
  for (const c of [
    { k: 'Room', d: { from: 'test' }, wait: 2200, menu: true },
    { k: 'Shelf', d: { from: 'Room' }, wait: 1800, menu: true },
    { k: 'Repair', d: { cartId: '02', from: 'Room' }, wait: 2000 },
    { k: 'Market', d: { from: 'Room' }, wait: 2600 },
    { k: 'Album', d: { from: 'Room' }, wait: 1800 },
    { k: 'Settings', d: { from: 'Room' }, wait: 1800 },
    { k: 'Homework', d: { from: 'Room' }, wait: 2200 },
    { k: 'Friend', d: { from: 'Room' }, wait: 2600 }
  ]) {
    await startScene(c.k, c.d);
    await sleep(c.wait);
    await clearDialog();
    if (c.menu) { await key('x'); await sleep(500); }   // 顺手把菜单也开出来一起查
    const miss = await page.evaluate((k) => window.__missing(k), c.k);
    ok(miss.length === 0, c.k + ' 这一屏的字都在字库里'
      + (miss.length ? '（缺：' + miss.join(' ') + '）' : ''));
  }

  console.log('\n--- 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '整段没有 JS 报错');

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  console.log('截图在 ' + OUT + '（前缀 test_）');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
