/* 存档。全部落在 localStorage，没有服务端，换机器就是新的一个夏天。 */
(function (SB) {
  'use strict';

  /* 存档键。作品对外定名《那年的红白机》以后换成了 nianhong_ 前缀 —— 老键里带着
   * 一个真实主机品牌的英文名，公开发布不能留。换键不能让老玩家的档消失，所以
   * load() 读不到新键时会去读一次 OLD_KEY 并原地搬过来（搬完不删，退回老版本还能玩）。
   * 版本号走 v 字段，靠 load() + migrate() 往上升。 */
  var KEY = 'nianhong_save_v1';
  var OLD_KEY = 'subor_summer_save_v1';   // check-words: allow（只为读老档，不上屏）
  var VER = 4;

  SB.Save = {
    VER: VER,
    d: null,

    def: function () {
      var carts = {};
      SB.CARTS.forEach(function (c) {
        carts[c.id] = {
          owned: false, dirt: c.startDirt, wear: 0,
          fake: false, borrowed: 0, dead: false,
          cleared: false, best: 0, plays: 0, knownTruth: false
        };
      });
      /* 开局就有的两张：发小塞给你的坦克、和最烂的那张 100 万合 1 */
      carts['02'].owned = true;
      carts['05'].owned = true;

      return {
        v: VER,
        day: 1,
        slot: 2,                 // 从下午开始，妈还没回来
        ap: 4,
        money: 3.5,
        carts: carts,
        inserted: null,          // 当前插在卡槽里的卡带 id
        seated: false,           // 卡带是否插到底
        fault: null,             // 当前画面故障类型（SB.FAULT.*），null = 画面正常
        hidden: null,            // 藏在沙发缝里的卡带 id
        tvOn: false,
        bulbOn: false,
        slotDirt: 22,            // 卡槽里的灰
        pads: 1,
        goods: { swab: 0, popsicle: 0 },
        owned: {},               // 一次性物品 avline/pad2/mag/fan
        padGone: 0,              // 手柄被没收到第几天
        cartSeized: null,        // 被没收的卡带 id
        homework: 0,             // 今天的作业完成度 0-100
        momTrust: 50,
        caught: 0,
        escaped: 0,
        borrowedFrom: null,
        seenIntro: false,
        /* 剧情状态集中放这里。
         * 数值和对象型的东西一律不许塞进 flags —— flags 的默认值是 {}，
         * merge() 不会给它内部的键回填默认值，老档读出来会是 undefined。
         * 放在这个有显式默认值的顶层对象里，老档过 merge 就自动有值。 */
        story: {
          mood: 60,              // 心情 0–100。不是资源条，只做叙事晴雨表和结局判定
          moodDay: 0,            // 上一次做「今天闷不闷」结算的天
          quietDays: 0,          // 连着几天只写作业没玩
          playsMark: 0,          // 上次结算时的 stats.plays，用来看今天到底玩没玩
          lent: true,            // 客厅那台是你爸单位同事寄放的
          dueDay: 48,            // 开学前要还回去（= 暑假最后一天）
          told: false,           // 「这台是借的」这件事跟玩家交代过没
          ownConsole: false,     // 自己那台二手主机买到了没
          ownDay: 0,             // 哪天买的
          /* 零花钱账本：today/src 每天清零，total/saved 是整个夏天的累计 */
          ledger: { day: 0, today: 0, total: 0, saved: 0, src: {}, legacy: false },
          ending: null           // 命中的结局变体 id
        },
        /* 今天干过的活。day 是「这份记录属于哪一天」，跨天靠 SB.Chore 懒清零，
         * 不进 SB.Time.sleep() 的重置列表 —— 那张表只管当天的临时状态，
         * 而 owed（妈妈还没回来、钱先记着）必须跨天留住。 */
        chores: {
          day: 0,                // 这份 done 记录属于第几天
          done: {},              // { choreId: 今天干了几次 }
          slots: {},             // { choreId: [干过的时段 index] }，刷碗靠它卡「一顿饭一次」
          owed: 0,               // 妈不在家时干的活，钱先挂着
          owedSrc: ''            // 挂着的那笔是干什么挣的（只留最后一项，用来说话）
        },
        /* flags 里只放布尔位（老档读进来是 undefined，!!undefined === false，安全）。
         * prologue：2026 那个晚上看过没有；prologueSkipped：是不是跳着看的。 */
        flags: { prologue: false, prologueSkipped: false },
        stats: {
          blows: 0, rubs: 0, reseats: 0, slaps: 0, repairs: 0, boots: 0, plays: 0, buys: 0, days: 1,
          /* 抢救那几秒的收场次数：一下没滑 / 难看地收完 / 没收完就被堵在门口 */
          rescueClean: 0, rescueClose: 0, rescueFail: 0
        },
        settings: { crt: 1, scanline: true, bgm: 0.5, sfx: 0.8, mic: false, shake: true },
        album: []                // 解锁的「回忆」条目
      };
    },

    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) {
          /* 改名之前的老档：读出来，按新键存一份，老键原样留着 */
          raw = localStorage.getItem(OLD_KEY);
          if (raw) { try { localStorage.setItem(KEY, raw); } catch (e2) {} }
        }
        if (raw) {
          var d = JSON.parse(raw);
          /* 判定必须放宽到「只要是个带版本号的档就收」：
           *   - 老档（v === 1）要能读进来再迁移，不能静默开新档；
           *   - 比当前版本更新的档（玩家用新版存过又退回老版）也不清，
           *     merge 会保证结构完整，多出来的键原样留着。 */
          if (d && typeof d.v === 'number' && d.v >= 1) {
            /* 补齐新增字段，防止旧档缺键 */
            var base = this.def();
            var from = d.v;
            this.d = this.merge(base, d);
            this.migrate(from);
            return this.d;
          }
        }
      } catch (e) { /* 隐私模式或损坏存档：直接开新档 */ }
      this.d = this.def();
      return this.d;
    },

    /* 版本迁移。
     * merge() 已经负责「补字段」，这里只负责「补语义」——那些光靠默认值
     * 说不通的东西（老档里的钱是哪来的、这个夏天他过得怎么样）。
     * 往后加版本就继续往下串 if (from < 3) {...}，不要写成 if/else。 */
    migrate: function (from) {
      var d = this.d, dirty = false;

      if (from < 2) {
        var st = d.story;
        /* 借来的那台机器：老档里没有这件事，一律按「是借的、开学前要还」补上 */
        st.lent = true;
        st.dueDay = SB.Time && SB.Time.summerDayCount ? SB.Time.summerDayCount : 48;
        /* 老档的开场早就播过了，不能再拿一段 intro 拦他；
         * told 留 false，让客厅用一句话把设定补上，说完就置 true。 */
        st.told = false;
        st.legacyNote = true;
        st.ownConsole = !!(d.owned && d.owned.console2);
        if (st.ownConsole && !st.ownDay) st.ownDay = d.day;
        /* 老档没记过账。手上的钱当成「以前攒下的」记进总数，
         * 免得心愿单一打开显示「这个夏天一共进账 ￥0.0」。 */
        if (!st.ledger.total) {
          st.ledger.total = d.money || 0;
          st.ledger.legacy = true;
        }
        st.ledger.day = 0; st.ledger.today = 0; st.ledger.src = {};
        /* 心情按他这个夏天实际过得怎么样估一个初值，而不是一律给 60 */
        st.mood = SB.clamp(Math.round(60 - (d.caught || 0) * 5 + ((d.momTrust || 50) - 50) * 0.3), 5, 95);
        st.playsMark = (d.stats && d.stats.plays) || 0;
        d.v = 2;
        dirty = true;
      }

      if (from < 3) {
        /* 序章是「这个夏天怎么开始的」。老档的夏天早就开始了，
         * 半路给他插四分钟 2026 年的加班夜等于打断进度 ——
         * 一律记成「看过」，想看的从回忆册第一条重看。 */
        d.flags.prologue = true;
        d.v = 3;
        dirty = true;
      }

      if (from < 4) {
        /* 主动家务：老档没有这张表。merge() 已经把默认值补进来了，
         * 这里只把「这份记录属于哪一天」钉到今天 —— 否则 day 是 0，
         * 跟当前天不等，第一次问它就会被当成隔天记录清一遍，
         * 结果没差别，但白写一次盘。owed 一律按 0（没人欠他钱）。 */
        if (!d.chores) d.chores = { day: 0, done: {}, slots: {}, owed: 0, owedSrc: '' };
        d.chores.day = d.day;
        d.chores.done = {};
        d.chores.slots = {};
        d.chores.owed = 0;
        d.chores.owedSrc = '';
        d.v = 4;
        dirty = true;
      }

      /* 迁移完立刻落盘，别让每次开机都重跑一遍 */
      if (dirty) this.save();
      return this.d;
    },

    merge: function (base, saved) {
      var out = Array.isArray(base) ? [] : {};
      var k;
      for (k in base) {
        if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
        if (saved && Object.prototype.hasOwnProperty.call(saved, k)) {
          if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            out[k] = this.merge(base[k], saved[k]);
          } else {
            out[k] = saved[k];
          }
        } else {
          out[k] = base[k];
        }
      }
      /* 保留存档里多出来的键（比如新加的卡带 id）*/
      if (saved) for (k in saved) if (!(k in out)) out[k] = saved[k];
      return out;
    },

    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) {}
    },

    reset: function () {
      this.d = this.def();
      this.save();
      return this.d;
    },

    /* 本机上是否已经有过一个夏天 */
    exists: function () {
      try { return !!(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)); } catch (e) { return false; }
    },

    wipe: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) {}
    },

    /* ---------- 便捷读写 ---------- */
    cart: function (id) { return this.d.carts[id]; },

    ownedCarts: function () {
      var out = [];
      SB.CARTS.forEach(function (c) {
        var s = SB.Save.d.carts[c.id];
        if (s.owned || s.borrowed > 0) out.push(c);
      });
      return out;
    },

    playableOwned: function () {
      return this.ownedCarts().filter(function (c) {
        var s = SB.Save.d.carts[c.id];
        return !s.dead;
      });
    },

    has: function (goodId) { return !!this.d.owned[goodId]; },

    addMoney: function (v) {
      this.d.money = Math.round((this.d.money + v) * 10) / 10;
      if (this.d.money < 0) this.d.money = 0;
      this.save();
    },

    unlockAlbum: function (id, title, text) {
      if (this.d.album.some(function (a) { return a.id === id; })) return false;
      this.d.album.push({ id: id, title: title, text: text, day: this.d.day });
      this.save();
      return true;
    }
  };

})(window.SB);
