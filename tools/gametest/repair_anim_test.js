/* 修卡台两个动作特写的回归：吹卡带（对着金手指哈两口气）、划桌角（在桌沿划两下）。
 *
 * 这一份专门盯七件事，全部是真按键盘、真点鼠标，不去直接调场景里的私有函数：
 *   1. 选「哈气」真的会播吹卡带动画，两口气（push1 / push2）都得演到；
 *      总时长在 3 秒这个量级，不是一闪而过也不是没完没了。
 *   2. 蓄力和动画阶段对得上：按住的时候停在「鼓腮」那几帧，
 *      蓄得越满腮鼓得越大（帧号随 blowPower 单调上去）。
 *   3. 划桌真的会播划桌动画，第一下 / 抬起回位 / 第二下 三拍都在。
 *   4. 动画能跳过，而且跳过之后数值照常结算（脏污该掉多少还是掉多少）。
 *   5. 连着来三次，第二次、第三次自动变短（不烦人）。
 *   6. 特写取景框不许压住脏污条、磨损条、右侧按钮列、右上角返回、底部提示条。
 *   7. 数值规则一行没变：哈气太弱无效 / 太猛更脏 / 同一次修卡反复哈气递减；
 *      划桌前三下最管用、超过五下磨损陡增。
 *
 * 用法：先起 python3 -m http.server 8110（v2 用 8111），
 *       再 node tools/gametest/repair_anim_test.js [端口]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || process.env.PORT || '8110';
const OUT = path.join(__dirname, 'repair_anim');
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

  const shot = (tag) => page.screenshot({ path: path.join(OUT, 'shot_' + tag + '.png') });

  /* ---------- 开机 ---------- */
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);   // 点击开机，顺手解锁音频
  await sleep(1200);

  /* 干净存档 + 直接进修卡台，脏污/磨损按参数摆好 */
  const enterRepair = async (dirt, wear) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.__nomom = true;
      S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; });
      S.Save.d.inserted = '02';
      S.Save.d.seated = true;
      S.Save.d.carts['02'].dirt = a.dirt;
      S.Save.d.carts['02'].wear = a.wear;
      S.Save.d.fault = 'GLITCH';
      S.Save.save();
      const g = S.game;
      const t = g.scene.getScene('Repair');
      g.scene.getScenes(true).forEach(s => {
        if (s.scene.key !== 'Sys' && s.scene.key !== 'Repair') s.scene.stop();
      });
      if (t && t.scene.isActive()) t.scene.restart({ cartId: '02', from: 'Room' });
      else g.scene.start('Repair', { cartId: '02', from: 'Room' });
    }, { dirt: dirt, wear: wear });
    await sleep(900);
    /* 进场那两句话先推完，不然按键都被对话框吃了 */
    for (let i = 0; i < 12; i++) {
      const open = await page.evaluate(() => !!window.SB.__dialogOpen);
      if (!open) break;
      await page.keyboard.press('x');
      await sleep(220);
    }
    await sleep(300);
  };

  /* 这一刻场景 + 播放器的状态 */
  const st = () => page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Repair');
    const c = window.SB.Save.d.carts['02'];
    const a = s && s.anim;
    return {
      animOn: !!(s && s.animOn), animBusy: !!(s && s.animBusy),
      mode: a ? a.mode : '-', kind: a ? a.kind : '-', frame: a ? a.frame : -1,
      phase: a ? a.phase : '-', visible: !!(a && a.built && a.box.visible),
      blowing: !!(s && s.blowing), power: s ? s.blowPower : 0,
      pending: !!(s && s.pendingFix),
      dirt: c.dirt, wear: c.wear
    };
  });

  /* 一直采样到动画收摊，顺路记下走过的拍子、帧号和用掉的毫秒 */
  const watch = async (opts) => {
    opts = opts || {};
    const t0 = Date.now();
    const phases = [], frames = [];
    let last = '';
    while (Date.now() - t0 < (opts.max || 9000)) {
      const s = await st();
      if (s.phase && s.phase !== last && s.animBusy) { phases.push(s.phase); last = s.phase; }
      if (s.frame >= 0 && s.animBusy) frames.push(s.frame);
      if (opts.snap && opts.snap[s.phase] && !opts.snap[s.phase].done) {
        opts.snap[s.phase].done = true;
        await shot(opts.snap[s.phase].tag);
      }
      if (!s.animBusy && Date.now() - t0 > 120) break;
      await sleep(40);
    }
    return { ms: Date.now() - t0, phases: phases, frames: frames };
  };

  console.log('\n== 端口 ' + PORT + '：修卡台动作特写 ==');

  /* ================================================================ 1. 吹卡带 */
  await enterRepair(70, 0);
  let s0 = await st();
  ok(s0.animOn, '两张动作图加载成功（repair_blow / repair_rub 已就位）');

  await shot('00_repair_desk');            // 修卡台整体（还没开始演）

  /* 按住 A：先走「准备」，然后停在鼓腮帧上等松手。
   * 蓄到 0.66 左右就松手 —— 落在 0.55–0.85 的最佳力度区间里，方便顺路验结算。 */
  await page.keyboard.down('x');
  let cA = null, cB = null;
  for (let i = 0; i < 60; i++) {
    const s = await st();
    if (!cA && s.mode === 'charge' && s.frame >= 3) cA = s;
    if (cA && s.power >= 0.66) { cB = s; break; }
    await sleep(45);
  }
  await shot('01_blow_charge');
  ok(cA && cA.mode === 'charge' && cA.visible, '按住 A：特写进入「准备 / 蓄力」并显示出来');
  ok(cB && cB.frame >= 3 && cB.frame <= 5, '蓄力时停在鼓腮那几帧（帧号 ' + (cB ? cB.frame : '-') + ' 落在 3–5）');
  ok(cA && cB && cB.frame > cA.frame && cB.power > cA.power,
    '蓄得越满腮鼓得越大（' + (cA ? cA.frame : '-') + '→' + (cB ? cB.frame : '-') + '，power ' +
    (cA ? cA.power.toFixed(2) : '-') + '→' + (cB ? cB.power.toFixed(2) : '-') + '）');
  ok(cB && cB.power < 0.92, '这一口气没哈过头（power ' + (cB ? cB.power.toFixed(2) : '-') + ' < 0.92）');

  const dirtBefore = cB.dirt;
  const t0 = Date.now();
  await page.keyboard.up('x');
  const w1 = await watch({
    snap: {
      push1: { tag: '02_blow_puff1' },
      push2: { tag: '03_blow_puff2' }
    }
  });
  const wholeMs = Date.now() - t0;
  const after1 = await st();

  ok(w1.phases.indexOf('push1') >= 0 && w1.phases.indexOf('push2') >= 0,
    '松手后两口气都演到了（拍子：' + w1.phases.join(' → ') + '）');
  ok(w1.phases.indexOf('hold') > w1.phases.indexOf('push1'),
    '两口气之间有那个「停一下看看干净没」的停顿');
  ok(w1.ms > 1700 && w1.ms < 2700, '发力+停顿+收尾大约 2 秒（实测 ' + w1.ms + 'ms）');
  ok(wholeMs > 1700 && wholeMs < 3200, '松手到收摊的总时长在 3 秒量级（' + wholeMs + 'ms）');
  ok(after1.dirt < dirtBefore, '动画演完才结算，脏污确实掉了（' + dirtBefore + ' → ' + after1.dirt + '）');
  ok(!after1.animBusy && !after1.visible && !after1.pending, '演完之后取景框收掉、没有欠着的结算');

  /* ================================================================ 2. 不许挡 UI */
  const cover = await page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Repair');
    const b = s.anim.bounds();
    const panel = { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h };
    const rects = [];
    const push = (name, x, y, w, h) => rects.push({ name: name, left: x, top: y, right: x + w, bottom: y + h });
    /* 文字宽度用游戏自己那套点阵字宽表量，跟排版代码用同一把尺子 */
    const tw = (o) => window.SB.Text.width(o.text || '', 12);
    push('脏污条', s.dirtBar.x - 1, s.dirtBar.y - 1, 92, 6);
    push('脏污文字', s.dirtLab.x, s.dirtLab.y, tw(s.dirtLab), 12);
    push('磨损条', s.wearBar.x - 1, s.wearBar.y - 1, 92, 6);
    push('磨损文字', s.wearLab.x, s.wearLab.y, tw(s.wearLab), 12);
    s.btns.forEach((b2, i) => push('按钮' + i, b2.rect.x, b2.rect.y, b2.rect.w, b2.rect.h));
    push('右上返回', s.backBtn.rect.x, s.backBtn.rect.y, s.backBtn.rect.w, s.backBtn.rect.h);
    push('底部提示条', 0, window.SB.H - 16, window.SB.W, 16);
    const hit = rects.filter(r => !(panel.right <= r.left || panel.left >= r.right ||
      panel.bottom <= r.top || panel.top >= r.bottom));
    return { panel: panel, hit: hit.map(r => r.name) };
  });
  ok(cover.hit.length === 0,
    '取景框 [' + cover.panel.left + ',' + cover.panel.top + '–' + cover.panel.right + ',' +
    cover.panel.bottom + '] 没压到任何 HUD' + (cover.hit.length ? '（压到：' + cover.hit.join('/') + '）' : ''));

  /* ================================================================ 3. 跳过 */
  await enterRepair(70, 0);
  await page.keyboard.down('x');
  await sleep(760);
  const beforeSkip = await st();
  await page.keyboard.up('x');
  await sleep(420);
  const midSkip = await st();
  const tSkip = Date.now();
  await page.keyboard.press('z');            // B 键 = 跳过
  await sleep(260);
  const afterSkip = await st();
  ok(midSkip.animBusy, '跳过之前动画确实在演');
  ok(!afterSkip.animBusy && !afterSkip.visible,
    '任意键立刻跳过（' + (Date.now() - tSkip) + 'ms 之内收摊）');
  ok(afterSkip.dirt < beforeSkip.dirt && !afterSkip.pending,
    '跳过之后照样结算：脏污 ' + beforeSkip.dirt + ' → ' + afterSkip.dirt);

  /* ================================================================ 4. 连着三次 */
  await enterRepair(90, 0);
  const durs = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('x');
    await sleep(700);
    await page.keyboard.up('x');
    const w = await watch({ max: 6000 });
    durs.push(w.ms);
    ok(w.phases.filter(p => p === 'push1' || p === 'push2').length === 2,
      '第 ' + (i + 1) + ' 次仍然是"哈两口"（' + w.phases.join('→') + '，' + w.ms + 'ms）');
    await sleep(350);
  }
  ok(durs[1] < durs[0] - 120 && durs[2] < durs[1] - 60,
    '重复观看自动变短：' + durs.join('ms → ') + 'ms');

  /* ================================================================ 5. 划桌角 */
  await enterRepair(70, 0);
  await page.keyboard.press('ArrowLeft');
  await sleep(220);
  await page.keyboard.press('ArrowRight');
  await sleep(520);                          // 攒够两下，等 320ms 的结算窗口
  const w2 = await watch({
    max: 9000,
    snap: {
      stroke1: { tag: '04_rub_stroke1' },
      lift: { tag: '05_rub_lift' },
      stroke2: { tag: '06_rub_stroke2' }
    }
  });
  const afterRub = await st();
  ok(w2.phases.indexOf('stroke1') >= 0 && w2.phases.indexOf('stroke2') >= 0,
    '划桌两下都演到了（拍子：' + w2.phases.join(' → ') + '）');
  ok(w2.phases.indexOf('lift') > w2.phases.indexOf('stroke1') &&
    w2.phases.indexOf('lift') < w2.phases.indexOf('stroke2'),
    '两下之间有「抬起来、回原位」这一拍');
  ok(w2.ms > 2300 && w2.ms < 3600, '划桌整套大约 3 秒（实测 ' + w2.ms + 'ms）');
  ok(afterRub.dirt === 70 - 18 && afterRub.wear === 0,
    '两下的数值照老规矩结算：脏污 -18、磨损不动（实测脏 ' + afterRub.dirt + ' / 磨 ' + afterRub.wear + '）');
  await shot('07_repair_desk_after');

  /* ================================================================ 6. 数值规则没被动画碰过 */
  const rules = await page.evaluate(() => {
    const S = window.SB;
    const c = S.Save.d.carts['02'];
    const out = {};
    const set = (d, w) => { c.dirt = d; c.wear = w; c.dead = false; };

    let ses = {};
    set(70, 0); S.Repair.blow('02', 0.2, ses); out.weak = c.dirt;               // 太弱：无效
    ses = {}; set(70, 0); S.Repair.blow('02', 0.95, ses); out.tooMuch = c.dirt;  // 太猛：更脏
    ses = {}; set(70, 0);
    out.best = S.Repair.blow('02', 0.7, ses).dirtDelta;                          // 最佳区间
    out.again = S.Repair.blow('02', 0.7, ses).dirtDelta;                         // 同 session 递减

    ses = {}; set(70, 0); S.Repair.rub('02', 3, ses);
    out.rub3 = { dirt: c.dirt, wear: c.wear };
    ses = {}; set(70, 0); S.Repair.rub('02', 5, ses);
    out.rub5 = { dirt: c.dirt, wear: c.wear };
    ses = {}; set(70, 0); S.Repair.rub('02', 6, ses);
    out.rub6 = { dirt: c.dirt, wear: c.wear };
    return out;
  });
  ok(rules.weak === 70, '哈气太弱（0.2）依旧完全无效');
  ok(rules.tooMuch === 77, '哈气太猛（0.95）依旧把卡带哈湿：脏污 +7');
  ok(rules.best === -20 && rules.again === -16,
    '最佳力度 -20，同一次修卡里再哈一口降到 -16（疲劳递减没被动画改掉）');
  ok(rules.rub3.dirt === 70 - 27 && rules.rub3.wear === 0, '划 3 下：脏污 -27、磨损 0');
  ok(rules.rub5.dirt === 70 - 20 && rules.rub5.wear === 10, '划 5 下：脏污 -20、磨损 +10');
  ok(rules.rub6.dirt === 70 - 6 && rules.rub6.wear === 42, '划 6 下：脏污只 -6、磨损陡增 +42');

  /* ================================================================ 收尾 */
  const realErrs = errs.filter(e => !/AudioContext|autoplay|favicon|Failed to load resource/i.test(e));
  ok(realErrs.length === 0, '整场没有 JS 报错' + (realErrs.length ? '：' + realErrs.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log('\n通过 ' + pass + ' / 失败 ' + fail + '　截图在 ' + OUT);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.log('  FAIL 脚本自己炸了：' + (e && e.message ? e.message : e));
  process.exit(1);
});
