/* 设置。
 *
 * 做成一台电视机后面板的样子：一排旋钮，能调的东西都在这儿。
 * 除了音量，还有三项是这个游戏专有的：显像管特效强度、扫描线、
 * 以及「真的对着麦克风哈气」——那一项默认关着，因为得管浏览器要权限。 */
(function (SB) {
  'use strict';

  var ROW_Y = 56, ROW_H = 20, X = 56, W = 368;

  SB.SettingsScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function SettingsScene() { Phaser.Scene.call(this, { key: 'Settings' }); },

    init: function (data) {
      this.from = (data && data.from) || 'Title';
      this.cur = 0;
      this.busy = false;
      this.rows = [];
    },

    create: function () {
      var self = this, st = SB.Save.d.settings;

      this.add.rectangle(0, 0, SB.W, SB.H, SB.C.GREY1).setOrigin(0, 0).setDepth(SB.D.BG);
      /* 背板的散热栅格，纯装饰 */
      var g = this.add.graphics().setDepth(SB.D.BG + 1);
      g.fillStyle(SB.C.GREY2, 1);
      for (var y = 0; y < SB.H; y += 6) g.fillRect(0, y, SB.W, 3);

      SB.UI.panel(this, 40, 32, 400, 200, true).setDepth(SB.D.DIALOG - 12);
      SB.Text.add(this, 48, 14, '设　置', 16, SB.C.YEL4).setDepth(SB.D.HUD + 1);
      /* 副标题往左收一点，右上角腾给常驻的返回按钮 */
      SB.Text.add(this, 240, 18, '（机器背面的一排旋钮）', 12, SB.C.GREY6).setDepth(SB.D.HUD + 1);

      /* ---------------- 各项 ---------------- */
      this.defs = [
        {
          id: 'crt', label: '显像管特效', kind: 'level',
          get: function () { return st.crt; },
          set: function (v) { st.crt = SB.clamp(v, 0, 2); },
          text: function () { return ['关（干净画面）', '正常', '很脏的老电视'][st.crt]; }
        },
        {
          id: 'scanline', label: '扫描线', kind: 'bool',
          get: function () { return st.scanline ? 1 : 0; },
          set: function (v) { st.scanline = v > 0; },
          text: function () { return st.scanline ? '开' : '关'; }
        },
        {
          id: 'bgm', label: '音乐音量', kind: 'vol',
          get: function () { return st.bgm; },
          set: function (v) { st.bgm = Math.round(SB.clamp(v, 0, 1) * 10) / 10; },
          text: function () { return Math.round(st.bgm * 10) + ' / 10'; }
        },
        {
          id: 'sfx', label: '音效音量', kind: 'vol',
          get: function () { return st.sfx; },
          set: function (v) { st.sfx = Math.round(SB.clamp(v, 0, 1) * 10) / 10; },
          text: function () { return Math.round(st.sfx * 10) + ' / 10'; }
        },
        {
          id: 'shake', label: '拍电视时震屏', kind: 'bool',
          get: function () { return st.shake ? 1 : 0; },
          set: function (v) { st.shake = v > 0; },
          text: function () { return st.shake ? '开' : '关'; }
        },
        {
          id: 'mic', label: '用麦克风哈气', kind: 'bool',
          get: function () { return st.mic ? 1 : 0; },
          set: function (v) { self.setMic(v > 0); },
          text: function () { return st.mic ? '开（真的对着屏幕吹）' : '关（长按代替）'; }
        },
        { id: 'wipe', label: '清空存档', kind: 'action', text: function () { return '这个夏天重新开始'; } },
        { id: 'back', label: '返回', kind: 'action', text: function () { return ''; } }
      ];

      this.defs.forEach(function (d, i) {
        var y = ROW_Y + i * ROW_H;
        var label = SB.Text.add(self, X + 12, y + 4, d.label, 12, SB.C.GREY8).setDepth(SB.D.DIALOG - 8);
        var val = SB.Text.add(self, X + 180, y + 4, '', 12, SB.C.YEL4).setDepth(SB.D.DIALOG - 8);
        var zone = self.add.zone(X, y, W, ROW_H).setOrigin(0, 0)
          .setDepth(SB.D.FOCUS).setInteractive({ useHandCursor: true });
        zone.on('pointerover', function () { if (!self.busy) { self.cur = i; self.refresh(); } });
        zone.on('pointerdown', function (pt) {
          if (self.busy) return;
          self.cur = i; self.refresh();
          if (d.kind === 'action') self.pick();
          /* 点在右半边就加、左半边就减，跟旋钮一样 */
          else self.nudge(pt.worldX > X + W / 2 ? 1 : -1);
        });
        self.rows.push({ def: d, label: label, val: val, y: y });
      });

      this.focus = SB.UI.focus(this);
      this.hint = SB.UI.hint(this, function () {
        return SB.Input.tip([['ud', '选'], ['lr', '调'], ['a', '确认'], ['b', '返回']]);
      });
      this.backBtn = SB.UI.corner(this, '← 返回', function () { if (!self.busy) self.back(); }, { y: 8 });
      this.tip = SB.Text.add(this, 44, 236, '', 12, SB.C.GREY6).setDepth(SB.D.HUD + 1);

      this.refresh();
      SB.UI.fadeIn(this, 200);
    },

    refresh: function () {
      var self = this;
      this.rows.forEach(function (r, i) {
        r.val.setText(r.def.text());
        r.label.setTint(i === self.cur ? SB.C.WHITE : SB.C.GREY7);
        r.val.setTint(i === self.cur ? SB.C.YEL3 : SB.C.GREY6);
      });
      var row = this.rows[this.cur];
      if (row) this.focus.at(X, row.y, W, ROW_H);

      var d = this.defs[this.cur];
      var tips = {
        crt: '「很脏的老电视」雪花、荫罩、反光都更重，更像 2004 年家里那台。',
        scanline: '关掉扫描线画面更清楚，但也就没那个味道了。',
        bgm: '所有音乐都是 8-bit 现场合成的，跟当年那台机器一个路子。',
        sfx: '哈气、划桌、拍电视的声音都在这一档里。',
        shake: '晕 3D 的话把它关掉，拍电视照样有效。',
        mic: '开了以后修卡带能真的对着屏幕吹气，浏览器会先问权限。',
        wipe: '删掉这个夏天的一切：卡带、钱、回忆册，找不回来。',
        back: ''
      };
      /* 只留一行，别顶到底部提示条上去 */
      this.tip.setText(SB.Text.wrap(tips[d.id] || '', SB.W - 56, 12).split('\n')[0]);
    },

    update: function () {
      SB.Input.update();
      if (this.busy) return;
      var p = SB.Input.p1;
      if (p.just.up) this.move(-1);
      if (p.just.down) this.move(1);
      if (p.just.left) this.nudge(-1);
      if (p.just.right) this.nudge(1);
      if (p.just.a) this.pick();
      if (p.just.b || p.just.start) this.back();
    },

    move: function (d) {
      this.cur = (this.cur + d + this.defs.length) % this.defs.length;
      SB.Audio.sfx('ui_move', { volume: 0.4 });
      this.refresh();
    },

    /* 左右拧旋钮 */
    nudge: function (d) {
      var def = this.defs[this.cur];
      if (!def || def.kind === 'action') return;
      if (def.kind === 'bool') def.set(def.get() > 0 ? 0 : 1);
      else if (def.kind === 'level') def.set(def.get() + d);
      else if (def.kind === 'vol') def.set(def.get() + d * 0.1);
      SB.Save.save();
      SB.Audio.vol();
      SB.Audio.sfx('ui_move', { volume: 0.5 });
      this.refresh();
    },

    pick: function () {
      var self = this, def = this.defs[this.cur];
      if (!def) return;
      if (def.kind === 'action') {
        if (def.id === 'back') { this.back(); return; }
        if (def.id === 'wipe') { this.confirmWipe(); return; }
      }
      this.nudge(1);
    },

    /* 麦克风要现场要权限，失败了就老实说 */
    setMic: function (on) {
      var self = this, st = SB.Save.d.settings;
      if (!on) {
        st.mic = false;
        if (SB.Mic && SB.Mic.disable) SB.Mic.disable();
        SB.Save.save();
        return;
      }
      if (!SB.Mic || !SB.Mic.enable) { st.mic = false; return; }
      this.busy = true;
      SB.Mic.enable().then(function (ok) {
        st.mic = !!ok;
        SB.Save.save();
        self.busy = false;
        self.refresh();
        SB.UI.toast(self, ok ? SB.line(SB.L.repair.micOn) : SB.line(SB.L.repair.micFail), 2200);
      });
    },

    confirmWipe: function () {
      var self = this;
      this.busy = true;
      SB.UI.menu(this, {
        title: '真的要把这个夏天删掉吗？',
        items: [
          { label: '不了', value: 'no' },
          { label: '删掉，重新开一个夏天', value: 'yes' }
        ],
        width: 260, y: 100,
        onCancel: function () { self.busy = false; },
        onPick: function (it) {
          self.busy = false;
          if (it.value !== 'yes') return;
          SB.Save.wipe();
          SB.Save.load();
          SB.Audio.sfx('tv_power_off');
          SB.Parent.disarm();
          SB.UI.fadeOut(self, 420, function () { self.scene.start('Title', { wiped: true }); });
        }
      });
    },

    back: function () {
      SB.Save.save();
      SB.Audio.vol();
      SB.Audio.sfx('ui_cancel');
      var t = (this.from === 'Room') ? 'Room' : 'Title';
      SB.UI.go(this, t, { from: 'settings' });
    }
  });

})(window.SB);
