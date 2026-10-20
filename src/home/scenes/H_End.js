/* 回家吃饭 · 样片结尾。
 * 只展示四个主结局里命中的那一个；隐藏的 console 结局留给完整版。 */
(function (SB) {
  'use strict';

  SB.HEndScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HEndScene() { Phaser.Scene.call(this, { key: 'HEnd' }); },

    init: function (data) {
      this.ending = (data && data.ending) || SB.HomeSave.d.ending || 'stay_warm';
      this.leaving = false;
    },

    create: function () {
      var self = this, W = SB.W, H = SB.H;
      this.cameras.main.setBackgroundColor('#07070a');
      this.add.rectangle(0, 0, W, H, 0x0a0a0e).setOrigin(0, 0);
      /* 窗、月亮、桌子：和标题同一间屋子 */
      this.add.rectangle(330, 26, 118, 104, 0x0c1832).setOrigin(0, 0);
      this.add.rectangle(330, 26, 118, 104).setOrigin(0, 0).setStrokeStyle(3, 0x2a1a10);
      this.add.circle(410, 58, 15, 0xf5db6e);
      this.add.circle(404, 53, 13, 0x0c1832);
      this.add.rectangle(0, 196, W, 74, 0x1c1a20).setOrigin(0, 0);
      this.add.rectangle(36, 196, 408, 6, 0x2a1a10).setOrigin(0, 0);
      this.add.circle(150, 190, 10, 0xdcdce2);
      this.add.circle(150, 190, 7, 0x24242f);
      this.add.circle(330, 190, 10, 0xdcdce2);
      this.add.circle(330, 190, 7, 0x24242f);

      var title = SB.Text.add(this, W / 2, 30, '回家吃饭', 16, 0xe0b422).setOrigin(0.5, 0).setScale(2);
      var tag = SB.Text.add(this, W / 2, 74, this.tagOf(this.ending), 12, 0x92929f).setOrigin(0.5, 0);

      SB.UI.fadeIn(this, 500);
      var lines = SB.HL.end[this.ending] || SB.HL.end.stay_warm;
      this.time.delayedCall(500, function () {
        SB.UI.dialog(self, lines, {
          onDone: function () { self.finalLine(); }
        });
      });
    },

    tagOf: function (id) {
      if (id === 'stay_warm') return '留下过夜 · 最暖的一顿';
      if (id === 'leave_warm') return '吃完再走 · 还赶得上末班车';
      if (id === 'stay_cold') return '留下 · 但没说开';
      if (id === 'leave_cold') return '走了 · 汤还在桌上';
      return '一个晚上';
    },

    finalLine: function () {
      var self = this;
      var line = (SB.HL.end.line && SB.HL.end.line[this.ending]) || '';
      var t = SB.Text.add(this, SB.W / 2, 150, line, 12, 0xe6c49a).setOrigin(0.5, 0);
      var tip = SB.Text.add(this, SB.W / 2, 168, '— 样片到此 —', 12, 0x6d6d80).setOrigin(0.5, 0);
      var d = SB.HomeSave.d;
      var eff = SB.HomeSave.effectiveListen();
      var stat = '听了 ' + eff + ' 次 · 看了 ' + d.phone + ' 次手机 · ' +
        (d.stay ? '留下' : '赶车') + (d.takeConsoleDown ? ' · 把主机拿下来了' : '');
      SB.Text.add(this, SB.W / 2, 184, stat, 12, 0x4f4f60).setOrigin(0.5, 0);

      this.time.delayedCall(700, function () {
        SB.UI.menu(self, {
          title: '这一晚',
          items: [
            { label: '回到标题', value: 'title' },
            { label: '重新过这一晚', value: 'again' }
          ],
          width: 220,
          y: 92,
          cancelable: false,
          onPick: function (it) {
            self.leaving = true;
            if (it.value === 'again') SB.HomeSave.reset();
            SB.UI.go(self, 'HTitle', { from: 'end' });
          }
        });
      });
    },

    update: function () {
      SB.Input.update();
    }
  });

})(window.SB);
