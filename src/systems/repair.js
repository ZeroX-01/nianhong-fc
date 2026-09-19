/* 修卡。整个游戏的心脏。
 *
 * 每张卡带有两个数值：
 *   dirt 0–100  金手指的氧化与灰尘，可以擦干净、可以哈掉、也会随时间回升
 *   wear 0–100  磨损，**永久**，只涨不落。在桌上划得太狠就是在磨掉它的寿命
 * 加上主机卡槽里的灰 slotDirt，共同决定开机失败的概率与故障类型。
 *
 * 设计上刻意让「过犹不及」成立：哈气太久会更湿，划太多下会磨废金手指。 */
(function (SB) {
  'use strict';

  SB.Repair = {

    /* ---------- 开机失败概率 ---------- */
    failChance: function (cartId) {
      var s = SB.Save.d;
      var c = s.carts[cartId];
      if (!c) return 1;
      if (c.dead) return 1;

      var risk = c.dirt * 0.85 + s.slotDirt * 0.35 + c.wear * 0.75;
      if (s.owned.avline) risk -= 14;      // 换了根像样的 AV 线
      if (s.flags.hot && !s.owned.fan) risk += 12;  // 天太热，主机烫手
      if (c.fake) risk += 18;              // 假卡本来就是拼的
      return SB.clamp(risk / 160, 0.02, 0.95);
    },

    /* ---------- 抽故障类型 ---------- */
    rollFault: function (cartId, seatedWell) {
      var s = SB.Save.d;
      var c = s.carts[cartId];
      if (!seatedWell) return 'SNOW';

      var w = [];
      /* 权重随成因变化，玩家能从故障现象倒推该做什么 */
      w.push({ k: 'GLITCH', v: 10 + c.dirt * 0.7 });
      w.push({ k: 'ROLL', v: 6 + c.dirt * 0.32 });
      w.push({ k: 'RAINBOW', v: 3 + s.slotDirt * 0.75 });
      w.push({ k: 'SHAKE', v: 4 + c.wear * 0.55 + (s.owned.avline ? 0 : 9) });
      w.push({ k: 'SNOW', v: 5 + c.wear * 0.3 });

      var total = 0, i;
      for (i = 0; i < w.length; i++) total += w[i].v;
      var r = Math.random() * total;
      for (i = 0; i < w.length; i++) { r -= w[i].v; if (r <= 0) return w[i].k; }
      return 'GLITCH';
    },

    /* ---------- 尝试开机 ---------- */
    attempt: function (cartId, seatedWell) {
      var s = SB.Save.d;
      var c = s.carts[cartId];
      s.stats.boots++;
      /* 每次插拔本身会带来一点磨损与积灰 */
      c.dirt = SB.clamp(c.dirt + 0.6, 0, 100);
      s.slotDirt = SB.clamp(s.slotDirt + 0.4, 0, 100);
      SB.Save.save();

      if (c.dead) return { ok: false, fault: 'SNOW', dead: true };
      if (Math.random() < this.failChance(cartId)) {
        return { ok: false, fault: this.rollFault(cartId, seatedWell) };
      }
      return { ok: true, fault: null };
    },

    /* 当前故障下这次操作对不对症 */
    isRightFix: function (fault, action) {
      var f = SB.FAULT[fault];
      return !!(f && f.fix === action);
    },

    /* ---------- 各种修法 ----------
     * 返回 { msg, ok(这次操作是否有效), dirtDelta, wearDelta, dead } */
    blow: function (cartId, power, session) {
      var c = SB.Save.d.carts[cartId];
      SB.Save.d.stats.blows++;
      session.blows = (session.blows || 0) + 1;

      if (power < 0.3) {
        return { msg: SB.line(SB.L.repair.blowWeak), ok: false };
      }
      if (power > 0.92) {
        c.dirt = SB.clamp(c.dirt + 7, 0, 100);
        return { msg: SB.line(SB.L.repair.blowTooMuch), ok: false, worse: true };
      }
      /* 最佳力度区间 0.55–0.85 */
      var eff = power >= 0.55 && power <= 0.85 ? 1 : 0.55;
      /* 同一次修卡里反复哈气，效果递减（湿气积累） */
      var fatigue = Math.max(0.35, 1 - (session.blows - 1) * 0.22);
      var d = -Math.round(20 * eff * fatigue);
      c.dirt = SB.clamp(c.dirt + d, 0, 100);
      SB.Save.save();
      return { msg: SB.line(SB.L.repair.blowOk), ok: true, dirtDelta: d };
    },

    rub: function (cartId, strokes, session) {
      var c = SB.Save.d.carts[cartId];
      SB.Save.d.stats.rubs++;
      session.rubs = (session.rubs || 0) + strokes;
      var total = session.rubs;

      var dirtDelta = 0, wearDelta = 0, msg;
      if (total <= 3) {
        dirtDelta = -9 * strokes;
        msg = SB.line(SB.L.repair.rubOk);
      } else if (total <= 5) {
        dirtDelta = -4 * strokes;
        wearDelta = 2 * strokes;
        msg = SB.line(SB.L.repair.rubOk);
      } else {
        dirtDelta = -1 * strokes;
        wearDelta = 7 * strokes;
        msg = SB.line(SB.L.repair.rubTooMuch);
      }
      c.dirt = SB.clamp(c.dirt + dirtDelta, 0, 100);
      c.wear = SB.clamp(c.wear + wearDelta, 0, 100);
      if (c.wear >= 100) { c.dead = true; }
      SB.Save.save();
      return {
        msg: msg, ok: total <= 5, dirtDelta: dirtDelta, wearDelta: wearDelta,
        dead: c.dead, warn: c.wear >= 72 && c.wear < 100
      };
    },

    reseat: function (cartId, session) {
      var c = SB.Save.d.carts[cartId];
      SB.Save.d.stats.reseats++;
      session.reseats = (session.reseats || 0) + 1;
      c.dirt = SB.clamp(c.dirt - 3, 0, 100);
      c.wear = SB.clamp(c.wear + 0.8, 0, 100);
      SB.Save.save();
      return { msg: SB.line(SB.L.repair.reseat), ok: true, seat: true };
    },

    slap: function (session) {
      SB.Save.d.stats.slaps++;
      session.slaps = (session.slaps || 0) + 1;
      /* 拍多了会招来画外音，也会让电视更不稳 */
      var scold = session.slaps >= 3;
      SB.Save.save();
      return {
        msg: scold ? '「别拍电视！」——你妈在厨房喊了一声。' : SB.line(SB.L.repair.slap),
        ok: !scold, scold: scold
      };
    },

    puff: function (session) {
      var s = SB.Save.d;
      session.puffs = (session.puffs || 0) + 1;
      var d = session.puffs <= 2 ? -18 : -5;
      s.slotDirt = SB.clamp(s.slotDirt + d, 0, 100);
      SB.Save.save();
      return { msg: SB.line(SB.L.repair.puff), ok: true, slotDelta: d };
    },

    swab: function (cartId) {
      var s = SB.Save.d;
      if (!s.goods.swab || s.goods.swab <= 0) return { msg: '没有棉签了。', ok: false };
      s.goods.swab--;
      var c = s.carts[cartId];
      c.dirt = SB.clamp(c.dirt - 48, 0, 100);
      SB.Save.save();
      return { msg: SB.line(SB.L.repair.swab), ok: true, dirtDelta: -48 };
    },

    /* 金手指的三档视觉状态 */
    fingerFrame: function (cartId) {
      var c = SB.Save.d.carts[cartId];
      if (c.dirt < 28) return 0;
      if (c.dirt < 64) return 1;
      return 2;
    },

    scratchFrame: function (cartId) {
      var c = SB.Save.d.carts[cartId];
      if (c.wear < 12) return 0;
      if (c.wear < 40) return 1;
      if (c.wear < 72) return 2;
      return 3;
    },

    /* 给玩家看的状态描述 */
    describe: function (cartId) {
      var c = SB.Save.d.carts[cartId];
      var a = c.dirt < 25 ? '金手指干净' : (c.dirt < 55 ? '金手指有点发黄' : (c.dirt < 80 ? '金手指氧化得厉害' : '金手指几乎发黑'));
      var b = c.wear < 12 ? '品相很好' : (c.wear < 40 ? '有几道划痕' : (c.wear < 72 ? '磨损明显' : '快磨废了'));
      return a + '，' + b;
    }
  };

})(window.SB);
