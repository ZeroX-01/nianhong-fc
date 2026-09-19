/* 关键界面存档截图：Shelf 详情面板（普通卡 / 描述最长的卡）、Room、Play。
 * 用法：node keys_ui_shots.js before   |   node keys_ui_shots.js after
 * 截图落在 tools/gametest/keys_ui/ 下，文件名带 before_ / after_ 前缀。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TAG = (process.argv[2] || 'shot').replace(/[^a-z0-9_]/gi, '');
const OUT = path.join(__dirname, 'keys_ui');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function boot(page) {
  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1200);
  return box;
}

/* 全卡带、无妈妈、钱够的干净存档 */
async function startScene(page, key, data) {
  await page.evaluate((a) => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true;
    S.Save.d.__nomom = true;
    S.Save.d.money = 60;
    S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; });
    S.Save.d.inserted = '02';
    S.Save.d.seated = true;
    S.Save.d.carts['02'].dirt = 0;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start(a.key, a.data || {});
  }, { key, data });
}

async function clearDialog(page) {
  for (let i = 0; i < 12; i++) {
    if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
    await page.keyboard.press('x');
    await sleep(220);
  }
  await sleep(300);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await boot(page);

  /* ---- Shelf：先看默认那张，再看描述最长的那张 ---- */
  await startScene(page, 'Shelf', { from: 'Room' });
  await sleep(1800);
  await clearDialog(page);
  await page.screenshot({ path: path.join(OUT, TAG + '_shelf_default.png') });

  const longest = await page.evaluate(() => {
    const S = window.SB;
    let best = null, n = -1;
    S.CARTS.forEach((c, i) => {
      const lines = S.Text.wrap(c.desc + '\n\n' + c.back, 148, 12).split('\n').length;
      if (lines > n) { n = lines; best = { i, id: c.id, name: c.name, lines }; }
    });
    return best;
  });
  console.log('描述最长的卡带：' + longest.name + '（' + longest.id + '，' + longest.lines + ' 行）');
  await page.evaluate((i) => {
    const sc = window.SB.game.scene.getScene('Shelf');
    sc.cur = i; sc.refresh();
  }, longest.i);
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, TAG + '_shelf_longest.png') });

  /* ---- Room ---- */
  await startScene(page, 'Room', { from: 'test' });
  await sleep(1800);
  await clearDialog(page);
  await page.screenshot({ path: path.join(OUT, TAG + '_room.png') });

  /* ---- Play ---- */
  await startScene(page, 'Play', { cartId: '02' });
  await sleep(6500);
  await page.screenshot({ path: path.join(OUT, TAG + '_play.png') });

  /* ---- Repair / Market / Album 顺手也留一张 ---- */
  await startScene(page, 'Repair', { cartId: '02', from: 'Room' });
  await sleep(1800);
  await clearDialog(page);
  await page.screenshot({ path: path.join(OUT, TAG + '_repair.png') });

  await startScene(page, 'Market', { from: 'Room' });
  await sleep(2200);
  await clearDialog(page);
  await page.screenshot({ path: path.join(OUT, TAG + '_market.png') });

  /* ---- 其余带返回按钮的非全屏场景 ---- */
  for (const [key, data, wait] of [
    ['Album', { from: 'Room' }, 1800],
    ['Settings', { from: 'Room' }, 1600],
    ['Homework', { from: 'Room' }, 2000],
    ['Friend', { from: 'Room' }, 2400],
    ['Title', {}, 2400]
  ]) {
    await startScene(page, key, data);
    await sleep(wait);
    await clearDialog(page);
    await page.screenshot({ path: path.join(OUT, TAG + '_' + key.toLowerCase() + '.png') });
  }

  console.log('截图已落在 ' + OUT + '（前缀 ' + TAG + '_）');
  await browser.close();
})();
