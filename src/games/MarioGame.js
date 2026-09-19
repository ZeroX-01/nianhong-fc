/* 《超级马里蘑》—— 卡带 03 里那个跳砖的红帽小人。
 *
 * 这个游戏只有一件事最重要：跳跃手感。所以物理全部手写（配置里没开物理引擎），
 * 每个数值的单位都是「像素 / 毫秒」，掉帧时轨迹也不会变形。
 *
 * 手感的四根柱子：
 *   1. 可变跳跃高度——按住 A 时用小重力上升，一松手立刻换成大重力，短跳约 30px，长跳约 76px；
 *   2. 跑步加速度与惯性——走 / 跑两档最高速，反向输入触发「刹车」（更大的减速度 + 刹车帧）；
 *   3. 起跳初速随水平速度加成，全速冲刺跳得更远（跳距约 7 格）；
 *   4. 容错——离地 90ms 内还能起跳（coyote），落地前 110ms 按的跳会被缓存（buffer），
 *      落地再给一帧压缩形变，脚下有「肉」。
 *
 * 其它遵守的约定：
 *   - 一切取图前先 has()，缺图用同尺寸色块兜底，美术没到位也能玩；
 *   - 横向滚动用 world.x = -Math.round(camX)，必须取整，否则像素会抖；
 *   - HUD 全部离边 8px 以上（显像管四周有过扫描，边上的东西看不见）；
 *   - this.stage = 当前关卡号，进第二关时 +1（盗版「未完成版」卡带靠它触发死机彩蛋）。 */
