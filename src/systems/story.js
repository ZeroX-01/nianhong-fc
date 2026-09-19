/* 剧情系统：心情、账本、目标、章节、结局变体。
 *
 * 这一层只做两件事：算和记。它不画任何东西，也不认识任何场景——
 * 场景问它「现在心情是哪个词」「离目标还差多少」，它答；
 * 谁挣了钱、谁被抓了、谁通关了，来这里报一声，它记。
 *
 * 全部状态落在 SB.Save.d.story（见 save.js 的 def()）。
 * 数值和对象一律不进 flags：flags 默认是 {}，老档读出来会是 undefined。 */
(function (SB) {
  'use strict';

  function st() {
    var d = SB.Save.d;
    /* 极少数路径（测试直接塞存档）可能没有 story，兜一个空壳，别让整台机器炸 */
    if (!d.story) d.story = { mood: 60, ledger: { day: 0, today: 0, total: 0, saved: 0, src: {} } };
    if (!d.story.ledger) d.story.ledger = { day: 0, today: 0, total: 0, saved: 0, src: {} };
    if (!d.story.ledger.src) d.story.ledger.src = {};
    return d.story;
  }

  function r1(v) { return Math.round(v * 10) / 10; }

  SB.Story = {

    state: st,

    /* ---------------------------------------------------------------- 心情
     * 不是资源，不消耗，不阻塞任何操作。它只是这个夏天的晴雨表，
     * 最后进结局判定。呈现上全场只以一个词的形式出现。 */
    mood: function () { return SB.clamp(Math.round(st().mood), 0, 100); },

    moodBand: function () {
      var m = this.mood(), list = SB.STORY.moodBands, i;
      for (i = 0; i < list.length; i++) if (m >= list[i].min) return list[i];
      return list[list.length - 1];
    },

    moodWord: function () { return this.moodBand().word; },

    /* why 既是原因也是分值的键（见 SB.STORY.moodDelta）。
     * 也允许直接传数字，方便调试。 */
    addMood: function (v, why) {
      var s = st(), n;
      if (typeof v === 'string') { why = v; n = SB.STORY.moodDelta[v] || 0; }
      else { n = v || 0; if (why && SB.STORY.moodDelta[why] !== undefined && v === undefined) n = SB.STORY.moodDelta[why]; }
      if (!n) return this.mood();
      s.mood = SB.clamp(Math.round((s.mood || 0) + n), 0, 100);
      SB.Save.save();
      return this.mood();
    },

    /* ---------------------------------------------------------------- 账本
     * 赚钱渠道以前是隐形的：钱多了一毛，玩家不知道是哪儿来的。
     * 所有进账都走这里，心愿单照着念。 */
    earn: function (v, src) {
      v = r1(v || 0);
      if (v <= 0) return 0;
      var s = st(), lg = s.ledger, day = SB.Save.d.day;
      if (lg.day !== day) { lg.day = day; lg.today = 0; lg.src = {}; }
      var key = SB.STORY.ledgerNames[src] ? src : 'other';
      lg.today = r1(lg.today + v);
      lg.total = r1(lg.total + v);
      lg.src[key] = r1((lg.src[key] || 0) + v);
      SB.Save.addMoney(v);          // addMoney 自己会 save
      return v;
    },

    /* 砍价省下来的差价。它不是进账，但是「会过日子」的战果，单独记一笔。 */
    saveUp: function (v) {
      v = r1(v || 0);
      if (v <= 0) return 0;
      var lg = st().ledger;
      lg.saved = r1((lg.saved || 0) + v);
      SB.Save.save();
      return v;
    },

    /* 今天的进账明细，按金额从大到小。返回 [{name, v}] */
    todayRows: function () {
      var lg = st().ledger, out = [], k;
      if (lg.day !== SB.Save.d.day) return out;
      for (k in lg.src) {
        if (!Object.prototype.hasOwnProperty.call(lg.src, k)) continue;
        out.push({ name: SB.STORY.ledgerNames[k] || SB.STORY.ledgerNames.other, v: lg.src[k] });
      }
      out.sort(function (a, b) { return b.v - a.v; });
      return out;
    },

    todayTotal: function () {
      var lg = st().ledger;
      return lg.day === SB.Save.d.day ? r1(lg.today) : 0;
    },

    /* ---------------------------------------------------------------- 目标 */
    consoleGood: function () { return SB.GOODS_BY_ID[SB.STORY.CONSOLE_ID] || null; },

    goalPrice: function () {
      var g = this.consoleGood();
      return g ? SB.Econ.priceOfGood(g) : SB.STORY.CONSOLE_PRICE;
    },

    ownConsole: function () { return !!st().ownConsole; },

    /* 离目标还差多少。买到了就是 0。 */
    goalGap: function () {
      if (this.ownConsole()) return 0;
      return Math.max(0, r1(this.goalPrice() - SB.Save.d.money));
    },

    /* 买下来了。价格由集市传进来（当天的浮动价）。 */
    gotConsole: function (price) {
      var s = st();
      if (s.ownConsole) return false;
      s.ownConsole = true;
      s.ownDay = SB.Save.d.day;
      s.ownPrice = r1(price || SB.STORY.CONSOLE_PRICE);
      this.addMood('ownConsole');
      SB.Save.unlockAlbum('own_console', '自己的那一台',
        '四十五块，二手，壳上一道划痕。开学那天走的是柜子上那台，不是它。');
      SB.Save.save();
      return true;
    },

    /* ---------------------------------------------------------------- 借来的那台 */
    lent: function () { return !!st().lent; },
    dueDay: function () { return st().dueDay || SB.Time.summerDayCount; },
    /* 还机（= 开学）还有几天 */
    dueLeft: function () { return Math.max(0, this.dueDay() - SB.Save.d.day); },

    /* 「这台是借的」这件事讲过没。开场播过就算讲过。 */
    told: function () { return !!st().told; },
    markTold: function () { st().told = true; SB.Save.save(); },
    /* 老档读进来时标的位：要用一句短的把设定补上，而不是重播一段开场 */
    needLateNote: function () { return !st().told && !!st().legacyNote; },

    /* ---------------------------------------------------------------- 章节
     * 纯读，不写任何状态。只在挂历和心愿单上露一行。 */
    chapterNow: function () {
      var day = SB.Save.d.day, list = SB.STORY.chapters, i;
      for (i = 0; i < list.length; i++) {
        if (day >= list[i].from && day <= list[i].to) return list[i];
      }
      return list[list.length - 1];
    },

    chapterLine: function () {
      var c = this.chapterNow();
      return '第' + '一二三四五'.charAt(c.no - 1) + '章 · ' + c.title;
    },

    /* ---------------------------------------------------------------- 每天结算
     * 挂在 SB.Time.sleep() 里，rollEvent() 之前。 */
    dailyTick: function () {
      var d = SB.Save.d, s = st(), plays = (d.stats && d.stats.plays) || 0;
      var out = { quiet: false, warm: false };

      if (s.moodDay !== d.day) {
        s.moodDay = d.day;
        /* 今天玩过没有？只写作业不玩，攒够天数就开始闷。 */
        if (plays <= (s.playsMark || 0)) s.quietDays = (s.quietDays || 0) + 1;
        else s.quietDays = 0;
        s.playsMark = plays;
        if (s.quietDays >= SB.STORY.QUIET_DAYS) {
          s.quietDays = 0;
          this.addMood('quiet');
          out.quiet = true;
        }
      }

      /* 跟妈妈和解：被她抓过，又把信任度挣回来了。一次性，涨得多。 */
      if (!d.flags.momWarm && d.caught > 0 && d.momTrust >= SB.STORY.WARM_TRUST) {
        d.flags.momWarm = true;
        this.addMood('momWarm');
        SB.Save.unlockAlbum('mom_warm', '她自己把电视打开了',
          '「玩吧。声音小点。」那一局你打得特别烂，一次也没回头看门。');
        out.warm = true;
      }

      SB.Save.save();
      return out;
    },

    /* ---------------------------------------------------------------- 结局 */
    endingBody: function () {
      var L = SB.L.story.endBody;
      return (this.ownConsole() ? L.own : L.lost).slice();
    },

    /* 三个轴：买到没有 × 妈妈关系 × 心情。自上而下命中即停。 */
    endingVariant: function () {
      var d = SB.Save.d, own = this.ownConsole(), trust = d.momTrust || 0, m = this.mood();
      if (own && (trust >= 65 || d.flags.momWarm)) return 'own_warm';
      if (own) return 'own_cold';
      if ((trust >= 65 || d.flags.momWarm) && m >= 50) return 'lost_warm';
      if (trust <= 35 || m <= 30 || (d.caught || 0) >= 5) return 'lost_cold';
      return 'default';
    },

    endingVariantLines: function () {
      var id = this.endingVariant();
      st().ending = id;
      SB.Save.d.flags.endingVariant = id;
      SB.Save.save();
      var L = SB.L.story.endVariant;
      return (L[id] || L['default']).slice();
    },

    endingTail: function () {
      var L = SB.L.story.endTail;
      return (this.ownConsole() ? L.own : L.lost).slice();
    },

    /* ---------------------------------------------------------------- 心愿单
     * 直接拿现成的 SB.UI.menu 当纸片用：信息行 disabled，最后一行才是按钮。
     * 这样 v1 的点阵菜单和 v2 的 DOM 菜单一个字都不用改就都有了。 */
    wishItems: function () {
      var d = SB.Save.d, L = SB.L.story.ledger, items = [];
      var rows = this.todayRows(), i;
      var gap = this.goalGap(), price = this.goalPrice();

      items.push({ label: '今天进账', sub: SB.money(this.todayTotal()), disabled: true });
      if (!rows.length) {
        items.push({ label: L.none, disabled: true });
        /* 玩家第一次打开账本时还没有流水，这里正好把规则讲清楚。
         * 有了实际进账以后改看明细，避免菜单超过 11 行。 */
        items.push({ label: '每天零花', sub: '睡一觉后 ￥0.5', disabled: true });
        /* 现在挣钱不只靠等：小方桌上那一项是玩家自己能按的。
         * 它排在「日常机会」前面 —— 能主动做的事要先说。 */
        items.push({ label: '帮家里干活', sub: '小方桌　刷碗·扫地·搬货', disabled: true });
        items.push({ label: '日常机会', sub: '瓶子·废纸·跑腿', disabled: true });
      }
      for (i = 0; i < rows.length && i < 3; i++) {
        items.push({ label: '　' + rows[i].name, sub: SB.money(rows[i].v), disabled: true });
      }
      items.push({ label: '兜里一共', sub: SB.money(d.money), disabled: true });
      if (st().ledger.saved > 0) {
        items.push({ label: '砍价省下', sub: SB.money(st().ledger.saved), disabled: true });
      }
      items.push({
        label: '二手主机 ' + SB.money(price),
        sub: this.ownConsole() ? '买到了' : '还差 ' + SB.money(gap),
        disabled: true
      });
      items.push({
        label: this.ownConsole() ? '柜子上那台' : '柜子上那台是借的',
        sub: '还 ' + this.dueLeft() + ' 天',
        disabled: true
      });
      items.push({ label: '心情', sub: this.moodWord(), disabled: true });
      items.push({ label: this.chapterLine(), disabled: true });
      items.push({ label: L.close, value: 'x' });
      return items;
    }
  };

})(window.SB);
