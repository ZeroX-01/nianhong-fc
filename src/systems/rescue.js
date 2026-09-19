/* 抢救那几秒。
 *
 * 在这之前，「妈要回来了」只需要按一下 START：电视自己关，你自己走。
 * 那一下太便宜了。真实的记忆不是「按一个键」，是听见钥匙响之后的三件事——
 * 关电视、拔卡带、把卡塞进沙发缝，手上全是活，脑子里只有一个念头：来不及。
 *
 * 所以这一层把那一下拆成三下，每一下都要你看着判定条按准：
 *   正好   不多花时间
 *   勉强   多花小半秒
 *   手滑   多花一秒多，这一下还得重来
 *
 * 关键是：抢救的时候妈妈的秒表**没有停**。时间压力不是装出来的动画，
 * 是你真的在跟 SB.Parent 的倒计时抢那几秒。
 *
 * 还有一条刻意的设计：越急，判定区越宽。
 * 手忙脚乱应该让人心跳，不应该让人绝望——
 * 被逼到墙角的时候，难度要降，紧张感要升。
 *
 * 这里只管规则和判定，一个 Phaser 对象都不碰；画面在 PlayScene 里。 */
(function (SB) {
  'use strict';

  /* 三件事的顺序是固定的，因为现实里就这个顺序：
   * 电视还开着就去拔卡，屏幕会炸出一片雪花，动静比什么都大。 */
  var STEPS = [
    {
      key: 'tv', label: '关电视',
      need: function (s) { return !!s.tvOn; },
      run: function () { return SB.Parent.actions.tvOff(); }
    },
    {
      key: 'cart', label: '拔卡带',
      need: function (s) { return !!s.inserted; },
      run: function () { return SB.Parent.actions.pullCart(); }
    },
    {
      key: 'hide', label: '塞沙发缝',
      need: function (s, id) { return !s.hidden && !!id; },
      run: function (id) { return SB.Parent.actions.hideCart(id); }
    }
  ];

  /* 压力窗口：还剩 9 秒以上算不慌，门把手在转就是满压 */
  var CALM_MS = 9000;

  SB.Rescue = {
    live: false,
    steps: [],
    i: 0,
    cursor: 0,
    dir: 1,
    center: 0.5,
    half: 0.1,
    phalf: 0.034,
    speed: 1,
    miss: 0,
    perfect: 0,
    okc: 0,
    cartId: null,
    lastJudge: null,
    auto: false,

    /* 还剩多少毫秒。妈妈没上弦的时候当成不慌。 */
    leftMs: function () {
      if (!SB.Parent || SB.Parent.state === 'idle') return CALM_MS;
      return Math.max(0, SB.Parent.eta - SB.Parent.t);
    },

    /* 0 = 不慌，1 = 门在开 */
    press: function () {
      return SB.clamp(1 - this.leftMs() / CALM_MS, 0, 1);
    },

    /* 开始抢救。auto = 是被钥匙声逼着开始的，不是自己主动收拾的。
     * 返回 false 表示没什么可收拾的（电视本来就关着、卡也不在机器里）。 */
    start: function (auto) {
      var s = SB.Save.d;
      this.cartId = s.inserted || s.hidden || null;
      this.steps = [];
      for (var k = 0; k < STEPS.length; k++) {
        if (STEPS[k].need(s, this.cartId)) this.steps.push(STEPS[k]);
      }
      this.i = 0;
      this.miss = 0;
      this.perfect = 0;
      this.okc = 0;
      this.lastJudge = null;
      this.auto = !!auto;
      if (!this.steps.length) { this.live = false; return false; }
      this.live = true;
      this.roll();
      return true;
    },

    stop: function () {
      this.live = false;
      this.steps = [];
      this.lastJudge = null;
    },

    /* 当前这一下要干的事 */
    cur: function () {
      return this.live ? this.steps[this.i] : null;
    },

    /* 抽一次判定参数。
     * 目标不钉在正中间：钉住了玩家就在背节拍，而不是看着按。 */
    roll: function () {
      var p = this.press();
      this.speed = 0.80 + 1.30 * p;        // 每秒扫过的进度，来回一趟算 2
      this.half = 0.085 + 0.080 * p;       // 命中半宽：越急越宽
      this.phalf = this.half * 0.34;       // 「正好」的那一小段
      this.center = SB.clamp(SB.rnd(0.26, 0.74), this.half, 1 - this.half);
      this.cursor = SB.chance(0.5) ? 0 : 1;
      this.dir = this.cursor > 0.5 ? -1 : 1;
    },

    update: function (dtMs) {
      if (!this.live) return;
      this.cursor += (dtMs / 1000) * this.speed * this.dir;
      /* 撞到两头就折回来，别让它跑出条子外面 */
      if (this.cursor > 1) { this.cursor = 2 - this.cursor; this.dir = -1; }
      if (this.cursor < 0) { this.cursor = -this.cursor; this.dir = 1; }
      this.cursor = SB.clamp(this.cursor, 0, 1);
    },

    /* 按下去。返回 { type, step, label }，type ∈ perfect | ok | miss。 */
    hit: function () {
      if (!this.live) return null;
      var st = this.steps[this.i];
      if (!st) return null;

      var d = Math.abs(this.cursor - this.center);
      var type = d <= this.phalf ? 'perfect' : (d <= this.half ? 'ok' : 'miss');
      var res = { type: type, step: st.key, label: st.label };
      this.lastJudge = res;

      if (type === 'miss') {
        this.miss++;
        /* 时间是真的没了：直接把妈妈的秒表往前推 */
        SB.Parent.t += 1100;
        SB.Audio.sfx('ui_error');
        this.roll();
        return res;
      }

      if (type === 'ok') { this.okc++; SB.Parent.t += 450; }
      else { this.perfect++; }

      /* 动作本身的音效在 SB.Parent.actions 里放，这儿不重复 */
      st.run(this.cartId);
      this.i++;
      if (this.i < this.steps.length) this.roll();
      else this.live = false;
      return res;
    },

    /* 三件事都过了没 */
    finished: function () {
      return !this.live && this.i >= this.steps.length;
    },

    /* 收场评级。
     * 直接看世界的状态，不看自己记的账——这样「本来就关着的电视」
     * 之类的情况自动算过，不用在别处补特例。
     *   clean  一下没滑，卡也塞好了
     *   close  收拾完了，但过程难看
     *   fail   电视还开着，或者卡还在机器里
     */
    grade: function () {
      var s = SB.Save.d;
      if (s.tvOn || s.inserted) return 'fail';
      return (this.miss === 0 && !!s.hidden) ? 'clean' : 'close';
    },

    /* 记账。干净收场给一点回报，难看的收场不给也不罚——
     * 罚已经在刚才那几秒里罚过了。 */
    settle: function () {
      var g = this.grade();
      var s = SB.Save.d;
      var st = s.stats;
      if (g === 'clean') {
        st.rescueClean = (st.rescueClean || 0) + 1;
        s.momTrust = SB.clamp(s.momTrust + 3, 0, 100);
        if (s.story) s.story.mood = SB.clamp(s.story.mood + 3, 0, 100);
        SB.Save.unlockAlbum('rescue_clean', '三下',
          '关电视、拔卡带、塞沙发缝。你后来才发现，这三下自己练了一整个夏天。');
      } else if (g === 'close') {
        st.rescueClose = (st.rescueClose || 0) + 1;
      } else {
        st.rescueFail = (st.rescueFail || 0) + 1;
      }
      SB.Save.save();
      return g;
    }
  };

})(window.SB);
