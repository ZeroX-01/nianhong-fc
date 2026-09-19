/* 发小家。
 *
 * 他家的电视比你家小一圈，但他有两个手柄——这件事在 2004 年足够让你羡慕一整个暑假。
 * 屋里吊扇转得很慢，地上铺着凉席，桌上一盘吃剩的西瓜皮。
 * 在这儿玩不用听楼道里的脚步声：他妈在纺织厂上中班，晚上八点才回来。
 *
 * 三件事：
 *   1. 双打。真正的两个手柄，1P 键盘方向键 + X/Z，2P 是 WASD + G/H。
 *   2. 借卡。他有几张你没有的，肯借不肯借看他心情和交情。
 *   3. 抢 1P。永恒的争端。 */
(function (SB) {
  'use strict';

  /* 发小自己的卡带。借卡和双打都从这里取。 */
  var HIS = ['01', '04', '08', '11'];
  /* 真正支持两个人同时上的：坦克和格斗 */
  var TWO_P = { tank: true, fight: true };

  SB.FriendScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function FriendScene() { Phaser.Scene.call(this, { key: 'Friend' }); },

    init: function (data) {
      var d = data || {};
      this.from = d.from || 'Room';
      this.backFromPlay = (this.from === 'play' || this.from === 'clear' || this.from === 'fault');
      this.busy = false;
      this.spots = [];
      this.cur = 0;
      this.ready = false;
      this.isP1 = SB.Save.d.__friendP1 !== false;   // 上次谁拿的 1P，会记住
    },

    create: function () {
      var self = this;

      if (this.textures.exists('bg_friend')) {
        this.add.image(0, 0, 'bg_friend').setOrigin(0, 0).setDepth(SB.D.BG);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.WOOD5).setOrigin(0, 0).setDepth(SB.D.BG);
        this.add.rectangle(0, 180, SB.W, 90, SB.C.GRN2).setOrigin(0, 0).setDepth(SB.D.BG + 1);
      }

      /* 他家那台小电视：背景图里已经画了，这里只补一块会亮的屏 */
      this.tvGlow = this.add.rectangle(196, 96, 88, 66, SB.C.BLU5, 0)
        .setOrigin(0, 0).setDepth(SB.D.TV_SCREEN);

      /* 发小。四帧：坐着 / 按手柄 / 扭头说话 / 举手欢呼 */
      this.friend = this.actor('friend', 292, 176, 28, 48, SB.C.BLU3);

      /* 你自己坐在他旁边 */
      this.kid = this.actor('kid', 150, 186, 24, 44, SB.C.RED3);

      this.hud = SB.UI.hud(this);
      this.hint = SB.UI.hint(this, '');
      this.backBtn = SB.UI.corner(this, '← 回家', function () { if (!self.busy && self.ready) self.leave(); });
      this.focus = SB.UI.focus(this);

      this.spots = [
        { id: 'tv', x: 186, y: 88, w: 108, h: 84, label: '他家的电视（双打）' },
        { id: 'friend', x: 286, y: 170, w: 40, h: 58, label: '发小' },
        { id: 'pad', x: 120, y: 234, w: 60, h: 26, label: '两个手柄' },
        { id: 'door', x: 408, y: 96, w: 64, h: 120, label: '回家' }
      ];
      this.spots.forEach(function (sp, i) {
        var z = self.add.zone(sp.x, sp.y, sp.w, sp.h).setOrigin(0, 0)
          .setDepth(SB.D.FOCUS).setInteractive({ useHandCursor: true });
        z.on('pointerover', function () { if (!self.busy) { self.cur = i; self.refresh(); } });
        z.on('pointerdown', function () { if (!self.busy) { self.cur = i; self.refresh(); self.act(); } });
      });

      this.refresh();
      SB.UI.fadeIn(this, 240);
      SB.Audio.bgm('bgm_friend');
      SB.Audio.loop('fan_hum', 0.22);
      this.events.once('shutdown', function () { SB.Audio.stopLoop('fan_hum'); });

      /* 刚打完一局回到这一屏：他先开口 */
      this.busy = true;
      if (this.backFromPlay) {
        var win = SB.chance(0.5);
        SB.UI.dialog(this, win ? SB.L.friend.lose : SB.L.friend.win, {
          speaker: '发小',
          onDone: function () { self.busy = false; self.ready = true; }
        });
        return;
      }

      /* 第一次进门：花掉半个下午 */
      if (SB.Save.d.ap < 1) {
        SB.UI.dialog(this, ['你走到他家楼下才想起来，今天实在没劲了。明天再来。'], {
          onDone: function () { SB.UI.go(self, 'Room', { from: 'friend' }); }
        });
        return;
      }
      SB.Time.spend(1);
      this.hud.refresh();
      SB.Audio.sfx('door_open');
      SB.UI.dialog(this, SB.L.friend.enter, {
        onDone: function () { self.busy = false; self.ready = true; }
      });
    },

    actor: function (key, x, y, w, h, fallback) {
      if (!this.textures.exists(key)) {
        return this.add.rectangle(x, y, w, h, fallback).setOrigin(0, 0).setDepth(SB.D.CHAR);
      }
      var sp = this.add.sprite(x, y, key, 0).setOrigin(0, 0).setDepth(SB.D.CHAR);
      return sp;
    },

    /* ---------------- 焦点 ---------------- */
    refresh: function () {
      var sp = this.spots[this.cur];
      if (!sp) return;
      this.focus.at(sp.x, sp.y, sp.w, sp.h);
      var who = this.isP1 ? '1P' : '2P';
      this.hint.set(function () {
        return sp.label + '　' + SB.Input.tip([['a', '确认'], ['b', '回家']]) + '　　你现在是 ' + who;
      });
    },

    update: function () {
      SB.Input.update();
      if (this.busy || !this.ready) return;
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
      if (id === 'tv') this.playMenu();
      else if (id === 'friend') this.talkMenu();
      else if (id === 'pad') this.padMenu();
      else this.leave();
    },

    /* ---------------- 双打 ---------------- */
    /* 能玩的卡 = 他的卡 + 你带来的（你自己有的）。双打只认坦克和格斗。 */
    playable: function () {
      var seen = {}, out = [];
      HIS.forEach(function (id) {
        var c = SB.CART_BY_ID[id];
        if (c && !seen[id]) { seen[id] = 1; out.push({ cart: c, mine: false }); }
      });
      SB.Save.ownedCarts().forEach(function (c) {
        if (seen[c.id]) return;
        seen[c.id] = 1;
        out.push({ cart: c, mine: true });
      });
      return out;
    },

    playMenu: function () {
      var self = this;
      var list = this.playable();
      var items = list.map(function (e) {
        var two = TWO_P[e.cart.game];
        return {
          label: e.cart.name,
          sub: (e.mine ? '你带来的' : '他的卡') + (two ? '　可双打' : '　单人'),
          value: e.cart.id
        };
      });
      items.push({ label: '不玩了', value: 'no' });

      this.busy = true;
      SB.UI.menu(this, {
        title: '插哪张？（他家的机子没那么挑）', items: items, width: 260, y: 30, rowH: 20,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'no') return;
          self.startPlay(it.value);
        }
      });
    },

    startPlay: function (cartId) {
      var self = this, c = SB.CART_BY_ID[cartId];
      var two = !!TWO_P[c.game];
      SB.Save.d.__friendP1 = this.isP1;
      SB.Save.save();

      /* 双打这一局键盘要一分为二：左手 WASD 借给 2P，所以 1P 的 A 键
       * 只剩 X / K / 空格 —— 这件事必须在开打之前说清楚。 */
      var lines = two
        ? ['他把 2P 手柄的线捋直，塞到你手里。',
           '1P：方向键 + X（A）/ Z（B）　2P：WASD + H（A）/ G（B）',
           '（这局键盘上的 A 是 2P 的左，1P 请按 X。）',
           this.isP1 ? '这局你 1P。' : '这局你 2P。他说他家的电视他 1P。']
        : ['他把手柄让给你。「你先打，我看着。」'];

      this.busy = true;
      SB.UI.dialog(this, lines, {
        onDone: function () {
          SB.Audio.sfx('cart_insert');
          SB.UI.go(self, 'Play', {
            cartId: cartId, friend: true, twoP: two, p1: self.isP1 ? 1 : 2
          });
        }
      });
    },

    /* ---------------- 说话 / 借卡 ---------------- */
    talkMenu: function () {
      var self = this;
      var items = [
        { label: '借一张卡带回去玩', value: 'lend' },
        { label: '问他秘技', value: 'cheat' },
        { label: '瞎聊两句', value: 'chat' },
        { label: '算了', value: 'no' }
      ];
      this.busy = true;
      SB.UI.menu(this, {
        title: '发小', items: items, width: 230, y: 96,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'lend') self.borrow();
          else if (it.value === 'cheat') self.cheat();
          else if (it.value === 'chat') self.say(SB.pick([
            ['「我哥说过年给我买个新的手柄，带连发的。」'],
            ['「你家那台电视是不是要换了？我看画面都发红了。」'],
            ['「昨天有人在电子城门口卖 300 合 1，我看着像假的。」'],
            ['他把西瓜皮上的最后一点红咬掉，没说话，风扇在头顶转。']
          ]), '发小');
        }
      });
    },

    borrow: function () {
      var self = this, s = SB.Save.d;
      /* 他愿意借的：自己那几张，且你没有、也没在借 */
      var pool = HIS.filter(function (id) {
        var st = s.carts[id];
        return st && !st.owned && st.borrowed <= 0;
      });
      if (!pool.length) {
        this.say(['「我这儿的你都拿去玩过了。」'], '发小');
        return;
      }
      var items = pool.map(function (id) {
        return { label: SB.CART_BY_ID[id].name, value: id };
      });
      items.push({ label: '不借了', value: 'no' });

      this.busy = true;
      SB.UI.menu(this, {
        title: '「哪张？」', items: items, width: 230, y: 96,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'no') return;
          var c = SB.CART_BY_ID[it.value];
          /* 越稀有越不肯借；玩得越熟的交情越好 */
          var p = SB.clamp(0.85 - (c.rarity - 2) * 0.18 + (s.stats.plays > 6 ? 0.1 : 0), 0.2, 0.95);
          if (!SB.chance(p)) {
            SB.Audio.sfx('ui_error');
            self.say(SB.L.friend.lendNo, '发小');
            return;
          }
          var st = s.carts[c.id];
          st.borrowed = 7;
          st.dirt = SB.clamp(c.startDirt + SB.rndInt(-6, 10), 12, 96);
          SB.Save.save();
          SB.Audio.sfx('buy_success');
          self.say([SB.line(SB.L.friend.lend), '（' + c.name + '　七天后要还）'], '发小', function () {
            SB.UI.toast(self, '借到了：' + c.name, 1600);
          });
        }
      });
    },

    cheat: function () {
      var s = SB.Save.d;
      if (s.owned.mag) {
        this.say(['「你不是有杂志吗？第 42 页那个我试过，是真的。」',
                  '（有杂志的时候，小游戏里会给你一点提示）'], '发小');
      } else {
        this.say(['「上上下下左右左右 BA，谁都会说，谁都没成功过。」',
                  '「你去买本《电子游戏时代》，上面写得清楚。」'], '发小');
      }
    },

    /* ---------------- 抢 1P ---------------- */
    padMenu: function () {
      var self = this;
      var items = [
        { label: this.isP1 ? '把 1P 让给他' : '抢 1P 手柄', value: 'swap' },
        { label: '看看这两个手柄', value: 'look' },
        { label: '算了', value: 'no' }
      ];
      this.busy = true;
      SB.UI.menu(this, {
        title: '两个手柄', items: items, width: 220, y: 110,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'look') {
            self.say(['1P 那个的十字键已经按软了，上方向要用点力。',
                      '2P 手柄上有个麦克风孔。据说对着它喊能作弊，从来没成功过。']);
            return;
          }
          if (it.value !== 'swap') return;
          if (self.isP1) {
            self.isP1 = false;
            SB.Save.d.__friendP1 = false; SB.Save.save();
            self.say(['你把 1P 手柄递过去。他愣了一下，接了。'], null, function () { self.refresh(); });
            return;
          }
          /* 抢：一半一半 */
          if (SB.chance(0.5)) {
            self.isP1 = true;
            SB.Save.d.__friendP1 = true; SB.Save.save();
            SB.Audio.sfx('ui_confirm');
            self.say(SB.L.friend.grabBack, null, function () { self.refresh(); });
          } else {
            SB.Audio.sfx('ui_error');
            self.say(SB.L.friend.grab.concat(SB.L.friend.grabLose), '发小',
              function () { self.refresh(); });
          }
        }
      });
    },

    /* ---------------- 杂 ---------------- */
    say: function (lines, speaker, cb) {
      var self = this;
      this.busy = true;
      SB.UI.dialog(this, lines, {
        speaker: speaker || undefined,
        onDone: function () { self.busy = false; if (cb) cb(); }
      });
    },

    leave: function () {
      var self = this;
      SB.Audio.sfx('door_close');
      SB.Audio.stopLoop('fan_hum');
      this.busy = true;
      SB.UI.dialog(this, SB.L.friend.leave, {
        onDone: function () { SB.UI.go(self, 'Room', { from: 'friend' }); }
      });
    }
  });

})(window.SB);
