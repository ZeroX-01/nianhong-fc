/* 线上部署冒烟：只验证「打开链接能不能玩」。
 * 部署包为了压文件数只带了 mp3（去掉了 ogg），所以这里重点看音频有没有全丢。
 * 用法：node tools/gametest/deployed_smoke.js https://你的站点地址
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = process.argv[2];
if (!URL) { console.log('用法：node deployed_smoke.js <url>'); process.exit(2); }
const OUT = path.join(__dirname, 'deployed');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [], fourOhFour = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) fourOhFour.push(r.status() + ' ' + r.url()); });

  await page.goto(URL, { waitUntil: 'load' });
  await sleep(5000);
  await page.mouse.click(480, 270);          // 点击开机
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, '01_title.png') });

  const boot = await page.evaluate(() => {
    const S = window.SB;
    return {
      sb: !!S,
      scene: S ? S.game.scene.getScenes(true).map(s => s.scene.key).join(',') : '',
      audio: S ? S.game.cache.audio.getKeys().length : 0,
      img: S ? S.game.textures.getTextureKeys().length : 0,
      missing: S && S.Audio ? Object.keys(S.Audio.missing || {}).length : -1
    };
  });
  console.log('  启动状态：' + JSON.stringify(boot));
  ok(boot.sb, 'SB 起来了');
  ok(/Title|Room|Boot/.test(boot.scene), '进到了标题/客厅（' + boot.scene + '）');
  ok(boot.audio > 40, '音频加载到了 ' + boot.audio + ' 个（mp3-only 没丢）');
  ok(boot.img > 80, '贴图加载到了 ' + boot.img + ' 张');

  /* 直接开一局，确认游戏实例能建起来 */
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true; S.Save.d.__nomom = true;
    S.Save.d.carts['02'].owned = true;
    S.Save.d.carts['02'].dirt = 0; S.Save.d.carts['02'].wear = 0;
    S.Save.d.slotDirt = 0; S.Save.d.inserted = '02'; S.Save.d.seated = true; S.Save.d.tvOn = true;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Play', { cartId: '02' });
  });
  let hasGame = false;
  for (let i = 0; i < 20; i++) {
    hasGame = await page.evaluate(() => {
      const p = window.SB.game.scene.getScene('Play');
      return !!(p && p.scene.isActive() && p.game_);
    });
    if (hasGame) break;
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, '02_play.png') });
  ok(hasGame, '线上能真的进游戏（铁甲坦克跑起来了）');

  console.log('--- 4xx/5xx ' + fourOhFour.length + ' 条 ---');
  fourOhFour.slice(0, 10).forEach(u => console.log('  ' + u));
  ok(fourOhFour.length === 0, '没有 404 资源');
  console.log('--- JS 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '没有 JS 报错');

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
