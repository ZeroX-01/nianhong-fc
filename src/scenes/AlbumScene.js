/* 回忆册。
 *
 * 做成一本压在玻璃板下面的相册：左边是这个夏天解锁的一条条回忆，
 * 右边是那一整盒卡带的收集情况，底下是几个数字——
 * 你哈了多少口气，在桌上划了多少下，被抓了几次，逃掉了几次。
 *
 * 8 月 31 日睡下之后，游戏会带着 ending 标记走进这一屏：
 * 先放结局，再翻开这本册子。 */
(function (SB) {
  'use strict';

  /* 每一行的点击回调单独生成一份，把行号关在自己的作用域里 */
  function rowTap(scene, index) {
    return function () {
      var was = scene.cur;
      scene.cur = index;
      scene.refresh();
      if (was === index) scene.replay();
    };
  }

  /* 两块板子往下压到 240：右板原来只有 176 高，卡带格 + 统计 + 回忆正文
   * 三段挤在一起，正文直接压在统计数字上。多给 18px，正文才有地方站。 */
  var LIST = { x: 18, y: 46, w: 236, h: 194 };
  var SIDE = { x: 266, y: 46, w: 196, h: 194 };
  /* 右板纵向分区（相对 SIDE.y）：标题 / 卡带格 / 统计 / 选中那条回忆的正文 */
  var SIDE_ROW = { title: 8, grid: 24, gridPitch: 22, stats: 72, detail: 130, detailMaxLines: 4 };

  SB.AlbumScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function AlbumScene() { Phaser.Scene.call(this, { key: 'Album' }); },

    init: function (data) {
      var d = data || {};
      this.from = d.from || 'Title';
      this.ending = !!d.ending;
      this.cur = 0;
      this.top = 0;         // 列表滚动起点
      this.busy = false;
      this.rows = [];
    },

    create: function () {
      var self = this;

      this.add.rectangle(0, 0, SB.W, SB.H, SB.C.WOOD2).setOrigin(0, 0).setDepth(SB.D.BG);
      /* 玻璃板下压着的那层格子布 */
      var g = this.add.graphics().setDepth(SB.D.BG + 1);
      g.fillStyle(SB.C.WOOD3, 0.6);
      for (var x = 0; x < SB.W; x += 12) g.fillRect(x, 0, 6, SB.H);

      SB.Text.add(this, 18, 16, '回　忆', 16, SB.C.YEL4).setDepth(SB.D.HUD + 1);
      this.sum = SB.Text.add(this, 120, 20, '', 12, SB.C.GREY7).setDepth(SB.D.HUD + 1);

      SB.UI.panel(this, LIST.x, LIST.y, LIST.w, LIST.h, true).setDepth(SB.D.DIALOG - 12);
      SB.UI.panel(this, SIDE.x, SIDE.y, SIDE.w, SIDE.h, true).setDepth(SB.D.DIALOG - 12);

      this.loadEntries();
      this.buildList();
      this.buildSide();

      this.detail = SB.Text.add(this, SIDE.x + 10, SIDE.y + SIDE_ROW.detail, '', 12, SB.C.GREY8)
        .setDepth(SB.D.DIALOG - 8);

      this.focus = SB.UI.focus(this);
      this.hint = SB.UI.hint(this, '');
      this.backBtn = SB.UI.corner(this, '← 返回', function () { if (!self.busy) self.back(); });
      this.refresh();

      SB.UI.fadeIn(this, 240);

      /* 结局：先放完 8 月 31 日那一段，再翻册子 */
      if (this.ending) {
        this.busy = true;
        SB.Audio.bgm('bgm_ending');
        SB.Save.d.flags.finished = true;
        /* 册子上留下的那一条，也分「还了」和「留下了」两种写法 */
        SB.Save.unlockAlbum('ending', '8 月 31 日', SB.Story.ownConsole()
          ? '柜子上空了一块，鞋盒旁边多了一台。壳上那道划痕你后来一直认得。'
          : '暑假作业还剩两页。电视柜上空了一块，屏幕上那层薄灰能看见自己的脸。');
        SB.Save.save();
        SB.UI.interlude(this, this.endingLines(), function () {
          self.busy = false;
          self.loadEntries();
          self.buildList();
          self.refresh();
        });
      } else {
        SB.Audio.bgm('bgm_room');
      }
    },

    /* 结局正文：按你这个夏天的实际数据现编。
     *
     * 分工要说清楚，不然会重复播一遍：
     *   客厅睡下那一刻放的是 SB.Story.endingBody()（那台机器还了没有）；
     *   这里接着放统计、变体（买到没有 × 妈妈关系 × 心情）和结尾。 */
    endingLines: function () {
      var s = SB.Save.d, st = s.stats;
      var own = SB.Save.ownedCarts().length;
      var cleared = 0;
      SB.CARTS.forEach(function (c) { if (s.carts[c.id] && s.carts[c.id].cleared) cleared++; });

      var out = [];
      out.push('这个夏天你攒了 ' + own + ' 张卡带，通关 ' + cleared + ' 张。');
      out.push('哈气 ' + (st.blows || 0) + ' 次，在桌上划了 ' + (st.rubs || 0) + ' 下，拍了 '
        + (st.slaps || 0) + ' 次电视。');
      out.push('被抓 ' + (s.caught || 0) + ' 次，逃掉 ' + (s.escaped || 0) + ' 次。');
      /* 钱和目标：这是这一版真正的主线，必须在结局里结一次账 */
      var lg = SB.Story.state().ledger;
      out.push('一个夏天进账 ' + SB.money(lg.total || 0) +
        (lg.saved > 0 ? '，砍价省下 ' + SB.money(lg.saved) : '') + '。');
      out.push(SB.Story.ownConsole()
        ? '四十五块，你自己挣的。'
        : '那台二手主机还在张老板的台子底下，纸箱上落了灰。');
      out = out.concat(SB.Story.endingVariantLines());
      out.push('这个夏天，你过得' + SB.Story.moodWord() + '。');
      out = out.concat(SB.Story.endingTail());
      return out;
    },

    /* 一行的点击行为：第一下选中，选中之后再点一下就是「重看」——
     * 键盘玩家按 A，用手点的人不该少一条路。 */

    /* 册子里有哪些条目。
     * 存档里的「解锁回忆」之外，序章那一夜是常驻的第一页 ——
     * 它不是解锁物，是这个夏天为什么会被想起来的原因。
     * 选中它按 A（或者再点一下）就能把 2026 年那个晚上重看一遍，重看不动存档。
     * 结局那一段播完也要重建列表，所以这件事必须只有一处写法。 */
    loadEntries: function () {
      this.entries = (SB.Save.d.album || []).slice();
      if (SB.Save.d.flags && SB.Save.d.flags.prologue) {
        var pro = SB.L.story.prologue.album;
        this.entries.unshift({
          day: 0, title: pro.day, text: pro.text, replay: 'prologue'
        });
      }
      return this.entries;
    },

    /* ---------------- 左：回忆条目 ---------------- */
    buildList: function () {
      var self = this;
      if (this.rowObjs) this.rowObjs.forEach(function (o) { o.destroy(); });
      this.rowObjs = [];
      this.rows = [];

      if (!this.entries.length) {
        this.rowObjs.push(SB.Text.add(this, LIST.x + 12, LIST.y + 16,
          '还没有什么值得记下来的。\n\n先去客厅把卡带插上。', 12, SB.C.GREY6).setDepth(SB.D.DIALOG - 8));
        return;
      }

      var max = 8;
      for (var i = 0; i < max; i++) {
        var idx = this.top + i;
        if (idx >= this.entries.length) break;
        var e = this.entries[idx];
        var y = LIST.y + 10 + i * 20;
        var t = SB.Text.add(this, LIST.x + 14, y, (e.day ? 'D' + e.day + '　' : '') + (e.title || '一段回忆'),
          12, SB.C.GREY8).setDepth(SB.D.DIALOG - 8);
        this.rowObjs.push(t);
        this.rows.push({ e: e, y: y, txt: t, idx: idx });

        var z = this.add.zone(LIST.x + 6, y - 3, LIST.w - 12, 18).setOrigin(0, 0)
          .setDepth(SB.D.FOCUS).setInteractive({ useHandCursor: true });
        /* 回调必须用工厂函数生成：ES5 里 var 是函数作用域，
         * 直接在循环体里写 var ii = idx 的话，所有行共用最后一个 ii，
         * 点哪一行都会选中最后一行（这个坑真的踩过）。 */
        z.on('pointerdown', rowTap(this, idx));
        this.rowObjs.push(z);
      }
      if (this.entries.length > max) {
        this.rowObjs.push(SB.Text.add(this, LIST.x + LIST.w - 60, LIST.y + LIST.h - 16,
          (this.cur + 1) + '/' + this.entries.length, 12, SB.C.GREY6).setDepth(SB.D.DIALOG - 8));
      }
    },

    /* ---------------- 右：卡带收集 + 统计 ---------------- */
    buildSide: function () {
      var self = this, s = SB.Save.d;
      SB.Text.add(this, SIDE.x + 10, SIDE.y + SIDE_ROW.title, '卡带收集', 12, SB.C.YEL4).setDepth(SB.D.DIALOG - 8);

      SB.CARTS.forEach(function (c, i) {
        var col = i % 6, row = Math.floor(i / 6);
        var x = SIDE.x + 10 + col * 30, y = SIDE.y + SIDE_ROW.grid + row * SIDE_ROW.gridPitch;
        var st = s.carts[c.id];
        var have = st && (st.owned || st.borrowed > 0);
        var box = self.add.rectangle(x, y, 26, 20, have ? (SB.CART_TINT[c.id] || SB.C.GREY5) : SB.C.GREY2, 1)
          .setOrigin(0, 0).setDepth(SB.D.DIALOG - 9);
        box.setStrokeStyle(1, have ? SB.C.GREY7 : SB.C.GREY4, 1);
        if (have && st.cleared) {
          SB.Text.add(self, x + 8, y + 3, '★', 12, SB.C.YEL3).setDepth(SB.D.DIALOG - 8);
        }
        if (have && st.dead) {
          SB.Text.add(self, x + 8, y + 3, '×', 12, SB.C.RED4).setDepth(SB.D.DIALOG - 8);
        }
      });

      var st2 = s.stats;
      var lines = [
        '开机 ' + (st2.boots || 0) + ' 次　　修卡 ' + (st2.repairs || 0) + ' 次',
        '哈气 ' + (st2.blows || 0) + '　划桌 ' + (st2.rubs || 0) + '　拍电视 ' + (st2.slaps || 0),
        '被抓 ' + (s.caught || 0) + '　逃掉 ' + (s.escaped || 0) + '　买卡 ' + (st2.buys || 0),
        /* 心情不给数字，只给那个词 —— 它是晴雨表，不是又一根资源条。
         * 这一格宽 176px，四行是上限：再多一行就压到下面那段回忆正文上了。 */
        '信任 ' + Math.round(s.momTrust) + '/100　心情 ' + SB.Story.moodWord()
      ];
      SB.Text.add(this, SIDE.x + 10, SIDE.y + SIDE_ROW.stats, lines.join('\n'), 12, SB.C.GREY7)
        .setDepth(SB.D.DIALOG - 8);
    },

    /* ---------------- 刷新 ---------------- */
    refresh: function () {
      var self = this, s = SB.Save.d;
      var own = SB.Save.ownedCarts().length;
      this.sum.setText('第 ' + s.day + ' 天　卡带 ' + own + '/' + SB.CARTS.length
        + '　回忆 ' + this.entries.length + ' 条'
        + '　' + (SB.Story.ownConsole() ? '机器是自己的' : '机器是借的'));

      /* 滚动跟着光标 */
      if (this.entries.length) {
        this.cur = SB.clamp(this.cur, 0, this.entries.length - 1);
        if (this.cur < this.top) { this.top = this.cur; this.buildList(); }
        if (this.cur > this.top + 7) { this.top = this.cur - 7; this.buildList(); }
      }

      this.rows.forEach(function (r) {
        var on = r.idx === self.cur;
        r.txt.setTint(on ? SB.C.YEL3 : SB.C.GREY7);
        if (on) self.focus.at(LIST.x + 6, r.y - 4, LIST.w - 12, 18);
      });

      var e = this.entries[this.cur];
      /* 正文按板子宽度折行、按剩下的高度限行，超出的收成省略号 */
      this.detail.setText(e
        ? SB.Text.clamp(e.text || '', SIDE.w - 20, 12, SIDE_ROW.detailMaxLines)
        : '');

      var end = this.ending;
      var canReplay = !!(e && e.replay) && !end;
      this.hint.set(function () {
        var parts = [['ud', '翻回忆']];
        if (canReplay) parts.push(['a', '重看']);
        parts.push(['b', end ? '回到标题' : '返回']);
        return (end ? '这个夏天结束了。' : '') + SB.Input.tip(parts);
      });
    },

    update: function () {
      SB.Input.update();
      if (this.busy) return;
      var p = SB.Input.p1;
      if (p.just.up) { this.cur--; SB.Audio.sfx('ui_move', { volume: 0.4 }); this.refresh(); }
      if (p.just.down) { this.cur++; SB.Audio.sfx('ui_move', { volume: 0.4 }); this.refresh(); }
      if (p.just.a) this.replay();
      if (p.just.b || p.just.start) this.back();
    },

    /* 重看：目前只有序章一条。看完回到这本册子，光标还在原处。 */
    replay: function () {
      if (this.ending) return;
      var e = this.entries[this.cur];
      if (!e || e.replay !== 'prologue') return;
      SB.Audio.sfx('ui_confirm');
      this.busy = true;
      SB.UI.go(this, 'Prologue', { from: 'album', albumFrom: this.from });
    },

    back: function () {
      SB.Audio.sfx('ui_cancel');
      if (this.ending) { SB.UI.go(this, 'Title', { from: 'ending' }); return; }
      var t = (this.from === 'Room') ? 'Room' : 'Title';
      SB.UI.go(this, t, { from: 'album' });
    }
  });

})(window.SB);
