/* 序章：2026 年那个晚上。
 *
 * 这一屏是全场唯一的「现实层」，年份是 2026。梦里那个暑假才是 2004。
 * 12 个分镜写在 SB.STORY.prologue，文案在 SB.L.story.prologue，
 * 这里只负责「怎么演」：画面、旁白、菜单、跳过、以及最后交棒给客厅。
 *
 * 为什么不复用 SB.UI.interlude：序章每一镜的画面自己在演（雨在下、灯在闪、
 * 眼皮在合），需要在「换行」和「换镜」两级各自挂表演钩子，interlude 只有
 * 「一行一按」这一种节奏，塞不进这些东西。节奏本身和 interlude 一样是
 * 手动的：一行念完停下来等玩家点（见 PrologueScene 的 waitTap）。
 *
 * 美术上刻意和 2004 反着来：
 *   2026 = 冷蓝灰、直角、进度条、数字（100%、14 分钟、前面还有 3 人）
 *   2004 = 木色、暖光、蝉声
 * 全部用色块和点阵字现画，不加一张新图 —— 这一段总共不到 4 分钟，
 * 为它多背 200KB 贴图不值得，而且色块反而更像那一夜真正的样子：
 * 空办公室里能看清的东西本来就只有几块亮着的矩形。 */
(function (SB) {
  'use strict';

  /* 三条横带，互不重叠：日期条 / 画面 / 旁白。底下 16px 归 SB.UI.hint。 */
  var SLUG = { y: 0, h: 16 };
  var ART = { x: 0, y: 16, w: SB.W, h: 178 };            // 16 – 194
  var BAND = { x: 0, y: 196, w: SB.W, h: 56 };           // 196 – 252
  var TXT = { x: 26, y: 203, w: SB.W - 52 };
  /* 菜单固定摆右上：每一镜的画面重点都放在左边和下边，两边不打架 */
  var MENU = { x: 208, w: 254, y: 32 };

  var COLD = 0x0d1018;   // 2026 的底色
  var WARM = 0x6b4426;   // 2004 的底色

  function calm() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ 画面表
   *
   * 每个画法只干一件事：往 sc 上加对象，加完就不管了。
   * 生命周期由场景统一收（sc.own / sc.spin / sc.beat），换镜时一起清掉。 */
  var PAINT = {

    /* S-01 办公室远景：整层只剩一排灯 */
    office: function (sc) {
      sc.fill(COLD);
      /* 远处两排暗工位 */
      var r, c, x, y;
      for (r = 0; r < 2; r++) {
        for (c = 0; c < 4; c++) {
          x = 24 + c * 108; y = 44 + r * 30;
          sc.rect(x, y, 84, 7, 0x171d2b);            // 桌面
          sc.rect(x + 26, y - 11, 30, 11, 0x141926); // 黑着的显示器
        }
      }
      /* 自己那张桌子：唯一亮着的一块 */
      sc.rect(176, 132, 148, 9, 0x232b3d);
      sc.rect(196, 24, 92, 4, 0xe8eef7, 0.9);        // 头顶那排灯
      sc.rect(180, 28, 124, 104, 0x9fb4d8, 0.05);    // 灯下的光锥
      sc.rect(210, 96, 60, 36, 0x2b3348);            // 显示器外壳
      sc.rect(213, 99, 54, 30, 0x2e4a86, 0.92);      // 屏幕
      sc.rect(218, 105, 30, 2, 0x93d4ea, 0.8);
      sc.rect(218, 111, 42, 2, 0x6d8ec4, 0.7);
      sc.rect(218, 117, 22, 2, 0x6d8ec4, 0.5);
      sc.rect(232, 132, 16, 6, 0x1b2130);            // 支架
      sc.rect(286, 122, 7, 10, 0x8a8f9c);            // 中午那杯咖啡
      sc.rect(285, 120, 9, 2, 0xb8b8c2);
      /* 椅子和椅背上那个还没走的人 —— 整层就剩这一个 */
      sc.rect(150, 116, 26, 16, 0x1b2130);           // 椅背
      sc.rect(158, 108, 12, 10, 0x2a3244);           // 后脑
      sc.rect(156, 132, 22, 26, 0x161c28);           // 椅子腿那一块
      /* 墙上那口钟：右上角留给「跳过」按钮、上面那排是灯，所以摆左下角。
       * 顶上的日期条已经写了时间，这里只是让「深夜」在画面里也有个落点。 */
      sc.rect(22, 150, 44, 22, 0x141a26);
      sc.rect(22, 150, 44, 2, 0x2a3348);
      sc.txt(26, 154, SB.STORY.PRO_CLOCK, 12, SB.C.GREY6);
      /* 远端那盏接触不良的灯，隔几秒闪一下 */
      var flick = sc.rect(40, 34, 56, 3, 0xcfd8e8, 0.5);
      if (!calm()) {
        sc.spin({ targets: flick, alpha: 0.12, duration: 140, yoyo: true, repeat: -1, repeatDelay: 2200 });
      }
      sc.hum('fan_hum', 0.14);
    },

    /* S-02 显示器：进度条走到 100% 停住 */
    monitor: function (sc) {
      sc.fill(0x090c13);
      sc.rect(92, 34, 296, 138, 0x1b2130);
      sc.rect(96, 38, 288, 122, 0x101a2e);
      sc.rect(230, 172, 20, 8, 0x1b2130);
      sc.txt(112, 50, '发布　线上', 12, SB.C.GREY7);
      /* 进度条：已经满了，只在最后一格上抖一下，像刚刚走完 */
      sc.rect(112, 74, 256, 12, 0x1f2a44);
      var bar = sc.rect(112, 74, 256, 12, 0x4a9bd1);
      bar.setScale(0.9, 1);
      sc.spin({ targets: bar, scaleX: 1, duration: 700, ease: 'Quart.easeOut' });
      sc.txt(112, 94, '100%', 12, SB.C.BLU5);
      sc.txt(368, 94, '6 小时 12 分', 12, SB.C.GREY6).setOrigin(1, 0);
      /* 群里最后一条消息 */
      sc.rect(112, 118, 256, 30, 0x18213a);
      sc.txt(120, 124, '工作群', 12, SB.C.GREY5);
      sc.txt(120, 136, '辛苦了，明天见', 12, SB.C.GREY8);
      var cur = sc.rect(340, 136, 5, 10, 0x93d4ea, 0.9);
      if (!calm()) sc.spin({ targets: cur, alpha: 0.05, duration: 520, yoyo: true, repeat: -1 });
    },

    /* S-03 屏幕黑掉：玻璃里那张脸 */
    blackscreen: function (sc) {
      sc.fill(0x090c13);
      sc.rect(92, 34, 296, 138, 0x1b2130);
      var scr = sc.rect(96, 38, 288, 122, 0x101a2e);
      sc.rect(230, 172, 20, 8, 0x1b2130);
      sc.spin({ targets: scr, fillAlpha: 0.15, duration: 620, ease: 'Quad.easeIn' });
      /* 反光：一个头肩剪影，加两排映在玻璃上的空工位 */
      var head = sc.own(sc.add.ellipse(240, 92, 34, 42, 0x9fb4d8, 0.1));
      head.setDepth(SB.D.BG + 4);
      sc.rect(210, 112, 60, 40, 0x9fb4d8, 0.07);
      sc.rect(112, 60, 70, 4, 0x9fb4d8, 0.05);
      sc.rect(300, 60, 70, 4, 0x9fb4d8, 0.05);
      sc.rect(112, 78, 70, 4, 0x9fb4d8, 0.04);
      sc.rect(300, 78, 70, 4, 0x9fb4d8, 0.04);
      sc.sfx('tv_power_off', 0.5);
    },

    /* S-04 电梯里跳出来的打车软件 */
    phone_call: function (sc) {
      sc.fill(0x11141c);
      /* 电梯门：两扇，中间一道缝 */
      sc.rect(24, 16, 156, 178, 0x1c222e);
      sc.rect(180, 16, 156, 178, 0x1a2029);
      sc.rect(178, 16, 4, 178, 0x0a0d12);
      sc.rect(24, 108, 312, 2, 0x2a3140);
      /* 楼层显示：从 18 往下掉 */
      sc.rect(150, 24, 60, 22, 0x0c1018);
      var fl = sc.txt(180, 28, '18', 16, SB.C.RED4).setOrigin(0.5, 0);
      var n = 18;
      sc.tick(320, function () { n = n > 1 ? n - 1 : 1; fl.setText(String(n)); });
      /* 手机卡片 */
      sc.rect(352, 44, 116, 112, 0x141a26);
      sc.rect(352, 44, 116, 2, 0x2a3348);
      sc.rect(358, 52, 104, 48, 0x101623);      // 地图
      sc.rect(364, 92, 92, 2, 0x2a3348);
      sc.rect(370, 58, 2, 36, 0x2a3348);
      sc.rect(360, 76, 60, 2, 0x4a9bd1, 0.9);   // 路线
      sc.rect(418, 66, 2, 12, 0x4a9bd1, 0.9);
      sc.rect(416, 62, 6, 6, 0xd93a34);         // 终点那个红点
      sc.txt(358, 106, '等待 14 分钟', 12, SB.C.GREY8);
      sc.txt(358, 122, '前面还有 3 人', 12, SB.C.GREY6);
      sc.rect(358, 138, 104, 12, 0x2a61ad, 0.8);
    },

    /* S-05 楼下等车：雨、招牌、水洼，和一张一直在转的卡片 */
    street: function (sc) {
      sc.fill(0x0b1220);
      /* 对面的写字楼，只剩几扇窗 */
      var blocks = [[190, 30, 84, 120], [282, 52, 62, 98], [352, 22, 74, 128]];
      var i, j, b;
      for (i = 0; i < blocks.length; i++) {
        b = blocks[i];
        sc.rect(b[0], b[1], b[2], b[3], 0x151d2c);
        for (j = 0; j < 3; j++) {
          if ((i + j) % 3 === 0) sc.rect(b[0] + 10 + j * 20, b[1] + 16 + j * 22, 8, 10, 0xd8c98a, 0.75);
        }
      }
      /* 便利店招牌 + 地上那摊蓝 */
      sc.rect(196, 118, 52, 14, 0x2a61ad, 0.95);
      sc.rect(192, 116, 60, 20, 0x4a9bd1, 0.12);
      sc.rect(0, 152, SB.W, 42, 0x0e1522);          // 湿地面
      sc.rect(0, 150, SB.W, 3, 0x1a2434);           // 马路牙子
      sc.rect(190, 160, 66, 3, 0x2a61ad, 0.3);      // 招牌倒影
      sc.rect(196, 168, 52, 2, 0x2a61ad, 0.22);
      sc.rect(202, 176, 40, 2, 0x2a61ad, 0.16);
      for (i = 0; i < 4; i++) sc.rect(300 + i * 40, 178, 24, 3, 0x9fb4d8, 0.10);   // 斑马线
      /* 撑着伞站在路边的你。看不清脸，只看得清一个人还在等 */
      sc.rect(58, 116, 12, 36, 0x161d2b);           // 身子
      sc.rect(60, 106, 8, 10, 0x1b2331);            // 头
      sc.rect(63, 88, 2, 20, 0x232c3c);             // 伞柄
      sc.rect(40, 84, 48, 5, 0x232c3c);             // 伞面
      sc.rect(44, 89, 40, 2, 0x1b2331);
      sc.rect(50, 152, 28, 3, 0x9fb4d8, 0.10);      // 脚下那点反光
      /* 雨。关了动效就画成静止的雪花点 */
      var quiet = calm(), r, y0;
      for (i = 0; i < 16; i++) {
        y0 = 16 + (i * 37) % 130;
        r = sc.rect(14 + i * 29, y0, 1, quiet ? 3 : 7, 0x9fb4d8, quiet ? 0.22 : 0.34);
        if (!quiet) {
          sc.spin({ targets: r, y: 190, duration: 620 + (i % 4) * 90, repeat: -1, delay: i * 55 });
        }
      }
      /* 等车卡片：进度条走满 18 秒，车才来 */
      sc.rect(18, 26, 168, 44, 0x101826);
      sc.rect(18, 26, 168, 2, 0x2a3348);
      sc.txt(26, 32, '司机正在赶来', 12, SB.C.GREY8);
      sc.rect(26, 50, 152, 6, 0x1f2a44);
      sc.waitBar = sc.rect(26, 50, 152, 6, 0x4a9bd1);
      sc.waitBar.setScale(0, 1);
      sc.waitTxt = sc.txt(26, 58, '', 12, SB.C.GREY6);
      sc.hum('tv_static', 0.07);   // 雨声：静电噪声本来就是雨
    },

    /* S-06 后座：车门一关，雨声就远了 */
    taxi: function (sc, silent) {
      /* 构图：你坐在后座靠左，脸朝窗外。
       * 左边三分之二是车窗（外面下着雨的城市），右边是前排座椅背，
       * 最下面一条是你自己这排座位 —— 观众的视角就压在这条上面。 */
      var i, s2, x;
      sc.fill(0x080b12);
      sc.rect(0, 16, SB.W, 12, 0x101420);            // 车顶内衬
      /* 车窗 */
      var WX = 18, WY = 34, WW = 216, WH = 104;
      sc.rect(WX - 5, WY - 5, WW + 10, WH + 10, 0x1a202e);   // 窗框
      sc.rect(WX, WY, WW, WH, 0x0d1420);                     // 玻璃
      /* 窗外：远处楼群 + 零星窗灯，往后退 */
      for (i = 0; i < 7; i++) {
        var bh = 30 + ((i * 41) % 52);
        var bx = WX + 4 + i * 31;
        sc.rect(bx, WY + WH - bh, 24, bh, 0x131c2b);
        var lit = sc.rect(bx + 6, WY + WH - bh + 8, 4, 4, 0xd8c98a, 0.5);
        if (!calm()) {
          sc.spin({ targets: lit, alpha: 0.12, duration: 900 + i * 130, yoyo: true, repeat: -1, delay: i * 220 });
        }
      }
      /* 路灯一盏一盏往后掠过 */
      for (i = 0; i < 3; i++) {
        var lamp = sc.rect(WX + WW, WY + 10, 10, 40, 0xe8dfb0, 0.16);
        if (!calm()) {
          sc.spin({
            targets: lamp, x: WX - 12, duration: 1500, repeat: -1,
            delay: i * 900, ease: 'Sine.easeIn'
          });
        }
      }
      /* 玻璃上的雨：细线往下淌 */
      for (i = 0; i < 11; i++) {
        s2 = sc.rect(WX + 8 + i * 20, WY + 4 + (i % 4) * 22, 1, 10, 0x9fb4d8, 0.32);
        if (!calm()) {
          sc.spin({ targets: s2, y: WY + WH - 6, duration: 620 + i * 40, repeat: -1, delay: i * 70 });
        }
      }
      /* 雨刷：轴在窗底中间，来回刮。玻璃之外看不见，所以只在窗内画 */
      var wiper = sc.own(sc.add.rectangle(WX + WW / 2, WY + WH - 2, 3, WH - 14, 0x1b2330, 0.9)
        .setOrigin(0.5, 1));
      wiper.setDepth(SB.D.BG + 5);
      wiper.setAngle(-32);
      if (!calm()) {
        sc.spin({ targets: wiper, angle: 32, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      /* 前排：座椅背 + 头枕 + 司机的后脑，右边这一块把画面压住 */
      sc.rect(300, 40, 168, 154, 0x181420);          // 副驾座椅背
      sc.rect(312, 40, 144, 8, 0x211b2a);
      sc.rect(326, 50, 116, 34, 0x241e2e);           // 头枕
      sc.rect(352, 84, 64, 12, 0x1d1826);            // 头枕支杆那一块
      sc.rect(360, 62, 40, 20, 0x2b2436, 0.9);       // 司机的后脑（更远一点，色更暗）
      /* 仪表盘漏出来的一点暖光，和窗外的冷色打个照应 */
      sc.rect(300, 150, 168, 3, 0xd8a05a, 0.22);
      sc.rect(410, 158, 46, 14, 0x241e2e);
      sc.rect(414, 162, 12, 6, 0xd8a05a, 0.35);
      /* 你自己这排座位：最前景 */
      sc.rect(0, 172, SB.W, 22, 0x140f1c);
      sc.rect(0, 172, SB.W, 2, 0x1d1626);
      /* 玻璃上的雨声：静电噪声压得很低就是雨 */
      sc.hum('tv_static', 0.05);
      if (!silent) sc.sfx('door_close', 0.6);
    },

    /* S-07 师傅拧收音机：电流声里蹦出几个方方正正的电子音 */
    radio: function (sc) {
      /* 还是那辆车、那扇窗。这一镜只是把镜头往下挪到仪表台上，
       * 所以背景直接沿用 taxi，别另画一个空荡荡的黑屏。 */
      PAINT.taxi(sc, true);
      var i;
      sc.rect(0, 136, SB.W, 2, 0x241f28);
      sc.rect(0, 138, SB.W, 56, 0x151218);        // 仪表台
      sc.rect(120, 144, 200, 46, 0x211c22);       // 收音机面板
      sc.rect(120, 144, 200, 2, 0x3a3240);
      sc.rect(128, 150, 96, 16, 0x0d0b10);        // 频率窗
      sc.txt(134, 152, '87.6', 12, SB.C.YEL4);
      for (i = 0; i < 12; i++) sc.rect(130 + i * 8, 174, 1, i % 3 === 0 ? 8 : 5, 0x574c5e);
      sc.needle = sc.rect(132, 170, 2, 16, 0xd9a13a);
      sc.spin({ targets: sc.needle, x: 222, duration: 2600, ease: 'Sine.easeInOut' });
      sc.rect(262, 150, 32, 32, 0x2c2531);        // 旋钮
      sc.rect(274, 152, 8, 8, 0x574c5e);
      sc.shardHost = { x: 176, y: 148 };
    },

    /* S-08 后座刷手机：屏幕在左，评论列表就是右边那个菜单 */
    feed: function (sc) {
      sc.fill(0x0a0d14);
      sc.rect(0, 150, SB.W, 44, 0x171320);
      sc.rect(26, 24, 156, 164, 0x0e1119);        // 手机
      sc.rect(30, 30, 148, 152, 0x151b26);
      sc.rect(30, 30, 148, 8, 0x101623);
      sc.rect(36, 32, 14, 3, 0x6d6d80);
      /* 视频封面：一个灰白色的圆角手柄 */
      sc.rect(36, 44, 136, 58, 0x1d2536);
      sc.rect(66, 62, 76, 22, 0x8f97a8);
      sc.rect(60, 66, 8, 14, 0x8f97a8);
      sc.rect(140, 66, 8, 14, 0x8f97a8);
      sc.rect(78, 68, 10, 4, 0x2b3348);
      sc.rect(80, 65, 4, 10, 0x2b3348);
      sc.rect(120, 68, 5, 5, 0x2b3348);
      sc.rect(130, 68, 5, 5, 0x2b3348);
      sc.txt(36, 106, '十分钟看完一台', 12, SB.C.GREY7);
      sc.txt(36, 120, '二十年前的游戏机', 12, SB.C.GREY7);
      /* 评论区：四条 */
      var i;
      for (i = 0; i < 4; i++) {
        sc.rect(36, 138 + i * 12, 136, 9, 0x1a2130);
        sc.rect(40, 141 + i * 12, 60 + (i % 3) * 22, 3, 0x2b3348);
      }
      sc.rect(176, 44, 2, 60, 0x2b3348, 0.6);     // 滚动条
    },

    /* S-09 帖子内页：最高赞那条 */
    post: function (sc) {
      sc.fill(0x0a0d14);
      sc.rect(0, 150, SB.W, 44, 0x171320);
      sc.rect(26, 24, 156, 164, 0x0e1119);
      sc.rect(30, 30, 148, 152, 0x151b26);
      sc.rect(38, 40, 26, 26, 0x2b3348);          // 头像
      sc.rect(70, 42, 54, 4, 0x4a5468);
      sc.rect(70, 52, 34, 4, 0x39414f);
      var i;
      for (i = 0; i < 5; i++) sc.rect(38, 76 + i * 10, 132 - (i === 4 ? 50 : 0), 4, 0x39414f);
      /* 赞：一小团红 */
      sc.rect(38, 132, 6, 6, 0xd93a34);
      sc.rect(46, 132, 6, 6, 0xd93a34);
      sc.rect(41, 138, 8, 5, 0xd93a34);
      sc.txt(58, 130, '2.4 万', 12, SB.C.GREY7);
      sc.rect(38, 152, 132, 1, 0x2b3348);
      sc.rect(38, 160, 96, 4, 0x39414f);
    },

    /* S-10 三次眨眼：还是后座，只是上下两条黑边会合过来 */
    blink: function (sc) {
      PAINT.taxi(sc, true);
      var half = Math.ceil(ART.h / 2);
      sc.lidTop = sc.rect(0, ART.y, SB.W, half, 0x000000, 1);
      sc.lidBot = sc.own(sc.add.rectangle(0, ART.y + ART.h, SB.W, half, 0x000000, 1).setOrigin(0, 1));
      sc.lidTop.setScale(1, 0);
      sc.lidBot.setScale(1, 0);
      sc.lidTop.setDepth(SB.D.FURNITURE + 6);
      sc.lidBot.setDepth(SB.D.FURNITURE + 6);
    },

    /* S-11 / S-12 色调迁移：冷的东西全部换成暖的 */
    warm: function (sc) {
      /* 这一镜是整段序章的落点：冷蓝灰退场，2004 年的中午一层一层亮起来。
       * 顺序是有讲究的 —— 先有墙和光，再有地板，最后才是电视柜。
       * 你先认出这个房间的温度，然后才认出里面的东西。 */
      var i, d;
      var cold = sc.rect(0, ART.y, ART.w, ART.h, 0x000000, 1);
      var wall = sc.rect(0, ART.y, ART.w, ART.h, WARM, 0);
      sc.spin({ targets: wall, fillAlpha: 1, duration: 1500, ease: 'Sine.easeInOut' });
      sc.spin({ targets: cold, fillAlpha: 0, duration: 1500 });

      /* 一扇 2004 年的铁窗，外面是白得发亮的中午 */
      var win = sc.rect(58, 40, 132, 100, 0xf6e2b0, 0);
      var bar1 = sc.rect(102, 40, 3, 100, 0x8a5c3a, 0);      // 竖铁条
      var bar2 = sc.rect(146, 40, 3, 100, 0x8a5c3a, 0);
      var bar3 = sc.rect(58, 86, 132, 3, 0x8a5c3a, 0);       // 横铁条
      var frame = sc.rect(54, 36, 140, 4, 0x5a3620, 0);
      var sill = sc.rect(50, 140, 148, 7, 0x85583a, 0);
      /* 窗帘：只拉了一半，挂在右边 */
      var cur1 = sc.rect(160, 36, 34, 106, 0xd8b98a, 0);
      var cur2 = sc.rect(176, 36, 6, 106, 0xc0a175, 0);
      sc.spin({
        targets: [win, bar1, bar2, bar3, frame, sill, cur1, cur2],
        fillAlpha: 1, duration: 1300, delay: 600
      });

      /* 地板：木色，两道板缝 */
      var flr = sc.rect(0, 154, ART.w, 40, 0x7a4b26, 0);
      var skirt = sc.rect(0, 150, ART.w, 4, 0x5a3620, 0);
      var seam1 = sc.rect(0, 168, ART.w, 1, 0x633c1e, 0);
      var seam2 = sc.rect(0, 182, ART.w, 1, 0x633c1e, 0);
      sc.spin({ targets: [flr, skirt, seam1, seam2], fillAlpha: 1, duration: 1100, delay: 900 });

      /* 窗户投到地上的那道光：像素画里用几条错开的横带堆出斜角 */
      var beam = [];
      for (i = 0; i < 3; i++) {
        beam.push(sc.rect(72 + i * 9, 156 + i * 13, 138 - i * 8, 13, 0xf6e2b0, 0));
      }
      for (i = 0; i < beam.length; i++) {
        sc.spin({ targets: beam[i], fillAlpha: 0.13 - i * 0.03, duration: 1200, delay: 1100 + i * 120 });
      }

      /* 电视柜、那台电视、柜子上的蕾丝布、兔耳朵天线 */
      var cab = sc.rect(296, 116, 132, 38, 0x46291a, 0);
      var cabTop = sc.rect(292, 112, 140, 5, 0x5a3620, 0);
      var lace = sc.rect(300, 108, 124, 5, 0xe8dcc0, 0);
      var tvBody = sc.rect(312, 74, 100, 34, 0x2a1a10, 0);
      var tvScr = sc.rect(318, 79, 88, 24, 0x3b2a1c, 0);
      var ant1 = sc.own(sc.add.rectangle(346, 74, 2, 30, 0x2a1a10, 0).setOrigin(0.5, 1));
      var ant2 = sc.own(sc.add.rectangle(378, 74, 2, 30, 0x2a1a10, 0).setOrigin(0.5, 1));
      ant1.setDepth(SB.D.BG + 4).setAngle(-24);
      ant2.setDepth(SB.D.BG + 4).setAngle(24);
      sc.spin({
        targets: [cab, cabTop, lace, tvBody, tvScr, ant1, ant2],
        fillAlpha: 1, duration: 1100, delay: 1400
      });

      /* 地上的一双拖鞋：这个房间是有人住的 */
      var sl1 = sc.rect(212, 172, 22, 8, 0x3f7fa0, 0);
      var sl2 = sc.rect(240, 176, 22, 8, 0x3f7fa0, 0);
      sc.spin({ targets: [sl1, sl2], fillAlpha: 1, duration: 900, delay: 1700 });

      /* 光柱里的浮尘 */
      if (!calm()) {
        for (i = 0; i < 6; i++) {
          d = sc.rect(76 + i * 20, 62 + (i % 3) * 28, 2, 2, 0xffffff, 0.45);
          sc.spin({
            targets: d, y: 52 + (i % 3) * 28, alpha: 0.12,
            duration: 2600 + i * 380, yoyo: true, repeat: -1
          });
        }
      }
      sc.quiet('tv_static');
      sc.hum('cicada', 0.3);
    }
  };

  SB.PROLOGUE_PAINT = PAINT;

})(window.SB);
