/* 回家吃饭 · 标题。
 * 不做什么炫技开场：夜里的老房子，窗外的月亮，桌上有两副碗筷。 */
(function (SB) {
  'use strict';

  SB.HTitleScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HTitleScene() { Phaser.Scene.call(this, { key: 'HTitle' }); },

    create: function () {
      var self = this, W = SB.W, H = SB.H;
      this.leaving = false;

      this.cameras.main.setBackgroundColor('#0a0a0e');
      this.add.rectangle(0, 0, W, H, 0x14141c).setOrigin(0, 0);
      /* 地板 */
      this.add.rectangle(0, 190, W, 80, 0x2a1a10).setOrigin(0, 0);
      this.add.rectangle(0, 190, W, 2, 0x46291a).setOrigin(0, 0);
      /* 窗 */
      this.add.rectangle(318, 26, 130, 116, 0x0c1832).setOrigin(0, 0);
      this.add.rectangle(318, 26, 130, 116).setOrigin(0, 0).setStrokeStyle(3, 0x46291a);
      this.add.circle(404, 60, 17, 0xf5db6e);
      this.add.circle(398, 55, 15, 0x0c1832);
      this.add.rectangle(382, 26, 3, 116, 0x46291a).setOrigin(0, 0);
      this.add.rectangle(318, 82, 130, 3, 0x46291a).setOrigin(0, 0);
      /* 桌 */
      this.add.rectangle(34, 196, 412, 8, 0x63402a).setOrigin(0, 0);
      this.add.rectangle(48, 204, 8, 54, 0x46291a).setOrigin(0, 0);
      this.add.rectangle(424, 204, 8, 54, 0x46291a).setOrigin(0, 0);
      /* 两副碗筷：一副有人，一副空着 */
      this.add.circle(150, 190, 11, 0xdcdce2);
      this.add.circle(150, 190, 8, 0x24242f);
      this.add.circle(330, 190, 11, 0xdcdce2);
      this.add.circle(330, 190, 8, 0x24242f);
      this.add.rectangle(146, 180, 3, 18, 0xa8764c).setOrigin(0, 0).setAngle(20);
      this.add.rectangle(326, 180, 3, 18, 0xa8764c).setOrigin(0, 0).setAngle(20);

      /* 标题 */
      var tx = W / 2;
      var shadow = SB.Text.add(this, tx + 2, 30, '回家吃饭', 16, 0x000000)
        .setOrigin(0.5, 0).setScale(3);
      var title = SB.Text.add(this, tx, 28, '回家吃饭', 16, 0xe0b422)
        .setOrigin(0.5, 0).setScale(3);
      shadow.setAlpha(0); title.setAlpha(0);
      this.tweens.add({ targets: [shadow, title], alpha: 1, duration: 900, ease: 'Quad.easeOut' });

      var sub = SB.Text.add(this, tx, 96, SB.HL.title.sub, 12, 0x92929f)
        .setOrigin(0.5, 0).setAlpha(0);
      this.tweens.add({ targets: sub, alpha: 1, delay: 500, duration: 800 });

      var hint = SB.Text.add(this, W / 2, 244, '方向键选　A / X 确认', 12, 0x6d6d80)
        .setOrigin(0.5, 0);

      this.menuReady = false;
      this.time.delayedCall(500, function () {
        self.buildMenu();
        self.menuReady = true;
      });

      SB.UI.fadeIn(this, 600);
    },

    buildMenu: function () {
      var self = this;
      if (this.leaving || (this.menu && this.menu.isOpen && this.menu.isOpen())) return;
      var d = SB.HomeSave.d || {};
      var saveExists = !!(d.reply && d.reply !== 'none') || (d.chapter && d.chapter !== 'bus');
      var items = [];
      if (saveExists) items.push({ label: '继续', sub: this.chapterLabel(d.chapter), value: 'continue' });
      items.push({ label: saveExists ? '重新过这一晚' : '开始这一晚', value: 'new' });
      items.push({ label: '关于这个样片', value: 'about' });

      this.menu = SB.UI.menu(this, {
        title: '回家吃饭',
        items: items,
        width: 220,
        rowH: 22,
        y: 122,
        cancelable: false,
        onPick: function (it) { self.pick(it.value); }
      });
    },

    chapterLabel: function (c) {
      if (c === 'kitchen') return '厨房';
      if (c === 'table') return '饭桌';
      if (c === 'end') return '结尾';
      return '末班车';
    },

    pick: function (v) {
      var self = this;
      if (v === 'new') {
        SB.HomeSave.reset();
        this.leaving = true;
        SB.UI.go(this, 'HBus', { from: 'title' });
        return;
      }
      if (v === 'continue') {
        var d = SB.HomeSave.d;
        this.leaving = true;
        if (d.chapter === 'end') { SB.UI.go(this, 'HEnd', { ending: d.ending, from: 'title' }); return; }
        if (d.chapter === 'table') { SB.UI.go(this, 'HTable', { from: 'title' }); return; }
        if (d.chapter === 'kitchen') { SB.UI.go(this, 'HKitchen', { from: 'title' }); return; }
        SB.UI.go(this, 'HBus', { from: 'title' });
        return;
      }
      if (v === 'about') {
        SB.UI.dialog(this, SB.HL.title.about, {
          onDone: function () { self.buildMenu(); }
        });
      }
    },

    update: function () {
      SB.Input.update();
    }
  });

})(window.SB);
