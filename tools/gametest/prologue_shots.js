/* 序章 12 镜的存档截图。改完画面拿它出图，一眼看完整段。
 *
 * 跑法：先起 python3 -m http.server 8100，再
 *   node tools/gametest/prologue_shots.js [端口或线上地址]
 * 图落在 tools/gametest/prologue/shots/ 。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARG = process.env.PORT || process.argv[2] || '8100';
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/$/, '') : 'http://localhost:' + ARG;
const OUT = path.join(__dirname, 'prologue', 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('ERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CERR ' + m.text()); });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await sleep(3400);
  await page.mouse.click(480, 270);
  await sleep(1400);

  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset(); S.Save.d.__nomom = true; S.Save.d.seenIntro = true;
    S.game.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    S.game.scene.start('Prologue', { from: 'title', intro: true });
  });
  await sleep(1600);

  const n = await page.evaluate(() => window.SB.STORY.prologue.length);
  for (let i = 0; i < n; i++) {
    const id = await page.evaluate((k) => {
      const sc = window.SB.game.scene.getScene('Prologue');
      sc.closeMenu(); sc.clearLineTimers(); sc.playBeat(k);
      return sc.beat.id + '_' + sc.beat.art;
    }, i);
    /* 先让旁白打完一行，再把自动播放停掉 —— 不然等渐显跑完时
     * 这一镜可能已经自己翻过去了，拍到的就是下一镜的画面。 */
    await sleep(1400);
    await page.evaluate(() => window.SB.game.scene.getScene('Prologue').clearLineTimers());
    await sleep(2400);
    /* 等车那一镜顺手把 18 秒拨到头，把「车来了」也拍下来 */
    if (id.indexOf('s05') === 0) {
      await page.screenshot({ path: path.join(OUT, String(i + 1).padStart(2, '0') + '_' + id + '_waiting.png') });
      await page.evaluate(() => {
        const sc = window.SB.game.scene.getScene('Prologue');
        sc.gateAt = sc.time.now;
      });
      await sleep(900);
    }
    await page.screenshot({ path: path.join(OUT, String(i + 1).padStart(2, '0') + '_' + id + '.png') });
    const real = await page.evaluate(() => {
      const sc = window.SB.game.scene.getScene('Prologue');
      return sc.beat.id + '_' + sc.artName;
    });
    console.log('shot ' + id + (real === id ? '' : '  ! 拍到的其实是 ' + real));
  }
  console.log('图在 ' + OUT);
  await browser.close();
})();
