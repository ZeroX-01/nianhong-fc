/* 《超级马里蘑》机制逐项验收脚本（headless chromium）。
 *
 *   node tools/gametest/feature_mario.js
 *
 * 和 play_mario.js 不同：这里不靠 AI 乱跑碰运气，而是把角色摆到指定位置，
 * 一项一项验证「顶砖出蘑菇 → 吃了变大 → 踩龟成壳 → 踢壳连撞 → 钻管进金币房 →
 * 抓旗杆过关 → 第二关 stage=2 → 通关 clearGame」，每项都截图 + 打印断言结果。 */
'use strict';
var path = require('path');
var chromium = require('playwright').chromium;
var OUT = __dirname;
var URL = 'http://localhost:8103/test-game.html?game=mario&cart=03&nomom=1';
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var pass = 0, fail = 0;
function chk(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

(async function () {
  var browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  var page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  var errors = [];
  page.on('console', function (m) { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('[pageerror] ' + (e && e.stack ? e.stack : e)); });

  await page.addInitScript('(' + function () {
    window.SB = window.SB || { version: 'test' };
    try {
      localStorage.setItem('nianhong_save_v1', JSON.stringify({
        v: 1, owned: { mag: true }, settings: { crt: 1, scanline: true, bgm: 0, sfx: 0, shake: true }
      }));
    } catch (e) {}
    var iv = setInterval(function () {
      if (window.SB && window.SB.Games && window.SB.Games.mario && window.SB.GameBase) {
        clearInterval(iv);
        var P = window.SB.Games.mario.prototype;
        var oc = P.create;
        P.create = function () { window.__mario = this; return oc.apply(this, arguments); };
        /* 过关 / 结束这两个回调只计数、不真的走下去，好让一个页面把所有机制验完 */
        window.__cleared = 0;
        window.__over = 0;
        window.SB.GameBase.prototype.clearGame = function () { window.__cleared++; };
        window.SB.GameBase.prototype.gameOver = function () { window.__over++; };
      }
    }, 10);
  }.toString() + ')()');

  await page.goto(URL, { waitUntil: 'load' });
  for (var w = 0; w < 60; w++) {
    if (await page.evaluate('!!(window.__mario && window.__mario.p)')) break;
    await sleep(250);
  }
  await sleep(2000);

  async function unblack() {
    await page.evaluate(function () {
      var g = window.__mario; if (g && g.host && g.host.crt) g.host.crt.setContentVisible(true);
    }).catch(function () {});
  }
  var shots = 0;
  async function shot(name) {
    shots++; await unblack();
    var f = path.join(OUT, 'feat_' + String(shots).padStart(2, '0') + '_' + name + '.png');
    await page.screenshot({ path: f });
    console.log('  📷 ' + path.basename(f));
  }
  function ev(fn, arg) { return page.evaluate(fn, arg); }

  /* 把角色挪到某个格子上（脚踩在 r 行的地面上） */
  async function place(col, row) {
    await ev(function (a) {
      var g = window.__mario, p = g.p;
      p.x = a[0] * 16 + 8; p.y = a[1] * 16; p.vx = 0; p.vy = 0; p.onGround = true;
      g.camX = Math.max(0, Math.min(p.x - 120, g.scn.lv.w - g.W));
      g.scrollWorld();
    }, [col, row]);
  }
  function state() {
    return ev(function () {
      var g = window.__mario; if (!g || !g.p) return null;
      var p = g.p;
      return {
        x: Math.round(p.x), y: Math.round(p.y), big: p.big, fire: p.fire, star: p.star > 0,
        dead: p.dead, phase: g.phase, stage: g.stage, score: g.score, coins: g.st().coins,
        lives: g.st().lives, bonus: !!g.scn.bonus, lvName: g.scn.lv.def.name,
        enemies: g.scn.enemies.length, alive: g.scn.enemies.filter(function (e) { return !e.dead; }).length,
        shells: g.scn.enemies.filter(function (e) { return e.shell; }).length,
        sliding: g.scn.enemies.filter(function (e) { return e.sliding; }).length,
        items: g.scn.items.length, fx: g.scn.fx.length,
        cleared: window.__cleared || 0, over: window.__over || 0
      };
    });
  }

  /* 验证机制时不想被路过的杂兵打断：先把当前场景里的怪清掉、并且不再刷新 */
  async function calm() {
    await ev(function () {
      var g = window.__mario, a = g.scn.enemies, i;
      for (i = a.length - 1; i >= 0; i--) { a[i].spr.destroy(); a.splice(i, 1); }
      var m = g.scn.lv.marks;
      for (i = 0; i < m.length; i++) m[i].done = true;
    });
  }
  /* 等角色活着、能操作（死亡重开要两秒多） */
  async function alive() {
    for (var i = 0; i < 50; i++) {
      var s = await state();
      if (s && !s.dead && s.phase === 'play') return s;
      await sleep(200);
    }
    return await state();
  }

  console.log('\n—— ① 顶砖块：碎片会飞、会自己清掉 ——');
  await calm();
  await alive();
  await place(30, 13);
  var fx0 = await ev(function () {
    var g = window.__mario;
    g.breakBrick(28, 9);
    var d = g.scn.fx.filter(function (o) { return o.kind === 'debris'; });
    return { n: d.length, y: d.map(function (o) { return Math.round(o.y); }) };
  });
  await shot('debris_spawn');
  await sleep(260);
  var fx1 = await ev(function () {
    var d = window.__mario.scn.fx.filter(function (o) { return o.kind === 'debris'; });
    return { n: d.length, y: d.map(function (o) { return Math.round(o.y); }) };
  });
  await shot('debris_fly');
  await sleep(900);
  var fx2 = await ev(function () {
    return window.__mario.scn.fx.filter(function (o) { return o.kind === 'debris'; }).length;
  });
  chk('碎片生成 4 块', fx0.n === 4, JSON.stringify(fx0.y));
  chk('碎片在动', JSON.stringify(fx0.y) !== JSON.stringify(fx1.y), JSON.stringify(fx1.y));
  chk('碎片会回收', fx2 === 0, '剩 ' + fx2);

  console.log('\n—— ② 问号砖出蘑菇 → 吃了变大 ——');
  await alive();
  await calm();
  await place(25, 13);
  await ev(function () { window.__mario.bumpTile(25, 9); });
  await sleep(160);
  var s = await state();
  chk('蘑菇冒出来了', s.items >= 1, 'items=' + s.items);
  await shot('mushroom_out');
  /* 蘑菇顶出来会顺着地面走、撞墙折返；朝它走过去接住（怪已清空，来回走是安全的） */
  var held = null;
  for (var i = 0; i < 70; i++) {
    s = await state();
    if (s.big) break;
    var ip = await ev(function () {
      var g = window.__mario, o = g.scn.items[0], p = g.p;
      return o ? { dx: Math.round(o.x - p.x), x: Math.round(o.x), y: Math.round(o.y), rise: Math.round(o.rise) } : null;
    });
    if (ip) {
      var want = ip.rise > 0 ? null : (ip.dx > 20 ? 'ArrowRight' : (ip.dx < -20 ? 'ArrowLeft' : null));
      if (want !== held) {
        if (held) await page.keyboard.up(held);
        if (want) await page.keyboard.down(want);
        held = want;
      }
      if (i % 6 === 0) console.log('     蘑菇 ' + JSON.stringify(ip) + ' 追=' + held);
    }
    await sleep(100);
  }
  if (held) await page.keyboard.up(held);
  s = await state();
  chk('吃到蘑菇变大', s.big === true, 'big=' + s.big + ' 分=' + s.score);
  await shot('mario_big');

  console.log('\n—— ③ 踩乌龟成壳 + 踢壳连撞 ——');
  var koopa = await ev(function () {
    var g = window.__mario, p = g.p;
    /* 就地造 1 只龟 + 2 只蘑菇怪，摆成一排等着被壳撞 */
    var base = Math.round(p.x), gy = 13 * 16;
    p.y = gy; p.vy = 0; p.onGround = true;
    var k = g.spawnEnemy('k', base + 46, gy);
    g.spawnEnemy('m', base + 120, gy);
    g.spawnEnemy('m', base + 160, gy);
    return { kx: Math.round(k.x), px: base };
  });
  /* 从上方落到龟头上 */
  await ev(function (kx) {
    var g = window.__mario, p = g.p;
    p.x = kx; p.y = 13 * 16 - 34; p.vy = 0.05; p.onGround = false;
  }, koopa.kx);
  for (var i2 = 0; i2 < 12; i2++) {
    s = await state();
    if (s.shells >= 1) break;
    await sleep(100);
  }
  s = await state();
  chk('踩一脚变成龟壳', s.shells >= 1, 'shells=' + s.shells + ' 分=' + s.score + ' 死=' + s.dead);
  await shot('koopa_shell');
  /* 再踢一下（走过去撞） */
  await page.keyboard.down('ArrowRight');
  for (var i3 = 0; i3 < 14; i3++) {
    s = await state();
    if (s.sliding >= 1) break;
    await sleep(100);
  }
  s = await state();
  chk('壳被踢出去滑行', s.sliding >= 1, 'sliding=' + s.sliding + ' 活着=' + s.alive + ' 分=' + s.score);
  await shot('shell_slide');
  await sleep(1500);
  var s2 = await state();
  await page.keyboard.up('ArrowRight');
  chk('滑行的壳撞死了别的怪', s2.score > s.score, '分 ' + s.score + '→' + s2.score + ' 活着 ' + s.alive + '→' + s2.alive);
  await shot('shell_chain');

  console.log('\n—— ④ 杂志秘技：↓↓↑↑BA 无限跳 ——');
  await alive();
  await calm();
  var seq = ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'KeyZ', 'KeyX'];
  for (var q = 0; q < seq.length; q++) {
    await page.keyboard.down(seq[q]); await sleep(70); await page.keyboard.up(seq[q]); await sleep(70);
  }
  await sleep(200);
  var cheat = await ev(function () {
    var g = window.__mario;
    return { inf: !!g.infJump, tip: g.hud && g.hud.tip ? g.hud.tip.text : '' };
  });
  chk('秘技口令生效（无限跳 ON）', cheat.inf === true, JSON.stringify(cheat));
  /* 真的在空中连跳两次看看 */
  await page.keyboard.down('KeyX'); await sleep(120); await page.keyboard.up('KeyX');
  await sleep(120);
  var y1 = (await state()).y;
  await page.keyboard.down('KeyX'); await sleep(120); await page.keyboard.up('KeyX');
  await sleep(120);
  var y2 = (await state()).y;
  chk('空中还能再跳（二段跳）', y2 <= y1, 'y ' + y1 + ' → ' + y2);
  await shot('cheat_infjump');
  /* 关掉，免得影响后面的验证 */
  for (var q2 = 0; q2 < seq.length; q2++) {
    await page.keyboard.down(seq[q2]); await sleep(70); await page.keyboard.up(seq[q2]); await sleep(70);
  }
  var off = await ev(function () { return !!window.__mario.infJump; });
  chk('再输一遍口令能关掉', off === false, 'infJump=' + off);

  console.log('\n—— ⑤ 钻水管去地下金币房 ——');
  var pipe = await ev(function () {
    var g = window.__mario, lv = g.scn.lv, c, r;
    for (r = 0; r < 17; r++) for (c = 0; c < lv.cols; c++) if (g.chAt(c, r) === 'L') return { c: c, r: r };
    return null;
  });
  chk('地图里有可钻的管口', !!pipe, JSON.stringify(pipe));
  if (pipe) {
    await place(pipe.c, pipe.r);
    await sleep(400);
    var pre = await ev(function () {
      var g = window.__mario, p = g.p;
      return {
        x: Math.round(p.x), y: Math.round(p.y), onGround: p.onGround, ctrl: p.ctrl, phase: g.phase,
        ch: g.chAt(Math.floor(p.x / 16), Math.floor(p.y / 16))
      };
    });
    console.log('     （按↓之前：' + JSON.stringify(pre) + '）');
    await page.keyboard.down('ArrowDown'); await sleep(220); await page.keyboard.up('ArrowDown');
    await sleep(1200);
    s = await state();
    chk('进了金币房', s.bonus === true, '场景=' + s.lvName);
    await shot('bonus_room');
    /* 房里吃两排金币再从右边管子出来 */
    await page.keyboard.down('ArrowRight');
    for (var j = 0; j < 26; j++) {
      s = await state();
      if (!s.bonus) break;
      await page.keyboard.down('KeyX'); await sleep(220); await page.keyboard.up('KeyX');
      await sleep(120);
    }
    await shot('bonus_coins');
    /* 站到出口管上按下 */
    var out = await ev(function () {
      var g = window.__mario, lv = g.scn.lv, c, r;
      if (!g.scn.bonus) return null;
      for (r = 0; r < 17; r++) for (c = 0; c < lv.cols; c++) if (g.chAt(c, r) === 'L') return { c: c, r: r };
      return null;
    });
    if (out) {
      await page.keyboard.up('ArrowRight');
      await place(out.c, out.r);
      await sleep(120);
      await page.keyboard.down('ArrowDown'); await sleep(200); await page.keyboard.up('ArrowDown');
      await sleep(1400);
    }
    await page.keyboard.up('ArrowRight');
    s = await state();
    chk('从金币房回到地面', s.bonus === false, '场景=' + s.lvName + ' 币=' + s.coins + ' 分=' + s.score);
    await shot('back_from_pipe');
  }

  console.log('\n—— ⑥ 旗杆过关 → 第二关 stage=2 ——');
  var fpos = await ev(function () {
    var g = window.__mario;
    return g.scn.flag ? Math.round(g.scn.flag.x) : null;
  });
  chk('关卡末尾有旗杆', fpos !== null, 'x=' + fpos);
  await ev(function () {
    var g = window.__mario, p = g.p;
    p.x = g.scn.flag.x - 40; p.y = 13 * 16; p.vy = 0; p.onGround = true;
    g.camX = Math.max(0, Math.min(p.x - 120, g.scn.lv.w - g.W));
    g.scrollWorld();
  });
  await page.keyboard.down('ArrowRight');
  for (var k2 = 0; k2 < 40; k2++) {
    s = await state();
    if (s.phase === 'flag' || s.phase === 'clear') break;
    await sleep(120);
  }
  await page.keyboard.up('ArrowRight');
  s = await state();
  chk('抓到旗杆进入过关流程', s.phase === 'flag' || s.phase === 'clear', '相位=' + s.phase);
  await shot('flagpole');
  for (var k3 = 0; k3 < 90; k3++) {
    s = await state();
    if (s.stage === 2) break;
    await sleep(200);
  }
  chk('进入第二关且 stage=2（死机彩蛋要用）', s.stage === 2, 'stage=' + s.stage + ' 关名=' + s.lvName);
  await shot('level2');

  console.log('\n—— ⑦ 最后一关通关 → clearGame ——');
  await ev(function () {
    var g = window.__mario, p = g.p;
    p.x = g.scn.flag.x - 24; p.y = 13 * 16; p.vy = 0; p.onGround = true;
    g.camX = Math.max(0, Math.min(p.x - 120, g.scn.lv.w - g.W));
    g.scrollWorld();
  });
  await page.keyboard.down('ArrowRight');
  for (var k4 = 0; k4 < 120; k4++) {
    s = await state();
    if (s.cleared > 0) break;
    await sleep(200);
  }
  await page.keyboard.up('ArrowRight');
  s = await state();
  chk('通关回调 clearGame 触发', s.cleared > 0, 'cleared=' + s.cleared + ' 相位=' + s.phase + ' 分=' + s.score);
  await shot('game_clear');

  console.log('\n—— ⑧ 命数用完 → gameOver ——');
  await ev(function () {
    var g = window.__mario;
    g.phase = 'play';
    g.st().lives = 0;
    g.p.dead = false; g.p.big = false;
    g.die();
  });
  for (var k5 = 0; k5 < 40; k5++) {
    s = await state();
    if (s && s.over > 0) break;
    await sleep(200);
  }
  chk('掉坑掉光命之后 gameOver 触发', s && s.over > 0, 'over=' + (s ? s.over : '?'));
  await shot('game_over');

  console.log('\n—— 结果 ——');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  var pe = await page.evaluate('window.__errors || []');
  console.log('console error：' + errors.length + '，window.__errors：' + pe.length);
  errors.forEach(function (e) { console.log('  ' + e); });
  pe.forEach(function (e) { console.log('  ' + e); });
  console.log('截图 ' + shots + ' 张 → ' + OUT);
  await browser.close();
  process.exit(fail || errors.length || pe.length ? 1 : 0);
})();
