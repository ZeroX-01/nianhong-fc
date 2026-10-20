/* 回家吃饭 · 第三幕：厨房。
 * 门口 → 客厅（衣柜顶的纸箱）→ 厨房（洗菜）→ 两句话 → 上桌。 */
(function (SB) {
  'use strict';

  SB.HKitchenScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HKitchenScene() { Phaser.Scene.call(this, { key: 'HKitchen' }); },

    init: function (data) {
      this.from = (data && data.from) || 'bus';
      this.leaving = false;
      this.mode = '';
      this.washCount = 0;
      this.washTxt = null;
      this.consoleAsked = false;
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#100e12');
      this.drawRoom();
      this.stage = SB.Text.add(this, 14, 8, '第二幕 · 厨房', 12, 0x6d6d80);
      this.timeLabel = SB.Text.add(this, SB.W - 14, 8, '20:50', 12, 0x92929f).setOrigin(1, 0);

      this.events.once('shutdown', function () { SB.HVoice.stop(); });
      SB.UI.fadeIn(this, 320);
      this.time.delayedCall(340, function () { self.door(); });
    },

    drawRoom: function () {
      var W = SB.W, H = SB.H;
      var g = this.add.graphics();
      /* 墙 + 地 */
      g.fillStyle(0x24242f, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0x2a1a10, 1); g.fillRect(0, 196, W, 74);
      g.fillStyle(0x46291a, 1); g.fillRect(0, 196, W, 4);
      /* 窗 + 月亮 */
      g.fillStyle(0x0c1832, 1); g.fillRect(34, 38, 112, 92);
      g.lineStyle(3, 0x46291a, 1); g.strokeRect(34, 38, 112, 92);
      g.fillStyle(0x46291a, 1); g.fillRect(88, 38, 3, 92);
      g.fillRect(34, 82, 112, 3);
      this.add.circle(112, 62, 13, 0xf5db6e);
      this.add.circle(106, 57, 11, 0x0c1832);
      /* 衣柜（左边） */
      g.fillStyle(0x46291a, 1); g.fillRect(360, 24, 96, 128);
      g.lineStyle(2, 0x2a1a10, 1); g.strokeRect(360, 24, 96, 128);
      g.fillStyle(0x63402a, 1); g.fillRect(364, 28, 88, 120);
      g.lineStyle(1, 0x46291a, 1); g.strokeRect(404, 28, 1, 120);
      /* 衣柜顶上的纸箱 */
      g.fillStyle(0x85583a, 1); g.fillRect(372, 10, 62, 16);
      g.lineStyle(1, 0x46291a, 1); g.strokeRect(372, 10, 62, 16);
      /* 灶台 + 锅 */
      g.fillStyle(0x383845, 1); g.fillRect(160, 136, 150, 60);
      g.fillStyle(0x4f4f60, 1); g.fillRect(160, 136, 150, 4);
      g.fillStyle(0x24242f, 1); g.fillRect(178, 116, 42, 22);
      g.fillStyle(0x6d6d80, 1); g.fillRect(182, 112, 34, 6);
      this.add.circle(199, 112, 16, 0x4f4f60);
      this.add.circle(199, 112, 13, 0x6d6d80);
      /* 桌上的碗 */
      g.fillStyle(0x63402a, 1); g.fillRect(120, 200, 250, 8);
      this.add.circle(190, 194, 10, 0xdcdce2);
      this.add.circle(190, 194, 7, 0x24242f);
      /* 抽油烟机 */
      g.fillStyle(0x383845, 1); g.fillRect(168, 64, 96, 14);
      g.fillStyle(0x4f4f60, 1); g.fillRect(200, 78, 32, 24);
    },

    /* ---------------- 节拍 ---------------- */
    door: function () {
      var self = this;
      SB.HVoice.play('mom_door');
      SB.UI.dialog(this, SB.HL.kitchen.door, {
        onDone: function () {
          SB.HVoice.stop();
          self.living();
        }
      });
    },

    living: function () {
      var self = this;
      var o = SB.HomeSave.origin;
      this.timeLabel.setText('20:55');

      if (!o || !o.ownConsole) {
        SB.UI.dialog(this, SB.HL.kitchen.living.concat(SB.HL.kitchen.consoleOld), {
          onDone: function () { self.kitchen(); }
        });
        return;
      }

      SB.UI.dialog(this, SB.HL.kitchen.living, {
        onDone: function () { self.consoleMenu(); }
      });
    },

    consoleMenu: function () {
      var self = this;
      SB.UI.menu(this, {
        title: '衣柜顶上的纸箱',
        items: [
          { label: '搬凳子去够', sub: '看看那台主机', value: 'take' },
          { label: '装作没看见', value: 'ignore' },
          { label: '问「那是什么？」', value: 'ask' }
        ],
        width: 250,
        y: 88,
        cancelable: false,
        onPick: function (it) {
          if (it.value === 'take' || it.value === 'ask') {
            SB.HomeSave.d.takeConsoleDown = true;
            SB.HomeSave.d.listen++;
            SB.HomeSave.save();
            self.consoleAsked = true;
            SB.UI.dialog(self, SB.HL.kitchen.consoleFound, {
              onDone: function () { self.kitchen(); }
            });
            return;
          }
          SB.UI.dialog(self, ['你没有抬头。纸箱在衣柜顶上，落着灰。'], {
            onDone: function () { self.kitchen(); }
          });
        }
      });
    },

    kitchen: function () {
      var self = this;
      this.timeLabel.setText('21:10');
      SB.UI.dialog(this, SB.HL.kitchen.kitchen, {
        onDone: function () { self.wash(); }
      });
    },

    /* 洗菜：按 A 三次。冲四遍以上会烂，三遍正好。 */
    wash: function () {
      var self = this;
      this.mode = 'wash';
      this.washCount = 0;
      this.washTxt = SB.Text.add(this, SB.W / 2, 232, SB.HL.kitchen.washStart, 12, 0xe6c49a)
        .setOrigin(0.5, 0);
      this.hint = SB.Text.add(this, SB.W / 2, 248, '按 A 或点屏幕冲水（0 / 3）', 12, 0x6d6d80)
        .setOrigin(0.5, 0);
      /* 手机上没有虚拟 A 键，点一下屏幕也算冲一遍 */
      this.input.on('pointerdown', this.washTap, this);
      this.events.once('shutdown', function () {
        self.input.off('pointerdown', self.washTap, self);
      });
    },

    washTap: function () {
      if (this.mode === 'wash') this.washAdd();
    },

    washTick: function () {
      if (this.mode !== 'wash') return;
      if (SB.Input.p1.just.a) this.washAdd();
    },

    washAdd: function () {
      var self = this;
      if (this.mode !== 'wash') return;
      this.washCount++;
      if (this.hint) this.hint.setText('按 A 或点屏幕冲水（' + this.washCount + ' / 3）');
      if (this.washCount < 3) return;

      this.mode = '';
      this.input.off('pointerdown', this.washTap, this);
      if (this.washTxt) { this.washTxt.destroy(); this.washTxt = null; }
      if (this.hint) { this.hint.destroy(); this.hint = null; }
      var lines = this.washCount >= 4 ? SB.HL.kitchen.washOver : SB.HL.kitchen.washOk;
      SB.UI.dialog(this, lines, {
        onDone: function () { self.talk(); }
      });
    },

    talk: function () {
      var self = this;
      this.timeLabel.setText('21:20');
      SB.UI.menu(this, {
        title: '厨房里',
        items: [
          { label: '「你一个人在家都吃什么？」', value: 'mom' },
          { label: '「爸呢？」', value: 'dad' },
          { label: '算了，先吃饭', value: 'skip' }
        ],
        width: 270,
        y: 88,
        cancelable: false,
        onPick: function (it) {
          if (it.value === 'mom' || it.value === 'dad') {
            SB.HomeSave.d.listen++;
            SB.HomeSave.save();
          }
          var lines = it.value === 'mom' ? SB.HL.kitchen.talkMom
            : (it.value === 'dad' ? SB.HL.kitchen.talkDad : SB.HL.kitchen.talkSkip);
          SB.UI.dialog(self, lines, {
            onDone: function () { self.dinner(); }
          });
        }
      });
    },

    dinner: function () {
      var self = this;
      this.timeLabel.setText('21:30');
      SB.HVoice.play('mom_dinner');
      SB.UI.dialog(this, SB.HL.kitchen.dinner, {
        onDone: function () {
          SB.HVoice.stop();
          SB.HomeSave.setChapter('table');
          self.leaving = true;
          SB.UI.go(self, 'HTable', { from: 'kitchen' });
        }
      });
    },

    update: function () {
      SB.Input.update();
      this.washTick();
    }
  });

})(window.SB);
