/* 回家吃饭 · 第一幕：末班车。
 * 会议室 → 车上 → 县汽车站。样片里菜市场先跳过，用一句“已经收摊了”带过。 */
(function (SB) {
  'use strict';

  SB.HBusScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HBusScene() { Phaser.Scene.call(this, { key: 'HBus' }); },

    init: function (data) {
      this.from = (data && data.from) || 'title';
      this.leaving = false;
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#07070a');
      this.drawOffice();
      this.drawBus();
      this.busLayer.setVisible(false);

      this.stage = SB.Text.add(this, 14, 8, '第一幕 · 末班车', 12, 0x6d6d80);
      this.timeLabel = SB.Text.add(this, SB.W - 14, 8, '18:42', 12, 0x92929f).setOrigin(1, 0);

      SB.UI.fadeIn(this, 320);
      this.time.delayedCall(360, function () { self.intro(); });
    },

    /* ---------------- 背景 ---------------- */
    drawOffice: function () {
      var W = SB.W, H = SB.H;
      this.officeLayer = this.add.container(0, 0);
      var g = this.add.graphics();
      g.fillStyle(0x14141c, 1); g.fillRect(0, 0, W, H);
      /* 会议桌 */
      g.fillStyle(0x24242f, 1); g.fillRect(36, 168, 408, 70);
      g.fillStyle(0x2f2f3d, 1); g.fillRect(36, 168, 408, 4);
      /* 墙上的白板 */
      g.fillStyle(0x383845, 1); g.fillRect(46, 34, 190, 106);
      g.lineStyle(2, 0x4f4f60, 1); g.strokeRect(46, 34, 190, 106);
      this.officeLayer.add(g);
      this.officeLayer.add(SB.Text.add(this, 58, 46, 'Q3 复盘', 12, 0xb8b8c2));
      this.officeLayer.add(SB.Text.add(this, 58, 66, '· 版本发布\n· 客户口径\n· 下周排期', 12, 0x6d6d80));
      /* 笔记本 + 手机 */
      this.officeLayer.add(this.add.rectangle(300, 176, 88, 52, 0x0c1832).setOrigin(0, 0));
      this.officeLayer.add(this.add.rectangle(304, 180, 80, 44, 0x17346b).setOrigin(0, 0));
      this.officeLayer.add(this.add.rectangle(352, 196, 14, 22, 0x2a2a35).setOrigin(0, 0));
      var glow = this.add.circle(359, 207, 10, 0x93d4ea, 0.18);
      this.officeLayer.add(glow);
      this.tweens.add({ targets: glow, alpha: 0.32, duration: 1200, yoyo: true, repeat: -1 });
    },

    drawBus: function () {
      var W = SB.W, H = SB.H;
      this.busLayer = this.add.container(0, 0);
      var g = this.add.graphics();
      g.fillStyle(0x0c1832, 1); g.fillRect(0, 0, W, H);
      /* 车窗 */
      g.fillStyle(0x17346b, 1); g.fillRect(24, 34, 300, 150);
      g.lineStyle(3, 0x24242f, 1); g.strokeRect(24, 34, 300, 150);
      g.fillStyle(0x0c1832, 1); g.fillRect(175, 34, 4, 150);
      /* 窗外城市灯 */
      var i;
      for (i = 0; i < 26; i++) {
        var x = 30 + (i * 47) % 288;
        var y = 60 + (i * 31) % 110;
        g.fillStyle(i % 3 === 0 ? 0xf5db6e : (i % 3 === 1 ? 0x93d4ea : 0xe6c49a), 0.55);
        g.fillRect(x, y, 3 + (i % 4), 2);
      }
      /* 座椅 */
      g.fillStyle(0x2a1a10, 1); g.fillRect(0, 208, W, 62);
      g.fillStyle(0x46291a, 1); g.fillRect(0, 208, W, 6);
      g.fillStyle(0x46291a, 1); g.fillRect(330, 190, 120, 20);
      this.busLayer.add(g);
      /* 车窗上的雨痕 */
      var r = this.add.graphics();
      r.lineStyle(1, 0x93d4ea, 0.22);
      for (i = 0; i < 18; i++) {
        var rx = 30 + (i * 53) % 288;
        var ry = 40 + (i * 29) % 120;
        r.beginPath(); r.moveTo(rx, ry); r.lineTo(rx - 1, ry + 8 + (i % 7)); r.strokePath();
      }
      this.busLayer.add(r);
      this.busLayer.add(SB.Text.add(this, 24, 16, '末班车 · 开往县里', 12, 0x92929f));
    },

    showBus: function () {
      this.officeLayer.setVisible(false);
      this.busLayer.setVisible(true);
      this.timeLabel.setText('19:20');
    },

    /* ---------------- 第一幕的节拍 ---------------- */
    intro: function () {
      var self = this;
      SB.UI.dialog(this, SB.HL.bus.intro, {
        onDone: function () { self.phoneMenu(); }
      });
    },

    phoneMenu: function () {
      var self = this;
      SB.UI.menu(this, {
        title: '手机',
        items: [
          { label: '工作群（99+）', sub: '明早九点前', value: 'work' },
          { label: '妈妈（语音 6 秒）', sub: '未听', value: 'mom' },
          { label: '房东', sub: '房租', value: 'rent' }
        ],
        width: 230,
        y: 82,
        cancelable: false,
        onPick: function (it) {
          if (it.value === 'work') {
            SB.HomeSave.d.phone++;
            SB.HomeSave.save();
            SB.UI.dialog(self, SB.HL.bus.work, { onDone: function () { self.voice(); } });
            return;
          }
          if (it.value === 'rent') {
            SB.UI.dialog(self, SB.HL.bus.rent, { onDone: function () { self.voice(); } });
            return;
          }
          self.voice();
        }
      });
    },

    voice: function () {
      var self = this;
      SB.UI.dialog(this, SB.HL.bus.voice, {
        onDone: function () { self.replyMenu(); }
      });
    },

    replyMenu: function () {
      var self = this;
      SB.UI.menu(this, {
        title: '怎么回',
        items: [
          { label: '「回。」', value: 'yes' },
          { label: '「大概八点到。」', value: 'eight' },
          { label: '「晚点再说。」', value: 'late' }
        ],
        width: 220,
        y: 92,
        cancelable: false,
        onPick: function (it) {
          var d = SB.HomeSave.d;
          d.reply = it.value;
          if (it.value === 'late') d.listen = Math.max(0, d.listen - 1);
          SB.HomeSave.save();
          var lines = it.value === 'yes' ? SB.HL.bus.replyYes
            : (it.value === 'eight' ? SB.HL.bus.replyEight : SB.HL.bus.replyLate);
          SB.UI.dialog(self, lines, { onDone: function () { self.ride(); } });
        }
      });
    },

    ride: function () {
      var self = this;
      this.showBus();
      SB.UI.dialog(this, SB.HL.bus.ride, {
        onDone: function () { self.station(); }
      });
    },

    station: function () {
      var self = this;
      SB.UI.dialog(this, SB.HL.bus.station, {
        onDone: function () {
          SB.HomeSave.setChapter('kitchen');
          self.leaving = true;
          SB.UI.go(self, 'HKitchen', { from: 'bus' });
        }
      });
    },

    update: function () {
      SB.Input.update();
    }
  });

})(window.SB);
