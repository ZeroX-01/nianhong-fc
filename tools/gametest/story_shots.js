/* 这一版剧情线的四张定妆照：把新加的东西拍下来 ——
 * 挂历上的章节 + 还机倒计时、心愿单/账本、集市上那台二手主机。
 * 用法：PORT=8100 node tools/gametest/story_shots.js v1（v2 外壳要宽窗：VW=1280 VH=860）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || '8100';
const TAG = process.argv[2] || 'v1';
const OUT = path.join(__dirname, 'story');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: +(process.env.VW || 960), height: +(process.env.VH || 540) }
  });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3000);
  await page.mouse.click(480, 270);
  await sleep(1200);

  /* 摆一个「暑假过了一半、钱攒了一半」的局 */
  await page.evaluate(() => {
    const S = window.SB, d = S.Save.d;
    d.seenIntro = true; d.__nomom = true;
    d.day = 20; d.money = 26.5; d.inserted = '02'; d.seated = true;
    d.homework = 45; d.momTrust = 58;
    S.Story.state().told = true;
    S.Story.state().mood = 72;
    S.Story.state().ledger = { day: 20, today: 3.1, total: 31.8, saved: 4.5, src: { allowance: 0.5, bottle: 1.6, errand: 1.0 } };
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Room', { from: 'debug' });
  });
  await sleep(2200);
  await page.screenshot({ path: path.join(OUT, TAG + '_01_room.png') });

  /* 挂历：4 句 —— 描述 / 暑假还剩 / 第几章 / 还机还有几天，点到最后那句 */
  await page.evaluate(() => {
    const r = window.SB.game.scene.getScene('Room');
    r.act('calendar');
  });
  await sleep(900);
  for (let i = 0; i < 3; i++) { await page.mouse.click(480, 460); await sleep(600); }
  await page.screenshot({ path: path.join(OUT, TAG + '_02_calendar.png') });

  /* 心愿单 = 账本 + 还差多少 + 心情（先把挂历那段话点完） */
  await page.mouse.click(480, 460);
  await sleep(800);
  await page.evaluate(() => {
    const r = window.SB.game.scene.getScene('Room');
    r.busy = false;
    r.openWish();
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, TAG + '_03_wish.png') });

  /* 集市：张老板摊上那台二手主机 */
  await page.evaluate(() => {
    const g = window.SB.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Market', { from: 'debug' });
  });
  await sleep(2200);
  await page.evaluate(() => {
    const m = window.SB.game.scene.getScene('Market');
    m.zhangMenu();
  });
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, TAG + '_04_market_console.png') });

  console.log('截图 4 张 → ' + OUT + '（前缀 ' + TAG + '_）');
  console.log(errs.length ? '报错：\n  ' + errs.join('\n  ') : '零报错');
  await browser.close();
})();