(function (SB) {
  'use strict';

  /* ================================================================
   * 一、常量
   * ================================================================ */
  var TS = 16;        // tile 边长
  var ROWS = 17;      // 17 行 = 272px，比画面高 2px，最后一行当「掉出去」的缓冲
  var GROUND_R = 13;  // 主地面顶行 → y = 208

  /* ---- 手感数值（反复自测调出来的，改动请谨慎）---- */
  var WALK = 0.092;         // 走路最高速 px/ms（≈1.5px/帧）
  var RUN = 0.158;          // 按住 B 的最高速（≈2.6px/帧）
  var ACC_G = 0.00058;      // 地面加速度
  var ACC_A = 0.00040;      // 空中加速度（比地面小 → 空中转向有分量但不轻飘）
  var SKID = 0.00135;       // 地面反向输入 = 刹车减速度
  var FRIC = 0.00052;       // 松开方向键的地面摩擦
  var OVER_DECAY = 0.00045; // 松开 B 之后从跑速收回走速的衰减（惯性来源）
  var G_HOLD = 0.00082;     // 上升且按住 A：小重力（长跳）
  var G_RISE = 0.00195;     // 上升但松了 A：大重力（短跳）
  var G_FALL = 0.00190;     // 下落
  var MAXFALL = 0.50;       // 最大下落速度
  var JUMP_V = -0.352;      // 起跳初速
  var JUMP_BONUS = -0.056;  // 满速冲刺时额外的起跳初速
  var COYOTE = 90;          // 离地后仍可起跳的宽限
  var BUFFER = 110;         // 落地前按跳的缓存

  var STOMP_V = -0.245;     // 踩敌人的弹起
  var STOMP_V_A = -0.335;   // 踩的瞬间按着 A → 弹更高
  var HURT_INV = 1500;      // 变小后的无敌时间
  var STAR_MS = 8200;       // 无敌星持续
  var DEAD_MS = 1600;       // 死亡动画时长
  var CARD_MS = 1700;       // 关卡开始的黑底卡片

  var E_WALK = 0.030;       // 蘑菇怪 / 乌龟的走速
  var E_HOP = 0.042;        // 跳跳怪走速
  var SHELL_V = 0.255;      // 龟壳被踢出去的速度
  var ITEM_V = 0.062;       // 蘑菇道具滚动速度
  var STAR_VX = 0.085;      // 星星滚动速度
  var FIRE_V = 0.235;       // 火球速度

  /* ---- 地形字符 → tiles.png 帧号（帧序严格按 docs/ART_MANIFEST.md D3）----
   * 1 地面砖 / 2 土层 / 3 问号砖 / 4 敲空砖 / 5 普通砖 / 6 硬砖
   * 7 管道口左 / 8 管道口右 / 9 管道身左 / 10 管道身右   （帧号 = 序号 - 1） */
  var FRAME = {
    'G': 0, '#': 1, 'X': 1,
    '?': 2, 'M': 2, 'S': 2, 'F': 2,
    'D': 3,
    'B': 4, 'b': 4,
    'H': 5,
    '[': 6, ']': 7, '{': 8, '}': 9,
    'L': 6, 'R': 7
  };
  /* 缺图时的兜底色 */
  var COLOR = {
    'G': SB.C.WOOD5, '#': SB.C.WOOD2, 'X': SB.C.WOOD2,
    '?': SB.C.YEL3, 'M': SB.C.YEL3, 'S': SB.C.YEL3, 'F': SB.C.YEL3,
    'D': SB.C.WOOD3,
    'B': SB.C.RED3, 'b': SB.C.RED3,
    'H': SB.C.GREY5,
    '[': SB.C.GRN3, ']': SB.C.GRN3, '{': SB.C.GRN2, '}': SB.C.GRN2,
    'L': SB.C.GRN4, 'R': SB.C.GRN4
  };
  var SOLID = 'G#X?MSFDBbH[]{}LR';       // 这些字符四面都挡
  var QBLOCK = { '?': 'coin', 'M': 'mush', 'S': 'star', 'F': 'fire' };

  /* ================================================================
   * 二、关卡地图
   * 一段一段拼出来（每段 20 列 = 320px），横向拼接后就是整关。
   * 这样比一整条 3500px 的长字符串好读，也方便单独调某一段的节奏。
   *
   * 图例：
   *   G 地面顶（下方自动填土）   X 实心岩块（天花板 / 垂柱）
   *   B 普通砖（可顶碎）         b 藏金币的砖
   *   ? 问号砖→金币  M →蘑菇  S →无敌星  F →火花
   *   H 硬砖（顶不碎）           D 敲空的砖（运行时才出现）
   *   [ ] 管口左右（可站）       { } 管身左右
   *   L R 可以按↓钻进去的管口
   *   o 悬空金币   m 蘑菇怪   k 乌龟   j 跳跳怪
   *   f 旗杆位置   c 城堡位置
   * ================================================================ */
  function seg(w, rows) { return { w: w, rows: rows }; }
  var E = '';   // 空行，省点篇幅

  /* ---------------- 第一关 1-1：晴天草地，220 列 = 3520px ---------------- */
  var L1 = [
    /* A 开场平地：先让人熟悉一下走和跑 */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '                ?   ',
      E, E, E,
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* B 砖块阵 + 第一只蘑菇怪，上方还有一排高砖 */
    seg(20, [E, E, E, E, E,
      '        BBBBBBBB    ',
      E, E, E,
      ' B?B M B            ',
      E, E,
      '            m       ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* C 两根水管：矮的那根跳上去，高的那根（LR）可以钻下去进金币房 */
    seg(20, [E, E, E, E, E, E, E, E, E, E,
      '            LR      ',
      '   []       {}      ',
      '   {}   m   {}      ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* D 悬空金币 + 第一个深坑（3 格） */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '  ooo               ',
      E, E,
      '        k           ',
      'GGGGGGGGGGGG   GGGGG',
      E, E, E]),

    /* E 金字塔台阶爬上去，上面有一排砖和一颗问号 */
    seg(20, [E, E, E, E, E,
      '           ooo      ',
      E,
      '          BB?BB     ',
      E,
      '      HH            ',
      '     HHH            ',
      '    HHHH            ',
      '   HHHHH         j  ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* F 连续两个坑，中间只有 5 格落脚地 */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '            BbB     ',
      E, E,
      '  m       k         ',
      'GGGGGG   GGGGG   GGG',
      E, E, E]),

    /* G 无敌星藏在砖里，高空一排金币 */
    seg(20, [E, E, E, E, E,
      '        oooo        ',
      E, E, E,
      '   BBSBB            ',
      E, E,
      '              mm    ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* H 对向金字塔，中间两格沟 */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '      H  H          ',
      '     HH  HH         ',
      '    HHH  HHH        ',
      '   HHHH  HHHH    j  ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* I 八格宽坑，靠两块悬空硬砖过去（这段最要跳跃精度） */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '     oo   oo        ',
      '     HH   HH        ',
      E,
      '            k       ',
      'GGGG        GGGGGGGG',
      E, E, E]),

    /* J 平地，三只蘑菇怪一排 —— 踢个龟壳过去能连撞 */
    seg(20, [E, E, E, E, E, E, E, E, E,
      '   BBBBBB           ',
      E, E,
      '       k  m m m     ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* K 终点：阶梯 → 旗杆 → 城堡 */
    seg(20, [E, E, E, E, E, E, E, E,
      '      H             ',
      '     HH             ',
      '    HHH             ',
      '   HHHH             ',
      '  HHHHH   f    c    ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E])
  ];

  /* ---------------- 第二关 1-2：地下，200 列 = 3200px ----------------
   * 换配色（tile 染蓝、背景全黑）＋ 加天花板，压迫感立刻不一样。 */
  var L2 = [
    /* A 入口：低天花板，先给点金币 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '          ?  o o    ',
      E, E,
      '                m   ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* B 砖顶走廊 + 一个坑 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E,
      '   BBBBB            ',
      E,
      '   ooooo    BbB     ',
      E, E,
      '        k           ',
      'GGGGGGGGGGG   GGGGGG',
      E, E, E]),

    /* C 地下的水管：这根也能钻，进去还是金币房 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '            HHH     ',
      '      LR            ',
      '  []  {}            ',
      '  {}  {}   m        ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* D 天花板垂下来两根柱子，得低头钻过去 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      '    X      X        ',
      '    X      X        ',
      '    X      X        ',
      '    X      X        ',
      E, E, E, E,
      '        k     j     ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* E 两个五格坑，各架一块硬砖台 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '   ooo      ooo     ',
      '   HHH      HHH     ',
      E,
      '                  m ',
      'GGG     GGGG     GGG',
      E, E, E]),

    /* F 金币走廊：顶上一长排砖，底下四只怪 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E,
      '    BBBBBBBB        ',
      E,
      '    oooooooo        ',
      E, E, E,
      '   k    m  m   m    ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* G 管道林 + 一个蘑菇砖 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '            M       ',
      '     []      []     ',
      '     {}      {}     ',
      '     {}   j  {}     ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* H 单格跳台，踩空就掉下去 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '     o  o           ',
      '     H  H           ',
      E,
      '               m m  ',
      'GGGG       GGGGGGGGG',
      E, E, E]),

    /* I 火花砖 + 一群怪，拿到火球就好办了 */
    seg(20, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXX',
      E, E, E, E, E,
      '   BFB    BBB       ',
      E, E,
      '  k   m  j    m     ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E]),

    /* J 出洞见天日：阶梯 → 旗杆 → 城堡 */
    seg(20, [E, E, E,
      'XXXXXXXXXX          ',
      E, E, E, E,
      '      H             ',
      '     HH             ',
      '    HHH             ',
      '   HHHH             ',
      '  HHHHH   f    c    ',
      'GGGGGGGGGGGGGGGGGGGG',
      E, E, E])
  ];

  /* ---------------- 地下金币房（钻管道进来的彩蛋房，24 列 = 384px） ---------------- */
  var BONUS = [
    seg(24, [E, E, E,
      'XXXXXXXXXXXXXXXXXXXXXXXX',
      E, E, E,
      '  oooooooooo            ',
      E,
      '  oooooooooo            ',
      E,
      '                  LR    ',
      '                  {}    ',
      'GGGGGGGGGGGGGGGGGGGGGGGG',
      E, E, E])
  ];

  /* 关卡表。tint 非 0 时给所有 tile 染色 = 换配色 */
  var LEVELS = [
    {
      name: '1-1', segs: L1, time: 300, sky: true, tint: 0,
      bgColor: SB.C.BLU4, warpTo: 'bonus', warpBack: 4,
      clouds: [40, 300, 560, 900, 1320, 1760, 2180, 2600, 3040, 3380],
      bushes: [130, 420, 760, 1180, 1620, 2040, 2500, 2960, 3260]
    },
    {
      /* 1-2 是地下关：一片黑 + 蓝灰砖，不要云和灌木（洞里飘云就出戏了） */
      name: '1-2', segs: L2, time: 320, sky: false, tint: 0x6f9fd8,
      bgColor: SB.C.GREY1, warpTo: 'bonus', warpBack: 4,
      clouds: [], bushes: []
    }
  ];

  /* ================================================================
   * 三、构造与生命周期
   * ================================================================ */
  function MarioGame(host, opts) {
    SB.GameBase.call(this, host, opts);

    this.phase = 'card';       // card 关卡卡片 / play 正常玩 / dying 死亡 / flag 落旗 / warp 钻管
    this.phaseT = 0;
    this.camX = 0;
    this.scn = null;           // 当前场景（关卡或金币房）
    this.stack = [];           // 钻管道时把主关卡压栈
    this.p = null;             // 玩家
    this.timeLeft = 300;
    this.tickAcc = 0;
    this.chain = 0;            // 连续踩踏 / 连撞的连击数
    this.infJump = false;      // 秘技：无限跳
    this.cheatBuf = [];
    this.selCount = 0;
    this.selT = 0;
    this.tipT = 0;
    this.warpUsed = {};        // 每根管道只给一次「彩蛋加分」

    /* 轮流玩：每个玩家自己的命、分、关卡进度 */
    var n = this.opts.twoP ? 2 : 1;
    this.pls = [];
    for (var i = 0; i < n; i++) {
      this.pls.push({ idx: i, lives: 3, score: 0, coins: 0, level: 0, big: false, fire: false, out: false });
    }
    this.cur = 0;
  }
  SB.extendGame(MarioGame);
  var P = MarioGame.prototype;

  P.create = function () {
    this.buildAnims();
    this.buildHud();
    this.buildPlayer();
    this.loadLevel(this.st().level);
    this.bgm('bgm_mario');
  };

  P.st = function () { return this.pls[this.cur]; };

  P.buildAnims = function () {
    if (this.has('mario_coin')) this.anim('mr_coin', 'mario_coin', [0, 1, 2, 3], 9);
    if (this.has('mario_flag')) this.anim('mr_flag', 'mario_flag', [0, 1], 4);
  };

  /* ================================================================
   * 四、地图解析与铺 tile
   * ================================================================ */
  /* 把 segs 拼成一张 ROWS×cols 的字符网格，并抽出敌人/旗杆/城堡的标记 */
  P.parse = function (def) {
    var rows = [], r, c, i, s, line, cols = 0;
    for (r = 0; r < ROWS; r++) rows[r] = [];

    for (i = 0; i < def.segs.length; i++) {
      s = def.segs[i];
      for (r = 0; r < ROWS; r++) {
        line = s.rows[r] || '';
        for (c = 0; c < s.w; c++) rows[r].push(c < line.length ? line.charAt(c) : ' ');
      }
      cols += s.w;
    }

    var lv = { cols: cols, w: cols * TS, grid: rows, def: def, marks: [], coins: [], flagX: 0, castleX: 0 };

    /* 地面下方自动填土：省得每段都手写三行 '###' */
    for (c = 0; c < cols; c++) {
      for (r = 0; r < ROWS; r++) {
        if (rows[r][c] === 'G') {
          for (var rr = r + 1; rr < ROWS; rr++) if (rows[rr][c] === ' ') rows[rr][c] = '#';
          break;
        }
      }
    }

    /* 把「非地形」的字符挑出来，网格里清成空 */
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < cols; c++) {
        var ch = rows[r][c];
        if (ch === 'm' || ch === 'k' || ch === 'j') {
          lv.marks.push({ x: c * TS + 8, y: (r + 1) * TS, type: ch, done: false });
          rows[r][c] = ' ';
        } else if (ch === 'o') {
          lv.coins.push({ x: c * TS + 8, y: r * TS + 8 });
          rows[r][c] = ' ';
        } else if (ch === 'f') {
          lv.flagX = c * TS + 8; rows[r][c] = ' ';
        } else if (ch === 'c') {
          lv.castleX = c * TS + 8; rows[r][c] = ' ';
        }
      }
    }
    return lv;
  };

  /* 一个「场景」= 一整套图层 + 实体数组。主关卡和金币房各是一个场景，
   * 钻管道时主关卡整套藏起来压栈，回来时原样恢复（砖块、金币、怪都还在原地）。 */
  P.buildScene = function (def, isBonus) {
    var lv = this.parse(def);
    var scn = {
      lv: lv, bonus: !!isBonus,
      bgL: this.group(), tileL: this.group(), objL: this.group(), fxL: this.group(),
      bgs: [], tiles: [], enemies: [], items: [], coins: [], fires: [], fx: [],
      flag: null, flagY: 0
    };
    scn.layers = [scn.bgL, scn.tileL, scn.objL, scn.fxL];

    this.buildBg(scn);
    this.buildTiles(scn);
    this.buildCoins(scn);
    this.buildFlag(scn);
    /* 玩家永远压在最上层 */
    if (this.p && this.p.spr) this.world.bringToTop(this.p.spr);
    return scn;
  };

  P.buildBg = function (scn) {
    var def = scn.lv.def, i, o;
    /* 底色：一块跟着镜头走的纯色，保证任何缺图情况下都不会露黑边 */
    scn.base = this.rect(0, 0, this.W, this.H, def.bgColor === undefined ? SB.C.BLU4 : def.bgColor, 1);
    scn.bgL.add(scn.base);

    if (def.sky && this.has('mario_bg')) {
      for (i = 0; i < 3; i++) {
        o = this.img(0, 0, 'mario_bg');
        o.setOrigin(0, 0);
        scn.bgL.add(o);
        scn.bgs.push(o);
      }
    } else if (!def.sky) {
      /* 地下关：真机就是一片黑，只糊一层很淡的规则砖缝当墙面。
       * 一整面墙画在一个 graphics 里，别生成上百个色块对象。 */
      var wall = this.gfx();
      wall.fillStyle(SB.C.GREY2, 0.16);
      var rr, wx, wcols = Math.ceil(scn.lv.w / 32) + 1;
      for (rr = 4; rr < GROUND_R; rr++) {
        for (i = 0; i < wcols; i++) {
          wx = i * 32 + (rr % 2) * 16;
          wall.fillRect(wx + 1, rr * TS + 1, 30, 14);
        }
      }
      scn.bgL.add(wall);
    }

    /* 白云与灌木：装饰而已，缺图就不画（不做色块，免得像 bug） */
    var cl = scn.lv.def.clouds || [], bs = scn.lv.def.bushes || [];
    for (i = 0; i < cl.length; i++) {
      if (!this.has('mario_cloud')) break;
      o = this.img(cl[i], 34 + (i % 3) * 16, 'mario_cloud');
      o.setOrigin(0, 0); scn.bgL.add(o);
    }
    for (i = 0; i < bs.length; i++) {
      if (!this.has('mario_bush')) break;
      o = this.img(bs[i], GROUND_R * TS, 'mario_bush');
      o.setOrigin(0, 1); scn.bgL.add(o);
    }
    /* 城堡 */
    if (scn.lv.castleX && this.has('mario_castle')) {
      o = this.img(scn.lv.castleX, GROUND_R * TS, 'mario_castle');
      o.setOrigin(0.5, 1); scn.bgL.add(o);
    } else if (scn.lv.castleX) {
      o = this.rect(scn.lv.castleX - 36, GROUND_R * TS - 72, 72, 72, SB.C.RED2, 1);
      scn.bgL.add(o);
    }
  };

  P.buildTiles = function (scn) {
    var lv = scn.lv, r, c;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < lv.cols; c++) {
        if (lv.grid[r][c] !== ' ') this.mkTile(scn, c, r, lv.grid[r][c]);
      }
    }
  };

  /* 铺一块 tile（有图用图，没图用色块） */
  P.mkTile = function (scn, c, r, ch) {
    var o, tint = scn.lv.def.tint;
    if (this.has('mario_tiles')) {
      o = this.spr(c * TS + 8, r * TS + 8, 'mario_tiles', FRAME[ch] === undefined ? 0 : FRAME[ch]);
      if (tint) o.setTint(tint);
    } else {
      o = this.rect(c * TS, r * TS, TS, TS, COLOR[ch] === undefined ? SB.C.GREY5 : COLOR[ch], 1);
      o.__fb = true;
    }
    scn.tileL.add(o);
    scn.tiles[r * scn.lv.cols + c] = o;
    return o;
  };

  P.buildCoins = function (scn) {
    var i, m, o;
    for (i = 0; i < scn.lv.coins.length; i++) {
      m = scn.lv.coins[i];
      o = this.mkSpr(scn.objL, m.x, m.y + 8, 'mario_coin', 0, 12, 16, SB.C.YEL3);
      if (!o.__fb && this.scene.anims.exists('mr_coin')) o.play('mr_coin');
      scn.coins.push({ x: m.x, y: m.y + 8, spr: o, got: false });
    }
  };

  P.buildFlag = function (scn) {
    if (!scn.lv.flagX) return;
    var x = scn.lv.flagX;
    /* 旗杆：一根细长色块（美术里没有单独的杆子图，画出来更省） */
    var pole = this.rect(x - 1, 96, 2, GROUND_R * TS - 96, SB.C.GREY7, 1);
    scn.bgL.add(pole);
    var knob = this.rect(x - 3, 92, 6, 6, SB.C.GRN4, 1);
    scn.bgL.add(knob);
    scn.flagY = 104;
    scn.flag = this.mkSpr(scn.objL, x - 8, scn.flagY + 14, 'mario_flag', 0, 12, 12, SB.C.RED4);
    if (!scn.flag.__fb && this.scene.anims.exists('mr_flag')) scn.flag.play('mr_flag');
  };

  /* ---------------- tile 查询 ---------------- */
  P.chAt = function (c, r) {
    var lv = this.scn.lv;
    if (c < 0 || c >= lv.cols || r < 0 || r >= ROWS) return ' ';
    return lv.grid[r][c];
  };
  P.solidAt = function (c, r) {
    var ch = this.chAt(c, r);
    return ch !== ' ' && SOLID.indexOf(ch) >= 0;
  };
  P.setCh = function (c, r, ch) {
    var lv = this.scn.lv;
    if (c < 0 || c >= lv.cols || r < 0 || r >= ROWS) return;
    lv.grid[r][c] = ch;
    var i = r * lv.cols + c, o = this.scn.tiles[i];
    if (o) { o.destroy(); this.scn.tiles[i] = null; }
    if (ch !== ' ') this.mkTile(this.scn, c, r, ch);
  };

  /* ---------------- 缺图兜底的精灵（原点 = 底部中心） ---------------- */
  P.mkSpr = function (layer, x, y, key, frame, w, h, color) {
    var o;
    if (this.has(key)) {
      o = this.spr(x, y, key, frame || 0);
    } else {
      o = this.rect(0, 0, w, h, color, 1);
      o.__fb = true;
    }
    o.setOrigin(0.5, 1);
    o.setPosition(Math.round(x), Math.round(y));
    if (layer) layer.add(o);
    return o;
  };
  P.setFr = function (o, n) { if (o && !o.__fb && o.setFrame) o.setFrame(n); };
  P.setFlip = function (o, f) { if (o && !o.__fb && o.setFlipX) o.setFlipX(f); };
  P.tintOf = function (o, c) {
    if (!o) return;
    if (o.__fb) { if (o.setFillStyle) o.setFillStyle(c, 1); }
    else if (c === null) { o.clearTint(); }
    else o.setTint(c);
  };
  P.boxOf_ = function (e) { return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; };

  /* ================================================================
   * 五、关卡装载 / 切关 / 钻管道
   * ================================================================ */
  P.loadLevel = function (idx) {
    this.disposeScene();
    while (this.stack.length) { this.disposeScene(this.stack.pop()); }

    var def = LEVELS[idx] || LEVELS[0];
    this.scn = this.buildScene(def, false);
    this.stage = idx + 1;                 // ← 盗版「未完成版」卡带就是盯着这个值死机的
    this.timeLeft = def.time;
    this.tickAcc = 0;
    this.camX = 0;
    this.world.x = 0;
    this.chain = 0;
    this.lives = this.st().lives;

    this.resetPlayer(40, GROUND_R * TS);
    this.phase = 'card';
    this.phaseT = 0;
    this.showCard(def.name);
    this.refreshHud();
  };

  P.disposeScene = function (scn) {
    scn = scn || this.scn;
    if (!scn) return;
    for (var i = 0; i < scn.layers.length; i++) scn.layers[i].destroy();
    if (scn === this.scn) this.scn = null;
  };

  P.showCard = function (name) {
    if (this.card) this.card.destroy();
    this.card = this.group(true);
    var bg = this.rect(0, 0, this.W, this.H, SB.C.INK, 1, true);
    var t1 = this.txt(this.W / 2, 104, this.cn('世界') + '  ' + name, 16, SB.C.WHITE);
    t1.setOrigin(0.5, 0);
    var t2 = this.txt(this.W / 2, 140, this.cn('剩') + ' × ' + Math.max(0, this.st().lives), 12, SB.C.GREY8);
    t2.setOrigin(0.5, 0);
    var t3 = this.txt(this.W / 2, 168, this.opts.twoP ? ((this.cur + 1) + 'P  ' + this.cn('上场')) : '', 12, SB.C.YEL3);
    t3.setOrigin(0.5, 0);
    this.card.add([bg, t1, t2, t3]);
    /* 小人站在卡片中间，像当年那样 */
    var hero = this.mkSpr(null, this.W / 2, 220, this.st().big ? 'mario_hero_big' : 'mario_hero', 0, 12, 24, SB.C.RED4);
    this.ui.add(hero);
    this.card.add(hero);
  };

  P.hideCard = function () {
    if (this.card) { this.card.destroy(); this.card = null; }
  };

  P.nextLevel = function () {
    var s = this.st();
    if (s.level + 1 >= LEVELS.length) { this.clearGame(); return; }
    s.level++;
    this.loadLevel(s.level);              // loadLevel 里会把 this.stage 设成新关号
  };

  /* ---- 钻下水管进金币房 ---- */
  P.enterPipe = function () {
    if (this.scn.bonus) { this.exitPipe(); return; }
    this.sfx('powerup');
    this.warpFrom = { level: this.st().level, x: this.p.x, camX: this.camX };
    var main = this.scn;
    for (var i = 0; i < main.layers.length; i++) main.layers[i].setVisible(false);
    this.stack.push(main);

    /* 金币房是一套独立图层，主关卡整套藏起来即可，回来时砖块金币都还在原样 */
    this.scn = this.buildScene({
      name: '金币房', segs: BONUS, time: 0, sky: false,
      tint: 0xd8b45a, bgColor: SB.C.INK, clouds: [], bushes: []
    }, true);
    this.camX = 0;
    this.resetPlayer(48, GROUND_R * TS, true);
    this.flashScreen(SB.C.INK, 200);
    this.phase = 'play';
  };

  /* ---- 从金币房出来（站在出口管上按↓） ---- */
  P.exitPipe = function () {
    if (!this.stack.length) return;
    this.sfx('powerup');
    this.disposeScene();
    this.scn = this.stack.pop();
    for (var i = 0; i < this.scn.layers.length; i++) this.scn.layers[i].setVisible(true);
    this.world.bringToTop(this.p.spr);

    /* 出口落在原来那根管子右边几格，算一次「进去出来」的彩蛋加分 */
    var key = this.st().level + ':' + Math.round(this.warpFrom.x);
    if (!this.warpUsed[key]) {
      this.warpUsed[key] = true;
      this.addScore(1000);
      this.popText(this.warpFrom.x + 48, GROUND_R * TS - 24, '+1000');
    }
    this.resetPlayer(this.warpFrom.x + 48, GROUND_R * TS, true);
    this.camX = this.warpFrom.camX;
    this.flashScreen(SB.C.INK, 200);
    this.refreshHud();
  };

  /* ================================================================
   * 六、玩家
   * ================================================================ */
  P.buildPlayer = function () {
    this.p = {
      x: 40, y: GROUND_R * TS, vx: 0, vy: 0, w: 12, h: 24,
      face: 1, onGround: true, walkT: 0, skid: false,
      big: false, fire: false, inv: 0, star: 0,
      coyote: 0, buffer: 0, hold: false, land: 0,
      dead: false, deadT: 0, fireT: 0, spr: null, ctrl: true
    };
    this.setHeroSpr();
  };

  /* 大小切换要换纹理（16×24 ↔ 16×32），缺图时换色块尺寸 */
  P.setHeroSpr = function () {
    var p = this.p;
    if (p.spr) p.spr.destroy();
    var key = p.big ? 'mario_hero_big' : 'mario_hero';
    p.spr = this.mkSpr(null, p.x, p.y, key, 0, 12, p.big ? 30 : 24, SB.C.RED4);
    this.world.add(p.spr);
    this.world.bringToTop(p.spr);
    p.h = p.big ? 30 : 24;
  };

  P.resetPlayer = function (x, y, keepPower) {
    var p = this.p, s = this.st();
    if (!keepPower) { p.big = s.big = false; p.fire = s.fire = false; }
    else { p.big = s.big; p.fire = s.fire; }
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.face = 1;
    p.onGround = true; p.dead = false; p.deadT = 0; p.inv = 0; p.star = 0;
    p.coyote = 0; p.buffer = 0; p.hold = false; p.land = 0; p.ctrl = true;
    this.setHeroSpr();
  };

  /* 帧序严格按 ART_MANIFEST：0 站 / 1-3 跑 / 4 跳 / 5 刹车 / 6 死 */
  P.heroFrame = function (p) {
    if (p.dead) return 6;
    if (!p.onGround) return 4;
    if (p.skid) return 5;
    if (Math.abs(p.vx) > 0.012) {
      /* 跑得越快换帧越快，这是「跑起来了」的关键视觉反馈 */
      var per = 150 - Math.min(90, Math.abs(p.vx) / RUN * 90);
      return 1 + (Math.floor(p.walkT / per) % 3);
    }
    return 0;
  };

  P.updatePlayer = function (dt) {
    var p = this.p;
    var pad = this.opts.twoP ? this.p_(this.cur + 1) : this.pad;

    /* ---- 死亡动画：先弹起来一下，再直直掉下去 ---- */
    if (p.dead) {
      p.deadT += dt;
      if (p.deadT > 420) { p.vy += G_FALL * dt; p.y += p.vy * dt; }
      this.setFr(p.spr, 6);
      p.spr.setPosition(Math.round(p.x), Math.round(p.y));
      return;
    }

    /* ---- 计时器 / 状态 ---- */
    if (p.inv > 0) {
      p.inv -= dt;
      p.spr.setVisible(Math.floor(p.inv / 60) % 2 === 0);
      if (p.inv <= 0) p.spr.setVisible(true);
    }
    if (p.star > 0) {
      p.star -= dt;
      /* 无敌星：像真机那样在几个色相之间硬切 */
      var pal = [SB.C.WHITE, SB.C.YEL3, SB.C.GRN4, SB.C.BLU5];
      this.tintOf(p.spr, pal[Math.floor(this.t / 70) % 4]);
      if (p.star <= 0) this.tintOf(p.spr, null);
    }
    if (p.fireT > 0) p.fireT -= dt;
    if (p.land > 0) p.land -= dt;

    var canCtrl = p.ctrl && this.phase === 'play';
    var dir = canCtrl ? pad.h : 0;
    var running = canCtrl && pad.b;

    /* ---- 水平：加速度 + 惯性 + 刹车 ---- */
    var maxSpd = running ? RUN : WALK;
    p.skid = false;
    if (dir !== 0) {
      p.face = dir;
      var acc;
      if (dir * p.vx < 0) {
        /* 反向输入：地面是刹车（带刹车帧），空中略强于普通加速（空中能转向但要一点时间） */
        acc = p.onGround ? SKID : ACC_A * 1.5;
        if (p.onGround && Math.abs(p.vx) > 0.05) p.skid = true;
      } else {
        acc = p.onGround ? ACC_G : ACC_A;
      }
      /* 只有还没到上限才继续加速，所以最高速是硬上限，不会越跑越快 */
      if (dir * p.vx < maxSpd) p.vx += dir * acc * dt;
    } else if (p.onGround) {
      var fr = FRIC * dt;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - fr);
      else p.vx = Math.min(0, p.vx + fr);
    }
    /* 超速（松开 B 之后）不瞬间掉到走路速度，而是慢慢收 = 惯性 */
    if (Math.abs(p.vx) > maxSpd) {
      var sg = p.vx < 0 ? -1 : 1;
      var mag = Math.abs(p.vx) - OVER_DECAY * dt;
      p.vx = sg * (mag < maxSpd ? maxSpd : mag);
    }
    if (Math.abs(p.vx) > 0.012) p.walkT += dt; else p.walkT = 0;

    /* ---- 跳跃：coyote + buffer + 可变高度 ---- */
    if (canCtrl && pad.just.a) p.buffer = BUFFER;
    if (p.buffer > 0) p.buffer -= dt;
    if (p.onGround) p.coyote = COYOTE; else if (p.coyote > 0) p.coyote -= dt;

    if (p.buffer > 0 && (p.coyote > 0 || this.infJump) && canCtrl) {
      var boost = Math.min(1, Math.abs(p.vx) / RUN);
      p.vy = JUMP_V + JUMP_BONUS * boost;
      p.onGround = false; p.coyote = 0; p.buffer = 0; p.hold = true;
      this.sfx('jump');
    }
    if (!(canCtrl && pad.a)) p.hold = false;

    /* ---- 重力：上升按住 A 用小重力，其余用大重力 ---- */
    var g = p.vy < 0 ? (p.hold ? G_HOLD : G_RISE) : G_FALL;
    p.vy += g * dt;
    if (p.vy > MAXFALL) p.vy = MAXFALL;

    /* ---- 移动与地形碰撞（先横后纵） ---- */
    var wasAir = !p.onGround;
    this.moveX(p, p.vx * dt);
    this.moveY(p, p.vy * dt, true);
    if (wasAir && p.onGround) {
      /* 落地缓冲：压一下再弹回来，脚下就有重量了 */
      p.land = 120;
      this.chain = 0;
    }

    /* ---- 左右边界：镜头只往前推，左边是一道看不见的墙 ---- */
    var lo = this.camX + 6, hi = this.scn.lv.w - 8;
    if (p.x < lo) { p.x = lo; if (p.vx < 0) p.vx = 0; }
    if (p.x > hi) { p.x = hi; if (p.vx > 0) p.vx = 0; }

    /* ---- 掉出画面 = 死 ---- */
    if (p.y > ROWS * TS + 10) { this.die(); return; }

    /* ---- 站在可钻的管口上按↓ ---- */
    if (canCtrl && p.onGround && pad.down) {
      var cc = Math.floor(p.x / TS), rr = Math.floor(p.y / TS);
      var ch = this.chAt(cc, rr);
      if (ch === 'L' || ch === 'R') { this.enterPipe(); return; }
    }

    /* ---- 火球（有火花时按 B 发射；按住 B 仍然是跑） ---- */
    if (canCtrl && p.fire && pad.just.b && p.fireT <= 0 && this.scn.fires.length < 2) {
      this.shootFire();
      p.fireT = 260;
    }

    /* ---- 表现 ---- */
    this.setFr(p.spr, this.heroFrame(p));
    this.setFlip(p.spr, p.face < 0);
    var sq = p.land > 0 ? p.land / 120 : 0;
    p.spr.setScale(1 + 0.16 * sq, 1 - 0.18 * sq);
    p.spr.setPosition(Math.round(p.x), Math.round(p.y));
  };

  P.p_ = function (n) { return n === 2 ? this.pad2 : this.pad; };

  /* ---------------- 横向碰撞 ---------------- */
  P.moveX = function (e, dx) {
    if (!dx) return;
    e.x += dx;
    var b = this.boxOf_(e);
    var r0 = Math.floor((b.y + 1) / TS), r1 = Math.floor((b.y + b.h - 1) / TS), r, c;
    if (dx > 0) {
      c = Math.floor((b.x + b.w - 1) / TS);
      for (r = r0; r <= r1; r++) {
        if (this.solidAt(c, r)) {
          e.x = c * TS - e.w / 2 - 0.01; e.vx = 0;
          e.bumpWall = 1; e.bumpC = c; e.bumpR = r; return;
        }
      }
    } else {
      c = Math.floor(b.x / TS);
      for (r = r0; r <= r1; r++) {
        if (this.solidAt(c, r)) {
          e.x = (c + 1) * TS + e.w / 2 + 0.01; e.vx = 0;
          e.bumpWall = -1; e.bumpC = c; e.bumpR = r; return;
        }
      }
    }
  };

  /* ---------------- 纵向碰撞（顺手处理顶砖块） ---------------- */
  P.moveY = function (e, dy, isPlayer) {
    var prev = e.y;
    e.y += dy;
    var b = this.boxOf_(e);
    var c0 = Math.floor((b.x + 1) / TS), c1 = Math.floor((b.x + b.w - 2) / TS), r, c;

    if (dy >= 0) {
      /* 下落：从上一帧脚底所在行扫到这一帧，速度再快也不会穿地 */
      var rs = Math.floor(prev / TS), re = Math.floor((e.y - 0.01) / TS);
      for (r = rs; r <= re; r++) {
        for (c = c0; c <= c1; c++) {
          if (this.solidAt(c, r)) { e.y = r * TS; e.vy = 0; e.onGround = true; return; }
        }
      }
      e.onGround = false;
    } else {
      /* 上升：被实心块顶头。玩家顶头时要触发砖块效果 */
      var rh = Math.floor((e.y - e.h) / TS);
      for (c = c0; c <= c1; c++) {
        if (this.solidAt(c, rh)) {
          e.y = (rh + 1) * TS + e.h; e.vy = 0;
          if (isPlayer) {
            /* 用离身体中线最近的那一列，避免同时顶两块 */
            var best = c, bd = Math.abs((c + 0.5) * TS - e.x), cc;
            for (cc = c0; cc <= c1; cc++) {
              if (this.solidAt(cc, rh) && Math.abs((cc + 0.5) * TS - e.x) < bd) {
                bd = Math.abs((cc + 0.5) * TS - e.x); best = cc;
              }
            }
            this.bumpTile(best, rh);
          }
          return;
        }
      }
      e.onGround = false;
    }
  };

  /* ================================================================
   * 七、顶砖块 / 出道具 / 金币
   * ================================================================ */
  P.bumpTile = function (c, r) {
    var ch = this.chAt(c, r);
    if (ch === ' ') return;

    if (QBLOCK[ch]) {
      /* 问号砖：吐东西，然后变成敲空的砖 */
      this.setCh(c, r, 'D');
      this.tileBump(c, r);
      this.spawnFromBlock(c, r, QBLOCK[ch]);
      return;
    }
    if (ch === 'b') {
      /* 藏金币的砖：出一枚金币，砖变敲空 */
      this.setCh(c, r, 'D');
      this.tileBump(c, r);
      this.spawnFromBlock(c, r, 'coin');
      return;
    }
    if (ch === 'B') {
      this.breakBrick(c, r);
      return;
    }
    /* 硬砖 / 地面 / 管道：顶不动，只有「咚」的一下 */
    this.sfx('steel_hit');
    this.tileBump(c, r);
  };

  /* 被顶的砖往上弹一下（自己在 update 里插值，不用 tween，避免销毁时机问题） */
  P.tileBump = function (c, r) {
    var o = this.scn.tiles[r * this.scn.lv.cols + c];
    if (!o) return;
    this.scn.fx.push({ kind: 'bump', spr: o, t: 0, life: 170, y0: o.y });
  };

  P.breakBrick = function (c, r) {
    this.setCh(c, r, ' ');
    this.sfx('brick_break');
    this.addScore(50);
    /* 四块碎片飞出去 */
    var i, dx, dy, o;
    for (i = 0; i < 4; i++) {
      dx = (i % 2 === 0 ? -1 : 1) * 0.055;
      dy = (i < 2 ? -0.30 : -0.19);
      o = this.rect(0, 0, 6, 6, this.scn.lv.def.tint ? SB.C.BLU5 : SB.C.WOOD5, 1);
      o.setOrigin(0.5, 0.5);
      this.scn.fxL.add(o);
      this.scn.fx.push({
        kind: 'debris', spr: o, x: c * TS + 8 + (i % 2 ? 4 : -4), y: r * TS + 8 + (i < 2 ? -4 : 4),
        vx: dx, vy: dy, t: 0, life: 900
      });
    }
    this.shake(70, 1);
  };

  P.spawnFromBlock = function (c, r, kind) {
    var x = c * TS + 8, y = r * TS;
    if (kind === 'coin') {
      this.gainCoin();
      this.addScore(200);
      var o = this.mkSpr(this.scn.fxL, x, y, 'mario_coin', 0, 12, 16, SB.C.YEL3);
      if (!o.__fb && this.scene.anims.exists('mr_coin')) o.play('mr_coin');
      this.scn.fx.push({ kind: 'coinpop', spr: o, x: x, y: y, vy: -0.33, t: 0, life: 620 });
      this.popText(x, y - 18, '+200');
      return;
    }
    /* 蘑菇 / 星星 / 火花：从砖里顶出来，先慢慢升起 16px */
    var fr = kind === 'mush' ? 0 : (kind === 'fire' ? 1 : 3);
    var col = kind === 'mush' ? SB.C.RED4 : (kind === 'fire' ? SB.C.GRN4 : SB.C.YEL4);
    var spr = this.mkSpr(this.scn.objL, x, y, 'mario_item', fr, 14, 14, col);
    this.sfx('powerup');
    this.scn.items.push({
      kind: kind, x: x, y: y, vx: 0, vy: 0, w: 14, h: 14,
      spr: spr, rise: 320, dir: 1, onGround: false
    });
  };

  P.gainCoin = function () {
    var s = this.st();
    s.coins++;
    this.sfx('coin_get');
    if (s.coins >= 100) {
      s.coins -= 100;
      s.lives++;
      this.lives = s.lives;
      this.sfx('extra_life');
      this.flashScreen(SB.C.WHITE, 70);
    }
    this.refreshHud();
  };

  P.updateItems = function (dt) {
    var arr = this.scn.items, i, o, box, pb = this.boxOf_(this.p);
    for (i = arr.length - 1; i >= 0; i--) {
      o = arr[i];
      if (o.rise > 0) {
        /* 从砖里升起来的那 320ms，不参与碰撞（免得卡在砖里） */
        o.rise -= dt;
        o.y -= dt * (TS / 320);
        o.spr.setPosition(Math.round(o.x), Math.round(o.y));
        if (o.rise <= 0 && o.kind !== 'fire') o.vx = ITEM_V * o.dir;
        continue;
      }
      if (o.kind !== 'fire') {
        /* 蘑菇和星星会走、会掉、撞墙折返；星星还会一直弹 */
        o.vy += G_FALL * dt;
        if (o.vy > MAXFALL) o.vy = MAXFALL;
        o.bumpWall = 0;
        this.moveX(o, o.vx * dt);
        if (o.bumpWall) { o.dir = -o.dir; o.vx = (o.kind === 'star' ? STAR_VX : ITEM_V) * o.dir; }
        this.moveY(o, o.vy * dt, false);
        if (o.onGround) {
          if (o.kind === 'star') { o.vy = -0.30; o.vx = STAR_VX * o.dir; }
          else o.vx = ITEM_V * o.dir;
        }
        if (o.y > ROWS * TS + 12) { o.spr.destroy(); arr.splice(i, 1); continue; }
      }
      o.spr.setPosition(Math.round(o.x), Math.round(o.y));

      box = { x: o.x - 7, y: o.y - 14, w: 14, h: 14 };
      if (!this.p.dead && this.hit(box, pb)) {
        this.takeItem(o.kind, o.x, o.y);
        o.spr.destroy(); arr.splice(i, 1);
      }
    }
  };

  P.takeItem = function (kind, x, y) {
    var p = this.p, s = this.st();
    this.sfx('powerup');
    if (kind === 'mush') {
      if (!p.big) { p.big = true; s.big = true; this.setHeroSpr(); this.flashScreen(SB.C.WHITE, 60); }
      this.addScore(1000); this.popText(x, y - 16, '+1000');
    } else if (kind === 'fire') {
      p.fire = true; s.fire = true;
      if (!p.big) { p.big = true; s.big = true; this.setHeroSpr(); }
      this.addScore(1000); this.popText(x, y - 16, '+1000');
    } else if (kind === 'star') {
      p.star = STAR_MS;
      this.addScore(1000); this.popText(x, y - 16, this.cn('无敌'));
    }
    this.refreshHud();
  };

  P.updateCoins = function () {
    var arr = this.scn.coins, i, o, pb = this.boxOf_(this.p);
    for (i = arr.length - 1; i >= 0; i--) {
      o = arr[i];
      if (this.hit({ x: o.x - 6, y: o.y - 15, w: 12, h: 15 }, pb)) {
        this.gainCoin();
        this.addScore(200);
        this.popText(o.x, o.y - 18, '+200');
        o.spr.destroy(); arr.splice(i, 1);
      }
    }
  };

  /* ================================================================
   * 八、敌人：蘑菇怪 / 跳跳怪 / 乌龟（踩一下变壳，壳能踢出去连撞）
   * ================================================================ */
  P.activateMarks = function () {
    var lv = this.scn.lv, i, m;
    for (i = 0; i < lv.marks.length; i++) {
      m = lv.marks[i];
      /* 进画面右侧前一点才生成，跟真机一样 */
      if (m.done || m.x > this.camX + this.W + 24) continue;
      m.done = true;
      this.spawnEnemy(m.type, m.x, m.y);
    }
  };

  P.spawnEnemy = function (type, x, y) {
    var e = {
      type: type === 'k' ? 'koopa' : (type === 'j' ? 'hop' : 'mush'),
      x: x, y: y, vx: 0, vy: 0, w: 13, h: 16,
      dir: -1, onGround: false, dead: false, deadT: 0,
      shell: false, sliding: false, wake: 0, hopT: 500, t: 0, spr: null
    };
    if (e.type === 'koopa') { e.h = 18; }
    var key = e.type === 'koopa' ? 'mario_shell' : 'mario_mush';
    var col = e.type === 'koopa' ? SB.C.GRN4 : (e.type === 'hop' ? SB.C.PUR3 : SB.C.WOOD4);
    e.spr = this.mkSpr(this.scn.objL, x, y, key, 0, 13, e.h, col);
    if (e.type === 'hop' && !e.spr.__fb) e.spr.setTint(0xc98ad8);   // 跳跳怪换个色，好区分
    e.vx = (e.type === 'hop' ? E_HOP : E_WALK) * e.dir;
    this.scn.enemies.push(e);
    return e;
  };

  P.updateEnemies = function (dt) {
    var arr = this.scn.enemies, i, e, pb = this.boxOf_(this.p);
    for (i = arr.length - 1; i >= 0; i--) {
      e = arr[i];
      e.t += dt;

      /* --- 已经死了的：踩扁的躺一会儿就消失 --- */
      if (e.dead) {
        e.deadT += dt;
        if (e.flip) {
          /* 被火球/星星/壳撞死的：翻个跟斗掉下去 */
          e.vy += G_FALL * dt;
          e.y += e.vy * dt;
          e.spr.setPosition(Math.round(e.x), Math.round(e.y));
          e.spr.setScale(1, -1);
        }
        if (e.deadT > (e.flip ? 900 : 420)) { e.spr.destroy(); arr.splice(i, 1); }
        continue;
      }

      /* --- 缩壳倒计时：6 秒后重新变回乌龟 --- */
      if (e.shell && !e.sliding) {
        e.wake += dt;
        if (e.wake > 6000) { e.shell = false; e.wake = 0; e.vx = E_WALK * e.dir; }
        else if (e.wake > 4500) this.setFr(e.spr, Math.floor(e.wake / 120) % 2 === 0 ? 2 : 0);
      }

      /* --- 跳跳怪定时起跳 --- */
      if (e.type === 'hop' && e.onGround) {
        e.hopT -= dt;
        if (e.hopT <= 0) { e.vy = -0.255; e.hopT = 820; e.onGround = false; }
      }

      /* --- 物理 --- */
      e.vy += G_FALL * dt;
      if (e.vy > MAXFALL) e.vy = MAXFALL;
      e.bumpWall = 0;
      var spd = e.sliding ? SHELL_V : (e.shell ? 0 : (e.type === 'hop' ? E_HOP : E_WALK));
      e.vx = spd * e.dir;
      this.moveX(e, e.vx * dt);
      if (e.bumpWall) {
        var flip = true;
        if (e.sliding) {
          /* 滑行的壳撞到砖：跟真机一样把砖撞碎 / 把问号砖顶出来，撞碎了就继续往前滑 */
          var bch = this.chAt(e.bumpC, e.bumpR);
          if (bch === 'B') { this.breakBrick(e.bumpC, e.bumpR); flip = false; }
          else if (bch === 'b' || QBLOCK[bch]) this.bumpTile(e.bumpC, e.bumpR);
          else this.sfx('steel_hit');
        }
        if (flip) e.dir = -e.dir;
      }
      this.moveY(e, e.vy * dt, false);

      /* 掉出画面 / 被镜头甩掉很远就回收 */
      if (e.y > ROWS * TS + 16 || e.x < this.camX - 80) { e.spr.destroy(); arr.splice(i, 1); continue; }

      /* --- 表现 --- */
      if (e.shell) this.setFr(e.spr, e.sliding ? 3 : 2);
      else this.setFr(e.spr, Math.floor(e.t / 180) % 2);
      this.setFlip(e.spr, e.dir > 0);
      e.spr.setPosition(Math.round(e.x), Math.round(e.y));

      /* --- 滑行的壳撞死别的怪：连撞分数翻倍，这是当年最爽的一招 --- */
      if (e.sliding) {
        for (var j = arr.length - 1; j >= 0; j--) {
          var o = arr[j];
          if (o === e || o.dead) continue;
          if (this.hit(this.boxOf_(e), this.boxOf_(o))) this.killEnemy(o, true);
        }
      }

      /* --- 和玩家的判定 --- */
      if (this.p.dead || this.phase !== 'play') continue;
      if (!this.hit(this.boxOf_(e), pb)) continue;

      if (this.p.star > 0) { this.killEnemy(e, true); continue; }

      /* 踩踏判定：正在下落，且脚底还在敌人上半身 —— 判定给得宽一点，手感才不憋屈 */
      var stomping = this.p.vy > 0 && (this.p.y - this.p.vy * dt) <= e.y - e.h + 10;
      if (stomping) this.stomp(e);
      else if (e.shell && !e.sliding) this.kickShell(e);
      else this.hurtPlayer();
    }
  };

  P.stomp = function (e) {
    var pad = this.opts.twoP ? this.p_(this.cur + 1) : this.pad;
    this.p.vy = pad.a ? STOMP_V_A : STOMP_V;
    this.p.y = e.y - e.h;
    this.p.onGround = false;
    this.p.hold = !!pad.a;

    if (e.shell) {
      if (e.sliding) {
        /* 踩住滑行的壳 = 停下来（这一下不算杀，只加一点分） */
        e.sliding = false; e.wake = 0; this.sfx('hit');
        this.addScore(100);
      } else {
        /* 从上面落到静止的壳上 = 照脚下方向踢出去，跟真机一样 */
        this.kickShell(e, true);
      }
      return;
    }
    if (e.type === 'koopa') {
      e.shell = true; e.sliding = false; e.wake = 0; e.vx = 0;
      this.sfx('hit');
      this.chainScore(e.x, e.y - 20);
      return;
    }
    /* 蘑菇怪 / 跳跳怪：踩扁（帧 2） */
    e.dead = true; e.deadT = 0; e.vx = 0;
    this.setFr(e.spr, 2);
    e.spr.setScale(1, 1);
    this.sfx('hit');
    this.chainScore(e.x, e.y - 16);
  };

  P.kickShell = function (e, fromTop) {
    var dx = e.x - this.p.x;
    e.sliding = true;
    /* 侧面撞：往玩家的反方向踢；从头顶踩下来（左右几乎重合）：照玩家朝向踢 */
    if (fromTop || Math.abs(dx) < 5) e.dir = this.p.face < 0 ? -1 : 1;
    else e.dir = dx > 0 ? 1 : -1;
    e.wake = 0;
    this.sfx('kick');
    this.addScore(100);
    this.popText(e.x, e.y - 20, '+100');
    /* 踢的瞬间把玩家推开一点，避免同一帧又撞上去 */
    this.p.x += e.dir > 0 ? -3 : 3;
  };

  P.killEnemy = function (e, flip) {
    if (e.dead) return;
    e.dead = true; e.deadT = 0; e.flip = !!flip; e.vy = -0.26; e.vx = 0;
    this.sfx('explosion_s');
    this.chainScore(e.x, e.y - 18);
  };

  /* 连击分数：100 / 200 / 400 / 800 / 1000… 跟真机一个味儿 */
  P.chainScore = function (x, y) {
    var tab = [100, 200, 400, 800, 1000, 2000, 4000, 8000];
    var v = tab[Math.min(this.chain, tab.length - 1)];
    this.chain++;
    this.addScore(v);
    this.popText(x, y, '+' + v);
    this.refreshHud();
  };

  /* ================================================================
   * 九、火球
   * ================================================================ */
  P.shootFire = function () {
    var p = this.p;
    var o = this.rect(0, 0, 7, 7, SB.C.RED5, 1);
    o.setOrigin(0.5, 0.5);
    this.scn.objL.add(o);
    this.scn.fires.push({
      x: p.x + p.face * 8, y: p.y - p.h * 0.6, w: 7, h: 7,
      vx: FIRE_V * p.face, vy: 0.05, spr: o, t: 0, onGround: false
    });
    this.sfx('shoot');
  };

  P.updateFires = function (dt) {
    var arr = this.scn.fires, i, f, j, e;
    for (i = arr.length - 1; i >= 0; i--) {
      f = arr[i];
      f.t += dt;
      f.vy += G_FALL * dt * 0.8;
      if (f.vy > 0.36) f.vy = 0.36;
      f.bumpWall = 0;
      var ent = { x: f.x, y: f.y + 3.5, w: 7, h: 7, vx: f.vx, vy: f.vy, onGround: false };
      this.moveX(ent, f.vx * dt);
      this.moveY(ent, f.vy * dt, false);
      f.x = ent.x; f.y = ent.y - 3.5;
      if (ent.onGround) f.vy = -0.22; else f.vy = ent.vy;      // 贴着地面弹着走
      if (ent.bumpWall || f.t > 2600 || f.x < this.camX - 10 || f.x > this.camX + this.W + 10 || f.y > ROWS * TS) {
        f.spr.destroy(); arr.splice(i, 1); continue;
      }
      f.spr.setPosition(Math.round(f.x), Math.round(f.y));
      f.spr.setScale(1 + 0.2 * Math.sin(f.t / 40), 1);

      for (j = 0; j < this.scn.enemies.length; j++) {
        e = this.scn.enemies[j];
        if (e.dead) continue;
        if (this.hit({ x: f.x - 4, y: f.y - 4, w: 8, h: 8 }, this.boxOf_(e))) {
          this.killEnemy(e, true);
          f.spr.destroy(); arr.splice(i, 1);
          break;
        }
      }
    }
  };

  /* ================================================================
   * 十、特效（砖块回弹、碎片、冒出的金币、飘字）
   * ================================================================ */
  P.popText = function (x, y, str) {
    var t = this.txt(x, y, str, 12, SB.C.WHITE, false);
    t.setOrigin(0.5, 1);
    this.scn.fxL.add(t);
    this.scn.fx.push({ kind: 'pop', spr: t, x: x, y: y, vy: -0.045, t: 0, life: 640 });
  };

  P.updateFx = function (dt) {
    var arr = this.scn.fx, i, o;
    for (i = arr.length - 1; i >= 0; i--) {
      o = arr[i];
      o.t += dt;
      if (o.kind === 'bump') {
        /* 砖块被顶：先上 4px 再回来 */
        var k = o.t / o.life;
        var up = k < 0.5 ? k * 2 : (1 - k) * 2;
        if (o.spr && o.spr.active !== false) o.spr.y = o.y0 - Math.round(up * 5);
        if (o.t >= o.life) { if (o.spr) o.spr.y = o.y0; arr.splice(i, 1); }
        continue;
      }
      if (o.kind === 'debris') {
        o.vy += G_FALL * dt;
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.spr.setPosition(Math.round(o.x), Math.round(o.y));
        o.spr.rotation += dt * 0.012;
        if (o.t >= o.life) { o.spr.destroy(); arr.splice(i, 1); }
        continue;
      }
      if (o.kind === 'coinpop') {
        o.vy += G_FALL * 1.5 * dt;
        o.y += o.vy * dt;
        o.spr.setPosition(Math.round(o.x), Math.round(o.y));
        if (o.t >= o.life) { o.spr.destroy(); arr.splice(i, 1); }
        continue;
      }
      if (o.kind === 'pop') {
        o.y += o.vy * dt;
        o.spr.setPosition(Math.round(o.x), Math.round(o.y));
        if (o.t >= o.life) { o.spr.destroy(); arr.splice(i, 1); }
      }
    }
  };

  /* ================================================================
   * 十一、受伤与死亡
   * ================================================================ */
  P.hurtPlayer = function () {
    var p = this.p, s = this.st();
    if (p.dead || p.inv > 0 || p.star > 0) return;
    if (p.big) {
      /* 中弹先变小，这是「还能再挨一下」的安全感来源 */
      p.big = false; s.big = false;
      p.fire = false; s.fire = false;
      this.setHeroSpr();
      p.inv = HURT_INV;
      this.sfx('hit');
      this.flashScreen(SB.C.WHITE, 60);
      this.shake(120, 2);
      this.refreshHud();
      return;
    }
    this.die();
  };

  P.die = function () {
    var p = this.p;
    if (p.dead) return;
    p.dead = true; p.deadT = 0; p.vx = 0; p.vy = -0.34; p.ctrl = false;
    p.star = 0; p.inv = 0;
    this.tintOf(p.spr, null);
    p.spr.setVisible(true);
    p.spr.setScale(1, 1);
    this.setFr(p.spr, 6);
    this.sfx('player_die');
    this.shake(200, 3);
    this.phase = 'dying';
    this.phaseT = 0;
  };

  P.finishDeath = function () {
    var s = this.st();
    s.lives--;
    this.lives = s.lives;
    if (s.lives < 0) {
      s.out = true;
      /* 轮流玩：自己没命了，看看另一个还在不在 */
      var other = this.otherAlive();
      if (other < 0) { this.gameOver(); return; }
      this.cur = other;
      this.lives = this.st().lives;
      this.loadLevel(this.st().level);
      return;
    }
    if (this.opts.twoP) {
      var nx = this.otherAlive();
      if (nx >= 0 && nx !== this.cur) this.cur = nx;
    }
    this.lives = this.st().lives;
    this.loadLevel(this.st().level);
  };

  P.otherAlive = function () {
    var i;
    for (i = 0; i < this.pls.length; i++) {
      var k = (this.cur + 1 + i) % this.pls.length;
      if (!this.pls[k].out) return k;
    }
    return -1;
  };

  /* ================================================================
   * 十二、旗杆 → 城堡 → 下一关
   * ================================================================ */
  P.checkFlag = function () {
    var lv = this.scn.lv;
    if (!lv.flagX || this.phase !== 'play') return;
    var pb = this.boxOf_(this.p);
    if (!this.hit(pb, { x: lv.flagX - 5, y: 96, w: 10, h: GROUND_R * TS - 96 })) return;

    /* 抓杆的位置越高，奖励越多（当年就为这个专门练助跑） */
    var high = Math.max(0, (GROUND_R * TS - this.p.y));
    var bonus = 400 + Math.round(high / 8) * 100;
    this.addScore(bonus + this.timeLeft * 50);
    this.popText(lv.flagX + 18, this.p.y - 12, '+' + bonus);
    this.sfx('stage_clear');

    this.phase = 'flag';
    this.phaseT = 0;
    this.p.ctrl = false;
    this.p.x = lv.flagX - 7;
    this.p.vx = 0; this.p.vy = 0;
    this.p.dead = false;
    this.setFlip(this.p.spr, false);
    this.flagStep = 'slide';
    this.refreshHud();
  };

  P.updateFlag = function (dt) {
    var p = this.p, lv = this.scn.lv;
    if (this.flagStep === 'slide') {
      p.y += 0.13 * dt;
      if (this.scn.flag) {
        this.scn.flag.y = Math.min(GROUND_R * TS - 2, this.scn.flag.y + 0.13 * dt);
      }
      this.setFr(p.spr, 4);
      if (p.y >= GROUND_R * TS) {
        p.y = GROUND_R * TS;
        this.flagStep = 'walk';
        this.phaseT = 0;
        p.face = 1;
        this.setFlip(p.spr, false);
      }
    } else if (this.flagStep === 'walk') {
      p.vx = 0.075;
      p.walkT += dt;
      this.moveX(p, p.vx * dt);
      this.moveY(p, MAXFALL * 0.4 * dt, false);
      this.setFr(p.spr, 1 + (Math.floor(p.walkT / 120) % 3));
      if (!lv.castleX || p.x >= lv.castleX - 4) {
        p.spr.setVisible(false);
        this.flagStep = 'done';
        this.phaseT = 0;
      }
    } else if (this.flagStep === 'done') {
      if (this.phaseT > 1100) this.nextLevel();
    }
    p.spr.setPosition(Math.round(p.x), Math.round(p.y));
  };

  /* ================================================================
   * 十三、HUD（全部离边 8px 以上，显像管边角看不见）
   * ================================================================ */
  /* 盗版汉化：中文全变方块 */
  P.cn = function (s) {
    if (!this.opts.garble) return s;
    var out = '', i;
    for (i = 0; i < s.length; i++) out += '■';
    return out;
  };

  P.buildHud = function () {
    this.hud = {};
    /* 显像管四周会被过扫描吃掉，所以左边留 14px、上边留 12px */
    this.hud.score = this.txt(14, 12, '000000', 12, SB.C.WHITE);
    this.hud.coin = this.txt(96, 12, '', 12, SB.C.YEL3);
    this.hud.world = this.txt(196, 12, '', 12, SB.C.WHITE);
    this.hud.time = this.txt(286, 12, '', 12, SB.C.WHITE);
    this.hud.life = this.txt(14, 28, '', 12, SB.C.GREY8);
    this.hud.power = this.txt(96, 28, '', 12, SB.C.GRN5);
    /* 买了《电子游戏时代》才有的秘技角落 */
    this.hud.tip = this.txt(14, 244, '', 12, SB.C.GREY6);
    if (!this.hasMag()) this.hud.tip.setVisible(false);
    this.refreshHud();
  };

  P.refreshHud = function () {
    if (!this.hud) return;
    var s = this.st();
    var six = '000000' + Math.max(0, Math.floor(this.score));
    this.hud.score.setText(six.slice(-6));
    this.hud.coin.setText(this.cn('金') + '×' + ('0' + s.coins).slice(-2));
    this.hud.world.setText(this.cn('世界') + ' ' + (LEVELS[s.level] ? LEVELS[s.level].name : '1-1'));
    this.hud.time.setText(this.cn('时') + ' ' + ('00' + Math.max(0, Math.floor(this.timeLeft))).slice(-3));
    this.hud.life.setText(this.cn('命') + '×' + Math.max(0, s.lives) +
      (this.opts.twoP ? ('  ' + (this.cur + 1) + 'P') : ''));
    var pw = this.p && this.p.fire ? this.cn('火') : (this.p && this.p.big ? this.cn('大') : '');
    if (this.p && this.p.star > 0) pw = this.cn('无敌');
    this.hud.power.setText(pw);
  };

  /* ================================================================
   * 十四、秘技（买了杂志才有）
   * ================================================================ */
  P.updateCheat = function (dt) {
    if (!this.hasMag()) return;
    var j = this.pad.just, i;
    var keys = ['up', 'down', 'left', 'right', 'a', 'b'];
    for (i = 0; i < keys.length; i++) {
      if (j[keys[i]]) {
        this.cheatBuf.push(keys[i]);
        if (this.cheatBuf.length > 6) this.cheatBuf.shift();
      }
    }
    /* ↓↓↑↑BA = 无限跳 */
    if (this.cheatBuf.length === 6 &&
      this.cheatBuf[0] === 'down' && this.cheatBuf[1] === 'down' &&
      this.cheatBuf[2] === 'up' && this.cheatBuf[3] === 'up' &&
      this.cheatBuf[4] === 'b' && this.cheatBuf[5] === 'a') {
      this.cheatBuf = [];
      this.infJump = !this.infJump;
      this.sfx('extra_life');
      this.flashScreen(SB.C.YEL4, 90);
      this.tipT = 2600;
      this.hud.tip.setText(this.cn('无限跳') + (this.infJump ? ' ON' : ' OFF'));
    }

    /* SELECT 连按三下 = 直接跳关 */
    if (this.selT > 0) this.selT -= dt; else this.selCount = 0;
    if (j.select) {
      this.selCount++;
      this.selT = 1400;
      if (this.selCount >= 3) {
        this.selCount = 0;
        this.sfx('powerup');
        this.flashScreen(SB.C.WHITE, 80);
        this.nextLevel();
        return;
      }
    }

    /* 角落提示：两条秘技轮流显示 */
    if (this.tipT > 0) { this.tipT -= dt; return; }
    var alt = Math.floor(this.t / 3600) % 2 === 0;
    this.hud.tip.setText(alt
      ? (this.cn('秘技') + ' ↓↓↑↑BA=' + this.cn('无限跳'))
      : (this.cn('秘技') + ' SELECT×3=' + this.cn('跳关')));
  };

  /* ================================================================
   * 十五、主循环
   * ================================================================ */
  P.update = function (dt) {
    if (this.over || this.cleared) return;
    this.t += dt;
    this.phaseT += dt;
    this.updateCheat(dt);

    /* --- 关卡开始的黑底卡片 --- */
    if (this.phase === 'card') {
      if (this.phaseT >= CARD_MS) {
        this.hideCard();
        this.phase = 'play';
        this.phaseT = 0;
      }
      return;
    }

    /* --- 死亡等待 --- */
    if (this.phase === 'dying') {
      this.updatePlayer(dt);
      this.updateFx(dt);
      if (this.phaseT >= DEAD_MS) this.finishDeath();
      return;
    }

    /* --- 落旗通关流程 --- */
    if (this.phase === 'flag') {
      this.updateFlag(dt);
      this.updateEnemies(dt);
      this.updateFx(dt);
      this.scrollWorld();
      return;
    }

    /* --- 正常游戏 --- */
    /* 倒计时：约 0.4 秒掉一格，最后 100 格开始催（音效交给 bgm，这里只闪 HUD） */
    this.tickAcc += dt;
    while (this.tickAcc >= 400) {
      this.tickAcc -= 400;
      if (!this.scn.bonus) {
        this.timeLeft--;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.refreshHud(); this.die(); return; }
        this.refreshHud();
      }
    }

    this.activateMarks();
    this.updatePlayer(dt);
    if (this.phase !== 'play') return;      // updatePlayer 里可能已经死了 / 钻管了
    this.updateEnemies(dt);
    this.updateItems(dt);
    this.updateCoins();
    this.updateFires(dt);
    this.updateFx(dt);
    this.checkFlag();
    this.scrollWorld();
    this.refreshHud();
  };

  /* 镜头：只往右推，绝不后退；world.x 必须取整，否则像素会抖 */
  P.scrollWorld = function () {
    var lv = this.scn.lv;
    var want = this.p.x - 140;
    if (want > this.camX) this.camX = want;
    var maxX = Math.max(0, lv.w - this.W);
    this.camX = this.clamp(this.camX, 0, maxX);
    this.world.x = -Math.round(this.camX);

    /* 天空背景视差（0.35 倍速），三张图循环铺 */
    var bgs = this.scn.bgs, i;
    if (bgs.length) {
      var n = Math.round(this.camX * 0.35 / this.W);
      for (i = 0; i < bgs.length; i++) {
        bgs[i].x = Math.round((n + i - 1) * this.W + this.camX * 0.65);
      }
    }
    /* 底色块跟着镜头走，任何时候都不会露出黑边 */
    if (this.scn.base) this.scn.base.x = Math.round(this.camX);
  };

  /* ================================================================
   * 十六、清理
   * ================================================================ */
  P.destroy = function () {
    while (this.stack.length) this.disposeScene(this.stack.pop());
    this.disposeScene();
    if (this.p && this.p.spr) { this.p.spr.destroy(); this.p.spr = null; }
    this.hideCard();
    this.p = null;
    this.hud = null;
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games = SB.Games || {};
  SB.Games.mario = MarioGame;

})(window.SB);
