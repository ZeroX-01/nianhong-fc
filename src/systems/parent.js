/* 妈妈。
 *
 * 你在玩的每一秒，这个系统都在后台数秒。它会依次给出三级信号：
 *   1 楼下自行车铃      —— 还有时间，但心跳会开始变快
 *   2 楼道里的塑料拖鞋声 —— 该动手了
 *   3 钥匙插进锁孔      —— 基本来不及了
 * 门开的那一刻它检查四件事：电视关了吗、卡带拔了吗、藏好了吗、作业摊开了吗。
 *
 * 妈在家（在厨房做饭）时也能偷玩，只是留给你的时间短得多。 */
(function (SB) {
  'use strict';

  SB.Parent = {
    ev: null,
    state: 'idle',      // idle | armed | w1 | w2 | w3 | arrive
    t: 0,
    eta: 0,
    mode: 'out',        // out（妈出门了）| kitchen（妈在厨房）
    lastResult: null,

    init: function () {
      if (!this.ev) this.ev = new Phaser.Events.EventEmitter();
      return this;
    },

    /* 开始计时。mode 决定给你多少时间。 */
    arm: function (mode) {
      this.init();
      this.mode = mode || 'out';
      this.state = 'armed';
      this.t = 0;
      /* 被抓得多了，你会变得警觉，妈也会更早回来查你 */
      var s = SB.Save.d;
      var paranoia = 1 - Math.min(0.3, s.caught * 0.06);
      this.eta = (this.mode === 'kitchen' ? SB.rnd(26000, 52000) : SB.rnd(52000, 116000)) * paranoia;
      this.ev.emit('armed', this.mode);
    },

    disarm: function () {
      this.state = 'idle';
      this.t = 0;
      SB.Audio.stopLoop('heartbeat');
    },

    /* 剩余时间比例 0..1（1 = 刚开始） */
    remain: function () {
      if (this.state === 'idle') return 1;
      return SB.clamp(1 - this.t / this.eta, 0, 1);
    },

    update: function (dt) {
      if (this.state === 'idle' || this.state === 'arrive') return;
      this.t += dt;
      var p = this.t / this.eta;

      if (this.state === 'armed' && p >= 0.55) {
        this.state = 'w1';
        SB.Audio.sfx(this.mode === 'kitchen' ? 'fish_bubble' : 'bike_bell');
        this.ev.emit('warn', 1, this.mode);
      } else if (this.state === 'w1' && p >= 0.82) {
        this.state = 'w2';
        SB.Audio.sfx('footstep_stair');
        SB.Audio.loop('heartbeat', 0.3);
        this.ev.emit('warn', 2, this.mode);
      } else if (this.state === 'w2' && p >= 0.955) {
        this.state = 'w3';
        SB.Audio.sfx('door_key');
        this.ev.emit('warn', 3, this.mode);
      } else if (this.state === 'w3' && p >= 1) {
        this.state = 'arrive';
        SB.Audio.stopLoop('heartbeat');
        this.ev.emit('arrive', this.resolve());
      }
    },

    /* 门开了，清算 */
    resolve: function () {
      var s = SB.Save.d;
      var tvOn = !!s.tvOn;
      var cartIn = !!s.inserted;
      var hidden = !!s.hidden;
      /* 真写了作业，和只把本子摊开装样子，是两件不同的事 */
      var hwReal = s.homework >= 60;
      var hwFake = !hwReal && !!s.flags.bookOpen;
      var hw = hwReal || hwFake;

      var res = { tvOn: tvOn, cartIn: cartIn, hidden: hidden, homework: hw, level: 0, why: null, punish: null, lines: [] };

      if (tvOn) {
        res.level = 2;   // 现行
        res.why = 'tv';
      } else if (cartIn) {
        res.level = 1;   // 电视关了但卡带还插着，一眼就看出来
        res.why = 'cart';
      } else {
        res.level = 0;   // 安全
      }

      if (res.level === 0) {
        s.escaped++;
        s.momTrust = SB.clamp(s.momTrust + (hwReal ? 8 : (hwFake ? 4 : 2)), 0, 100);
        res.lines.push(SB.line(SB.L.mom.safe));
        if (hwFake) res.lines.push('她顺手翻了两页。还是三天前那一页。');
        if (!hidden && !hw) res.lines.push(SB.line(SB.L.mom.suspicious));
        if (SB.Story) SB.Story.addMood(hwReal ? 5 : 3, 'escape');
      } else {
        s.caught++;
        s.momTrust = SB.clamp(s.momTrust - (res.level === 2 ? 16 : 8), 0, 100);
        res.lines.push(SB.line(SB.L.mom.caught));
        /* 被抓的原因必须当场说明白，不然玩家永远学不会这一局到底漏了哪一步。
         * 硬条件只有两条：电视关了没、卡带拔了没。 */
        if (SB.L.story && SB.L.story.busted) {
          res.lines.push(SB.line(res.why === 'tv' ? SB.L.story.busted.tv : SB.L.story.busted.cart));
        }
        if (SB.Story) SB.Story.addMood(res.level === 2 ? -14 : -8, 'caught');

        /* 惩罚随累计次数升级；写了作业能降一档 */
        var n = s.caught - (hw ? 1 : 0);
        if (res.level === 1 || n <= 1) {
          res.punish = 'homework';
          res.lines.push(SB.line(SB.L.mom.punishHomework));
          s.homework = 100;
        } else if (n === 2) {
          res.punish = 'pad';
          res.lines.push(SB.line(SB.L.mom.punishPad));
          s.padGone = s.day + 1;
        } else {
          res.punish = 'cart';
          var id = s.inserted || s.hidden || (SB.Save.ownedCarts()[0] && SB.Save.ownedCarts()[0].id);
          if (id) { s.cartSeized = id; s.carts[id].owned = false; }
          res.lines.push(SB.line(SB.L.mom.punishCart));
        }
        /* 作业本救下来的那一档，也要让玩家看见它救了什么 */
        if (hw && s.caught > 1 && SB.L.story && SB.L.story.busted) {
          res.lines.push(SB.line(SB.L.story.busted.hwHelp));
        }
      }

      /* 妈回来了，本时段结束 */
      s.tvOn = false;
      s.__momHome = true;
      s.flags.momOut = false;
      SB.Save.save();
      this.lastResult = res;
      return res;
    },

    /* 玩家的应急操作，供场景调用 */
    actions: {
      tvOff: function () {
        if (!SB.Save.d.tvOn) return false;
        SB.Save.d.tvOn = false; SB.Save.save();
        SB.Audio.sfx('tv_power_off');
        return true;
      },
      pullCart: function () {
        var s = SB.Save.d;
        if (!s.inserted) return false;
        s.inserted = null; SB.Save.save();
        SB.Audio.sfx('cart_remove');
        return true;
      },
      hideCart: function (id) {
        var s = SB.Save.d;
        id = id || s.inserted || s.hidden;
        if (!id) return false;
        if (s.inserted === id) s.inserted = null;   /* 藏起来 = 先从卡槽里拔出来 */
        s.hidden = id; SB.Save.save();
        SB.Audio.sfx('hide_success');
        return true;
      },
      /* 只是把本子摊开、笔搭在上面 —— 骗过一眼，骗不过翻页 */
      openBook: function () {
        var s = SB.Save.d;
        if (s.homework >= 60 || s.flags.bookOpen) return false;
        s.flags.bookOpen = true;
        SB.Save.save();
        return true;
      }
    }
  };

})(window.SB);
