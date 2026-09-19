/* 《超级马里蘑》自动试玩脚本（headless chromium）。
 *
 * 用法：
 *   node tools/gametest/play_mario.js                 # 正常试玩 1-1（约 40 秒）
 *   node tools/gametest/play_mario.js --mag           # 带杂志（秘技提示 + 无限跳）
 *   node tools/gametest/play_mario.js --game=crash --cart=12 --sec=45
 *   node tools/gametest/play_mario.js --warp          # 专门去钻管道 / 到旗杆
 *
 * 脚本会：右走 + 按住 Z 加速跑，前方有坑/墙/敌人时自动按 X 起跳（真的在玩，不是乱按），
 * 收集 console error / pageerror / window.__errors，并在关键时刻截图。 */
'use strict';
var path = require('path');
var fs = require('fs');
var chromium = require('playwright').chromium;

var argv = process.argv.slice(2);
function opt(name, def) {
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + name) return true;
    if (argv[i].indexOf('--' + name + '=') === 0) return argv[i].split('=')[1];
  }
  return def;
}
var GAME = opt('game', 'mario');
var CART = opt('cart', '03');
var SEC = parseInt(opt('sec', 40), 10);
var MAG = !!opt('mag', false) || opt('game', 'mario') !== 'mario';   // 盗版卡带那局要用秘技跳关
var WARP = !!opt('warp', false);
var TAG = opt('tag', GAME);
var OUT = __dirname;
var URL = 'http://localhost:8103/test-game.html?game=' + GAME + '&cart=' + CART + '&nomom=1';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  var page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  var errors = [], warns = [];
  page.on('console', function (m) {
    var t = m.text();
    if (m.type() === 'error') errors.push('[console] ' + t);
    else if (/missing asset/.test(t)) warns.push(t);
  });
  page.on('pageerror', function (e) { errors.push('[pageerror] ' + (e && e.stack ? e.stack : e)); });

  /* 存档种子：带上杂志才能看到秘技提示 */
  await page.addInitScript('(' + function (mag) {
    /* test-game.html 里没有 index.html 那句 window.SB = {}（调试台自己的疏漏，
     * 而它不允许我改），所以在页面脚本执行前先把命名空间铺好。 */
    window.SB = window.SB || { version: 'test' };
    try {
      localStorage.setItem('nianhong_save_v1', JSON.stringify({
        v: 1, owned: mag ? { mag: true } : {}, settings: { crt: 1, scanline: true, bgm: 0, sfx: 0, shake: true }
      }));
    } catch (e) {}
    /* 钩住游戏实例，方便脚本读状态 */
    var iv = setInterval(function () {
      if (window.SB && window.SB.Games && window.SB.Games.mario) {
        clearInterval(iv);
        var P = window.SB.Games.mario.prototype;
        var oc = P.create;
        P.create = function () { window.__mario = this; return oc.apply(this, arguments); };
        /* 盗版卡带那层壳也钩一下，好准确判断「死机」而不是把重开误判成死机 */
        if (window.SB.Games.crash) {
          var C = window.SB.Games.crash.prototype, occ = C.create;
          C.create = function () { window.__crash = this; return occ.apply(this, arguments); };
        }
      }
    }, 10);
  }.toString() + ')(' + JSON.stringify(MAG) + ')');

  await page.goto(URL, { waitUntil: 'load' });
  await sleep(4200);            // 开机 + 卡带标题动画 ≈ 2.5s，再留一点余量

  /* ⚠ 调试台的画面本来是全黑的：src/core/crt.js 的 powerOn() 在
   * PlayScene 调过 setContentVisible(true) 之后又把黑底 dark 的 alpha 拉回 1，
   * 于是屏幕永远盖着一块不透明黑板（stub / tank / mario 全一样黑）。
   * 那两个文件不属于我这次能改的范围，所以只在测试脚本里把它按回去，好截到真实画面。 */
  async function unblack() {
    await page.evaluate(function () {
      var g = window.__mario;
      var sc = g && g.host;
      if (sc && sc.crt) sc.crt.setContentVisible(true);
    }).catch(function () {});
  }
  /* 等到游戏实例真的起来（关卡卡片阶段也算） */
  for (var w = 0; w < 40; w++) {
    var ok = await page.evaluate('!!(window.__mario && window.__mario.p)');
    if (ok) break;
    await sleep(250);
  }
  await unblack();
  await sleep(1800);            // 让关卡卡片播完
  await unblack();

  var shots = 0;
  async function shot(name) {
    shots++;
    await unblack();
    var f = path.join(OUT, 'shot_' + TAG + '_' + String(shots).padStart(2, '0') + '_' + name + '.png');
    await page.screenshot({ path: f });
    console.log('  📷 ' + path.basename(f));
    return f;
  }

  /* ---- 读一帧游戏状态 + 判断前方地形，脚本据此决定要不要跳 ---- */
  async function probe() {
    return await page.evaluate(function () {
      var g = window.__mario;
      if (!g || !g.p || !g.scn) return null;
      var p = g.p, TS = 16;
      var c = Math.floor(p.x / TS), r = Math.floor(p.y / TS);
      var gap = 0, wall = 0, i;
      for (i = 1; i <= 4; i++) if (!g.solidAt(c + i, r) && gap === 0) gap = i;      // 前方第几格没地
      /* 坑沿距离（像素）与坑宽（格） */
      var pitDist = 999, pitW = 0, gc = 0;
      for (i = 1; i <= 8; i++) {
        if (!g.solidAt(c + i, r)) { gc = c + i; break; }
      }
      if (gc) {
        pitDist = gc * TS - p.x;
        for (i = 0; i < 10; i++) { if (g.solidAt(gc + i, r)) break; pitW++; }
      }
      for (i = 1; i <= 2; i++) if (g.solidAt(c + i, r - 1)) { wall = i; break; }    // 前方有墙/砖
      var head = g.solidAt(c, r - 2) || g.solidAt(c, r - 3);
      var enemy = 999, en = g.scn.enemies, e;
      for (i = 0; i < en.length; i++) {
        e = en[i];
        if (e.dead) continue;
        if (e.x > p.x - 6 && e.x - p.x < enemy) enemy = e.x - p.x;
      }
      var item = 999, it = g.scn.items;
      for (i = 0; i < it.length; i++) if (Math.abs(it[i].x - p.x) < item) item = Math.abs(it[i].x - p.x);
      /* 前方 3 格、头顶 2~4 格里有没有砖 / 问号砖（值得顶一下） */
      var blockAhead = false, cc, rr;
      for (cc = c; cc <= c + 2; cc++) {
        for (rr = r - 4; rr <= r - 2; rr++) {
          var ch2 = g.chAt(cc, rr);
          if ('B b ? M S F'.indexOf(ch2) >= 0 && ch2 !== ' ') blockAhead = true;
        }
      }
      /* 前方有没有该跳起来吃的金币 */
      var coinAhead = false, cn = g.scn.coins;
      for (i = 0; i < cn.length; i++) {
        if (cn[i].x - p.x > -8 && cn[i].x - p.x < 70 && cn[i].y < p.y - 20) coinAhead = true;
      }
      return {
        x: Math.round(p.x), y: Math.round(p.y), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3),
        onGround: p.onGround, big: p.big, fire: p.fire, star: p.star > 0, dead: p.dead,
        phase: g.phase, stage: g.stage, score: g.score, coins: g.st().coins, lives: g.st().lives,
        time: g.timeLeft, camX: Math.round(g.camX), levelW: g.scn.lv.w, bonus: !!g.scn.bonus,
        enemies: en.length, gap: gap, wall: wall, head: head, enemyAhead: Math.round(enemy),
        pitDist: Math.round(pitDist), pitW: pitW,
        itemNear: Math.round(item), blockAhead: blockAhead, coinAhead: coinAhead,
        tiles: g.scn.tiles.filter(function (t) { return !!t; }).length,
        onPipe: (function () { var ch = g.chAt(c, r); return ch === 'L' || ch === 'R'; })()
      };
    });
  }

  var s0 = await probe();
  console.log('开局状态：', JSON.stringify(s0));
  await shot('open');

  var CRASH = (GAME !== 'mario');

  /* ================= 自动试玩：真的在玩 ================= */
  await page.keyboard.down('ArrowRight');
  var runHeld = false;
  var jumpUntil = 0, jumping = false;
  var flags = { air: false, big: false, coin3: false, stomp: false, warp: false, mid: false, flag: false, died: false };
  var prevEnemies = s0 ? s0.enemies : 0;
  var trace = [];
  var t0 = Date.now();
  var lastX = s0 ? s0.x : 0, stuck = 0;
  var ring = [], deaths = 0, wasDead = false, crashed = false;

  while ((Date.now() - t0) / 1000 < SEC) {
    var s = await probe();
    if (!s) {
      if (CRASH) {
        var cs = await page.evaluate(function () {
          var c = window.__crash;
          return c ? { crashed: !!c.crashed, alive: Math.round(c.alive), inner: !!c.inner } : null;
        });
        if (cs && cs.crashed) {
          crashed = true;
          console.log('  💥 撑到 ' + (cs.alive / 1000).toFixed(1) + 's，盗版卡带死机彩蛋触发（内层实例已销毁）');
          break;
        }
      }
      await sleep(120); continue;    // 只是关卡在重开的空档，等一下再读
    }
    var now = Date.now();
    trace.push(s.x);
    ring.push(((now - t0) / 1000).toFixed(1) + 's x=' + s.x + ' y=' + s.y + ' vy=' + s.vy +
      ' 地=' + s.onGround + ' 坑=' + s.gap + ' 墙=' + s.wall + ' 敌前=' + s.enemyAhead + ' 分=' + s.score);
    if (ring.length > 8) ring.shift();
    if (s.dead && !wasDead) {
      deaths++; wasDead = true;
      console.log('  ☠ 第 ' + deaths + ' 次死亡 @x=' + s.x + '，死前轨迹：');
      ring.forEach(function (l) { console.log('     ' + l); });
    }
    if (!s.dead) wasDead = false;

    /* 跑：默认走（更稳），偶尔按住 Z 冲一段体验跑步惯性 */
    var wantRun = ((now - t0) % 9000) < 2000;
    if (wantRun && !runHeld) { await page.keyboard.down('KeyZ'); runHeld = true; }
    if (!wantRun && runHeld) { await page.keyboard.up('KeyZ'); runHeld = false; }

    /* 跳的判断：前方是坑 / 有墙 / 有敌人 / 卡住了 / 顶上有砖可以顶 / 上方有金币 */
    var needJump = false, hold = 220;
    if (s.onGround && s.pitDist < 26 && s.pitW <= 6) { needJump = true; hold = 520; }
    if (s.wall) { needJump = true; hold = 400; }
    if (s.enemyAhead < 38) { needJump = true; hold = 260; }   // 提前一点起跳，落下来正好踩头
    if (s.blockAhead && s.onGround) { needJump = true; hold = 500; }   // 顶砖块 / 问号砖
    if (s.coinAhead && s.onGround) { needJump = true; hold = 500; }
    if (Math.abs(s.x - lastX) < 2 && s.onGround) { stuck++; if (stuck > 4) { needJump = true; hold = 480; stuck = 0; } }
    else stuck = 0;
    lastX = s.x;
    if (s.itemNear < 60 && s.itemNear > 4) needJump = false;   // 让蘑菇撞上来

    if (needJump && s.onGround && !jumping) {
      await page.keyboard.down('KeyX');
      jumping = true; jumpUntil = now + hold;
    }
    if (jumping && now > jumpUntil) { await page.keyboard.up('KeyX'); jumping = false; }

    /* 盗版卡带这一局：玩个十几秒之后用杂志秘技 SELECT×3 跳到第二关，
     * 好让 CrashGame 的 inner.stage > 1 条件生效（不然全靠等 40 秒，
     * 中间被 GAME OVER 一次，宿主重开卡带，计时就白攒了）。 */
    if (CRASH && !flags.selWarp && (now - t0) > 12000 && s.phase === 'play') {
      flags.selWarp = true;
      for (var z = 0; z < 3; z++) {
        await page.keyboard.down('ShiftLeft'); await sleep(70); await page.keyboard.up('ShiftLeft'); await sleep(120);
      }
      console.log('  ⏭ 按了 SELECT×3（秘技跳关），等着它进第二关');
    }

    /* 站在可钻的管口上：--warp 模式主动钻下去 */
    if (WARP && s.onPipe && s.onGround && !flags.warp) {
      if (jumping) { await page.keyboard.up('KeyX'); jumping = false; }
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowDown'); await sleep(160); await page.keyboard.up('ArrowDown');
      await sleep(500);
      flags.warp = true;
      await shot('pipe_bonus');
      await page.keyboard.down('ArrowRight');
    }

    /* ---- 关键时刻截图 ---- */
    if (!flags.air && !s.onGround && s.vy < 0) { flags.air = true; await shot('jump'); }
    if (!flags.bump && s.score >= 200) { flags.bump = true; await shot('bump_block'); }
    if (!flags.big && s.big) { flags.big = true; await shot('mushroom_big'); }
    if (!flags.coin3 && s.coins >= 3) { flags.coin3 = true; await shot('coins'); }
    if (!flags.stomp && s.enemies < prevEnemies) { flags.stomp = true; await shot('stomp'); }
    prevEnemies = Math.max(prevEnemies, s.enemies);
    if (!flags.mid && s.x > 1500) { flags.mid = true; await shot('midlevel'); }
    if (!flags.died && s.dead) { flags.died = true; await shot('death'); }
    if (!flags.flag && s.phase === 'flag') { flags.flag = true; await shot('flagpole'); }
    if (s.bonus && !flags.bonusShot) { flags.bonusShot = true; await shot('bonus_room'); }

    if (trace.length % 40 === 0) {
      console.log('  t=' + ((now - t0) / 1000).toFixed(1) + 's x=' + s.x + '/' + s.levelW +
        ' cam=' + s.camX + ' vx=' + s.vx + ' 地面=' + s.onGround + ' 大=' + s.big +
        ' 分=' + s.score + ' 币=' + s.coins + ' 命=' + s.lives + ' 关=' + s.stage +
        ' 敌=' + s.enemies + ' tile=' + s.tiles + ' 相位=' + s.phase);
    }
    await sleep(50);
  }

  if (jumping) await page.keyboard.up('KeyX');
  await page.keyboard.up('ArrowRight');
  if (runHeld) await page.keyboard.up('KeyZ');
  if (CRASH) {
    await sleep(1200);            // 让死机画面（雪花 / 花屏）演完
    await shot(crashed ? 'crashed' : 'still_alive');
    console.log(crashed ? '\n死机彩蛋：已触发 ✅' : '\n死机彩蛋：这一局没等到（内层还活着）');
  } else {
    await shot('final');
  }

  var last = await probe();
  console.log('\n结束状态：', JSON.stringify(last));
  console.log('横向推进：' + Math.min.apply(null, trace) + ' → ' + Math.max.apply(null, trace));

  var pageErrs = await page.evaluate('window.__errors || []');
  console.log('\nconsole error 数：' + errors.length + '，window.__errors 数：' + pageErrs.length);
  errors.forEach(function (e) { console.log('  ' + e); });
  pageErrs.forEach(function (e) { console.log('  ' + e); });
  console.log('missing asset warning：' + warns.length + ' 条（可忽略）');
  console.log('截图 ' + shots + ' 张，截图目录 ' + OUT);

  await browser.close();
  process.exit(errors.length || pageErrs.length ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
