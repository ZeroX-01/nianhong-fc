/* 小游戏基类。
 *
 * 每个卡带里的游戏都跑在 PlayScene 提供的一块 360×270 的画面区里（模拟 4:3 显像管）。
 * 基类负责：世界层 / HUD 层的分离、坐标系、输入、音效、碰撞与常用绘制助手。
 * 子类只需要实现 create() / update(dt) / destroy()。
 *
 * 坐标系：世界层与 HUD 层的 (0,0) 就是画面区左上角，右下角是 (360,270)。
 * 不要直接用 scene.add.*，用基类提供的 spr/img/rect/txt，它们会自动挂到正确的层上。 */
(function (SB) {
  'use strict';

  var W = 360, H = 270;

  function GameBase(host, opts) {
    this.host = host;
    this.scene = host;
    this.opts = opts || {};
    this.W = W; this.H = H;

    this.pad = SB.Input.p1;
    this.pad2 = SB.Input.p2;

    /* world 会被游戏自己横向/纵向滚动；ui 永远固定 */
    this.world = host.add.container(0, 0);
    this.ui = host.add.container(0, 0);
    host.gameRoot.add(this.world);
    host.gameRoot.add(this.ui);

    this.score = 0;
    this.hiscore = 0;
    this.lives = 3;
    this.stage = 1;
    this.over = false;
    this.cleared = false;
    this.paused = false;
    this.t = 0;
  }

  GameBase.prototype = {

    /* ---------------- 生命周期（子类覆盖） ---------------- */
    create: function () {},
    update: function (dt) {},
    destroy: function () {
      if (this.world) this.world.destroy();
      if (this.ui) this.ui.destroy();
      this.world = this.ui = null;
    },

    /* ---------------- 绘制助手 ---------------- */
    spr: function (x, y, key, frame, toUi) {
      var s = this.scene.add.sprite(x, y, key, frame);
      (toUi ? this.ui : this.world).add(s);
      return s;
    },
    img: function (x, y, key, frame, toUi) {
      var s = this.scene.add.image(x, y, key, frame);
      (toUi ? this.ui : this.world).add(s);
      return s;
    },
    tile: function (x, y, w, h, key, toUi) {
      var s = this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0);
      (toUi ? this.ui : this.world).add(s);
      return s;
    },
    rect: function (x, y, w, h, color, alpha, toUi) {
      var r = this.scene.add.rectangle(x, y, w, h, color, alpha === undefined ? 1 : alpha).setOrigin(0, 0);
      (toUi ? this.ui : this.world).add(r);
      return r;
    },
    gfx: function (toUi) {
      var g = this.scene.add.graphics();
      (toUi ? this.ui : this.world).add(g);
      return g;
    },
    txt: function (x, y, str, size, tint, toUi) {
      var t = SB.Text.add(this.scene, x, y, str, size || 12, tint === undefined ? SB.C.WHITE : tint);
      (toUi === false ? this.world : this.ui).add(t);
      return t;
    },
    group: function (toUi) {
      var c = this.scene.add.container(0, 0);
      (toUi ? this.ui : this.world).add(c);
      return c;
    },

    /* 从 sheet 注册一个动画（key 全局唯一，重复注册会跳过） */
    anim: function (key, texture, frames, rate, repeat) {
      if (this.scene.anims.exists(key)) return key;
      this.scene.anims.create({
        key: key,
        frames: this.scene.anims.generateFrameNumbers(texture, { frames: frames }),
        frameRate: rate || 8,
        repeat: repeat === undefined ? -1 : repeat
      });
      return key;
    },

    /* ---------------- 资源存在性 ---------------- */
    /* 美术资源可能还没到位，所有取图前都要过一下这个判断，缺图时走色块兜底 */
    has: function (key) { return this.scene.textures.exists(key); },
    frames: function (key) {
      if (!this.has(key)) return 0;
      return this.scene.textures.get(key).frameTotal - 1;
    },

    /* ---------------- 输入 ---------------- */
    p: function (n) { return n === 2 ? this.pad2 : this.pad; },
    down: function (k, n) { return this.p(n)[k]; },
    just: function (k, n) { return this.p(n).just[k]; },

    /* ---------------- 碰撞 ---------------- */
    /* 矩形写法 {x,y,w,h}，x/y 为左上角 */
    hit: function (a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    boxOf: function (sprite, shrinkX, shrinkY) {
      var sx = shrinkX || 0, sy = shrinkY || 0;
      var w = sprite.displayWidth - sx * 2, h = sprite.displayHeight - sy * 2;
      return {
        x: sprite.x - sprite.displayWidth * sprite.originX + sx,
        y: sprite.y - sprite.displayHeight * sprite.originY + sy,
        w: w, h: h
      };
    },

    /* ---------------- 反馈 ---------------- */
    sfx: function (k, o) { SB.Audio.sfx(k, o); },
    bgm: function (k) { SB.Audio.bgm(k); },
    shake: function (ms, amt) {
      if (SB.Save.d.settings.shake === false) return;
      this.host.shakeScreen(ms || 160, amt || 2);
    },
    flashScreen: function (color, ms) { this.host.flashScreen(color, ms); },

    /* ---------------- 结束 ---------------- */
    addScore: function (v) {
      this.score += v;
      if (this.score > this.hiscore) this.hiscore = this.score;
    },
    gameOver: function (delay) {
      if (this.over) return;
      this.over = true;
      this.bgm('bgm_gameover');
      this.host.onGameOver(this, delay === undefined ? 1800 : delay);
    },
    clearGame: function () {
      if (this.cleared) return;
      this.cleared = true;
      this.sfx('stage_clear');
      this.host.onCleared(this);
    },

    /* 秘技提示（买了《电子游戏时代》才显示） */
    hasMag: function () { return !!SB.Save.d.owned.mag; },

    /* ---------------- 小工具 ---------------- */
    clamp: SB.clamp,
    rnd: SB.rnd,
    rndInt: SB.rndInt,
    pick: SB.pick,
    chance: SB.chance
  };

  SB.GameBase = GameBase;

  /* 让子类继承得省事一点 */
  SB.extendGame = function (ctor) {
    ctor.prototype = Object.create(GameBase.prototype);
    ctor.prototype.constructor = ctor;
    return ctor;
  };

})(window.SB);
