/* 定点排查：为什么客厅菜单里选「坐下来玩」进不去 Play。
 * 直接打点看 enterGame / UI.go / Play.create 各自有没有被调到。 */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const log = [];
  page.on('pageerror', e => log.push('ERR ' + (e.message || e)));
  page.on('console', m => log.push('[' + m.type() + '] ' + m.text()));

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1200);

  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true;
    S.Save.d.__nomom = true;
    S.Save.d.carts['02'].owned = true;
    S.Save.d.carts['02'].dirt = 0;
    S.Save.d.inserted = '02';
    S.Save.d.seated = true;
    S.Save.d.tvOn = true;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Room', { from: 'test' });
  });
  await sleep(2000);

  /* 打点 */
  await page.evaluate(() => {
    const S = window.SB;
    window.__trace = [];
    const r = S.game.scene.getScene('Room');
    const eg = r.enterGame;
    r.enterGame = function () {
      const s = S.Save.d;
      window.__trace.push('enterGame in: inserted=' + s.inserted + ' fault=' + s.fault + ' tvOn=' + s.tvOn +
        ' dead=' + (s.carts[s.inserted] && s.carts[s.inserted].dead) + ' busy=' + this.busy);
      const out = eg.apply(this, arguments);
      window.__trace.push('enterGame out');
      return out;
    };
    const go = S.UI.go;
    S.UI.go = function (sc, key, data) {
      window.__trace.push('UI.go → ' + key);
      return go.apply(S.UI, arguments);
    };
  });

  /* 点电视 → 选「坐下来玩」 */
  await page.mouse.click(196 * 2, 60 * 2);
  await sleep(700);
  const labels = await page.evaluate(() => window.SB.__menu ? window.SB.__menu.debug() : null);
  console.log('菜单：' + JSON.stringify(labels));
  await page.keyboard.press('ArrowDown'); await sleep(300);
  console.log('光标：' + JSON.stringify(await page.evaluate(() => window.SB.__menu.debug().cur)));
  await page.keyboard.press('x'); await sleep(2500);

  console.log('打点：' + JSON.stringify(await page.evaluate(() => window.__trace), null, 1));
  console.log('场景：' + await page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',')));
  await page.screenshot({ path: __dirname + '/flow/dbg_play.png' });
  log.slice(0, 20).forEach(l => console.log('  ' + l));
  await browser.close();
})();
