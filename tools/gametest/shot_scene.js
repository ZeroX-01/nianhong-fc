/* 单屏检查器：直接把某一屏调出来、清掉对话框、截一张干净的图，
 * 并列出这一屏里实际存在的贴图 key（用来抓「图画了但被遮住 / 根本没画」）。
 *
 * 用法：node tools/gametest/shot_scene.js Room [文件名后缀]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const KEY = process.argv[2] || 'Room';
const TAG = process.argv[3] || KEY.toLowerCase();
const OUT = path.join(__dirname, 'outer');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3000);
  await page.mouse.click(480, 270);
  await sleep(1000);

  await page.evaluate((KEY) => {
    /* 跳过开场、关掉妈妈，直接进目标场景 */
    const S = window.SB;
    S.Save.d.seenIntro = true;
    S.Save.d.__nomom = true;
    S.Save.d.inserted = '02';
    S.Save.d.seated = true;
    S.Save.d.money = 20;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start(KEY, { from: 'debug' });
  }, KEY);

  await sleep(1600);
  /* 把可能弹出的对话框点掉 */
  for (let i = 0; i < 6; i++) { await page.keyboard.press('x'); await sleep(220); }
  await sleep(600);

  const info = await page.evaluate((KEY) => {
    const s = window.SB.game.scene.getScene(KEY);
    if (!s) return null;
    const out = [];
    s.children.list.forEach(o => {
      const k = (o.texture && o.texture.key) || o.type;
      out.push({ k: k, x: Math.round(o.x), y: Math.round(o.y), d: o.depth, vis: o.visible, a: Math.round((o.alpha || 0) * 100) / 100 });
    });
    return out;
  }, KEY);

  await page.screenshot({ path: path.join(OUT, 'scene_' + TAG + '.png') });

  console.log('--- ' + KEY + ' 上的对象（' + (info ? info.length : 0) + '）---');
  (info || []).forEach(o => {
    if (o.k === 'Text' || o.k === 'BitmapText') return;
    console.log(`  ${String(o.k).padEnd(16)} x=${String(o.x).padStart(4)} y=${String(o.y).padStart(4)} d=${String(o.d).padStart(4)} vis=${o.vis} a=${o.a}`);
  });
  if (errs.length) { console.log('--- 错误 ---'); errs.forEach(e => console.log('  ' + e)); }

  await browser.close();
})();
