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
      this.canBox = false;
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#100e12');
      this.drawRoom();
      this.add.rectangle(0, 0, SB.W, 20, 0x000000, 0.62).setOrigin(0, 0);
      this.stage = SB.Text.add(this, 14, 8, '第二幕 · 厨房', 12, 0xdcdce2);
      this.timeLabel = SB.Text.add(this, SB.W - 14, 8, '20:50', 12, 0xf5db6e).setOrigin(1, 0);

      this.events.once('shutdown', function () { SB.HVoice.stop(); });
      SB.UI.fadeIn(this, 320);
      this.time.delayedCall(340, function () { self.door(); });
    },

    drawRoom: function () {
      this.livingLayer = this.add.container(0, 0);
      this.kitchenLayer = this.add.container(0, 0).setVisible(false);
      if (this.textures.exists('home_living')) {
        this.livingLayer.add(this.add.image(0, 0, 'home_living').setOrigin(0, 0));
      }
      if (this.textures.exists('home_kitchen')) {
        this.kitchenLayer.add(this.add.image(0, 0, 'home_kitchen').setOrigin(0, 0));
      }
      if (!this.textures.exists('home_living') && !this.textures.exists('home_kitchen')) {
        this.add.rectangle(0, 0, SB.W, SB.H, 0x24242f).setOrigin(0, 0);
      }

      /* 妈妈：门口一个、灶台前一个，跟着图层一起显示/隐藏 */
      if (this.textures.exists('home_mom')) {
        this.kitchenMom = this.add.sprite(320, 40, 'home_mom', 0).setOrigin(0, 0).setScale(2);
        this.kitchenLayer.add(this.kitchenMom);
      }

      /* 纸箱热点：让玩家真的去点那个箱子，而不是只读一行菜单 */
      this.boxRing = this.add.rectangle(292, 214, 52, 30)
        .setOrigin(0, 0).setDepth(SB.D.FOCUS)
        .setStrokeStyle(1, 0xf5db6e, 0.85).setVisible(false);
      this.tweens.add({ targets: this.boxRing, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
      this.boxZone = this.add.zone(292, 214, 52, 30).setOrigin(0, 0).setInteractive();
      var selfBox = this;
      this.boxZone.on('pointerdown', function () {
        if (!selfBox.canBox || SB.__dialogOpen || SB.__menu) return;
        selfBox.consoleMenu();
      });
    },

    showLiving: function () {
      if (this.livingLayer) this.livingLayer.setVisible(true);
      if (this.kitchenLayer) this.kitchenLayer.setVisible(false);
      this.canBox = true;
      if (this.boxRing) this.boxRing.setVisible(true);
    },

    showKitchen: function () {
      if (this.livingLayer) this.livingLayer.setVisible(false);
      if (this.kitchenLayer) this.kitchenLayer.setVisible(true);
      this.canBox = false;
      if (this.boxRing) this.boxRing.setVisible(false);
    },

    /* ---------------- 节拍 ---------------- */
    door: function () {
      var self = this;
      SB.HVoice.play('mom_door');
      SB.HomeBubble.say(this, SB.HL.bub.door, {
        momPos: { x: 430, y: 110 },
        onDone: function () {
          SB.HVoice.stop();
          self.living();
        }
      });
    },

    living: function () {
      var self = this;
      var o = SB.HomeSave.origin;
      this.showLiving();
      this.timeLabel.setText('20:55');

      if (!o || !o.ownConsole) {
        SB.UI.dialog(this, SB.HL.kitchen.living.concat(SB.HL.kitchen.consoleOld), {
          onDone: function () { self.kitchen(); }
        });
        return;
      }

      SB.UI.dialog(this, SB.HL.kitchen.living, {
        onDone: function () {
          self.canBox = true;
          if (self.boxRing) self.boxRing.setVisible(true);
          self.showBoxPrompt();
        }
      });
    },

    showBoxPrompt: function () {
      if (this.boxPrompt) { this.boxPrompt.setVisible(true); return; }
      this.boxPrompt = SB.Text.add(this, SB.W / 2, 252, '点电视柜旁边的纸箱 · 或按 A', 12, 0xf5db6e)
        .setOrigin(0.5, 0).setDepth(SB.D.HUD);
    },

    consoleMenu: function () {
      var self = this;
      this.canBox = false;
      if (this.boxRing) this.boxRing.setVisible(false);
      if (this.boxPrompt) this.boxPrompt.setVisible(false);
      SB.UI.menu(this, {
        title: '电视柜旁边的纸箱',
        items: [
          { label: '蹲下去拖出来', sub: '看看那台主机', value: 'take' },
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
      this.showKitchen();
      if (this.boxPrompt) this.boxPrompt.setVisible(false);
      this.timeLabel.setText('21:10');
      SB.HomeBubble.say(this, SB.HL.bub.kitchen, {
        momPos: { x: 320, y: 40 },
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
          if (it.value === 'mom' || it.value === 'dad') {
            SB.HomeBubble.say(self, it.value === 'mom' ? SB.HL.bub.talkMom : SB.HL.bub.talkDad, {
              momPos: { x: 320, y: 40 },
              onDone: function () { self.dinner(); }
            });
            return;
          }
          SB.UI.dialog(self, SB.HL.kitchen.talkSkip, {
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
      if (this.canBox && SB.Input.p1.just.a && !SB.HomeBubble.active &&
          !SB.__dialogOpen && !(SB.__menu && SB.__menu.isOpen())) {
        this.consoleMenu();
        return;
      }
      this.washTick();
    }
  });

})(window.SB);
