/* 外层流程自动化冒烟测试。
 *
 * 它做的事：真的用键盘从标题走一圈——标题 → 客厅 → 鞋盒 → 插卡 → 开电视 →
 * 修卡 → 集市 → 发小家 → 写作业 → 设置 → 回忆册，一路收 console error，
 * 每到一屏截一张图，最后把当前场景 key 和存档摘要打出来。
 *
 * 用法（先在仓库根目录起 python3 -m http.server 8100）：
 *   node tools/gametest/smoke_outer.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'http://localhost:8100/index.html';
const OUT = path.join(__dirname, 'outer');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  const errors = [];
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errors.push('[' + t + '] ' + m.text());
  });
  page.on('pageerror', e => errors.push('[pageerror] ' + (e.message || e)));

  await page.goto(URL, { waitUntil: 'load' });
  await sleep(3200);   // 等 Boot 把字体、图、音频都装完
  /* 浏览器要一次用户手势才肯放声音：Boot 会停在「点击开机」 */
  await page.mouse.click(480, 270);
  await sleep(1200);

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  };
  const key = () => page.evaluate(() => {
    const g = window.SB && window.SB.game;
    if (!g) return null;
    const on = g.scene.getScenes(true).map(s => s.scene.key);
    return on.join(',');
  });
  const press = async (k, n = 1, gap = 140) => {
    for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); }
  };
  const step = async (name) => {
    await sleep(500);
    console.log(('  → ' + name).padEnd(34), 'scenes:', await key());
    await shot(name);
  };

  /* 有些场景要一路点掉对话框 */
  const clear = async (n = 8) => { await press('x', n, 200); };

  console.log('— 打开页面 —');
  await step('01_title');

  /* 标题：直接选第一项（继续 / 开始这个夏天） */
  await press('x', 1, 500);
  await clear(10);
  await step('02_room');

  /* 客厅：把光标推到鞋盒，进鞋盒。用 TAB 遍历更稳，一直按到 Shelf 出现。 */
  let entered = false;
  for (let i = 0; i < 22 && !entered; i++) {
    await page.keyboard.press('Tab'); await sleep(90);
    const label = await page.evaluate(() => {
      const s = window.SB.game.scene.getScene('Room');
      if (!s || !s.spots || !s.spots[s.cur]) return '';
      return s.spots[s.cur].id;
    });
    if (label === 'shoebox') {
      await press('x', 1, 700);
      entered = ((await key()) || '').indexOf('Shelf') >= 0;
    }
  }
  await step('03_shelf');

  /* 鞋盒：选一张有的卡带插进去（第 2 张 = 铁甲坦克，开局就有） */
  await press('ArrowRight', 1, 200);
  await press('x', 1, 400);
  await clear(4);              // 「插进主机」菜单 + 咔哒对白
  await step('04_after_insert');

  /* 客厅：开电视 → 有可能花屏 → 进修卡 */
  await page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Room');
    if (s && s.act) s.act('tv');
  });
  await sleep(600);
  await clear(6);
  await step('05_tv_menu_or_play');

  /* 不管当前在哪，强制去几个还没验证过的场景各截一张 */
  const visit = async (sceneKey, data, name) => {
    await page.evaluate(({ sceneKey, data }) => {
      const g = window.SB.game;
      const on = g.scene.getScenes(true);
      on.forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
      g.scene.start(sceneKey, data);
    }, { sceneKey, data });
    await sleep(1400);
    await clear(6);
    await step(name);
  };

  await visit('Market', { from: 'Room' }, '06_market');
  /* 集市：跟老王搭一次话，翻开卡带菜单 */
  await press('x', 1, 500);
  await shot('06b_market_menu');
  await press('c', 1, 300);

  await visit('Friend', { from: 'Room' }, '07_friend');
  await press('x', 1, 500);
  await shot('07b_friend_menu');
  await press('c', 1, 300);

  await visit('Homework', { from: 'Room' }, '08_homework');
  /* 照着笔顺乱按几下，看会不会崩 */
  for (const k of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
    await page.keyboard.press(k); await sleep(160);
  }
  await shot('08b_homework_writing');

  await visit('Settings', { from: 'Title' }, '09_settings');
  await press('ArrowDown', 2, 180);
  await press('ArrowRight', 3, 180);
  await shot('09b_settings_tweak');

  await visit('Album', { from: 'Title' }, '10_album');

  await visit('Repair', { cartId: '02', from: 'Room' }, '11_repair');

  const dump = await page.evaluate(() => {
    const s = window.SB.Save.d;
    return {
      day: s.day, slot: s.slot, ap: s.ap, money: s.money,
      inserted: s.inserted, seated: s.seated, fault: s.fault,
      homework: s.homework, album: s.album.length,
      owned: window.SB.Save.ownedCarts().map(c => c.id),
      missingArt: Object.keys(window.SB.MISSING || {}).slice(0, 12),
      missingAudio: Object.keys(window.SB.Audio.missing || {}).slice(0, 12),
      jsErrors: (window.__errors || []).slice(0, 12)
    };
  });

  console.log('\n— 存档摘要 —');
  console.log(JSON.stringify(dump, null, 2));

  console.log('\n— console error / warning（' + errors.length + '）—');
  errors.slice(0, 40).forEach(e => console.log('  ' + e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
