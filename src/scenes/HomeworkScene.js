/* 写作业。
 *
 * 暑假作业本摊在小方桌上，抄大字，一页十六个格。铅笔是六棱的，
 * 削得太尖，写两笔就断。你写字的时候耳朵一直朝着电视那边。
 *
 * 玩法是「按笔顺」：格子上面给出这个字的笔画方向，你照着按方向键。
 * 按对一笔，格子里就多一笔；按错就得用橡皮擦掉重写，纸会起毛。
 * 写着写着「心思」会往电视上跑，跑满了就会走神，笔尖停在纸上不动。
 *
 * 它在整个游戏里的位置很实际：作业写到 60%，妈妈进门那一刻会心软一档。 */
(function (SB) {
  'use strict';

  /* 抄的字，以及每个字的笔画方向（只用上下左右四个方向表示，够意思就行） */
  var CHARS = [
    { c: '一', st: ['right'] },
    { c: '十', st: ['right', 'down'] },
    { c: '土', st: ['right', 'down', 'right'] },
    { c: '人', st: ['down', 'down'] },
    { c: '大', st: ['right', 'down', 'down'] },
    { c: '天', st: ['right', 'right', 'down', 'down'] },
    { c: '口', st: ['down', 'right', 'up'] },
    { c: '日', st: ['down', 'right', 'right', 'up'] },
    { c: '田', st: ['down', 'right', 'down', 'right'] },
    { c: '中', st: ['down', 'right', 'up', 'down'] },
    { c: '王', st: ['right', 'down', 'right', 'right'] },
    { c: '夏', st: ['right', 'down', 'right', 'down'] }
  ];

  var PAPER = { x: 40, y: 46, w: 400, h: 168 };
  var CELL = 46, GAP = 6, COLS = 8;

  SB.HomeworkScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HomeworkScene() { Phaser.Scene.call(this, { key: 'Homework' }); },

    init: function (data) {
      this.from = (data && data.from) || 'Room';
      this.busy = false;
      this.idx = 0;         // 当前写第几个格
      this.step = 0;        // 这个字写到第几笔
      this.mind = 0;        // 心思跑到电视上的程度 0..100
      this.zoned = false;   // 正在走神
      this.wrong = 0;
      this.done = 0;        // 这一轮写完的字数
      this.cells = [];
    },

    create: function () {
      var self = this, s = SB.Save.d;

      /* 客厅压暗，只留小方桌那一小片灯光 —— 你趴在桌上写字的视角 */
      if (this.textures.exists('bg_room')) {
        this.add.image(0, 0, 'bg_room').setOrigin(0, 0).setDepth(SB.D.BG);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.WOOD3).setOrigin(0, 0).setDepth(SB.D.BG);
      }
      this.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 0.66).setOrigin(0, 0).setDepth(SB.D.BG + 1);

      /* 作业本：微微发黄的纸，红色格线，中间一道装订的折痕 */
      var g = this.add.graphics().setDepth(SB.D.PROP);
      g.fillStyle(SB.C.WOOD7, 1); g.fillRect(PAPER.x - 4, PAPER.y - 4, PAPER.w + 8, PAPER.h + 8);
      g.fillStyle(SB.C.GREY8, 1); g.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
      g.fillStyle(SB.C.WOOD6, 0.45); g.fillRect(PAPER.x + PAPER.w / 2 - 1, PAPER.y, 2, PAPER.h);
      this.paperG = g;

      /* 8 个田字格，两行 */
      for (var i = 0; i < COLS * 2; i++) {
        var col = i % COLS, row = Math.floor(i / COLS);
        var x = PAPER.x + 10 + col * (CELL + GAP) / 1;
        var y = PAPER.y + 16 + row * (CELL + 22);
        if (x + CELL > PAPER.x + PAPER.w - 6) continue;
        this.drawCell(x, y);
        this.cells.push({ x: x, y: y, ch: SB.pick(CHARS), strokes: [], filled: false });
      }

      /* 铅笔笔尖：写到哪一格就落在哪一格 */
      this.pencil = this.add.graphics().setDepth(SB.D.FRONT_PROP);

      /* HUD */
      this.hud = SB.UI.hud(this);
      this.hint = SB.UI.hint(this, function () {
        return SB.Input.tip([['dir', '照着笔顺写'], ['b', '合上本子']]);
      });
      this.backBtn = SB.UI.corner(this, '← 合上本子', function () { if (!self.busy) self.finish(false); });
      this.barG = this.add.graphics().setDepth(SB.D.HUD);
      this.progTxt = SB.Text.add(this, 40, 24, '', 12, SB.C.GREY8).setDepth(SB.D.HUD + 1);
      /* 「心思」那一格整体往左挪：右上角留给常驻的「合上本子」按钮 */
      this.mindTxt = SB.Text.add(this, 268, 24, '', 12, SB.C.YEL4).setDepth(SB.D.HUD + 1);

      /* 笔顺提示：当前格上方一排箭头 */
      this.arrowG = this.add.graphics().setDepth(SB.D.HUD + 2);
      this.curTxt = SB.Text.add(this, PAPER.x, PAPER.y + PAPER.h + 10, '', 12, SB.C.GREY7)
        .setDepth(SB.D.HUD + 1);

      /* 走神时飘出来的那句话 */
      this.zoneTxt = SB.Text.add(this, SB.W / 2, 236, '', 12, SB.C.BLU5)
        .setOrigin(0.5, 0).setDepth(SB.D.HUD + 2).setVisible(false);

      /* 手机上写字也得有方向键，不然没法照笔顺写 */
      this.pad = SB.Input.wantTouch() ? new SB.TouchPad(this, { start: false }) : null;
      this.events.once('shutdown', function () { if (self.pad) { self.pad.destroy(); self.pad = null; } });

      this.bindInput();
      this.redraw();
      SB.UI.fadeIn(this, 220);
      SB.Audio.bgm('bgm_room');
      SB.Audio.loop('cicada', 0.2);
      this.events.once('shutdown', function () { SB.Audio.stopLoop('cicada'); });

      /* 坐下写字要花掉半个下午 */
      this.busy = true;
      if (s.ap < 1 && s.homework < 100) {
        SB.UI.dialog(this, ['你趴在桌上，眼睛已经睁不开了。今天写不动了。'], {
          onDone: function () { SB.UI.go(self, 'Room', { from: 'homework' }); }
        });
        return;
      }
      if (s.homework >= 100) {
        SB.UI.dialog(this, ['今天的都写完了。本子上那两页字，是你今年写得最整齐的两页。'], {
          onDone: function () { SB.UI.go(self, 'Room', { from: 'homework' }); }
        });
        return;
      }
      SB.Time.spend(1);
      this.hud.refresh();
      SB.UI.dialog(this, SB.L.homework.enter, {
        onDone: function () { self.busy = false; }
      });
    },

    /* ---------------- 画 ---------------- */
    drawCell: function (x, y) {
      var g = this.paperG;
      g.lineStyle(1, SB.C.RED5, 0.9);
      g.strokeRect(x, y, CELL, CELL);
      /* 田字格的两条虚线 */
      g.lineStyle(1, SB.C.RED5, 0.45);
      var i;
      for (i = 0; i < CELL; i += 4) {
        g.beginPath(); g.moveTo(x + i, y + CELL / 2); g.lineTo(x + i + 2, y + CELL / 2); g.strokePath();
        g.beginPath(); g.moveTo(x + CELL / 2, y + i); g.lineTo(x + CELL / 2, y + i + 2); g.strokePath();
      }
    },

    redraw: function () {
      var s = SB.Save.d;

      /* 已经写好的字：直接用点阵字画在格子里 */
      var self = this;
      this.cells.forEach(function (cell, i) {
        if (cell.txt) cell.txt.destroy();
        var isCur = (i === self.idx);
        if (!cell.strokes.length && !cell.filled && !isCur) { cell.txt = null; return; }
        /* 当前格先印一个很淡的字 —— 就是当年描红本上那种浅灰底字 */
        var alpha = cell.filled ? 1 : (cell.strokes.length ? 0.35 + 0.16 * cell.strokes.length : 0.16);
        cell.txt = SB.Text.add(self, cell.x + CELL / 2 - 8, cell.y + CELL / 2 - 8,
          cell.ch.c, 16, SB.C.GREY2).setDepth(SB.D.PROP + 2);
        cell.txt.setAlpha(Math.min(1, alpha));
      });

      /* 铅笔尖 + 当前格高亮 */
      var cur = this.cells[this.idx];
      this.pencil.clear();
      if (cur) {
        this.pencil.lineStyle(2, SB.C.YEL3, 0.95);
        this.pencil.strokeRect(cur.x - 2, cur.y - 2, CELL + 4, CELL + 4);
        /* 铅笔：一条斜杠 + 笔尖 */
        var px = cur.x + CELL + 6, py = cur.y + CELL - 4;
        this.pencil.fillStyle(SB.C.YEL2, 1);
        this.pencil.fillTriangle(px, py, px + 16, py + 22, px + 22, py + 16);
        this.pencil.fillStyle(SB.C.GREY2, 1);
        this.pencil.fillTriangle(px, py, px + 5, py + 6, px + 6, py + 5);
      }

      /* 笔顺箭头 */
      this.arrowG.clear();
      if (cur) {
        var st = cur.ch.st, ax = cur.x, ay = cur.y - 14;
        for (var k = 0; k < st.length; k++) {
          this.arrow(ax + k * 12, ay, st[k], k < this.step ? SB.C.GRN4 : (k === this.step ? SB.C.YEL3 : SB.C.GREY5));
        }
        this.curTxt.setText('这个字：' + cur.ch.c + '　共 ' + st.length + ' 笔　已写 ' + this.step + ' 笔'
          + (this.wrong ? '　（擦掉重写 ' + this.wrong + ' 次）' : ''));
      }

      this.drawBars();
    },

    /* 两根条每帧都在动，单独画，别把整页字重建一遍 */
    drawBars: function () {
      var s = SB.Save.d, g = this.barG;
      g.clear();
      var bw = 160;
      g.fillStyle(SB.C.GREY2, 1); g.fillRect(100, 26, bw, 7);
      g.fillStyle(SB.C.GRN4, 1); g.fillRect(100, 26, Math.round(bw * s.homework / 100), 7);
      g.lineStyle(1, SB.C.GREY5, 1); g.strokeRect(100, 26, bw, 7);
      g.fillStyle(SB.C.GREY2, 1); g.fillRect(300, 26, 90, 7);
      g.fillStyle(this.zoned ? SB.C.RED4 : SB.C.BLU4, 1);
      g.fillRect(300, 26, Math.round(90 * this.mind / 100), 7);
      g.lineStyle(1, SB.C.GREY5, 1); g.strokeRect(300, 26, 90, 7);

      this.progTxt.setText('作业 ' + Math.round(s.homework) + '%');
      this.mindTxt.setText('心思');
    },

    arrow: function (x, y, dir, color) {
      var g = this.arrowG;
      g.fillStyle(color, 1);
      var cx = x + 5, cy = y + 5;
      if (dir === 'right') g.fillTriangle(cx - 3, cy - 4, cx - 3, cy + 4, cx + 4, cy);
      else if (dir === 'left') g.fillTriangle(cx + 3, cy - 4, cx + 3, cy + 4, cx - 4, cy);
      else if (dir === 'down') g.fillTriangle(cx - 4, cy - 3, cx + 4, cy - 3, cx, cy + 4);
      else g.fillTriangle(cx - 4, cy + 3, cx + 4, cy + 3, cx, cy - 4);
    },

    /* ---------------- 输入 ---------------- */
    bindInput: function () {
      var self = this;
      this.input.on('pointerdown', function () { if (!self.busy && self.zoned) self.wake(); });
    },

    update: function (t, dt) {
      SB.Input.update();
      if (this.busy) return;
      var p = SB.Input.p1, s = SB.Save.d;

      /* 心思会自己往电视那边跑 */
      this.mind = SB.clamp(this.mind + dt * 0.006, 0, 100);
      if (this.mind >= 100 && !this.zoned) this.zoneOut();

      if (p.just.b || p.just.start) { this.finish(false); return; }

      if (this.zoned) {
        /* 走神了：随便按一下把自己拉回来 */
        if (p.just.a || p.just.left || p.just.right || p.just.up || p.just.down) this.wake();
        return;
      }

      var dir = null;
      if (p.just.left) dir = 'left';
      else if (p.just.right) dir = 'right';
      else if (p.just.up) dir = 'up';
      else if (p.just.down) dir = 'down';
      if (!dir) { this.drawBars(); return; }

      var cur = this.cells[this.idx];
      if (!cur) { this.finish(true); return; }

      if (cur.ch.st[this.step] === dir) {
        this.step++;
        cur.strokes.push(dir);
        SB.Audio.sfx('pencil_write', { volume: 0.7 });
        this.mind = SB.clamp(this.mind - 6, 0, 100);
        if (this.step >= cur.ch.st.length) this.finishChar(cur);
      } else {
        /* 写错了。橡皮擦一擦，纸上留一块灰。 */
        SB.Audio.sfx('ui_error', { volume: 0.5 });
        this.wrong++;
        this.step = 0;
        cur.strokes = [];
        this.mind = SB.clamp(this.mind + 10, 0, 100);
        this.cameras.main.shake(90, 0.002);
      }
      this.redraw();
    },

    finishChar: function (cur) {
      var s = SB.Save.d;
      cur.filled = true;
      this.step = 0;
      this.done++;
      this.idx++;
      s.homework = SB.clamp(s.homework + 12, 0, 100);
      SB.Save.save();
      SB.Audio.sfx('ui_confirm', { volume: 0.6 });

      if (s.homework >= 100) { this.finish(true); return; }
      if (this.idx >= this.cells.length) {
        /* 一页写满了，翻页 */
        var self = this;
        this.busy = true;
        SB.UI.dialog(this, ['一页写满了。你把本子翻到下一页，手边已经有一小堆橡皮屑。'], {
          onDone: function () {
            self.cells.forEach(function (c) {
              c.filled = false; c.strokes = []; c.ch = SB.pick(CHARS);
              if (c.txt) { c.txt.destroy(); c.txt = null; }
            });
            self.idx = 0;
            self.busy = false;
            self.redraw();
          }
        });
      }
      this.hud.refresh();
    },

    /* ---------------- 走神 ---------------- */
    zoneOut: function () {
      this.zoned = true;
      this.zoneTxt.setVisible(true).setText(SB.pick([
        '（电视就在两米外。黑着。）',
        '（要是这会儿开电视，能玩到四点半。）',
        '（楼下有人在喊别人家的小孩。）',
        '（笔尖停在纸上，洇出一个小黑点。）'
      ]));
      this.tweens.add({ targets: this.zoneTxt, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
      SB.Audio.sfx('fish_bubble', { volume: 0.4 });
      this.redraw();
    },

    wake: function () {
      this.zoned = false;
      this.mind = 40;
      this.tweens.killTweensOf(this.zoneTxt);
      this.zoneTxt.setAlpha(1).setVisible(false);
      this.redraw();
    },

    /* ---------------- 收尾 ---------------- */
    finish: function (auto) {
      var self = this, s = SB.Save.d;
      if (this.busy) return;
      this.busy = true;
      SB.Save.save();

      var lines;
      if (s.homework >= 100) {
        lines = SB.L.homework.done.concat(['（今天被抓到的话，你妈会心软一档）']);
        SB.Save.unlockAlbum('homework_done', '写完的那两页大字',
          '一个下午写满了两页。字很难看，但页数是够的。写完之后开电视，心里是踏实的。');
      } else if (s.homework >= 60) {
        lines = SB.L.homework.partial;
      } else {
        lines = SB.L.homework.giveup.concat([SB.line(SB.L.homework.hint)]);
      }

      SB.Audio.sfx('ui_cancel');
      SB.UI.dialog(this, lines, {
        onDone: function () { SB.UI.go(self, 'Room', { from: 'homework' }); }
      });
    }
  });

})(window.SB);
