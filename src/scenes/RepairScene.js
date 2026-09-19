/* 修卡。这个游戏真正的主玩法。
 *
 * 卡带被拿到眼前：一张 168×116 的近景，金手指朝着你。
 * 你能做的事和 2004 年那个暑假一模一样——
 *   哈气：按住 A（或者真的对着麦克风吹）。哈得越久越湿，湿了更接触不良。
 *   划桌：左右来回推。前三下最管用，划多了就是在磨掉它的命。
 *   吹卡槽 / 棉签：一个治灰，一个治氧化，棉签用一次少一支。
 *   插回去：把它插回主机，屏住呼吸开电视。
 *
 * 界面上不写「正确解法」，只把现象和手感给你。故障提示里那句话，
 * 就是当年发小蹲在你旁边说的那句。 */
(function (SB) {
  'use strict';

  var CART = { x: 156, y: 96, w: 168, h: 116 };      // 卡带近景的摆放
  var LABEL = { dx: 28, dy: 26, w: 112, h: 62 };     // 贴纸窗（壳体内的透明矩形）
  var GOLD = { x: 156, y: 202, w: 168, h: 26 };      // 金手指特写（cart_fingers）
  /* 动作特写的取景框：140×116 的画中画。这四个数字是量着别的东西定的——
   * 左边让开脏污/磨损两根条（x≤112），右边让开按钮列（x≥340），
   * 下面让开金手指特写和底部提示条。改布局必须重新量。 */
  var ANIM = { x: 170, y: 60 };

  SB.RepairScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function RepairScene() { Phaser.Scene.call(this, { key: 'Repair' }); },

    init: function (data) {
      var d = data || {};
      this.cartId = d.cartId || SB.Save.d.inserted;
      this.back = d.from || 'Room';
      this.session = {};
      this.busy = false;

      /* 哈气：按住时蓄气，松手时结算。power 就是你哈的那口气的长度。 */
      this.blowing = false;
      this.blowPower = 0;

      /* 划桌：需要真的来回推，单向按住不算一下 */
      this.rubDir = 0;
      this.rubCount = 0;
      this.rubCooldown = 0;
      this.pendingRub = 0;

      this.micLevel = 0;

      /* 动作特写：表现层。看第几遍决定放多长（越看越短，但两下/两口气永远都在）。
       * pendingFix 是"动画放完（或被跳过）之后要结算的那一下"，绝不允许丢。 */
      this.animSeen = { blow: 0, rub: 0 };
      this.pendingFix = null;
    },

    /* 两张动作图只有修卡台用得上，就在这一屏自己加载，不去动全局资源清单 */
    preload: function () {
      if (SB.RepairAnim && SB.RepairAnim.preload) SB.RepairAnim.preload(this);
    },

    create: function () {
      var self = this, s = SB.Save.d;
      this.cart = SB.CART_BY_ID[this.cartId];
      this.cs = s.carts[this.cartId];

      this.cameras.main.setBackgroundColor('#100e12');
      this.drawScene();
      this.buildHud();
      this.buildButtons();
      this.buildAnim();

      SB.Audio.bgm('bgm_room');
      if (s.settings.mic) this.enableMic();

      /* 抬头看一眼电视：修卡的时候电视还开着，你能听见雪花声 */
      if (s.tvOn && s.fault) SB.Audio.loop('tv_static', 0.16);

      this.events.once('shutdown', function () { self.cleanup(); });
      SB.UI.fadeIn(this, 260);
      this.say([SB.line(SB.L.repair.enter), this.faultHint()]);
    },

    faultHint: function () {
      var f = SB.FAULT[SB.Save.d.fault];
      return f ? f.hint : '现在画面是好的。插回去就能玩。';
    },

    /* ---------------------------------------------------------------- 画面 */
    drawScene: function () {
      var s = SB.Save.d;

      /* 背景：昏暗的客厅一角 + 电视桌的桌面（划卡带就在这张桌上） */
      if (this.textures.exists('bg_room')) {
        this.add.image(0, 0, 'bg_room').setOrigin(0, 0).setDepth(SB.D.BG).setTint(0x3a3a48);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.GREY2, 1).setOrigin(0, 0).setDepth(SB.D.BG);
      }
      this.add.rectangle(0, 232, SB.W, 38, SB.C.WOOD4, 1).setOrigin(0, 0).setDepth(SB.D.FURNITURE);
      this.add.rectangle(0, 232, SB.W, 2, SB.C.WOOD2, 1).setOrigin(0, 0).setDepth(SB.D.FURNITURE + 1);

      /* 桌面上被划出来的痕迹：磨得越狠，痕迹越多（也就是卡带的伤） */
      if (this.textures.exists('cart_scratch')) {
        this.scratch = this.add.image(CART.x, 150, 'cart_scratch', SB.Repair.scratchFrame(this.cartId))
          .setOrigin(0, 0).setDepth(SB.D.FURNITURE + 2).setAlpha(0.75);
      }

      /* 卡带本体：白模染色 + 贴纸 */
      this.cartBody = this.add.container(CART.x, CART.y).setDepth(SB.D.PROP);
      var shell;
      if (this.textures.exists('cart_big_shell')) {
        shell = this.add.image(0, 0, 'cart_big_shell').setOrigin(0, 0);
        shell.setTint(SB.CART_TINT[this.cartId] || SB.C.GREY6);
      } else {
        shell = this.add.rectangle(0, 0, CART.w, CART.h, SB.CART_TINT[this.cartId] || SB.C.GREY6, 1).setOrigin(0, 0);
      }
      this.cartBody.add(shell);

      var lk = 'cart_label_' + this.cartId;
      if (this.textures.exists(lk)) {
        this.cartBody.add(this.add.image(LABEL.dx, LABEL.dy, lk).setOrigin(0, 0));
      } else {
        var lb = this.add.rectangle(LABEL.dx, LABEL.dy, LABEL.w, LABEL.h, SB.C.GREY8, 1).setOrigin(0, 0);
        this.cartBody.add(lb);
        this.cartBody.add(SB.Text.add(this, LABEL.dx + 6, LABEL.dy + 8, this.cart ? this.cart.name : '', 12, SB.C.INK));
      }

      /* 金手指特写：脏污三档 */
      if (this.textures.exists('cart_fingers')) {
        this.gold = this.add.image(GOLD.x, GOLD.y, 'cart_fingers', SB.Repair.fingerFrame(this.cartId))
          .setOrigin(0, 0).setDepth(SB.D.PROP + 2);
      } else {
        this.gold = this.add.rectangle(GOLD.x, GOLD.y, GOLD.w, GOLD.h, SB.C.YEL2, 1)
          .setOrigin(0, 0).setDepth(SB.D.PROP + 2);
      }

      /* 哈气的白雾 */
      if (this.textures.exists('breath_puff')) {
        this.puff = this.add.sprite(GOLD.x + GOLD.w / 2, GOLD.y - 6, 'breath_puff', 0)
          .setOrigin(0.5, 1).setDepth(SB.D.FRONT_PROP).setVisible(false);
        if (!this.anims.exists('puff_anim')) {
          this.anims.create({
            key: 'puff_anim', frameRate: 12, repeat: -1,
            frames: this.anims.generateFrameNumbers('breath_puff', { start: 0, end: 5 })
          });
        }
      }
      /* 灰尘与火花（划桌、插拔时飞出来的东西） */
      this.dustPool = [];
    },

    buildHud: function () {
      var s = SB.Save.d;
      var self = this;
      this.hud = SB.UI.hud(this);
      /* 提示条平时写着这一屏能按什么键；一有操作反馈就临时被结果顶掉 */
      this.baseHint = function () {
        return SB.Input.tip([['a', '哈气'], ['lr', '在桌上划'], ['start', '插回去开电视'], ['b', '先放着']]);
      };
      this.hint = SB.UI.hint(this, this.baseHint);
      this.backBtn = SB.UI.corner(this, '← 先放着', function () {
        if (self.eatAsSkip()) return;                 // 演到一半点它 = 先跳过
        if (!self.busy) self.leave();
      });

      /* 两根条：脏污（能修）与磨损（不可逆）。刻意做成一根绿一根红。 */
      var x = 20, y = 34;
      this.add.rectangle(x, y, 92, 6, SB.C.INK, 0.7).setOrigin(0, 0).setDepth(SB.D.HUD);
      this.dirtBar = this.add.rectangle(x + 1, y + 1, 90, 4, SB.C.GRN4, 1).setOrigin(0, 0).setDepth(SB.D.HUD + 1);
      this.dirtLab = SB.Text.add(this, x, y + 9, '', 12, SB.C.GREY7).setDepth(SB.D.HUD + 1);

      this.add.rectangle(x, y + 26, 92, 6, SB.C.INK, 0.7).setOrigin(0, 0).setDepth(SB.D.HUD);
      this.wearBar = this.add.rectangle(x + 1, y + 27, 90, 4, SB.C.RED4, 1).setOrigin(0, 0).setDepth(SB.D.HUD + 1);
      this.wearLab = SB.Text.add(this, x, y + 35, '', 12, SB.C.GREY7).setDepth(SB.D.HUD + 1);

      /* 哈气的气量条：只有在按住的时候才出现 */
      this.blowBar = this.add.rectangle(GOLD.x, GOLD.y + 30, 0, 4, SB.C.BLU5, 1)
        .setOrigin(0, 0).setDepth(SB.D.HUD + 1).setVisible(false);
      this.blowMark = this.add.rectangle(GOLD.x + Math.round(168 * 0.55), GOLD.y + 28, 1, 8, SB.C.GRN4, 1)
        .setOrigin(0, 0).setDepth(SB.D.HUD + 2).setVisible(false);
      this.blowMark2 = this.add.rectangle(GOLD.x + Math.round(168 * 0.85), GOLD.y + 28, 1, 8, SB.C.YEL3, 1)
        .setOrigin(0, 0).setDepth(SB.D.HUD + 2).setVisible(false);

      this.refresh();
    },

    /* ---------------------------------------------------------------- 按钮 */
    buildButtons: function () {
      var self = this, s = SB.Save.d;
      var bx = 340, by = 40, gap = 24;

      this.btns = [];
      var mk = function (label, sub, cb) {
        var b = SB.UI.button(self, bx, by, 128, label, function () {
          if (self.eatAsSkip()) return;               // 特写没演完，先当跳过
          if (!self.busy) cb();
        }, { sub: sub });
        by += gap;
        self.btns.push(b);
        return b;
      };

      mk('哈气', '按住 ' + SB.Input.keyName('a'), function () {
        self.hintMsg('按住 ' + SB.Input.keyName('a') + '（或长按卡带）对着金手指哈气');
      });
      mk('在桌上划', '左右推', function () {
        self.hintMsg('按住 ' + SB.Input.keyName('lr') + ' 来回推，或者用鼠标在卡带上左右划');
      });
      mk('吹卡槽', '', function () { self.doPuff(); });
      mk('用棉签擦', '剩 ' + (s.goods.swab || 0) + ' 支', function () { self.doSwab(); });
      mk('插回去，开电视', '', function () { self.insertAndBoot(); });
      mk('先放着', '', function () { self.leave(); });

      /* 长按哈气：卡带区域与「哈气」按钮都能按住 */
      var zone = this.add.zone(CART.x, CART.y, CART.w, CART.h + 34).setOrigin(0, 0)
        .setDepth(SB.D.FOCUS).setInteractive({ draggable: true });
      zone.on('pointerdown', function (p) { self.beginBlow(); self.lastPx = p.x; });
      zone.on('pointerup', function () { self.endBlow(); });
      zone.on('pointerout', function () { self.endBlow(); });
      /* 鼠标/手指左右划 = 在桌上划两下 */
      zone.on('pointermove', function (p) {
        if (!p.isDown) return;
        var dx = p.x - (self.lastPx || p.x);
        if (Math.abs(dx) > 14) {
          self.lastPx = p.x;
          var dir = dx > 0 ? 1 : -1;
          if (dir !== self.rubDir) { self.rubDir = dir; self.strokeOnce(); }
        }
      });
      this.zone = zone;
    },

    /* 临时提示：过几秒自己退回默认的键位说明，别让一行反馈永远挂在那儿 */
    hintMsg: function (t, tint) {
      var self = this;
      this.hint.set(t);
      this.hint.setTint(tint === undefined ? SB.C.GREY7 : tint);
      if (this.hintTimer) this.hintTimer.remove(false);
      this.hintTimer = this.time.delayedCall(3600, function () {
        if (!self.hint) return;
        self.hint.set(self.baseHint);
        self.hint.setTint(SB.C.GREY7);
      });
    },

    /* ---------------------------------------------------------------- 动作特写 */
    buildAnim: function () {
      this.animBusy = false;
      this.animOn = !!(SB.RepairAnim && SB.RepairAnim.ready(this));
      if (!SB.RepairAnim) return;
      this.anim = new SB.RepairAnim.Player(this, { x: ANIM.x, y: ANIM.y });
      this.anim.build();
    },

    /* 正在演的时候，所有操作先当"跳过"用；返回 true 表示这一下被吃掉了 */
    eatAsSkip: function () {
      if (!this.animBusy || !this.anim) return false;
      this.anim.skip();
      return true;
    },

    locked: function () { return this.busy || this.animBusy; },

    /* 特写一上来就把卡带近景压暗：让观众知道该看哪儿，也免得两个卡带互相打架 */
    dimCart: function (on) {
      if (this.cartBody && this.cartBody.setAlpha) this.cartBody.setAlpha(on ? 0.25 : 1);
      if (this.scratch && this.scratch.setAlpha) this.scratch.setAlpha(on ? 0.2 : 0.75);
    },

    /* 开演。返回 false = 没有动画可放（缺图 / 模块没加载），调用方自己直接结算。 */
    playAnim: function (kind) {
      if (!this.anim || !this.animOn) return false;
      var self = this;
      var seen = this.animSeen[kind]++;
      var plan = SB.RepairAnim.plan(kind, seen);
      this.animBusy = true;
      this.animPlan = plan;
      this.dimCart(true);
      this.anim.run(kind, plan.names, {
        speed: plan.speed,
        onPhase: function (ph) { self.onAnimBeat(kind, ph); },
        onDone: function () {
          self.animBusy = false;
          self.dimCart(false);
          if (self.puff) { self.puff.setVisible(false); self.puff.stop(); }
          self.flushFix();
        }
      });
      return true;
    },

    /* 每一拍落地时，卡带本体上也给一点同步的反馈（声音、白雾、掉灰） */
    onAnimBeat: function (kind, phase) {
      if (kind === 'blow') {
        if (phase === 'push1' || phase === 'push2') {
          SB.Audio.sfx('cart_blow');
          if (this.puff) { this.puff.setVisible(true).play('puff_anim'); }
          this.spawnDust(GOLD.x + SB.rndInt(20, 148), GOLD.y + 2, 4);
        } else if (this.puff) {
          this.puff.setVisible(false); this.puff.stop();
        }
      } else if (phase === 'stroke1' || phase === 'stroke2') {
        SB.Audio.sfx('cart_rub');
        this.spawnDust(CART.x + SB.rndInt(20, 140), CART.y + CART.h - 4, 4);
      }
    },

    /* 动画放完 / 被跳过 / 离场时，把攒着的那一次结算真正执行掉。只会执行一次。 */
    flushFix: function () {
      var fn = this.pendingFix;
      if (!fn) return;
      this.pendingFix = null;
      fn();
    },

    /* ---------------------------------------------------------------- 哈气 */
    beginBlow: function () {
      if (this.eatAsSkip()) return;
      if (this.busy || this.blowing) return;
      this.blowing = true;
      this.blowPower = 0;
      if (this.puff) { this.puff.setVisible(true).play('puff_anim'); }
      SB.Audio.loop('cart_blow', 0.5);
      this.blowBar.setVisible(true);
      this.blowMark.setVisible(true);
      this.blowMark2.setVisible(true);
      /* 特写同步进"准备 → 蓄力"：鼓腮的档位就是蓄力条的读数 */
      if (this.anim && this.animOn) {
        this.anim.startCharge('blow');
        this.anim.setCharge(0);
        this.dimCart(true);
      }
    },

    endBlow: function () {
      if (!this.blowing) return;
      this.blowing = false;
      if (this.puff) { this.puff.setVisible(false); this.puff.stop(); }
      SB.Audio.stopLoop('cart_blow');
      this.blowBar.setVisible(false);
      this.blowMark.setVisible(false);
      this.blowMark2.setVisible(false);

      var power = SB.clamp(this.blowPower, 0, 1.2);
      /* 数值还是原来那一句，参数一个不动；只是把"什么时候算"挪到动作演完。
       * 跳过动画也照样会走到 flushFix，所以结算永远不会丢。 */
      var self = this;
      this.pendingFix = function () {
        var r = SB.Repair.blow(self.cartId, power, self.session);
        self.afterFix('blow', r);
      };
      if (!this.playAnim('blow')) { this.dimCart(false); this.flushFix(); }
    },

    /* ---------------------------------------------------------------- 划桌 */
    strokeOnce: function () {
      if (this.busy || this.animBusy || this.rubCooldown > 0) return;
      this.rubCooldown = 130;
      this.pendingRub++;
      SB.Audio.sfx('cart_rub');
      this.spawnDust(CART.x + SB.rndInt(20, 140), CART.y + CART.h - 4);

      /* 卡带在桌上滑动一下的位移感 */
      var self = this;
      this.tweens.add({
        targets: this.cartBody, x: CART.x + this.rubDir * 6, duration: 70, yoyo: true,
        onComplete: function () { self.cartBody.x = CART.x; }
      });

      /* 连续划动，攒够一下结算一次（避免每一小步都弹字） */
      if (this.rubTimer) this.rubTimer.remove();
      this.rubTimer = this.time.delayedCall(320, function () { self.settleRub(); });
    },

    settleRub: function () {
      if (!this.pendingRub) return;
      var n = this.pendingRub;
      this.pendingRub = 0;
      var self = this;
      /* 同哈气：数值这一句原样保留（还是"这一串一共划了 n 下"），
       * 只是等特写把两下演完再算；跳过动画一样会算。 */
      this.pendingFix = function () {
        var r = SB.Repair.rub(self.cartId, n, self.session);
        self.afterFix('rub', r);
        if (r.warn) SB.UI.toast(self, SB.line(SB.L.repair.wearWarn), 2400);
        if (r.dead) {
          self.busy = true;
          SB.Audio.sfx('ui_error');
          self.say(SB.L.repair.dead, function () { self.busy = false; self.leave(); });
        }
      };
      if (!this.playAnim('rub')) this.flushFix();
    },

    /* ---------------------------------------------------------------- 其他手法 */
    doPuff: function () {
      var r = SB.Repair.puff(this.session);
      SB.Audio.sfx('cart_blow');
      this.spawnDust(SB.W / 2, 244, 6);
      this.afterFix('puff', r);
    },

    doSwab: function () {
      var r = SB.Repair.swab(this.cartId);
      if (!r.ok) { SB.Audio.sfx('ui_error'); this.say([r.msg]); return; }
      SB.Audio.sfx('cart_rub');
      this.afterFix('swab', r);
      /* 按钮上的剩余支数要跟着变 */
      if (this.btns[3] && this.btns[3].setSub) this.btns[3].setSub('剩 ' + SB.Save.d.goods.swab + ' 支');
    },

    /* 一次操作之后：更新数值、说一句话、看看是不是治好了 */
    afterFix: function (action, r) {
      var s = SB.Save.d;
      this.refresh();

      /* 对症才算真治好；不对症的操作只是让卡带更脏或更旧 */
      var cured = false;
      if (s.fault && r.ok && SB.Repair.isRightFix(s.fault, action)) cured = true;
      /* 棉签是万能的，脏污直接清掉一大半 */
      if (s.fault && action === 'swab' && r.ok && SB.chance(0.85)) cured = true;

      if (cured) { s.fixedPending = true; SB.Save.save(); }

      var msg = r.msg;
      if (r.dirtDelta) msg += '　（脏 ' + (r.dirtDelta > 0 ? '+' : '') + r.dirtDelta + '）';
      if (r.wearDelta) msg += '　（磨损 +' + r.wearDelta + '）';
      this.hintMsg(msg, (r.worse || r.ok === false) ? SB.C.RED5 : SB.C.GRN5);
    },

    /* ---------------------------------------------------------------- 插回去 */
    insertAndBoot: function () {
      var self = this, s = SB.Save.d;
      this.busy = true;
      if (this.cs.dead) { this.say(SB.L.repair.dead, function () { self.busy = false; }); return; }

      SB.Audio.sfx('cart_insert');
      s.inserted = this.cartId;
      s.seated = true;
      SB.Save.save();

      /* 卡带被推进卡槽：一个短促的位移 + 咔哒 */
      this.tweens.add({
        targets: this.cartBody, y: CART.y + 10, alpha: 0.2, duration: 220,
        onComplete: function () {
          var res = SB.Repair.attempt(self.cartId, true);
          s.tvOn = true;
          s.fault = res.fault;
          s.fixedPending = false;
          SB.Save.save();
          if (!res.fault) {
            SB.Audio.sfx('boot_jingle');
            s.stats.repairs++;
            SB.Save.save();
            self.session = {};
            SB.UI.toast(self, '「叮——」出画面了。', 1200);
            self.time.delayedCall(700, function () {
              SB.UI.go(self, 'Play', { cartId: self.cartId });
            });
          } else {
            SB.Audio.sfx('cart_dirty_fail');
            self.cartBody.setAlpha(1).setY(CART.y);
            self.busy = false;
            self.refresh();
            self.say([SB.line(SB.L.repair.stillBad), self.faultHint()]);
          }
        }
      });
    },

    leave: function () {
      /* 演到一半就走：先把动画收掉（结算随之落地），再离场 */
      if (this.anim && this.anim.isRunning()) this.anim.skip();
      SB.Audio.stopLoop('cart_blow');
      SB.UI.go(this, 'Room', { from: 'repair' });
    },

    /* ---------------------------------------------------------------- 麦克风彩蛋 */
    enableMic: function () {
      var self = this;
      SB.Mic.enable().then(function (ok) {
        if (!ok) { self.hintMsg(SB.line(SB.L.repair.micFail)); return; }
        self.micOn = true;
        SB.UI.toast(self, SB.line(SB.L.repair.micOn), 2600);
      });
    },

    /* ---------------------------------------------------------------- 刷新 */
    refresh: function () {
      var c = this.cs;
      this.dirtBar.width = Math.max(1, Math.round(90 * (1 - c.dirt / 100)));
      this.dirtBar.fillColor = c.dirt < 30 ? SB.C.GRN4 : (c.dirt < 65 ? SB.C.YEL3 : SB.C.RED4);
      this.dirtLab.setText('金手指　' + (c.dirt < 25 ? '干净' : c.dirt < 55 ? '发黄' : c.dirt < 80 ? '氧化' : '发黑'));

      this.wearBar.width = Math.max(1, Math.round(90 * (c.wear / 100)));
      this.wearLab.setText('磨损　' + Math.round(c.wear) + '%（不可逆）');

      if (this.gold && this.gold.setFrame) this.gold.setFrame(SB.Repair.fingerFrame(this.cartId));
      if (this.scratch && this.scratch.setFrame) this.scratch.setFrame(SB.Repair.scratchFrame(this.cartId));
      this.hud.refresh();
    },

    spawnDust: function (x, y, n) {
      n = n || 3;
      for (var i = 0; i < n; i++) {
        var o;
        if (this.textures.exists('dust')) o = this.add.sprite(x, y, 'dust', SB.rndInt(0, 3));
        else o = this.add.rectangle(x, y, 2, 2, SB.C.GREY7, 1);
        o.setDepth(SB.D.FRONT_PROP);
        this.tweens.add({
          targets: o, x: x + SB.rnd(-18, 18), y: y - SB.rnd(6, 22), alpha: 0,
          duration: SB.rnd(420, 760),
          onComplete: function () { o.destroy(); }
        });
      }
    },

    say: function (lines, cb) {
      var self = this;
      this.busy = true;
      SB.UI.dialog(this, lines, { onDone: function () { self.busy = false; if (cb) cb(); } });
    },

    /* ---------------------------------------------------------------- 主循环 */
    update: function (time, delta) {
      var dt = Math.min(delta, 50);
      SB.Input.update();
      var p = SB.Input.p1;

      if (this.rubCooldown > 0) this.rubCooldown -= dt;
      if (this.anim) this.anim.update(dt);

      /* 特写正在演：这一段只认"跳过"。任意键或点一下都算跳过，
       * 跳过之后 flushFix 会把这一次的数值照常结算掉。 */
      if (this.animBusy) {
        var anyKey = p.just.a || p.just.b || p.just.start || p.just.select ||
          p.just.left || p.just.right || p.just.up || p.just.down;
        if (anyKey || this.input.activePointer.isDown) this.anim.skip();
        return;
      }

      if (!this.busy) {
        /* 键盘：按住 A 哈气 */
        if (p.a && !this.blowing) this.beginBlow();
        if (!p.a && this.blowing && !this.pointerBlow) this.endBlow();

        /* 键盘：左右来回推 = 划桌 */
        if (p.just.left && this.rubDir !== -1) { this.rubDir = -1; this.strokeOnce(); }
        if (p.just.right && this.rubDir !== 1) { this.rubDir = 1; this.strokeOnce(); }

        if (p.just.b) this.leave();
        if (p.just.start) this.insertAndBoot();
      }

      /* 蓄气：按住越久 power 越大，超过 0.92 就会把卡带哈湿 */
      if (this.blowing) {
        var gain = dt / 900;
        /* 开了麦克风就用真实吹气强度来推进（吹得越猛越快） */
        if (this.micOn) {
          this.micLevel = SB.Mic.read();
          gain = dt / 900 * (0.35 + this.micLevel * 1.8);
        }
        this.blowPower = SB.clamp(this.blowPower + gain, 0, 1.2);
        this.blowBar.setVisible(true);
        this.blowBar.width = Math.round(168 * Math.min(1, this.blowPower));
        this.blowBar.fillColor = this.blowPower < 0.3 ? SB.C.GREY6
          : (this.blowPower <= 0.85 ? SB.C.GRN4 : SB.C.RED4);
        if (this.puff) this.puff.setScale(0.7 + Math.min(1, this.blowPower) * 0.7);
        /* 蓄力条读数 = 鼓腮档位（0.92 是"哈湿了"的门槛，也就是腮鼓到顶） */
        if (this.anim && this.animOn) this.anim.setCharge(this.blowPower / 0.92);
      }
    },

    cleanup: function () {
      /* 走的时候如果还有一次没结算的操作（动画演到一半就离场），补上，别把数值吃掉 */
      if (this.anim) this.anim.cancel();
      this.animBusy = false;
      this.dimCart(false);
      try { this.flushFix(); } catch (e) { /* 场景已经在拆了，UI 更新失败无所谓 */ }
      if (this.anim) { this.anim.destroy(); this.anim = null; }
      SB.Audio.stopLoop('cart_blow');
      SB.Audio.stopLoop('tv_static');
      if (this.hud) this.hud.destroy();
      if (this.hint) this.hint.destroy();
      if (this.backBtn) this.backBtn.destroy();
    }
  });

})(window.SB);
