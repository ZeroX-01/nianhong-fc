/* 收钱：这个游戏里钱唯一的到手方式。
 *
 * 在这之前，进账是一行字：「（￥0.2）」。数字变了，人没出现过。
 * 可 2004 年的两毛钱不是这么来的 —— 是妈在围裙上擦了擦手，从裤兜里
 * 摸出两个硬币按到你手心里；是收废品的老汉蹲在三轮车边上，从那个
 * 卷成一团的塑料袋里一张张数给你；是小卖部老板从柜台底下的铁盒里
 * 抓一把，顺手再塞你一根冰棍。
 *
 * 所以这一屏和「哈气」「划桌」是同一种东西：一个定格特写，画面里只有
 * 一双手和钱，你要按 A 才往下走。区别是修卡台那两段是画中画，这一段
 * 直接把整屏压黑，只留中间那个取景框 —— 玩家会当成一个独立画面，
 * 工程上却没有换过场景（换场会打断客厅的妈妈状态机和 BGM）。
 *
 * 节拍（毫秒表与 tools/gen_pay_anim.py 的 PAYERS 帧表一一对应）：
 *   greet 站着说话 700 → reach 低头掏兜 520 → out 摸出钱 460
 *   → give 递过来 620 → let 松手 560            合计 ≈2.86s
 * 然后是数钱：不计时，玩家按一次 A 数一件，按 B / START 一把数完。
 *
 * 三条硬规矩：
 *   1. 钱不许丢。onDone 一定会被调用且只调用一次 —— 跳过、按 B、
 *      场景被强行换掉，都要把全额交出去。真正记账的是 onDone 的调用方。
 *   2. 演出期间锁输入。开着的时候 SB.__interludeOpen 加一，客厅的死屏
 *      兜底和妈妈回家都不会在黑幕里插进来。
 *   3. 系统关了动效（prefers-reduced-motion）就不做位移和缩放，
 *      只换帧、只出字，时长压到三成。 */
