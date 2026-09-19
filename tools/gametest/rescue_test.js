/* 抢救那几秒：动作段的验收。
 *
 * 要证明的事：
 *   1. 妈妈到 w3（钥匙插锁）会自动进入抢救，不用玩家再按 START
 *   2. w1/w2 时按 START 也能主动开始收拾
 *   3. 抢救期间小游戏停着，妈妈的秒表照跑（时间压力是真的）
 *   4. 判定分三档：正好不罚时间、勉强罚小半秒、手滑罚一秒多且这一下重来
 *   5. 三下按完 = 电视关了、卡带拔了、藏进沙发缝，回客厅且收场评级正确
 *   6. 越急判定区越宽（被逼到墙角时难度要降、紧张感要升）
 *   7. 没收拾完就被堵在门口 = 走原来的被抓惩罚，并记一笔 rescueFail
 *   8. 电视本来就关着的时候不该白送一次「干净收场」
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'rescue');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const pass = [], fail = [];
const ok = (c, msg) => { (c ? pass : fail).push(msg); console.log((c ? '  PASS ' : '  FAIL ') + msg); };

/* 干净地开一局：清档、插卡、开电视、进 Play，妈妈上弦但先别动 */
async function enterPlay(page, opts) {
  const o = opts || {};
  await page.evaluate(() => {
    const g = window.SB.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Title');
  });
  await sleep(900);
  await page.evaluate((o) => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true;
    S.Save.d.carts['02'].owned = true;
    S.Save.d.carts['02'].dirt = 0;
    S.Save.d.inserted = o.noCart ? null : '02';
    S.Save.d.seated = true;
    S.Save.d.tvOn = !o.tvOff;
    S.Save.save();
    /* 每一轮都从「妈妈刚出门」开始数，否则上一轮停在 w3 的状态会带进来 */
    S.Parent.disarm();
    S.Rescue.stop();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Play', { cartId: '02' });
  }, o);
  await sleep(4600);
}

/* 把妈妈的秒表推到某个比例（0.83 = 楼道脚步声，0.96 = 钥匙插锁） */
const wind = (page, p) => page.evaluate((p) => {
  window.SB.Parent.t = window.SB.Parent.eta * p;
}, p);

const st = (page) => page.evaluate(() => {
  const S = window.SB, P = S.game.scene.getScene('Play'), R = S.Rescue;
  return {
    scene: S.game.scene.getScenes(true).map(s => s.scene.key).join(','),
    rescueOn: !!(P && P.rescueOn),
    live: R.live,
    step: R.cur() ? R.cur().key : null,
    i: R.i, n: R.steps.length,
    miss: R.miss, perfect: R.perfect, okc: R.okc,
    half: R.half, speed: R.speed, cursor: R.cursor, center: R.center,
    momT: S.Parent.t, momEta: S.Parent.eta, momState: S.Parent.state,
    tvOn: S.Save.d.tvOn, inserted: S.Save.d.inserted, hidden: S.Save.d.hidden,
    stats: S.Save.d.stats, trust: S.Save.d.momTrust,
    stepText: (P && P.rStep) ? P.rStep.text : '',
    judgeText: (P && P.rJudge) ? P.rJudge.text : '',
    boxVisible: !!(P && P.rescueBox && P.rescueBox.visible)
  };
});

