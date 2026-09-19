/* 《魂斗萝》—— 卡带 01 里那个横版跑轰。
 *
 * 设计要点（为什么这么写）：
 *  1. 没有物理引擎。地形是一张 16×16 的 tile 数组，重力/跳跃/落地/撞墙全部手算，
 *     好处是手感完全可控：跳跃有短跳长跳、落地帧不会抖、平台是「单向」的（能从下面穿上去）。
 *  2. 一切数值都用「像素 / 毫秒」，update 收到的 dt 是毫秒，这样掉帧时速度也不会变。
 *  3. 所有取图前都过 has()，缺图就用同尺寸色块顶上，资源到位自动变好看。
 *  4. 屏幕是显像管，四周过扫描会吃掉边缘，所以 HUD 一律离边 8px 以上。 */
(function (SB) {
  'use strict';

  /* ================= 关卡与物理常量 ================= */
  var TS = 16;                    // tile 边长
  var COLS = 138;                 // 关卡 138 列 → 2208px 宽
  var ROWS = 17;                  // 17 行 → 272px，最后一行在画面外，正好当「掉出去」的缓冲
  var LEVEL_W = COLS * TS;        // 2208
  var GROUND_ROW = 13;            // 主地面顶行，y = 208

  /* tile 编码。帧号 = 编码 - 1（严格按 ART_MANIFEST 的 tiles.png 帧序） */
  var T_NONE = 0, T_TOP = 1, T_IN = 2, T_BRIDGE = 3, T_IRON = 4, T_PLAT = 5, T_WATER = 6, T_SPIKE = 7;
  /* 水面有两帧（帧 5 / 帧 6），编码统一用 T_WATER，靠动画切帧 */
  var TILE_FRAME = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 7 };
  var TILE_COLOR = { 1: SB.C.WOOD4, 2: SB.C.WOOD2, 3: SB.C.WOOD5, 4: SB.C.GREY5, 5: SB.C.GREY4, 6: SB.C.BLU3, 7: SB.C.GREY6 };

  /* 手感数值：调了很多轮，跑得利索但不飘 */
  var RUN = 0.108;                // 跑速 px/ms（约 1.8px/帧）
  var GRAV = 0.00115;             // 重力
  var MAXFALL = 0.46;             // 最大下落速度
  var JUMP_V = -0.335;            // 起跳初速 → 约 49px 高、600ms 滞空
  var SHORT_V = -0.115;           // 松开跳键时把上升速度砍到这个值 = 短跳
  var INV_MS = 1500;              // 复活无敌时长
  var DEAD_MS = 780;              // 死亡到复活的黑屏间隔

  /* 武器参数：间隔 90~120ms 是当年连射器的节奏 */
  var WEAPONS = {
    N: { gap: 118, spd: 0.36, dmg: 1, n: 1, letter: 'N' },
    M: { gap: 92, spd: 0.40, dmg: 1, n: 1, letter: 'M' },
    S: { gap: 150, spd: 0.34, dmg: 1, n: 3, spread: 0.30, letter: 'S' },
    F: { gap: 250, spd: 0.25, dmg: 3, n: 1, big: true, letter: 'F' }
  };
  var POWER_ORDER = ['M', 'S', 'F'];
  var POWER_FRAME = { M: 0, S: 1, F: 3 };     // powerup.png：1 M / 2 S / 3 L / 4 R(火)

  /* 秘技码：上上下下左右左右BA */
  var CHEAT = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];

  function ContraGame(host, opts) {
    SB.GameBase.call(this, host, opts);
    this.camX = 0;
    this.players = [];
    this.enemies = [];
    this.pbs = [];              // 玩家子弹
    this.ebs = [];              // 敌方子弹
    this.pods = [];             // 武器胶囊
    this.booms = [];            // 爆炸特效
    this.tileSpr = [];
    this.waterSpr = [];
    this.boss = null;
    this.spawnT = 1200;
    this.waterT = 0;
    this.cheatIdx = 0;
    this.cheatOn = false;
    this.bossDying = 0;
  }
  SB.extendGame(ContraGame);
  var P = ContraGame.prototype;

  /* ================================================================
   * 创建
   * ================================================================ */
  P.create = function () {
    this.buildMap();
    this.buildBackground();
    this.drawTiles();
    this.buildAnims();
    this.buildPlayers();
    this.buildFixedEnemies();
    this.buildPods();
    this.buildBoss();
    this.buildHud();
    this.bgm('bgm_contra');
  };

  /* ---------------- 地形 ----------------
   * 用几个 helper 把关卡「铺」出来，比手写二维数组好读也好改。 */
  P.buildMap = function () {
    var r, c;
    this.map = [];
    for (r = 0; r < ROWS; r++) {
      this.map[r] = [];
      for (c = 0; c < COLS; c++) this.map[r][c] = T_NONE;
    }

    /* 实心地面：顶行铺草皮，下面一直填到底 */
    this.ground(0, 29, GROUND_ROW);
    this.water(30, 33);                        // 水塘（掉进去就死）
    this.plat(31, 32, 11);                     // 水上踏板，给一条稳的路
    this.ground(34, 45, GROUND_ROW);
    this.plat(38, 40, 11);                     // 高处平台，上面放一颗胶囊（差 32px，一跳刚好够）
    this.bridgeRow(46, 58, T_BRIDGE);          // 木桥，桥下是空的
    this.clearCols(52, 53, GROUND_ROW);        // 断桥缺口，得跳
    this.ground(59, 61, GROUND_ROW);
    /* 62~64 什么都不铺 = 深坑，掉下去死 */
    this.ground(65, 74, GROUND_ROW);
    /* 三级台阶爬上高台 */
    this.ground(75, 75, 12);
    this.ground(76, 76, 11);
    this.ground(77, 92, 10);
    this.plat(80, 82, 8);                      // 高台上方的浮空平台（一跳 32px 够得着）
    this.ground(93, 99, GROUND_ROW);
    this.spikes(95, 97, 12);                   // 尖刺，贴着地面
    this.water(100, 103);
    this.plat(100, 101, 11);
    this.plat(102, 103, 10);
    this.ground(104, 117, GROUND_ROW);
    this.bridgeRow(118, 126, T_IRON);          // 铁桥，BOSS 前最后一段
    this.ground(127, COLS - 1, GROUND_ROW);
  };

  P.ground = function (c0, c1, top) {
    for (var c = c0; c <= c1; c++) {
      for (var r = top; r < ROWS; r++) this.map[r][c] = (r === top) ? T_TOP : T_IN;
    }
  };
  P.water = function (c0, c1) {
    for (var c = c0; c <= c1; c++) {
      for (var r = GROUND_ROW; r < ROWS; r++) this.map[r][c] = T_WATER;
    }
  };
  P.plat = function (c0, c1, row) {
    for (var c = c0; c <= c1; c++) this.map[row][c] = T_PLAT;
  };
  P.bridgeRow = function (c0, c1, code) {
    for (var c = c0; c <= c1; c++) this.map[GROUND_ROW][c] = code;
  };
  P.clearCols = function (c0, c1, row) {
    for (var c = c0; c <= c1; c++) this.map[row][c] = T_NONE;
  };
  P.spikes = function (c0, c1, row) {
    for (var c = c0; c <= c1; c++) this.map[row][c] = T_SPIKE;
  };

  /* ---------------- tile 判定 ---------------- */
  P.code = function (c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T_NONE;
    return this.map[r][c];
  };
  /* 实心：地面、桥、铁桥（四面都挡） */
  P.solid = function (c, r) {
    var k = this.code(c, r);
    return k === T_TOP || k === T_IN || k === T_BRIDGE || k === T_IRON;
  };
  /* 单向平台：只有从上面落下来时才踩得住 */
  P.oneWay = function (c, r) { return this.code(c, r) === T_PLAT; };
  P.deadly = function (c, r) {
    var k = this.code(c, r);
    return k === T_WATER || k === T_SPIKE;
  };

  /* 某个横坐标下最近的落脚面（返回 y，找不到返回 null）。复活选点、放敌人都用它 */
  P.surfaceY = function (x, fromRow) {
    var c = Math.floor(x / TS);
    for (var r = (fromRow === undefined ? 0 : fromRow); r < ROWS; r++) {
      if (this.solid(c, r) || this.oneWay(c, r)) return r * TS;
    }
    return null;
  };

  /* ---------------- 背景（两张图循环 + 视差） ---------------- */
  P.buildBackground = function () {
    this.bgs = [];
    var i, o;
    for (i = 0; i < 2; i++) {
      if (this.has('contra_bg')) {
        o = this.img(0, 0, 'contra_bg');
        o.setOrigin(0, 0);
      } else {
        /* 缺图时手糊一个三层丛林剪影，别让画面空着 */
        o = this.group();
        o.add(this.scene.add.rectangle(0, 0, this.W, this.H, SB.C.BLU1).setOrigin(0, 0));
        o.add(this.scene.add.rectangle(0, 118, this.W, 40, SB.C.GRN1).setOrigin(0, 0));
        o.add(this.scene.add.rectangle(0, 150, this.W, 70, SB.C.GRN2).setOrigin(0, 0));
        o.add(this.scene.add.rectangle(0, 200, this.W, 70, SB.C.GRN1).setOrigin(0, 0));
      }
      this.bgs.push(o);
    }
  };

  /* ---------------- 铺 tile 精灵 ----------------
   * 关卡不长（约 700 个非空 tile），一次性铺成静态精灵最省事，滚动时零开销。 */
  P.drawTiles = function () {
    var r, c, k, o;
    var hasTex = this.has('contra_tiles');
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        k = this.map[r][c];
        if (k === T_NONE) continue;
        if (hasTex) {
          o = this.spr(c * TS + 8, r * TS + 8, 'contra_tiles', TILE_FRAME[k]);
        } else {
          o = this.rect(c * TS, r * TS, TS, TS, TILE_COLOR[k], 1);
        }
        this.tileSpr[r * COLS + c] = o;
        if (k === T_WATER && r === GROUND_ROW) this.waterSpr.push(o);
      }
    }
  };

  /* 打掉一块 tile（自爆兵会把桥面炸出个洞） */
  P.breakTile = function (c, r) {
    if (!this.solid(c, r)) return;
    this.map[r][c] = T_NONE;
    var o = this.tileSpr[r * COLS + c];
    if (o) { o.destroy(); this.tileSpr[r * COLS + c] = null; }
  };

  P.buildAnims = function () {
    if (this.has('contra_boom')) this.anim('ct_boom', 'contra_boom', [0, 1, 2, 3, 4], 20, 0);
  };

  /* ================================================================
   * 通用小工具：带缺图兜底的精灵
   * ================================================================ */
  P.mk = function (x, y, key, frame, w, h, color, toUi) {
    var o;
    if (this.has(key)) {
      o = this.spr(x, y, key, frame || 0, toUi);
    } else {
      o = this.rect(0, 0, w, h, color, 1, toUi);
      o.setOrigin(0.5, 0.5);
      o.setPosition(x, y);
      o.__fb = true;               // 标记：这是色块兜底，没有帧也不能 flip
    }
    return o;
  };
  P.setFr = function (o, n) { if (o && !o.__fb && o.setFrame) o.setFrame(n); };
  P.setFlip = function (o, f) { if (o && !o.__fb && o.setFlipX) o.setFlipX(f); };
  P.setTint_ = function (o, c) {
    if (!o) return;
    if (o.__fb) { if (o.setFillStyle) o.setFillStyle(c, 1); }
    else if (o.setTint) o.setTint(c);
  };

  /* 实体统一用「x = 中心, y = 脚底」，碰撞盒由 w/h 推出来 */
  P.boxOf_ = function (e) {
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  };

  /* ================================================================
   * 玩家
   * ================================================================ */
  P.buildPlayers = function () {
    var n = this.opts.twoP ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var p = {
        idx: i,
        pad: i === 0 ? this.pad : this.pad2,
        x: 40 + i * 22, y: GROUND_ROW * TS,
        vx: 0, vy: 0,
        w: 12, h: 24,
        face: 1,
        onGround: false, prone: false, noPlat: 0,
        dead: false, deadT: 0, out: false,
        inv: INV_MS, lives: 3,
        weapon: 'N', fireT: 0, holdT: 0,
        walkT: 0, upT: 0
      };
      p.spr = this.mk(p.x, p.y - 13, 'contra_hero', 0, 20, 26, i === 0 ? SB.C.BLU4 : SB.C.RED4);
      /* 2P 换配色：真机上就是调色板换一组，这里用 tint 模拟 */
      if (i === 1) this.setTint_(p.spr, 0xff9a6a);
      this.players.push(p);
    }
  };

  /* 主角当前该显示哪一帧（帧序严格按 ART_MANIFEST：0 站 1-2 跑 3 跳 4 卧 5 上射 6 中弹 7 死） */
  P.heroFrame = function (p) {
    if (p.dead) return p.deadT < 160 ? 6 : 7;
    if (p.prone) return 4;
    if (!p.onGround) return 3;
    if (p.upT > 0 && p.vx === 0) return 5;
    if (Math.abs(p.vx) > 0.02) return 1 + (Math.floor(p.walkT / 110) % 2);
    return 0;
  };

  /* 8 方向瞄准：返回 {dx,dy,mx,my}，mx/my 是枪口相对脚底原点的偏移 */
  P.aimOf = function (p) {
    var pad = p.pad, f = p.face, D = 0.7071;
    if (p.prone) return { dx: f, dy: 0, mx: f * 12, my: -6 };
    if (pad.up && pad.h !== 0) return { dx: f * D, dy: -D, mx: f * 10, my: -22 };
    if (pad.up) return { dx: 0, dy: -1, mx: f * 3, my: -27 };
    if (pad.down && !p.onGround && pad.h !== 0) return { dx: f * D, dy: D, mx: f * 10, my: -10 };
    if (pad.down && !p.onGround) return { dx: 0, dy: 1, mx: f * 2, my: -2 };
    return { dx: f, dy: 0, mx: f * 11, my: -16 };
  };

  P.updatePlayer = function (p, dt) {
    if (p.out) return;

    /* --- 死亡 → 等一下 → 复活（经典的「退回一点 + 闪烁无敌」） --- */
    if (p.dead) {
      p.deadT += dt;
      p.spr.setVisible(p.deadT < 420);
      this.setFr(p.spr, this.heroFrame(p));
      if (p.deadT >= DEAD_MS) this.respawn(p);
      return;
    }

    var pad = p.pad;
    if (p.inv > 0) {
      p.inv -= dt;
      /* 无敌期高频闪烁，让玩家知道现在打不死 */
      p.spr.setVisible(Math.floor(p.inv / 66) % 2 === 0);
      if (p.inv <= 0) p.spr.setVisible(true);
    }
    if (p.noPlat > 0) p.noPlat -= dt;
    if (pad.up) p.upT = 120; else if (p.upT > 0) p.upT -= dt;

    /* --- 朝向 / 卧倒 --- */
    if (pad.h !== 0 && !pad.up) p.face = pad.h;
    else if (pad.h !== 0) p.face = pad.h;
    var wasProne = p.prone;
    p.prone = !!(pad.down && p.onGround && !pad.up);

    /* 卧倒时按跳 = 从单向平台上落下去（下+A 穿板，老游戏的隐藏操作） */
    if (p.prone && pad.just.a) {
      var cc = Math.floor(p.x / TS), rr = Math.floor(p.y / TS);
      if (this.oneWay(cc, rr) && !this.solid(cc, rr)) {
        p.noPlat = 220; p.onGround = false; p.y += 2; p.prone = false;
      }
    }

    /* --- 水平：带一点惯性，起步/收脚都有 2~3 帧过渡，跑起来才有「肉感」 --- */
    var target = p.prone ? 0 : pad.h * RUN;
    var k = Math.min(1, dt / (p.onGround ? 52 : 88));
    p.vx += (target - p.vx) * k;
    if (Math.abs(p.vx) < 0.006) p.vx = 0;
    if (p.walkT !== undefined) p.walkT += Math.abs(p.vx) > 0.02 ? dt : -p.walkT;

    /* --- 跳跃：起跳给足初速，松键立刻砍速 → 短跳/长跳两种高度 --- */
    if (!p.prone && !wasProne && pad.just.a && p.onGround) {
      p.vy = JUMP_V; p.onGround = false; this.sfx('jump');
    }
    if (!pad.a && p.vy < SHORT_V) p.vy = SHORT_V;

    /* --- 重力 --- */
    p.vy += GRAV * dt;
    if (p.vy > MAXFALL) p.vy = MAXFALL;

    /* --- 移动 + 地形碰撞 --- */
    p.h = p.prone ? 12 : 24;
    p.w = p.prone ? 16 : 12;
    this.moveX(p, p.vx * dt);
    this.moveY(p, p.vy * dt, p.noPlat <= 0);

    /* 摄像机左右边界：不许退出画面，也不许跑到 BOSS 墙里面去 */
    var lo = this.camX + 8, hi = this.camX + this.W - 10;
    if (this.boss && this.boss.alive) hi = Math.min(hi, this.boss.x - 14);
    if (p.x < lo) { p.x = lo; if (p.vx < 0) p.vx = 0; }
    if (p.x > hi) { p.x = hi; if (p.vx > 0) p.vx = 0; }

    /* --- 致命地形：水 / 尖刺 / 掉出画面 --- */
    if (p.y > this.H + 20) { this.killPlayer(p, true); return; }
    if (this.touchDeadly(p)) { this.killPlayer(p, true); return; }

    /* --- 射击 --- */
    if (p.fireT > 0) p.fireT -= dt;
    if (pad.b && p.fireT <= 0) this.fire(p);

    /* --- 画面表现 --- */
    this.setFr(p.spr, this.heroFrame(p));
    this.setFlip(p.spr, p.face < 0);
    p.spr.setPosition(Math.round(p.x), Math.round(p.y - 13));
  };

  /* 玩家开枪。散弹一次三发，火球慢但高伤害 */
  P.fire = function (p) {
    var w = WEAPONS[p.weapon] || WEAPONS.N;
    var a = this.aimOf(p);
    var base = Math.atan2(a.dy, a.dx);
    var i, ang;
    for (i = 0; i < w.n; i++) {
      ang = base + (w.n > 1 ? (i - (w.n - 1) / 2) * (w.spread || 0.28) : 0);
      this.spawnPBullet(p.x + a.mx, p.y + a.my, Math.cos(ang) * w.spd, Math.sin(ang) * w.spd, w.dmg, w.big);
    }
    p.fireT = w.gap;
    this.sfx('shoot');
  };

  P.spawnPBullet = function (x, y, vx, vy, dmg, big) {
    if (this.pbs.length > 22) return;                  // 上限，防止满屏子弹
    var s = this.mk(x, y, 'contra_bullet', 0, big ? 8 : 5, big ? 8 : 5, big ? SB.C.RED5 : SB.C.YEL4);
    if (big) s.setScale(1.6);
    this.pbs.push({ x: x, y: y, vx: vx, vy: vy, w: big ? 9 : 6, h: big ? 9 : 6, dmg: dmg, spr: s, t: 0 });
  };

  /* 中弹 / 掉坑：一下就死，这是《魂斗萝》的灵魂 */
  P.killPlayer = function (p, silentBoom) {
    if (p.dead || p.inv > 0 || p.out) return;
    p.dead = true; p.deadT = 0; p.vx = 0; p.vy = 0; p.prone = false;
    if (!silentBoom) this.boom(p.x, p.y - 12, 1);
    else this.boom(p.x, p.y - 8, 1);
    this.sfx('player_die');
    this.shake(220, 3);
    this.flashScreen(SB.C.RED4, 90);
  };

  P.respawn = function (p) {
    p.dead = false; p.deadT = 0;
    p.lives--;
    p.weapon = 'N';                                    // 死了退回单发，压力就来了
    if (p.lives <= 0) {                                // 三条命用完 = 这个玩家出局
      p.out = true;
      p.spr.setVisible(false);
      this.refreshHud();
      this.checkAllOut();
      return;
    }
    /* 往后退一点找一块安全落点：宁可退到画面左侧，也不能复活在水里 */
    var wantX = this.clamp(p.x - 30, this.camX + 24, this.camX + this.W - 40);
    var x = this.safeX(wantX);
    p.x = x; p.y = -8; p.vx = 0; p.vy = 0.22;      // 从画面上方掉进来，掉得快一点，别让玩家干等
    p.onGround = false; p.inv = INV_MS;
    p.spr.setVisible(true);
    this.refreshHud();
  };

  /* 从想要的位置往两边找一列「下面有地、面上不致命」的安全 x */
  P.safeX = function (want) {
    var lo = this.camX + 20, hi = this.camX + this.W - 24;
    var i, x, c, y;
    for (i = 0; i < 24; i++) {
      x = i % 2 === 0 ? want - (i / 2 | 0) * TS : want + ((i + 1) / 2 | 0) * TS;
      if (x < lo || x > hi) continue;
      c = Math.floor(x / TS);
      y = this.surfaceY(x, 6);
      if (y === null) continue;
      if (this.deadly(c, Math.floor(y / TS)) || this.deadly(c, Math.floor(y / TS) - 1)) continue;
      return x;
    }
    return this.clamp(want, lo, hi);
  };

  P.checkAllOut = function () {
    var i, any = false;
    for (i = 0; i < this.players.length; i++) if (!this.players[i].out) any = true;
    if (!any) this.gameOver();
  };

  /* 碰到水面 / 尖刺 */
  P.touchDeadly = function (e) {
    var b = this.boxOf_(e);
    var c0 = Math.floor((b.x + 2) / TS), c1 = Math.floor((b.x + b.w - 3) / TS);
    var r0 = Math.floor((b.y + 4) / TS), r1 = Math.floor((b.y + b.h - 1) / TS);
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) if (this.deadly(c, r)) return true;
    return false;
  };

  /* ================================================================
   * 地形碰撞（手写，两轴分离，先横后纵）
   * ================================================================ */
  P.moveX = function (e, dx) {
    if (!dx) return;
    e.x += dx;
    var b = this.boxOf_(e);
    var r0 = Math.floor(b.y / TS), r1 = Math.floor((b.y + b.h - 1) / TS);
    var r, c;
    if (dx > 0) {
      c = Math.floor((b.x + b.w - 1) / TS);
      for (r = r0; r <= r1; r++) {
        if (this.solid(c, r)) { e.x = c * TS - e.w / 2 - 0.01; e.vx = 0; return; }
      }
    } else {
      c = Math.floor(b.x / TS);
      for (r = r0; r <= r1; r++) {
        if (this.solid(c, r)) { e.x = (c + 1) * TS + e.w / 2 + 0.01; e.vx = 0; return; }
      }
    }
  };

  P.moveY = function (e, dy, allowPlat) {
    var prevBottom = e.y;
    e.y += dy;
    var b = this.boxOf_(e);
    var c0 = Math.floor((b.x + 1) / TS), c1 = Math.floor((b.x + b.w - 2) / TS);
    var r, c;
    if (dy >= 0) {
      /* 下落：从上一帧的脚底所在行扫到这一帧，避免高速穿板 */
      var rs = Math.floor(prevBottom / TS), re = Math.floor((e.y - 1) / TS);
      for (r = rs; r <= re; r++) {
        for (c = c0; c <= c1; c++) {
          var landSolid = this.solid(c, r);
          var landPlat = allowPlat && this.oneWay(c, r) && prevBottom <= r * TS + 3;
          if (landSolid || landPlat) {
            e.y = r * TS; e.vy = 0; e.onGround = true; return;
          }
        }
      }
      e.onGround = false;
    } else {
      /* 上升：只被实心 tile 顶头 */
      var rh = Math.floor((e.y - e.h) / TS);
      for (c = c0; c <= c1; c++) {
        if (this.solid(c, rh)) { e.y = (rh + 1) * TS + e.h; e.vy = 0; return; }
      }
      e.onGround = false;
    }
  };

  /* ================================================================
   * 敌人：跑兵 / 炮台 / 自爆兵
   * ================================================================ */
  /* 固定摆放的敌人：炮台守在要道，自爆兵埋在两座桥上 */
  P.buildFixedEnemies = function () {
    this.spawnMarks = [
      { x: 24 * TS, type: 'turret', y: GROUND_ROW * TS },
      { x: 43 * TS, type: 'turret', y: GROUND_ROW * TS },
      { x: 85 * TS, type: 'turret', y: 10 * TS },
      { x: 110 * TS, type: 'turret', y: GROUND_ROW * TS },
      { x: 128 * TS, type: 'turret', y: GROUND_ROW * TS },   // BOSS 门口最后一个炮台
      { x: 57 * TS, type: 'bomb', y: GROUND_ROW * TS },
      { x: 58 * TS + 8, type: 'bomb', y: GROUND_ROW * TS },
      { x: 90 * TS, type: 'sol', y: 10 * TS },
      { x: 116 * TS, type: 'sol', y: GROUND_ROW * TS },
      { x: 125 * TS, type: 'bomb', y: GROUND_ROW * TS },
      { x: 126 * TS, type: 'bomb', y: GROUND_ROW * TS }
    ];
  };

  /* 走到视野右缘就把标记点里的敌人放出来 */
  P.checkMarks = function () {
    var edge = this.camX + this.W + 8;
    for (var i = this.spawnMarks.length - 1; i >= 0; i--) {
      var m = this.spawnMarks[i];
      if (m.x < edge) {
        this.spawnEnemy(m.type, m.x, m.y, -1);
        this.spawnMarks.splice(i, 1);
      }
    }
  };

  P.spawnEnemy = function (type, x, y, face) {
    var e = {
      type: type, x: x, y: y, vx: 0, vy: 0, face: face || -1,
      onGround: false, dead: false, t: 0, shootT: 800 + Math.random() * 800,
      hp: 1, w: 14, h: 22, score: 100, armed: 0, jumpT: 700 + Math.random() * 900
    };
    if (type === 'sol') {
      e.hp = 1; e.w = 14; e.h = 22; e.score = 100;
      e.spr = this.mk(x, y - 12, 'contra_soldier', 0, 18, 24, SB.C.RED3);
    } else if (type === 'turret') {
      e.hp = 5; e.w = 20; e.h = 22; e.score = 300; e.onGround = true;
      e.spr = this.mk(x, y - 12, 'contra_turret', 0, 24, 24, SB.C.GREY5);
      e.shootT = 900;
    } else {                                    /* bomb：桥上冲过来自爆的家伙 */
      e.hp = 1; e.w = 14; e.h = 22; e.score = 150;
      e.spr = this.mk(x, y - 12, 'contra_soldier', 0, 18, 24, SB.C.YEL2);
      this.setTint_(e.spr, SB.C.YEL3);           // 换个颜色，玩家一眼能认出来「这个会炸」
    }
    this.enemies.push(e);
    return e;
  };

  /* 定时从画面右边（偶尔从左后方）放跑兵，制造持续的压迫感 */
  P.spawnWave = function (dt) {
    if (this.boss && this.boss.on) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1800 + Math.random() * 1100;
    var alive = 0, i;
    for (i = 0; i < this.enemies.length; i++) if (this.enemies[i].type === 'sol' && !this.enemies[i].dead) alive++;
    if (alive >= 4) return;                     // 同屏最多 4 个跑兵，再多就变成弹幕地狱了

    var fromLeft = Math.random() < 0.25;
    var x = fromLeft ? this.camX - 10 : this.camX + this.W + 10;
    var y = this.surfaceY(x, 4);
    if (y === null) return;                     // 那一列是坑或水，这波就不放了
    var c = Math.floor(x / TS);
    if (this.deadly(c, Math.floor(y / TS))) return;
    this.spawnEnemy('sol', x, y, fromLeft ? 1 : -1);
  };

  P.updateEnemy = function (e, dt) {
    e.t += dt;
    var tgt = this.nearestPlayer(e.x, e.y);

    if (e.type === 'turret') {
      /* 炮台：不动，朝玩家方向打，3 帧开火动画 */
      if (tgt) this.setFlip(e.spr, tgt.x < e.x);
      e.shootT -= dt;
      if (e.shootT < 260) this.setFr(e.spr, e.shootT < 130 ? 2 : 1);
      else this.setFr(e.spr, 0);
      if (e.shootT <= 0) {
        e.shootT = 1250 + Math.random() * 500;
        if (tgt && this.onScreen(e.x)) this.aimShot(e.x, e.y - 12, tgt, 0.19);
      }
    } else if (e.type === 'bomb') {
      /* 自爆兵：朝最近的玩家冲，贴近就闪红两下，然后连桥一起炸 */
      if (tgt) e.face = tgt.x < e.x ? -1 : 1;
      e.vx = e.face * 0.135;
      e.vy += GRAV * dt;
      if (e.vy > MAXFALL) e.vy = MAXFALL;
      this.moveX(e, e.vx * dt);
      this.moveY(e, e.vy * dt, true);
      this.setFr(e.spr, Math.floor(e.t / 120) % 2);
      this.setFlip(e.spr, e.face < 0);
      if (tgt && Math.abs(tgt.x - e.x) < 30 && Math.abs(tgt.y - e.y) < 34) e.armed = e.armed || 1;
      if (e.armed) {
        e.armed += dt;
        this.setTint_(e.spr, Math.floor(e.armed / 70) % 2 ? SB.C.RED4 : SB.C.WHITE);
        if (e.armed > 520) { this.blowUpBomber(e); return; }
      }
    } else {
      /* 跑兵：一路小跑，遇到断口或随机时机就跳，间歇开枪 */
      e.vx = e.face * 0.062;
      e.vy += GRAV * dt;
      if (e.vy > MAXFALL) e.vy = MAXFALL;

      e.jumpT -= dt;
      var ahead = Math.floor((e.x + e.face * 12) / TS);
      var footR = Math.floor(e.y / TS);
      var gapAhead = !this.solid(ahead, footR) && !this.oneWay(ahead, footR);
      if (e.onGround && (gapAhead || e.jumpT <= 0)) {
        e.vy = -0.27; e.onGround = false;
        e.jumpT = 900 + Math.random() * 1200;
      }
      this.moveX(e, e.vx * dt);
      this.moveY(e, e.vy * dt, true);
      /* 撞墙就转身，不然会卡在台阶上抽搐 */
      if (e.vx === 0 && e.onGround) e.face = -e.face;

      this.setFlip(e.spr, e.face < 0);
      e.shootT -= dt;
      if (e.shootT < 220) this.setFr(e.spr, 2);
      else this.setFr(e.spr, Math.floor(e.t / 140) % 2);
      if (e.shootT <= 0) {
        e.shootT = 1300 + Math.random() * 900;
        if (tgt && this.onScreen(e.x)) this.aimShot(e.x + e.face * 8, e.y - 14, tgt, 0.16);
      }
      /* 掉进水里或掉出画面：直接算死，不留脏数据 */
      if (e.y > this.H + 20 || this.touchDeadly(e)) { this.removeEnemy(e, false); return; }
    }

    e.spr.setPosition(Math.round(e.x), Math.round(e.y - 12));
  };

  P.blowUpBomber = function (e) {
    this.boom(e.x, e.y - 10, 2);
    this.sfx('explosion_l');
    this.shake(240, 3);
    /* 把脚下这几块桥面炸掉 —— 桥上的洞是它留给你的礼物 */
    var c0 = Math.floor((e.x - 16) / TS), c1 = Math.floor((e.x + 16) / TS), r = Math.floor(e.y / TS);
    for (var c = c0; c <= c1; c++) {
      if (this.code(c, r) === T_BRIDGE || this.code(c, r) === T_IRON) this.breakTile(c, r);
    }
    /* 爆炸范围内的玩家一起带走 */
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.dead || p.out) continue;
      if (Math.abs(p.x - e.x) < 26 && Math.abs(p.y - e.y) < 30) this.killPlayer(p);
    }
    this.removeEnemy(e, false);
  };

  /* 敌人被打死：加分、爆炸、按概率掉胶囊 */
  P.hurtEnemy = function (e, dmg) {
    e.hp -= dmg;
    if (e.hp > 0) { this.sfx('hit'); return false; }
    this.addScore(e.score);
    this.boom(e.x, e.y - 10, e.type === 'turret' ? 2 : 1);
    this.sfx(e.type === 'turret' ? 'explosion_l' : 'explosion_s');
    if (e.type === 'turret') this.shake(150, 2);
    if (Math.random() < (e.type === 'turret' ? 0.5 : 0.1)) this.dropPod(e.x, e.y - 20);
    this.removeEnemy(e, true);
    return true;
  };

  P.removeEnemy = function (e, scored) {
    e.dead = true;
    if (e.spr) e.spr.destroy();
    var i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  };

  P.nearestPlayer = function (x, y) {
    var best = null, bd = 1e9, i, p, d;
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (p.dead || p.out) continue;
      d = Math.abs(p.x - x) + Math.abs(p.y - y) * 0.5;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  P.onScreen = function (x) { return x > this.camX - 20 && x < this.camX + this.W + 20; };

  /* 朝玩家射一发（略微提前量都不给，不然 8-bit 太难） */
  P.aimShot = function (x, y, tgt, spd) {
    var dx = tgt.x - x, dy = (tgt.y - 12) - y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.spawnEBullet(x, y, dx / len * spd, dy / len * spd);
  };

  P.spawnEBullet = function (x, y, vx, vy) {
    if (this.ebs.length > 40) return;
    var s = this.mk(x, y, 'contra_ebullet', 0, 5, 5, SB.C.RED5);
    this.ebs.push({ x: x, y: y, vx: vx, vy: vy, w: 6, h: 6, spr: s, t: 0 });
  };

  /* ================================================================
   * 子弹推进与命中判定
   * ================================================================ */
  P.updateBullets = function (dt) {
    var i, b, box, j, e, hitAny;

    /* --- 玩家子弹 --- */
    for (i = this.pbs.length - 1; i >= 0; i--) {
      b = this.pbs[i];
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.spr.setPosition(Math.round(b.x), Math.round(b.y));
      this.setFr(b.spr, Math.floor(b.t / 60) % 2);

      if (b.x < this.camX - 16 || b.x > this.camX + this.W + 16 || b.y < -12 || b.y > this.H + 12) {
        this.killBullet(this.pbs, i); continue;
      }
      /* 打墙就没了（打墙有火花，打的位置很直观） */
      if (this.solid(Math.floor(b.x / TS), Math.floor(b.y / TS))) {
        this.boom(b.x, b.y, 0);
        this.killBullet(this.pbs, i); continue;
      }
      box = { x: b.x - 3, y: b.y - 3, w: b.w, h: b.h };
      hitAny = false;
      for (j = this.enemies.length - 1; j >= 0; j--) {
        e = this.enemies[j];
        if (this.hit(box, this.boxOf_(e))) { this.hurtEnemy(e, b.dmg); hitAny = true; break; }
      }
      if (!hitAny && this.boss && this.boss.on && this.boss.alive) hitAny = this.hitBoss(box, b.dmg);
      if (hitAny) { this.boom(b.x, b.y, 0); this.killBullet(this.pbs, i); }
    }

    /* --- 敌方子弹 --- */
    for (i = this.ebs.length - 1; i >= 0; i--) {
      b = this.ebs[i];
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.spr.setPosition(Math.round(b.x), Math.round(b.y));
      this.setFr(b.spr, Math.floor(b.t / 70) % 2);
      if (b.x < this.camX - 16 || b.x > this.camX + this.W + 16 || b.y < -16 || b.y > this.H + 16) {
        this.killBullet(this.ebs, i); continue;
      }
      if (this.solid(Math.floor(b.x / TS), Math.floor(b.y / TS))) { this.killBullet(this.ebs, i); continue; }
      box = { x: b.x - 3, y: b.y - 3, w: b.w, h: b.h };
      for (j = 0; j < this.players.length; j++) {
        var p = this.players[j];
        if (p.dead || p.out || p.inv > 0) continue;
        if (this.hit(box, this.boxOf_(p))) {
          this.killPlayer(p);
          this.killBullet(this.ebs, i);
          break;
        }
      }
    }
  };

  P.killBullet = function (arr, i) {
    if (arr[i].spr) arr[i].spr.destroy();
    arr.splice(i, 1);
  };

  /* ================================================================
   * 爆炸特效：size 0 小火花 / 1 普通 / 2 大爆
   * ================================================================ */
  P.boom = function (x, y, size) {
    var s;
    if (this.has('contra_boom')) {
      s = this.spr(x, y, 'contra_boom', 0);
      s.setScale(size === 0 ? 0.5 : (size === 2 ? 1.5 : 1));
      s.play('ct_boom');
      s.on('animationcomplete', function () { s.destroy(); });
    } else {
      var w = size === 0 ? 8 : (size === 2 ? 30 : 18);
      s = this.rect(0, 0, w, w, size === 0 ? SB.C.YEL4 : SB.C.RED4, 1);
      s.setOrigin(0.5, 0.5); s.setPosition(x, y);
      this.scene.tweens.add({
        targets: s, alpha: 0, scale: 1.8, duration: 260,
        onComplete: function () { s.destroy(); }
      });
    }
    if (size === 2) this.flashScreen(SB.C.YEL4, 60);
  };

  /* ================================================================
   * 武器胶囊
   * ================================================================ */
  P.buildPods = function () {
    this.podMarks = [
      { x: 39 * TS, y: 11 * TS - 10, type: 'M' },
      { x: 70 * TS, y: GROUND_ROW * TS - 10, type: 'S' },
      { x: 108 * TS, y: GROUND_ROW * TS - 10, type: 'F' }
    ];
    for (var i = 0; i < this.podMarks.length; i++) {
      var m = this.podMarks[i];
      this.makePod(m.x, m.y, m.type, false);
    }
  };

  P.dropPod = function (x, y) {
    this.makePod(x, y, this.pick(POWER_ORDER), true);
  };

  P.makePod = function (x, y, type, falling) {
    var s = this.mk(x, y, 'contra_powerup', POWER_FRAME[type], 14, 14, SB.C.YEL3);
    this.pods.push({ x: x, y: y, y0: y, type: type, spr: s, vy: falling ? -0.12 : 0, fall: falling, t: 0 });
  };

  P.updatePods = function (dt) {
    for (var i = this.pods.length - 1; i >= 0; i--) {
      var o = this.pods[i];
      o.t += dt;
      if (o.fall) {
        o.vy += GRAV * dt;
        if (o.vy > 0.3) o.vy = 0.3;
        var e = { x: o.x, y: o.y + 7, w: 12, h: 14, vy: o.vy, onGround: false };
        this.moveY(e, o.vy * dt, true);
        o.y = e.y - 7; o.vy = e.vy;
        if (e.onGround) { o.fall = false; o.y0 = o.y; }
        if (o.y > this.H + 20) { o.spr.destroy(); this.pods.splice(i, 1); continue; }
      } else {
        /* 停下来之后上下轻浮，远远就能看见 */
        o.y = o.y0 + Math.sin(o.t / 220) * 2;
      }
      o.spr.setPosition(Math.round(o.x), Math.round(o.y));
      o.spr.setVisible(Math.floor(o.t / 500) % 6 !== 5);      // 偶尔闪一下

      var box = { x: o.x - 7, y: o.y - 7, w: 14, h: 14 };
      for (var j = 0; j < this.players.length; j++) {
        var p = this.players[j];
        if (p.dead || p.out) continue;
        if (this.hit(box, this.boxOf_(p))) {
          p.weapon = o.type;
          this.addScore(200);
          this.sfx('powerup');
          this.flashScreen(SB.C.WHITE, 50);
          o.spr.destroy(); this.pods.splice(i, 1);
          this.refreshHud();
          break;
        }
      }
    }
  };

  /* ================================================================
   * 关底 BOSS：一面会喷弹幕的要塞墙，三个红色弱点
   * ================================================================ */
  P.buildBoss = function () {
    var bx = 2088, by = 120;                 // 墙体贴图 96×88，底边正好落在主地面上
    this.maxCam = LEVEL_W - this.W;          // 1848：镜头推到这里就锁死，开始打 BOSS

    /* 墙体上半部分（贴图只有 88 高，上面用金属色块接到画面顶部） */
    this.rect(bx, 16, 96, by - 16, SB.C.GREY3, 1);
    this.rect(bx, 16, 96, 3, SB.C.GREY6, 1);
    for (var i = 0; i < 5; i++) this.rect(bx + 8, 28 + i * 18, 80, 6, SB.C.GREY2, 1);

    var spr = this.mk(bx + 48, by + 44, 'contra_boss', 0, 96, 88, SB.C.GREY4);

    this.boss = {
      x: bx, y: by, spr: spr, on: false, alive: true,
      coreT: 1900, ventT: 1300, ventIdx: 0, t: 0,
      parts: [
        { ox: 46, oy: 42, w: 26, h: 26, hp: 14, max: 14, alive: true },   // 中央核心
        { ox: 17, oy: 66, w: 12, h: 18, hp: 6, max: 6, alive: true },     // 左侧喷口
        { ox: 77, oy: 66, w: 12, h: 18, hp: 6, max: 6, alive: true }      // 右侧喷口
      ]
    };
    /* 弱点上盖一层半透明红框：告诉玩家「这里能打」，8-bit 时代就靠闪烁传达信息 */
    for (i = 0; i < this.boss.parts.length; i++) {
      var pt = this.boss.parts[i];
      pt.mark = this.rect(bx + pt.ox - pt.w / 2, by + pt.oy - pt.h / 2, pt.w, pt.h, SB.C.RED5, 0.35);
    }
  };

  P.partBox = function (pt) {
    return { x: this.boss.x + pt.ox - pt.w / 2, y: this.boss.y + pt.oy - pt.h / 2, w: pt.w, h: pt.h };
  };

  /* 弱点的「可打击」判定盒要从墙的正面一直延伸到弱点本体：
     核心和喷口都是嵌在墙里的，如果只按本体判定，子弹会先被墙面吃掉，永远打不着。
     所以横向拉到墙面，让「打对高度」成为唯一条件 —— 这才是当年打这面墙的手感。 */
  P.partHitBox = function (pt) {
    var b = this.partBox(pt);
    var left = this.boss.x - 4;
    return { x: left, y: b.y, w: (b.x + b.w) - left, h: b.h };
  };

  P.hitBoss = function (box, dmg) {
    var i, pt;
    for (i = 0; i < this.boss.parts.length; i++) {
      pt = this.boss.parts[i];
      if (!pt.alive) continue;
      if (!this.hit(box, this.partHitBox(pt))) continue;
      pt.hp -= dmg;
      if (pt.hp > 0) { this.sfx('hit'); return true; }
      /* 弱点打爆：留一块焦黑，弹幕也随之少一路 */
      pt.alive = false;
      if (pt.mark) { pt.mark.destroy(); pt.mark = null; }
      var b = this.partBox(pt);
      this.rect(b.x, b.y, b.w, b.h, SB.C.GREY1, 1);
      this.boom(b.x + b.w / 2, b.y + b.h / 2, 2);
      this.sfx('explosion_l');
      this.shake(240, 3);
      this.addScore(500);
      var left = 0;
      for (var j = 0; j < this.boss.parts.length; j++) if (this.boss.parts[j].alive) left++;
      if (left === 0) this.startBossDeath();
      return true;
    }
    /* 打在墙上：算命中但不掉血（子弹会消失，符合直觉） */
    if (box.x + box.w > this.boss.x && box.x < this.boss.x + 96) return true;
    return false;
  };

  P.updateBoss = function (dt) {
    var b = this.boss;
    if (!b) return;
    b.t += dt;

    if (this.bossDying > 0) {
      /* 死亡演出：一秒多的连环爆炸，然后通关 */
      this.bossDying -= dt;
      if (Math.floor(this.bossDying / 130) !== this.lastBoomStep) {
        this.lastBoomStep = Math.floor(this.bossDying / 130);
        this.boom(b.x + this.rnd(8, 88), b.y + this.rnd(4, 84), 2);
        this.sfx('explosion_l');
      }
      if (this.bossDying <= 0 && !this.cleared) {
        /* 别让墙凭空消失：换成一堵烧焦的残墙 + 几点余火，画面才有「打赢了」的实感 */
        b.spr.setVisible(false);
        this.rect(b.x, b.y, 96, 88, SB.C.GREY1, 1);
        for (var q = 0; q < 7; q++) {
          this.rect(b.x + this.rndInt(4, 76), b.y + this.rndInt(6, 74), this.rndInt(6, 16), this.rndInt(4, 10),
            q % 2 ? SB.C.RED1 : SB.C.GREY2, 1);
        }
        this.addScore(5000);
        this.refreshHud();
        this.clearGame();
      }
      return;
    }
    if (!b.alive) return;

    if (!b.on) {
      if (this.camX > this.maxCam - 50) { b.on = true; this.sfx('explosion_s'); this.shake(300, 3); }
      return;
    }

    /* 核心明暗脉动（3 帧） */
    this.setFr(b.spr, Math.floor(b.t / 170) % 3);
    for (var i = 0; i < b.parts.length; i++) {
      var pt = b.parts[i];
      if (pt.mark) pt.mark.setAlpha(0.2 + 0.25 * (Math.floor(b.t / 140) % 2));
    }

    var tgt = this.nearestPlayer(b.x, b.y + 44);
    if (!tgt) return;

    /* 核心：每 1.6 秒一把五连扇形弹幕，逼玩家换位 */
    b.coreT -= dt;
    if (b.coreT <= 0 && b.parts[0].alive) {
      b.coreT = 1750;
      var base = Math.atan2(tgt.y - 14 - (b.y + 42), tgt.x - (b.x + 40));
      for (i = 0; i < 5; i++) {
        var a = base + (i - 2) * 0.26;
        this.spawnEBullet(b.x + 40, b.y + 42, Math.cos(a) * 0.155, Math.sin(a) * 0.155);
      }
      this.sfx('tank_fire');
    }
    /* 两个喷口：轮流打快速点射，节奏和核心错开 */
    b.ventT -= dt;
    if (b.ventT <= 0) {
      b.ventT = 950;
      var vents = [];
      if (b.parts[1].alive) vents.push(b.parts[1]);
      if (b.parts[2].alive) vents.push(b.parts[2]);
      if (vents.length) {
        var v = vents[b.ventIdx++ % vents.length];
        this.aimShot(b.x + v.ox, b.y + v.oy, tgt, 0.20);
      }
    }
  };

  P.startBossDeath = function () {
    this.boss.alive = false;
    this.bossDying = 1400;
    this.lastBoomStep = -1;
    this.flashScreen(SB.C.WHITE, 140);
    this.shake(600, 4);
    /* 弹幕清空，别让玩家在通关瞬间被冷枪打死 */
    for (var i = this.ebs.length - 1; i >= 0; i--) this.killBullet(this.ebs, i);
  };

  /* ================================================================
   * 摄像机 + 背景视差
   * ================================================================ */
  P.updateCamera = function () {
    var lead = null, i, p;
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (p.dead || p.out) continue;
      if (lead === null || p.x > lead) lead = p.x;
    }
    if (lead !== null) {
      /* 只往前推，绝不回退 —— 这是横版跑轰的铁律，也是双打时抢路的乐趣来源 */
      var want = Math.min(lead - 140, this.maxCam);
      if (want > this.camX) this.camX = want;
    }
    if (this.camX < 0) this.camX = 0;

    /* 整数取整，否则像素会抖 */
    this.world.x = -Math.round(this.camX);

    /* 背景 0.35 倍视差，两张图轮转铺满 */
    var off = (this.camX * 0.35) % this.W;
    for (i = 0; i < this.bgs.length; i++) {
      this.bgs[i].x = Math.round(this.camX - off + i * this.W);
    }
  };

  P.waterAnim = function (dt) {
    this.waterT += dt;
    if (this.waterT < 300) return;
    this.waterT = 0;
    this.waterFlip = !this.waterFlip;
    for (var i = 0; i < this.waterSpr.length; i++) this.setFr(this.waterSpr[i], this.waterFlip ? 6 : 5);
  };

  /* ================================================================
   * HUD：顶部一条，离边至少 8px（显像管过扫描会吃掉边缘）
   * ================================================================ */
  P.g = function (s) {
    /* 盗版汉化卡带：中文全变方块，但排版一模一样 */
    if (!this.opts.garble) return s;
    return s.replace(/[^\x20-\x7e]/g, '■');
  };

  P.buildHud = function () {
    this.rect(0, 0, this.W, 24, SB.C.INK, 0.45, true);
    this.hudScore = this.txt(12, 8, '', 12, SB.C.YEL4);
    this.hudLifeLb = this.txt(104, 8, this.g('命'), 12, SB.C.GREY8);
    this.hudWeapon = this.txt(252, 8, '', 12, SB.C.GRN5);
    this.lifeIcons = [];
    this.bossBar = this.gfx(true);

    /* 买了《电子游戏时代》才知道的秘技，画在左下角，离边 8px 以上 */
    if (this.hasMag()) {
      this.hudTip = this.txt(12, 246, this.g('秘技 上上下下左右左右BA'), 12, SB.C.PUR4);
      this.hudTip.setAlpha(0.85);
    }
    this.refreshHud();
  };

  P.refreshHud = function () {
    var i, j, p, ic;
    /* 分数补足 6 位，像当年那样一排整齐的 0 */
    var s = '' + this.score;
    while (s.length < 6) s = '0' + s;
    this.hudScore.setText(this.g('得分') + ' ' + s);

    var w = this.g('武器') + ' ' + (WEAPONS[this.players[0].weapon] || WEAPONS.N).letter;
    if (this.players.length > 1) w += '/' + (WEAPONS[this.players[1].weapon] || WEAPONS.N).letter;
    this.hudWeapon.setText(w);

    /* 命数小图标：最多画 4 个，超了在后面加个 + */
    for (i = 0; i < this.lifeIcons.length; i++) this.lifeIcons[i].destroy();
    this.lifeIcons = [];
    var x = 122;
    for (j = 0; j < this.players.length; j++) {
      p = this.players[j];
      var n = Math.max(0, Math.min(4, p.lives));
      for (i = 0; i < n; i++) {
        ic = this.mk(x, 13, 'contra_hero', 0, 6, 10, j === 0 ? SB.C.BLU4 : SB.C.RED4, true);
        ic.setScale(this.has('contra_hero') ? 0.36 : 1);
        if (j === 1) this.setTint_(ic, 0xff9a6a);
        this.lifeIcons.push(ic);
        x += 9;
      }
      if (p.lives > 4) {
        ic = this.txt(x, 8, '+' + p.lives, 12, j === 0 ? SB.C.BLU5 : SB.C.RED5);
        this.lifeIcons.push(ic);
        x += 6 + ('' + p.lives).length * 6;
      }
      x += 8;
    }
  };

  P.updateHud = function () {
    if (this.score !== this.hudScoreVal) { this.hudScoreVal = this.score; this.refreshHud(); }

    /* BOSS 血条：只在打 BOSS 时出现 */
    this.bossBar.clear();
    if (this.boss && this.boss.on && this.boss.alive) {
      var tot = 0, cur = 0, i, pt;
      for (i = 0; i < this.boss.parts.length; i++) {
        pt = this.boss.parts[i];
        tot += pt.max; cur += Math.max(0, pt.hp);
      }
      this.bossBar.fillStyle(SB.C.GREY2, 0.9);
      this.bossBar.fillRect(120, 28, 120, 5);
      this.bossBar.fillStyle(SB.C.RED4, 1);
      this.bossBar.fillRect(120, 28, Math.round(120 * cur / tot), 5);
    }
  };

  /* 秘技码：上上下下左右左右BA → 30 条命 */
  P.updateCheat = function () {
    if (this.cheatOn) return;
    var j = this.pad.just;
    var keys = ['up', 'down', 'left', 'right', 'a', 'b'];
    var pressed = null, i;
    for (i = 0; i < keys.length; i++) if (j[keys[i]]) { pressed = keys[i]; break; }
    if (!pressed) return;

    if (pressed === CHEAT[this.cheatIdx]) {
      this.cheatIdx++;
      if (this.cheatIdx >= CHEAT.length) this.grantCheat();
    } else {
      this.cheatIdx = (pressed === CHEAT[0]) ? 1 : 0;
    }
  };

  P.grantCheat = function () {
    this.cheatOn = true;
    this.cheatIdx = 0;
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].lives = 30;
      this.players[i].out = false;
      this.players[i].spr.setVisible(true);
    }
    this.sfx('extra_life');
    this.flashScreen(SB.C.YEL4, 160);
    if (this.hudTip) this.hudTip.setText(this.g('秘技生效 30条命'));
    this.refreshHud();
  };

  /* ================================================================
   * 主循环
   * ================================================================ */
  P.update = function (dt) {
    if (this.over || this.cleared) return;
    this.t += dt;

    this.updateCheat();
    this.waterAnim(dt);

    var i;
    for (i = 0; i < this.players.length; i++) this.updatePlayer(this.players[i], dt);

    this.checkMarks();
    this.spawnWave(dt);

    /* 倒着遍历：AI 里可能把自己从数组里摘掉 */
    for (i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (e.x < this.camX - 70) { this.removeEnemy(e, false); continue; }   // 跑出身后就回收
      this.updateEnemy(e, dt);
    }

    this.updateBullets(dt);
    this.updatePods(dt);
    this.updateBoss(dt);
    this.updateCamera();
    this.updateHud();
  };

  P.destroy = function () {
    /* 自己产生的对象都挂在 world/ui 里，基类会一并销毁；这里只清引用与数组 */
    this.players = [];
    this.enemies = [];
    this.pbs = [];
    this.ebs = [];
    this.pods = [];
    this.tileSpr = [];
    this.waterSpr = [];
    this.bgs = [];
    this.lifeIcons = [];
    this.boss = null;
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games = SB.Games || {};
  SB.Games.contra = ContraGame;

})(window.SB);
