/* 鞋盒。
 *
 * 那个年代，一个孩子的全部财产就装在一只鞋盒里：几张卡带、一根 AV 线、
 * 攒下来的钱、一本翻烂的杂志。盒盖内侧用铅笔记着每张卡带是从谁那儿弄来的。
 *
 * 这一屏做的事很简单：把盒子里的东西摊在地上，让你挑一张插进主机。
 * 但它同时是整个游戏里唯一能看清「这张卡有多脏、磨得多厉害」的地方，
 * 所以每张卡都带着两条槽：灰能擦掉，磨损擦不掉。 */
(function (SB) {
  'use strict';

  var GRID = { x: 20, y: 52, cw: 66, ch: 46, cols: 4 };
  var INFO = { x: 300, y: 40, w: 168, h: 190 };
  /* 详情面板的纵向排版。面板高度写死，描述再长也不许压到下面的数值条上，
   * 所以这里把每一块的位置和描述允许的最大行数一次算清楚：
   *   名字 → 壳 → 描述（可省略） → 脏/磨 两条 → 统计一行 */
  var PANEL = {
    name: 10,
    shell: 26,
    body: 44,
    barDirt: 138,   // 条上方还要放一个「脏」字，label 画在 y-3
    barWear: 154,
    stat: 172,
    bodyMaxLines: 6 // (138-3) - 44 = 91px，12px 字行高 14 → 放得下 6 行
  };

  SB.ShelfScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ShelfScene() { Phaser.Scene.call(this, { key: 'Shelf' }); },

    init: function (data) {
      var d = data || {};
      this.from = d.from || 'Room';
      this.pickMode = !!d.pick;      // 从主机菜单点「插卡」进来的：选中即插入
      this.cur = 0;
      this.busy = false;
      this.cells = [];
    },

    create: function () {
      var self = this, s = SB.Save.d;

      /* ---- 背景：客厅地面，但视角压低到地板上，所以整屏都压暗 ---- */
      if (this.textures.exists('bg_room')) {
        this.add.image(0, 0, 'bg_room').setOrigin(0, 0).setDepth(SB.D.BG);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.WOOD2).setOrigin(0, 0).setDepth(SB.D.BG);
      }
      this.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 0.62).setOrigin(0, 0).setDepth(SB.D.BG + 1);

      /* 鞋盒本体：盒身在左上角，盒盖靠着墙立着 */
      if (this.textures.exists('shoebox')) {
        this.add.image(10, 6, 'shoebox').setOrigin(0, 0).setDepth(SB.D.PROP).setScale(1);
      }
      SB.Text.add(this, 74, 8, '鞋　盒', 16, SB.C.WOOD7).setDepth(SB.D.HUD + 1);
      SB.Text.add(this, 74, 28, '（盒盖内侧用铅笔记着谁的名字）', 12, SB.C.GREY6).setDepth(SB.D.HUD + 1);

      /* ---- 卡带格子 ---- */
      this.buildGrid();

      /* ---- 右侧详情面板 ---- */
      SB.UI.panel(this, INFO.x, INFO.y, INFO.w, INFO.h, true).setDepth(SB.D.DIALOG - 10);
      this.info = {
        name:  SB.Text.add(this, INFO.x + 10, INFO.y + PANEL.name, '', 12, SB.C.YEL4).setDepth(SB.D.DIALOG - 8),
        shell: SB.Text.add(this, INFO.x + 10, INFO.y + PANEL.shell, '', 12, SB.C.GREY6).setDepth(SB.D.DIALOG - 8),
        body:  SB.Text.add(this, INFO.x + 10, INFO.y + PANEL.body, '', 12, SB.C.GREY8).setDepth(SB.D.DIALOG - 8),
        stat:  SB.Text.add(this, INFO.x + 10, INFO.y + PANEL.stat, '', 12, SB.C.GREY7).setDepth(SB.D.DIALOG - 8)
      };
      this.bars = this.add.graphics().setDepth(SB.D.DIALOG - 8);

      this.hud = SB.UI.hud(this);
      this.hint = SB.UI.hint(this, '');
      this.backBtn = SB.UI.corner(this, '← 返回', function () { if (!self.busy) self.back(); });
      this.focus = SB.UI.focus(this);

      /* 盒子里的杂物：棉签、AV 线、杂志、小台扇，只作展示 */
      this.drawGoods();

      this.bindInput();
      this.refresh();
      SB.UI.fadeIn(this, 240);
      SB.Audio.bgm('bgm_room');
    },

    /* ---------------- 格子 ---------------- */
    buildGrid: function () {
      var self = this;
      SB.CARTS.forEach(function (c, i) {
        var col = i % GRID.cols, row = Math.floor(i / GRID.cols);
        var x = GRID.x + col * GRID.cw, y = GRID.y + row * GRID.ch;
        var st = SB.Save.cart(c.id);
        var have = st.owned || st.borrowed > 0;

        /* 空格子也画出来 —— 你知道自己还缺哪几张 */
        var slot = self.add.rectangle(x, y, 56, 36, SB.C.GREY1, have ? 0 : 0.55)
          .setOrigin(0, 0).setDepth(SB.D.PROP);
        if (!have) slot.setStrokeStyle(1, SB.C.GREY3, 0.8);

        var img = null, ph = null;
        if (have) {
          if (self.textures.exists('cart_' + c.id)) {
            img = self.add.image(x + 8, y + 4, 'cart_' + c.id).setOrigin(0, 0).setDepth(SB.D.PROP + 1);
          } else {
            ph = self.add.rectangle(x + 8, y + 4, 40, 28, SB.CART_TINT[c.id] || SB.C.GREY5)
              .setOrigin(0, 0).setDepth(SB.D.PROP + 1);
          }
          /* 借来的卡在角上贴一张小纸条；坏掉的卡打一个叉 */
          if (st.borrowed > 0) {
            self.add.rectangle(x + 6, y + 2, 10, 6, SB.C.YEL4).setOrigin(0, 0).setDepth(SB.D.PROP + 2);
          }
          if (st.dead) {
            var g = self.add.graphics().setDepth(SB.D.PROP + 3);
            g.lineStyle(2, SB.C.RED4, 0.9);
            g.beginPath(); g.moveTo(x + 10, y + 6); g.lineTo(x + 46, y + 30);
            g.moveTo(x + 46, y + 6); g.lineTo(x + 10, y + 30); g.strokePath();
          }
          if (SB.Save.d.inserted === c.id) {
            SB.Text.add(self, x + 8, y + 30, '插着', 12, SB.C.GRN4).setDepth(SB.D.PROP + 3);
          } else if (SB.Save.d.hidden === c.id) {
            SB.Text.add(self, x + 8, y + 30, '藏着', 12, SB.C.BLU4).setDepth(SB.D.PROP + 3);
          }
        } else {
          SB.Text.add(self, x + 20, y + 12, '？', 12, SB.C.GREY4).setDepth(SB.D.PROP + 1);
        }

        var z = self.add.zone(x, y, 56, 36).setOrigin(0, 0).setDepth(SB.D.FOCUS + 1)
          .setInteractive({ useHandCursor: true });
        z.on('pointerover', function () { if (!self.busy) { self.cur = i; self.refresh(); } });
        z.on('pointerdown', function () { if (!self.busy) { self.cur = i; self.refresh(); self.act(); } });

        self.cells.push({ cart: c, x: x, y: y, have: have, img: img || ph, zone: z });
      });
    },

    /* 盒子里那些不是卡带的东西 */
    drawGoods: function () {
      var s = SB.Save.d, y = 200, x = 20;
      var list = [];
      if (s.goods.swab > 0) list.push('棉签×' + s.goods.swab);
      if (s.goods.popsicle > 0) list.push('冰棍×' + s.goods.popsicle);
      if (s.owned.avline) list.push('AV 线');
      if (s.owned.pad2) list.push('2P 手柄');
      if (s.owned.mag) list.push('游戏杂志');
      if (s.owned.fan) list.push('小台扇');
      if (!list.length) list.push('盒子底下只有一层灰');
      SB.Text.add(this, x, y,
        SB.Text.wrap('盒子里还有：' + list.join('　'), 268, 12),
        12, SB.C.GREY6).setDepth(SB.D.HUD + 1);
    },

    /* ---------------- 输入 ---------------- */
    bindInput: function () {
      var self = this;
      this.input.keyboard.on('keydown-TAB', function (e) {
        if (e.preventDefault) e.preventDefault();
        self.move(1);
      });
    },

    move: function (d) {
      if (this.busy) return;
      this.cur = (this.cur + d + this.cells.length) % this.cells.length;
      SB.Audio.sfx('ui_move', { volume: 0.4 });
      this.refresh();
    },

    update: function () {
      SB.Input.update();
      if (this.busy) return;
      var p = SB.Input.p1;
      if (p.just.left) this.move(-1);
      if (p.just.right) this.move(1);
      if (p.just.up) this.move(-GRID.cols);
      if (p.just.down) this.move(GRID.cols);
      if (p.just.a) this.act();
      if (p.just.b || p.just.start) this.back();
    },

    /* ---------------- 详情 ---------------- */
    refresh: function () {
      var cell = this.cells[this.cur];
      if (!cell) return;
      this.focus.at(cell.x - 2, cell.y - 2, 60, 40);

      var c = cell.cart, st = SB.Save.cart(c.id);
      var known = cell.have;

      this.info.name.setText(known ? c.name : '还没有的一张卡');
      this.info.shell.setText(known ? (c.shell + '壳　' + (st.fake && st.knownTruth ? '（假卡）' : '')) : '');

      var body, note = '';
      if (!known) {
        body = '你在集市上见过它。摊主报的价你记得很清楚。';
      } else {
        body = c.desc + '\n\n' + c.back;
        /* 「还有几天要还」「彻底坏了」这两条是玩法信息，必须留住；
         * 要砍的话砍上面的故事文本。 */
        if (st.borrowed > 0) note += '发小借给你的，还有 ' + st.borrowed + ' 天要还。';
        if (st.dead) note += (note ? '\n' : '') + '它已经彻底没反应了。';
      }

      var maxW = INFO.w - 20;
      var budget = PANEL.bodyMaxLines;
      var noteWrapped = '';
      if (note) {
        noteWrapped = SB.Text.wrap(note, maxW, 12);
        budget -= SB.Text.lines(noteWrapped) + 1;   // +1 = 中间留的空行
      }
      var main = SB.Text.clamp(body, maxW, 12, Math.max(1, budget));
      this.info.body.setText(noteWrapped ? (main + '\n\n' + noteWrapped) : main);

      /* 两条槽：脏（能擦）与磨损（不能） */
      this.bars.clear();
      if (known) {
        this.bar(INFO.x + 10, INFO.y + PANEL.barDirt, 100, st.dirt, SB.C.WOOD5, '脏');
        this.bar(INFO.x + 10, INFO.y + PANEL.barWear, 100, st.wear, SB.C.RED3, '磨');
      }
      if (this['_lb脏']) { this['_lb脏'].setVisible(known); }
      if (this['_lb磨']) { this['_lb磨'].setVisible(known); }

      var line = '';
      if (known) {
        line = '玩过 ' + st.plays + ' 次';
        if (st.best) line += '　最高 ' + st.best;
        if (st.cleared) line += '　已通关';
      } else {
        line = '集市价 ' + SB.money(c.price) + ' 上下';
      }
      this.info.stat.setText(line);

      /* 提示条上写的是玩家手里那套设备真正的键名（键盘 X/A、屏幕手柄 A……） */
      var act = known
        ? (SB.Save.d.inserted === c.id ? '打开这张卡的菜单' : '插进主机')
        : null;
      this.hint.set(function () {
        var parts = [['dir', '选卡']];
        if (act) parts.push(['a', act]);
        else parts.push('这张还得去集市上买');
        parts.push(['b', '返回客厅']);
        return SB.Input.tip(parts);
      });
    },

    bar: function (x, y, w, v, color, label) {
      var g = this.bars;
      g.fillStyle(SB.C.GREY2, 1); g.fillRect(x + 14, y, w, 6);
      g.fillStyle(color, 1); g.fillRect(x + 14, y, Math.round(w * SB.clamp(v, 0, 100) / 100), 6);
      g.lineStyle(1, SB.C.GREY4, 1); g.strokeRect(x + 14, y, w, 6);
      if (!this['_lb' + label]) {
        this['_lb' + label] = SB.Text.add(this, x, y - 3, label, 12, SB.C.GREY6).setDepth(SB.D.DIALOG - 8);
      }
    },

    /* ---------------- 动作 ---------------- */
    act: function () {
      var self = this, cell = this.cells[this.cur];
      if (!cell) return;
      var c = cell.cart, st = SB.Save.cart(c.id), s = SB.Save.d;

      if (!cell.have) {
        SB.Audio.sfx('ui_error');
        this.say(['这张你还没有。集市上摊主报的价是 ' + SB.money(c.price) + ' 上下。']);
        return;
      }
      if (st.dead) {
        SB.Audio.sfx('ui_error');
        this.say([SB.line(SB.L.repair.dead)]);
        return;
      }

      var items = [];
      if (s.inserted === c.id) {
        items.push({ label: '拔出来', value: 'out' });
        items.push({ label: '拿去修一修', value: 'fix' });
      } else {
        items.push({ label: '插进主机', value: 'in' });
        items.push({ label: '先擦一擦再插', value: 'fix' });
      }
      items.push({ label: '看看背面', value: 'back' });
      items.push({ label: '放回盒子', value: 'no' });

      this.busy = true;
      SB.UI.menu(this, {
        title: c.name, items: items, width: 200, y: 96,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value === 'in') self.insert(c);
          else if (it.value === 'out') self.pull(c);
          else if (it.value === 'fix') {
            if (s.inserted !== c.id) { s.inserted = c.id; s.seated = false; SB.Save.save(); }
            SB.UI.go(self, 'Repair', { cartId: c.id, from: 'Shelf' });
          } else if (it.value === 'back') {
            self.say([c.back, '（' + c.label + '）']);
          }
        }
      });
    },

    insert: function (c) {
      var self = this, s = SB.Save.d;
      s.inserted = c.id;
      /* 一次插到底的概率并不高。这就是那声「咔哒」值钱的地方。 */
      s.seated = SB.chance(0.62);
      s.fault = null;
      if (s.hidden === c.id) s.hidden = null;
      SB.Save.save();
      SB.Audio.sfx('cart_insert');

      var msg = s.seated
        ? ['卡带推到底了。「咔哒」一声，手指能感觉到那一下。']
        : ['卡带插进去了，但好像差一点。你没听到那声「咔哒」。'];
      this.say(msg, function () {
        SB.UI.go(self, 'Room', { from: 'shelf' });
      });
    },

    pull: function (c) {
      var s = SB.Save.d;
      s.inserted = null;
      s.seated = false;
      s.fault = null;
      SB.Save.save();
      SB.Audio.sfx('cart_remove');
      this.scene.restart({ from: this.from, pick: false });
    },

    say: function (lines, cb) {
      var self = this;
      this.busy = true;
      SB.UI.dialog(this, lines, {
        onDone: function () { self.busy = false; if (cb) cb(); }
      });
    },

    back: function () {
      SB.Audio.sfx('ui_cancel');
      SB.UI.go(this, 'Room', { from: 'shelf' });
    }
  });

})(window.SB);
