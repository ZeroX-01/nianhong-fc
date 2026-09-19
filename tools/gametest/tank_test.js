/* 《铁甲坦克1990》自测脚本（只用于自测，不属于游戏本体）
 *
 * 先在 仓库根目录起服务：python3 -m http.server 8102
 *   node tools/gametest/tank_test.js solo     # 单人：打 30 秒 + 秘技过关 + 换 skin
 *   node tools/gametest/tank_test.js twoP     # 双打
 *   node tools/gametest/tank_test.js multi    # 从《100 万合 1》目录进坦克
 *
 * 有三个「不是本游戏」的现存问题，脚本里做了绕行并单独归类到 foreign：
 *   1) test-game.html 少了 index.html 里那句 window.SB = {}；
 *   2) src/core/input.js 的 init() 拿到的是 Phaser.Game，
 *      game.input.keyboard 是 KeyboardManager（没有 addKeys）→ Boot.create 抛错，
 *      连 Play 场景都没被启动；
 *   3) PlayScene.showTitleCard 先 setContentVisible(true) 再 crt.powerOn()，
 *      而 powerOn() 内部又把 dark 透明度设回 1 → 画面被黑底整块盖住。
 *   以上三处都在共享文件里（本次不许改），脚本里在运行时打补丁。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = __dirname;
const MODE = process.argv[2] || 'solo';
const CART = MODE === 'multi' ? '05' : '02';
const GAME = MODE === 'multi' ? 'multi' : 'tank';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  const mine = [];        // TankGame.js 自己的错误 —— 必须为空
  const foreign = [];     // 别人的文件 / 调试台的既有问题
  const missing = [];

  function sort(msg) {
    if (/missing asset|Failed to load resource/.test(msg)) return;
    if (/GL Driver Message|GPU stall/.test(msg)) return;
    if (/TankGame\.js/.test(msg)) mine.push(msg); else foreign.push(msg);
  }
  page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') sort('[console] ' + m.text());
  });
  page.on('pageerror', e => sort('[pageerror] ' + e.message + '\n' + (e.stack || '')));

  await page.addInitScript(() => { window.SB = { version: '1.0.0' }; });

  let url = 'http://localhost:8102/test-game.html?game=' + GAME + '&cart=' + CART + '&nomom=1';
  if (MODE === 'twoP') url += '&twoP=1';
  console.log('open', url);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.Input && SB.Input.game, null, { timeout: 25000 });

  /* 补丁 1/2：键盘换成 Scene 的 KeyboardPlugin，并手动把 Play 场景拉起来 */
  console.log('boot:', await page.evaluate((cfg) => {
    var g = SB.Input.game;
    SB.Input.__game = g;
    var s = g.scene.getScene('Play') || g.scene.getScene('Boot');
    if (s && s.input && s.input.keyboard) SB.Input.init({ input: { keyboard: s.input.keyboard, gamepad: null } });
    SB.Save.d.owned.mag = true;      // 买过《电子游戏时代》：验证秘技分支
    /* 卡带擦干净，免得 PlayScene 每 6 秒判定一次「打到一半花屏」把测试打断 */
    var cs = SB.Save.d.carts[cfg.cart]; if (cs) { cs.dirt = 0; cs.wear = 0; }
    SB.Save.d.flags.hot = false;
    if (!g.scene.isActive('Play')) {
      g.scene.start('Play', { cartId: cfg.cart, gameKey: cfg.game, twoP: cfg.twoP, friend: true });
      return 'play-started';
    }
    return 'play-already';
  }, { cart: CART, game: GAME, twoP: MODE === 'twoP' }));

  await sleep(4300);          // 开机 + 卡带标题动画

  /* 补丁 3：把 CRT 黑底放开；同时把报错浮层藏起来，截图才看得见画面 */
  console.log('fix:', await page.evaluate(() => {
    var s = SB.Input.__game.scene.getScene('Play');
    if (s && s.crt) s.crt.setContentVisible(true);
    if (s && s.input && s.input.keyboard) SB.Input.init({ input: { keyboard: s.input.keyboard, gamepad: null } });
    var e = document.getElementById('err'); if (e) e.style.display = 'none';
    return !!(s && s.game_);
  }));

  const canvas = page.locator('canvas');
  const shot = async (name) => {
    const p = path.join(OUT, 'shot_tank_' + MODE + '_' + name + '.png');
    await canvas.screenshot({ path: p });
    console.log('shot ->', p);
  };
  const tap = async (key, ms = 60) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
  const dump = () => page.evaluate(() => {
    var sc = SB.Input.__game.scene.getScene('Play');
    var g = sc && sc.game_;
    if (g && g.inner) g = g.inner;             // MultiGame 外面包了一层
    return g ? {
      phase: g.phase, stage: g.stage, map: g.map && g.map.name, score: g.score,
      enemies: g.enemies ? g.enemies.length : -1, left: g.leftToSpawn,
      bullets: g.bullets ? g.bullets.length : -1, items: g.items ? g.items.length : -1,
      lives: (g.players || []).map(p => p.lives), lvl: (g.players || []).map(p => p.level),
      pos: (g.players || []).map(p => p.x + ',' + p.y), kills: g.kills,
      skin: g.skin && g.skin.key, over: g.over, cleared: g.cleared, baseAlive: g.baseAlive,
      bricks: g.grid ? g.grid.reduce((a, r) => a + r.filter(v => v === 1).length, 0) : -1
    } : 'no-game';
  });

  /* ---------- multi：从目录进坦克 ---------- */
  if (MODE === 'multi') {
    await shot('01_menu');
    await tap('x'); await sleep(1800);
    await shot('02_skin0');
    console.log('state:', JSON.stringify(await dump()));
    console.log('mine:', JSON.stringify(mine, null, 1));
    console.log('foreign:', JSON.stringify(foreign.length));
    await browser.close();
    process.exit(mine.length ? 1 : 0);
  }

  await sleep(1300);          // 开场卡过去
  await shot('01_start');
  console.log('state@start:', JSON.stringify(await dump()));

  /* ---------- 打一段：会朝最近的敌人对线开火（不然随机乱按只会把自家老鹰打爆） ---------- */
  /* 页面里的「小机器人」：算一下有没有干净的射击线，有就对线开火，
   * 没有就朝最近的敌人/道具挪。不然纯随机乱按只会把自家老鹰拆了。 */
  const think = () => page.evaluate(() => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    if (!g || !g.players.length) return null;
    var p = g.players[0];
    if (!p.alive) return { key: null, fire: false };

    /* 从 (x,y) 沿方向走到目标，中间有没有砖/钢挡着 */
    function los(x0, y0, x1, y1, vertical) {
      var a = Math.min(vertical ? y0 : x0, vertical ? y1 : x1);
      var b = Math.max(vertical ? y0 : x0, vertical ? y1 : x1);
      var fix = vertical ? x0 + 8 : y0 + 8;
      for (var q = a + 8; q < b; q += 4) {
        var sx = Math.floor((vertical ? fix : q) / 8);
        var sy = Math.floor((vertical ? q : fix) / 8);
        if (g.blockBullet(sx, sy)) return false;
      }
      return true;
    }

    var i, e, dx, dy, best = null, bd = 1e9;
    for (i = 0; i < g.enemies.length; i++) {
      e = g.enemies[i];
      dx = e.x - p.x; dy = e.y - p.y;
      if (Math.abs(dx) <= 8 && los(p.x, p.y, e.x, e.y, true)) {
        return { key: dy > 0 ? 'ArrowDown' : 'ArrowUp', fire: true, aim: 1 };
      }
      if (Math.abs(dy) <= 8 && los(p.x, p.y, e.x, e.y, false)) {
        return { key: dx > 0 ? 'ArrowRight' : 'ArrowLeft', fire: true, aim: 1 };
      }
      var d = Math.abs(dx) + Math.abs(dy);
      if (d < bd) { bd = d; best = e; }
    }
    /* 顺路捡道具 */
    if (g.items.length) { best = g.items[0]; }
    if (!best) return { key: 'ArrowUp', fire: false };

    dx = best.x - p.x; dy = best.y - p.y;
    var key;
    if (Math.abs(dx) > Math.abs(dy)) key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    else key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
    /* 站在老鹰头上朝下开枪 = 自己拆家，绝对不干 */
    var suicidal = key === 'ArrowDown' && p.x > 64 && p.x < 136 && p.y > 120;
    return { key: key, fire: !suicidal && Math.random() < 0.5, aim: 0 };
  });

  const drive = async (ms, onTick) => {
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < ms) {
      i++;
      const a = await think();
      if (!a) { await sleep(300); continue; }
      if (a.key) await page.keyboard.down(a.key);
      if (a.fire) await tap('x', 40);
      await sleep(a.aim ? 60 : 150);
      if (a.key) await page.keyboard.up(a.key);
      if (a.fire) await tap('x', 40);
      if (MODE === 'twoP') {
        const kk = ['w', 'a', 'd', 's'][i % 4];
        await page.keyboard.down(kk);
        await tap('h', 40);
        await sleep(90);
        await page.keyboard.up(kk);
      }
      if (onTick) await onTick(i);
    }
  };

  await drive(30000, async (i) => {
    if (i === 12) { await shot('02_fight'); console.log('state@12:', JSON.stringify(await dump())); }
    if (i === 28) { await shot('03_walls'); }
    if (i === 46) { await shot('04_late'); console.log('state@60:', JSON.stringify(await dump())); }
  });

  /* 子弹刚出膛 */
  await page.keyboard.down('ArrowUp');
  await tap('x', 40); await sleep(50);
  await shot('05_bullet');
  await page.keyboard.up('ArrowUp');

  /* ---------- 秘技：SELECT(Shift)+A(X) 满级，SELECT+B(Z) 过关 ---------- */
  await page.keyboard.down('Shift');
  await tap('x', 90); await sleep(200);
  await tap('z', 90);
  await page.keyboard.up('Shift');
  await sleep(700);
  await shot('06_summary');
  console.log('state@summary:', JSON.stringify(await dump()));
  await sleep(3200);
  await shot('07_stage2');
  console.log('state@stage2:', JSON.stringify(await dump()));

  /* ---------- 换 skin / 汉化乱码：确认三个「不同的游戏」真的不一样 ---------- */
  for (const sk of [1, 2]) {
    await page.evaluate((skin) => {
      var sc = SB.Input.__game.scene.getScene('Play');
      if (sc.game_) sc.game_.destroy();
      sc.game_ = new SB.Games.tank(sc, {
        cartId: '02', skin: skin, garble: skin === 2,
        title: skin === 1 ? '超级坦克 II' : '超级坦克 III 最终版'
      });
      sc.game_.create();
    }, sk);
    await sleep(2200);
    await page.keyboard.down('ArrowLeft'); await tap('x', 60); await page.keyboard.up('ArrowLeft');
    await sleep(400);
    await shot('08_skin' + sk);
    console.log('state@skin' + sk + ':', JSON.stringify(await dump()));
  }

  const state = await dump();
  const errs = await page.evaluate(() => window.__errors || []);
  console.log('window.__errors(含既有问题):', errs.length);
  console.log('mine:', JSON.stringify(mine, null, 1));
  console.log('foreign:', JSON.stringify(foreign, null, 1));
  console.log('404:', JSON.stringify(missing));

  fs.writeFileSync(path.join(OUT, 'last_' + MODE + '.json'),
    JSON.stringify({ state, mine, foreign, errs, missing }, null, 2));
  await browser.close();
  process.exit(mine.length ? 1 : 0);
})();
