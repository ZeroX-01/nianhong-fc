/* 集市。
 *
 * 电子城门口那一排水泥台子。喇叭里循环放着同一首舞曲，摊主叼着牙签，
 * 卡带用塑料袋一张一张套着，摆成两排，价签是硬纸板剪的。
 *
 * 这里有两个人：
 *   老王   —— 卖卡带的，能砍价，也会往里掺假卡；
 *   张老板 —— 卖杂货的，棉签、AV 线、杂志、小台扇，一口价，不讲。
 *
 * 砍价故意做成「你出数、他还价」的来回：真正的乐趣不在便宜多少，
 * 而在那句「行行行，拿走拿走」。 */
(function (SB) {
  'use strict';

  SB.MarketScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MarketScene() { Phaser.Scene.call(this, { key: 'Market' }); },

    init: function (data) {
      this.from = (data && data.from) || 'Room';
      this.busy = false;
      this.spots = [];
      this.cur = 0;
      this.arrived = false;
    },

    create: function () {
      var self = this;

      /* ---------------- 背景 ---------------- */
      if (this.textures.exists('bg_market')) {
        this.add.image(0, 0, 'bg_market').setOrigin(0, 0).setDepth(SB.D.BG);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.WOOD6).setOrigin(0, 0).setDepth(SB.D.BG);
        this.add.rectangle(0, 170, SB.W, 100, SB.C.GREY6).setOrigin(0, 0).setDepth(SB.D.BG + 1);
      }

      /* 两个摊子。左边老王卖卡，右边张老板卖杂货。 */
      this.stallLao = this.place('stall', 34, 150, SB.D.FURNITURE, 156, 74, SB.C.WOOD4);
      this.place('umbrella', 30, 100, SB.D.FURNITURE + 4, 100, 54, SB.C.RED3);
      this.stallZhang = this.place('stall', 286, 156, SB.D.FURNITURE, 156, 74, SB.C.WOOD3);
      this.place('umbrella', 300, 108, SB.D.FURNITURE + 4, 100, 54, SB.C.BLU3);
      this.place('crate', 246, 194, SB.D.PROP, 42, 32, SB.C.WOOD5);
      this.place('bicycle', 196, 188, SB.D.PROP, 56, 38, SB.C.GREY4);

      /* 摊主。三帧循环（吆喝 / 数钱 / 扇扇子），慢一点，像热得不想动。 */
      this.lao = this.actor('vendor_lao', 96, 108, 30, 52, SB.C.WOOD4);
      this.zhang = this.actor('vendor_zhang', 348, 112, 28, 52, SB.C.BLU2);

      /* 台面上摆出来的卡带：今天有什么，摊上就摆什么 */
      this.stock = SB.Econ.stockToday();
      this.drawStock();

      /* ---------------- UI ---------------- */
      this.hud = SB.UI.hud(this);
      this.hint = SB.UI.hint(this, '');
      this.backBtn = SB.UI.corner(this, '← 回家', function () { if (!self.busy && self.arrived) self.leave(); });
      this.focus = SB.UI.focus(this);

      this.spots = [
        { id: 'lao', x: 34, y: 96, w: 156, h: 128, label: '卖卡带的老王' },
        { id: 'zhang', x: 286, y: 100, w: 156, h: 128, label: '卖杂货的张老板' },
        { id: 'home', x: 200, y: 232, w: 80, h: 30, label: '回家' }
      ];
      this.spots.forEach(function (sp, i) {
        var z = self.add.zone(sp.x, sp.y, sp.w, sp.h).setOrigin(0, 0)
          .setDepth(SB.D.FOCUS).setInteractive({ useHandCursor: true });
        z.on('pointerover', function () { if (!self.busy) { self.cur = i; self.refresh(); } });
        z.on('pointerdown', function () { if (!self.busy) { self.cur = i; self.refresh(); self.act(); } });
      });
      SB.Text.add(this, 214, 240, '回家', 12, SB.C.YEL4).setDepth(SB.D.HUD + 1);

      this.refresh();
      SB.UI.fadeIn(this, 260);

      /* ---------------- 到场 ---------------- */
      SB.Audio.bgm('bgm_market');
      SB.Audio.loop('market_crowd', 0.3);
      this.events.once('shutdown', function () { SB.Audio.stopLoop('market_crowd'); });

      /* 出门一趟就是半个下午。走不动了就只能明天再去。 */
      this.busy = true;
      if (SB.Save.d.ap < 1) {
        SB.UI.dialog(this, ['太阳把柏油路晒软了，你走到楼下就不想动了。今天算了。'], {
          onDone: function () { SB.UI.go(self, 'Room', { from: 'market' }); }
        });
        return;
      }
      SB.Time.spend(1);
      this.hud.refresh();

      SB.UI.dialog(this, SB.L.market.enter, {
        onDone: function () { self.busy = false; self.arrived = true; }
      });
    },

    /* ---------------- 摆件助手 ---------------- */
    place: function (key, x, y, depth, w, h, fallback) {
      if (this.textures.exists(key)) {
        return this.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
      }
      return this.add.rectangle(x, y, w, h, fallback).setOrigin(0, 0).setDepth(depth);
    },

    actor: function (key, x, y, w, h, fallback) {
      if (!this.textures.exists(key)) {
        return this.add.rectangle(x, y, w, h, fallback).setOrigin(0, 0).setDepth(SB.D.CHAR);
      }
      var sp = this.add.sprite(x, y, key, 0).setOrigin(0, 0).setDepth(SB.D.CHAR);
      var n = this.textures.get(key).frameTotal - 1;
      if (n > 1) {
        var an = key + '_idle';
        if (!this.anims.exists(an)) {
          this.anims.create({
            key: an, frames: this.anims.generateFrameNumbers(key, { start: 0, end: n - 1 }),
            frameRate: 2.5, repeat: -1
          });
        }
        sp.play(an);
      }
      return sp;
    },

    /* 台面上的卡带：最多摆 6 张，摆不下的「在箱子里」 */
    drawStock: function () {
      var self = this;
      if (this.stockObjs) this.stockObjs.forEach(function (o) { o.destroy(); });
      this.stockObjs = [];
      this.stock.slice(0, 6).forEach(function (c, i) {
        var x = 40 + (i % 3) * 50, y = 156 + Math.floor(i / 3) * 32;
        var o;
        if (self.textures.exists('cart_' + c.id)) {
          o = self.add.image(x, y, 'cart_' + c.id).setOrigin(0, 0).setDepth(SB.D.PROP + 2).setScale(1);
        } else {
          o = self.add.rectangle(x, y, 40, 28, SB.CART_TINT[c.id] || SB.C.GREY6)
            .setOrigin(0, 0).setDepth(SB.D.PROP + 2);
        }
        self.stockObjs.push(o);
      });
    },

    /* ---------------- 焦点与输入 ---------------- */
    refresh: function () {
      var sp = this.spots[this.cur];
      if (!sp) return;
      this.focus.at(sp.x, sp.y, sp.w, sp.h);
      var n = this.stock.length;
      /* 提示条右半段常驻「离那台主机还差多少」：在集市上做每一个花钱的
       * 决定时，这个数都该在眼前。买到了就换成一句确认。 */
      var goal = SB.Story.ownConsole() ? '主机已经是你的了'
        : '二手主机还差 ' + SB.money(SB.Story.goalGap());
      this.hint.set(function () {
        return sp.label + '　' + SB.Input.tip([['a', '搭话'], ['b', '回家']]) +
          '　　摊上 ' + n + ' 张卡　' + goal;
      });
    },

    update: function () {
      SB.Input.update();
      if (this.busy || !this.arrived) return;
      var p = SB.Input.p1;
      if (p.just.left) this.move(-1);
      if (p.just.right) this.move(1);
      if (p.just.up) this.move(-1);
      if (p.just.down) this.move(1);
      if (p.just.a) this.act();
      if (p.just.b) this.leave();
    },

    move: function (d) {
      this.cur = (this.cur + d + this.spots.length) % this.spots.length;
      SB.Audio.sfx('ui_move', { volume: 0.4 });
      this.refresh();
    },

    act: function () {
      var id = this.spots[this.cur].id;
      if (id === 'lao') this.laoMenu();
      else if (id === 'zhang') this.zhangMenu();
      else this.leave();
    },

    /* ---------------- 老王：卡带 ---------------- */
    laoMenu: function () {
      var self = this;
      if (!this.stock.length) {
        this.say(['「今天没什么好货，明天再来。」'], 'old王');
        return;
      }
      var items = this.stock.map(function (c) {
        var p = SB.Econ.priceOf(c);
        return {
          label: c.name,
          sub: SB.money(p) + (SB.Save.d.money < p ? '（钱不够）' : ''),
          value: c.id
        };
      });
      items.push({ label: '就看看，不买', value: 'no' });

      this.busy = true;
      SB.UI.menu(this, {
        title: '「你自己挑，挑好了叫我。」', items: items, width: 250, y: 40, rowH: 20,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'no') { self.say(SB.L.market.laoIdle, '老王'); return; }
          self.cartTalk(SB.CART_BY_ID[it.value]);
        }
      });
    },

    /* 摊主的吹牛 → 买 / 砍 / 走 */
    cartTalk: function (cart) {
      var self = this;
      var ask = SB.Econ.priceOf(cart);
      this.busy = true;
      SB.UI.dialog(this, [cart.pitch, cart.label + '。' + cart.back], {
        speaker: '老王',
        onDone: function () {
          self.busy = false;
          self.cartChoice(cart, ask);
        }
      });
    },

    cartChoice: function (cart, ask) {
      var self = this, s = SB.Save.d;
      var items = [
        { label: '就这个价，买了', sub: SB.money(ask), value: 'buy', disabled: s.money < ask },
        { label: '砍砍价', value: 'haggle' },
        { label: '再看看别的', value: 'no' }
      ];
      this.busy = true;
      SB.UI.menu(this, {
        title: cart.name + '　标价 ' + SB.money(ask), items: items, width: 240, y: 90,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'buy') self.doBuy(cart, ask);
          else if (it.value === 'haggle') self.haggle(SB.Econ.newHaggle(cart));
        }
      });
    },

    /* 砍价：给几个预设出价，摊主还价后可以接受 */
    haggle: function (h) {
      var self = this, s = SB.Save.d;
      var ask = h.ask;
      var opts = [
        Math.max(1, Math.round(ask * 0.6 * 10) / 10),
        Math.round(ask * 0.75 * 10) / 10,
        Math.round(ask * 0.88 * 10) / 10
      ];
      var items = opts.map(function (v) {
        return { label: '「' + SB.money(v) + '，行不行？」', value: v, disabled: s.money < v };
      });
      if (h.counter) {
        items.push({ label: '「行，' + SB.money(h.counter) + ' 就 ' + SB.money(h.counter) + '。」',
          value: h.counter, disabled: s.money < h.counter });
      }
      items.push({ label: '不买了，走', value: 'quit' });

      this.busy = true;
      SB.UI.menu(this, {
        title: '你说个数（他耐心还剩 ' + Math.max(0, h.patience) + '）',
        items: items, width: 260, y: 70,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'quit') {
            self.say(['你转身要走。「回来回来，你说多少？」他又把你叫住了。'], '老王');
            return;
          }
          var r = SB.Econ.offer(h, it.value);
          SB.Audio.sfx(r.ok ? 'haggle_ok' : 'haggle_no');
          self.busy = true;
          SB.UI.dialog(self, [r.msg], {
            speaker: '老王',
            onDone: function () {
              self.busy = false;
              if (r.ok) { self.doBuy(h.cart, h.deal, h.ask); return; }
              if (h.done) return;                 /* 谈崩了 */
              self.haggle(h);                     /* 还能再来一轮 */
            }
          });
        }
      });
    },

    doBuy: function (cart, price, ask) {
      var self = this;
      var r = SB.Econ.buyCart(cart, price);
      if (!r.ok) {
        SB.Audio.sfx('buy_fail');
        this.say(SB.L.market.poor);
        return;
      }
      SB.Audio.sfx('buy_success');
      SB.Audio.sfx('money_get');
      /* 砍下来的差价记进账本：这个夏天「会过日子」的那部分战果得留痕。 */
      var saved = (ask && ask > price) ? SB.Econ.noteHaggle(ask, price) : 0;
      SB.Story.addMood('buyCart');
      this.hud.refresh();
      /* 假卡不当场揭穿 —— 那是你回家插进去以后的事 */
      this.stock = this.stock.filter(function (c) { return c.id !== cart.id; });
      this.drawStock();
      var note = '（' + cart.name + '　花了 ' + SB.money(price) +
        (saved > 0 ? '，砍下来 ' + SB.money(saved) : '') + '）';
      this.say([SB.line(SB.L.market.buySuccess), note]);
    },

    /* ---------------- 张老板：杂货 ---------------- */
    zhangMenu: function () {
      var self = this, s = SB.Save.d;
      var items = SB.GOODS.map(function (g) {
        var had = g.once && s.owned[g.id];
        /* 大件（那台二手主机）价钱按天浮动，所以一律问 priceOfGood，
         * 不能直接读 g.price —— 菜单上写的数必须就是待会儿扣的数。 */
        var p = SB.Econ.priceOfGood(g);
        var isGoal = SB.STORY && g.id === SB.STORY.CONSOLE_ID;
        var sub;
        if (had) sub = '已经有了';
        else if (isGoal && s.money < p) sub = SB.money(p) + '（还差 ' + SB.money(Math.round((p - s.money) * 10) / 10) + '）';
        else sub = SB.money(p) + (s.money < p ? '（钱不够）' : '');
        return {
          label: g.name,
          sub: sub,
          value: g.id,
          /* 目标那一台买不起时也留着能点：进去听他吆喝一句、看清还差多少，
           * 比一行灰字更能让人想再去捡两个瓶子。 */
          disabled: !!had || (s.money < p && !isGoal)
        };
      });
      items.push({ label: '不买了', value: 'no' });

      this.busy = true;
      SB.UI.menu(this, {
        title: '张老板的摊子（一口价）', items: items, width: 268, y: 30, rowH: 19,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'no') { self.say(SB.L.market.zhangIdle, '张老板'); return; }
          var g = SB.GOODS_BY_ID[it.value];
          if (SB.STORY && g.id === SB.STORY.CONSOLE_ID) { self.consoleTalk(g); return; }
          var price = SB.Econ.priceOfGood(g);
          self.busy = true;
          SB.UI.dialog(self, [g.pitch, g.desc], {
            speaker: '张老板',
            onDone: function () {
              self.busy = false;
              var r = SB.Econ.buyGood(g, price);
              if (!r.ok) {
                SB.Audio.sfx('buy_fail');
                self.say(r.why === 'had' ? ['这个你已经有了。'] : SB.L.market.poor);
                return;
              }
              SB.Audio.sfx('buy_success');
              self.hud.refresh();
              self.say([SB.line(SB.L.market.goodsBuy), '（' + g.name + '　花了 ' + SB.money(price) + '）']);
            }
          });
        }
      });
    },

    /* 那台二手主机：整个夏天攒钱就是为了它，所以它不能跟棉签走同一条流程。
     * 钱不够时也让玩家把纸箱看一眼 —— 目标要看得见，才有攒的意义。 */
    consoleTalk: function (g) {
      var self = this, s = SB.Save.d;
      var price = SB.Econ.priceOfGood(g);
      var L = SB.L.story.goal;
      this.busy = true;
      SB.UI.dialog(this, L.pitch.concat(['「' + SB.money(price) + '，一分不还。」']), {
        speaker: '张老板',
        onDone: function () {
          self.busy = false;
          if (s.money < price) { self.say(L.poor, null); return; }
          self.busy = true;
          SB.UI.menu(self, {
            title: g.name + '　' + SB.money(price),
            items: [
              { label: '把攒的钱全掏出来', sub: SB.money(price), value: 'buy' },
              { label: '再攒攒', value: 'no' }
            ],
            width: 252, y: 96,
            onCancel: function () { self.busy = false; },
            onPick: function (it) {
              self.busy = false;
              if (it.value !== 'buy') return;
              var r = SB.Econ.buyGood(g, price);
              if (!r.ok) { SB.Audio.sfx('buy_fail'); self.say(SB.L.market.poor); return; }
              SB.Audio.sfx('buy_success');
              SB.Audio.sfx('money_get');
              self.hud.refresh();
              self.say(L.buy.concat(L.after), null);
            }
          });
        }
      });
    },

    /* ---------------- 杂 ---------------- */
    say: function (lines, speaker, cb) {
      var self = this;
      this.busy = true;
      SB.UI.dialog(this, lines, {
        speaker: speaker,
        onDone: function () { self.busy = false; if (cb) cb(); }
      });
    },

    leave: function () {
      var self = this;
      SB.Audio.sfx('ui_cancel');
      SB.Audio.stopLoop('market_crowd');
      this.busy = true;
      SB.UI.dialog(this, ['你捏着剩下的钱走回家。太阳晒得柏油路发软。'], {
        onDone: function () { SB.UI.go(self, 'Room', { from: 'market' }); }
      });
    }
  });

})(window.SB);
