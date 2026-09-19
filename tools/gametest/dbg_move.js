/* 排查「按住方向键坦克只挪了几个像素」：按住 D 的 700ms 里逐帧采样，
 * 看的是三件事 —— 输入有没有被读到（held）、游戏循环有没有在跑（frames/fps）、
 * 坦克坐标到底走了多少。用来区分「键位坏了」和「无头环境帧率太低」。
 *
 * 用法：python3 -m http.server 8100 ；node tools/gametest/dbg_move.js
 */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:' + (process.argv[2] || '8100');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(() => !!(window.SB && window.SB.game && window.SB.Input))) break;
    await sleep(200);
  }
  await sleep(1800);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1200);

  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
    S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; S.Save.d.carts[c.id].dirt = 0; S.Save.d.carts[c.id].wear = 0; });
    S.Save.d.inserted = '02'; S.Save.d.seated = true;
    S.Save.save();
    const g = S.game, t = g.scene.getScene('Play');
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== 'Play') s.scene.stop(); });
    if (t && t.scene.isActive()) t.scene.restart({ cartId: '02', gameKey: 'tank' });
    else g.scene.start('Play', { cartId: '02', gameKey: 'tank' });
  });

  /* 等到真能动 */
  for (let i = 0; i < 120; i++) {
    const ph = await page.evaluate(() => {
      const g = window.SB.game.scene.getScene('Play').game_;
      return g ? g.phase : null;
    });
    if (ph === 'play') break;
    await sleep(120);
  }

  /* 装个探针：每帧记一次坦克 x/y 与 1P 的按住状态 */
  await page.evaluate(() => {
    const S = window.SB, P = S.game.scene.getScene('Play'), g = P.game_, t = g.players[0];
    t.x = 32; t.y = 80; t.dir = 0; t.acc = 0; t.slide = 0; t.alive = true; t.out = false; t.stun = 0; t.reviveT = 0;
    g.giveShield(t, 60000); g.syncTank(t);
    window.__trace = [];
    const raw = g.update.bind(g);
    g.update = function (dt) {
      const p = g.players[0];
      window.__trace.push({
        dt: Math.round(dt), x: Math.round(p.x), y: Math.round(p.y), dir: p.dir,
        acc: Math.round((p.acc || 0) * 100) / 100, stun: Math.round(p.stun || 0),
        hr: !!S.Input.p1.right, hd: !!S.Input.p1.down, kbr: !!S.Input.p1.kb.right, phase: g.phase
      });
      return raw(dt);
    };
  });

  for (const code of ['KeyD', 'KeyS', 'ArrowRight']) {
    await page.evaluate(() => {
      const g = window.SB.game.scene.getScene('Play').game_, t = g.players[0];
      t.x = 32; t.y = 80; t.dir = 0; t.acc = 0; t.slide = 0; t.stun = 0;
      g.syncTank(t); window.__trace = [];
    });
    await page.keyboard.down(code);
    await sleep(700);
    const tr = await page.evaluate(() => window.__trace.slice());
    await page.keyboard.up(code);
    await sleep(200);
    console.log('\n=== ' + code + ' 按住 700ms ===');
    console.log('  帧数 ' + tr.length + '　等效 fps ' + Math.round(tr.length / 0.7));
    console.log('  前 6 帧 ' + JSON.stringify(tr.slice(0, 6)));
    console.log('  末 3 帧 ' + JSON.stringify(tr.slice(-3)));
    const held = tr.filter(f => f.hr || f.hd).length;
    console.log('  读到按住的帧数 ' + held + ' / ' + tr.length);
  }

  await browser.close();
})();
