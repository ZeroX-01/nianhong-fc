/* 家务：能不能干、干了几次、谁给钱。
 *
 * 这一层只管规矩和账，不画任何东西。场景问它「小方桌上该列哪几项、
 * 哪几项是灰的、为什么灰」，它答；干完了来这里报一声，它记账、结算、
 * 决定这笔钱是当场给你还是先挂着。
 *
 * 跨天是懒清零：没有任何地方需要在 SB.Time.sleep() 里加一行。
 * 第一次问它今天的记录，它发现 chores.day 不是今天，就地清一遍 ——
 * 和账本 (SB.Story.earn) 同一个写法。
 *
 * 一条必须守住的规矩：owed（妈不在家，钱先挂着）绝不能跟着跨天清掉。
 * 活是真干了的，钱就一定要到手；只是要等她回来。 */
(function (SB) {
  'use strict';

  function r1(v) { return Math.round(v * 10) / 10; }

  /* 今天的记录。顺手做跨天清零和老档兜底。 */
  function cs() {
    var d = SB.Save.d;
    if (!d.chores) d.chores = { day: 0, done: {}, slots: {}, owed: 0, owedSrc: '' };
    var c = d.chores;
    if (!c.done) c.done = {};
    if (!c.slots) c.slots = {};
    if (c.day !== d.day) {
      c.day = d.day;
      c.done = {};
      c.slots = {};
      /* owed 故意不动 */
    }
    return c;
  }

  SB.Chore = {

    state: cs,

    all: function () { return SB.CHORES; },

    byId: function (id) { return SB.CHORE_BY_ID[id] || null; },

    /* 今天这活干了几次 */
    doneToday: function (id) { return cs().done[id] || 0; },

    /* 这个时段干过没（刷碗靠它卡「一顿饭只刷一次」） */
    slotCount: function (id, slot) {
      var list = cs().slots[id] || [];
      var n = 0, i;
      slot = slot === undefined ? SB.Save.d.slot : slot;
      for (i = 0; i < list.length; i++) if (list[i] === slot) n++;
      return n;
    },

    /* 当前时段是不是这活的时段 */
    inSlot: function (id) {
      var c = this.byId(id);
      if (!c) return false;
      var key = (SB.SLOTS[SB.Save.d.slot] || SB.SLOTS[0]).key;
      return c.slots.indexOf(key) >= 0;
    },

    /* 能不能干。返回 { ok, code, why }：
     *   code = 'ok' | 'slot'（不是这个点的活）| 'max'（今天够了）
     *        | 'slotDone'（这一顿/这半天已经干过）| 'ap'（没精力了）*/
    check: function (id) {
      var c = this.byId(id);
      if (!c) return { ok: false, code: 'slot', why: '没有这活。' };
      if (!this.inSlot(id)) return { ok: false, code: 'slot', why: c.no };
      if (this.doneToday(id) >= c.max) {
        return {
          ok: false, code: 'max',
          why: c.max > 1 ? '今天已经干了 ' + c.max + ' 回了。够了。' : c.noSlot
        };
      }
      if (c.perSlot && this.slotCount(id) >= c.perSlot) {
        return { ok: false, code: 'slotDone', why: c.noSlot };
      }
      if (SB.Save.d.ap < c.ap) return { ok: false, code: 'ap', why: '今天没劲了。' };
      return { ok: true, code: 'ok', why: '' };
    },

    /* 小方桌「帮家里干活」那一屏的菜单项。
     *
     * 干不了的活不隐藏、也不置灰 —— SB.UI.menu 里 disabled 的行光标跳不过去，
     * 玩家永远读不到「为什么现在不行」。这套规矩（碗要饭点后、垃圾等傍晚）
     * 恰恰是这个功能的全部内容，不让他读到就等于没做。
     * 所以一律可选，右边小字用暗一档的颜色表示「这会儿不行」，
     * 真按下去由场景把那句话说出来。 */
    items: function () {
      var self = this, out = [];
      SB.CHORES.forEach(function (c) {
        var r = self.check(c.id);
        var left = c.max - self.doneToday(c.id);
        var sub, tint = null;
        if (r.ok) {
          sub = SB.money(c.pay) + (c.max > 1 ? '　还能 ' + left + ' 回' : '　' + c.sub);
        } else if (r.code === 'max' || r.code === 'slotDone') {
          sub = '干过了'; tint = SB.C.GREY5;
        } else if (r.code === 'ap') {
          sub = '没劲了'; tint = SB.C.GREY5;
        } else {
          sub = c.sub; tint = SB.C.GREY5;
        }
        var it = { label: c.name, sub: sub, value: c.id, __code: r.code, __why: r.why };
        if (tint !== null) it.subTint = tint;
        out.push(it);
      });
      return out;
    },

    /* 今天还能干的活有几样（小方桌那一行的角标用） */
    availCount: function () {
      var self = this, n = 0;
      SB.CHORES.forEach(function (c) { if (self.check(c.id).ok) n++; });
      return n;
    },

    /* 干这活。扣精力、记次数、算钱。
     * 返回 { ok, chore, pay, src, payer, paid, owed, sawIt, trust }
     *   paid  这笔钱当场就给了（走收钱特写）
     *   owed  当场没人给（妈不在家），先挂着
     *   sawIt 她看见你干了 —— 只有看见才涨信任
     * 注意：paid 的情况这里不调 SB.Story.earn()，进账要等收钱特写
     * 那一屏真的把钱递到手里才记。钱到账和「看见钱到账」必须是同一件事。 */
    doChore: function (id) {
      var c = this.byId(id);
      var r = this.check(id);
      if (!c || !r.ok) return { ok: false, code: r.code, why: r.why };

      /* 先把「现在是哪个时段」记下来。spend() 会把时段往后推一格，
       * 而这一次活是干在推进之前那个时段上的 —— 中午刷的碗不能记到
       * 傍晚头上，否则「一顿饭一次」就卡不住了。 */
      var slotAt = SB.Save.d.slot;
      /* 她在不在家也要在推进时段之前问：spend() 换了时段就会重新摇一次，
       * 「干活的时候她在厨房，干完发现她出门了」是说不通的。 */
      var home = SB.Time.momHome();

      if (!SB.Time.spend(c.ap)) return { ok: false, code: 'ap', why: '今天没劲了。' };

      var st = cs(), d = SB.Save.d;
      st.done[id] = (st.done[id] || 0) + 1;
      if (!st.slots[id]) st.slots[id] = [];
      st.slots[id].push(slotAt);

      /* 家里的活要妈妈在家才有人给钱。她不在，活照干（碗总得有人刷），
       * 钱先挂着，等她回来；她没看见，也就不涨信任。 */
      var needMom = c.payer === 'mom';
      var paid = !needMom || home;
      var sawIt = needMom ? home : false;

      if (sawIt && c.trust) {
        d.momTrust = SB.clamp((d.momTrust || 0) + c.trust, 0, 100);
      }
      if (!paid) {
        st.owed = r1((st.owed || 0) + c.pay);
        st.owedSrc = c.src;
      }
      SB.Save.save();

      return {
        ok: true, chore: c, pay: c.pay, src: c.src, payer: c.payer,
        paid: paid, owed: !paid, sawIt: sawIt, trust: sawIt ? c.trust : 0
      };
    },

    /* ---------------------------------------------------------------- 挂账
     * 妈不在家的时候干的活。她一回来就该给了。 */
    owed: function () { return r1(cs().owed || 0); },
    owedSrc: function () { return cs().owedSrc || 'dish'; },

    /* 结算挂账：把金额和来源交出去，自己清零。
     * 真正记进账本的是收钱特写那一屏（和 doChore 一样的规矩）。 */
    takeOwed: function () {
      var st = cs(), v = r1(st.owed || 0);
      if (v <= 0) return null;
      var src = st.owedSrc || 'dish';
      st.owed = 0;
      st.owedSrc = '';
      SB.Save.save();
      return { pay: v, src: src, payer: 'mom' };
    },

    /* ---------------------------------------------------------------- 谁给钱 */
    payerOf: function (src) {
      var id = SB.PAY_BY_SRC[src];
      return id ? SB.PAYERS[id] : null;
    },

    /* 把金额拆成几张几枚，大面额在前。数钱那一步照着这张清单一件件数。
     * 最多 8 件：再多就不是「数钱」而是罚站了，超出的并到最后一件上。 */
    breakdown: function (v) {
      var left = Math.round(r1(v) * 10), out = [], i, unit, n;
      for (i = 0; i < SB.PAY_DENOM.length && left > 0; i++) {
        unit = Math.round(SB.PAY_DENOM[i] * 10);
        n = Math.floor(left / unit);
        if (n <= 0) continue;
        left -= n * unit;
        while (n-- > 0) out.push(SB.PAY_DENOM[i]);
      }
      if (out.length > 8) {
        var tail = 0;
        while (out.length > 8) tail = r1(tail + out.pop());
        out[7] = r1(out[7] + tail);
      }
      return out;
    }
  };

})(window.SB);
