/* 回家吃饭 · 第四幕：饭桌（样片只做工作 / 身体两个话题）。
 * 核心不是“说服妈妈”，是“你听没听”。 */
(function (SB) {
  'use strict';

  SB.HTableScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HTableScene() { Phaser.Scene.call(this, { key: 'HTable' }); },

    init: function (data) {
      this.from = (data && data.from) || 'kitchen';
      this.leaving = false;
      this.done = {};
      this.spots = [];
      this.cur = 0;
      this.need = 3;
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#100e12');
      this.drawTable();
      this.buildProps();
      this.add.rectangle(0, 0, SB.W, 20, 0x000000, 0.62).setOrigin(0, 0);
      this.stage = SB.Text.add(this, 14, 8, '第三幕 · 饭桌', 12, 0xdcdce2);
      this.timeLabel = SB.Text.add(this, SB.W - 14, 8, '21:30', 12, 0xf5db6e).setOrigin(1, 0);

      this.events.once('shutdown', function () { SB.HVoice.stop(); });
      SB.UI.fadeIn(this, 320);
      this.time.delayedCall(360, function () { self.opening(); });
    },

    drawTable: function () {
      var W = SB.W, H = SB.H;
      if (this.textures.exists('home_table')) {
        this.add.image(0, 0, 'home_table').setOrigin(0, 0);
        return;
      }
      var g = this.add.graphics();
      g.fillStyle(0x1c1a20, 1); g.fillRect(0, 0, W, H);
      /* 窗外月亮 */
      g.fillStyle(0x0c1832, 1); g.fillRect(360, 28, 86, 88);
      g.lineStyle(2, 0x46291a, 1); g.strokeRect(360, 28, 86, 88);
      this.add.circle(414, 62, 14, 0xf5db6e);
      this.add.circle(408, 57, 12, 0x0c1832);
      /* 桌布 */
      g.fillStyle(0xdcdce2, 1); g.fillRect(28, 170, 424, 100);
      g.fillStyle(0xb8b8c2, 1); g.fillRect(28, 170, 424, 4);
      g.fillStyle(0x92929f, 1); g.fillRect(28, 222, 424, 1);
      /* 四菜一汤 */
      var dishes = [
        [110, 196, 0x8fd15c], [180, 190, 0xa8764c],
        [270, 196, 0xd93a34], [340, 190, 0xc99a6a]
      ];
      var i;
      for (i = 0; i < dishes.length; i++) {
        this.add.circle(dishes[i][0], dishes[i][1], 19, 0xdcdce2);
        this.add.circle(dishes[i][0], dishes[i][1], 15, 0x24242f);
        this.add.circle(dishes[i][0], dishes[i][1], 10, dishes[i][2]);
      }
      /* 汤 */
      this.add.circle(226, 226, 17, 0xdcdce2);
      this.add.circle(226, 226, 13, 0xe6c49a);
      /* 两个碗、两双筷子 */
      this.add.circle(110, 238, 11, 0xdcdce2);
      this.add.circle(110, 238, 8, 0x24242f);
      this.add.circle(330, 238, 11, 0xdcdce2);
      this.add.circle(330, 238, 8, 0x24242f);
      this.add.rectangle(146, 226, 3, 20, 0xa8764c).setOrigin(0, 0).setAngle(18);
      this.add.rectangle(366, 226, 3, 20, 0xa8764c).setOrigin(0, 0).setAngle(18);
      /* 空椅子（爸爸的位置） */
      g.fillStyle(0x46291a, 1); g.fillRect(200, 150, 80, 5);
      g.fillRect(204, 155, 5, 40); g.fillRect(271, 155, 5, 40);
      /* 电视的微光 */
      var tv = this.add.rectangle(0, 0, 70, 48, 0x17346b, 0.10).setOrigin(0, 0).setPosition(14, 30);
      this.tweens.add({ targets: tv, alpha: 0.18, duration: 1800, yoyo: true, repeat: -1 });
    },

    /* ---------------- 节拍 ---------------- */
    opening: function () {
      var self = this;
      SB.UI.dialog(this, [
        '你们面对面坐着。你爸的位置空着。',
        '窗外有人在楼下放小烟花，噼啪两声，就没了。'
      ], {
        onDone: function () {
          SB.HomeBubble.say(self, [
            { who: 'mom', text: '吃啊。凉了就不好吃了。' },
            { who: 'you', text: '嗯。' },
            { who: 'mom', text: '鱼你多吃点。' }
          ], { momPos: { x: 300, y: 58 }, onDone: function () { self.buildHotspots(); } });
        }
      });
    },

    /* ---------------- 桌上的物件 ----------------
     * 不再弹「话题菜单」：点桌上的手机/药瓶/电视/挂历，妈妈自己会说话。 */
    buildProps: function () {
      var W = SB.W;
      /* 桌上：手机、药瓶 */
      this.phone = this.add.rectangle(358, 166, 14, 22, 0x14141c).setOrigin(0, 0).setDepth(SB.D.PROP);
      this.phone.setStrokeStyle(1, 0x6d6d80, 1);
      this.add.rectangle(360, 169, 10, 15, 0x93d4ea, 0.85).setOrigin(0, 0).setDepth(SB.D.PROP + 1);
      this.medicine = this.add.rectangle(428, 146, 12, 18, 0xdcdce2).setOrigin(0, 0).setDepth(SB.D.PROP);
      this.medicine.setStrokeStyle(1, 0x6d6d80, 1);
      this.add.rectangle(428, 142, 12, 5, 0xd93a34).setOrigin(0, 0).setDepth(SB.D.PROP + 1);

      /* 妈妈：坐在桌子对面，只露上半身 */
      if (this.textures.exists('home_mom')) {
        this.mom = this.add.sprite(310, 58, 'home_mom', 0).setOrigin(0, 0).setDepth(SB.D.CHAR);
      }

      this.hintSpot = SB.Text.add(this, W / 2, 24, '点桌上的东西 · 方向键选 · A 看', 12, 0xdcdce2)
        .setOrigin(0.5, 0).setDepth(SB.D.HUD);
      this.focus = SB.UI.focus(this, { dim: 0, label: true });
    },

    buildHotspots: function () {
      var self = this;
      this.spots = [
        { id: 'work',      x: 350, y: 160, w: 30, h: 34, name: '手机' },
        { id: 'health',    x: 422, y: 136, w: 24, h: 32, name: '药' },
        { id: 'console',   x: 150, y: 34,  w: 176, h: 78, name: '电视' },
        { id: 'childhood', x: 120, y: 44,  w: 34, h: 46, name: '挂历' }
      ];
      for (var i = 0; i < this.spots.length; i++) {
        (function (sp, idx) {
          sp.zone = self.add.zone(sp.x, sp.y, sp.w, sp.h).setOrigin(0, 0)
            .setDepth(SB.D.FOCUS + 1).setInteractive({ useHandCursor: true });
          sp.zone.on('pointerover', function () { if (!self.done[sp.id]) { self.cur = idx; self.refreshSpot(); } });
          sp.zone.on('pointerdown', function () {
            if (SB.HomeBubble.active || SB.__dialogOpen || SB.__menu) return;
            self.cur = idx; self.refreshSpot(); self.interact(sp.id);
          });
        })(this.spots[i], i);
      }
      this.cur = 0;
      this.refreshSpot();
      this.updateHint();
    },

    refreshSpot: function () {
      var sp = this.spots[this.cur];
      if (!sp) return;
      this.focus.at(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4, sp.name);
    },

    moveSpot: function (d) {
      if (!this.spots.length) return;
      var n = this.spots.length, i = this.cur, guard = 0;
      do { i = (i + d + n) % n; guard++; } while (this.done[this.spots[i].id] && guard <= n);
      if (!this.done[this.spots[i].id]) {
        this.cur = i;
        this.refreshSpot();
        SB.Audio.sfx('ui_move', { volume: 0.4 });
      }
    },

    updateHint: function () {
      var left = 0, i;
      for (i = 0; i < this.spots.length; i++) if (!this.done[this.spots[i].id]) left++;
      if (this.hintSpot) this.hintSpot.setText(left ? '点桌上的东西 · 还有 ' + left + ' 样 · A 看' : '吃得差不多了');
    },

    interact: function (id) {
      var self = this;
      if (this.done[id] || SB.HomeBubble.active) return;
      this.done[id] = true;
      var sp = null, i;
      for (i = 0; i < this.spots.length; i++) if (this.spots[i].id === id) sp = this.spots[i];
      if (sp && sp.zone) { sp.zone.disableInteractive(); }
      if (this.focus) this.focus.hide();
      if (this.hintSpot) this.hintSpot.setVisible(false);
      SB.HomeSave.d.listen++;
      SB.HomeSave.save();

      var lines;
      if (id === 'work') lines = SB.HL.bub.work;
      else if (id === 'health') lines = SB.HL.bub.health;
      else if (id === 'childhood') lines = SB.HL.bub.childhood;
      else lines = (SB.HomeSave.origin && SB.HomeSave.origin.ownConsole) ? SB.HL.bub.consoleOwn : SB.HL.bub.consoleLost;

      SB.HomeBubble.say(this, lines, {
        momPos: { x: 300, y: 58 },
        onDone: function () { self.afterTopic(); }
      });
      this.updateHint();
    },

    afterTopic: function () {
      var n = 0, i;
      for (i = 0; i < this.spots.length; i++) if (this.done[this.spots[i].id]) n++;
      if (n >= this.need) { this.call(); return; }
      if (this.hintSpot) this.hintSpot.setVisible(true);
      this.updateHint();
      if (this.spots[this.cur] && this.done[this.spots[this.cur].id]) this.moveSpot(1);
      else this.refreshSpot();
    },

    call: function () {
      var self = this;
      if (this.focus) this.focus.hide();
      if (this.hintSpot) this.hintSpot.setVisible(false);
      this.timeLabel.setText('22:20');
      SB.UI.dialog(this, SB.HL.table.call, {
        onDone: function () {
          SB.UI.menu(self, {
            title: '张总',
            items: [
              { label: '接', value: 'answer' },
              { label: '挂掉，回「在吃饭」', value: 'reject' },
              { label: '关机', value: 'off' }
            ],
            width: 240,
            y: 92,
            cancelable: false,
            onPick: function (it) {
              if (it.value === 'answer') {
                SB.HomeSave.d.phone++;
                SB.HomeSave.save();
                SB.HVoice.play('boss_call');
                SB.UI.dialog(self, SB.HL.table.callAnswer, {
                  onDone: function () {
                    SB.HVoice.stop();
                    self.stay();
                  }
                });
                return;
              }
              if (it.value === 'off') {
                SB.HomeSave.d.listen++;
                SB.HomeSave.save();
                SB.UI.dialog(self, SB.HL.table.callOff, { onDone: function () { self.stay(); } });
                return;
              }
              SB.UI.dialog(self, SB.HL.table.callReject, { onDone: function () { self.stay(); } });
            }
          });
        }
      });
    },

    stay: function () {
      var self = this;
      this.timeLabel.setText('22:55');
      SB.UI.dialog(this, SB.HL.table.stay, {
        onDone: function () {
          SB.UI.menu(self, {
            title: '今晚',
            items: [
              { label: '「住下。」', value: 'yes' },
              { label: '「我赶末班车。」', value: 'no' }
            ],
            width: 220,
            y: 96,
            cancelable: false,
            onPick: function (it) {
              SB.HomeSave.d.stay = (it.value === 'yes');
              SB.HomeSave.save();
              var lines = it.value === 'yes' ? SB.HL.table.stayYes : SB.HL.table.stayNo;
              SB.UI.dialog(self, lines, { onDone: function () { self.ending(); } });
            }
          });
        }
      });
    },

    ending: function () {
      var self = this;
      var id = SB.HomeSave.ending();
      SB.HomeSave.d.ending = id;
      SB.HomeSave.d.chapter = 'end';
      SB.HomeSave.save();
      SB.UI.dialog(this, ['这一晚，先到这里。', '正式版还有菜市场、五个话题、四个结局。'], {
        onDone: function () {
          self.leaving = true;
          SB.UI.go(self, 'HEnd', { ending: id, from: 'table' });
        }
      });
    },

    update: function () {
      SB.Input.update();
      if (SB.HomeBubble.active || SB.__dialogOpen || (SB.__menu && SB.__menu.isOpen())) return;
      if (!this.spots || !this.spots.length) return;
      var p = SB.Input.p1;
      if (p.just.left) this.moveSpot(-1);
      if (p.just.right) this.moveSpot(1);
      if (p.just.up) this.moveSpot(-1);
      if (p.just.down) this.moveSpot(1);
      if (p.just.a) this.interact(this.spots[this.cur].id);
    }
  });

})(window.SB);