(function (SB) {
  'use strict';

  var FW = 200, FH = 140;                 // 特写取景框
  var HW = 80, HH = 56;                   // 收钱的那只手
  var BOX = { x: 140, y: 34 };            // 取景框左上角（480 宽居中）
  var HAND = { x: 100, y: 78 };           // 手在取景框里的位置（框内坐标）

  /* 每帧挂多久。索引 = sprite sheet 里的帧号，三个付款方共用一张时间表。 */
  var MS = [700, 520, 460, 620, 560];

  var PHASES = [
    { name: 'greet', from: 0, to: 0 },    // 站着，先说一句
    { name: 'reach', from: 1, to: 1 },    // 低头往兜里掏
    { name: 'out',   from: 2, to: 2 },    // 摸出来了
    { name: 'give',  from: 3, to: 3 },    // 递过来
    { name: 'let',   from: 4, to: 4 }     // 松手，钱到你手里
  ];

  var SRC = {
    pay_mom: 'assets/img/pay/pay_mom.png',
    pay_laohan: 'assets/img/pay/pay_laohan.png',
    pay_shop: 'assets/img/pay/pay_shop.png',
    pay_hand: 'assets/img/pay/pay_hand.png'
  };

  function calm() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  function phaseOf(name) {
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i].name === name) return PHASES[i];
    return null;
  }

  function timeline(names, speed) {
    var out = [], i, f, p;
    speed = speed || 1;
    for (i = 0; i < names.length; i++) {
      p = phaseOf(names[i]);
      if (!p) continue;
      for (f = p.from; f <= p.to; f++) {
        out.push({ f: f, ms: Math.max(1, Math.round(MS[f] / speed)), phase: p.name });
      }
    }
    return out;
  }

  function totalMs(tl) {
    var t = 0, i;
    for (i = 0; i < tl.length; i++) t += tl[i].ms;
    return t;
  }

  /* 今天已经看过几遍。第一次走完整版，后面越看越短 ——
   * 一天刷三回碗，第三回还看两秒半掏兜，就成了罚站。
   * 只存在内存里：刷新页面重算，不值得为它写一次盘。 */
  var seen = { day: -1, n: 0 };

  function seenToday() {
    var day = SB.Save && SB.Save.d ? SB.Save.d.day : 0;
    if (seen.day !== day) { seen.day = day; seen.n = 0; }
    return seen.n;
  }

  function markSeen() {
    seenToday();
    seen.n++;
  }

  /* 看第 n 遍（0 起）时放哪几拍、多快 */
  function plan(n) {
    if (n <= 0) return { speed: 1, names: ['greet', 'reach', 'out', 'give', 'let'] };
    if (n === 1) return { speed: 1.45, names: ['greet', 'reach', 'out', 'give', 'let'] };
    return { speed: 2.0, names: ['out', 'give', 'let'] };
  }

  /* 钱的样子：一毛两毛五毛是硬币，一块往上是纸票 */
  function isNote(v) { return v >= 1; }

  /* ------------------------------------------------------------------ 一屏演出 */
  function Show(scene, opts) {
    this.scene = scene;
    this.payerId = opts.payer || 'mom';
    this.payer = SB.PAYERS[this.payerId] || SB.PAYERS.mom;
    this.src = opts.src || 'dish';
    this.amount = Math.round((opts.amount || 0) * 10) / 10;
    this.onDone = opts.onDone || null;
    this.owed = !!opts.owed;              // 这笔是「妈回来了才给」的挂账
    this.calm = calm();
    this.items = SB.Chore ? SB.Chore.breakdown(this.amount) : [this.amount];
    this.counted = 0;
    this.got = 0;
    this.stage = 'act';                   // act 演出 | count 数钱 | tail 收尾 | over
    this.closed = false;
    this.parts = [];
    this.coinSpr = [];
  }

  Show.prototype.start = function () {
    var self = this, s = this.scene, d = SB.D.OVERLAY;
    var L = this.lines();

    SB.__interludeOpen = (SB.__interludeOpen || 0) + 1;
    this.released = false;

    /* 压黑整屏。留一点点不到纯黑，这样取景框的深色描边还能看出边界。 */
    this.dim = s.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 1)
      .setOrigin(0, 0).setDepth(d).setInteractive();
    this.dim.setAlpha(this.calm ? 1 : 0);
    if (!this.calm) s.tweens.add({ targets: this.dim, alpha: 1, duration: 170 });

    /* 取景框：一圈木色边，和修卡台那两段一个做法 */
    this.parts.push(s.add.rectangle(BOX.x - 2, BOX.y - 2, FW + 4, FH + 4, SB.C.WOOD2, 1)
      .setOrigin(0, 0).setDepth(d + 1));
    this.parts.push(s.add.rectangle(BOX.x - 1, BOX.y - 1, FW + 2, FH + 2, SB.C.WOOD5, 1)
      .setOrigin(0, 0).setDepth(d + 2));

    if (s.textures.exists(this.payer.tex)) {
      this.spr = s.add.sprite(BOX.x, BOX.y, this.payer.tex, 0).setOrigin(0, 0).setDepth(d + 3);
    } else {
      this.spr = s.add.rectangle(BOX.x, BOX.y, FW, FH, SB.C.GREY3, 1).setOrigin(0, 0).setDepth(d + 3);
    }
    this.parts.push(this.spr);

    /* 收钱的那只手：一直在画面里（你是伸着手等的），只换三个状态 */
    if (s.textures.exists('pay_hand')) {
      this.hand = s.add.sprite(BOX.x + HAND.x, BOX.y + HAND.y, 'pay_hand', 0)
        .setOrigin(0, 0).setDepth(d + 4);
      this.parts.push(this.hand);
    }

    /* 地点条：告诉玩家这是在哪儿收的钱（厨房门口 / 院门外 / 小卖部柜台）*/
    this.parts.push(s.add.rectangle(BOX.x - 1, BOX.y - 14, FW + 2, 13, SB.C.INK, 0.78)
      .setOrigin(0, 0).setDepth(d + 5));
    this.parts.push(SB.Text.add(s, BOX.x + 3, BOX.y - 12, this.payer.place, 12, SB.C.WOOD6)
      .setDepth(d + 6));
    this.gotTxt = SB.Text.add(s, BOX.x + FW - 3, BOX.y - 12, '', 12, SB.C.YEL4)
      .setOrigin(1, 0).setDepth(d + 6);
    this.parts.push(this.gotTxt);

    /* 字幕条：台词和「按 A」都压在这条暗底上。
     * 台词是「动作 + 她说的那句」连在一起的，按 FW-6 折行最长到三行
     * （妈那句刷碗的就是三行），所以「按 A」必须让到第四行去。
     * 原来把提示放在第二行的位置，被台词整整压住，一个字都看不见。
     * 条高 57，底边落在 234，屏高 270 还有余量。 */
    this.parts.push(s.add.rectangle(BOX.x - 1, BOX.y + FH + 3, FW + 2, 57, SB.C.INK, 0.8)
      .setOrigin(0, 0).setDepth(d + 5));
    this.cap = SB.Text.add(s, BOX.x + 3, BOX.y + FH + 6, '', 12, SB.C.GREY8).setDepth(d + 6);
    this.parts.push(this.cap);
    this.tip = SB.Text.add(s, BOX.x + 3, BOX.y + FH + 45, '', 12, SB.C.WOOD6).setDepth(d + 6);
    this.parts.push(this.tip);

    /* 演出 */
    this.tl = null;
    this.idx = 0;
    this.acc = 0;
    this.phase = '';
    var pl = plan(seenToday());
    markSeen();
    this.tl = timeline(pl.names, this.calm ? pl.speed * 3 : pl.speed);
    this.plannedMs = totalMs(this.tl);

    this.say(L.give);

    this.bornFrame = SB.Input.frame;
    this.poll = function () { self.tick(); };
    s.events.on('update', this.poll);
    this.dim.on('pointerdown', function () { self.press(); });
    this.enter(0);
    SB.Audio.sfx('ui_confirm', { volume: 0.4 });
    return this;
  };

  /* ---------------------------------------------------------------- 台词 */
  Show.prototype.lines = function () {
    var P = (SB.L && SB.L.pay) || {};
    var byPayer = P[this.payerId] || {};
    var one = byPayer[this.owed ? 'owed' : this.src] || byPayer.any || {};
    return {
      give: one.give || '他从兜里摸出几个钢角子，递过来。',
      tail: one.tail || '钱在你手心里，还带着别人兜里的温度。'
    };
  };

  Show.prototype.say = function (str) {
    if (this.tw && !this.tw.done) this.tw.skip();
    var s = SB.Text.wrap(str, FW - 6, 12);
    this.tw = SB.Text.typewriter(this.scene, this.cap, s, this.calm ? 8 : 38);
  };

  /* ---------------------------------------------------------------- 演出推进 */
  Show.prototype.enter = function (i) {
    var it = this.tl[i];
    if (!it) return;
    if (this.spr.setFrame && this.scene.textures.exists(this.payer.tex)) this.spr.setFrame(it.f);
    if (it.phase !== this.phase) {
      this.phase = it.phase;
      this.onPhase(it.phase);
    }
  };

  Show.prototype.onPhase = function (name) {
    if (name === 'reach') SB.Audio.sfx('ui_move', { volume: 0.3 });
    if (name === 'out' && this.hand && this.hand.setFrame) this.hand.setFrame(0);
    if (name === 'give') SB.Audio.sfx(this.payer.sfx, { volume: 0.5 });
    if (name === 'let' && this.hand && this.hand.setFrame) this.hand.setFrame(1);
  };

  Show.prototype.tick = function () {
    var dt = this.scene.game.loop.delta;
    if (this.stage === 'act') {
      this.acc += dt;
      while (this.stage === 'act' && this.idx < this.tl.length && this.acc >= this.tl[this.idx].ms) {
        this.acc -= this.tl[this.idx].ms;
        this.idx++;
        if (this.idx >= this.tl.length) { this.toCount(); return; }
        this.enter(this.idx);
      }
    }
    if (SB.Input.frame === this.bornFrame) return;
    var p = SB.Input.p1.just;
    if (p.a || p.start) this.press();
    else if (p.b) this.skip();
  };

  /* ---------------------------------------------------------------- 数钱
   * 「几毛几块」这件事，光弹一行字是记不住的。让他一张一张数过去，
   * 手心里到底有多少就变成了他自己数出来的结果。 */
  Show.prototype.toCount = function () {
    var self = this, s = this.scene, d = SB.D.OVERLAY;
    this.stage = 'count';
    if (this.hand && this.hand.setFrame) this.hand.setFrame(1);

    /* 钱摆在手心上方一排。硬币用 coin，纸票用 money_note。 */
    var n = this.items.length;
    var step = n > 5 ? 13 : 17;
    var x0 = BOX.x + HAND.x + Math.round((HW - (n - 1) * step) / 2) - 8;
    var y0 = BOX.y + HAND.y - 8;
    this.coinSpr = [];
    for (var i = 0; i < n; i++) {
      var note = isNote(this.items[i]);
      var key = note ? 'money_note' : 'coin';
      var o;
      if (s.textures.exists(key)) {
        o = note ? s.add.image(x0 + i * step, y0 - 2, key) : s.add.sprite(x0 + i * step, y0, key, 0);
      } else {
        o = s.add.rectangle(x0 + i * step, y0, note ? 26 : 12, note ? 15 : 12,
          note ? SB.C.GRN4 : SB.C.YEL3, 1);
      }
      o.setOrigin(0, 0).setDepth(d + 7).setAlpha(0.42);
      this.coinSpr.push(o);
      this.parts.push(o);
    }
    this.refreshGot();
    this.tip.setText('按 A 一张一张数　B 一把数完');
  };

  Show.prototype.countOne = function () {
    if (this.counted >= this.items.length) return false;
    var i = this.counted++;
    var o = this.coinSpr[i];
    this.got = Math.round((this.got + this.items[i]) * 10) / 10;
    if (o) {
      o.setAlpha(1);
      if (o.setFrame && this.scene.textures.exists('coin') && !isNote(this.items[i])) o.setFrame(1);
      if (!this.calm) {
        o.y -= 2;
        this.scene.tweens.add({ targets: o, y: o.y + 2, duration: 130, ease: 'Quad.easeOut' });
      }
    }
    SB.Audio.sfx('coin_get', { volume: 0.5 });
    this.refreshGot();
    return true;
  };

  Show.prototype.refreshGot = function () {
    var all = this.counted >= this.items.length;
    this.gotTxt.setText((all ? '到手 ' : '数到 ') + SB.money(this.got));
    this.gotTxt.setTint(all ? SB.C.YEL4 : SB.C.WOOD6);
  };

  Show.prototype.countAll = function () {
    while (this.countOne()) { /* 数到底 */ }
  };

  /* ---------------------------------------------------------------- 输入 */
  Show.prototype.press = function () {
    if (this.closed) return;
    if (this.stage === 'act') {
      /* 演出期间按 A：先把当前这句话点完，再让整段快进 */
      if (this.tw && !this.tw.done) { this.tw.skip(); return; }
      this.toCount();
      return;
    }
    if (this.stage === 'count') {
      if (this.countOne()) {
        if (this.counted >= this.items.length) this.toTail();
        return;
      }
      this.toTail();
      return;
    }
    if (this.stage === 'tail') {
      if (this.tw && !this.tw.done) { this.tw.skip(); return; }
      this.fin();
    }
  };

  /* B：不想数了。钱一分不少，直接全到手。 */
  Show.prototype.skip = function () {
    if (this.closed) return;
    if (this.stage === 'act') { this.toCount(); }
    if (this.stage === 'count') { this.countAll(); this.toTail(); return; }
    if (this.stage === 'tail') this.fin();
  };

  Show.prototype.toTail = function () {
    if (this.stage === 'tail') return;
    this.countAll();
    this.stage = 'tail';
    if (this.hand && this.hand.setFrame) this.hand.setFrame(2);
    if (this.spr.setFrame && this.scene.textures.exists(this.payer.tex)) this.spr.setFrame(4);
    SB.Audio.sfx('money_get', { volume: 0.6 });
    this.say(this.lines().tail);
    this.tip.setText('按 A 收起来');
    this.refreshGot();
  };

  Show.prototype.fin = function () {
    if (this.closed) return;
    this.closed = true;
    this.countAll();                      // 兜底：一分都不许少
    var self = this, cb = this.onDone, amount = this.amount;
    this.onDone = null;
    this.release();
    this.scene.events.off('update', this.poll);
    if (this.tw && !this.tw.done) this.tw.skip();
    var targets = this.parts.concat([this.dim]);
    if (this.calm) { this.destroy(); if (cb) cb(amount); return; }
    this.scene.tweens.add({
      targets: targets, alpha: 0, duration: 260,
      onComplete: function () { self.destroy(); if (cb) cb(amount); }
    });
  };

  Show.prototype.release = function () {
    if (this.released) return;
    this.released = true;
    SB.__interludeOpen = Math.max(0, (SB.__interludeOpen || 1) - 1);
  };

  Show.prototype.destroy = function () {
    var i;
    for (i = 0; i < this.parts.length; i++) if (this.parts[i]) this.parts[i].destroy();
    this.parts = [];
    if (this.dim) { this.dim.destroy(); this.dim = null; }
  };

  /* ------------------------------------------------------------------ 出口 */
  SB.PayAnim = {
    FW: FW, FH: FH, HW: HW, HH: HH, BOX: BOX, HAND: HAND,
    MS: MS, PHASES: PHASES, TEX: SRC,

    /* 场景自己 preload：四张图只有收钱这一屏用，不进全局资源清单 */
    preload: function (scene) {
      var k;
      for (k in SRC) {
        if (!Object.prototype.hasOwnProperty.call(SRC, k)) continue;
        if (scene.textures.exists(k)) continue;
        if (k === 'pay_hand') scene.load.spritesheet(k, SRC[k], { frameWidth: HW, frameHeight: HH });
        else scene.load.spritesheet(k, SRC[k], { frameWidth: FW, frameHeight: FH });
      }
    },

    ready: function (scene) {
      return scene.textures.exists('pay_mom') && scene.textures.exists('pay_hand');
    },

    timeline: timeline,
    totalMs: totalMs,
    phaseOf: phaseOf,
    plan: plan,
    seenToday: seenToday,
    resetSeen: function () { seen.day = -1; seen.n = 0; },

    duration: function (names, speed) { return totalMs(timeline(names, speed)); },

    /* 放一屏收钱。opts = { payer, src, amount, owed, onDone }
     * onDone(amount) 一定会被调用且只调用一次 —— 记账在那里做。 */
    play: function (scene, opts) {
      opts = opts || {};
      var show = new Show(scene, opts);
      scene.events.once('shutdown', function () {
        /* 被强行换场：钱不能跟着画面一起消失 */
        if (show.closed) return;
        show.closed = true;
        show.release();
        scene.events.off('update', show.poll);
        var cb = show.onDone;
        show.onDone = null;
        show.destroy();
        if (cb) cb(show.amount);
      });
      return show.start();
    },

    Show: Show
  };

})(window.SB);
