/* 游戏画面场景。
 *
 * 这里是「电视里」。左右两条木框把 16:9 的窗口切成一台 4:3 的显像管电视，
 * 中间 360×270 就是卡带里那个游戏。所有小游戏都跑在这块区域里，
 * 上面永远盖着扫描线、荫罩和玻璃反光——你是隔着一层玻璃在玩。
 *
 * 它同时还在做三件与小游戏无关、但极其要紧的事：
 *   1. 数着妈妈回家的秒数，并在楼下车铃响起时把警告糊到画面上；
 *   2. 按住 START 就能一键关电视逃命；
 *   3. 卡带脏的时候，随时可能在你打到一半的时候突然花屏。 */
(function (SB) {
  'use strict';

  SB.PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'Play' }); },

    init: function (data) {
      var d = data || {};
      this.cartId = d.cartId || SB.Save.d.inserted || '02';
      this.cart = SB.CART_BY_ID[this.cartId] || null;
      this.cartState = SB.Save.cart(this.cartId) || null;
      this.gameKey = d.gameKey || (this.cart && this.cart.game) || null;
      this.atFriend = !!d.friend;          // 在发小家：没人管，可以双打
      this.twoP = !!d.twoP;
      this.fromMulti = !!d.fromMulti;      // 从「100 万合 1」目录进来的
      this.playMs = 0;
      this.game_ = null;
      this.warnLevel = 0;
      this.busted = false;
      this.leaving = false;
      this.midFaultT = 0;
      this.rescueOn = false;       // 正在抢救那几秒
      this.judgeT = 0;             // 判定字还留在屏上多久
    },

    create: function () {
      var self = this, S = SB.SCREEN;
      this.cameras.main.setBackgroundColor('#000000');

      /* --- 画面区：容器 + 几何遮罩，保证小游戏画不出屏 --- */
      this.gameRoot = this.add.container(S.x, S.y).setDepth(SB.D.TV_SCREEN);
      var shape = this.make.graphics({ x: 0, y: 0, add: false });
      shape.fillStyle(0xffffff, 1);
      shape.fillRect(S.x, S.y, S.w, S.h);
      this.gameRoot.setMask(shape.createGeometryMask());
      this.maskShape = shape;

      /* --- 电视木框 + 显像管特效 --- */
      this.bezel = SB.CRT.bezel(this, SB.D.CRT + 20);
      this.crt = SB.CRT.create(this, S, { depth: SB.D.CRT, darkDepth: SB.D.TV_SCREEN - 2 });
      this.crt.on = true;
      this.crt.setContentVisible(false);

      /* --- 警告与提示层（在 CRT 之上，因为它是「你脑子里的声音」） --- */
      this.buildWarnLayer();
      this.buildRescueLayer();
      this.buildTouch();
      this.buildLeaveBtn();

      /* --- 画面里的按键指引 ---
       * 卡带标题一过、游戏真的能动了，先给一张「怎么玩」，然后在角上留一条很淡的键位条。
       * 详见 src/core/keyguide.js。 */
      this.guide = SB.KeyGuide.attach(this);

      /* --- 双人同屏：把键盘左手那一块（WASD）交给 2P --- *
       * 只有这一屏会打开它，退场必须关掉，否则回到客厅按 A 就变成了「往左走」。 */
      SB.Input.setTwoP(this.twoP);

      /* --- 单人：小游戏里 WASD 也是方向键 --- *
       * 一坐下就按 WASD 想开坦克的人太多了，而 A 原本是「开火」，
       * 于是坦克在原地放炮，看上去就像坏了。游戏里移动优先：
       * A 让给「往左」，开火 / 确认还有 X、Z、J、K、空格。
       * 暂停菜单一开就关掉这一层（那里 A 必须是「确认」），退场也关掉。 */
      if (!this.twoP) SB.Input.setMove1P(true);

      /* --- 开机 → 卡带标题画面 → 开打 --- */
      this.gameRoot.setVisible(false);
      this.showTitleCard();

      /* --- 妈妈：只要是在自己家玩，就一直在数秒 --- */
      if (!this.atFriend && !SB.Save.d.__nomom) {
        SB.Parent.init();
        this.onWarn = function (lv) { self.showWarn(lv); };
        this.onArrive = function (res) { self.onBusted(res); };
        SB.Parent.ev.on('warn', this.onWarn);
        SB.Parent.ev.on('arrive', this.onArrive);
        if (SB.Parent.state === 'idle') SB.Parent.arm(SB.Time.momHome() ? 'kitchen' : 'out');
        if (SB.Parent.state === 'w1' || SB.Parent.state === 'w2' || SB.Parent.state === 'w3') {
          this.showWarn(SB.Parent.state === 'w1' ? 1 : (SB.Parent.state === 'w2' ? 2 : 3));
        }
      }

      /* --- 按键：START = 暂停 / 紧急关机，R = 主机 RESET --- */
      this.input.keyboard.on('keydown-R', function () { self.hitReset(); });
      this.input.keyboard.on('keydown-ESC', function () { self.onStart(); });

      this.events.once('shutdown', function () { self.cleanup(); });
      SB.UI.fadeIn(this, 220);
    },

    /* ---------------- 卡带标题画面 ---------------- */
    showTitleCard: function () {
      var self = this, S = SB.SCREEN;
      var c = this.cart || {};
      var layer = this.add.container(0, 0).setDepth(SB.D.TV_SCREEN + 2);
      var bg = this.add.rectangle(S.x, S.y, S.w, S.h, SB.C.INK, 1).setOrigin(0, 0);
      layer.add(bg);

      var t1 = SB.Text.add(this, S.x + S.w / 2, 96, c.name || '未知卡带', 16, SB.C.YEL3).setOrigin(0.5, 0);
      var t2 = SB.Text.add(this, S.x + S.w / 2, 124, (c.shell ? c.shell + '壳　' : '') + (c.game ? '' : ''), 12, SB.C.GREY7).setOrigin(0.5, 0);
      /* 开机画面上的年份是这台机器自己的年纪，不是现在的年份：
       * 2004 年的夏天，你玩的是一台九十年代的机器，而且还是借来的。 */
      var t3 = SB.Text.add(this, S.x + S.w / 2, 168, '1994  XUANFENG', 12, SB.C.GREY5).setOrigin(0.5, 0);
      layer.add([t1, t2, t3]);

      this.crt.setContentVisible(true);
      this.crt.powerOn(function () {
        SB.Audio.sfx('boot_jingle');
        self.time.delayedCall(1100, function () {
          self.tweens.add({
            targets: [bg, t1, t2, t3], alpha: 0, duration: 260,
            onComplete: function () { layer.destroy(); self.startGame(); }
          });
        });
      });
    },

    /* ---------------- 启动小游戏 ---------------- */
    startGame: function () {
      var key = this.gameKey;
      var Ctor = (SB.Games && SB.Games[key]) || SB.Games.stub;
      this.gameRoot.setVisible(true);
      this.game_ = new Ctor(this, {
        cartId: this.cartId,
        twoP: this.twoP,
        atFriend: this.atFriend,
        mode: key
      });
      this.game_.create();
      /* 新的一局（含 RESET、再来一局）：按键卡重新讲一次 */
      if (this.guide) this.guide.reset();
      SB.Save.d.stats.plays = (SB.Save.d.stats.plays || 0) + 1;
      var cs = SB.Save.d.carts[this.cartId];
      if (cs) cs.plays = (cs.plays || 0) + 1;
      /* 第一次真正把这张卡玩起来，记进回忆册 */
      var ct = this.cart || {};
      SB.Save.unlockAlbum('cart_' + this.cartId, ct.name || '一张卡带', ct.back || ct.desc || '');
      SB.Save.save();
    },

    /* ---------------- 警告层 ---------------- */
    buildWarnLayer: function () {
      var S = SB.SCREEN;
      this.warnBar = this.add.rectangle(S.x, 0, S.w, 22, SB.C.RED2, 0.86)
        .setOrigin(0, 0).setDepth(SB.D.OVERLAY).setVisible(false);
      this.warnTxt = SB.Text.add(this, S.x + S.w / 2, 6, '', 12, SB.C.YEL4)
        .setOrigin(0.5, 0).setDepth(SB.D.OVERLAY + 1).setVisible(false);
      this.warnFrame = this.add.graphics().setDepth(SB.D.OVERLAY).setVisible(false);
      this.warnFrame.lineStyle(2, SB.C.RED4, 1);
      this.warnFrame.strokeRect(S.x + 1, 1, S.w - 2, S.h - 2);
    },

    showWarn: function (lv) {
      if (this.atFriend) return;
      this.warnLevel = lv;
      var L = SB.L.mom['warn' + lv] || [];
      this.warnBar.setVisible(true);
      this.warnTxt.setVisible(true).setText(SB.line(L) + '   〔' + SB.Input.tip([['a', '收拾']], 1, true) + '〕');
      this.warnBar.setFillStyle(lv >= 3 ? SB.C.RED3 : SB.C.RED2, 0.86);
      if (lv >= 2) {
        this.warnFrame.setVisible(true);
        if (this.escBtn) this.escBtn.setVisible(true);
      }
      /* 钥匙响了就没得选了：手自己会动起来，不用你再按一下 START */
      if (lv >= 3) {
        this.shakeScreen(200, 2.4);
        this.startRescue(true);
      }
    },

    /* ---------------- 抢救那几秒 ----------------
     * 三下：关电视、拔卡带、塞沙发缝。每一下都要看着判定条按。
     * 这一段里妈妈的秒表照跑，手滑的代价是真的少一秒多。
     * 规则和判定都在 src/systems/rescue.js，这里只负责让它看得见。 */
    buildRescueLayer: function () {
      var S = SB.SCREEN;
      var BX = S.x + 30, BY = 172, BW = S.w - 60, BH = 74;   // 面板
      this.rz = {
        x: BX, y: BY, w: BW, h: BH,
        bx: BX + 16, by: BY + 36, bw: BW - 32, bh: 12,
        dx: BX + 16, dy: BY + 30, dw: BW - 32                // 门那条细线，跟判定条对齐
      };

      this.rescueBox = this.add.container(0, 0).setDepth(SB.D.OVERLAY + 4).setVisible(false);

      var bg = this.add.rectangle(BX, BY, BW, BH, SB.C.INK, 0.9).setOrigin(0, 0);
      var frame = this.add.graphics();
      frame.lineStyle(1, SB.C.RED4, 1);
      frame.strokeRect(BX + 0.5, BY + 0.5, BW - 1, BH - 1);

      /* 这一下要干什么。字号给足：这时候没人有空细看小字。 */
      this.rStep = SB.Text.add(this, BX + 16, BY + 8, '', 16, SB.C.YEL4).setOrigin(0, 0);
      /* 三个点：干完的点亮，没干的暗着。不写「1/3」这种数字。 */
      this.rDots = SB.Text.add(this, BX + BW - 16, BY + 10, '', 12, SB.C.GREY6).setOrigin(1, 0);
      /* 判定结果 */
      this.rJudge = SB.Text.add(this, BX + BW / 2, BY + 54, '', 12, SB.C.WHITE).setOrigin(0.5, 0);
      /* 按哪个键。第一次撞上这一段的人，得先知道手往哪儿放。 */
      this.rKey = SB.Text.add(this, BX + 16, BY + 56, '', 12, SB.C.GREY6).setOrigin(0, 0);

      /* 判定条：底槽 + 命中区 + 正中那一小段 + 光标，都画在整数像素上 */
      this.rBar = this.add.graphics();

      this.rescueBox.add([bg, frame, this.rStep, this.rDots, this.rJudge, this.rKey, this.rBar]);
    },

    /* 开始收拾。auto = 被钥匙声逼的。 */
    startRescue: function (auto) {
      if (this.leaving || this.busted || this.rescueOn) return;
      if (this.atFriend) return;
      var self = this;

      /* 没什么可收拾的（电视本来关着、卡也不在机器里）：那就直接走，不记账 */
      if (!SB.Rescue.start(auto)) { this.emergency(); return; }

      this.rescueOn = true;
      this.judgeT = 0;

      /* 注意力已经不在游戏上了：小游戏停在那一帧，手柄也交回「确认」语义，
       * 否则你按 A 是在开枪，不是在关电视。 */
      if (this.game_) this.game_.paused = true;
      SB.Input.setMove1P(false);
      /* 小游戏那条键位提示这时候只会碍事：这一段只有一个键有用 */
      if (this.guide) this.guide.clear();

      SB.Audio.loop('heartbeat', 0.42);
      this.rescueBox.setVisible(true);
      this.rJudge.setText('');
      /* 先喊一声，小半秒后再换成「关电视」：
       * 一上来就写第一步，玩家会以为这是菜单，不会意识到时间在走。 */
      this.rStep.setText(SB.line(auto ? SB.L.rescue.auto : SB.L.rescue.start));
      this.rKey.setText(SB.line(SB.L.rescue.tip) + '　' + SB.Input.tip([['a', '']], 1, true));
      this.syncDots();
      this.time.delayedCall(360, function () { if (self.rescueOn) self.syncRescue(); });
      if (this.escBtn) {
        this.escBtn.setVisible(true);
        if (this.escLabel) this.escLabel.setText('收拾');
      }
      /* 鼠标玩家那颗「离开」也收起来：这一段只有一条出路 */
      if (this.leaveBtn) this.leaveBtn.setVisible(false);
    },

    /* 按一下。判定在 SB.Rescue 里，这里只做反馈。 */
    judgeRescue: function () {
      if (!this.rescueOn) return;
      var r = SB.Rescue.hit();
      if (!r) return;
      this.judgeT = 520;
      if (r.type === 'perfect') {
        this.tintJudge(SB.C.YEL4, SB.line(SB.L.rescue.perfect));
      } else if (r.type === 'ok') {
        this.tintJudge(SB.C.GREY7, SB.line(SB.L.rescue.ok));
      } else {
        this.tintJudge(SB.C.RED4, SB.line(SB.L.rescue.miss));
        this.shakeScreen(140, 2.2);
      }
      if (!SB.Rescue.live) { this.finishRescue(); return; }
      this.syncRescue();
    },

    /* 判定字：位图字体只能染色，没有 setColor */
    tintJudge: function (tint, txt) {
      this.rJudge.setText(txt);
      if (this.rJudge.setTint) this.rJudge.setTint(tint);
      else this.rJudge.setColor('#' + ('000000' + tint.toString(16)).slice(-6));
    },

    /* 把「这一下干什么」和进度点刷一遍 */
    syncRescue: function () {
      var st = SB.Rescue.cur();
      if (st) this.rStep.setText(st.label);
      this.syncDots();
    },

    /* 三个点：干完的点亮，没干的暗着。不写 2/3 这种数字。 */
    syncDots: function () {
      var n = SB.Rescue.steps.length, done = SB.Rescue.i, s = '', k;
      for (k = 0; k < n; k++) s += (k < done ? '●' : '○');
      this.rDots.setText(s);
    },

    /* 判定条：每帧重画。画在整数像素上，像素画最怕半个像素。 */
    drawRescue: function () {
      var z = this.rz, R = SB.Rescue, g = this.rBar;
      g.clear();
      /* 底槽 */
      g.fillStyle(SB.C.GREY2, 1);
      g.fillRect(z.bx, z.by, z.bw, z.bh);
      /* 命中区：越急越宽，这是故意的 */
      var cw = Math.max(4, Math.round(R.half * 2 * z.bw));
      var cx = Math.round(z.bx + R.center * z.bw - cw / 2);
      g.fillStyle(SB.C.GRN2, 1);
      g.fillRect(cx, z.by, cw, z.bh);
      /* 正中那一小段 */
      var pw = Math.max(2, Math.round(R.phalf * 2 * z.bw));
      g.fillStyle(SB.C.GRN4, 1);
      g.fillRect(Math.round(z.bx + R.center * z.bw - pw / 2), z.by, pw, z.bh);
      /* 光标 */
      var ux = Math.round(z.bx + R.cursor * z.bw);
      g.fillStyle(SB.C.WHITE, 1);
      g.fillRect(SB.clamp(ux - 1, z.bx, z.bx + z.bw - 2), z.by - 3, 2, z.bh + 6);
      /* 门还有多远。平时这个数字是刻意不给的（靠声音），
       * 但这一段是动作，反馈必须给死，不然玩家只会觉得莫名其妙就输了。 */
      var left = Math.round(SB.clamp(R.leftMs() / 9000, 0, 1) * z.dw);
      g.fillStyle(SB.C.GREY2, 1);
      g.fillRect(z.dx, z.dy, z.dw, 3);
      g.fillStyle(left < z.dw * 0.34 ? SB.C.RED4 : SB.C.YEL3, 1);
      g.fillRect(z.dx, z.dy, left, 3);
    },

    /* 收拾完了（或者本来就没什么可收拾的）：回客厅 */
    finishRescue: function () {
      if (this.leaving || this.busted) return;
      var self = this;
      var grade = SB.Rescue.settle();
      SB.Rescue.stop();
      this.rescueOn = false;
      this.rescueBox.setVisible(false);
      if (this.guide) this.guide.clear();
      if (this.game_) { this.game_.destroy(); this.game_ = null; }
      this.gameRoot.setVisible(false);
      SB.Audio.stopBgm();
      SB.Audio.stopAllLoops();
      this.leaving = true;
      this.crt.powerOff(function () {
        SB.UI.fadeOut(self, 200, function () {
          self.scene.start('Room', { from: 'rescue', grade: grade });
        });
      });
    },

    /* ---------------- 触屏：多一个红色「收拾」大按钮 ---------------- */
    buildTouch: function () {
      var self = this;
      if (!SB.Input.wantTouch()) { this.pad = null; return; }
      this.pad = new SB.TouchPad(this, { twoP: false });
      this.escBtn = this.add.container(0, 0).setDepth(SB.D.TOUCH + 4).setVisible(false);
      var g = this.add.graphics();
      g.fillStyle(SB.C.RED3, 0.9); g.fillRect(0, 0, 62, 20);
      g.lineStyle(1, SB.C.YEL4, 1); g.strokeRect(0, 0, 62, 20);
      this.escLabel = SB.Text.add(this, 8, 5, '收拾', 12, SB.C.WHITE);
      this.escBtn.add([g, this.escLabel]);
      this.escBtn.setPosition(SB.W - 70, 26);
      var zone = this.add.zone(SB.W - 70, 26, 62, 20).setOrigin(0, 0).setInteractive();
      /* 手指点的是同一颗按钮：还没开始收拾就是「开始」，开始了就是「按一下」 */
      zone.on('pointerdown', function () {
        if (!self.escBtn.visible) return;
        if (self.rescueOn) self.judgeRescue();
        else self.startRescue(false);
      });
      this.escBtn.add(zone);
    },

    /* ---------------- 桌面端的「离开」小按钮 ----------------
     * 电视右侧木框上那颗按钮。鼠标玩家在这一屏里原本无路可走：
     * 屏幕上没有任何可点的东西，退出只能靠 Enter/ESC——猜得到才算你厉害。
     * 点它一律先开暂停菜单，绝不直接关电视：手一抖丢掉一整局是最气人的。
     * 触屏那套自带红色「关电视」按钮，就不再叠一颗。 */
    buildLeaveBtn: function () {
      if (this.pad) return;
      var self = this;
      this.leaveBtn = SB.UI.corner(this, '离开', function () {
        if (self.leaving) return;
        if (self.pauseMenu && self.pauseMenu.isOpen()) return;
        self.openPause();
      }, { width: 48, y: 6, depth: SB.D.CRT + 22 });
    },

    /* ---------------- START ---------------- */
    onStart: function () {
      if (this.leaving) return;
      /* 收拾到一半：START 也算「按一下」，手在哪个键上都能救 */
      if (this.rescueOn) { this.judgeRescue(); return; }
      if (this.warnLevel >= 1) { this.startRescue(false); return; }
      if (this.pauseMenu && this.pauseMenu.isOpen()) return;
      this.openPause();
    },

    openPause: function () {
      var self = this;
      /* 收拾到一半不许开菜单：菜单里有「关电视，回客厅」，
       * 那就等于给这一段留了一条后门，按一下就能跳过手忙脚乱。 */
      if (this.rescueOn) { this.judgeRescue(); return; }
      SB.Audio.sfx('ui_confirm');
      this.paused = true;
      if (this.game_) this.game_.paused = true;
      if (this.guide) this.guide.hideCard(true);
      /* 菜单开着的时候 A 是「确认」，不是「往左走」 */
      SB.Input.setMove1P(false);
      this.pauseMenu = SB.UI.menu(this, {
        title: '暂 停',
        items: [
          { label: '继续游戏', value: 'on' },
          { label: '看按键说明', sub: '这张卡怎么玩', value: 'keys' },
          { label: '按一下 RESET', sub: '主机复位，重开这局', value: 'reset' },
          { label: '关电视，回客厅', value: 'quit' }
        ],
        onPick: function (it) {
          self.resume();
          if (it.value === 'reset') self.hitReset();
          else if (it.value === 'quit') self.exit('quit');
          else if (it.value === 'keys' && self.guide) self.guide.showCard();
        },
        onCancel: function () { self.resume(); }
      });
    },

    resume: function () {
      this.paused = false;
      if (this.game_) this.game_.paused = false;
      if (this.pauseMenu) { this.pauseMenu.close(); this.pauseMenu = null; }
      /* 回到游戏里，WASD 重新是方向键 */
      if (!this.twoP && !this.leaving) SB.Input.setMove1P(true);
    },

    /* 主机上那个小小的 RESET 键 */
    hitReset: function () {
      if (this.leaving) return;
      var self = this;
      SB.Audio.sfx('console_reset');
      /* 卡带脏的时候，一按 RESET 反而可能把画面按花 */
      var fc = SB.Repair.failChance(this.cartId) * 0.5;
      this.flashScreen(SB.C.WHITE, 60);
      if (this.game_) { this.game_.destroy(); this.game_ = null; }
      this.time.delayedCall(220, function () {
        if (SB.chance(fc)) { self.midFault(true); return; }
        self.startGame();
      });
    },

    /* ---------------- 打到一半突然花屏 ---------------- */
    midFault: function (force) {
      if (this.leaving || this.faulting) return;
      this.faulting = true;
      var self = this;
      if (this.guide) this.guide.clear();
      var fault = SB.Repair.rollFault(this.cartId, !force);
      SB.Save.d.fault = fault;
      SB.Save.d.tvOn = true;
      SB.Save.save();

      if (this.game_) { this.game_.destroy(); this.game_ = null; }
      this.gameRoot.setVisible(false);
      this.crt.setFault(fault);
      this.cameras.main.shake(180, 0.006);

      var tip = this.add.rectangle(SB.SCREEN.x, 240, SB.SCREEN.w, 22, SB.C.INK, 0.8)
        .setOrigin(0, 0).setDepth(SB.D.OVERLAY);
      var t = SB.Text.add(this, SB.SCREEN.x + SB.SCREEN.w / 2, 246,
        SB.line(SB.L.game.midFault), 12, SB.C.YEL4).setOrigin(0.5, 0).setDepth(SB.D.OVERLAY + 1);
      this.tweens.add({ targets: [tip, t], alpha: 0.15, duration: 500, yoyo: true, repeat: 3 });

      this.time.delayedCall(2400, function () { self.exit('fault'); });
    },

    /* ---------------- 妈妈进门 ---------------- */
    onBusted: function (res) {
      if (this.busted || this.leaving) return;
      this.busted = true;
      var self = this;
      /* 收拾到一半被堵在门口：那几下算白按了，但要记一笔，
       * 不然「差一点就成了」这件事在存档里一点痕迹都没有。 */
      if (this.rescueOn) {
        SB.Rescue.settle();
        SB.Rescue.stop();
        this.rescueOn = false;
        this.rescueBox.setVisible(false);
      }
      if (this.guide) this.guide.clear();
      SB.Audio.stopBgm();
      SB.Audio.sfx('door_open');
      this.crt.setFault(null);
      this.cameras.main.shake(320, 0.01);
      this.flashScreen(SB.C.WHITE, 90);
      this.time.delayedCall(420, function () {
        self.leaving = true;
        SB.UI.fadeOut(self, 260, function () {
          self.scene.start('Room', { from: 'busted', result: res });
        });
      });
    },

    /* 从暂停菜单里关电视回客厅：这是从容的退出，不走抢救那一套 */
    emergency: function () {
      if (this.leaving) return;
      if (this.guide) this.guide.clear();
      SB.Parent.actions.tvOff();
      if (this.game_) { this.game_.destroy(); this.game_ = null; }
      this.gameRoot.setVisible(false);
      SB.Audio.stopBgm();
      SB.Audio.stopAllLoops();
      var self = this;
      this.leaving = true;
      this.crt.powerOff(function () {
        SB.UI.fadeOut(self, 200, function () {
          self.scene.start('Room', { from: 'panic' });
        });
      });
    },

    /* 正常退出（关掉电视回客厅） */
    exit: function (reason) {
      if (this.leaving) return;
      this.leaving = true;
      var self = this;
      if (this.guide) this.guide.clear();
      SB.Audio.stopBgm();
      SB.Audio.stopAllLoops();

      /* 玩久了时间就过去了 */
      if (this.playMs > 45000 && !this.atFriend) SB.Time.nextSlot();
      SB.Save.d.stats.playMs = (SB.Save.d.stats.playMs || 0) + Math.floor(this.playMs);
      SB.Save.save();

      var target = this.atFriend ? 'Friend' : 'Room';
      if (reason === 'fault') {
        /* 花屏了：回客厅继续修 */
        SB.UI.fadeOut(this, 220, function () { self.scene.start(target, { from: 'fault' }); });
        return;
      }
      SB.Parent.actions.tvOff();
      this.crt.powerOff(function () {
        SB.UI.fadeOut(self, 220, function () { self.scene.start(target, { from: 'play' }); });
      });
    },

    /* ---------------- 小游戏结束回调 ---------------- */
    onGameOver: function (g, delay) {
      var self = this, S = SB.SCREEN;
      var box = this.add.container(0, 0).setDepth(SB.D.DIALOG);
      var bg = this.add.rectangle(S.x + S.w / 2, 118, 160, 54, SB.C.INK, 0.86).setOrigin(0.5, 0);
      var t1 = SB.Text.add(this, S.x + S.w / 2, 126, 'GAME OVER', 16, SB.C.RED4).setOrigin(0.5, 0);
      var t2 = SB.Text.add(this, S.x + S.w / 2, 150, '得分 ' + g.score, 12, SB.C.GREY8).setOrigin(0.5, 0);
      box.add([bg, t1, t2]);
      this.recordScore(g);
      this.time.delayedCall(delay, function () {
        box.destroy();
        if (self.leaving) return;
        /* 再来一局 */
        if (self.game_) { self.game_.destroy(); self.game_ = null; }
        self.startGame();
      });
    },

    onCleared: function (g) {
      var self = this, S = SB.SCREEN;
      this.recordScore(g);
      var t = SB.Text.add(this, S.x + S.w / 2, 120, '通 关 了 ！', 16, SB.C.YEL3)
        .setOrigin(0.5, 0).setDepth(SB.D.DIALOG);
      SB.Save.d.stats.cleared = (SB.Save.d.stats.cleared || 0) + 1;
      /* 通关是这个夏天为数不多的大好事：卡上留一笔，心情上也留一笔。 */
      var cs = SB.Save.d.carts[this.cartId];
      var first = !!(cs && !cs.cleared);
      if (cs) cs.cleared = true;
      if (SB.Story) SB.Story.addMood(first ? 'cleared' : 4, 'cleared');
      SB.Save.save();
      this.time.delayedCall(2600, function () { t.destroy(); if (!self.leaving) self.exit('clear'); });
    },

    recordScore: function (g) {
      var cs = SB.Save.d.carts[this.cartId];
      if (cs && g.score > (cs.best || 0)) { cs.best = g.score; SB.Save.save(); }
    },

    /* ---------------- 供小游戏调用的画面反馈 ---------------- */
    shakeScreen: function (ms, amt) {
      /* 设置里关掉抖动的人，是真的会被抖到难受，别替他做决定 */
      if (SB.Save.d.settings.shake === false) return;
      this.cameras.main.shake(ms, (amt || 2) / 600);
    },
    flashScreen: function (color, ms) {
      var S = SB.SCREEN;
      var r = this.add.rectangle(S.x, S.y, S.w, S.h, color === undefined ? SB.C.WHITE : color, 0.75)
        .setOrigin(0, 0).setDepth(SB.D.CRT - 1);
      this.tweens.add({ targets: r, alpha: 0, duration: ms || 80, onComplete: function () { r.destroy(); } });
    },

    /* ---------------- 主循环 ---------------- */
    update: function (time, delta) {
      var dt = Math.min(delta, 50);
      SB.Input.update();
      this.crt.update(dt);

      if (SB.Input.p1.just.start) this.onStart();
      if (this.paused || this.leaving) return;

      /* 抢救那几秒：小游戏停着，妈妈的秒表照跑。
       * 这一段独占 A 键，别的都先放下。 */
      if (this.rescueOn) {
        if (!this.atFriend) SB.Parent.update(dt);
        SB.Rescue.update(dt);
        this.drawRescue();
        if (this.judgeT > 0) {
          this.judgeT -= dt;
          if (this.judgeT <= 0) this.rJudge.setText('');
        }
        if (SB.Input.p1.just.a || SB.Input.p1.just.b) this.judgeRescue();
        return;
      }

      this.playMs += dt;

      /* 妈妈的秒表 */
      if (!this.atFriend) SB.Parent.update(dt);

      /* 卡带越脏，打到一半花屏的概率越高（每 6 秒判定一次） */
      this.midFaultT += dt;
      if (this.midFaultT > 6000) {
        this.midFaultT = 0;
        var cs = SB.Save.d.carts[this.cartId] || {};
        var p = ((cs.dirt || 0) * 0.00055 + (cs.wear || 0) * 0.00035) * (SB.Save.d.flags.hot ? 1.6 : 1);
        if (SB.chance(p)) this.midFault(false);
      }

      /* 警告条闪烁 */
      if (this.warnLevel >= 2 && this.warnTxt.visible) {
        this.warnTxt.setAlpha(Math.floor(time / 220) % 2 ? 1 : 0.35);
        this.warnFrame.setAlpha(Math.floor(time / 160) % 2 ? 0.9 : 0.2);
      }

      /* 按键指引：什么时候该讲、讲完了收成一条淡淡的键位条 */
      if (this.guide) this.guide.update(dt);

      if (this.game_ && !this.faulting) this.game_.update(dt);
    },

    cleanup: function () {
      if (this.onWarn && SB.Parent.ev) {
        SB.Parent.ev.off('warn', this.onWarn);
        SB.Parent.ev.off('arrive', this.onArrive);
      }
      if (this.guide) { this.guide.destroy(); this.guide = null; }
      if (this.game_) { this.game_.destroy(); this.game_ = null; }
      if (this.crt) this.crt.destroy();
      if (this.pad) this.pad.destroy();
      if (this.leaveBtn) { this.leaveBtn.destroy(); this.leaveBtn = null; }
      /* 键盘归位：WASD 还给 1P / 还回「确认」，A 键重新是「确认」 */
      SB.Input.setTwoP(false);
      SB.Input.setMove1P(false);
      if (this.maskShape) this.maskShape.destroy();
      SB.Audio.stopAllLoops();
    }
  });

})(window.SB);
