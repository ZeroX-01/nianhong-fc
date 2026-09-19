/* 客厅。整个游戏的家。
 *
 * 这一屏里同时进行着三件事：
 *   1. 你在摆弄那台电视和主机（插卡、开机、花屏、拍两下）；
 *   2. 屋里所有东西都能碰一下，它们各自记着一点 2004 年的细节；
 *   3. 妈妈在你看不见的地方往家里走。
 *
 * 还有一件事一直摆在明面上但很容易被忘掉：电视柜上那台不是你的。
 * 它是你爸单位同事寄放的，开学前得原样还回去 —— 主机菜单、挂历、
 * 心愿单这三处会反复提醒你这件事，因为整个夏天要攒的钱就是为了它。
 *
 * 交互方式故意做成两套并行：鼠标/手指可以直接点物件，方向键也能在物件之间跳，
 * 因为当年你就是一边盯着屏幕一边用手摸的。 */
(function (SB) {
  'use strict';

  SB.RoomScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function RoomScene() { Phaser.Scene.call(this, { key: 'Room' }); },

    init: function (data) {
      this.from = (data && data.from) || 'title';
      this.introFlag = !!(data && data.intro);
      this.bustedResult = (data && data.result) || null;
      this.rescueGrade = (data && data.grade) || null;   // 从「抢救那几秒」回来时的收场评级
      this.spots = [];
      this.cur = 0;
      /* 一次「修卡回合」的临时计数：哈了几口、划了几下、拍了几巴掌。
       * 过犹不及的判定全靠它，所以每次成功开机后要清空。 */
      this.session = {};
      this.busy = false;       // 有对话框/菜单时锁住交互
      this.momSprite = null;
    },

    preload: function () {
      /* 收钱特写那四张图只有这一屏会用到，跟修卡台的做法一样：
       * 场景自己拉，不占开机时那条加载进度条。 */
      if (SB.PayAnim && SB.PayAnim.preload) SB.PayAnim.preload(this);
    },

    create: function () {
      var self = this, s = SB.Save.d;

      this.drawRoom();
      this.buildScreen();
      this.buildSpots();

      this.hud = SB.UI.hud(this);
      this.hint = SB.UI.hint(this, '');
      this.focus = SB.UI.focus(this, { dim: 0.3, label: true });
      this.momBar = this.buildMomBar();

      /* 客厅是这游戏的家，没有「上一屏」可退；右上角这颗常驻按钮给的是
       * 原来只能用 SELECT（Shift）摸出来的系统菜单——回忆册、设置、回标题都在里面。 */
      this.menuBtn = SB.UI.corner(this, '菜单', function () { if (!self.busy) self.openSysMenu(); });

      /* 触屏：客厅里不需要虚拟手柄，直接点物件更自然，只给一个「看一圈」的换焦点键 */
      this.bindInput();

      SB.Audio.bgm(s.tvOn ? 'bgm_room' : 'bgm_room');
      SB.Audio.loop('cicada', SB.Save.d.slot >= 3 ? 0.34 : 0.5);
      if (s.owned.fan) SB.Audio.loop('fan_hum', 0.25);

      this.onWarn = function (lv) { self.onMomWarn(lv); };
      this.onArrive = function (res) { self.onMomArrive(res); };
      SB.Parent.ev.on('warn', this.onWarn);
      SB.Parent.ev.on('arrive', this.onArrive);

      this.events.once('shutdown', function () { self.cleanup(); });
      SB.UI.fadeIn(this, 300);

      this.time.delayedCall(60, function () { self.afterEnter(); });
    },

    /* ---------------------------------------------------------------- 进场分流 */
    afterEnter: function () {
      var self = this, s = SB.Save.d;

      if (this.introFlag) {
        s.seenIntro = true; SB.Save.save();
        /* 开场之后紧跟着交代「这台机器是借的」——北极星目标必须在
         * 第一次进客厅时就说清楚，不能等玩家自己去点主机才发现。 */
        SB.UI.interlude(this, SB.L.intro, function () {
          self.say(SB.L.story.lent, function () {
            SB.Story.markTold();
            self.dailyCheck();
          });
        });
        return;
      }
      /* 老档（1.0 存的那些）没见过上面那段。不能倒回去补一整段开场，
       * 就用一句话把设定塞进来，说完置 told，只出现一次。 */
      if (SB.Story.needLateNote()) {
        this.say(SB.L.story.lentLate, function () {
          SB.Story.markTold();
          self.afterEnter2();
        });
        return;
      }
      this.afterEnter2();
    },

    afterEnter2: function () {
      if (this.from === 'busted') { this.playBusted(this.bustedResult); return; }
      if (this.from === 'panic') {
        SB.UI.toast(this, '你把电视关了。屏幕上还留着一小团余光。', 1800);
        this.refresh();
        return;
      }
      /* 刚在电视机前手忙脚乱地收拾完。门还没开，但脚步声就在门外。 */
      if (this.from === 'rescue') {
        var L = SB.L.rescue;
        var t = this.rescueGrade === 'clean' ? L.clean : (SB.Save.d.hidden ? L.close : L.bare);
        SB.UI.toast(this, SB.line(t), 2400);
        this.refresh();
        return;
      }
      if (this.from === 'fault') {
        this.say(SB.L.repair.stillBad.concat(['画面还是花的。得把卡带拿出来再弄一次。']));
        return;
      }
      if (this.from === 'title') { this.dailyCheck(); return; }
      this.refresh();
      this.settleOwed();
    },

    /* 每天第一次进客厅：抽一个日常事件 */
    dailyCheck: function () {
      var self = this, s = SB.Save.d;
      if (s.flags.dayRolled === s.day) { this.settleOwed(); return; }
      s.flags.dayRolled = s.day;
      var ev = SB.Time.rollEvent();
      SB.Save.save();
      if (!ev) { this.refresh(); this.armMom(); this.settleOwed(); return; }

      /* 有进账的事件不再只弹一行「（￥1.2）」：那笔钱是有人递给你的，
       * 谁递的、说了什么，走收钱特写。查不到付款方的（沙发缝里摸到钱）
       * 照旧只出文字 —— 那笔本来就没人给。
       * 注意 rollEvent() 已经把钱加进账本了，所以这里只放演出，不能再 earn。 */
      var gain = ev.money ? (ev.__gain || 0) : 0;
      var payer = gain > 0 && SB.Chore ? SB.Chore.payerOf(ev.id) : null;
      var txt = ev.text;
      if (ev.money && !payer) txt += '\n（' + SB.money(gain) + '）';

      this.say([txt], function () {
        self.refresh();
        self.armMom();
        if (!payer || !SB.PayAnim) { self.settleOwed(); return; }
        self.busy = true;
        SB.PayAnim.play(self, {
          payer: payer.id, src: ev.id, amount: gain,
          onDone: function (v) {
            self.busy = false;
            if (!self.alive()) return;
            self.refresh();
            self.cheer(v, ev.id);
            self.settleOwed();
          }
        });
      });
    },

    /* 妈不在家的时候干的活，钱挂着。她一回来就该给了 ——
     * 这是唯一一个把挂账兑出去的地方，所以每次进客厅都要问一次。 */
    settleOwed: function () {
      var self = this;
      this.refresh();
      if (!SB.Chore || SB.Chore.owed() <= 0) return;
      if (!SB.Time.momHome()) return;
      if (this.busy) return;
      var got = SB.Chore.takeOwed();
      if (!got) return;
      this.payAndCheer('mom', got.src, got.pay, true, got.src);
    },

    /* ---------------------------------------------------------------- 画客厅 */
    drawRoom: function () {
      var R = SB.ROOM, s = SB.Save.d;
      var night = s.slot >= 3;

      /* 背景 */
      if (this.textures.exists('bg_room')) {
        this.bg = this.add.image(0, 0, 'bg_room').setOrigin(0, 0).setDepth(SB.D.BG);
      } else {
        this.add.rectangle(0, 0, SB.W, 200, SB.C.WOOD7, 1).setOrigin(0, 0).setDepth(SB.D.BG);
        this.add.rectangle(0, 200, SB.W, 70, SB.C.WOOD4, 1).setOrigin(0, 0).setDepth(SB.D.BG);
      }

      /* 墙上的东西 */
      this.put('window', R.window, SB.D.WALL_ITEM, 84, 64);
      this.put('poster', R.poster, SB.D.WALL_ITEM, 44, 62);
      this.put('calendar', R.calendar, SB.D.WALL_ITEM, 34, 46);
      this.put('award', R.award, SB.D.WALL_ITEM, 42, 30);
      this.put('clock_wall', R.clock, SB.D.WALL_ITEM, 28, 28);
      this.doorSpr = this.put('door', R.door, SB.D.WALL_ITEM, 62, 140, 0);
      this.bulb = this.put('lightbulb', R.bulb, SB.D.WALL_ITEM, 18, 26, s.bulbOn ? 1 : 0);

      /* 家具 */
      this.put('sofa', R.sofa, SB.D.FURNITURE, 130, 68);
      this.put('tv_cabinet', R.cabinet, SB.D.FURNITURE, 244, 64);
      this.put('lace_cloth', R.lace, SB.D.FURNITURE + 1, 252, 22);
      this.put('desk_small', R.desk, SB.D.FURNITURE, 62, 46);
      this.fish = this.put('fish_tank', R.fish, SB.D.PROP, 44, 38, 0);
      this.put('thermos', R.thermos, SB.D.PROP, 22, 44);
      this.book = this.put('homework_book', R.book, SB.D.PROP, 42, 30, s.homework > 0 ? 1 : 0);

      /* 电视与主机（屏幕内容在 buildScreen 里，层级更低） */
      this.tvBody = this.put('tv_crt', { x: SB.TV.x, y: SB.TV.y }, SB.D.TV_BODY, 176, 148);
      this.put('tv_antenna', R.antenna, SB.D.WALL_ITEM, 56, 34);
      this.consoleSpr = this.put('console', R.console, SB.D.PROP, 84, 30);
      this.put('cable', R.cable1, SB.D.PROP - 1, 64, 10);
      this.put('cable', R.cable2, SB.D.PROP - 1, 64, 10);
      this.pad1 = this.put('controller_1p', R.pad1, SB.D.PROP, 48, 30);
      this.pad2Spr = this.put('controller_2p', R.pad2, SB.D.PROP, 48, 30);
      if (s.pads < 2 || s.padGone > 0) if (this.pad2Spr) this.pad2Spr.setVisible(false);
      if (s.padGone > 0 && this.pad1) this.pad1.setVisible(false);

      /* 地上的小东西 */
      this.put('shoebox', R.shoebox, SB.D.PROP, 56, 34);
      this.put('slipper', R.slipper, SB.D.PROP, 22, 12);
      if (s.goods.popsicle > 0) this.put('popsicle', R.popsicle, SB.D.PROP, 12, 24);

      /* 主角：坐在电视前的地上 */
      this.kid = this.put('kid', R.kid, SB.D.CHAR, 24, 44, s.tvOn ? 3 : 0);

      /* 插在卡槽里的卡带：露出一小截 */
      this.cartSpr = this.add.rectangle(R.consoleSlot.x + 6, R.consoleSlot.y - 5, 28, 7, SB.C.GREY6, 1)
        .setOrigin(0, 0).setDepth(SB.D.PROP + 2).setVisible(false);

      /* 光照：晚上整屋压暗，开灯以后灯泡下方亮一块 */
      this.nightLayer = this.add.rectangle(0, 0, SB.W, SB.H, 0x0a0a18, night && !s.bulbOn ? 0.42 : 0)
        .setOrigin(0, 0).setDepth(SB.D.FRONT_PROP);
      this.lampLayer = this.add.rectangle(0, 0, SB.W, SB.H, SB.C.YEL4, s.bulbOn ? 0.05 : 0)
        .setOrigin(0, 0).setDepth(SB.D.FRONT_PROP);
    },

    /* 贴一个物件：缺图就用同尺寸色块占位，保证布局不塌 */
    put: function (key, pos, depth, w, h, frame) {
      if (!pos) return null;
      var o;
      if (this.textures.exists(key)) {
        o = (frame === undefined) ? this.add.image(pos.x, pos.y, key) : this.add.sprite(pos.x, pos.y, key, frame);
      } else {
        o = this.add.rectangle(pos.x, pos.y, w || 16, h || 16, SB.C.GREY4, 0.85);
        o.setStrokeStyle(1, SB.C.GREY6, 0.9);
      }
      o.setOrigin(0, 0).setDepth(depth);
      return o;
    },

    /* ---------------------------------------------------------------- 电视屏幕 */
    buildScreen: function () {
      var sc = SB.TV.screen;
      this.crt = SB.CRT.create(this, sc, { depth: SB.D.TV_SCREEN_FX, small: true });
      this.crt.on = SB.Save.d.tvOn;
      this.crt.setContentVisible(SB.Save.d.tvOn);

      /* 电视开着又没花屏时，屏幕里放一小段「游戏在跑」的假画面 */
      this.fake = this.add.container(sc.x, sc.y).setDepth(SB.D.TV_SCREEN);
      var bg = this.add.rectangle(0, 0, sc.w, sc.h, SB.C.BLU1, 1).setOrigin(0, 0);
      this.fake.add(bg);
      this.fakeBars = [];
      for (var i = 0; i < 5; i++) {
        var r = this.add.rectangle(0, 20 + i * 16, sc.w, 6, [SB.C.GRN3, SB.C.YEL3, SB.C.RED3, SB.C.BLU4, SB.C.WHITE][i], 0.8)
          .setOrigin(0, 0);
        this.fake.add(r); this.fakeBars.push(r);
      }
      this.fakeTitle = SB.Text.add(this, 6, 6, '', 12, SB.C.YEL3);
      this.fake.add(this.fakeTitle);
      this.fake.setVisible(false);

      this.screenGlow = this.add.rectangle(sc.x - 16, sc.y - 8, sc.w + 32, sc.h + 40, SB.C.BLU5, 0)
        .setOrigin(0, 0).setDepth(SB.D.TV_BODY + 1);
    },

    /* ---------------------------------------------------------------- 妈妈进度条 */
    buildMomBar: function () {
      var d = SB.D.HUD;
      /* y 从 20 挪到 44：右上角那块地方让给常驻的「菜单」按钮 */
      var w = 96, x = SB.W - w - 8, y = 44;
      var bg = this.add.rectangle(x, y, w, 6, SB.C.INK, 0.7).setOrigin(0, 0).setDepth(d).setVisible(false);
      var fill = this.add.rectangle(x + 1, y + 1, w - 2, 4, SB.C.GRN4, 1).setOrigin(0, 0).setDepth(d + 1).setVisible(false);
      var lab = SB.Text.add(this, x, y + 8, '', 12, SB.C.GREY7).setDepth(d + 1).setVisible(false);
      return {
        update: function () {
          var on = SB.Parent.state !== 'idle';
          bg.setVisible(on); fill.setVisible(on); lab.setVisible(on);
          if (!on) return;
          var r = SB.Parent.remain();
          fill.width = Math.max(1, Math.round((w - 2) * r));
          fill.fillColor = r > 0.5 ? SB.C.GRN4 : (r > 0.2 ? SB.C.YEL3 : SB.C.RED4);
          /* 条上不写秒数，写「她在哪、大概还剩多久」——玩家听的是声音，
           * 不是读表：抽油烟机停了 / 楼下车铃响了，才是他真正的信号。 */
          var where = SB.Parent.mode === 'kitchen' ? '妈在厨房' : '妈出门了';
          lab.setText(where + '　' + (r > 0.55 ? '还早' : (r > 0.2 ? '快了' : '就到了')));
        },
        destroy: function () { bg.destroy(); fill.destroy(); lab.destroy(); }
      };
    },

    /* ---------------------------------------------------------------- 可交互物件
     * 点击框的规矩（右下角那一堆最容易出事，之前小方桌和门整整叠了 56×22）：
     *   1. 任意两个框互不重叠，且至少留 2px 缝——擦边点到的一定是玩家看见的那个；
     *   2. 谁挡在前面，重叠的那块画面就归谁：暖水瓶盖着鱼缸左边，
     *      小方桌 + 作业本盖着门的下半截，所以框按「看得见的部分」切；
     *   3. 门只留上半截（92..209）：下面 213 起是桌面和摊开的作业本，
     *      点那儿的人想开的是作业本，不是门。
     * 改完必须跑 tools/gametest/bugfix_title_room_test.js，那里会把 13 个框
     * 两两算一遍重叠和间距，任何一对犯规都会红。 */
    buildSpots: function () {
      var R = SB.ROOM, self = this;
      this.spots = [
        { id: 'tv',      x: SB.TV.x + 10, y: SB.TV.y + 10, w: 156, h: 128, name: '电视机' },
        { id: 'console', x: R.console.x, y: R.console.y - 6, w: 84, h: 36, name: '小旋风主机' },
        { id: 'shoebox', x: R.shoebox.x, y: R.shoebox.y, w: 56, h: 34, name: '装卡带的鞋盒' },
        { id: 'sofa',    x: R.sofa.x + 40, y: R.sofa.y + 24, w: 60, h: 40, name: '沙发' },
        /* 桌面 + 桌腿 + 摊在上面的作业本，向上顶到 213（作业本从 214 开始画） */
        { id: 'desk',    x: R.desk.x - 2, y: R.desk.y - 3, w: 66, h: 49, name: '小方桌' },
        /* 门：只到 209，和小方桌之间留 4px 缝 */
        { id: 'door',    x: R.door.x, y: R.door.y, w: 62, h: 118, name: '门' },
        { id: 'window',  x: R.window.x, y: R.window.y, w: 84, h: 64, name: '窗户' },
        { id: 'bulb',    x: R.bulb.x, y: R.bulb.y, w: 18, h: 26, name: '灯' },
        /* 鱼缸：左边被暖水瓶挡住的那截让出去，下边给小方桌让出去 */
        { id: 'fish',    x: R.fish.x + 18, y: R.fish.y - 4, w: 22, h: 28, name: '金鱼缸' },
        { id: 'calendar',x: R.calendar.x, y: R.calendar.y, w: 34, h: 46, name: '挂历' },
        /* 暖水瓶：站在鱼缸前面，重叠那一条归它，右边到 372，和鱼缸留 2px */
        { id: 'thermos', x: R.thermos.x - 2, y: R.thermos.y, w: 22, h: 46, name: '暖水瓶' },
        { id: 'award',   x: R.award.x, y: R.award.y, w: 42, h: 30, name: '奖状' },
        { id: 'clock',   x: R.clock.x, y: R.clock.y, w: 28, h: 28, name: '挂钟' }
      ];

      this.spots.forEach(function (sp, i) {
        var z = self.add.zone(sp.x, sp.y, sp.w, sp.h).setOrigin(0, 0)
          .setDepth(SB.D.FOCUS).setInteractive({ useHandCursor: true });
        z.on('pointerover', function () { if (!self.busy) { self.cur = i; self.refreshFocus(); } });
        z.on('pointerdown', function () { if (!self.busy) { self.cur = i; self.refreshFocus(); self.act(sp.id); } });
        sp.zone = z;
      });
    },

    bindInput: function () {
      var self = this;
      this.input.keyboard.on('keydown-TAB', function (e) { e.preventDefault && e.preventDefault(); self.move(1); });
      this.input.keyboard.on('keydown-R', function () { if (!self.busy) self.act('reset'); });
    },

    move: function (d) {
      if (this.busy) return;
      this.cur = (this.cur + d + this.spots.length) % this.spots.length;
      SB.Audio.sfx('ui_move');
      this.refreshFocus();
    },

    refreshFocus: function () {
      var sp = this.spots[this.cur];
      if (!sp) return;
      /* 选中态要一眼看得出来：框外压暗、框内提亮、白色卡角、外加一块写着
       * 物件名的底衬。鼠标划过、TAB 换目标、底部提示走的都是这一条路，
       * 三者永远说的是同一件事。 */
      this.focus.at(sp.x, sp.y, sp.w, sp.h, sp.name);
      this.hint.set(function () {
        return sp.name + '　' + SB.Input.tip([['a', '看看/使用'], '或点一下', ['dir', '换目标']]);
      });
    },

    /* ---------------------------------------------------------------- 交互 */
    act: function (id) {
      if (this.busy) return;
      var s = SB.Save.d;
      switch (id) {
        case 'tv': this.tvMenu(); break;
        case 'console': this.consoleMenu(); break;
        case 'shoebox': SB.UI.go(this, 'Shelf', { from: 'Room' }); break;
        case 'sofa': this.sofaMenu(); break;
        case 'desk': this.deskMenu(); break;
        case 'door': this.doorMenu(); break;
        case 'reset': this.consoleReset(); break;
        case 'bulb':
          s.bulbOn = !s.bulbOn; SB.Save.save();
          SB.Audio.sfx('ui_confirm');
          if (this.bulb && this.bulb.setFrame) this.bulb.setFrame(s.bulbOn ? 1 : 0);
          this.nightLayer.setAlpha(s.slot >= 3 && !s.bulbOn ? 0.42 : 0);
          this.lampLayer.setAlpha(s.bulbOn ? 0.05 : 0);
          this.say(s.bulbOn ? ['灯泡亮了。屋里一下变黄了。'] : ['灯关了。只剩电视那点光。']);
          break;
        default: this.flavor(id); break;
      }
    },

    /* 那些不影响玩法、但撑起 2004 年的东西 */
    flavor: function (id) {
      var s = SB.Save.d, L = SB.L.room;
      var map = {
        window: L.window, fish: L.fish, calendar: L.calendar, thermos: L.thermos,
        award: L.award, clock: L.clock
      };
      var lines = map[id] || ['……'];
      if (id === 'fish') SB.Audio.sfx('fish_bubble');
      if (id === 'calendar') {
        var left = SB.Time.summerDayCount - s.day;
        lines = lines.concat(['暑假还剩 ' + Math.max(0, left) + ' 天。']);
        /* 挂历是这个夏天的进度条：章节写在这里，还机的日子也写在这里 */
        lines = lines.concat([SB.Story.chapterLine()]);
        if (SB.Story.lent() && !SB.Story.ownConsole()) {
          lines = lines.concat([SB.line(SB.L.story.lentReturn).replace('%d', SB.Story.dueLeft())]);
        }
      }
      this.say(lines);
    },

    /* ---------------- 电视 ---------------- */
    tvMenu: function () {
      var self = this, s = SB.Save.d;
      var items = [];
      if (!s.tvOn) items.push({ label: '开电视', value: 'on' });
      else {
        items.push({ label: '关电视', value: 'off' });
        if (s.fault) {
          items.push({ label: '在电视侧面拍一巴掌', sub: '碰运气', value: 'slap' });
          items.push({ label: '把卡带拿出来弄一下', sub: '推荐', value: 'fix' });
        } else if (s.inserted) {
          items.push({ label: '坐下来玩', value: 'play' });
        }
      }
      items.push({ label: '算了', value: 'x' });

      this.openMenu({ title: '电视机', items: items }, function (v) {
        if (v === 'on') self.tvOn();
        else if (v === 'off') self.tvOff();
        else if (v === 'slap') self.slapTv();
        else if (v === 'fix') SB.UI.go(self, 'Repair', { cartId: s.inserted });
        else if (v === 'play') self.enterGame();
      });
    },

    tvOn: function () {
      var self = this, s = SB.Save.d;
      if (s.flags.blocked) { this.say(['今天不行——插头都被拔了。']); return; }
      if (!s.inserted) {
        this.say(['电视开了，屏幕上是一片雪花。卡槽里什么都没插。'], function () { self.setTv(true, null); });
        return;
      }
      if (s.padGone > 0) { this.say(['手柄被没收了。电视开着也没用。']); return; }

      SB.Audio.sfx('console_power');
      var res = SB.Repair.attempt(s.inserted, s.seated);
      this.setTv(true, res.fault);
      SB.Save.save();

      if (!res.fault) {
        this.session = {};
        this.say(['「叮——」画面出来了。'], function () { self.enterGame(); });
      } else {
        SB.Audio.sfx('cart_dirty_fail');
        this.say([this.faultText(res.fault)], function () {
          self.hint.set('画面不对：去主机上把卡带拿出来，哈口气、划两下再插回去');
        });
      }
      this.armMom();
    },

    tvOff: function () {
      var s = SB.Save.d;
      SB.Parent.actions.tvOff();
      this.setTv(false, null);
      SB.Audio.stopBgm();
      SB.Audio.bgm('bgm_room');
      this.say(['电视关了。屏幕中间缩成一条白线，然后没了。']);
    },

    setTv: function (on, fault) {
      var s = SB.Save.d;
      s.tvOn = on; s.fault = fault || null; SB.Save.save();
      var self = this;
      if (on) {
        this.crt.on = true;
        this.crt.setContentVisible(true);
        this.crt.powerOn(function () { self.applyScreen(); });
      } else {
        this.crt.setFault(null);
        this.crt.powerOff(function () { self.applyScreen(); });
      }
      if (this.kid && this.kid.setFrame) this.kid.setFrame(on ? 3 : 0);
      this.applyScreen();
    },

    applyScreen: function () {
      var s = SB.Save.d;
      this.crt.setFault(s.tvOn ? s.fault : null);
      var showFake = s.tvOn && !s.fault && !!s.inserted;
      this.fake.setVisible(showFake);
      if (showFake) {
        var c = SB.CART_BY_ID[s.inserted];
        this.fakeTitle.setText(c ? c.name : '');
      }
      this.screenGlow.setAlpha(s.tvOn ? 0.1 : 0);
      if (!s.tvOn) this.crt.setContentVisible(false);
    },

    slapTv: function () {
      var self = this, s = SB.Save.d;
      var r = SB.Repair.slap(this.session);
      this.cameras.main.shake(180, 0.006);
      SB.Audio.sfx('cart_tap');
      /* 抖动横条就该拍一巴掌；别的毛病拍了也白拍 */
      var fixed = r.ok && SB.Repair.isRightFix(s.fault, 'slap') && SB.chance(0.75);
      if (fixed) { s.fault = null; SB.Save.save(); this.session = {}; }
      this.applyScreen();
      this.say([r.msg + (fixed ? '　画面稳住了。' : '')], function () {
        if (!SB.Save.d.fault && SB.Save.d.tvOn) self.time.delayedCall(320, function () { self.enterGame(); });
      });
    },

    /* 故障现象 + 一句「该怎么办」的暗示。
     * 提示不写成教程，而是当年大人小孩都会说的那句话。 */
    faultText: function (fault) {
      var f = SB.FAULT[fault];
      if (!f) return '画面不太对。';
      return f.hint;
    },

    /* ---------------- 主机 ---------------- */
    consoleMenu: function () {
      var self = this, s = SB.Save.d;
      var items = [];
      /* 第一行不是操作，是提醒：这台是借的，还有几天就得搬走。
       * 玩家每次插卡都要经过这里，目标就不会被玩忘了。 */
      if (SB.Story.lent()) {
        items.push({
          label: SB.Story.ownConsole() ? '柜子上这台是借的' : '这台是借的，开学前还',
          sub: '还 ' + SB.Story.dueLeft() + ' 天',
          disabled: true
        });
      }
      if (s.inserted) {
        items.push({ label: '把卡带拔出来', value: 'out' });
        items.push({ label: '拔出来再插到底', sub: '「咔哒」', value: 'reseat' });
        items.push({ label: '拿到手里弄一下', sub: '哈气 / 划桌', value: 'fix' });
        items.push({ label: '按一下 RESET', value: 'reset' });
      } else {
        items.push({ label: '插一张卡带', value: 'in' });
      }
      items.push({ label: '对着卡槽吹一口气', sub: '灰 ' + Math.round(s.slotDirt), value: 'puff' });
      items.push({ label: '翻过来看底下那块胶布', value: 'tape' });
      items.push({ label: '算了', value: 'x' });

      this.openMenu({ title: '小旋风主机', items: items }, function (v) {
        if (v === 'in') SB.UI.go(self, 'Shelf', { from: 'Room', pick: true });
        else if (v === 'out') self.pullCart();
        else if (v === 'reseat') self.reseat();
        else if (v === 'fix') SB.UI.go(self, 'Repair', { cartId: s.inserted });
        else if (v === 'reset') self.consoleReset();
        else if (v === 'puff') self.puffSlot();
        else if (v === 'tape') self.say(SB.L.story.lent);
      });
    },

    pullCart: function () {
      var s = SB.Save.d;
      var id = s.inserted;
      SB.Parent.actions.pullCart();
      this.refresh();
      this.say(['卡带拔出来了，金手指上有一层灰。']);
    },

    reseat: function () {
      var self = this, s = SB.Save.d;
      if (!s.inserted) return;
      var r = SB.Repair.reseat(s.inserted, this.session);
      SB.Audio.sfx('cart_insert');
      s.seated = true;
      /* 没插到底的雪花，插一次就好了；其他毛病插拔只是碰运气 */
      var fixed = SB.Repair.isRightFix(s.fault, 'reseat') || (s.fault && SB.chance(0.25));
      if (fixed) { s.fault = null; this.session = {}; }
      SB.Save.save();
      this.applyScreen();
      this.say([r.msg + (fixed ? '　画面出来了。' : '')], function () {
        if (SB.Save.d.tvOn && !SB.Save.d.fault) self.time.delayedCall(300, function () { self.enterGame(); });
      });
    },

    puffSlot: function () {
      var self = this, s = SB.Save.d;
      var r = SB.Repair.puff(this.session);
      SB.Audio.sfx('cart_blow');
      var fixed = SB.Repair.isRightFix(s.fault, 'puff') && SB.chance(0.8);
      if (fixed) { s.fault = null; this.session = {}; }
      SB.Save.save();
      this.applyScreen();
      this.say([r.msg + (fixed ? '　彩虹纹没了。' : '')], function () {
        if (SB.Save.d.tvOn && !SB.Save.d.fault) self.time.delayedCall(300, function () { self.enterGame(); });
      });
    },

    consoleReset: function () {
      var self = this, s = SB.Save.d;
      if (!s.tvOn || !s.inserted) { this.say(['电视没开，按 RESET 没有任何反应。']); return; }
      SB.Audio.sfx('console_reset');
      var res = SB.Repair.attempt(s.inserted, s.seated);
      s.fault = res.fault; SB.Save.save();
      this.applyScreen();
      if (!res.fault) this.say(['「叮——」这次出来了。'], function () { self.enterGame(); });
      else this.say([this.faultText(res.fault)]);
    },

    /* ---------------- 沙发 / 小方桌 / 门 ---------------- */
    sofaMenu: function () {
      var self = this, s = SB.Save.d;
      var items = [];
      if (s.hidden) items.push({ label: '把沙发缝里的卡带摸出来', value: 'take' });
      else if (s.inserted) items.push({ label: '把卡带藏进沙发缝', sub: '被抓时能救命', value: 'hide' });
      items.push({ label: '坐一会儿', value: 'sit' });
      items.push({ label: '算了', value: 'x' });

      this.openMenu({ title: '沙发', items: items }, function (v) {
        if (v === 'hide') {
          SB.Parent.actions.hideCart();
          self.refresh();
          self.say(['你把卡带塞进沙发靠背的缝里，又往里按了按。']);
        } else if (v === 'take') {
          var id = s.hidden; s.hidden = null; SB.Save.save();
          self.refresh();
          self.say(['从沙发缝里摸出那张卡带。上面沾了一点瓜子壳。']);
        } else if (v === 'sit') {
          self.say(SB.L.room.sofa);
        }
      });
    },

    deskMenu: function () {
      var self = this, s = SB.Save.d;
      /* 她回来了，而你手里还挂着一笔。先把钱结了再说别的 ——
       * 走到桌边看见她在屋里，这是最自然的一个结算时机。 */
      if (SB.Chore && SB.Chore.owed() > 0 && SB.Time.momHome() && !this.busy) {
        this.settleOwed();
        return;
      }
      var n = SB.Chore ? SB.Chore.availCount() : 0;
      var items = [
        { label: '写作业', sub: s.homework > 0 ? '已写 ' + s.homework + '%' : '一点没写', value: 'hw' },
        /* 挣钱的入口必须摆在明面上，而且要告诉他「现在有几样能干」——
         * 否则玩家点进去看到四行灰的，会以为这功能坏了。 */
        { label: '帮家里干活', sub: n > 0 ? '这会儿有 ' + n + ' 样能干' : '这会儿没活', value: 'chore' },
        { label: '把作业本摊开在桌上', sub: s.flags.bookOpen ? '已经摊着了' : '只能少问两句', value: 'open' },
        { label: '算了', value: 'x' }
      ];
      this.openMenu({ title: '小方桌', items: items }, function (v) {
        if (v === 'hw') SB.UI.go(self, 'Homework', { from: 'Room' });
        else if (v === 'chore') self.choreMenu();
        else if (v === 'open') {
          var did = SB.Parent.actions.openBook();
          if (self.book && self.book.setFrame) self.book.setFrame(1);
          /* 作业本的作用必须说清楚：它只减轻惩罚，救不了「电视还开着」。
           * 玩家以为摊开本子就安全，是这一局最贵的误解。 */
          if (did) self.say(SB.L.story.book);
          else self.say(['本子已经摊在那儿了。铅笔还横在上面。']);
        }
      });
    },

    /* ---------------------------------------------------------------- 干活挣钱
     * 干不了的活不藏起来，一律列出来灰掉，原因写在 sub 上，点它会告诉你
     * 为什么现在不行。玩家得先知道「垃圾要等傍晚」，才会为了那一毛钱
     * 专门留一格精力到傍晚 —— 这才是这套规矩存在的意义。 */
    choreMenu: function () {
      var self = this;
      var items = SB.Chore.items();
      /* 头一行是「她在不在家」。家里的活是妈给钱的，她不在就只能挂账，
       * 这件事必须在他按下去之前就看见。 */
      items.unshift({
        label: SB.Time.momHome() ? '妈在屋里' : '妈不在家',
        sub: SB.Time.momHome() ? '干完当场给钱' : '干完先记着，等她回来',
        disabled: true
      });
      items.push({ label: '不干了', value: 'x' });
      this.openMenu({ title: '帮家里干活', items: items }, function (v) { self.doChore(v); });
    },

    doChore: function (id) {
      var self = this;
      var c = SB.Chore.byId(id);
      if (!c) return;
      var r = SB.Chore.check(id);
      if (!r.ok) { SB.Audio.sfx('ui_error', { volume: 0.4 }); this.say([r.why]); return; }

      var res = SB.Chore.doChore(id);
      if (!res.ok) { SB.Audio.sfx('ui_error', { volume: 0.4 }); this.say([res.why]); return; }

      this.refresh();
      var open = SB.L.chore && SB.L.chore[id] ? SB.L.chore[id] : ['你把这活干完了。'];
      this.say(open, function () {
        if (res.paid) { self.payAndCheer(res.payer, res.src, res.pay, false, id); return; }
        /* 她不在家。活干了，钱记着 —— 这句话必须说清楚，
         * 不然玩家会以为白干了一格精力。 */
        self.refresh();
        self.say([
          '屋里没人。你把活干完了，钱先记着 —— 等她回来。',
          '（记着 ' + SB.money(SB.Chore.owed()) + '）'
        ], function () { self.refresh(); });
      });
    },

    /* 这一屏还在台上吗。收钱特写是异步的：它的 onDone 可能在客厅已经被
     * 换掉之后才回来（睡觉、进集市、被强行 stop）。那时候 hud / 小孩 / 飘字
     * 全都销毁了，再去 refresh 就是往 null 上写字。 */
    alive: function () {
      return !!(this.scene && this.scene.isActive() && this.hud);
    },

    /* 收钱特写 → 记账 → 小孩自己高兴那一下。
     * 记账放在特写的 onDone 里：钱到账和「看见钱到账」必须是同一件事。 */
    payAndCheer: function (payerId, src, amount, owed, choreId) {
      var self = this;
      this.busy = true;
      if (!SB.PayAnim || !payerId || !(amount > 0)) {
        /* 没有付款方（沙发缝里摸到的钱）或者这一屏没装起来：直接进账，
         * 一分不能少 —— 表现层可以缺，账不能缺。 */
        if (amount > 0) SB.Story.earn(amount, src);
        this.busy = false;
        this.refresh();
        this.cheer(amount, choreId || src);
        return;
      }
      SB.PayAnim.play(this, {
        payer: payerId, src: src, amount: amount, owed: !!owed,
        onDone: function (v) {
          /* 记账永远要做 —— 哪怕画面已经没了。 */
          SB.Story.earn(v, src);
          self.busy = false;
          /* 但刷 HUD、飘字、跳两下都要有画面才行。客厅被换掉之后
           * 这些控件已经销毁，再 setText 就是往 null 上写字。 */
          if (!self.alive()) return;
          self.refresh();
          self.cheer(v, choreId || src);
        }
      });
    },

    /* 小孩自己那一下高兴。不新画帧 —— 原地跳两下、飘一行字、响一声。
     * 这是「钱到手」这件事在场景里的回声，跟特写屏里的数钱是两回事。 */
    cheer: function (amount, srcKey) {
      var self = this, s = SB.Save.d;
      var L = SB.L.cheer || {};
      var word = L[srcKey] || L.any || '兜里多了几毛钱。';
      var calm = false;
      try { calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
      catch (e) { calm = false; }

      /* 飘字：从小孩头顶往上飘一小截，淡出 */
      var kx = (SB.ROOM.kid ? SB.ROOM.kid.x : 120) + 12;
      var ky = (SB.ROOM.kid ? SB.ROOM.kid.y : 200) - 10;
      var t = SB.Text.add(this, kx, ky, '+' + SB.money(amount), 12, SB.C.YEL4)
        .setOrigin(0.5, 1).setDepth(SB.D.FADE - 1);
      if (calm) {
        this.time.delayedCall(1200, function () { if (t) t.destroy(); });
      } else {
        this.tweens.add({
          targets: t, y: ky - 16, alpha: 0, duration: 1100, ease: 'Quad.easeOut',
          onComplete: function () { t.destroy(); }
        });
      }

      /* 跳两下。只动 y，不换帧 —— 这一版没给小孩画高兴的样子，
       * 硬换帧会露出「他在原地抽搐」的马脚。 */
      if (this.kid && !calm) {
        var y0 = this.kid.y;
        this.tweens.add({
          targets: this.kid, y: y0 - 4, duration: 130, ease: 'Quad.easeOut',
          yoyo: true, repeat: 1,
          onComplete: function () { if (self.kid) self.kid.y = y0; }
        });
      }
      SB.Audio.sfx('ui_confirm', { volume: 0.45 });
      SB.UI.toast(this, word + '（兜里 ' + SB.money(s.money) + '）', 2200);
    },

    doorMenu: function () {
      var self = this, s = SB.Save.d;
      var items = [
        { label: '去集市', sub: '看看有没有新卡带', value: 'market' },
        { label: '去发小家', sub: '他有两个手柄', value: 'friend' },
        { label: '不出去', value: 'x' }
      ];
      if (s.slot >= 4) items.unshift({ label: '睡觉', sub: '结束这一天', value: 'sleep' });
      else items.push({ label: '睡觉', sub: '结束这一天', value: 'sleep' });

      this.openMenu({ title: '门口', items: items }, function (v) {
        if (v === 'market') {
          if (s.tvOn) { self.say(['电视还开着。出门前先关掉——不然回来就完了。']); return; }
          SB.UI.go(self, 'Market', { from: 'Room' });
        } else if (v === 'friend') {
          if (s.tvOn) { self.say(['电视还开着。出门前先关掉。']); return; }
          SB.UI.go(self, 'Friend', { from: 'Room' });
        } else if (v === 'sleep') {
          self.sleep();
        }
      });
    },

    sleep: function () {
      var self = this;
      var s = SB.Save.d;
      SB.Parent.disarm();
      s.tvOn = false; s.fault = null;
      SB.Save.save();
      SB.Audio.stopBgm();
      var last = SB.Time.isLastDay();
      /* 最后一晚讲的是「那台机器还了没有」，所以正文由剧情层给：
       * 买到自己那台的人，看到的是别人那台被搬走。 */
      var body = last ? SB.Story.endingBody() : [SB.line(SB.L.ui.sleep)];
      SB.UI.interlude(this, body, function () {
        if (last) { self.scene.start('Album', { from: 'Room', ending: true }); return; }
        SB.Time.sleep();
        self.scene.start('Room', { from: 'wake' });
      });
    },

    /* ---------------- 进入小游戏 ---------------- */
    enterGame: function () {
      var s = SB.Save.d;
      if (!s.inserted || s.fault || !s.tvOn) return;
      var cs = s.carts[s.inserted];
      if (cs && cs.dead) { this.say(SB.L.repair.dead); return; }
      SB.UI.go(this, 'Play', { cartId: s.inserted });
    },

    /* ---------------------------------------------------------------- 妈妈 */
    armMom: function () {
      if (SB.Save.d.__nomom) return;
      if (SB.Parent.state === 'idle' && SB.Save.d.tvOn) {
        SB.Parent.arm(SB.Time.momHome() ? 'kitchen' : 'out');
        /* 上弦的同时给一句线索：她现在在哪、什么动静意味着她要来了。
         * 「妈妈随机出现」和「妈妈有迹可循」差的就是这一句。 */
        var L = SB.L.story.momClue;
        SB.UI.toast(this, SB.line(SB.Parent.mode === 'kitchen' ? L.kitchen : L.out), 2600);
      }
    },

    onMomWarn: function (lv) {
      var L = SB.L.mom['warn' + lv] || [];
      SB.UI.toast(this, SB.line(L), 2200);
      if (lv === 1 && this.kid && this.kid.setFrame) this.kid.setFrame(4);
      if (lv >= 2) {
        SB.Audio.bgm('bgm_tense');
        this.cameras.main.shake(140, 0.003);
      }
      this.hint.set('快：关电视 → 拔卡带 → 藏进沙发缝 → 摊开作业本');
      this.hint.setTint(SB.C.RED5);
    },

    onMomArrive: function (res) {
      this.playBusted(res);
    },

    /* 门开了 */
    playBusted: function (res) {
      var self = this;
      this.busy = true;
      res = res || SB.Parent.lastResult || { level: 'safe', lines: ['……'] };

      /* 门已经开了，计时器立刻归位重新上弦 —— 不能等玩家把对话点完：
       * 状态一直卡在 arrive 的话，PlayScene 只在 idle 时上弦，
       * 这一整段时间她就再也不会来，第一次被抓之后紧张感直接消失。
       * 她现在人在屋里，所以下一轮时间明显更紧。 */
      SB.Parent.disarm();
      SB.Save.d.__momHome = true;
      SB.Save.save();

      SB.Audio.stopBgm();
      SB.Audio.stopAllLoops();
      SB.Audio.sfx('door_open');
      if (this.doorSpr && this.doorSpr.setFrame) this.doorSpr.setFrame(2);

      /* 妈妈从门口走进来 */
      var R = SB.ROOM;
      if (this.textures.exists('mom')) {
        this.momSprite = this.add.sprite(R.door.x + 4, R.door.y + 84, 'mom', 0).setOrigin(0, 0).setDepth(SB.D.CHAR + 2);
      } else {
        this.momSprite = this.add.rectangle(R.door.x + 4, R.door.y + 84, 28, 54, SB.C.RED2, 1).setOrigin(0, 0).setDepth(SB.D.CHAR + 2);
      }
      var mom = this.momSprite;
      this.tweens.add({ targets: mom, x: 330, duration: 900, ease: 'Linear' });

      if (res.level > 0) { SB.Audio.sfx('caught_sting'); this.cameras.main.shake(400, 0.008); }
      else SB.Audio.sfx('hide_success');

      this.time.delayedCall(1000, function () {
        self.say(res.lines || ['……'], function () {
          self.busy = false;
          self.refresh();
          /* 妈妈进屋以后就在厨房了，接下来还能玩，但时间更紧 */
          if (self.momSprite) {
            self.tweens.add({
              targets: self.momSprite, alpha: 0, delay: 600, duration: 500,
              onComplete: function () { if (self.momSprite) { self.momSprite.destroy(); self.momSprite = null; } }
            });
          }
          if (self.doorSpr && self.doorSpr.setFrame) self.doorSpr.setFrame(0);
          SB.Audio.bgm('bgm_room');
        });
      });
    },

    /* ---------------------------------------------------------------- 通用 UI */
    say: function (lines, cb) {
      var self = this;
      this.busy = true;
      SB.UI.dialog(this, lines, {
        onDone: function () { self.busy = false; if (cb) cb(); }
      });
    },

    openMenu: function (opts, onPick) {
      var self = this;
      this.busy = true;
      opts.onPick = function (it) { self.busy = false; if (it.value !== 'x' && onPick) onPick(it.value); };
      opts.onCancel = function () { self.busy = false; };
      SB.UI.menu(this, opts);
    },

    refresh: function () {
      var s = SB.Save.d;
      this.hud.refresh();
      this.applyScreen();
      if (this.cartSpr) this.cartSpr.setVisible(!!s.inserted);
      if (s.inserted && this.cartSpr) {
        this.cartSpr.fillColor = SB.CART_TINT[s.inserted] || SB.C.GREY6;
      }
      if (this.book && this.book.setFrame) this.book.setFrame(s.homework > 0 || s.flags.bookOpen ? 1 : 0);
      if (this.pad2Spr) this.pad2Spr.setVisible(s.pads >= 2 && s.padGone === 0);
      if (this.pad1) this.pad1.setVisible(s.padGone === 0);
      this.hint.setTint(SB.C.GREY7);
      this.refreshFocus();
    },

    /* ---------------------------------------------------------------- 主循环 */
    update: function (time, delta) {
      var dt = Math.min(delta, 50);
      SB.Input.update();
      this.crt.update(dt);
      this.momBar.update();

      if (!SB.Save.d.__nomom) SB.Parent.update(dt);

      if (!this.busy) {
        var p = SB.Input.p1.just;
        if (p.right || p.down) this.move(1);
        if (p.left || p.up) this.move(-1);
        if (p.a) this.act(this.spots[this.cur].id);
        if (p.b) { SB.Audio.sfx('ui_cancel'); }
        if (p.select) this.openSysMenu();
      }

      /* 电视亮着的时候，屏幕里的假画面要动，屋里也跟着一亮一暗 */
      if (SB.Save.d.tvOn && this.fake.visible) {
        this.fakeT = (this.fakeT || 0) + dt;
        if (this.fakeT > 120) {
          this.fakeT = 0;
          for (var i = 0; i < this.fakeBars.length; i++) {
            this.fakeBars[i].x = (this.fakeBars[i].x + SB.rndInt(-3, 3)) % 20;
          }
        }
      }
      /* 鱼缸里的鱼 */
      this.fishT = (this.fishT || 0) + dt;
      if (this.fishT > 900 && this.fish && this.fish.setFrame) {
        this.fishT = 0;
        this.fish.setFrame(this.fish.frame.name === 0 || this.fish.frame.name === '0' ? 1 : 0);
      }
    },

    openSysMenu: function () {
      var self = this;
      /* 标题里顺手把快捷键写成玩家手上真按的那个键：
       * 键盘是 Shift，手柄/屏幕手柄上写 SELECT —— 原来死写「（SELECT）」，
       * 用键盘的人满键盘找不到这颗键。 */
      this.openMenu({
        title: '菜单（' + SB.Input.keyName('select') + '）',
        items: [
          { label: '心愿单', sub: SB.Story.ownConsole() ? '买到了' : '还差 ' + SB.money(SB.Story.goalGap()), value: 'wish' },
          { label: '回忆册', value: 'album' },
          { label: '设置', value: 'settings' },
          { label: '回标题画面', value: 'title' },
          { label: '继续', value: 'x' }
        ]
      }, function (v) {
        if (v === 'wish') self.openWish();
        else if (v === 'album') SB.UI.go(self, 'Album', { from: 'Room' });
        else if (v === 'settings') SB.UI.go(self, 'Settings', { from: 'Room' });
        else if (v === 'title') { SB.Parent.disarm(); SB.UI.go(self, 'Title', {}); }
      });
    },

    /* 心愿单 = 零花钱账本 + 那台二手主机还差多少 + 今天心情。
     * 借的是现成的菜单组件：信息行 disabled，只有最后一行能按。
     * 钱是这个夏天唯一的资源，玩家必须随时能查清它是哪来的、要用在哪。 */
    openWish: function () {
      var self = this;
      this.busy = true;
      SB.UI.menu(this, {
        title: SB.L.story.ledger.title,
        width: 288,
        /* 最多 11 行：行高压到 18，整张纸片才不会顶到上面的状态栏 */
        rowH: 18,
        items: SB.Story.wishItems(),
        onPick: function () { self.busy = false; self.sayWishHint(); },
        onCancel: function () { self.busy = false; }
      });
    },

    sayWishHint: function () {
      var L = SB.L.story.ledger, lines = [];
      if (SB.Story.ownConsole()) lines.push(L.goalDone);
      else lines.push(L.hint);
      if (SB.Story.state().ledger.legacy) lines.push(L.legacy);
      this.say(lines);
    },

    cleanup: function () {
      if (SB.Parent.ev) {
        SB.Parent.ev.off('warn', this.onWarn);
        SB.Parent.ev.off('arrive', this.onArrive);
      }
      if (this.crt) this.crt.destroy();
      if (this.hud) this.hud.destroy();
      if (this.hint) this.hint.destroy();
      if (this.focus) this.focus.destroy();
      if (this.momBar) this.momBar.destroy();
      if (this.menuBtn) this.menuBtn.destroy();
      SB.Audio.stopAllLoops();
    }
  });

})(window.SB);
