/* 机制单测：直接操纵游戏对象验证碰撞/规则是否真的成立（不靠人手打）。
 * node tools/gametest/tank_unit.js
 */
const { chromium } = require('playwright');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => { if (/TankGame/.test(e.stack || '')) errs.push(e.message + '\n' + e.stack); });

  await page.addInitScript(() => { window.SB = { version: '1.0.0' }; });
  await page.goto('http://localhost:8102/test-game.html?game=tank&cart=02&nomom=1');
  await page.waitForFunction(() => window.SB && SB.Input && SB.Input.game, null, { timeout: 25000 });
  await page.evaluate(() => {
    var g = SB.Input.game; SB.Input.__game = g;
    var s = g.scene.getScene('Boot');
    SB.Input.init({ input: { keyboard: s.input.keyboard, gamepad: null } });
    var cs = SB.Save.d.carts['02']; if (cs) { cs.dirt = 0; cs.wear = 0; }
    g.scene.start('Play', { cartId: '02', gameKey: 'tank', twoP: false, friend: true });
  });
  await sleep(5000);
  await page.evaluate(() => {
    var s = SB.Input.__game.scene.getScene('Play');
    s.crt.setContentVisible(true);
    var g = s.game_; g.phase = 'play'; g.hideMsg();
  });

  const T = (name, fn) => page.evaluate(fn).then(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(r)));

  /* 每个用例前清场：干掉敌人/子弹/道具，停掉刷怪，并把敌人冻住（AI 不动不开枪，判定才确定） */
  const reset = () => page.evaluate(() => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.enemies.slice().forEach(e => { e.hp = 1; g.killEnemy(e, null); });
    g.bullets.slice().forEach(b => { b.dead = true; if (b.node) b.node.destroy(); });
    g.bullets = [];
    g.items.slice().forEach(i => i.node.destroy()); g.items = [];
    g.booms.slice().forEach(b => b.node.destroy()); g.booms = [];
    g.spawnFx.slice().forEach(f => f.node.destroy()); g.spawnFx = [];
    /* leftToSpawn 留着不为 0，否则会被判定为过关；spawnT 拉长，不再刷新怪 */
    g.leftToSpawn = 99; g.pendingSpawn = 0; g.spawnT = 1e9; g.itemT = 1e9; g.freezeT = 1e9;
    g.score = 0; g.phase = 'play'; g.hideMsg();
    var p = g.players[0]; p.alive = true; p.shield = 0; p.stun = 0; p.level = 0; p.fireCd = 0;
    if (p.node) p.node.setVisible(true);
  });

  /* 1. 玩家子弹能打爆敌人（加分 100） */
  await reset();
  await page.evaluate(() => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    var p = g.players[0]; p.x = 64; p.y = 120; p.dir = 0; p.level = 0; p.fireCd = 0; g.syncTank(p);
    /* 把 64~144 这一竖条彻底清空，否则子弹会先撞上地图自带的砖墙 */
    g.clearRegion(6, 6, 6, 12);
    for (var sy = 6; sy < 18; sy++) for (var sx = 6; sx < 12; sx++) g.drawCell(sx, sy);
    var e = g.makeTank('e', 'a', 0, 64, 64, 2); g.enemies.push(e);
    g.fire(p);
  });
  await sleep(700);
  await T('玩家弹打爆普通敌人 +100', () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    return { ok: g.score === 100 && g.enemies.length === 0, score: g.score, enemies: g.enemies.length };
  });

  /* 2. 装甲坦克要三枪 */
  await reset();
  await page.evaluate(() => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.score = 0;
    g.clearRegion(6, 6, 6, 12);
    var p = g.players[0]; p.x = 64; p.y = 120; p.dir = 0; p.fireCd = 0; g.syncTank(p);
    var e = g.makeTank('e', 'c', 0, 64, 64, 2); g.enemies.push(e);
    window.__e = e;
  });
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { var g = SB.Input.__game.scene.getScene('Play').game_; g.players[0].fireCd = 0; g.fire(g.players[0]); });
    await sleep(500);
  }
  await T('装甲坦克两枪不死', () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    return { ok: g.enemies.length === 1 && window.__e.hp === 1, hp: window.__e.hp, n: g.enemies.length };
  });
  await page.evaluate(() => { var g = SB.Input.__game.scene.getScene('Play').game_; g.players[0].fireCd = 0; g.fire(g.players[0]); });
  await sleep(500);
  await T('第三枪打爆装甲坦克 +300', () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    return { ok: g.score === 300 && g.enemies.length === 0, score: g.score };
  });

  /* 3. 砖墙半格崩塌 / 钢墙需要 3 级弹 */
  await reset();
  await T('砖墙被打掉（子格数减少）', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    var count = () => g.grid.reduce((a, r) => a + r.filter(v => v === 1).length, 0);
    g.clearRegion(6, 8, 8, 10);
    var sx, sy;
    for (sy = 14; sy < 16; sy++) for (sx = 8; sx < 10; sx++) { g.grid[sy][sx] = 1; g.drawCell(sx, sy); }
    var before = count();
    var p = g.players[0]; p.x = 64; p.y = 136; p.dir = 0; p.fireCd = 0; p.level = 0; g.syncTank(p);
    g.fire(p);
    await new Promise(r => setTimeout(r, 400));
    var after = count();
    return { ok: before - after === 2, before: before, after: after };   // 一发只崩半块
  });

  await reset();
  await T('钢墙：1 级弹打不掉，3 级弹能打掉', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    var sx, sy;
    g.clearRegion(6, 8, 8, 10);
    for (sy = 14; sy < 16; sy++) for (sx = 8; sx < 10; sx++) { g.grid[sy][sx] = 2; g.drawCell(sx, sy); }
    var p = g.players[0]; p.x = 64; p.y = 136; p.dir = 0; p.level = 0; p.fireCd = 0; g.syncTank(p);
    g.fire(p);
    await new Promise(r => setTimeout(r, 400));
    var mid = g.grid[15][8] === 2 && g.grid[15][9] === 2;
    p.level = 3; p.fireCd = 0; g.fire(p);
    await new Promise(r => setTimeout(r, 400));
    var gone = g.grid[15][8] === 0 || g.grid[15][9] === 0;
    return { ok: mid && gone, steelKept: mid, steelBroken: gone };
  });

  /* 4. 水面：坦克过不去，子弹能过 */
  await reset();
  await T('水面挡坦克但不挡子弹', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.clearRegion(6, 8, 8, 10);
    var sx, sy;
    for (sy = 14; sy < 16; sy++) for (sx = 8; sx < 10; sx++) { g.grid[sy][sx] = 4; g.drawCell(sx, sy); }
    var p = g.players[0]; p.x = 64; p.y = 136; p.dir = 0; p.level = 0; p.fireCd = 0; g.syncTank(p);
    var blocked = !g.canStand(p, 64, 120);      // 目标矩形压到 y120~128 那排水
    var e = g.makeTank('e', 'a', 0, 64, 96, 2); g.enemies.push(e);
    g.score = 0; g.fire(p);
    await new Promise(r => setTimeout(r, 600));
    return { ok: blocked && g.score === 100, blocked: blocked, score: g.score };
  });

  /* 5. 道具：星星升级 / 坦克加命 / 计时器冻结 */
  await reset();
  await T('道具生效（星/命/冻结/铲子）', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    var p = g.players[0]; p.level = 0; var lv0 = p.lives;
    g.takeItem(p, { type: 0 });
    g.takeItem(p, { type: 4 });
    g.takeItem(p, { type: 5 });
    g.takeItem(p, { type: 3 });
    var ringSteel = g.grid[21][11] === 2;
    return {
      ok: p.level === 1 && p.lives === lv0 + 1 && g.freezeT > 0 && ringSteel && g.shovelT > 0,
      lvl: p.level, lives: p.lives, freeze: Math.round(g.freezeT), ring: g.grid[21][11]
    };
  });

  /* 6. 老鹰被打中 → gameOver */
  await reset();
  await T('老鹰被击中立刻结束', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.shovelT = 0; g.setRing(0);
    var p = g.players[0]; p.x = 96; p.y = 144; p.dir = 2; p.fireCd = 0; g.syncTank(p);
    g.clearRegion(10, 18, 6, 4);
    g.fire(p);
    await new Promise(r => setTimeout(r, 700));
    return { ok: g.over === true && g.baseAlive === false, over: g.over, base: g.baseAlive };
  });


  /* 7. 玩家被敌弹打死 → 掉一条命并复活；有护盾时打不死
   *    上一条用例把老鹰打爆了，PlayScene 会在 1.8 秒后销毁重开一局，先等它换完 */
  await sleep(2800);
  await page.evaluate(() => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.baseAlive = true; g.over = false; g.phase = 'play'; g.buildBase();
  });
  await reset();
  await T('护盾挡子弹 / 无护盾掉一条命', async () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.clearRegion(6, 6, 6, 12);
    var p = g.players[0]; p.x = 64; p.y = 120; p.dir = 0; g.syncTank(p);
    var e = g.makeTank('e', 'a', 0, 64, 64, 2); g.enemies.push(e);
    var lv = p.lives;
    g.giveShield(p, 4000);
    e.fireCd = 0; g.fire(e);
    await new Promise(r => setTimeout(r, 700));
    var kept = p.lives === lv && p.alive;
    p.shield = 0;
    e.fireCd = 0; g.fire(e);
    await new Promise(r => setTimeout(r, 700));
    var died = p.lives === lv - 1;
    await new Promise(r => setTimeout(r, 1600));
    return { ok: kept && died && p.alive, shielded: kept, died: died, revived: p.alive, lives: p.lives };
  });

  /* 8. 4 张关卡都能装载，且地形各不相同 */
  await T('4 张关卡布局各不相同', () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    var sig = [], i, n;
    for (n = 1; n <= 4; n++) {
      g.loadStage(n);
      var cnt = [0, 0, 0, 0, 0, 0];
      g.grid.forEach(function (r) { r.forEach(function (v) { cnt[v]++; }); });
      sig.push({ stage: n, map: g.map.name, brick: cnt[1], steel: cnt[2], grass: cnt[3], water: cnt[4], ice: cnt[5] });
    }
    var uniq = {}; sig.forEach(function (x) { uniq[x.brick + '/' + x.steel + '/' + x.water + '/' + x.ice] = 1; });
    var hasAll = sig.some(x => x.water > 0) && sig.some(x => x.ice > 0) && sig.some(x => x.grass > 0);
    return { ok: Object.keys(uniq).length === 4 && hasAll, sig: sig };
  });

  /* 9. 打完最后一关 → clearGame */
  await T('最后一关结束触发 clearGame', () => {
    var g = SB.Input.__game.scene.getScene('Play').game_;
    g.stage = 4; g.phase = 'play'; g.over = false; g.cleared = false;
    g.finishStage(true);
    var sum = g.phase === 'summary';
    g.nextStage();
    return { ok: sum && g.cleared === true, summary: sum, cleared: g.cleared };
  });

  console.log('TankGame 运行时错误:', JSON.stringify(errs, null, 1));
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
