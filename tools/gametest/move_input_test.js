/* 「点上下左右，坦克为什么不走」——这一版专盯移动这件事。
 *
 * 三条真实原因，一条一条查：
 *   1. 单人时 1P 只认方向键，而键盘 A 是「开火」：玩家习惯性按 WASD，
 *      结果坦克在原地放炮。现在小游戏里 W / A / S / D 也是 1P 的方向键
 *      （src/core/input.js 的 CODE_1P_MOVE，PlayScene 单人时打开），
 *      按一下就得真的走 —— 断言的是坦克坐标。
 *   2. 关卡开场那一秒半只认 A / B，方向键完全没反应。现在画面上明写
 *      「按 X 开始」（键名现算），而且照着按真的能跳过。
 *   3. 触屏十字键的命中范围以前只有 34×38，手指稍偏就点不到。
 *      现在是一整块 136×136 按方位判方向，边缘也算数，相邻方向不互相误触；
 *      A / B 两颗圆键改成圆形命中范围，不再互相咬边。
 *
 * 顺带守住一条底线：菜单和别的场景里，键盘 A 还必须是「确认」。
 *
 * 用法：先起 python3 -m http.server 8100，再 node tools/gametest/move_input_test.js
 *       换端口：node tools/gametest/move_input_test.js 8200
 *       线上冒烟：node tools/gametest/move_input_test.js https://你的站点地址
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* 端口，或者直接给一个线上地址（部署完拿真链接跑一遍同样的断言） */
const ARG = process.argv[2] || '8100';
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/+$/, '') : 'http://localhost:' + ARG;
const OUT = path.join(__dirname, 'move_input');
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

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  /* 线上比本地慢，等到游戏真的起来再动手（最多 30 秒） */
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(() => !!(window.SB && window.SB.game && window.SB.Input))) break;
    await sleep(200);
  }
  await sleep(2000);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1500);

  /* 逻辑坐标（480×270）→ 屏幕坐标 */
  const toScreen = (gx, gy) => ({ x: box.x + box.w * (gx / 480), y: box.y + box.h * (gy / 270) });

  const startPlay = async (extra) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
      S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; S.Save.d.carts[c.id].dirt = 0; S.Save.d.carts[c.id].wear = 0; });
      S.Save.d.settings.touchPad = a.touch ? 'on' : 'off';
      S.Save.d.inserted = '02'; S.Save.d.seated = true;
      S.Save.save();
      const game = S.game, target = game.scene.getScene('Play');
      game.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== 'Play') s.scene.stop(); });
      const args = { cartId: '02', gameKey: 'tank', twoP: !!a.twoP, friend: !!a.twoP };
      if (target && target.scene.isActive()) target.scene.restart(args); else game.scene.start('Play', args);
    }, extra || {});
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const fresh = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Play');
        return !!(s && s.guide && !s.game_ && s.guide.mode === null);
      });
      if (fresh) return;
      await sleep(80);
    }
  };

  const st = () => page.evaluate(() => {
    const S = window.SB, s = S.game.scene.getScene('Play'), g = s && s.game_;
    const p = g && g.players && g.players[0];
    return {
      phase: g ? g.phase : null,
      over: !!(g && (g.over || g.cleared)),
      lives: p ? p.lives : null,
      pos: p ? { x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, alive: p.alive, stun: Math.round(p.stun || 0) } : null,
      card: !!(s && s.guide && s.guide.hasCard()),
      move1P: S.Input.move1P, twoP: S.Input.twoP,
      mapA: S.Input.mapCode('KeyA'), mapW: S.Input.mapCode('KeyW'),
      mapD: S.Input.mapCode('KeyD'), mapS: S.Input.mapCode('KeyS'),
      nameA: S.Input.keyName('a'), nameDir: S.Input.keyName('dir'),
      tc: { up: !!S.Input.p1.tc.up, down: !!S.Input.p1.tc.down, left: !!S.Input.p1.tc.left, right: !!S.Input.p1.tc.right, a: !!S.Input.p1.tc.a, b: !!S.Input.p1.tc.b },
      pad: !!(s && s.pad),
      dpad: s && s.pad ? s.pad.dpadHit : null,
      msg3: g && g.msg3 ? { vis: g.msg3.visible, text: g.msg3.text } : null
    };
  });

  /* 打到能动的那一刻（开场卡演完，phase = play） */
  const waitPlay = async (ms = 12000) => {
    const t0 = Date.now();
    let v = null;
    while (Date.now() - t0 < ms) {
      v = await st();
      if (v && v.phase === 'play' && v.pos) return v;
      await sleep(100);
    }
    return v;
  };
  /* 按住一个键一会儿，回来看坦克动没动 */
  const hold = async (code, ms = 700) => {
    await page.keyboard.down(code);
    await sleep(ms);
    const v = await st();
    await page.keyboard.up(code);
    await sleep(120);
    return v;
  };

  /* 出生点是个墙角：右边紧贴老鹰的砖墙护栏、下面就是场地边框，
   * 在那儿按右 / 下本来就不该动。要验「按键有没有变成移动」，
   * 得把坦克先摆到一块四面通的空地上（工厂图 (32,80) 那一格），
   * 顺手把四个方向通不通报回来当前提条件 —— 不然测的是地图，不是键位。 */
  const OPEN = { x: 32, y: 80 };
  const place = (x, y) => page.evaluate((a) => {
    const g = window.SB.game.scene.getScene('Play').game_, t = g.players[0];
    t.x = a.x; t.y = a.y; t.dir = 0; t.acc = 0; t.slide = 0;
    t.alive = true; t.out = false; t.stun = 0; t.reviveT = 0;
    g.giveShield(t, 60000);        // 空地上会被敌方坦克打死，死了当然不动 —— 用游戏自己的护盾把这个变量摘掉
    g.syncTank(t);
    return {
      up: g.canStand(t, a.x, a.y - 1), down: g.canStand(t, a.x, a.y + 1),
      left: g.canStand(t, a.x - 1, a.y), right: g.canStand(t, a.x + 1, a.y)
    };
  }, { x: x, y: y });

  /* ================= 1. 单人：WASD 真的能开动坦克 ================= */
  console.log('\n--- 1. 单人按 WASD，坦克得走 ---');
  await startPlay();
  let v = await waitPlay();
  ok(!!v && v.phase === 'play', '坦克进到可操作阶段（phase=' + (v && v.phase) + '）');
  ok(!!v && v.move1P === true && v.twoP === false, '单人在小游戏里，「移动优先」那一层是开着的');
  ok(!!v && v.mapW === '1up' && v.mapS === '1down' && v.mapA === '1left' && v.mapD === '1right',
    'W / S / A / D 四个键都是 1P 的方向键（' + [v && v.mapW, v && v.mapS, v && v.mapA, v && v.mapD].join(' ') + '）');
  ok(!!v && v.nameA === 'X', '这时候提示里的 A 键写「X」，不写 A（' + (v && v.nameA) + '）');
  ok(!!v && v.nameDir === '方向键 或 WASD', '提示里的方向写成「方向键 或 WASD」（' + (v && v.nameDir) + '）');

  /* 玩家真实的第一下：刚开局，手放在 WASD 上，按 W。
   * 出生点上方是通的，这一下必须让坦克动 —— 这就是用户说的「坦克不走」。 */
  const spawn0 = (await st()).pos;
  const spawnUp = (await hold('KeyW', 700)).pos;
  ok(spawnUp.y < spawn0.y,
    '刚开局在出生点按 W，坦克立刻往上开（y ' + spawn0.y + ' → ' + spawnUp.y + '）');

  const moves = [
    { code: 'KeyD', axis: 'x', sign: 1, free: 'right', name: 'D 往右' },
    { code: 'KeyW', axis: 'y', sign: -1, free: 'up', name: 'W 往上' },
    { code: 'KeyA', axis: 'x', sign: -1, free: 'left', name: 'A 往左' },
    { code: 'KeyS', axis: 'y', sign: 1, free: 'down', name: 'S 往下' }
  ];
  for (const m of moves) {
    /* 敌方坦克开过来堵住路，是这游戏本来的样子，不算键位坏了：
     * 每次先摆好、确认这个方向通，走不动就换个时机再来，三次都不动才算挂。 */
    let free = null, before = null, after = null, moved = false, tries = 0;
    while (tries < 3 && !moved) {
      tries++;
      free = await place(OPEN.x, OPEN.y);
      if (!free[m.free]) { await sleep(400); continue; }
      before = (await st()).pos;
      after = (await hold(m.code, 700)).pos;
      moved = m.sign > 0 ? after[m.axis] > before[m.axis] : after[m.axis] < before[m.axis];
      if (!moved) await sleep(400);
    }
    ok(free[m.free] === true, '摆好的这块空地，' + m.name + ' 这个方向是通的（前提条件）');
    ok(moved, '按住 ' + m.name + '：坦克真的走了（' + m.axis + ' ' + (before && before[m.axis])
      + ' → ' + (after && after[m.axis]) + '，试了 ' + tries + ' 次）');
    await sleep(150);
  }
  await shot('01_wasd_moved');

  /* 老键位不能因此失效 */
  await place(OPEN.x, OPEN.y);
  const beforeArrow = (await st()).pos;
  const afterArrow = (await hold('ArrowRight', 600)).pos;
  ok(afterArrow.x > beforeArrow.x, '方向键照旧管用（x ' + beforeArrow.x + ' → ' + afterArrow.x + '）');

  /* ================= 2. 暂停菜单 / 别的场景里，A 还是「确认」 ================= */
  console.log('\n--- 2. 菜单里 A 仍然是确认 ---');
  await page.keyboard.press('Enter');
  await sleep(500);
  const paused = await page.evaluate(() => {
    const S = window.SB, m = S.__menu;
    return { open: !!(m && m.isOpen()), mapA: S.Input.mapCode('KeyA'), move1P: S.Input.move1P };
  });
  ok(paused.open, '按 Enter 开出了暂停菜单');
  ok(paused.mapA === '1a' && paused.move1P === false,
    '菜单一开，键盘 A 立刻还回「确认」（mapCode=' + paused.mapA + '）');
  await page.keyboard.press('a');          // 选第一项「继续游戏」
  await sleep(600);
  const resumed = await page.evaluate(() => {
    const S = window.SB, m = S.__menu;
    return { open: !!(m && m.isOpen()), mapA: S.Input.mapCode('KeyA'), move1P: S.Input.move1P };
  });
  ok(!resumed.open, '按键盘 A 能确认菜单（菜单关掉了）');
  ok(resumed.mapA === '1left' && resumed.move1P === true,
    '回到游戏里，A 又变回「往左走」（mapCode=' + resumed.mapA + '）');

  const outside = await page.evaluate(() => {
    const S = window.SB;
    S.game.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    S.game.scene.start('Room', { from: 'test' });
    return true;
  });
  await sleep(2200);
  const inRoom = await page.evaluate(() => ({
    mapA: window.SB.Input.mapCode('KeyA'),
    move1P: window.SB.Input.move1P,
    nameA: window.SB.Input.keyName('a')
  }));
  ok(outside && inRoom.mapA === '1a' && inRoom.move1P === false,
    '离开电视回客厅，键盘 A 还是「确认」（mapCode=' + inRoom.mapA + '，提示写 ' + inRoom.nameA + '）');

  /* 双人同屏时 WASD 仍归 2P，这个老开关不许被破坏 */
  await startPlay({ twoP: true });
  await waitPlay();
  const two = await page.evaluate(() => ({
    twoP: window.SB.Input.twoP, move1P: window.SB.Input.move1P,
    mapA: window.SB.Input.mapCode('KeyA'), mapD: window.SB.Input.mapCode('KeyD')
  }));
  ok(two.twoP === true && two.move1P === false, '双打时「移动优先」那一层不掺和');
  ok(two.mapA === '2left' && two.mapD === '2right', '双打时 WASD 还是 2P 的（A = 2P 左）');

  /* ================= 3. 关卡开场那几秒：明写「按 X 开始」 ================= */
  console.log('\n--- 3. 开场文字阶段的提示 ---');
  await startPlay();
  let intro = null;
  for (let i = 0; i < 100; i++) {
    const cur = await st();
    if (cur && cur.phase === 'intro' && cur.msg3) { intro = cur; break; }
    if (cur && cur.phase === 'play') { intro = cur; break; }
    await sleep(40);
  }
  ok(!!intro && intro.phase === 'intro', '抓到了开场文字那一段（phase=' + (intro && intro.phase) + '）');
  ok(!!intro && !!intro.msg3 && intro.msg3.vis === true,
    '这一段画面上有第三行提示，而不是静静地屏蔽方向键');
  ok(!!intro && !!intro.msg3 && /按 X 开始/.test(intro.msg3.text),
    '提示写的是「按 X 开始」，键名是现算的（' + (intro && intro.msg3 && intro.msg3.text) + '）');
  await shot('02_intro_hint');
  /* 提示说的话必须是真的：照着按，真的能跳过 */
  await page.keyboard.press('x');
  await sleep(200);
  const skipped = await st();
  ok(skipped.phase === 'play', '照着提示按 X，开场卡当场跳过（phase=' + skipped.phase + '）');

  /* ================= 4. 触屏十字键：边缘也算数 ================= */
  console.log('\n--- 4. 触屏方向键的命中范围 ---');
  await startPlay({ touch: true });
  v = await waitPlay();
  ok(!!v && v.pad === true, '打开屏幕手柄以后，Play 里真的有一副虚拟手柄');
  ok(!!v && !!v.dpad && v.dpad.half >= 60,
    '十字键的命中范围放大到 ' + (v && v.dpad ? v.dpad.half * 2 + '×' + v.dpad.half * 2 : '?') + '（以前只有 34×38）');

  const dp = v.dpad;
  /* 按住屏幕上的一个点，看方向键有没有被按下、坦克有没有动（先摆到空地上） */
  const touchHold = async (gx, gy, ms, opt) => {
    if (!opt || opt.place !== false) await place(OPEN.x, OPEN.y);
    const p = toScreen(gx, gy);
    const before = (await st()).pos;
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(ms || 700);
    const during = await st();
    await page.mouse.up();
    await sleep(150);
    return { before: before, during: during };
  };

  /* 按住屏幕上一点，重试到坦克真的动（敌方坦克堵路不算键位坏） */
  const touchDir = async (gx, gy, axis, sign) => {
    let r = null, moved = false, tries = 0;
    while (tries < 3 && !moved) {
      tries++;
      r = await touchHold(gx, gy);
      moved = sign > 0 ? r.during.pos[axis] > r.before[axis] : r.during.pos[axis] < r.before[axis];
      if (!moved) await sleep(400);
    }
    return { r: r, moved: moved, tries: tries, tag: axis + ' ' + r.before[axis] + ' → ' + r.during.pos[axis] + '，试了 ' + tries + ' 次' };
  };

  /* 上边缘：离中心 half - 4，以前这里是空的 */
  let d1 = await touchDir(dp.cx, dp.cy - dp.half + 4, 'y', -1);
  let r = d1.r;
  ok(r.during.tc.up === true, '点在十字键最上面的边缘，「上」被按下了');
  ok(r.during.tc.left === false && r.during.tc.right === false, '边缘不会顺手把左右也误触了');
  ok(d1.moved, '坦克真的往上开了（' + d1.tag + '）');

  /* 右边缘 */
  d1 = await touchDir(dp.cx + dp.half - 4, dp.cy, 'x', 1);
  r = d1.r;
  ok(r.during.tc.right === true && r.during.tc.up === false && r.during.tc.down === false,
    '点右边缘只按出「右」，上下都没被带上');
  ok(d1.moved, '坦克真的往右开了（' + d1.tag + '）');
  await shot('03_touch_edge');

  /* 下边缘 + 左边缘：十字键的命中范围往屏幕左边、下边溢出去一截，
   * 拇指能碰到的最边上就是屏幕边框本身，所以按屏幕边上那一点点来点。 */
  const inScr = (gx, gy) => ({ x: Math.min(478, Math.max(2, gx)), y: Math.min(268, Math.max(2, gy)) });
  let e1 = inScr(dp.cx, dp.cy + dp.half - 4);
  d1 = await touchDir(e1.x, e1.y, 'y', 1);
  ok(d1.r.during.tc.down === true, '点十字键下边（屏幕最底下 y=' + e1.y + '）按出「下」');
  ok(d1.moved, '坦克真的往下开了（' + d1.tag + '）');
  e1 = inScr(dp.cx - dp.half + 4, dp.cy);
  d1 = await touchDir(e1.x, e1.y, 'x', -1);
  ok(d1.r.during.tc.left === true, '点十字键左边（屏幕最左边 x=' + e1.x + '）按出「左」');
  ok(d1.moved, '坦克真的往左开了（' + d1.tag + '）');

  /* 屏幕左下角：拇指最舒服的地方，也得算方向（左下） */
  r = await touchHold(2, 268, 300);
  ok(r.during.tc.left === true && r.during.tc.down === true, '屏幕左下角也算「左下」，不是死区');

  /* 斜角：两个方向一起 */
  r = await touchHold(dp.cx + dp.half - 8, dp.cy - dp.half + 8, 300);
  ok(r.during.tc.right === true && r.during.tc.up === true, '斜角按出的是「右上」两个方向');

  /* 正中心那一小块不算方向（手指压在轴心上，说不清往哪走） */
  r = await touchHold(dp.cx, dp.cy, 250);
  ok(!r.during.tc.up && !r.during.tc.down && !r.during.tc.left && !r.during.tc.right,
    '正中心不算任何方向，坦克不乱抖');

  /* 不抬手就换方向：从「上」滑到「右」 */
  await place(OPEN.x, OPEN.y);
  const pUp = toScreen(dp.cx, dp.cy - dp.half + 4), pRight = toScreen(dp.cx + dp.half - 4, dp.cy);
  await page.mouse.move(pUp.x, pUp.y); await page.mouse.down(); await sleep(200);
  await page.mouse.move(pRight.x, pRight.y); await sleep(200);
  const slid = await st();
  await page.mouse.up(); await sleep(150);
  ok(slid.tc.right === true && slid.tc.up === false, '手指不抬起来，从「上」滑到「右」直接改方向');

  /* A / B 圆键：以前两个 64×64 的方框在中间叠了 10 像素，按 A 的左边缘按出来的是 B */
  const aC = { x: 480 - 62 + 26, y: 270 - 66 + 26 };
  const bC = { x: 480 - 116 + 26, y: 270 - 52 + 26 };
  r = await touchHold(aC.x, aC.y, 250, { place: false });
  ok(r.during.tc.a === true && r.during.tc.b === false, '点 A 的圆心，按出来的是 A');
  r = await touchHold(bC.x, bC.y, 250, { place: false });
  ok(r.during.tc.b === true && r.during.tc.a === false, '点 B 的圆心，按出来的是 B');
  r = await touchHold(aC.x - 26, aC.y, 250, { place: false });
  ok(r.during.tc.a === true && r.during.tc.b === false,
    'A 的左边缘也只按出 A（以前这一块被 B 的方框抢走了）');
  await shot('04_touch_buttons');

  /* ================= 5. 没有 JS 报错 ================= */
  console.log('\n--- 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '整段没有 JS 报错');

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  console.log('截图在 ' + OUT);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
