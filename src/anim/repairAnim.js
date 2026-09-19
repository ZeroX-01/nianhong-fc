/* 修卡台的两个标志性动作：对着金手指哈气、在桌角划两下。
 *
 * 这一层只管"表现"。它不认识脏污、磨损、疲劳，也从不调用 SB.Repair。
 * 场景把「什么时候开始、蓄了多少力、放完了叫谁」告诉它，它负责把
 * 四拍（准备 / 发力 / 停顿 / 收尾）按毫秒表摆到屏幕上。
 *
 * 帧表与 tools/gen_repair_anim.py 里的 BLOW / RUB 一一对应，改一头必须改另一头。
 *
 *   哈气 16 帧：准备 460 → 蓄力（玩家按住多久就是多久）→ 发力① 520
 *               → 停顿 420 → 发力② 540 → 收尾 560
 *   划桌 13 帧：准备 560 → 第一下 480 → 抬起回位 620 → 第二下 490 → 收尾 760
 *
 * 取景框刻意做成画中画：只占屏幕中间那一块，脏污条、磨损条、右侧按钮
 * 一个像素都不许压到。 */
(function (SB) {
  'use strict';

  var FW = 140, FH = 116;

  /* 每一帧挂多久（毫秒）。索引 = sprite sheet 里的帧号。 */
  var MS = {
    blow: [160, 150, 150, 200, 190, 190, 180, 170, 170, 210, 210, 180, 180, 180, 280, 280],
    rub: [190, 185, 185, 160, 160, 160, 210, 205, 205, 245, 245, 380, 380]
  };

  /* 拍子：名字 -> 帧区间（闭区间）。场景按名字点音效、撒灰。 */
  var PHASES = {
    blow: [
      { name: 'prep', from: 0, to: 2 },      // 举起来，凑到嘴边
      { name: 'charge', from: 3, to: 5 },    // 吸气鼓腮（玩家按住的那一段）
      { name: 'push1', from: 6, to: 8 },     // 第一口气
      { name: 'hold', from: 9, to: 10 },     // 停一下，看看干净没
      { name: 'push2', from: 11, to: 13 },   // 第二口气
      { name: 'finish', from: 14, to: 15 }   // 撤开、松口气
    ],
    rub: [
      { name: 'prep', from: 0, to: 2 },      // 找准桌沿
      { name: 'stroke1', from: 3, to: 5 },   // 第一下
      { name: 'lift', from: 6, to: 8 },      // 抬起、灰往下掉、回位
      { name: 'stroke2', from: 9, to: 10 },  // 第二下
      { name: 'finish', from: 11, to: 12 }   // 转正检查
    ]
  };

  var TEX = { blow: 'repair_blow', rub: 'repair_rub' };
  var SRC = {
    blow: 'assets/img/cart/repair_blow.png',
    rub: 'assets/img/cart/repair_rub.png'
  };

  function phaseOf(kind, name) {
    var list = PHASES[kind], i;
    for (i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* 按拍子名拼出时间轴：[{f 帧号, ms 时长, phase 拍名}, ...] */
  function timeline(kind, names, speed) {
    var out = [], i, f, p;
    speed = speed || 1;
    for (i = 0; i < names.length; i++) {
      p = phaseOf(kind, names[i]);
      if (!p) continue;
      for (f = p.from; f <= p.to; f++) {
        out.push({ f: f, ms: Math.max(1, Math.round(MS[kind][f] / speed)), phase: p.name });
      }
    }
    return out;
  }

  function totalMs(tl) {
    var t = 0, i;
    for (i = 0; i < tl.length; i++) t += tl[i].ms;
    return t;
  }

  /* ------------------------------------------------------------------ 播放器 */
  function Player(scene, opts) {
    opts = opts || {};
    this.scene = scene;
    this.x = opts.x !== undefined ? opts.x : Math.round((SB.W - FW) / 2);
    this.y = opts.y !== undefined ? opts.y : 60;
    this.depth = opts.depth !== undefined ? opts.depth : (SB.D.DIALOG - 5);
    this.kind = null;
    this.mode = 'idle';        // idle | charge | run
    this.tl = null;
    this.idx = 0;
    this.acc = 0;
    this.charge = 0;
    this.phase = '';
    this.onFrame = null;
    this.onPhase = null;
    this.onDone = null;
    this.skippable = false;
    this.built = false;
  }

  Player.prototype.build = function () {
    if (this.built) return;
    var s = this.scene, x = this.x, y = this.y, d = this.depth;
    this.box = s.add.container(0, 0).setDepth(d);
    /* 取景框：一层影子 + 两圈木色边，像把镜头怼到桌前 */
    this.box.add(s.add.rectangle(x + 3, y + 3, FW + 4, FH + 4, SB.C.INK, 0.55).setOrigin(0, 0));
    this.box.add(s.add.rectangle(x - 2, y - 2, FW + 4, FH + 4, SB.C.WOOD2, 1).setOrigin(0, 0));
    this.box.add(s.add.rectangle(x - 1, y - 1, FW + 2, FH + 2, SB.C.WOOD5, 1).setOrigin(0, 0));
    if (s.textures.exists(TEX.blow)) {
      this.spr = s.add.sprite(x, y, TEX.blow, 0).setOrigin(0, 0);
    } else {
      this.spr = s.add.rectangle(x, y, FW, FH, SB.C.GREY3, 1).setOrigin(0, 0);
    }
    this.box.add(this.spr);
    /* 字幕条：底下压一条暗色，不然「任意键跳过」压在墙纸上根本看不见 */
    this.capBg = s.add.rectangle(x - 1, y + FH + 2, FW + 2, 13, SB.C.INK, 0.72).setOrigin(0, 0);
    this.box.add(this.capBg);
    this.tip = SB.Text.add(s, x + 3, y + FH + 4, '', 12, SB.C.WOOD7);
    this.box.add(this.tip);
    this.box.setVisible(false);
    this.built = true;
  };

  Player.prototype.bounds = function () {
    return { x: this.x - 2, y: this.y - 2, w: FW + 4, h: FH + 4 + 14 };
  };

  Player.prototype.show = function (kind) {
    this.build();
    this.kind = kind;
    if (this.spr.setTexture && this.scene.textures.exists(TEX[kind])) {
      this.spr.setTexture(TEX[kind], 0);
    }
    this.box.setVisible(true);
    this.box.setAlpha(1);
  };

  Player.prototype.hide = function () {
    if (this.built) this.box.setVisible(false);
  };

  Player.prototype.setFrame = function (f) {
    this.frame = f;
    if (this.spr.setFrame && this.scene.textures.exists(TEX[this.kind])) this.spr.setFrame(f);
  };

  /* 蓄力：先走"准备"那几帧，然后停在鼓腮帧上等玩家松手 */
  Player.prototype.startCharge = function (kind, opts) {
    opts = opts || {};
    this.show(kind);
    this.mode = 'charge';
    this.tl = timeline(kind, opts.phases || ['prep'], opts.speed || 1);
    this.idx = 0;
    this.acc = 0;
    this.charge = 0;
    this.phase = this.tl.length ? this.tl[0].phase : 'charge';
    this.skippable = false;
    this.setFrame(this.tl.length ? this.tl[0].f : phaseOf(kind, 'charge').from);
    this.tip.setText('松手 = 哈出去');
  };

  /* 蓄力量 0..1 -> 鼓腮档位。这就是"蓄力条和动画阶段对上"的那一行。 */
  Player.prototype.setCharge = function (v) {
    this.charge = v < 0 ? 0 : (v > 1 ? 1 : v);
    if (this.mode !== 'charge' || (this.tl && this.idx < this.tl.length)) return;
    var p = phaseOf(this.kind, 'charge');
    var n = p.to - p.from + 1;
    var i = Math.floor(this.charge * n);
    if (i > n - 1) i = n - 1;
    this.setFrame(p.from + i);
    this.phase = 'charge';
  };

  /* 松手 / 直接播一整段 */
  Player.prototype.run = function (kind, names, opts) {
    opts = opts || {};
    this.show(kind);
    this.mode = 'run';
    this.tl = timeline(kind, names, opts.speed || 1);
    this.idx = 0;
    this.acc = 0;
    this.onFrame = opts.onFrame || null;
    this.onPhase = opts.onPhase || null;
    this.onDone = opts.onDone || null;
    this.skippable = opts.skippable !== false;
    this.tip.setText(this.skippable ? (opts.tipText || '任意键跳过') : '');
    this.plannedMs = totalMs(this.tl);
    if (!this.tl.length) { this.finish(); return this; }
    this.phase = '';
    this.enter(0);
    return this;
  };

  Player.prototype.enter = function (i) {
    var it = this.tl[i];
    this.setFrame(it.f);
    if (it.phase !== this.phase) {
      this.phase = it.phase;
      if (this.onPhase) this.onPhase(it.phase, it.f);
    }
    if (this.onFrame) this.onFrame(it.f, it.phase);
  };

  Player.prototype.isPlaying = function () { return this.mode !== 'idle'; };
  Player.prototype.isRunning = function () { return this.mode === 'run'; };

  Player.prototype.update = function (dt) {
    if (this.mode === 'charge') {
      /* 准备那几帧照表走完，然后停在鼓腮帧上，等玩家松手 */
      if (this.tl && this.idx < this.tl.length) {
        this.acc += dt;
        while (this.idx < this.tl.length && this.acc >= this.tl[this.idx].ms) {
          this.acc -= this.tl[this.idx].ms;
          this.idx++;
          if (this.idx < this.tl.length) this.setFrame(this.tl[this.idx].f);
        }
      }
      if (!this.tl || this.idx >= this.tl.length) this.setCharge(this.charge);
      return;
    }
    if (this.mode !== 'run') return;
    this.acc += dt;
    while (this.mode === 'run' && this.idx < this.tl.length && this.acc >= this.tl[this.idx].ms) {
      this.acc -= this.tl[this.idx].ms;
      this.idx++;
      if (this.idx >= this.tl.length) { this.finish(); return; }
      this.enter(this.idx);
    }
  };

  /* 跳过：立刻收摊，但 onDone 一定会被叫到（结算不能丢） */
  Player.prototype.skip = function () {
    if (this.mode !== 'run' || !this.skippable) return false;
    this.finish();
    return true;
  };

  Player.prototype.finish = function () {
    var cb = this.onDone;
    this.onDone = null;
    this.mode = 'idle';
    this.tl = null;
    this.hide();
    if (cb) cb();
  };

  Player.prototype.cancel = function () {
    this.onDone = null;
    this.mode = 'idle';
    this.tl = null;
    this.hide();
  };

  Player.prototype.destroy = function () {
    this.onDone = null;
    this.mode = 'idle';
    if (this.built) { this.box.destroy(true); this.built = false; }
  };

  /* ------------------------------------------------------------------ 出口 */
  SB.RepairAnim = {
    FW: FW,
    FH: FH,
    MS: MS,
    PHASES: PHASES,
    TEX: TEX,

    /* 场景自己 preload：不动 data/assets.js，也不改 BootScene */
    preload: function (scene) {
      var k;
      for (k in TEX) {
        if (!Object.prototype.hasOwnProperty.call(TEX, k)) continue;
        if (scene.textures.exists(TEX[k])) continue;
        scene.load.spritesheet(TEX[k], SRC[k], { frameWidth: FW, frameHeight: FH });
      }
    },

    ready: function (scene) {
      return scene.textures.exists(TEX.blow) && scene.textures.exists(TEX.rub);
    },

    timeline: timeline,
    totalMs: totalMs,
    phaseOf: phaseOf,

    /* 一段拍子在某个倍速下要花多久（测试和 UI 都要读它） */
    duration: function (kind, names, speed) {
      return totalMs(timeline(kind, names, speed));
    },

    /* 看第 n 遍（0 起）时的倍速与要保留的拍子：越看越短，但两下/两口气永远都在 */
    plan: function (kind, seen) {
      var speed = seen <= 0 ? 1 : (seen === 1 ? 1.5 : 2.2);
      var names;
      if (kind === 'blow') {
        names = seen >= 2 ? ['push1', 'push2', 'finish'] : ['push1', 'hold', 'push2', 'finish'];
      } else {
        names = seen >= 2 ? ['stroke1', 'lift', 'stroke2', 'finish']
          : ['prep', 'stroke1', 'lift', 'stroke2', 'finish'];
      }
      return { speed: speed, names: names, ms: totalMs(timeline(kind, names, speed)) };
    },

    Player: Player
  };

})(window.SB);
