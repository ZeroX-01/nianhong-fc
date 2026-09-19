/* 《铁甲坦克1990》—— 致敬当年那张坦克卡。
 *
 * 这是那张开局就有的绿色卡带，也是《100 万合 1》里唯一真能进去的游戏
 * （目录里的「超级坦克 / 超级坦克 II / 超级坦克 III 最终版」都是它，只是换了配色）。
 * 所以它必须是最耐玩的一个：4 张关卡、3 种敌人、6 种道具、双打、坦克升级。
 *
 * 实现要点（引擎没开物理，全部自己算）：
 *   1. 战场 13×13 格（16px），但地形内部按 8px「半格」存储 —— 砖墙才能像当年那样一半一半地崩。
 *      => 地形网格 26×26，每格 8px，整块战场 208×208。
 *   2. 所有单位坐标都是整数像素，移动按 1px 逐步推进并检测，天然贴墙不抖；
 *      转向时把另一根轴吸附到 8px 网格，所以不会卡墙角。
 *   3. 每个 8px 子格一个显示对象（用 setCrop 从 16px 图块里裁出对应的四分之一），
 *      砖墙被打掉就销毁那一个子格，崩塌过程免费得到。
 *   4. 美术资源可能缺失，所有取图前先 has()，缺图退化成同尺寸色块。 */
