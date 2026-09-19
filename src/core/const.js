/* 常量：分辨率、布局坐标、调色板、层级
 * 注意：所有坐标都是「逻辑像素」，画布固定 480×270，再整数放大到屏幕。 */
(function (SB) {
  'use strict';

  SB.W = 480;
  SB.H = 270;

  /* 小游戏画面区（模拟 4:3 显像管），左右各 60px 为电视木框 */
  SB.SCREEN = { x: 60, y: 0, w: 360, h: 270 };

  /* 客厅里那台大屁股电视的位置，以及它屏幕内区（tv_crt.png 的透明窗）*/
  SB.TV = {
    x: 150, y: 32, w: 176, h: 148,
    screen: { x: 168, y: 48, w: 140, h: 104 }   // = (150+18, 32+16)
  };

  /* 客厅物件的摆放坐标。
   * 基准来自 docs/ART_MANIFEST.md；挂钟 / 灯泡 / 鱼缸三处按合成自查的结论做了微调，
   * 否则挂钟会被电视遮掉四分之三、灯泡和天线打结、鱼缸看着像悬空。 */
  SB.ROOM = {
    window:      { x: 24,  y: 36 },
    door:        { x: 398, y: 92 },
    cabinet:     { x: 118, y: 176 },
    lace:        { x: 114, y: 170 },
    antenna:     { x: 212, y: 0 },
    console:     { x: 250, y: 196 },
    pad1:        { x: 150, y: 238 },
    pad2:        { x: 206, y: 244 },
    cable1:      { x: 188, y: 232 },
    cable2:      { x: 252, y: 232 },
    sofa:        { x: 8,   y: 164 },
    sofaGap:     { x: 62,  y: 196, w: 22, h: 20 },  // 藏卡带的那道缝
    fish:        { x: 356, y: 186 },
    thermos:     { x: 352, y: 196 },
    shoebox:     { x: 78,  y: 236 },
    desk:        { x: 392, y: 216 },
    book:        { x: 398, y: 214 },                // 作业本摊在小方桌上
    calendar:    { x: 120, y: 44 },
    award:       { x: 330, y: 52 },
    bulb:        { x: 96,  y: 0 },
    clock:       { x: 338, y: 10 },
    poster:      { x: 56,  y: 120 },
    slipper:     { x: 300, y: 250 },
    popsicle:    { x: 140, y: 246 },
    kid:         { x: 214, y: 200 },
    consoleSlot: { x: 272, y: 196, w: 40, h: 8 }    // 主机顶面卡槽
  };

  /* 渲染层级 */
  SB.D = {
    BG: 0,
    WALL_ITEM: 10,
    TV_SCREEN: 20,      // 电视里的画面（在电视外壳之下）
    TV_SCREEN_FX: 24,
    TV_BODY: 30,
    FURNITURE: 40,
    PROP: 50,
    CHAR: 60,
    FRONT_PROP: 70,
    FOCUS: 80,
    CRT: 100,
    HUD: 120,
    DIALOG: 140,
    TOUCH: 160,
    OVERLAY: 180,
    FADE: 200,
    TOP: 220
  };

  /* 调色板（与 docs/PALETTE.md 一致，供代码画图/染色使用）*/
  SB.C = {
    INK: 0x000000, GREY1: 0x14141c, GREY2: 0x24242f, GREY3: 0x383845,
    GREY4: 0x4f4f60, GREY5: 0x6d6d80, GREY6: 0x92929f, GREY7: 0xb8b8c2,
    GREY8: 0xdcdce2, WHITE: 0xffffff,
    WOOD1: 0x2a1a10, WOOD2: 0x46291a, WOOD3: 0x63402a, WOOD4: 0x85583a,
    WOOD5: 0xa8764c, WOOD6: 0xc99a6a, WOOD7: 0xe6c49a,
    RED1: 0x4a0c12, RED2: 0x7a161c, RED3: 0xad2229, RED4: 0xd93a34, RED5: 0xf2705a,
    GRN1: 0x102c1c, GRN2: 0x1d5230, GRN3: 0x2f7d42, GRN4: 0x55ab52, GRN5: 0x8fd15c,
    BLU1: 0x0c1832, BLU2: 0x17346b, BLU3: 0x2a61ad, BLU4: 0x4a9bd1, BLU5: 0x93d4ea,
    YEL1: 0x5c3f0e, YEL2: 0xa87a18, YEL3: 0xe0b422, YEL4: 0xf5db6e,
    PUR1: 0x32163f, PUR2: 0x6b2469, PUR3: 0xad4287, PUR4: 0xe07db4,
    SKN1: 0x8f5a3c, SKN2: 0xc98a5f, SKN3: 0xe8be93, SKN4: 0xf7dcbe
  };

  /* 12 种卡带壳体的染色（用于给灰阶近景白模上色）*/
  SB.CART_TINT = {
    '01': SB.C.GREY7, '02': SB.C.GRN3, '03': SB.C.RED3, '04': SB.C.BLU3,
    '05': SB.C.YEL3, '06': SB.C.GREY5, '07': SB.C.PUR3, '08': SB.C.GRN4,
    '09': SB.C.WOOD6, '10': SB.C.BLU5, '11': SB.C.WOOD3, '12': SB.C.RED4
  };

  /* 故障类型 → 正确的修复手法 */
  SB.FAULT = {
    SNOW:    { key: 'SNOW',    name: '没信号',   fix: 'reseat', hint: '屏幕一片雪花，什么都没有。八成是没插到底。' },
    GLITCH:  { key: 'GLITCH',  name: '花屏',     fix: 'blow',   hint: '满屏乱七八糟的彩条。金手指脏了，得哈两口气。' },
    ROLL:    { key: 'ROLL',    name: '滚屏偏色', fix: 'rub',    hint: '画面一直往上滚，还发绿。拿卡带在桌上划两下试试。' },
    SHAKE:   { key: 'SHAKE',   name: '抖动横条', fix: 'slap',   hint: '画面抖得厉害，有横条。老办法——拍电视一巴掌。' },
    RAINBOW: { key: 'RAINBOW', name: '彩虹纹',   fix: 'puff',   hint: '一层彩虹纹糊在画面上。卡槽里进灰了，吹一吹。' }
  };

  /* 一天中的时段 */
  SB.SLOTS = [
    { key: 'morning', name: '上午', time: '09:00', momHome: 0.75 },
    { key: 'noon',    name: '中午', time: '12:30', momHome: 0.90 },
    { key: 'after',   name: '下午', time: '15:00', momHome: 0.35 },
    { key: 'dusk',    name: '傍晚', time: '17:30', momHome: 0.55 },
    { key: 'night',   name: '晚上', time: '20:00', momHome: 0.95 }
  ];

  SB.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  SB.rnd = function (a, b) { return a + Math.random() * (b - a); };
  SB.rndInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  SB.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  SB.chance = function (p) { return Math.random() < p; };
  SB.money = function (v) { return '￥' + (Math.round(v * 10) / 10).toFixed(1); };

})(window.SB);
