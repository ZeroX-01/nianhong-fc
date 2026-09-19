/* 统一输入：键盘 + 实体手柄 + 屏幕虚拟手柄，三路合并成一个 8 键的「红白机手柄」。
 * 键位刻意贴近当年模拟器的默认设置：方向键 + Z(B) / X(A)，回车 START。 */
(function (SB) {
  'use strict';

  function Pad(name) {
    this.name = name;
    this.left = this.right = this.up = this.down = false;
    this.a = this.b = this.start = this.select = false;
    this._prev = {};
    this.just = {};
    /* 三路输入源各自的状态，最终做或运算 */
    this.kb = {}; this.gp = {}; this.tc = {};
    /* 「这一帧之内按过一下」的插销：手快的时候按下和松开可能落在同一帧里，
     * 只看当前是否按住就会把这一下整个漏掉。插销保证每一次点按至少被读到一帧。 */
    this.hit = {};
  }

  Pad.prototype.merge = function () {
    var keys = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = !!(this.kb[k] || this.gp[k] || this.tc[k] || this.hit[k]);
      this.just[k] = v && !this._prev[k];
      this._prev[k] = v;
      this[k] = v;
      this.hit[k] = false;
    }
    /* 左右/上下同时按下时以后按下的为准太复杂，直接按「右优先」处理，行为可预期 */
    this.h = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    this.v = (this.down ? 1 : 0) - (this.up ? 1 : 0);
  };

  Pad.prototype.anyJust = function () {
    return this.just.a || this.just.b || this.just.start || this.just.select ||
      this.just.left || this.just.right || this.just.up || this.just.down;
  };

  SB.Input = {
    game: null,
    /* 真正重算过的帧号。UI 用它来躲开「开菜单的那一下」：
     * Phaser 先发 scene 的 update 事件、再调 scene.update()，
     * 而 Input.update() 在后者里，所以刚建出来的菜单第一次 poll 时
     * 读到的还是把它开出来的那一次按键，会当场把第一项选掉。 */
    frame: 0,
    p1: new Pad('1P'),
    p2: new Pad('2P'),
    isTouch: false,
    lastPointerAt: 0,

    /* 键盘直接挂在 window 上，不走 Phaser 的 KeyboardPlugin。
     * 原因：这套手柄是全局的，而 Phaser 的键盘插件是「每个场景一份」，
     * 场景一睡一停就会丢按键状态；而 game.input.keyboard 是底层 Manager，
     * 本身并不提供 addKeys。自己收 DOM 事件最省事，也最不容易出岔子。 */
    /* 单人时的键位。字母 A / B 也认：屏幕上写着「A 确认 / B 返回」，
     * 玩家伸手就会去按键盘上的 A、B —— 按了没反应是最伤人的一种 bug。 */
    CODE: {
      ArrowLeft: '1left', ArrowRight: '1right', ArrowUp: '1up', ArrowDown: '1down',
      KeyX: '1a', KeyK: '1a', Space: '1a', KeyA: '1a',
      KeyZ: '1b', KeyJ: '1b', KeyB: '1b',
      Enter: '1start', NumpadEnter: '1start',
      ShiftLeft: '1select', ShiftRight: '1select',
      /* 2P 的两个动作键：G / H 在 1P 上没占位，什么时候都认 */
      KeyH: '2a', KeyG: '2b'
    },

    /* 双人同屏（发小家两人打坦克）才启用的一层覆盖：
     * 左手 WASD 归还给 2P，此时 A 不再是 1P 的 A 键。 */
    CODE_2P: {
      KeyA: '2left', KeyD: '2right', KeyW: '2up', KeyS: '2down'
    },

    /* 单人在电视画面里（PlayScene 打开这一层）：W / A / S / D 也是 1P 的方向键。
     *
     * 为什么要有这一层：真有人一坐下就按 WASD 想开坦克，而 A 原本是「开火」，
     * 于是坦克一动不动、只在原地放炮 —— 玩家只会得出一个结论：这游戏坏了。
     * 在游戏里「移动」比「A = 确认」重要得多，所以这一层把 A 让给「往左」，
     * 开火 / 确认还剩 X、Z、J、K、空格，一个都不缺。
     *
     * 只在小游戏跑着的时候开：暂停菜单一开就关掉，别的场景里也不开，
     * 那些地方屏幕上写着「确认 A」，按 A 就必须是确认。
     * 双人同屏时这一层不生效 —— WASD 是 2P 的，CODE_2P 优先。 */
    CODE_1P_MOVE: {
      KeyW: '1up', KeyS: '1down', KeyA: '1left', KeyD: '1right'
    },

    twoP: false,
    move1P: false,

    /* 最近一次真正用过的输入方式：'key' 键盘 / 'touch' 屏幕手柄 / 'pad' 实体手柄。
     * 提示文案照它变：键盘玩家看到真实键名，摸屏幕的人看到 A / B。 */
    src: 'key',
    _labelCbs: [],

    /* 键位名字表。'—' 位留空表示这一路不显示。
     * 键盘一栏写「常用键 / 直觉键」两个，两种手都照顾到。
     * up/down/left/right 是给「按↓趴下」「按↑跳」这种单方向提示用的：
     * 三路都写成箭头 —— 屏幕手柄和实体手柄上那个十字键，本身就是四个箭头。 */
    LABEL: {
      key: {
        a: 'X/A', b: 'Z/B', start: 'Enter', select: 'Shift',
        dir: '方向键', ud: '↑↓', lr: '←→',
        up: '↑', down: '↓', left: '←', right: '→'
      },
      touch: {
        a: 'A', b: 'B', start: 'START', select: 'SEL',
        dir: '十字键', ud: '十字键', lr: '十字键',
        up: '↑', down: '↓', left: '←', right: '→'
      },
      pad: {
        a: 'A', b: 'B', start: 'START', select: 'SELECT',
        dir: '十字键', ud: '十字键', lr: '十字键',
        up: '↑', down: '↓', left: '←', right: '→'
      }
    },

    /* 2P 的键位名字表。同屏双打时 2P 用的是键盘左手那一块（WASD + G / H），
     * 屏幕上写 2P 的键位就必须写这一套，不能跟着 1P 写。
     * - key：WASD 归 2P（见 CODE_2P），动作键 H = A、G = B（见 CODE）；
     * - pad：第二只实体手柄，跟 1P 长得一样；
     * - touch：虚拟手柄只有 1P 一副，2P 只能用键盘，所以 touch 一路直接借 key 表。 */
    LABEL_2P: {
      key: {
        a: 'H', b: 'G', start: 'Enter', select: 'Shift',
        dir: 'WASD', ud: 'W/S', lr: 'A/D',
        up: 'W', down: 'S', left: 'A', right: 'D'
      },
      pad: {
        a: 'A', b: 'B', start: 'START', select: 'SELECT',
        dir: '十字键', ud: '十字键', lr: '十字键',
        up: '↑', down: '↓', left: '←', right: '→'
      }
    },

    /* 小游戏里 1P 多出来的那套方向键（见 CODE_1P_MOVE）。
     * 提示里必须写出来 —— 玩家习惯按 WASD，只写「方向键」等于没说。
     * 只给「一整个方向」这三个位置加，单个箭头（↑ ↓ ← →）保持原样：
     * 「趴着按↓」这种句子里再塞一个 S，一行提示就没人看了。 */
    LABEL_WASD: { dir: 'WASD', ud: 'W/S', lr: 'A/D' },

    /* 这些键的浏览器默认行为（滚页、切焦点、提交）一律掐掉 */
    PREVENT: {
      ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
      Space: 1, Enter: 1, Tab: 1
    },

    init: function (game) {
      this.game = game;
      this.down = {};
      this.tapped = {};   // 这一帧内按下过的键码（配合 Pad.hit 用）

      if (!this._bound) {
        var self = this;
        this._bound = true;

        window.addEventListener('keydown', function (e) {
          if (self.PREVENT[e.code] && e.target === document.body) e.preventDefault();
          if (e.repeat) return;
          if (self.mapCode(e.code)) {
            self.down[e.code] = true; self.tapped[e.code] = true;
            self.setSrc('key');
          }
        }, false);

        window.addEventListener('keyup', function (e) {
          if (self.mapCode(e.code)) self.down[e.code] = false;
        }, false);

        /* 手指碰过屏幕：提示文案改用手柄按钮名（A / B / START） */
        window.addEventListener('touchstart', function () { self.setSrc('touch'); }, { passive: true });

        /* 切到别的窗口再切回来，手不在键盘上，状态必须清空，
         * 否则回来时角色会一直往一个方向跑 */
        window.addEventListener('blur', function () { self.down = {}; self.tapped = {}; });
      }

      this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (this.isTouch) this.src = 'touch';
      return this;
    },

    /* 键码 → 手柄键位。双人开关打开时 WASD 归 2P；
     * 单人在小游戏里时 WASD 是 1P 的方向键；其余按单人表走。 */
    mapCode: function (code) {
      if (this.twoP && this.CODE_2P[code]) return this.CODE_2P[code];
      if (!this.twoP && this.move1P && this.CODE_1P_MOVE[code]) return this.CODE_1P_MOVE[code];
      return this.CODE[code] || null;
    },

    /* 键盘上这几个键刚换了主人：按下状态必须清空，
     * 否则会有一个键卡在旧的归属上（角色一直往一个方向跑）。 */
    reclaim: function (codes) {
      var code;
      for (code in codes) {
        if (this.down) this.down[code] = false;
        if (this.tapped) this.tapped[code] = false;
      }
      var keys = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'];
      for (var i = 0; i < keys.length; i++) { this.p1.kb[keys[i]] = false; this.p2.kb[keys[i]] = false; }
      this.notifyLabels();
    },

    /* 双人同屏开关。由 PlayScene 在 twoP 时打开、退场时关掉。 */
    setTwoP: function (on) {
      on = !!on;
      if (on === this.twoP) return this;
      this.twoP = on;
      this.reclaim(this.CODE_2P);
      return this;
    },

    /* 小游戏里的「移动优先」开关（单人）。PlayScene 开局打开，
     * 暂停菜单打开时关掉、继续游戏时再打开，退场必须关掉。 */
    setMove1P: function (on) {
      on = !!on;
      if (on === this.move1P) return this;
      this.move1P = on;
      this.reclaim(this.CODE_1P_MOVE);
      return this;
    },

    /* ---------------- 键位提示文案 ----------------
     * 屏幕上所有「按什么键」的提示都从这里出，绝不再各写一遍 A / B：
     * 键盘玩家看到真实键名，摸屏幕的看到虚拟手柄上的按钮名。 */

    setSrc: function (s) {
      if (s === this.src) return this;
      this.src = s;
      this.notifyLabels();
      return this;
    },

    /* 注册「键位名字变了」的回调，返回一个退订函数（场景 shutdown 时调用） */
    onLabels: function (fn) {
      var self = this;
      this._labelCbs.push(fn);
      return function () {
        var i = self._labelCbs.indexOf(fn);
        if (i >= 0) self._labelCbs.splice(i, 1);
      };
    },

    notifyLabels: function () {
      var list = this._labelCbs.slice();
      for (var i = 0; i < list.length; i++) {
        try { list[i](); } catch (e) { /* 一个提示挂了不该拖垮整帧 */ }
      }
    },

    /* 单个键位的显示名。'a' / 'b' / 'start' / 'select' / 'dir' / 'ud' / 'lr'
     * / 'up' / 'down' / 'left' / 'right'。
     * who = 2 时给出 2P 的键名（同屏双打的按键说明要写两套）。
     * brief = true 时只写主键名，不带 WASD 那半截 —— 给常驻键位条那种
     * 一行到底、长了就会压住别人的地方用。 */
    keyName: function (k, who, brief) {
      if (who === 2) {
        var t2 = this.LABEL_2P[this.src] || this.LABEL_2P.key;
        return t2[k] || k;
      }
      var t = this.LABEL[this.src] || this.LABEL.key;
      var s = t[k] || k;
      if (this.src === 'key') {
        /* 键盘上的 A 有了别的差事（2P 的左 / 1P 的左），1P 的提示里就不能再写 A 了 */
        if ((this.twoP || this.move1P) && k === 'a') s = 'X';
        /* 小游戏里 WASD 也能走：写清楚，别让人以为只有方向键 */
        if (!brief && !this.twoP && this.move1P && this.LABEL_WASD[k]) {
          s = s + ' 或 ' + this.LABEL_WASD[k];
        }
      }
      return s;
    },

    /* 「动作 + 键名」：tip([['a','确认'],['b','返回']]) → '确认 X/A　返回 Z/B'
     * 数组里的纯字符串原样输出，方便插「或点一下」这种补充说明。
     * who = 2 时整行都按 2P 的键位写；brief 同 keyName。 */
    tip: function (parts, who, brief) {
      var out = [], i, p;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (typeof p === 'string') { out.push(p); continue; }
        out.push(p[1] ? (p[1] + ' ' + this.keyName(p[0], who, brief)) : this.keyName(p[0], who, brief));
      }
      return out.join('　');
    },

    update: function () {
      /* 一帧只真的更新一次：多个场景（客厅 + Sys + 小游戏宿主）都会调这个函数，
       * 若每次都重算，just.* 会在别人读到之前就被清掉。 */
      var now = (this.game && this.game.loop) ? this.game.loop.time : 0;
      if (now && now === this._lastT) return;
      this._lastT = now;
      this.frame++;

      /* 先把两个手柄的键盘位清零，再按当前按下的键重新填 */
      var keys = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'];
      var i;
      for (i = 0; i < keys.length; i++) { this.p1.kb[keys[i]] = false; this.p2.kb[keys[i]] = false; }

      var code, m, pad;
      for (code in this.down) {
        if (!this.down[code]) continue;
        m = this.mapCode(code);
        if (!m) continue;
        pad = m.charAt(0) === '2' ? this.p2.kb : this.p1.kb;
        pad[m.slice(1)] = true;
      }

      /* 一按一松都挤在同一帧里的「快按」，用插销补上 */
      for (code in this.tapped) {
        if (!this.tapped[code]) continue;
        m = this.mapCode(code);
        if (m) {
          pad = m.charAt(0) === '2' ? this.p2 : this.p1;
          pad.hit[m.slice(1)] = true;
        }
        this.tapped[code] = false;
      }

      /* 实体手柄 */
      var gp = this.game && this.game.input.gamepad;
      if (gp && gp.total > 0) {
        this.readGamepad(gp.getPad(0), this.p1.gp);
        if (gp.total > 1) this.readGamepad(gp.getPad(1), this.p2.gp);
        if (this.anyOf(this.p1.gp) || this.anyOf(this.p2.gp)) this.setSrc('pad');
      }

      this.p1.merge();
      this.p2.merge();
    },

    anyOf: function (o) {
      var k = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'];
      for (var i = 0; i < k.length; i++) if (o[k[i]]) return true;
      return false;
    },

    readGamepad: function (pad, out) {
      if (!pad) return;
      var ax = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
      var ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
      out.left = pad.left || ax < -0.45;
      out.right = pad.right || ax > 0.45;
      out.up = pad.up || ay < -0.45;
      out.down = pad.down || ay > 0.45;
      out.a = pad.A || pad.B;      // 手柄的 A/B 在不同布局上位置不同，两个都当 A
      out.b = pad.X || pad.Y;
      out.start = !!(pad.buttons[9] && pad.buttons[9].pressed);
      out.select = !!(pad.buttons[8] && pad.buttons[8].pressed);
    },

    clearTouch: function () {
      var k = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'];
      for (var i = 0; i < k.length; i++) {
        this.p1.tc[k[i]] = false; this.p2.tc[k[i]] = false;
        this.p1.hit[k[i]] = false; this.p2.hit[k[i]] = false;
      }
    },

    /* 是否应该显示屏幕手柄：触屏设备，或窄屏，或用户在设置里强制打开 */
    wantTouch: function () {
      var s = SB.Save.d && SB.Save.d.settings;
      if (s && s.touchPad === 'on') return true;
      if (s && s.touchPad === 'off') return false;
      return this.isTouch || window.innerWidth < 720;
    }
  };

  /* ---------------- 屏幕虚拟手柄 ----------------
   * 造型参考真实的红白机手柄：左十字键、右两个圆键、中间两个长条。
   * 半透明常驻，按下时高亮；不遮挡 4:3 画面区的中心。 */
  SB.TouchPad = function (scene, opts) {
    this.scene = scene;
    this.opts = opts || {};
    this.player = this.opts.player === 2 ? SB.Input.p2 : SB.Input.p1;
    this.parts = [];
    this.build();
  };

  SB.TouchPad.prototype.build = function () {
    var sc = this.scene, self = this;
    var d = SB.D.TOUCH;
    var showStart = this.opts.start !== false;

    this.container = sc.add.container(0, 0).setDepth(d).setScrollFactor(0);

    /* 十字键：左下角。
     * 命中范围和画出来的十字**故意不一样**：画的还是那个 104×104 的十字，
     * 但整块 136×136 的方形都算数 —— 手指按不准像素，按不到方向键
     * 和「坦克不会走」在玩家眼里是同一件事。 */
    var dx = 6, dy = SB.H - 100;
    var dpad = sc.textures.exists('touch_dpad')
      ? sc.add.image(dx, dy, 'touch_dpad').setOrigin(0, 0)
      : this.fallbackDpad(dx, dy);
    dpad.setAlpha(0.55);
    this.container.add(dpad);

    /* 命中范围是一整块 136×136 的方形，按手指相对十字中心的方位算方向（八向）。
     * 为什么不做成四个小方块：手指按不准像素，按偏一点就什么都没按到，
     * 而玩家看到的现象是「点上下左右，坦克不走」—— 和游戏坏了没有区别。
     * 一整块的另一个好处：不抬手，从「上」滑到「右上」就直接改方向。 */
    var cx = dx + 52, cy = dy + 52, half = 68;
    this.dpadHit = { cx: cx, cy: cy, half: half };     // 测试拿它对着边缘点
    var zone = sc.add.zone(cx - half, cy - half, half * 2, half * 2).setOrigin(0, 0)
      .setDepth(SB.D.TOUCH + 1).setScrollFactor(0).setInteractive({ useHandCursor: false });

    var DIRS = ['left', 'right', 'up', 'down'];
    var apply = function (px, py) {
      var ox = px - cx, oy = py - cy;
      var ax = Math.abs(ox), ay = Math.abs(oy);
      var want = {};
      /* 正中心那一小块不算方向（手指压在轴心上，谁也说不清他想往哪走） */
      if (ax > 5 || ay > 5) {
        /* 某一轴超过另一轴的 0.41 倍（≈22.5°）就算上这一轴：
         * 正上就是「上」，斜 45° 是「上 + 右」，八个方向都能出来 */
        if (ax > ay * 0.41) want[ox > 0 ? 'right' : 'left'] = true;
        if (ay > ax * 0.41) want[oy > 0 ? 'down' : 'up'] = true;
      }
      var i, k;
      for (i = 0; i < DIRS.length; i++) {
        k = DIRS[i];
        if (want[k]) {
          if (!self.player.tc[k]) self.player.hit[k] = true;   // 快按快松也要读到
          self.player.tc[k] = true;
        } else {
          self.player.tc[k] = false;
        }
      }
    };
    var letGo = function () {
      var i;
      for (i = 0; i < DIRS.length; i++) self.player.tc[DIRS[i]] = false;
      dpad.setAlpha(0.55);
    };
    zone.on('pointerdown', function (p) { SB.Input.setSrc('touch'); dpad.setAlpha(0.8); apply(p.x, p.y); });
    zone.on('pointermove', function (p) { if (p.isDown) apply(p.x, p.y); });
    zone.on('pointerup', letGo);
    zone.on('pointerout', letGo);
    this.parts.push(zone);

    /* A / B 圆键：右下角，B 在左下、A 在右上，模仿手柄的斜排 */
    this.btn(SB.W - 62, SB.H - 66, 'a', 'A');
    this.btn(SB.W - 116, SB.H - 52, 'b', 'B');

    /* START：右上角小长条 */
    if (showStart) this.bar(SB.W - 62, 8, 'start', 'START');
    if (this.opts.select) this.bar(SB.W - 62, 26, 'select', 'SEL');
  };

  SB.TouchPad.prototype.fallbackDpad = function (x, y) {
    var g = this.scene.add.graphics().setDepth(SB.D.TOUCH);
    g.fillStyle(SB.C.GREY7, 0.5);
    g.fillRect(x + 36, y, 32, 104);
    g.fillRect(x, y + 36, 104, 32);
    g.lineStyle(1, SB.C.INK, 0.8);
    g.strokeRect(x + 36, y, 32, 104);
    g.strokeRect(x, y + 36, 104, 32);
    return g;
  };

  SB.TouchPad.prototype.btn = function (x, y, key, label) {
    var sc = this.scene, self = this;
    var img;
    if (sc.textures.exists('touch_btn')) {
      img = sc.add.image(x, y, 'touch_btn', 0).setOrigin(0, 0).setAlpha(0.6);
    } else {
      img = sc.add.graphics();
      img.fillStyle(SB.C.RED3, 0.6); img.fillCircle(x + 26, y + 26, 24);
      img.lineStyle(1, SB.C.INK, 0.9); img.strokeCircle(x + 26, y + 26, 24);
    }
    img.setDepth(SB.D.TOUCH);
    var txt = SB.Text.add(sc, x + 26, y + 26, label, 16, SB.C.WHITE).setOrigin(0.5).setDepth(SB.D.TOUCH + 1).setAlpha(0.85);
    /* 命中范围是个圆，半径 27（画出来的圆半径 24）：比看到的大一圈，好按；
     * 又刚好不和旁边那颗咬在一起 —— A、B 斜排的中心距是 55.8，
     * 以前两个 64×64 的方框在中间叠了 10 像素，按 A 的左边缘按出来的是 B。 */
    var R = 27;
    var z = sc.add.zone(x + 26 - R, y + 26 - R, R * 2, R * 2).setOrigin(0, 0)
      .setDepth(SB.D.TOUCH + 2).setScrollFactor(0)
      .setInteractive(new Phaser.Geom.Circle(R, R, R), Phaser.Geom.Circle.Contains);
    z.on('pointerdown', function () {
      SB.Input.setSrc('touch');
      self.player.tc[key] = true;
      self.player.hit[key] = true;
      if (img.setFrame) img.setFrame(1); img.setAlpha(0.95);
    });
    var up = function () {
      self.player.tc[key] = false;
      if (img.setFrame) img.setFrame(0); img.setAlpha(0.6);
    };
    z.on('pointerup', up); z.on('pointerout', up);
    this.parts.push(z, img, txt);
  };

  SB.TouchPad.prototype.bar = function (x, y, key, label) {
    var sc = this.scene, self = this;
    var g = sc.add.graphics().setDepth(SB.D.TOUCH);
    var w = 54, h = 15;
    g.fillStyle(SB.C.GREY3, 0.62); g.fillRect(x, y, w, h);
    g.lineStyle(1, SB.C.GREY7, 0.7); g.strokeRect(x, y, w, h);
    var txt = SB.Text.add(sc, x + w / 2, y + h / 2 + 1, label, 12, SB.C.GREY8).setOrigin(0.5).setDepth(SB.D.TOUCH + 1).setAlpha(0.85);
    var z = sc.add.zone(x - 4, y - 4, w + 8, h + 8).setOrigin(0, 0).setDepth(SB.D.TOUCH + 2).setScrollFactor(0).setInteractive();
    z.on('pointerdown', function () { SB.Input.setSrc('touch'); self.player.tc[key] = true; self.player.hit[key] = true; txt.setAlpha(1); });
    var up = function () { self.player.tc[key] = false; txt.setAlpha(0.85); };
    z.on('pointerup', up); z.on('pointerout', up);
    this.parts.push(z, g, txt);
  };

  SB.TouchPad.prototype.destroy = function () {
    this.parts.forEach(function (p) { if (p && p.destroy) p.destroy(); });
    if (this.container) this.container.destroy();
    this.parts = [];
    SB.Input.clearTouch();
  };

})(window.SB);