(function (SB) {
  'use strict';

  /* ================================================================
   * 0. 常量
   * ================================================================ */

  var TS = 8;                 // 地形子格边长（半格）
  var GN = 26;                // 26×26 子格
  var CELL = 16;              // 一个整格 = 2×2 子格
  var FW = GN * TS;           // 战场边长 208
  var FX = 20, FY = 30;       // 战场左上角（四周留足过扫描余量：左 20 / 上 30 / 下 32）
  var HX = 240;               // 右侧竖 HUD 起始 x（到 352，留 8px 余量）

  /* 地形类型 */
  var T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_GRASS = 3, T_WATER = 4, T_ICE = 5;
  /* tiles.png 帧序：0 砖 / 1 钢 / 2 草 / 3 水 / 4 冰 / 5 空地 */
  var TILE_FRAME = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

  /* 方向：0 上 1 右 2 下 3 左（与 tank_p 的帧序一致：dir*2 + 履带帧） */
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];

  /* 老鹰基地：32×32，压在战场底部正中（8px 对齐，所以横向真居中） */
  var BASE = { x: 88, y: 176, w: 32, h: 32 };
  var BASE_SX = 11, BASE_SY = 22, BASE_SW = 4, BASE_SH = 4;   // 子格坐标

  /* 三个敌人出生点（战场局部坐标） */
  var ESPAWN = [{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 192, y: 0 }];
  /* 玩家出生点：老鹰左右两边 */
  var PSPAWN = [{ x: 64, y: 192 }, { x: 128, y: 192 }];

  /* ================================================================
   * 1. 关卡地图（自己用字符画，一行 13 个字符 = 13 格）
   *    . 空地   B 砖墙   S 钢墙   G 草丛   W 水面   I 冰面
   *    约定：第 0 行的 0/6/12 格、第 12 行、以及基地周围（10~12 行的 5~7 格）留空。
   * ================================================================ */
  var MAPS = [
    {
      name: '工厂',
      rows: [
        '.....B.B.....',
        '.BBB.B.B.BBB.',
        '.B.B.B.B.B.B.',
        '.B.B.....B.B.',
        '.B.BB.S.BB.B.',
        '.....B.B.....',
        'BB.B.....B.BB',
        '.....BBB.....',
        '.B.B.....B.B.',
        '.B.BB.S.BB.B.',
        '.B.B.....B.B.',
        '.BBB.....BBB.',
        '.............'
      ]
    },
    {
      name: '河道',
      rows: [
        '.B.........B.',
        '.B.BBBBBBB.B.',
        '.B.B.....B.B.',
        '...B.WWW.B...',
        'GG.B.WWW.B.GG',
        '...B.WWW.B...',
        '.B.B.....B.B.',
        '.B.BBB.BBB.B.',
        '.B.........B.',
        '.BB.BB.BB.BB.',
        '.............',
        '.BBB.....BBB.',
        '.............'
      ]
    },
    {
      name: '冰原',
      rows: [
        '..BB.....BB..',
        '..BB.SSS.BB..',
        '.............',
        '.IIII...IIII.',
        '.I.B.BBB.B.I.',
        '.I.B.....B.I.',
        '.....B.B.....',
        'GG.B.....B.GG',
        '.I.BBB.BBB.I.',
        '.I.........I.',
        '.IIII...IIII.',
        '.BB.......BB.',
        '.............'
      ]
    },
    {
      name: '要塞',
      rows: [
        '.....S.S.....',
        '.BSB.B.B.BSB.',
        '.B.B.B.B.B.B.',
        '.B.B.....B.B.',
        '.BBB.GGG.BBB.',
        '.....G.G.....',
        'SS.BBB.BBB.SS',
        '.....W.W.....',
        '.BBB.....BBB.',
        '.B.BB...BB.B.',
        '.B.........B.',
        '.BBB.....BBB.',
        '.............'
      ]
    }
  ];

  /* 每关的敌人配比（合计 20 台）与刷怪节奏 */
  var WAVES = [
    { a: 14, b: 4, c: 2, gap: 2600 },
    { a: 10, b: 6, c: 4, gap: 2300 },
    { a: 8, b: 6, c: 6, gap: 2000 },
    { a: 6, b: 6, c: 8, gap: 1700 }
  ];

  /* ================================================================
   * 2. 三套配色（盗版合卡的关键笑点：同一个游戏，换色当三个卖）
   * ================================================================ */
  var SKINS = [
    {
      /* 0：原版。黑底、红砖、黄坦克 */
      key: 0, label: '超级坦克',
      outer: 0x24242f, field: 0x000000, frame: 0x4f4f60,
      brick: 0xffffff, steel: 0xffffff, grass: 0xffffff, water: 0xffffff, ice: 0xffffff,
      p1: 0xffffff, p2: 0x8fd15c, enemy: 0xffffff,
      accent: SB.C.YEL3, hud: SB.C.GREY8,
      cBrick: SB.C.RED3, cSteel: SB.C.GREY6, cGrass: SB.C.GRN3, cWater: SB.C.BLU2, cIce: SB.C.BLU5
    },
    {
      /* 1：II。深蓝夜战，青砖 + 金属钢墙 + 绿坦克 */
      key: 1, label: '超级坦克 II',
      outer: 0x0c1832, field: 0x080c18, frame: 0x2a61ad,
      brick: 0x93d4ea, steel: 0xf5db6e, grass: 0x4a9bd1, water: 0x4a9bd1, ice: 0xffffff,
      p1: 0x8fd15c, p2: 0xf5db6e, enemy: 0xd0d0ff,
      accent: SB.C.BLU4, hud: SB.C.BLU5,
      cBrick: SB.C.BLU3, cSteel: SB.C.YEL3, cGrass: SB.C.GRN2, cWater: SB.C.BLU3, cIce: SB.C.BLU5
    },
    {
      /* 2：III 最终版。紫红调，粉砖 + 蓝坦克 */
      key: 2, label: '超级坦克 III',
      outer: 0x32163f, field: 0x140a1c, frame: 0xad4287,
      brick: 0xe07db4, steel: 0xad4287, grass: 0xe0b422, water: 0xad4287, ice: 0xe07db4,
      p1: 0x93d4ea, p2: 0xf2705a, enemy: 0xf5db6e,
      accent: SB.C.PUR4, hud: SB.C.PUR4,
      cBrick: SB.C.PUR3, cSteel: SB.C.PUR2, cGrass: SB.C.YEL2, cWater: SB.C.PUR1, cIce: SB.C.PUR4
    }
  ];

  /* 敌人三种：普通 / 快速 / 装甲 */
  var EKIND = {
    a: { key: 'tank_ea', speed: 42, hp: 1, score: 100, fire: 1500, bs: 140, color: SB.C.GREY7 },
    b: { key: 'tank_eb', speed: 84, hp: 1, score: 200, fire: 1300, bs: 165, color: SB.C.GRN4 },
    c: { key: 'tank_ec', speed: 36, hp: 3, score: 300, fire: 1100, bs: 150, color: SB.C.WOOD5 }
  };

  /* 道具：与 item.png 帧序严格对应 —— 0 星 1 头盔 2 手雷 3 铁锹 4 坦克 5 计时器 */
  var IT_STAR = 0, IT_HELMET = 1, IT_GRENADE = 2, IT_SHOVEL = 3, IT_LIFE = 4, IT_TIMER = 5;
  var IT_COLOR = [SB.C.YEL3, SB.C.GREY7, SB.C.GRN3, SB.C.WOOD5, SB.C.YEL4, SB.C.BLU5];

  /* ================================================================
   * 3. 构造
   * ================================================================ */
  function TankGame(host, opts) {
    SB.GameBase.call(this, host, opts);

    this.phase = 'intro';        // intro → play → summary → （下一关 / clearGame）
    this.phaseT = 0;

    this.grid = null;            // 26×26 地形类型
    this.cellSpr = null;         // 26×26 显示对象（每个子格一个）
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.items = [];
    this.booms = [];
    this.spawnFx = [];

    this.leftToSpawn = 0;        // 本关还没出场的敌人
    this.spawnQueue = [];        // 敌人种类队列
    this.spawnT = 0;
    this.spawnIdx = 0;
    this.freezeT = 0;            // 计时器道具：冻结敌人
    this.shovelT = 0;            // 铁锹道具：基地钢墙
    this.itemT = 0;              // 下一个随机道具
    this.baseAlive = true;
    this.stage = 1;
    this.kills = [0, 0];
    this.moveSnd = false;
    this.pendingSpawn = 0;       // 正在出生动画中的敌人
    this.ringType = T_BRICK;     // 老鹰护栏当前材质
    this.hudT = 0;
  }
  SB.extendGame(TankGame);

  /* ---------------- 小工具 ---------------- */

  /* 子格坐标 → 世界坐标 */
  TankGame.prototype.wx = function (sx) { return FX + sx * TS; };
  TankGame.prototype.wy = function (sy) { return FY + sy * TS; };

  /* 战场局部坐标 → 世界坐标 */
  TankGame.prototype.lx = function (x) { return FX + x; };
  TankGame.prototype.ly = function (y) { return FY + y; };

  /* 缺图兜底：有图用图（origin 左上），没图用同尺寸色块 */
  TankGame.prototype.pic = function (layer, x, y, key, frame, w, h, color) {
    var node;
    if (this.has(key)) {
      node = this.scene.add.sprite(x, y, key, frame).setOrigin(0, 0);
      node.__spr = true;
    } else {
      node = this.scene.add.rectangle(x, y, w, h, color, 1).setOrigin(0, 0);
      node.__spr = false;
    }
    layer.add(node);
    return node;
  };

  /* 只有真的是 sprite 才换帧 */
  TankGame.prototype.setF = function (node, frame) {
    if (node && node.__spr) node.setFrame(frame);
  };

  /* 染色：sprite 用 setTint，兜底色块用 setFillStyle */
  TankGame.prototype.dye = function (node, color) {
    if (!node) return;
    if (node.setTint) node.setTint(color);
    else if (node.setFillStyle) node.setFillStyle(color, 1);
  };

  /* HUD 文案：盗版汉化时中文全变成方块 */
  TankGame.prototype.zh = function (s) {
    if (!this.garble) return s;
    var out = '', i;
    for (i = 0; i < s.length; i++) out += (s.charCodeAt(i) > 0x7e ? '■' : s[i]);
    return out;
  };

  /* ================================================================
   * 4. create：搭画面 → 造 HUD → 装关卡
   * ================================================================ */
  TankGame.prototype.create = function () {
    var si = this.opts.skin === undefined || this.opts.skin === null ? 0 : (this.opts.skin | 0);
    this.skin = SKINS[((si % SKINS.length) + SKINS.length) % SKINS.length];
    this.garble = this.opts.garble === true;
    this.twoP = this.opts.twoP === true;

    /* 买过《电子游戏时代》：开局送一条命，并显示秘技 */
    this.magic = this.hasMag();

    /* --- 背景：外框底色 + 战场边框 + 战场底色 --- */
    this.rect(0, 0, this.W, this.H, this.skin.outer);
    this.rect(FX - 3, FY - 3, FW + 6, FW + 6, this.skin.frame);
    this.rect(FX, FY, FW, FW, this.skin.field);

    /* --- 分层（后建的盖在前面建的上面）--- */
    this.groundL = this.group();     // 水 / 冰 / 空地
    this.terrainL = this.group();    // 砖 / 钢
    this.itemL = this.group();       // 道具
    this.baseL = this.group();       // 老鹰
    this.tankL = this.group();       // 坦克
    this.bulletL = this.group();     // 子弹
    this.grassL = this.group();      // 草丛（盖在坦克上，遮挡视野）
    this.fxL = this.group();         // 爆炸 / 出生星芒 / 护盾

    /* --- 标题（卡带在合卡目录里的假名字）--- */
    var title = this.opts.title || this.skin.label;
    this.titleTxt = this.txt(FX, 11, this.zh(title), 12, this.skin.accent);

    this.buildHud();
    this.loadStage(1);
    this.buildIntro();

    this.bgm('bgm_tank');
  };

  /* ================================================================
   * 5. 右侧竖 HUD
   * ================================================================ */
  TankGame.prototype.buildHud = function () {
    var i, x, y;

    /* HUD 底板 */
    this.rect(HX - 4, FY - 3, 116, FW + 6, this.skin.frame, 0.35, true);

    /* 剩余敌人：20 个小方块，2 列 × 10 行 */
    this.txt(HX, FY + 2, this.zh('敌'), 12, this.skin.hud);
    this.eBlocks = [];
    for (i = 0; i < 20; i++) {
      x = HX + 22 + (i % 2) * 9;
      y = FY + 4 + Math.floor(i / 2) * 9;
      this.eBlocks.push(this.rect(x, y, 7, 7, SB.C.GREY8, 1, true));
    }

    /* 关卡 */
    this.txt(HX, FY + 106, this.zh('关'), 12, this.skin.hud);
    this.stageTxt = this.txt(HX + 26, FY + 106, '1', 12, this.skin.accent);

    /* 命数（每人一行：小坦克图标 + 数量） */
    this.pIcons = []; this.pTxt = [];
    for (i = 0; i < 2; i++) {
      y = FY + 128 + i * 20;
      var ic = this.pic(this.ui, HX, y - 1, 'tank_p', 4, 16, 16, i === 0 ? SB.C.YEL3 : SB.C.GRN4);
      this.dye(ic, i === 0 ? this.skin.p1 : this.skin.p2);
      if (ic.setDisplaySize) ic.setDisplaySize(16, 16);
      this.pIcons.push(ic);
      this.pTxt.push(this.txt(HX + 20, y + 2, (i + 1) + 'P ×3', 12, this.skin.hud));
      if (i === 1 && !this.twoP) { ic.setVisible(false); this.pTxt[1].setVisible(false); }
    }

    /* 分数 */
    this.txt(HX, FY + 174, this.zh('分数'), 12, this.skin.hud);
    this.scoreTxt = this.txt(HX, FY + 190, '0', 16, this.skin.accent);

    /* 秘技提示（只有买了杂志才显示，而且真的能用） */
    if (this.magic) {
      this.txt(HX, FY + 206, this.zh('秘技'), 12, SB.C.GRN4);
      this.txt(HX - 2, FY + 220, 'SEL+B ' + this.zh('过关'), 12, SB.C.GRN4);
      this.txt(HX - 2, FY + 234, 'SEL+A ' + this.zh('满级'), 12, SB.C.GRN4);
    }

    /* 中央提示条（过关小结 / 开场卡都用它）*/
    this.msgBg = this.rect(FX + 10, FY + 70, FW - 20, 66, SB.C.INK, 0.86, true).setVisible(false);
    this.msg1 = this.txt(FX + FW / 2, FY + 78, '', 16, this.skin.accent);
    this.msg1.setOrigin(0.5, 0); this.msg1.setVisible(false);
    this.msg2 = this.txt(FX + FW / 2, FY + 104, '', 12, SB.C.GREY8);
    this.msg2.setOrigin(0.5, 0); this.msg2.setVisible(false);
    /* 第三行专门写「现在该按什么」：开场这几秒方向键是不管用的，
     * 不写出来，玩家按了没反应就会以为坦克坏了。 */
    this.msg3 = this.txt(FX + FW / 2, FY + 120, '', 12, SB.C.YEL4);
    this.msg3.setOrigin(0.5, 0); this.msg3.setVisible(false);

    this.refreshHud();
  };

  TankGame.prototype.refreshHud = function () {
    var live = this.enemies.length, i, n;
    var remain = this.leftToSpawn + live;
    for (i = 0; i < this.eBlocks.length; i++) this.eBlocks[i].setVisible(i < remain);
    this.stageTxt.setText(String(this.stage));
    this.scoreTxt.setText(String(this.score));
    for (i = 0; i < this.players.length; i++) {
      n = this.players[i];
      this.pTxt[i].setText((i + 1) + 'P ×' + Math.max(0, n.lives) + (n.level > 0 ? ' ★' + n.level : ''));
    }
  };

  TankGame.prototype.showMsg = function (a, b, c) {
    this.msgBg.setVisible(true);
    this.msg1.setText(a).setVisible(true);
    this.msg2.setText(b || '').setVisible(true);
    if (this.msg3) this.msg3.setText(c || '').setVisible(!!c);
  };
  TankGame.prototype.hideMsg = function () {
    this.msgBg.setVisible(false);
    this.msg1.setVisible(false);
    this.msg2.setVisible(false);
    if (this.msg3) this.msg3.setVisible(false);
  };

  /* ================================================================
   * 6. 关卡装载与地形
   * ================================================================ */
  TankGame.prototype.loadStage = function (n) {
    var i;
    this.stage = n;
    this.map = MAPS[(n - 1) % MAPS.length];
    this.wave = WAVES[Math.min(n - 1, WAVES.length - 1)];

    /* 清掉上一关的残留 */
    this.clearActors();

    this.buildTerrain(this.map.rows);
    this.buildBase();

    /* 敌人队列：按配比洗牌，其中 3 台是「带道具的红坦克」 */
    this.spawnQueue = [];
    for (i = 0; i < this.wave.a; i++) this.spawnQueue.push('a');
    for (i = 0; i < this.wave.b; i++) this.spawnQueue.push('b');
    for (i = 0; i < this.wave.c; i++) this.spawnQueue.push('c');
    /* 洗牌但保证前几台不要全是硬货 */
    for (i = this.spawnQueue.length - 1; i > 0; i--) {
      var j = this.rndInt(0, i), tmp = this.spawnQueue[i];
      this.spawnQueue[i] = this.spawnQueue[j]; this.spawnQueue[j] = tmp;
    }
    this.carrierSet = {};
    var picks = [this.rndInt(2, 6), this.rndInt(8, 12), this.rndInt(14, 18)];
    for (i = 0; i < picks.length; i++) this.carrierSet[picks[i]] = true;

    this.leftToSpawn = this.spawnQueue.length;
    this.spawnIdx = 0;
    this.spawnT = 900;
    this.itemT = this.rnd(9000, 15000);
    this.freezeT = 0;
    this.shovelT = 0;
    this.kills = [0, 0];

    /* 玩家：第一关才新建，之后保留命数与等级 */
    if (this.players.length === 0) this.buildPlayers();
    for (i = 0; i < this.players.length; i++) {
      if (this.players[i].lives > 0) this.respawnPlayer(this.players[i], true);
    }
    this.refreshHud();
  };

  /* 把 13×13 的字符地图铺成 26×26 的子格，并生成显示对象 */
  TankGame.prototype.buildTerrain = function (rows) {
    var sx, sy, r, c, ch, type;
    this.grid = [];
    this.cellSpr = [];
    for (sy = 0; sy < GN; sy++) {
      this.grid.push([]);
      this.cellSpr.push([]);
      for (sx = 0; sx < GN; sx++) { this.grid[sy].push(T_EMPTY); this.cellSpr[sy].push(null); }
    }

    for (r = 0; r < 13; r++) {
      var row = rows[r] || '';
      for (c = 0; c < 13; c++) {
        ch = row.charAt(c) || '.';
        type = ch === 'B' ? T_BRICK : ch === 'S' ? T_STEEL : ch === 'G' ? T_GRASS
          : ch === 'W' ? T_WATER : ch === 'I' ? T_ICE : T_EMPTY;
        if (type === T_EMPTY) continue;
        /* 一个整格 = 2×2 子格 */
        for (sy = r * 2; sy < r * 2 + 2; sy++) {
          for (sx = c * 2; sx < c * 2 + 2; sx++) this.grid[sy][sx] = type;
        }
      }
    }

    /* 出生点与老鹰周围强制清空，免得开局就被埋 */
    var i;
    for (i = 0; i < ESPAWN.length; i++) this.clearRegion(ESPAWN[i].x / TS, 0, 2, 2);
    for (i = 0; i < PSPAWN.length; i++) this.clearRegion(PSPAWN[i].x / TS, 24, 2, 2);
    this.clearRegion(BASE_SX - 1, BASE_SY - 1, BASE_SW + 2, BASE_SH + 1);

    /* 老鹰的砖墙护栏（8px 厚的 U 形，铁锹道具会把它换成钢墙）*/
    this.wallRing = [];
    for (sx = BASE_SX - 1; sx <= BASE_SX + BASE_SW; sx++) this.wallRing.push({ x: sx, y: BASE_SY - 1 });
    for (sy = BASE_SY; sy < GN; sy++) {
      this.wallRing.push({ x: BASE_SX - 1, y: sy });
      this.wallRing.push({ x: BASE_SX + BASE_SW, y: sy });
    }
    this.setRing(T_BRICK);

    /* 生成显示对象 */
    for (sy = 0; sy < GN; sy++) {
      for (sx = 0; sx < GN; sx++) this.drawCell(sx, sy);
    }
  };

  TankGame.prototype.clearRegion = function (sx, sy, w, h) {
    var x, y;
    for (y = sy; y < sy + h; y++) {
      for (x = sx; x < sx + w; x++) {
        if (this.inGrid(x, y)) this.grid[y][x] = T_EMPTY;
      }
    }
  };

  /* 铲子：整圈换成钢墙 / 换回砖墙 */
  TankGame.prototype.setRing = function (type) {
    var i, p;
    for (i = 0; i < this.wallRing.length; i++) {
      p = this.wallRing[i];
      if (!this.inGrid(p.x, p.y)) continue;
      this.grid[p.y][p.x] = type;
      if (this.cellSpr) this.drawCell(p.x, p.y);
    }
  };

  TankGame.prototype.inGrid = function (sx, sy) {
    return sx >= 0 && sy >= 0 && sx < GN && sy < GN;
  };

  /* 画一个 8px 子格。有图时从 16px 图块里 crop 出对应的四分之一，
   * 位置上把 sprite 往回挪 crop 的偏移，裁出来的那一块正好落在子格上。 */
  TankGame.prototype.drawCell = function (sx, sy) {
    var old = this.cellSpr[sy][sx];
    if (old) { old.destroy(); this.cellSpr[sy][sx] = null; }

    var type = this.grid[sy][sx];
    if (type === T_EMPTY) return;

    var layer = (type === T_BRICK || type === T_STEEL) ? this.terrainL
      : (type === T_GRASS ? this.grassL : this.groundL);
    var color = type === T_BRICK ? this.skin.cBrick : type === T_STEEL ? this.skin.cSteel
      : type === T_GRASS ? this.skin.cGrass : type === T_WATER ? this.skin.cWater : this.skin.cIce;
    var tint = type === T_BRICK ? this.skin.brick : type === T_STEEL ? this.skin.steel
      : type === T_GRASS ? this.skin.grass : type === T_WATER ? this.skin.water : this.skin.ice;

    var px = sx % 2, py = sy % 2;
    var node;
    if (this.has('tank_tiles')) {
      node = this.scene.add.sprite(this.wx(sx) - px * TS, this.wy(sy) - py * TS,
        'tank_tiles', TILE_FRAME[type]).setOrigin(0, 0);
      node.setCrop(px * TS, py * TS, TS, TS);
      node.setTint(tint);
      node.__spr = true;
    } else {
      node = this.scene.add.rectangle(this.wx(sx), this.wy(sy), TS, TS, color, 1).setOrigin(0, 0);
      node.__spr = false;
    }
    if (type === T_GRASS) node.setAlpha(0.92);
    layer.add(node);
    this.cellSpr[sy][sx] = node;
    return node;
  };

  /* 老鹰基地 */
  TankGame.prototype.buildBase = function () {
    if (this.baseNode) { this.baseNode.destroy(); this.baseNode = null; }
    this.baseAlive = true;
    this.baseNode = this.pic(this.baseL, this.lx(BASE.x), this.ly(BASE.y),
      'tank_base', 0, BASE.w, BASE.h, SB.C.YEL3);
  };

  /* ---------------- 地形查询 ---------------- */

  /* 坦克能不能踩这个子格（砖 / 钢 / 水 都挡；草和冰能过）*/
  TankGame.prototype.blockTank = function (sx, sy) {
    if (!this.inGrid(sx, sy)) return true;
    var t = this.grid[sy][sx];
    return t === T_BRICK || t === T_STEEL || t === T_WATER;
  };

  /* 子弹能不能过（水和草都能飞过去）*/
  TankGame.prototype.blockBullet = function (sx, sy) {
    if (!this.inGrid(sx, sy)) return true;
    var t = this.grid[sy][sx];
    return t === T_BRICK || t === T_STEEL;
  };

  /* 矩形（战场局部坐标）是否被地形挡住 */
  TankGame.prototype.rectBlocked = function (x, y, w, h) {
    var x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 1) / TS);
    var y0 = Math.floor(y / TS), y1 = Math.floor((y + h - 1) / TS);
    var sx, sy;
    if (x < 0 || y < 0 || x + w > FW || y + h > FW) return true;
    for (sy = y0; sy <= y1; sy++) {
      for (sx = x0; sx <= x1; sx++) if (this.blockTank(sx, sy)) return true;
    }
    return false;
  };

  /* 坦克脚下是不是冰面（取中心点判断）*/
  TankGame.prototype.onIce = function (t) {
    var sx = Math.floor((t.x + 8) / TS), sy = Math.floor((t.y + 8) / TS);
    return this.inGrid(sx, sy) && this.grid[sy][sx] === T_ICE;
  };

  /* 矩形是否压到老鹰（老鹰对坦克是实心的）*/
  TankGame.prototype.hitBaseRect = function (x, y, w, h) {
    return x < BASE.x + BASE.w && x + w > BASE.x && y < BASE.y + BASE.h && y + h > BASE.y;
  };

  /* 打掉一个子格（砖必掉；钢要 power>=2）。返回 true 表示子弹应当消失 */
  TankGame.prototype.damageCell = function (sx, sy, power) {
    if (!this.inGrid(sx, sy)) return true;
    var t = this.grid[sy][sx];
    if (t === T_BRICK) {
      this.grid[sy][sx] = T_EMPTY;
      this.drawCell(sx, sy);
      return true;
    }
    if (t === T_STEEL) {
      if (power >= 2) {
        this.grid[sy][sx] = T_EMPTY;
        this.drawCell(sx, sy);
      }
      return true;
    }
    return false;
  };

  /* ================================================================
   * 7. 坦克：生成 / 移动 / 开火
   * ================================================================ */

  /* 造一台坦克。side: 'p' 玩家 / 'e' 敌人 */
  TankGame.prototype.makeTank = function (side, kind, n, x, y, dir) {
    var conf = side === 'e' ? EKIND[kind] : null;
    var key = side === 'e' ? conf.key : 'tank_p';
    var color = side === 'e' ? conf.color : (n === 2 ? SB.C.GRN4 : SB.C.YEL3);
    var tint = side === 'e' ? this.skin.enemy : (n === 2 ? this.skin.p2 : this.skin.p1);

    var t = {
      side: side, kind: kind, n: n,
      x: x, y: y, w: 16, h: 16, dir: dir === undefined ? (side === 'e' ? 2 : 0) : dir,
      speed: side === 'e' ? conf.speed * (1 + (this.stage - 1) * 0.05) : 58,
      hp: side === 'e' ? conf.hp : 1,
      acc: 0, animT: 0, animF: 0, alive: true, slide: 0,
      fireCd: 0, level: 0, shield: 0, freezeBlink: 0, stun: 0,
      aiT: 0, fireT: this.rnd(400, 1400), carrier: false,
      lives: 3, out: false, tint: tint
    };
    t.node = this.pic(this.tankL, this.lx(x), this.ly(y), key, t.dir * 2, 16, 16, color);
    this.dye(t.node, tint);
    /* 缺图兜底时补一根炮管，方向才看得出来 */
    if (!t.node.__spr) {
      t.barrel = this.rect(this.lx(x) + 6, this.ly(y) - 2, 4, 8, SB.C.GREY8);
      this.tankL.add(t.barrel);
    }
    this.syncTank(t);
    return t;
  };

  /* 把逻辑坐标同步到显示对象 */
  TankGame.prototype.syncTank = function (t) {
    if (!t.node) return;
    t.node.setPosition(this.lx(t.x), this.ly(t.y));
    this.setF(t.node, t.dir * 2 + t.animF);
    if (t.barrel) {
      /* 炮管跟着方向摆 */
      var bx = t.x + 6, by = t.y + 6, bw = 4, bh = 4;
      if (t.dir === 0) { by = t.y - 3; bw = 4; bh = 8; }
      else if (t.dir === 2) { by = t.y + 11; bw = 4; bh = 8; }
      else if (t.dir === 1) { bx = t.x + 11; bw = 8; bh = 4; }
      else { bx = t.x - 3; bw = 8; bh = 4; }
      t.barrel.setPosition(this.lx(bx), this.ly(by));
      t.barrel.setSize(bw, bh);
    }
    /* 护盾闪一圈 */
    if (t.shieldNode) t.shieldNode.setPosition(this.lx(t.x) - 1, this.ly(t.y) - 1);
  };

  /* 两台坦克是否重叠（用于互相挡路）*/
  TankGame.prototype.tankBlocked = function (self, x, y) {
    var list = this.players.concat(this.enemies), i, o;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === self || !o.alive || o.out) continue;
      if (x < o.x + 16 && x + 16 > o.x && y < o.y + 16 && y + 16 > o.y) return true;
    }
    return false;
  };

  /* 某个位置能不能放坦克 */
  TankGame.prototype.canStand = function (t, x, y) {
    if (this.rectBlocked(x, y, 16, 16)) return false;
    if (this.baseAlive && this.hitBaseRect(x, y, 16, 16)) return false;
    if (this.tankBlocked(t, x, y)) return false;
    return true;
  };

  /* 移动一台坦克。逐像素推进，撞上就停在贴墙位置。
   * 转向时把另一根轴吸附到 8px 网格 —— 这是不卡墙角的关键。
   *
   * 返回值有三种，调用方靠它区分「走不动」的两种原因：
   *   >0  这一帧真的走了几个像素
   *    0  攒够了步数但第一步就撞墙 —— 调用方该把 acc 清掉、敌人该重新想路
   *   -1  还没攒够一个像素，什么都没发生 —— **绝对不能清 acc**
   * 玩家坦克 speed=58px/s，60fps 下每帧只攒 0.97 像素；早先这里和撞墙一样
   * 返回 0，外层 `if (moved === 0) t.acc = 0;` 每帧把它清干净，于是在流畅的
   * 机器上坦克只转头不前进（帧率越高越走不动），正是玩家抱怨的「按方向没反应」。 */
  TankGame.prototype.moveTank = function (t, dir, dt, mul) {
    if (dir !== t.dir) {
      t.dir = dir;
      /* 吸附：横向走就对齐 y，纵向走就对齐 x */
      if (dir === 1 || dir === 3) {
        var ny = Math.round(t.y / TS) * TS;
        if (ny !== t.y && this.canStand(t, t.x, ny)) t.y = ny;
      } else {
        var nx = Math.round(t.x / TS) * TS;
        if (nx !== t.x && this.canStand(t, nx, t.y)) t.x = nx;
      }
    }

    t.acc += t.speed * (mul === undefined ? 1 : mul) * dt / 1000;
    var steps = Math.floor(t.acc);
    if (steps <= 0) return -1;             // 攒着，别清
    t.acc -= steps;
    if (steps > 6) steps = 6;

    var moved = 0, i;
    for (i = 0; i < steps; i++) {
      var tx = t.x + DX[dir], ty = t.y + DY[dir];
      if (!this.canStand(t, tx, ty)) break;
      t.x = tx; t.y = ty; moved++;
    }

    /* 履带动画 */
    if (moved > 0) {
      t.animT += dt;
      if (t.animT > 90) { t.animT = 0; t.animF = t.animF ? 0 : 1; }
    }
    this.syncTank(t);
    return moved;
  };

  /* 开火 */
  TankGame.prototype.fire = function (t) {
    if (t.fireCd > 0) return false;
    var limit = t.side === 'p' ? (t.level >= 2 ? 2 : 1) : 1;
    var mine = 0, i;
    for (i = 0; i < this.bullets.length; i++) if (this.bullets[i].owner === t) mine++;
    if (mine >= limit) return false;

    var speed, power;
    if (t.side === 'p') {
      speed = t.level >= 1 ? 235 : 165;
      power = t.level >= 3 ? 2 : 1;
    } else {
      speed = EKIND[t.kind].bs;
      power = 1;
    }
    t.fireCd = t.side === 'p' ? (t.level >= 2 ? 240 : 330) : 260;

    /* 从炮口喷出来：坦克中心沿方向偏 8px */
    var cx = t.x + 8 + DX[t.dir] * 9 - 3;
    var cy = t.y + 8 + DY[t.dir] * 9 - 3;
    var b = {
      x: cx, y: cy, dir: t.dir, speed: speed, power: power,
      side: t.side, owner: t, acc: 0, dead: false
    };
    b.node = this.pic(this.bulletL, this.lx(b.x), this.ly(b.y), 'tank_bullet', t.dir, 6, 6,
      t.side === 'p' ? SB.C.WHITE : SB.C.RED5);
    this.bullets.push(b);
    this.sfx(t.side === 'p' ? 'tank_fire' : 'shoot');
    return true;
  };

  /* ================================================================
   * 8. 玩家
   * ================================================================ */
  TankGame.prototype.buildPlayers = function () {
    var i, cnt = this.twoP ? 2 : 1;
    this.players = [];
    for (i = 0; i < cnt; i++) {
      var t = this.makeTank('p', null, i + 1, PSPAWN[i].x, PSPAWN[i].y, 0);
      t.lives = this.magic ? 4 : 3;          // 秘技：买了杂志开局多一条命
      t.node.setVisible(true);
      this.players.push(t);
      this.giveShield(t, 2600);
    }
  };

  /* 复活 / 关卡开始时把玩家放回出生点 */
  TankGame.prototype.respawnPlayer = function (t, keepLevel) {
    var p = PSPAWN[t.n - 1];
    t.x = p.x; t.y = p.y; t.dir = 0; t.acc = 0; t.alive = true; t.out = false;
    t.stun = 0; t.fireCd = 0;
    if (!keepLevel) t.level = 0;
    if (t.node) t.node.setVisible(true);
    if (t.barrel) t.barrel.setVisible(true);
    this.syncTank(t);
    this.giveShield(t, 2400);
    this.spawnStar(p.x, p.y, 700);
  };

  /* 头盔 / 复活无敌：画一圈闪烁的护盾 */
  TankGame.prototype.giveShield = function (t, ms) {
    t.shield = Math.max(t.shield, ms);
    if (!t.shieldNode) {
      t.shieldNode = this.rect(this.lx(t.x) - 1, this.ly(t.y) - 1, 18, 18, SB.C.BLU5, 0.55);
      this.fxL.add(t.shieldNode);
    }
    t.shieldNode.setVisible(true);
    this.syncTank(t);
  };

  /* 玩家死一次 */
  TankGame.prototype.killPlayer = function (t) {
    if (!t.alive || t.shield > 0) return;
    t.alive = false;
    t.lives--;
    t.level = 0;
    if (t.node) t.node.setVisible(false);
    if (t.barrel) t.barrel.setVisible(false);
    if (t.shieldNode) t.shieldNode.setVisible(false);
    this.boom(t.x + 8, t.y + 8, true);
    this.sfx('player_die');
    this.shake(220, 3);
    this.refreshHud();

    if (t.lives <= 0) {
      t.out = true;
      /* 两个人都没命了才真的结束 */
      var i, anyLeft = false;
      for (i = 0; i < this.players.length; i++) if (!this.players[i].out) anyLeft = true;
      if (!anyLeft) { this.phase = 'dead'; this.gameOver(); }
      return;
    }
    t.reviveT = 1300;
  };

  /* 玩家输入 */
  TankGame.prototype.updatePlayer = function (t, dt) {
    /* 死亡等待复活 */
    if (!t.alive) {
      if (t.out) return;
      t.reviveT -= dt;
      if (t.reviveT <= 0) this.respawnPlayer(t, false);
      return;
    }

    if (t.fireCd > 0) t.fireCd -= dt;
    if (t.shield > 0) {
      t.shield -= dt;
      if (t.shieldNode) {
        t.shieldNode.setVisible(Math.floor(t.shield / 70) % 2 === 0);
        if (t.shield <= 0) t.shieldNode.setVisible(false);
      }
    }
    /* 被友军子弹打到会僵一下（当年双打互相坑的乐趣）*/
    if (t.stun > 0) {
      t.stun -= dt;
      t.node.setAlpha(Math.floor(t.stun / 90) % 2 ? 0.35 : 1);
      if (t.stun <= 0) t.node.setAlpha(1);
      return;
    }

    var pad = t.n === 2 ? this.pad2 : this.pad;
    var dir = -1;
    if (pad.up) dir = 0;
    else if (pad.down) dir = 2;
    else if (pad.left) dir = 3;
    else if (pad.right) dir = 1;

    var ice = this.onIce(t);
    if (dir >= 0) {
      var moved = this.moveTank(t, dir, dt, 1);
      t.slide = ice ? 260 : 0;              // 冰面上松手还会滑一小段
      if (moved === 0) t.acc = 0;
      if (!this.moveSnd) { SB.Audio.loop('tank_move', 0.22); this.moveSnd = true; }
    } else {
      if (t.slide > 0) {
        t.slide -= dt;
        this.moveTank(t, t.dir, dt, 0.55);
      } else {
        t.acc = 0;
      }
    }

    /* A / B 都能开火（当年很多人两个键换着按当连发）*/
    if (pad.a || pad.b) this.fire(t);
  };

  /* 秘技：买了《电子游戏时代》才生效。SELECT+B 直接过关，SELECT+A 满级送护盾。
   * 放在玩家更新之外，死着的时候也能按（当年杂志上的秘技就是这么不讲道理）。 */
  TankGame.prototype.updateCheat = function () {
    if (!this.magic || !this.pad.select) return;
    if (this.pad.just.b && this.phase === 'play') this.finishStage(true);
    if (this.pad.just.a) {
      var i, t;
      for (i = 0; i < this.players.length; i++) {
        t = this.players[i];
        if (t.out) continue;
        t.level = 3;
        if (t.alive) this.giveShield(t, 3000);
      }
      this.sfx('powerup');
      this.refreshHud();
    }
  };

  /* ================================================================
   * 9. 敌人：刷怪 + AI
   * ================================================================ */

  /* 出生星芒（tank_spawn 4 帧），闪完才真的出坦克 */
  TankGame.prototype.spawnStar = function (x, y, ms, onDone) {
    var fx = {
      x: x, y: y, t: 0, life: ms || 1000, f: 0, onDone: onDone || null
    };
    fx.node = this.pic(this.fxL, this.lx(x), this.ly(y), 'tank_spawn', 0, 16, 16, SB.C.WHITE);
    this.spawnFx.push(fx);
    return fx;
  };

  TankGame.prototype.updateSpawnFx = function (dt) {
    var i, fx;
    for (i = this.spawnFx.length - 1; i >= 0; i--) {
      fx = this.spawnFx[i];
      fx.t += dt;
      var f = Math.floor(fx.t / 90) % 4;
      if (f !== fx.f) { fx.f = f; this.setF(fx.node, f); if (!fx.node.__spr) fx.node.setAlpha(f % 2 ? 0.4 : 1); }
      if (fx.t >= fx.life) {
        fx.node.destroy();
        this.spawnFx.splice(i, 1);
        if (fx.onDone) fx.onDone();
      }
    }
  };

  /* 该不该刷下一台 */
  TankGame.prototype.updateSpawner = function (dt) {
    if (this.leftToSpawn <= 0) return;
    if (this.enemies.length + this.pendingSpawn >= 4) return;   // 同屏最多 4 台
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = this.wave.gap;

    /* 三个出生点轮着来，被占了就换一个 */
    var order = [this.spawnIdx % 3, (this.spawnIdx + 1) % 3, (this.spawnIdx + 2) % 3];
    var i, p = null;
    for (i = 0; i < order.length; i++) {
      var q = ESPAWN[order[i]];
      if (!this.tankBlocked(null, q.x, q.y)) { p = q; break; }
    }
    if (!p) { this.spawnT = 500; return; }
    this.spawnIdx++;

    var kind = this.spawnQueue[this.spawnQueue.length - this.leftToSpawn];
    var carrier = !!this.carrierSet[this.spawnQueue.length - this.leftToSpawn];
    this.leftToSpawn--;
    this.pendingSpawn++;
    var self = this;
    this.spawnStar(p.x, p.y, 950, function () {
      self.pendingSpawn--;
      if (self.phase !== 'play' && self.phase !== 'summary') return;
      var e = self.makeTank('e', kind, 0, p.x, p.y, 2);
      e.carrier = carrier;
      self.enemies.push(e);
      self.refreshHud();
    });
    this.refreshHud();
  };

  /* AI：随机转向 + 一定概率朝老鹰 / 朝玩家推进 + 见缝开枪。
   * 刻意做得「不聪明」—— 当年的敌人就是这么一惊一乍的。 */
  TankGame.prototype.enemyThink = function (e) {
    var r = Math.random(), tx, ty, want = [];

    if (r < 0.30 && this.baseAlive) {
      /* 朝老鹰推 */
      tx = BASE.x + 16; ty = BASE.y + 16;
    } else if (r < 0.66) {
      /* 朝最近的活着的玩家推 */
      var best = null, bd = 1e9, i, p, d;
      for (i = 0; i < this.players.length; i++) {
        p = this.players[i];
        if (!p.alive || p.out) continue;
        d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { tx = best.x + 8; ty = best.y + 8; }
      else { tx = BASE.x + 16; ty = BASE.y + 16; }
    } else {
      /* 纯随机 */
      want = [0, 1, 2, 3];
    }

    if (want.length === 0) {
      var ddx = tx - (e.x + 8), ddy = ty - (e.y + 8);
      /* 差得多的那根轴先走 */
      if (Math.abs(ddx) > Math.abs(ddy)) {
        want.push(ddx > 0 ? 1 : 3); want.push(ddy > 0 ? 2 : 0);
      } else {
        want.push(ddy > 0 ? 2 : 0); want.push(ddx > 0 ? 1 : 3);
      }
      want.push(this.rndInt(0, 3));
    } else {
      /* 洗一下随机方向 */
      want.sort(function () { return Math.random() - 0.5; });
    }

    /* 挑一个前面走得通的 */
    var k, d2;
    for (k = 0; k < want.length; k++) {
      d2 = want[k];
      if (this.canStand(e, e.x + DX[d2] * 2, e.y + DY[d2] * 2)) return d2;
    }
    return want[0];
  };

  TankGame.prototype.updateEnemy = function (e, dt) {
    if (e.fireCd > 0) e.fireCd -= dt;

    /* 计时器道具：全体冻结（还闪一下蓝，让人知道是被冻住了）*/
    if (this.freezeT > 0) {
      this.dye(e.node, Math.floor(this.freezeT / 160) % 2 ? SB.C.BLU5 : SB.C.BLU4);
      return;
    }
    /* 带道具的坦克身上一直闪红 */
    if (e.carrier) {
      e.freezeBlink += dt;
      this.dye(e.node, Math.floor(e.freezeBlink / 130) % 2 ? SB.C.RED4 : e.tint);
    } else if (e.node.__spr && e.node.tintTopLeft !== e.tint) {
      this.dye(e.node, e.tint);
    }

    e.aiT -= dt;
    if (e.aiT <= 0) { e.dir = this.enemyThink(e); e.aiT = this.rnd(500, 1500); }

    var moved = this.moveTank(e, e.dir, dt, 1);
    if (moved === 0) {
      /* 撞墙了立刻重新想 */
      e.acc = 0;
      e.aiT = 0;
    }

    /* 开火：定时随机开 + 与玩家/老鹰对上线就补一枪 */
    e.fireT -= dt;
    if (e.fireT <= 0) {
      this.fire(e);
      e.fireT = this.rnd(900, 2400) / (1 + (this.stage - 1) * 0.14);
    } else if (this.chance(dt / 900) && this.aimed(e)) {
      this.fire(e);
    }
  };

  /* 敌人是否正对着玩家或老鹰（粗略的一条直线判断）*/
  TankGame.prototype.aimed = function (e) {
    var i, p, list = this.players;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p.alive || p.out) continue;
      if (e.dir === 0 && p.y < e.y && Math.abs(p.x - e.x) < 14) return true;
      if (e.dir === 2 && p.y > e.y && Math.abs(p.x - e.x) < 14) return true;
      if (e.dir === 3 && p.x < e.x && Math.abs(p.y - e.y) < 14) return true;
      if (e.dir === 1 && p.x > e.x && Math.abs(p.y - e.y) < 14) return true;
    }
    if (e.dir === 2 && e.x + 8 > BASE.x - 8 && e.x + 8 < BASE.x + BASE.w + 8) return true;
    return false;
  };

  /* 打爆一台敌人 */
  TankGame.prototype.killEnemy = function (e, byPlayer) {
    e.hp--;
    if (e.hp > 0) {
      this.sfx('hit');
      /* 装甲坦克掉血时闪一下白 */
      this.dye(e.node, SB.C.WHITE);
      return;
    }
    e.alive = false;
    this.boom(e.x + 8, e.y + 8, false);
    this.sfx('explosion_s');
    var sc = EKIND[e.kind].score;
    this.addScore(sc);
    if (byPlayer && byPlayer.side === 'p') this.kills[byPlayer.n - 1]++;
    if (e.carrier) this.dropItem();
    var idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    if (e.node) e.node.destroy();
    if (e.barrel) e.barrel.destroy();
    this.refreshHud();
  };

  /* ================================================================
   * 10. 子弹
   * ================================================================ */
  TankGame.prototype.updateBullets = function (dt) {
    var i, b;
    for (i = this.bullets.length - 1; i >= 0; i--) {
      b = this.bullets[i];
      b.acc += b.speed * dt / 1000;
      var steps = Math.floor(b.acc);
      b.acc -= steps;
      if (steps > 12) steps = 12;

      var s;
      for (s = 0; s < steps && !b.dead; s++) {
        b.x += DX[b.dir];
        b.y += DY[b.dir];
        this.bulletHitTest(b);
      }
      if (b.dead) {
        if (b.node) b.node.destroy();
        this.bullets.splice(i, 1);
      } else {
        b.node.setPosition(this.lx(b.x), this.ly(b.y));
      }
    }
  };

  /* 子弹碰撞：出界 / 地形 / 老鹰 / 坦克 / 子弹对撞。
   * 碰撞核取 4×4（画面上是 6×6），让手感宽容一点。 */
  TankGame.prototype.bulletHitTest = function (b) {
    var cx = b.x + 3, cy = b.y + 3;
    var bx = cx - 2, by = cy - 2, bw = 4, bh = 4;

    /* 出界 */
    if (bx < 0 || by < 0 || bx + bw > FW || by + bh > FW) {
      this.bulletDie(b, true);
      return;
    }

    /* 老鹰 */
    if (this.baseAlive && this.hitBaseRect(bx, by, bw, bh)) {
      this.destroyBase();
      this.bulletDie(b, false);
      return;
    }

    /* 地形：先找出前沿那一排子格 */
    var x0 = Math.floor(bx / TS), x1 = Math.floor((bx + bw - 1) / TS);
    var y0 = Math.floor(by / TS), y1 = Math.floor((by + bh - 1) / TS);
    var sx, sy, hitBrick = false, hitSteel = false, any = false;
    for (sy = y0; sy <= y1; sy++) {
      for (sx = x0; sx <= x1; sx++) {
        if (!this.blockBullet(sx, sy)) continue;
        any = true;
        var t = this.grid[sy][sx];
        if (t === T_BRICK) hitBrick = true; else hitSteel = true;
      }
    }
    if (any) {
      /* 打掉整条前沿（横向 2 个子格 = 半块砖，和当年一样）*/
      for (sy = y0; sy <= y1; sy++) {
        for (sx = x0; sx <= x1; sx++) this.damageCell(sx, sy, b.power);
      }
      /* 升级弹还能顺手多啃一层，手感更爽 */
      if (b.power >= 2) {
        for (sy = y0; sy <= y1; sy++) {
          for (sx = x0; sx <= x1; sx++) this.damageCell(sx + DX[b.dir], sy + DY[b.dir], b.power);
        }
      }
      if (hitBrick) { this.sfx('brick_break'); }
      else if (hitSteel) { this.sfx(b.power >= 2 ? 'brick_break' : 'steel_hit'); }
      this.bulletDie(b, false);
      return;
    }

    /* 子弹对撞：玩家弹能打掉敌弹 */
    var i, o;
    for (i = 0; i < this.bullets.length; i++) {
      o = this.bullets[i];
      if (o === b || o.dead || o.side === b.side) continue;
      if (bx < o.x + 6 && bx + bw > o.x && by < o.y + 6 && by + bh > o.y) {
        this.bulletDie(b, false);
        this.bulletDie(o, false);
        return;
      }
    }

    /* 坦克 */
    if (b.side === 'p') {
      for (i = 0; i < this.enemies.length; i++) {
        o = this.enemies[i];
        if (!o.alive) continue;
        if (bx < o.x + 16 && bx + bw > o.x && by < o.y + 16 && by + bh > o.y) {
          this.killEnemy(o, b.owner);
          this.bulletDie(b, false);
          return;
        }
      }
      /* 双打时打到队友：僵一下（当年最容易吵架的点）*/
      for (i = 0; i < this.players.length; i++) {
        o = this.players[i];
        if (!o.alive || o === b.owner) continue;
        if (bx < o.x + 16 && bx + bw > o.x && by < o.y + 16 && by + bh > o.y) {
          if (o.shield <= 0) { o.stun = 1200; this.sfx('block'); }
          this.bulletDie(b, false);
          return;
        }
      }
    } else {
      for (i = 0; i < this.players.length; i++) {
        o = this.players[i];
        if (!o.alive || o.out) continue;
        if (bx < o.x + 16 && bx + bw > o.x && by < o.y + 16 && by + bh > o.y) {
          if (o.shield > 0) { this.sfx('block'); }
          else this.killPlayer(o);
          this.bulletDie(b, false);
          return;
        }
      }
    }
  };

  TankGame.prototype.bulletDie = function (b, edge) {
    if (b.dead) return;
    b.dead = true;
    /* 打到边界只冒个小火花 */
    this.smallSpark(b.x + 3, b.y + 3);
    if (edge) this.sfx('block');
  };

  /* 小火花：不占用 32×32 的大爆炸 */
  TankGame.prototype.smallSpark = function (x, y) {
    var n = this.rect(this.lx(x) - 3, this.ly(y) - 3, 6, 6, SB.C.WHITE, 0.9);
    this.fxL.add(n);
    this.booms.push({ node: n, t: 0, life: 90, simple: true });
  };

  /* 大爆炸（tank_boom 5 帧 32×32）*/
  TankGame.prototype.boom = function (x, y, big) {
    var node;
    if (this.has('tank_boom')) {
      node = this.scene.add.sprite(this.lx(x), this.ly(y), 'tank_boom', 0);
      node.__spr = true;
    } else {
      node = this.scene.add.rectangle(this.lx(x), this.ly(y), 24, 24, SB.C.YEL4, 0.9);
      node.__spr = false;
    }
    this.fxL.add(node);
    this.booms.push({ node: node, t: 0, life: big ? 460 : 320, simple: false });
    if (big) this.flashScreen(SB.C.RED4, 90);
  };

  TankGame.prototype.updateBooms = function (dt) {
    var i, e, f;
    for (i = this.booms.length - 1; i >= 0; i--) {
      e = this.booms[i];
      e.t += dt;
      if (!e.simple) {
        f = Math.min(4, Math.floor(e.t / (e.life / 5)));
        if (e.node.__spr) e.node.setFrame(f);
        else e.node.setAlpha(1 - e.t / e.life);
      }
      if (e.t >= e.life) { e.node.destroy(); this.booms.splice(i, 1); }
    }
  };

  /* 老鹰被打爆 —— 立刻结束，这是这个游戏最要紧的一条规则 */
  TankGame.prototype.destroyBase = function () {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    this.setF(this.baseNode, 1);
    if (!this.baseNode.__spr) this.baseNode.setFillStyle(SB.C.RED3, 1);
    this.boom(BASE.x + 16, BASE.y + 16, true);
    this.sfx('base_destroyed');
    this.sfx('explosion_l');
    this.shake(420, 5);
    this.showMsg(this.zh('老鹰没了'), this.zh('第 ') + this.stage + this.zh(' 关  得分 ') + this.score);
    this.phase = 'dead';
    this.gameOver(2200);
  };

  /* ================================================================
   * 11. 道具（item.png 帧序：0 星 1 头盔 2 手雷 3 铁锹 4 坦克 5 计时器）
   * ================================================================ */

  /* 找一个能放道具的整格：不能是水/砖/钢，也不能压到老鹰和出生点 */
  TankGame.prototype.freeCell = function () {
    var tries, cx, cy, x, y;
    for (tries = 0; tries < 60; tries++) {
      cx = this.rndInt(0, 12); cy = this.rndInt(1, 11);
      x = cx * CELL; y = cy * CELL;
      if (this.hitBaseRect(x - 8, y - 8, 32, 32)) continue;
      if (this.rectBlocked(x + 2, y + 2, 12, 12)) continue;
      return { x: x, y: y };
    }
    return { x: 96, y: 96 };
  };

  TankGame.prototype.dropItem = function (type) {
    var p = this.freeCell();
    var t = type === undefined ? this.rndInt(0, 5) : type;
    var it = { x: p.x, y: p.y, type: t, life: 22000 };
    it.node = this.pic(this.itemL, this.lx(p.x), this.ly(p.y), 'tank_item', t, 16, 16, IT_COLOR[t]);
    this.items.push(it);
    /* 同屏最多留两个，多了就把最老的挪走 */
    if (this.items.length > 2) {
      var old = this.items.shift();
      old.node.destroy();
    }
    return it;
  };

  TankGame.prototype.updateItems = function (dt) {
    var i, it, j, p;
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      it.life -= dt;
      /* 快消失时开始闪 */
      it.node.setVisible(it.life > 4000 ? true : Math.floor(it.life / 140) % 2 === 0);
      if (it.life <= 0) { it.node.destroy(); this.items.splice(i, 1); continue; }

      for (j = 0; j < this.players.length; j++) {
        p = this.players[j];
        if (!p.alive || p.out) continue;
        if (p.x < it.x + 16 && p.x + 16 > it.x && p.y < it.y + 16 && p.y + 16 > it.y) {
          this.takeItem(p, it);
          it.node.destroy();
          this.items.splice(i, 1);
          break;
        }
      }
    }

    /* 随机再掉一个 */
    this.itemT -= dt;
    if (this.itemT <= 0) {
      this.itemT = this.rnd(11000, 19000);
      if (this.items.length < 2) this.dropItem();
    }
  };

  TankGame.prototype.takeItem = function (p, it) {
    var i;
    this.addScore(500);
    this.sfx('powerup');
    switch (it.type) {
      case IT_STAR:
        /* 星星升级：1 级弹更快 / 2 级双发 / 3 级能打钢墙 */
        p.level = Math.min(3, p.level + 1);
        this.flashScreen(SB.C.YEL4, 70);
        break;
      case IT_HELMET:
        this.giveShield(p, 9000);
        break;
      case IT_GRENADE:
        /* 手雷：全屏敌人一起炸 */
        for (i = this.enemies.length - 1; i >= 0; i--) {
          this.enemies[i].hp = 1;
          this.killEnemy(this.enemies[i], p);
        }
        this.sfx('explosion_l');
        this.shake(300, 4);
        break;
      case IT_SHOVEL:
        /* 铁锹：老鹰的砖墙变钢墙，18 秒后变回来 */
        this.setRing(T_STEEL);
        this.shovelT = 18000;
        break;
      case IT_LIFE:
        p.lives++;
        this.sfx('extra_life');
        break;
      case IT_TIMER:
        /* 计时器：敌人集体定住 */
        this.freezeT = 9000;
        break;
    }
    this.refreshHud();
  };

  /* ================================================================
   * 12. 关卡流程：开场卡 → 打 → 过关小结 → 下一关 / 通关
   * ================================================================ */
  TankGame.prototype.buildIntro = function () {
    var name = this.opts.title || this.skin.label;
    /* 开场这一秒半只认 A / B（方向键要等进场才管用），所以把它写在画面上。
     * 键名现算：键盘玩家看到 X，摸屏幕的看到 A。 */
    this.showMsg(this.zh('第 ') + this.stage + this.zh(' 关'),
      this.zh(this.map.name) + '   ' + this.zh(name),
      this.zh('按 ') + SB.Input.keyName('a') + this.zh(' 开始'));
    this.phase = 'intro';
    this.phaseT = 1500;
  };

  /* 一关打完 */
  TankGame.prototype.finishStage = function (byCheat) {
    if (this.phase !== 'play') return;
    this.phase = 'summary';
    this.phaseT = 2600;
    var line = this.zh('击破 ') + this.kills[0] + this.zh(' 台');
    if (this.twoP) line = '1P ' + this.kills[0] + '   2P ' + this.kills[1];
    this.showMsg(this.zh('第 ') + this.stage + this.zh(' 关 完成'),
      line + (byCheat ? '   ' + this.zh('（秘技）') : ''));
    this.sfx('stage_clear');
    /* 清掉场上残留的子弹，别带到下一关 */
    var i;
    for (i = 0; i < this.bullets.length; i++) if (this.bullets[i].node) this.bullets[i].node.destroy();
    this.bullets = [];
  };

  /* 进下一关（或者通关）*/
  TankGame.prototype.nextStage = function () {
    if (this.stage >= MAPS.length) {
      this.showMsg(this.zh('全部关卡完成'), this.zh('得分 ') + this.score);
      this.phase = 'dead';
      this.clearGame();
      return;
    }
    this.hideMsg();
    this.loadStage(this.stage + 1);
    this.buildIntro();
  };

  /* 清掉本关所有活动对象（地形另算）*/
  TankGame.prototype.clearActors = function () {
    var i;
    for (i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].node) this.enemies[i].node.destroy();
      if (this.enemies[i].barrel) this.enemies[i].barrel.destroy();
    }
    this.enemies = [];
    for (i = 0; i < this.bullets.length; i++) if (this.bullets[i].node) this.bullets[i].node.destroy();
    this.bullets = [];
    for (i = 0; i < this.items.length; i++) if (this.items[i].node) this.items[i].node.destroy();
    this.items = [];
    for (i = 0; i < this.spawnFx.length; i++) if (this.spawnFx[i].node) this.spawnFx[i].node.destroy();
    this.spawnFx = [];
    for (i = 0; i < this.booms.length; i++) if (this.booms[i].node) this.booms[i].node.destroy();
    this.booms = [];
    this.pendingSpawn = 0;
  };

  /* ================================================================
   * 13. 主循环
   * ================================================================ */
  TankGame.prototype.update = function (dt) {
    if (this.paused) return;
    this.t += dt;

    /* 特效不管在哪个阶段都要走完，不然会僵在屏幕上 */
    this.updateBooms(dt);
    this.updateSpawnFx(dt);

    if (this.phase === 'intro') {
      this.phaseT -= dt;
      /* 开场卡按 A 可以跳过（当年谁等得住）*/
      if (this.phaseT <= 0 || this.pad.just.a || this.pad.just.b) {
        this.hideMsg();
        this.phase = 'play';
      }
      return;
    }

    if (this.phase === 'summary') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.nextStage();
      return;
    }

    if (this.phase === 'dead' || this.over || this.cleared) return;

    /* ---- 正常战斗 ---- */
    var i;
    this.updateCheat();

    /* 玩家 */
    var anyMove = false;
    for (i = 0; i < this.players.length; i++) {
      this.updatePlayer(this.players[i], dt);
      var pd = this.players[i].n === 2 ? this.pad2 : this.pad;
      if (this.players[i].alive && (pd.up || pd.down || pd.left || pd.right)) anyMove = true;
    }
    /* 履带声：有人在动才响 */
    if (!anyMove && this.moveSnd) { SB.Audio.stopLoop('tank_move'); this.moveSnd = false; }

    /* 敌人 */
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      if (this.freezeT <= 0) {
        for (i = 0; i < this.enemies.length; i++) this.dye(this.enemies[i].node, this.enemies[i].tint);
      }
    }
    for (i = this.enemies.length - 1; i >= 0; i--) this.updateEnemy(this.enemies[i], dt);

    /* 铲子倒计时：最后 3 秒砖钢来回闪，提示要变回去了 */
    if (this.shovelT > 0) {
      this.shovelT -= dt;
      if (this.shovelT <= 3000) {
        var want = Math.floor(this.shovelT / 220) % 2 ? T_BRICK : T_STEEL;
        if (this.ringType !== want) { this.ringType = want; this.setRing(want); }
      }
      if (this.shovelT <= 0) { this.ringType = T_BRICK; this.setRing(T_BRICK); }
    }

    this.updateBullets(dt);
    this.updateItems(dt);
    this.updateSpawner(dt);

    /* 本关是否清完 */
    if (this.leftToSpawn <= 0 && this.enemies.length === 0 && this.pendingSpawn <= 0
      && this.spawnFx.length === 0) {
      this.finishStage(false);
    }

    /* HUD 分数每帧刷太浪费，隔一会儿刷 */
    this.hudT = (this.hudT || 0) + dt;
    if (this.hudT > 160) { this.hudT = 0; this.refreshHud(); }
  };

  /* ================================================================
   * 14. 清理
   * ================================================================ */
  TankGame.prototype.destroy = function () {
    if (this.moveSnd) { SB.Audio.stopLoop('tank_move'); this.moveSnd = false; }
    this.clearActors();
    var i;
    for (i = 0; i < this.players.length; i++) {
      if (this.players[i].node) this.players[i].node.destroy();
      if (this.players[i].barrel) this.players[i].barrel.destroy();
      if (this.players[i].shieldNode) this.players[i].shieldNode.destroy();
    }
    this.players = [];
    this.grid = null;
    this.cellSpr = null;
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games = SB.Games || {};
  SB.Games.tank = TankGame;

})(window.SB);