/* 把光标搬到指定位置再按一下：用来精确制造 正好 / 勉强 / 手滑 */
async function hitAt(page, where) {
  await page.evaluate((where) => {
    const R = window.SB.Rescue;
    if (where === 'perfect') R.cursor = R.center;
    else if (where === 'ok') R.cursor = window.SB.clamp(R.center + R.half * 0.75, 0, 1);
    else R.cursor = R.center > 0.5 ? 0 : 1;
    /* 停住光标，免得下一帧又走开 */
    R.speed = 0;
  }, where);
  await page.keyboard.press('x');
  await sleep(220);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1200);

  /* ---------------- 一、钥匙插锁自动进入抢救 ---------------- */
  console.log('\n[1] 钥匙插锁自动进入抢救');
  await enterPlay(page);
  let a = await st(page);
  ok(a.scene.indexOf('Play') >= 0, '进到了电视里');
  ok(!a.rescueOn, '一开始不在抢救里');

  await wind(page, 0.958);
  await sleep(700);
  a = await st(page);
  ok(a.momState === 'w3', '妈妈到了钥匙插锁');
  ok(a.rescueOn && a.live, '自动进入抢救，不用玩家再按 START');
  ok(a.n === 3, '三件事都要干：' + a.n);
  ok(a.boxVisible, '判定条露出来了');
  await page.screenshot({ path: path.join(OUT, '01-auto-w3.png') });

  /* 秒表照跑：抢救期间时间必须继续走 */
  const t0 = a.momT;
  await sleep(600);
  a = await st(page);
  ok(a.momT > t0, '抢救期间妈妈的秒表照跑（' + Math.round(t0) + ' → ' + Math.round(a.momT) + '）');

  /* ---------------- 二、三下按完，评级 clean ---------------- */
  console.log('\n[2] 三下全按正好 = 干净收场');
  await enterPlay(page);
  await wind(page, 0.80);
  await sleep(500);
  await page.keyboard.press('Enter');          // 主动开始收拾
  await sleep(500);
  a = await st(page);
  ok(a.rescueOn, 'w1/w2 时按 START 能主动开始收拾');
  ok(a.step === 'tv', '第一下是关电视');
  await page.screenshot({ path: path.join(OUT, '02-manual-start.png') });

  await hitAt(page, 'perfect');
  a = await st(page);
  ok(!a.tvOn, '第一下按下去，电视关了');
  ok(a.perfect === 1 && a.miss === 0, '判成了「正好」');
  ok(a.step === 'cart', '第二下是拔卡带');

  await hitAt(page, 'perfect');
  a = await st(page);
  ok(!a.inserted, '第二下按下去，卡带拔出来了');
  ok(a.step === 'hide', '第三下是塞沙发缝');
  await page.screenshot({ path: path.join(OUT, '03-third-step.png') });

  await hitAt(page, 'perfect');
  await sleep(1600);
  a = await st(page);
  ok(a.hidden === '02', '第三下按下去，卡藏进沙发缝了');
  ok(a.scene.indexOf('Room') >= 0, '收拾完回到客厅');
  ok(a.stats.rescueClean === 1, '记了一次干净收场');
  ok(a.trust > 50, '干净收场给了一点信任（' + a.trust + '）');
  await page.screenshot({ path: path.join(OUT, '04-clean-room.png') });

  /* ---------------- 三、手滑要罚时间，而且这一下重来 ---------------- */
  console.log('\n[3] 手滑罚时间且重来');
  await enterPlay(page);
  await wind(page, 0.80);
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(500);
  const b0 = await st(page);
  await hitAt(page, 'miss');
  let b1 = await st(page);
  ok(b1.miss === 1, '判成了「手滑」');
  ok(b1.step === 'tv', '手滑之后还是这一下，得重来');
  ok(b1.tvOn, '手滑没把电视关掉');
  ok(b1.momT - b0.momT > 900, '手滑真的少了一秒多（+' + Math.round(b1.momT - b0.momT) + 'ms）');
  ok(b1.judgeText.length > 0, '屏幕上给了判定反馈：' + b1.judgeText);

  /* 勉强：也罚时间，但这一下算过 */
  const b2 = await st(page);
  await hitAt(page, 'ok');
  const b3 = await st(page);
  ok(b3.okc === 1 && b3.step === 'cart', '「勉强」算过，进到下一下');
  ok(b3.momT - b2.momT > 300 && b3.momT - b2.momT < 900,
    '「勉强」罚的是小半秒（+' + Math.round(b3.momT - b2.momT) + 'ms）');

  /* 收完剩下两下，因为滑过一次，评级只能是 close */
  await hitAt(page, 'perfect');
  await hitAt(page, 'perfect');
  await sleep(1600);
  const b4 = await st(page);
  ok(b4.stats.rescueClose === 1 && b4.stats.rescueClean === 0, '滑过一次就只能算差一点');
  ok(b4.scene.indexOf('Room') >= 0, '照样回到客厅');

  /* ---------------- 四、越急判定区越宽 ---------------- */
  console.log('\n[4] 越急判定区越宽');
  await enterPlay(page);
  await wind(page, 0.70);
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(400);
  const calm = await st(page);
  await enterPlay(page);
  await wind(page, 0.985);
  await sleep(700);
  const rush = await st(page);
  ok(rush.half > calm.half, '被逼到墙角时命中区更宽（' +
    calm.half.toFixed(3) + ' → ' + rush.half.toFixed(3) + '）');
  ok(rush.speed > calm.speed, '同时光标扫得更快（' +
    calm.speed.toFixed(2) + ' → ' + rush.speed.toFixed(2) + '）');

  /* ---------------- 五、没收完被堵在门口 ---------------- */
  console.log('\n[5] 没收完被堵在门口');
  await enterPlay(page);
  await page.evaluate(() => { window.SB.Parent.t = window.SB.Parent.eta * 0.958; });
  await sleep(600);
  let c = await st(page);
  ok(c.rescueOn, '进了抢救');
  /* 什么都不按，门开的那一刻电视还开着，评级只能是 fail */
  const grade = await page.evaluate(() => window.SB.Rescue.grade());
  ok(grade === 'fail', '门开之前的评级是没收完：' + grade);
  await page.evaluate(() => { window.SB.Parent.t = window.SB.Parent.eta + 1; });
  await sleep(2600);
  c = await st(page);
  ok(c.scene.indexOf('Room') >= 0, '被抓之后回到客厅');
  ok(c.stats.rescueFail === 1, '记了一次没收完');
  ok(c.stats.rescueClean === 0 && c.stats.rescueClose === 0, '没给任何收场分');
  await page.screenshot({ path: path.join(OUT, '05-busted.png') });

  /* ---------------- 六、本来就没什么可收拾的 ---------------- */
  console.log('\n[6] 电视没开就不该白送一次干净收场');
  await enterPlay(page, { tvOff: true, noCart: true });
  await wind(page, 0.958);
  await sleep(2400);
  const d = await st(page);
  ok((d.stats.rescueClean || 0) === 0, '没白送干净收场');
  ok(d.scene.indexOf('Play') < 0, '照样离开了电视前');

  /* ---------------- 七、没有报错 ---------------- */
  console.log('\n[7] 没有报错');
  ok(errs.length === 0, '控制台干净：' + JSON.stringify(errs.slice(0, 3)));

  console.log('\n通过 ' + pass.length + ' 项，失败 ' + fail.length + ' 项');
  if (fail.length) { fail.forEach(f => console.log('  × ' + f)); }
  fs.writeFileSync(path.join(OUT, 'report.json'),
    JSON.stringify({ pass: pass.length, fail: fail, errs: errs }, null, 2));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
