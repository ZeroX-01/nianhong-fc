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
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#100e12');
      this.drawTable();
      this.stage = SB.Text.add(this, 14, 8, '第三幕 · 饭桌', 12, 0x6d6d80);
      this.timeLabel = SB.Text.add(this, SB.W - 14, 8, '21:30', 12, 0x92929f).setOrigin(1, 0);

      SB.UI.fadeIn(this, 320);
      this.time.delayedCall(360, function () { self.opening(); });
    },

    drawTable: function () {
      var W = SB.W, H = SB.H;
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
      SB.UI.dialog(this, SB.HL.table.opening, {
        onDone: function () { self.topics(); }
      });
    },

    topics: function () {
      var self = this;
      var items = [];
      if (!this.done.work) items.push({ label: '「最近忙不忙？」', sub: '工作', value: 'work' });
      if (!this.done.body) items.push({ label: '「你血压最近怎么样？」', sub: '身体', value: 'body' });
      if (!items.length) { this.call(); return; }

      SB.UI.menu(this, {
        title: '说点什么',
        items: items,
        width: 260,
        y: 88,
        cancelable: false,
        onPick: function (it) {
          if (it.value === 'work') self.work();
          else self.body();
        }
      });
    },

    work: function () {
      var self = this;
      this.done.work = true;
      this.timeLabel.setText('21:40');
      SB.UI.dialog(this, SB.HL.table.workIntro, {
        onDone: function () {
          SB.UI.menu(self, {
            title: '工作',
            items: [
              { label: '「就是老加班。」', value: 'honest' },
              { label: '「还行，不怎么忙。」', value: 'surface' },
              { label: '看一眼手机', value: 'phone' }
            ],
            width: 248,
            y: 92,
            cancelable: false,
            onPick: function (it) {
              if (it.value === 'phone') {
                SB.HomeSave.d.phone++;
                SB.HomeSave.save();
                SB.UI.dialog(self, ['你低头看了一眼。工作群又亮了。', '「你先忙。」她说。'], {
                  onDone: function () { self.topics(); }
                });
                return;
              }
              var lines = it.value === 'honest' ? SB.HL.table.workHonest : SB.HL.table.workSurface;
              SB.UI.dialog(self, lines, {
                onDone: function () {
                  if (it.value !== 'honest') { self.topics(); return; }
                  SB.UI.menu(self, {
                    title: '再说一句',
                    items: [
                      { label: '「你年轻的时候，也加班吗？」', value: 'ask' },
                      { label: '「说了你也不懂。」', value: 'no' },
                      { label: '不说了，吃饭', value: 'back' }
                    ],
                    width: 280,
                    y: 88,
                    cancelable: false,
                    onPick: function (it2) {
                      if (it2.value === 'ask') {
                        SB.HomeSave.d.listen++;
                        SB.HomeSave.save();
                        SB.UI.dialog(self, SB.HL.table.workAsk, {
                          onDone: function () { self.topics(); }
                        });
                        return;
                      }
                      if (it2.value === 'no') {
                        SB.UI.dialog(self, SB.HL.table.workNo, {
                          onDone: function () { self.topics(); }
                        });
                        return;
                      }
                      self.topics();
                    }
                  });
                }
              });
            }
          });
        }
      });
    },

    body: function () {
      var self = this;
      this.done.body = true;
      this.timeLabel.setText('21:55');
      SB.UI.dialog(this, SB.HL.table.bodyIntro, {
        onDone: function () {
          SB.UI.menu(self, {
            title: '身体',
            items: [
              { label: '「你血压最近怎么样？」', value: 'ask' },
              { label: '「药按时吃了吗？」', value: 'med' },
              { label: '装作没看见', value: 'ignore' }
            ],
            width: 270,
            y: 92,
            cancelable: false,
            onPick: function (it) {
              if (it.value === 'ignore') {
                SB.UI.dialog(self, SB.HL.table.bodyIgnore, {
                  onDone: function () { self.topics(); }
                });
                return;
              }
              if (it.value === 'med') {
                SB.UI.dialog(self, SB.HL.table.bodyMedicine, {
                  onDone: function () { self.topics(); }
                });
                return;
              }
              SB.HomeSave.d.listen++;
              SB.HomeSave.save();
              SB.UI.dialog(self, SB.HL.table.bodyAsk, {
                onDone: function () {
                  SB.UI.menu(self, {
                    title: '明天',
                    items: [
                      { label: '「明天我陪你去医院查一下。」', value: 'clinic' },
                      { label: '「你自己注意点。」', value: 'care' },
                      { label: '不说了', value: 'back' }
                    ],
                    width: 280,
                    y: 90,
                    cancelable: false,
                    onPick: function (it2) {
                      if (it2.value === 'clinic') {
                        SB.HomeSave.d.listen++;
                        SB.HomeSave.save();
                        SB.UI.dialog(self, SB.HL.table.bodyClinic, { onDone: function () { self.topics(); } });
                        return;
                      }
                      if (it2.value === 'care') {
                        SB.UI.dialog(self, SB.HL.table.bodyCare, { onDone: function () { self.topics(); } });
                        return;
                      }
                      self.topics();
                    }
                  });
                }
              });
            }
          });
        }
      });
    },

    call: function () {
      var self = this;
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
                SB.UI.dialog(self, SB.HL.table.callAnswer, { onDone: function () { self.stay(); } });
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
    }
  });

})(window.SB);
