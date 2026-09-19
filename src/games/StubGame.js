/* 那些「不太能玩」的卡带。
 *
 * 老卡带里有很大一部分是这样的：亮着一个标题画面，音乐一遍一遍循环，
 * 你把所有键都按过一遍，它就是不动。或者是「100 万合 1」——目录里十个名字，
 * 能进去的只有三个，而且三个都是同一个坦克游戏换了配色。
 * 这类卡带全部由本文件负责，它们和真正能玩的游戏一样重要。 */
(function (SB) {
  'use strict';

  SB.Games = SB.Games || {};

  /* ================================================================
   * 1. 死标题卡带：只有标题画面，按什么都没反应
   * ================================================================ */
  function StubGame(host, opts) { SB.GameBase.call(this, host, opts); }
  SB.extendGame(StubGame);

  StubGame.prototype.create = function () {
    var c = SB.CART_BY_ID[this.opts.cartId] || {};
    this.rect(0, 0, this.W, this.H, SB.C.BLU1);

    /* 一个粗糙的伪标题画面：色带 + 标题 + 闪烁的 PUSH START */
    for (var i = 0; i < 6; i++) {
      this.rect(0, 40 + i * 3, this.W, 2, [SB.C.RED3, SB.C.YEL3, SB.C.GRN3, SB.C.BLU4, SB.C.PUR3, SB.C.WHITE][i], 0.5);
    }
    this.t1 = this.txt(this.W / 2, 88, c.name || 'TITLE', 16, SB.C.YEL3);
    this.t1.setOrigin(0.5, 0);
    this.t2 = this.txt(this.W / 2, 116, '1994  UNKNOWN', 12, SB.C.GREY6);
    this.t2.setOrigin(0.5, 0);
    this.t3 = this.txt(this.W / 2, 182, 'PUSH  START', 12, SB.C.WHITE);
    this.t3.setOrigin(0.5, 0);
    this.tip = this.txt(this.W / 2, 232, '', 12, SB.C.GREY7);
    this.tip.setOrigin(0.5, 0);

    this.bgm('bgm_title');
    this.presses = 0;
    this.blink = 0;
  };

  StubGame.prototype.update = function (dt) {
    this.t += dt;
    this.blink += dt;
    if (this.blink > 420) { this.blink = 0; this.t3.setVisible(!this.t3.visible); }

    var p = this.pad.just;
    if (p.a || p.b || p.up || p.down || p.left || p.right || p.select) {
      this.presses++;
      this.sfx('ui_move');
      if (this.presses === 3) this.tip.setText(SB.line(SB.L.game.stubTitle));
      if (this.presses === 8) this.tip.setText(SB.line(SB.L.game.stubEnd));
      if (this.presses === 14) this.tip.setText('（按 START 退出）');
    }
  };

  SB.Games.stub = StubGame;
  SB.Games.null = StubGame;

  /* ================================================================
   * 2. 100 万合 1：目录 10 个，能进 3 个
   * ================================================================ */
  function MultiGame(host, opts) {
    SB.GameBase.call(this, host, opts);
    this.sel = 0;
    this.inner = null;
    this.failT = 0;
  }
  SB.extendGame(MultiGame);

  MultiGame.prototype.create = function () {
    this.menuLayer = this.group(true);
    var bg = this.scene.add.rectangle(0, 0, this.W, this.H, SB.C.INK, 1).setOrigin(0, 0);
    this.menuLayer.add(bg);

    var head = SB.Text.add(this.scene, this.W / 2, 18, '1 000 000  IN  1', 16, SB.C.YEL3).setOrigin(0.5, 0);
    var head2 = SB.Text.add(this.scene, this.W / 2, 40, SB.line(SB.L.game.multiHeader), 12, SB.C.GRN4).setOrigin(0.5, 0);
    this.menuLayer.add([head, head2]);

    this.rows = [];
    for (var i = 0; i < SB.MULTI_MENU.length; i++) {
      var m = SB.MULTI_MENU[i];
      var y = 66 + i * 17;
      var t = SB.Text.add(this.scene, 74, y, (m.n < 10 ? ' ' : '') + m.n + '.  ' + m.name, 12, SB.C.GREY8);
      this.menuLayer.add(t);
      this.rows.push(t);
    }
    /* 同菜单光标：字库里没有 ▶，只换这一个字符，目录的逻辑一行没动 */
    this.cursor = SB.Text.add(this.scene, 56, 66, '→', 12, SB.C.RED4);
    this.menuLayer.add(this.cursor);
    this.failTxt = SB.Text.add(this.scene, this.W / 2, 250, '', 12, SB.C.RED5).setOrigin(0.5, 0);
    this.menuLayer.add(this.failTxt);

    this.bgm('bgm_title');
  };

  MultiGame.prototype.moveSel = function (d) {
    this.sel = (this.sel + d + SB.MULTI_MENU.length) % SB.MULTI_MENU.length;
    this.cursor.setY(66 + this.sel * 17);
    this.sfx('ui_move');
  };

  MultiGame.prototype.update = function (dt) {
    if (this.inner) { this.inner.update(dt); return; }
    var p = this.pad.just;
    if (p.down) this.moveSel(1);
    if (p.up) this.moveSel(-1);
    if (p.a || p.b) this.enter();

    if (this.failT > 0) {
      this.failT -= dt;
      if (this.failT <= 0) this.failTxt.setText('');
    }
  };

  MultiGame.prototype.enter = function () {
    var m = SB.MULTI_MENU[this.sel];
    this.sfx('ui_confirm');
    if (!m.ok) {
      /* 黑两秒，又跳回目录 —— 一模一样的失望 */
      var self = this;
      this.menuLayer.setVisible(false);
      this.scene.time.delayedCall(1400, function () {
        self.menuLayer.setVisible(true);
        self.failTxt.setText(SB.line(SB.L.game.multiFail));
        self.failT = 2600;
        self.sfx('ui_error');
      });
      return;
    }
    /* 三个「不同的」游戏，其实是同一个坦克换配色 */
    var Ctor = SB.Games.tank || StubGame;
    this.menuLayer.destroy();
    this.menuLayer = null;
    this.inner = new Ctor(this.host, {
      cartId: this.opts.cartId, twoP: this.opts.twoP,
      atFriend: this.opts.atFriend, skin: m.skin, title: m.name
    });
    this.inner.create();
  };

  MultiGame.prototype.destroy = function () {
    if (this.inner) this.inner.destroy();
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games.multi = MultiGame;

  /* ================================================================
   * 3. 汉化版：能玩，但所有汉字都变成了方块
   * ================================================================ */
  function GarbleGame(host, opts) {
    SB.GameBase.call(this, host, opts);
    this.inner = null;
    this.phase = 'title';
    this.wait = 0;
  }
  SB.extendGame(GarbleGame);

  GarbleGame.prototype.create = function () {
    this.rect(0, 0, this.W, this.H, SB.C.RED1);
    var junk = '';
    for (var i = 0; i < 9; i++) junk += SB.pick(['■', '□', '▓', '▒', '?', '?', '#']);
    this.j1 = this.txt(this.W / 2, 92, junk, 16, SB.C.YEL4); this.j1.setOrigin(0.5, 0);
    this.j2 = this.txt(this.W / 2, 122, '汉 化 组 ' + junk.slice(0, 4), 12, SB.C.GREY7); this.j2.setOrigin(0.5, 0);
    this.note = this.txt(this.W / 2, 200, SB.line(SB.L.game.garble), 12, SB.C.GREY6); this.note.setOrigin(0.5, 0);
    this.bgm('bgm_title');
    this.wait = 2600;
  };

  GarbleGame.prototype.update = function (dt) {
    if (this.inner) { this.inner.update(dt); return; }
    this.wait -= dt;
    if (this.wait <= 0 || this.pad.just.a) {
      var Ctor = SB.Games.contra || SB.Games.tank || StubGame;
      this.world.removeAll(true);
      this.ui.removeAll(true);
      this.inner = new Ctor(this.host, {
        cartId: this.opts.cartId, twoP: this.opts.twoP,
        atFriend: this.opts.atFriend, garble: true
      });
      this.inner.create();
    }
  };

  GarbleGame.prototype.destroy = function () {
    if (this.inner) this.inner.destroy();
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games.garble = GarbleGame;

  /* ================================================================
   * 4. 未完成版：第一关能玩，进第二关就死机成一屏彩条
   * ================================================================ */
  function CrashGame(host, opts) {
    SB.GameBase.call(this, host, opts);
    this.inner = null;
    this.alive = 0;
  }
  SB.extendGame(CrashGame);

  CrashGame.prototype.create = function () {
    var Ctor = SB.Games.mario || SB.Games.tank || StubGame;
    this.inner = new Ctor(this.host, {
      cartId: this.opts.cartId, twoP: this.opts.twoP, atFriend: this.opts.atFriend
    });
    this.inner.create();
  };

  CrashGame.prototype.update = function (dt) {
    this.alive += dt;
    if (this.inner) this.inner.update(dt);
    /* 撑不过 40 秒，或者内层游戏想进第二关 */
    var wantStage2 = this.inner && this.inner.stage > 1;
    if (!this.crashed && (this.alive > 40000 || wantStage2)) {
      this.crashed = true;
      this.sfx('glitch_burst');
      this.host.flashScreen(SB.C.WHITE, 120);
      var self = this;
      this.scene.time.delayedCall(200, function () {
        if (self.inner) { self.inner.destroy(); self.inner = null; }
        self.host.midFault(true);
      });
    }
  };

  CrashGame.prototype.destroy = function () {
    if (this.inner) this.inner.destroy();
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games.crash = CrashGame;

})(window.SB);
