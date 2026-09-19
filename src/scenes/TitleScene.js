/* 标题画面。
 *
 * 不做炫技的开场动画。就是那个客厅，灯没开，窗外天快黑了，
 * 电视是唯一亮着的东西，外面有蝉。你站在门口，还没进去。 */
(function (SB) {
  'use strict';

  SB.TitleScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function TitleScene() { Phaser.Scene.call(this, { key: 'Title' }); },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#07070a');

      /* ---- 背景：压暗的客厅 ---- */
      if (this.textures.exists('bg_room')) {
        this.add.image(0, 0, 'bg_room').setOrigin(0, 0).setDepth(SB.D.BG)
          .setTint(0x4a4a60);
      } else {
        this.add.rectangle(0, 0, SB.W, SB.H, SB.C.GREY2, 1).setOrigin(0, 0).setDepth(SB.D.BG);
        this.add.rectangle(0, 196, SB.W, 74, SB.C.WOOD3, 1).setOrigin(0, 0).setDepth(SB.D.BG);
      }
      /* 电视：屏幕里是一片暖光，像在放没有信号的雪花 */
      var tv = SB.TV;
      this.add.rectangle(tv.screen.x, tv.screen.y, tv.screen.w, tv.screen.h, SB.C.BLU2, 1)
        .setOrigin(0, 0).setDepth(SB.D.TV_SCREEN);
      if (this.textures.exists('snow')) {
        this.snow = this.add.image(tv.screen.x, tv.screen.y, 'snow', 0).setOrigin(0, 0)
          .setDisplaySize(tv.screen.w, tv.screen.h).setDepth(SB.D.TV_SCREEN + 1).setAlpha(0.35);
      }
      if (this.textures.exists('tv_crt')) {
        this.add.image(tv.x, tv.y, 'tv_crt').setOrigin(0, 0).setDepth(SB.D.TV_BODY).setTint(0x6a6a80);
      }
      /* 电视的光洒在屋里 */
      var glow = this.add.rectangle(tv.screen.x - 30, tv.screen.y - 10, tv.screen.w + 60, tv.screen.h + 80,
        SB.C.BLU5, 0.08).setOrigin(0, 0).setDepth(SB.D.TV_BODY + 1);
      this.tweens.add({ targets: glow, alpha: 0.14, duration: 2600, yoyo: true, repeat: -1 });

      /* 整体再压一层夜色 */
      this.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 0.42).setOrigin(0, 0).setDepth(SB.D.FRONT_PROP);

      /* ---- 标题 ---- */
      if (this.textures.exists('title_logo')) {
        this.logo = this.add.image(SB.W / 2, 18, 'title_logo').setOrigin(0.5, 0).setDepth(SB.D.HUD);
      } else {
        this.logo = SB.Text.add(this, SB.W / 2, 42, '那年的红白机', 16, SB.C.RED4)
          .setOrigin(0.5, 0).setDepth(SB.D.HUD).setScale(2);
      }
      this.logo.setAlpha(0);
      this.tweens.add({ targets: this.logo, alpha: 1, duration: 900, ease: 'Quad.easeOut' });

      var sub = SB.Text.add(this, SB.W / 2, 112, '2004 年，一台不属于你的游戏机', 12, SB.C.YEL4)
        .setOrigin(0.5, 0).setDepth(SB.D.HUD).setAlpha(0);
      this.tweens.add({ targets: sub, alpha: 1, delay: 700, duration: 800 });

      /* ---- 存档摘要 ---- */
      var hasSave = SB.Save.exists();
      var d = SB.Save.d;
      if (hasSave) {
        var n = SB.Save.ownedCarts().length;
        /* 让到 236：最下面那一行留给键位提示 */
        SB.Text.add(this, SB.W / 2, 236,
          '上次：' + SB.Time.dateStr() + '　卡带 ' + n + ' 张　' + SB.money(d.money), 12, SB.C.GREY6)
          .setOrigin(0.5, 0).setDepth(SB.D.HUD);
      }

      /* 第一屏就得把「按哪个键」说清楚：这里是整局游戏里玩家第一次找确认键的地方 */
      this.hint = SB.UI.hint(this, function () {
        return SB.Input.tip([['ud', '选'], ['a', '确认']]);
      });

      /* ---- 菜单 ---- */
      var items = [];
      if (hasSave) items.push({ label: '继续那个夏天', value: 'continue' });
      items.push({ label: hasSave ? '重新过一次暑假' : '开始这个暑假', value: 'new' });
      /* 序章看过之后，重看的入口在回忆册第一条。
       * 不在这里再加一行「重看序章」：这一屏 4 行已经顶到存档摘要，
       * 再加一行会压上去，宁可用右边这两个小字把路指过去。 */
      items.push({ label: '回忆册', value: 'album', sub: d && d.flags && d.flags.prologue ? '含序章' : '' });
      items.push({ label: '设置', value: 'settings' });
      this.items = items;

      /* 兜底用的状态：菜单还没端上来之前、以及正在离开这一屏时都不许插手 */
      this.menuReady = false;
      this.leaving = false;
      this.idleFrames = 0;

      this.time.delayedCall(hasSave ? 500 : 900, function () {
        self.buildMenu(0);
        self.menuReady = true;
      });

      /* ---- 声音：蝉，以及那首有点感伤的标题曲 ---- */
      SB.Audio.loop('cicada', 0.5);
      SB.Audio.bgm('bgm_title');

      this.t = 0;
      SB.UI.fadeIn(this, 700);
      this.events.once('shutdown', function () { SB.Audio.stopLoop('cicada'); });
    },

    /* 主菜单单独抽出来：任何「从子菜单退回来」的路径都走这里重建，
     * cur 是光标要停的行号，退回去时还停在玩家刚才选的那一项上。 */
    buildMenu: function (cur) {
      var self = this;
      if (this.leaving) return null;
      if (this.menu && this.menu.isOpen && this.menu.isOpen()) return this.menu;
      this.lastCur = cur | 0;
      this.menu = SB.UI.menu(this, {
        items: this.items,
        x: Math.round(SB.W / 2 - 76), y: 136, width: 152, rowH: 20,
        dim: false, depth: SB.D.DIALOG,
        cur: cur | 0,
        /* 标题菜单不能被取消：这一屏没有「上一页」，菜单一关就成了死屏
         * （以前按 Z 就会这样，现在键盘上的 B 也认，更容易撞上） */
        cancelable: false,
        onPick: function (it, i, ctx) { self.pick(it.value, i, ctx); }
      });
      return this.menu;
    },

    pick: function (v, i, ctx) {
      var self = this;
      this.lastCur = i | 0;
      /* 退回主菜单。父菜单在选中这一项的瞬间就已经关掉了，所以子菜单的
       * 每一条「不走了」的出口都必须显式调它，否则屏幕上一个能点的都不剩。 */
      function back() {
        self.menu = (ctx && ctx.reopen) ? ctx.reopen() : self.buildMenu(i | 0);
      }
      if (v === 'continue') { this.enter(); return; }
      if (v === 'new') {
        if (!SB.Save.exists()) { this.startNew(); return; }
        /* 覆盖存档是不可逆的，问一句。「不了」和按 B 取消都要退回主菜单 */
        SB.UI.menu(this, {
          title: '要把上一个夏天忘掉吗？',
          items: [{ label: '不了', value: 'no' }, { label: '重新开始', value: 'yes' }],
          onPick: function (it) { if (it.value === 'yes') self.startNew(); else back(); },
          onCancel: back
        });
        return;
      }
      if (v === 'album') { this.leaving = true; this.scene.start('Album', { from: 'Title' }); return; }
      if (v === 'settings') { this.leaving = true; this.scene.start('Settings', { from: 'Title' }); return; }
    },

    startNew: function () {
      SB.Save.reset();
      SB.Parent.disarm();
      this.enter(true);
    },

    /* ---------------- 藏起来的那一页 ----------------
     * 当年的卡带都藏着秘技，输对了才给你看点别的东西。这一页就是这个游戏的那一处：
     * 在标题屏按 ↑↑↓↓←→←→，制作名单才出来。
     *
     * 为什么不是完整的 ↑↑↓↓←→←→BA：这一屏的菜单吃 A（会直接开始游戏），
     * 秘技的最后一下会和「确认」撞车。八个方向键菜单只是移一下光标，撞不着任何东西，
     * 停在方向序列上刚好能整段判完。 */
    CODE: ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'],

    pollCode: function () {
      if (this.staffOn || this.leaving) return;
      var j = SB.Input.p1.just;
      var keys = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
      var hit = null;
      for (var i = 0; i < keys.length; i++) if (j[keys[i]]) { hit = keys[i]; break; }
      if (!hit) return;
      this.codeAt = this.codeAt | 0;
      /* 按错就从头数，但要认「错的这一下可能正好是新序列的第一下」 */
      if (hit === this.CODE[this.codeAt]) this.codeAt++;
      else this.codeAt = (hit === this.CODE[0]) ? 1 : 0;
      if (this.codeAt >= this.CODE.length) { this.codeAt = 0; this.openStaff(); }
    },

    openStaff: function () {
      var self = this;
      if (this.staffOn) return;
      this.staffOn = true;
      if (this.menu && this.menu.isOpen && this.menu.isOpen()) this.menu.close();

      /* 一行一个位置，别让字号去推算行距：这一页是名单，行距本身就是节奏。
       * 名字单独占一行、用大号字 —— 当年卡带的名单也是这么排的。 */
      var lines = [
        { t: '制作名单', size: 16, tint: SB.C.YEL3, dy: 18 },
        { t: '程序　美术　音乐　文案', size: 12, tint: SB.C.GREY6, dy: 54 },
        { t: '赵学', size: 16, tint: SB.C.GREY8, dy: 74 },
        { t: '2026 年夏，写给 2004 年的那个下午', size: 12, tint: SB.C.GREY7, dy: 110 },
        { t: '谢谢妈。当年那三下，我到底没被你抓着几回。', size: 12, tint: SB.C.WOOD6, dy: 134 }
      ];

      var W = 372, H = 178;
      var X = Math.round((SB.W - W) / 2), Y = Math.round((SB.H - H) / 2) + 8;
      var d = SB.D.OVERLAY;
      var g = this.add.group();
      this.staff = g;

      g.add(this.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 0.82).setOrigin(0, 0).setDepth(d));
      g.add(SB.UI.panel(this, X, Y, W, H, true).setDepth(d + 1));

      /* 揭示动画要建立在「已经看得见」之上：默认就是可见的，
       * 只有在系统没要求减弱动效时才从 0 淡进来。 */
      var soft = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i];
        var o = SB.Text.add(this, SB.W / 2, Y + L.dy, L.t, L.size, L.tint)
          .setOrigin(0.5, 0).setDepth(d + 2);
        g.add(o);
        if (soft) {
          o.setAlpha(0);
          this.tweens.add({ targets: o, alpha: 1, delay: 90 * i, duration: 320, ease: 'Quart.easeOut' });
        }
      }
      var tip = SB.Text.add(this, SB.W / 2, Y + H - 24, '按 B 回去', 12, SB.C.GREY5)
        .setOrigin(0.5, 0).setDepth(d + 2);
      g.add(tip);
      SB.Audio.sfx('ui_confirm');

      /* 弹出来这一下按的键不算，否则同一下就把名单又关回去了 */
      this.time.delayedCall(60, function () { self.staffReady = true; });
    },

    closeStaff: function () {
      if (!this.staffOn) return;
      this.staffOn = false;
      this.staffReady = false;
      if (this.staff) { this.staff.destroy(true); this.staff = null; }
      SB.Audio.sfx('ui_cancel');
      this.buildMenu(this.lastCur | 0);
    },

    enter: function (isNew) {
      var self = this;
      var s = SB.Save.d;
      var intro = !!isNew && !s.seenIntro;
      /* 序章门禁只放在这一屏。
       * 全部 Playwright 用例都是直接 scene.start('Room'|'Play') 绕过标题的，
       * 门禁一旦挪进 RoomScene.afterEnter()，那些用例会集体走进序章。
       * __nostory 是给测试和调试台用的一键短路（不落盘）。 */
      var needPro = !s.flags.prologue && !s.__nostory;
      this.leaving = true;
      SB.Audio.sfx('ui_confirm');
      SB.Audio.stopBgm();
      SB.UI.fadeOut(this, 520, function () {
        if (needPro) {
          self.scene.start('Prologue', { from: 'title', intro: intro });
          return;
        }
        self.scene.start('Room', { from: 'title', intro: intro });
      });
    },

    update: function (time, delta) {
      SB.Input.update();
      this.t += delta;

      /* 藏起来的制作名单：开着的时候这一屏别的都不管，按一下就收回去 */
      if (this.staffOn) {
        var j = SB.Input.p1.just;
        if (this.staffReady && (j.b || j.a || j.start || j.select ||
            j.up || j.down || j.left || j.right)) this.closeStaff();
        return;
      }
      this.pollCode();
      /* 电视里的雪花换帧，慢一点，像信号很弱 */
      if (this.snow && this.t > 90) {
        this.t = 0;
        this.snow.setFrame(SB.rndInt(0, 3));
      }

      /* ---- 死屏兜底 ----
       * 这一屏没有「上一页」，菜单、对话、过场三者全空就等于玩家点什么都没反应。
       * 正常流程下永远走不到这里（每条出口都自己负责把菜单端回来），
       * 但只要有一条路漏了，这里会在半秒内把主菜单放回来，光标停在原处。 */
      if (this.menuReady && !this.leaving && SB.UI.idle(this)) {
        this.idleFrames++;
        if (this.idleFrames > 30) {
          this.idleFrames = 0;
          this.buildMenu(this.lastCur | 0);
          SB.UI.toast(this, '菜单回来了', 1200);
        }
      } else {
        this.idleFrames = 0;
      }
    }
  });

})(window.SB);
