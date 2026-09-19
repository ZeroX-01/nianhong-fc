/* 按键指引的交付截图：一张卡一张卡拍两张 —— 卡完全亮起来的样子、卡收掉以后常驻条的样子。
 *
 * 和 gamekeys_test.js 用的是同一套起场景办法，区别只有一个：
 * 这里会等淡入的补间真的走完（alpha 到 1）才按快门，不然拍出来是个鬼影。
 *
 * 用法：node tools/gametest/gamekeys_shots.js [端口]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || '8100';
const OUT = path.join(__dirname, 'gamekeys');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CARTS = {
  contra: { cartId: '01', gameKey: 'contra' },
  tank: { cartId: '02', gameKey: 'tank' },
  mario: { cartId: '03', gameKey: 'mario' },
  fight: { cartId: '04', gameKey: 'fight' },
  multi: { cartId: '05', gameKey: 'multi' },
  stub: { cartId: '07', gameKey: 'blocks' }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('[pageerror] ' + e.message));

  const shot = async (tag) => {
    await page.screenshot({ path: path.join(OUT, tag + '.png') });
    console.log('  ' + tag + '.png');
  };

  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3400);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1500);

  const startPlay = async (g, extra) => {
    const c = CARTS[g];
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true; S.Save.d.__nomom = true; S.Save.d.money = 60;
      S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; S.Save.d.carts[c.id].dirt = 0; S.Save.d.carts[c.id].wear = 0; });
      S.Save.d.owned.mag = !!a.mag;
      S.Save.d.settings.touchPad = a.touch ? 'on' : 'off';
      S.Save.d.inserted = a.cartId; S.Save.d.seated = true;
      S.Save.save();
      const game = S.game, target = game.scene.getScene('Play');
      game.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== 'Play') s.scene.stop(); });
      if (target && target.scene.isActive()) target.scene.restart(a); else game.scene.start('Play', a);
    }, Object.assign({ cartId: c.cartId, gameKey: c.gameKey }, extra || {}));
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const fresh = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Play');
        return !!(s && s.guide && !s.game_ && !s.guide.hasCard() && s.guide.mode === null);
      });
      if (fresh) return;
      await sleep(80);
    }
  };

  /* 卡完全亮起来了没有（淡入 140ms 的补间走完，alpha 才是 1） */
  const waitCardLit = async (mode, ms = 14000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Play');
        const g = s && s.guide;
        if (!g || !g.card) return null;
        return { mode: g.mode, alpha: g.card.alpha };
      });
      if (v && v.alpha > 0.98 && (!mode || v.mode === mode)) return true;
      await sleep(60);
    }
    return false;
  };
  const waitStrip = async (mode, ms = 9000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Play');
        const g = s && s.guide;
        return g ? { mode: g.mode, card: g.hasCard(), strip: !!g.strip } : null;
      });
      if (v && !v.card && v.strip && (!mode || v.mode === mode)) return true;
      await sleep(120);
    }
    return false;
  };
  /* 拍常驻条那张：先玩两下，让画面像是真在玩，而不是站在原地 */
  const playABit = async () => {
    await page.keyboard.down('ArrowRight'); await sleep(500);
    await page.keyboard.press('x'); await sleep(260);
    await page.keyboard.up('ArrowRight'); await sleep(200);
  };

  for (const g of ['contra', 'tank', 'mario', 'fight']) {
    console.log('\n' + g);
    await startPlay(g);
    await waitCardLit(g);
    await shot('deliver_' + g + '_card');
    await waitStrip(g);
    await playABit();
    await shot('deliver_' + g + '_strip');
  }

  /* 买了杂志的拳霸：必杀那几条也在卡上 */
  console.log('\nfight + 杂志');
  await startPlay('fight', { mag: true });
  await waitCardLit('fight');
  await shot('deliver_fight_card_mag');

  /* 同屏双打：1P / 2P 两套键位 */
  for (const g of ['contra', 'tank']) {
    console.log('\n' + g + ' 双打');
    await startPlay(g, { twoP: true, friend: true });
    await waitCardLit(g);
    await shot('deliver_' + g + '_card_2p');
    await waitStrip(g);
    await playABit();
    await shot('deliver_' + g + '_strip_2p');
  }

  /* 合 1 目录 / 死标题卡带 */
  console.log('\nmulti / stub');
  await startPlay('multi');
  await waitCardLit('multi');
  await shot('deliver_multi_card');
  await startPlay('stub');
  await waitStrip('stub');
  await shot('deliver_stub_strip');

  /* 暂停菜单里的「看按键说明」 */
  console.log('\n暂停菜单');
  await startPlay('mario');
  await waitStrip('mario');
  await page.keyboard.press('Enter'); await sleep(500);
  await shot('deliver_pause_menu');
  const idx = await page.evaluate(() => {
    const m = window.SB.__menu;
    return m && m.isOpen() ? m.debug().labels.indexOf('看按键说明') : -1;
  });
  for (let i = 0; i < idx; i++) { await page.keyboard.press('ArrowDown'); await sleep(200); }
  await page.keyboard.press('x');
  await waitCardLit('mario');
  await shot('deliver_pause_card_again');

  /* 坦克开场那一秒半：方向键还不管用，画面上得写着「按 X 开始」 */
  console.log('\ntank 开场提示');
  await startPlay('tank');
  for (let i = 0; i < 120; i++) {
    const v = await page.evaluate(() => {
      const g = window.SB.game.scene.getScene('Play').game_;
      return g && g.msg3 ? { ph: g.phase, vis: g.msg3.visible, text: g.msg3.text } : null;
    });
    if (v && v.ph === 'intro' && v.vis && v.text) { console.log('  ' + v.text); break; }
    await sleep(40);
  }
  await shot('deliver_tank_intro_hint');

  /* 摸屏幕的人：虚拟手柄 + 一整块加大的十字键热区，卡上的键名也改口写 A / 十字键 */
  console.log('\ntank 触屏');
  await startPlay('tank', { touch: true });
  await waitCardLit('tank');
  /* 卡自己只站 3.5 秒，改口重画不会重新计时；拍照就明确地再叫一次，
   * 免得快门按下时它刚好走完（拍出来是收掉以后的常驻条）。 */
  await page.evaluate(() => {
    window.SB.Input.setSrc('touch');
    window.SB.game.scene.getScene('Play').guide.showCard('tank');
  });
  await sleep(400);
  await shot('deliver_tank_card_touch');
  await waitStrip('tank');
  await page.evaluate(() => window.SB.Input.setSrc('touch'));
  await sleep(200);
  await shot('deliver_tank_strip_touch');

  console.log('\n截图在 ' + OUT);
  await browser.close();
})();
