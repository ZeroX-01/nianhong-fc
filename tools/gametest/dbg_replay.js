/* 抓「同一屏第二次进去就黑屏」的问题：连开两次坦克，把开机链路每一步都打点。 */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('ERR ' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') console.log('[err] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1200);

  await page.evaluate(() => {
    const S = window.SB;
    window.__t = [];
    const P = S.PlayScene.prototype;
    ['showTitleCard', 'startGame'].forEach(fn => {
      const orig = P[fn];
      P[fn] = function () { window.__t.push(fn); return orig.apply(this, arguments); };
    });
    /* 给 CRT.powerOn 的每一步打点（从工厂函数里劫持实例） */
    const cf = S.CRT.create;
    S.CRT.create = function () {
      const inst = cf.apply(S.CRT, arguments);
      const po = inst.powerOn.bind(inst);
      inst.powerOn = function (cb) {
        window.__t.push('powerOn:enter');
        return po(function () { window.__t.push('powerOn:cb'); if (cb) cb(); });
      };
      return inst;
    };
  });

  await page.evaluate(() => { window.__cart = '04'; });
  for (let i = 1; i <= 2; i++) {
    await page.evaluate((id) => {
      const S = window.SB;
      window.__t.push('--- run ' + id);
      S.Save.reset();
      S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
      S.Save.d.carts[window.__cart].owned = true; S.Save.d.carts[window.__cart].dirt = 0;
      S.Save.d.inserted = window.__cart; S.Save.d.seated = true; S.Save.d.tvOn = true;
      S.Save.save();
      const g = S.game;
      g.scene.getScenes(true).forEach(s => {
        if (s.scene.key === 'Sys' || s.scene.key === 'Play') return;
        s.scene.stop();
      });
      const pl = g.scene.getScene('Play');
      if (pl && pl.scene.isActive()) pl.scene.restart({ cartId: window.__cart });
      else g.scene.start('Play', { cartId: window.__cart });
    }, i);
    await sleep(5200);
    const st = await page.evaluate(() => {
      const p = window.SB.game.scene.getScene('Play');
      return {
        trace: window.__t.slice(-6),
        inst: !!p.game_,
        crtOn: p.crt && p.crt.on,
        tweens: p.tweens.getTweens().length,
        timers: p.time.getPendingEvents ? p.time.getPendingEvents() : (p.time._active || -1)
      };
    });
    console.log('run ' + i + ': ' + JSON.stringify(st));
    /* 补刀检查：这一屏的 tween / timer 还活着吗？ */
    const alive = await page.evaluate(async () => {
      const p = window.SB.game.scene.getScene('Play');
      const o = p.add.rectangle(-50, -50, 4, 4, 0xffffff, 1);
      let tweenDone = false, timerDone = false;
      p.tweens.add({ targets: o, x: 0, duration: 120, onComplete: () => { tweenDone = true; } });
      p.time.delayedCall(120, () => { timerDone = true; });
      await new Promise(r => setTimeout(r, 600));
      o.destroy();
      return { tweenDone, timerDone, mgrPaused: p.tweens.paused, timePaused: p.time.paused,
               sysActive: p.scene.isActive(), sysPaused: p.scene.isPaused(),
               loopRunning: window.SB.game.loop.running, fps: Math.round(window.SB.game.loop.actualFps) };
    });
    console.log('        活性：' + JSON.stringify(alive));
    await page.screenshot({ path: __dirname + '/play/dbg_run' + i + '.png' });
  }
  await browser.close();
})();
