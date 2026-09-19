/* 时间：2004 年 7 月 15 日，暑假第一天。
 * 一天 5 个时段，行动消耗精力；精力用完就睡觉，进入下一天并抽取日常事件。 */
(function (SB) {
  'use strict';

  var START = new Date(2004, 6, 15);   // 月份从 0 开始
  var WD = ['日', '一', '二', '三', '四', '五', '六'];

  SB.Time = {
    date: function () {
      var d = new Date(START.getTime());
      d.setDate(d.getDate() + (SB.Save.d.day - 1));
      return d;
    },

    dateStr: function () {
      var d = this.date();
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WD[d.getDay()];
    },

    slot: function () { return SB.SLOTS[SB.Save.d.slot] || SB.SLOTS[0]; },

    isWeekend: function () { var w = this.date().getDay(); return w === 0 || w === 6; },

    /* 暑假：7/15 – 8/31，共 48 天 */
    summerDayCount: 48,
    isLastDay: function () { return SB.Save.d.day >= this.summerDayCount; },

    /* 妈妈此刻在不在家 */
    momHome: function () {
      var s = SB.Save.d;
      if (s.flags.momOut) return false;
      var base = this.slot().momHome;
      if (this.isWeekend()) base = Math.min(0.96, base + 0.3);
      return s.__momHome === undefined ? (s.__momHome = SB.chance(base)) : s.__momHome;
    },

    /* 推进时段（不消耗精力，纯粹是时间流逝） */
    nextSlot: function () {
      var s = SB.Save.d;
      s.slot = Math.min(SB.SLOTS.length - 1, s.slot + 1);
      s.__momHome = undefined;
      SB.Save.save();
    },

    /* 消耗精力。返回 false 表示今天已经没劲了 */
    spend: function (n) {
      var s = SB.Save.d;
      n = n === undefined ? 1 : n;
      if (s.ap < n) return false;
      s.ap -= n;
      if (s.ap % 1 === 0 && s.slot < SB.SLOTS.length - 1) this.nextSlot();
      SB.Save.save();
      return true;
    },

    /* 睡觉 → 第二天 */
    sleep: function () {
      var s = SB.Save.d;
      s.day++;
      s.stats.days = s.day;
      s.slot = 0;
      s.ap = 4;
      s.homework = 0;
      s.tvOn = false;
      s.__momHome = undefined;
      s.flags.momOut = false;
      s.flags.blocked = false;
      s.flags.hot = false;
      s.flags.friendVisit = false;
      s.flags.bookOpen = false;
      /* 剧情/心情/账本这些状态一个都不许加进上面这段重置列表，
       * 它们要跨天累计，清了就等于没做。要按天结算的走 SB.Story.dailyTick()。 */
      /* 借来的卡带到期 */
      SB.CARTS.forEach(function (c) {
        var cs = s.carts[c.id];
        if (cs.borrowed > 0) {
          cs.borrowed--;
          if (cs.borrowed === 0 && !cs.owned) {
            /* 还给发小了：卡不能还留在主机上或者沙发缝里 */
            if (s.inserted === c.id) { s.inserted = null; s.seated = false; s.fault = null; s.tvOn = false; }
            if (s.hidden === c.id) s.hidden = null;
            s.borrowedFrom = null;
          }
        }
      });
      /* 手柄没收到期 */
      if (s.padGone > 0 && s.day > s.padGone) s.padGone = 0;
      /* 每天固定零花钱 */
      if (SB.Story) SB.Story.earn(0.5, 'allowance');
      else SB.Save.addMoney(0.5);
      /* 心情、闷不闷、和解这些按天算的东西，全在这里结一次；
       * 必须在 rollEvent() 之前，事件带来的心情变化归今天。 */
      if (SB.Story) SB.Story.dailyTick();
      SB.Save.save();
      return this.rollEvent();
    },

    /* 抽一个日常事件 */
    rollEvent: function () {
      var s = SB.Save.d;
      if (SB.chance(0.32)) return null;    // 有些日子什么也不会发生

      var pool = SB.L.events.filter(function (e) {
        if (e.id === 'exam' && (s.day < 6 || s.flags.examDone)) return false;
        if (e.id === 'friend_come' && s.day < 3) return false;
        if (e.id === 'blackout' && s.day < 4) return false;
        return true;
      });
      var ev = SB.pick(pool);
      if (!ev) return null;

      if (ev.money) {
        var v = Math.round(SB.rnd(ev.money[0], ev.money[1]) * 10) / 10;
        /* 进账要记到账本上，不然玩家永远看不见钱是哪儿来的 */
        if (v > 0) {
          if (SB.Story) SB.Story.earn(v, ev.id);
          else SB.Save.addMoney(v);
        }
        ev.__gain = v;
      }
      if (ev.block) s.flags.blocked = true;
      if (ev.heat) s.flags.hot = true;
      if (ev.friend) s.flags.friendVisit = true;
      if (ev.id === 'exam') s.flags.examDone = true;
      SB.Save.save();
      return ev;
    }
  };

})(window.SB);
