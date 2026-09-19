/* 序章场景：把 SB.STORY.prologue 那 12 镜演出来。
 *
 * 画面在 src/anim/prologueArt.js（SB.PROLOGUE_PAINT），文案在 SB.L.story.prologue，
 * 这里管三件事：节奏、输入、交棒。
 *
 * 节奏：一行念完就停下来等玩家自己点（右下角闪一个 ▼）。
 * 早先是旁白自动往下走、按 A 只是「快一点」，实测那样 12 镜会像放幻灯片一样
 * 一晃就过去 —— 玩家根本没看清自己看了什么。现在改成「读完再点」：
 * 打字途中按 A 是把这一行补完，补完之后按 A 才去下一行/下一镜。
 *
 * 跳过：除了眨眼与色调迁移这两镜（一共 6 秒），任何时候按 B 或点右上角都能跳。
 * 跳过不是「什么都不给」：会补三行摘要，否则玩家不知道自己为什么在 2004 年。
 *
 * 交棒：走完置 flags.prologue，然后 scene.start('Room', { from:'title', intro })，
 * SB.L.intro 那五句照常在客厅里播 —— 序章不抢客厅的开场。 */
(function (SB) {
  'use strict';

  var ART = { x: 0, y: 16, w: SB.W, h: 178 };
  var BAND = { x: 0, y: 196, w: SB.W, h: 56 };
  var TXT = { x: 26, y: 203, w: SB.W - 52 };
  var MENU = { x: 208, w: 254, y: 46 };   // 右上角 20–40 是「跳过」按钮，菜单从 46 起

  var COLD = 0x0d1018;

  SB.PrologueScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PrologueScene() { Phaser.Scene.call(this, { key: 'Prologue' }); },

    init: function (data) {
      var d = data || {};
      this.from = d.from || 'title';
      this.introFlag = !!d.intro;
      /* 从回忆册点进来是「重看」：不写存档，走完回册子 */
      this.replay = this.from === 'album';
      this.albumFrom = d.albumFrom || 'Title';

      this.idx = -1;
      this.beat = null;
      this.busy = false;
      this.done = false;
      this.menu = null;
      this.menuCur = 0;
      this.dialogOpen = false;
      this.picks = {};        // 每个选项点过几次（keepOpen 的镜靠它换台词）
      this.gateOpen = false;
      this.gateAt = 0;

      this.awaitLast = false;
      this.artObjs = [];
      this.artTweens = [];
      this.artTimers = [];
      this.artLoops = [];
      this.tw = null;         // 当前打字机
      /* 这一行已经打完、正停着等玩家点。序章不自动翻页，全靠这个标记：
       * update() 里按 A、或者点画面，都是把它清掉然后要下一行。 */
      this.waitTap = false;
      this.narrQueue = [];
      this.narrDone = null;
    },

    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#05070c');

      /* 日期条：这一段是 2026 年，年份必须一直挂在屏幕上，
       * 否则玩家很容易把序章也当成 2004 年的事。 */
      this.add.rectangle(0, 0, SB.W, 16, SB.C.INK, 0.7).setOrigin(0, 0).setDepth(SB.D.HUD);
      this.slugL = SB.Text.add(this, 6, 3, SB.STORY.PRO_SLUG, 12, SB.C.GREY8).setDepth(SB.D.HUD + 1);
      this.slugR = SB.Text.add(this, SB.W - 6, 3, '', 12, SB.C.GREY6)
        .setOrigin(1, 0).setDepth(SB.D.HUD + 1);

      /* 旁白带 */
      this.band = this.add.rectangle(BAND.x, BAND.y, BAND.w, BAND.h, 0x05070c, 0.9)
        .setOrigin(0, 0).setDepth(SB.D.HUD);
      this.bandLine = this.add.rectangle(BAND.x, BAND.y, BAND.w, 1, SB.C.GREY4, 0.7)
        .setOrigin(0, 0).setDepth(SB.D.HUD + 1);
      this.bandTxt = SB.Text.add(this, TXT.x, TXT.y, '', 12, SB.C.GREY8).setDepth(SB.D.HUD + 2);
      /* 「读完了，点一下」的小三角。闪是为了让人看见它在等你，
       * 不闪的话很多人会以为是画面卡住了。 */
      this.caret = SB.Text.add(this, SB.W - 14, BAND.y + BAND.h - 17, '▼', 12, SB.C.GREY6)
        .setOrigin(1, 0).setDepth(SB.D.HUD + 2).setVisible(false);
      this.caretTw = this.tweens.add({
        targets: this.caret, alpha: 0.2, duration: 620, yoyo: true, repeat: -1
      });

      this.hint = SB.UI.hint(this, function () { return self.hintText(); });
      this.skipBtn = SB.UI.corner(this, SB.L.story.prologue.skipTip, function () { self.trySkip(); });

      /* 点画面 = 按 A。序章要能纯鼠标看完。 */
      this.tapZone = this.add.rectangle(0, 0, SB.W, BAND.y + BAND.h, 0x000000, 0.001)
        .setOrigin(0, 0).setDepth(SB.D.HUD - 2).setInteractive();
      this.tapZone.on('pointerdown', function () { self.advance(); });

      this.events.once('shutdown', function () { self.cleanup(); });

      SB.Audio.bgm(null, true);   // 2026 那一夜没有配乐，只有环境声
      SB.UI.fadeIn(this, 420);
      this.playBeat(0);
    },

    /* ---------------------------------------------------------------- 画面层 */

    /* 给画法用的小工具：加进去的东西一律登记，换镜时统一收掉 */
    own: function (o) { this.artObjs.push(o); return o; },
    fill: function (color) {
      return this.own(this.add.rectangle(ART.x, ART.y, ART.w, ART.h, color, 1)
        .setOrigin(0, 0).setDepth(SB.D.BG));
    },
    rect: function (x, y, w, h, color, alpha) {
      return this.own(this.add.rectangle(x, y, w, h, color, alpha === undefined ? 1 : alpha)
        .setOrigin(0, 0).setDepth(SB.D.BG + 4));
    },
    txt: function (x, y, s, size, tint) {
      return this.own(SB.Text.add(this, x, y, s, size || 12, tint || SB.C.GREY8).setDepth(SB.D.PROP));
    },
    spin: function (cfg) { var t = this.tweens.add(cfg); this.artTweens.push(t); return t; },
    tick: function (ms, fn) {
      var ev = this.time.addEvent({ delay: ms, loop: true, callback: fn });
      this.artTimers.push(ev);
      return ev;
    },
    hum: function (key, vol) {
      var s = SB.Audio.loop(key, vol);
      if (s) this.artLoops.push(key);
      return s;
    },
    quiet: function (key) { SB.Audio.stopLoop(key); },
    sfx: function (key, vol) { SB.Audio.sfx(key, { volume: vol === undefined ? 0.7 : vol }); },

    setArt: function (name) {
      if (!name || name === this.artName) return;
      this.clearArt();
      this.artName = name;
      var fn = SB.PROLOGUE_PAINT[name];
      if (fn) fn(this); else this.fill(COLD);
    },

    clearArt: function () {
      var i;
      for (i = 0; i < this.artTweens.length; i++) {
        var tw = this.artTweens[i];
        /* 播完的 tween 已经被 Phaser 收走了（parent 置空），再 remove 一次会炸。
         * 场景 shutdown 时补丁位置尤其容易撞上 —— 判一下 parent 再动手。 */
        if (tw && tw.parent && tw.remove) { try { tw.remove(); } catch (e) { /* 已经收走了 */ } }
      }
      for (i = 0; i < this.artTimers.length; i++) {
        if (this.artTimers[i] && this.artTimers[i].remove) {
          try { this.artTimers[i].remove(false); } catch (e) { /* 同上 */ }
        }
      }
      for (i = 0; i < this.artObjs.length; i++) {
        if (this.artObjs[i] && this.artObjs[i].destroy) this.artObjs[i].destroy();
      }
      /* 环境声跟着画面走：办公室的风扇不该跟到马路上，
       * 雨声也不该跟进关了门的车里。换镜就全停，要留的由新画法自己再开。 */
      for (i = 0; i < this.artLoops.length; i++) SB.Audio.stopLoop(this.artLoops[i]);
      this.artLoops = [];
      this.artTweens = []; this.artTimers = []; this.artObjs = [];
      this.waitBar = null; this.waitTxt = null;
      this.lidTop = null; this.lidBot = null; this.needle = null;
      this.artName = null;
    },

    /* ---------------------------------------------------------------- 一镜 */

    playBeat: function (i) {
      var self = this, list = SB.STORY.prologue;
      if (i >= list.length) { this.finish(false); return; }
      this.idx = i;
      var b = list[i];
      this.beat = b;
      this.gateOpen = false;
      this.menuCur = 0;

      this.setArt(b.art);
      this.slugL.setText(b.dream ? SB.STORY.DREAM_SLUG : SB.STORY.PRO_SLUG);
      this.slugR.setText(b.dream ? '' : (SB.STORY.PRO_CLOCK + '　' + (b.place || '')));
      /* 最后一镜不给「跳过」：该看的都看完了，这时候跳只会跳出一段
       * 莫名其妙的摘要，还会把这局记成「跳着看的」。 */
      this.skipBtn.setVisible(b.skippable !== false && !b.last);
      this.hint.refresh();

      if (b.gate) this.gateAt = this.time.now + SB.STORY.PRO_WAIT_MS;

      var lines = SB.L.story.prologue[b.lines] || [];

      /* dialog 镜的文字本身就是那条评论，直接进对话框，不走旁白带 */
      if (b.kind === 'dialog') {
        this.showBand(false);
        this.dialogOpen = true;
        SB.UI.dialog(this, lines, {
          speaker: SB.L.story.prologue[b.who] || '',
          onDone: function () {
            self.dialogOpen = false;
            self.showBand(true);
            self.next();
          }
        });
        return;
      }

      this.narrate(lines, function () {
        if (b.kind === 'menu') { self.openBeatMenu(); return; }
        if (b.last) { self.waitLast(); return; }
        self.next();
      });
    },

    next: function () {
      if (this.done) return;
      this.playBeat(this.idx + 1);
    },

    /* 最后一镜：不自动往下掉，让玩家自己按一下再进 2004 */
    waitLast: function () {
      this.awaitLast = true;
      this.hint.refresh();
    },

    /* ---------------------------------------------------------------- 旁白 */

    narrate: function (lines, onDone) {
      this.narrQueue = (lines || []).slice();
      this.narrDone = onDone || null;
      this.lineNo = -1;
      this.nextLine();
    },

    nextLine: function () {
      var self = this;
      this.clearLineTimers();
      if (!this.narrQueue.length) {
        var cb = this.narrDone;
        this.narrDone = null;
        if (cb) { cb(); return; }
        /* 兜底：没有下一行、也没有回调可用了，说明这一镜已经播完。
         * 这一屏没有「什么都不做」的余地 —— 那就是卡死。往下一镜走。 */
        if (!this.awaitLast && !this.dialogOpen && !(this.menu && this.menu.isOpen())) this.next();
        return;
      }
      this.lineNo++;
      var raw = SB.line(this.narrQueue.shift());
      var s = SB.Text.wrap(raw, TXT.w, 12);
      this.onLineStart(this.lineNo);
      this.tw = SB.Text.typewriter(this, this.bandTxt, s, 40, function () {
        self.tw = null;
        /* 不自动翻页：停在这里等玩家点。这一镜的表演（雨、灯、眨眼）
         * 还在自己动，所以停着不会变成一张死图。 */
        self.holdForTap();
      });
    },

    /* 停下来等一下点击 */
    holdForTap: function () {
      this.waitTap = true;
      if (this.caret) this.caret.setVisible(true);
      this.hint.refresh();
    },

    clearTapWait: function () {
      this.waitTap = false;
      if (this.caret) this.caret.setVisible(false);
      this.hint.refresh();
    },

    /* 某几镜的表演要跟着「第几行」走：眨眼在第几下、电子音在第几句 */
    onLineStart: function (n) {
      var b = this.beat;
      if (!b) return;
      if (b.art === 'blink' && this.lidTop) { this.blinkOnce(n); return; }
      if (b.art === 'radio' && n === 2) { this.shards(); return; }
    },

    /* 眨眼：上下两条黑边合过来。第三下不再睁开。 */
    blinkOnce: function (n) {
      var last = n >= 2, self = this;
      var dur = last ? 900 : 260;
      this.spin({
        targets: [this.lidTop, this.lidBot], scaleY: 1, duration: dur, ease: 'Sine.easeInOut',
        onComplete: function () {
          if (last) return;
          self.spin({
            targets: [self.lidTop, self.lidBot], scaleY: 0,
            duration: 300, delay: 90, ease: 'Sine.easeOut'
          });
        }
      });
    },

    /* 收音机里蹦出来的 8-bit 残片：方方正正，一闪就没 */
    shards: function () {
      var cols = [SB.C.RED4, SB.C.YEL4, SB.C.GRN4, SB.C.BLU5, SB.C.WHITE];
      var i, r;
      this.sfx('glitch_burst', 0.5);
      for (i = 0; i < 7; i++) {
        r = this.rect(168 + i * 22, 130 + (i % 3) * 12, 5, 5, cols[i % cols.length], 0.95);
        this.spin({
          targets: r, alpha: 0, y: r.y - 10 - (i % 3) * 4,
          duration: 700 + i * 90, delay: i * 70, ease: 'Quad.easeOut'
        });
      }
    },

    /* ---------------------------------------------------------------- 菜单 */

    openBeatMenu: function () {
      var self = this, b = this.beat, L = SB.L.story.prologue;
      var items = [], i, o, used;

      for (i = 0; i < b.options.length; i++) {
        o = b.options[i];
        used = this.picks[b.id + '_' + i] || 0;
        items.push({
          label: SB.line(L[o.label]),
          value: i,
          /* once 的选项点过就灰掉；keepOpen 里循环的选项永远留着，
           * 免得出现「所有项都灰了、车还没来」的死屏。 */
          disabled: !!(o.once && used > 0)
        });
      }
      if (b.gate && this.gateOpen) {
        items.push({ label: SB.line(L[b.gateLabel]), value: 'gate' });
      }

      /* 上次停的那一行可能已经灰了（一次性的选项点过了）。
       * 光标不能落在灰行上 —— 那样按 A 只会「哔」一声，看着像按键坏了。 */
      if (items[this.menuCur] && items[this.menuCur].disabled) {
        this.menuCur = 0;
        for (i = 0; i < items.length; i++) {
          if (!items[i].disabled) { this.menuCur = i; break; }
        }
      }

      this.menu = SB.UI.menu(this, {
        x: MENU.x, y: MENU.y, width: MENU.w,
        items: items, cur: this.menuCur,
        cancelable: false, dim: false, depth: SB.D.DIALOG,
        onPick: function (it, at) { self.menuCur = at; self.onPick(it); }
      });
    },

    closeMenu: function () {
      if (this.menu && this.menu.isOpen()) this.menu.close();
      this.menu = null;
    },

    onPick: function (it) {
      var self = this, b = this.beat, L = SB.L.story.prologue;
      this.closeMenu();

      /* 车来了 */
      if (it.value === 'gate') {
        this.narrate([L[b.gateSay]], function () { self.next(); });
        return;
      }

      var k = it.value | 0, o = b.options[k];
      var key = b.id + '_' + k;
      var used = this.picks[key] || 0;
      this.picks[key] = used + 1;

      /* say 可以是一句，也可以是好几句：同一个选项点第二次给下一句，
       * 点到没有了就从头轮 —— 楼下等车那 18 秒得有东西可看。 */
      var say = o.say ? L[o.say] : null;
      var line = null;
      if (typeof say === 'string') line = say;
      else if (say && say.length) line = say[used % say.length];

      if (o.next) {
        this.narrate(line ? [line] : [], function () { self.next(); });
        return;
      }
      this.narrate(line ? [line] : [], function () { self.openBeatMenu(); });
    },

    /* 等车条。18 秒走满，走满了菜单里才多出「车来了」那一项。 */
    tickGate: function () {
      var b = this.beat;
      if (!b || !b.gate || this.gateOpen) return;
      var left = this.gateAt - this.time.now;
      var pct = SB.clamp(1 - left / SB.STORY.PRO_WAIT_MS, 0, 1);
      if (this.waitBar) this.waitBar.setScale(pct, 1);
      if (this.waitTxt) {
        this.waitTxt.setText(left > 0 ? ('还有 ' + Math.ceil(left / 1000) + ' 秒' ) : '到了');
      }
      if (left > 0) return;
      this.gateOpen = true;
      SB.Audio.sfx('bike_bell', { volume: 0.4 });
      /* 菜单开着就原地换一份带「车来了」的；正在播旁白就等它播完自然重开 */
      if (this.menu && this.menu.isOpen()) { this.closeMenu(); this.openBeatMenu(); }
    },

    /* ---------------------------------------------------------------- 输入 */

    update: function () {
      SB.Input.update();
      if (this.done) return;
      this.tickGate();
      if (this.dialogOpen) return;
      if (this.menu && this.menu.isOpen()) {
        /* 菜单自己吃方向键与 A；B 在菜单里是空操作（cancelable:false），
         * 所以跳过仍然由这里接。 */
        if (SB.Input.p1.just.b) this.trySkip();
        return;
      }
      var p = SB.Input.p1;
      if (p.just.a || p.just.start) this.advance();
      if (p.just.b) this.trySkip();
    },

    /* A / 点击：没打完就补完，打完了就往下一行（或下一镜） */
    advance: function () {
      if (this.done || this.dialogOpen) return;
      if (this.menu && this.menu.isOpen()) return;
      if (this.awaitLast) { this.awaitLast = false; this.finish(false); return; }
      if (this.tw && !this.tw.done) { this.tw.skip(); return; }
      if (this.waitTap) {
        this.clearTapWait();
        this.nextLine();
      }
    },

    trySkip: function () {
      if (this.done || this.busy) return;
      /* 停在最后一镜时，B 和 A 一样都是「继续」——
       * 这里已经是 2004 年了，没有什么可跳的了。 */
      if (this.awaitLast) { this.advance(); return; }
      if (this.beat && this.beat.skippable === false) {
        /* 这 6 秒不给跳。说清楚原因，别让人以为按键坏了。 */
        SB.UI.toast(this, '这一段跳不过去，6 秒就好。', 1400);
        return;
      }
      this.finish(true);
    },

    /* ---------------------------------------------------------------- 收尾 */

    finish: function (skipped) {
      var self = this;
      if (this.done) return;
      this.done = true;
      this.busy = true;
      this.closeMenu();
      this.clearLineTimers();
      this.skipBtn.setVisible(false);

      if (!this.replay) {
        var s = SB.Save.d;
        s.flags.prologue = true;
        if (skipped) s.flags.prologueSkipped = true;
        SB.Save.save();
      }

      /* 跳过的人也得知道自己为什么在 2004 年：补三行摘要再走 */
      if (skipped) {
        SB.UI.interlude(this, SB.L.story.prologue.skip, function () { self.handOff(); });
        return;
      }
      this.handOff();
    },

    handOff: function () {
      if (this.replay) {
        SB.UI.go(this, 'Album', { from: this.albumFrom });
        return;
      }
      SB.UI.go(this, 'Room', { from: 'title', intro: this.introFlag });
    },

    /* ---------------------------------------------------------------- 杂务 */

    showBand: function (v) {
      this.band.setVisible(v);
      this.bandLine.setVisible(v);
      this.bandTxt.setVisible(v);
    },

    hintText: function () {
      if (this.awaitLast) return SB.Input.tip([['a', '继续']]);
      /* 打字途中 A 是「一次打完」，打完之后 A 是「往下走」。
       * 提示跟着状态换词，否则玩家不知道自己在等什么。 */
      var parts = [['a', this.waitTap ? '继续' : '一次打完']];
      if (!this.beat || this.beat.skippable !== false) parts.push(['b', '跳过序章']);
      return SB.Input.tip(parts);
    },

    clearLineTimers: function () {
      if (this.tw) { this.tw.destroy(); this.tw = null; }
      this.waitTap = false;
      if (this.caret) this.caret.setVisible(false);
    },

    cleanup: function () {
      this.clearLineTimers();
      this.clearArt();
      var i;
      for (i = 0; i < this.artLoops.length; i++) SB.Audio.stopLoop(this.artLoops[i]);
      this.artLoops = [];
      this.menu = null;
    }
  });

})(window.SB);
