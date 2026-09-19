/* 集市经济：每日价格浮动、砍价、假卡判定。 */
(function (SB) {
  'use strict';

  SB.Econ = {
    /* 今天这张卡的标价：以基准价为轴，按日期做确定性浮动（同一天进出集市价格不变） */
    priceOf: function (cart) {
      var day = SB.Save.d.day;
      /* 用简单的整数散列造出稳定的伪随机 */
      var h = (day * 73 + parseInt(cart.id, 10) * 149) % 100;
      var swing = (h / 100 - 0.5) * 0.34;          // ±17%
      var p = cart.price * (1 + swing);
      /* 热门卡（rarity 高）会被摊主加价 */
      p *= 1 + (cart.rarity - 2) * 0.04;
      return Math.max(2, Math.round(p * 10) / 10);
    },

    /* 摊主今天摆出来的货：编号散列决定，保证同一天进两次看到的是同一批 */
    stockToday: function () {
      var day = SB.Save.d.day, out = [];
      SB.CARTS.forEach(function (c) {
        var st = SB.Save.d.carts[c.id];
        if (st.owned) return;
        var h = (day * 31 + parseInt(c.id, 10) * 17) % 10;
        /* 稀有卡更少出现 */
        var need = c.rarity >= 4 ? 7 : (c.rarity === 3 ? 5 : 2);
        if (h >= need) out.push(c);
      });
      /* 至少摆两张，不然玩家白跑一趟 */
      if (out.length < 2) {
        SB.CARTS.forEach(function (c) {
          if (out.length >= 2) return;
          if (!SB.Save.d.carts[c.id].owned && out.indexOf(c) < 0) out.push(c);
        });
      }
      return out;
    },

    /* 砍价：摊主有一个「底价」和一条耐心。
     * 出价 >= 底价 → 成交；接近底价 → 讨价还价；太低 → 掉耐心。 */
    newHaggle: function (cart) {
      var ask = this.priceOf(cart);
      /* 摊主的底价：标价的 72%~88%，稀有卡让得少 */
      var floorRate = 0.72 + (cart.rarity - 1) * 0.035 + SB.rnd(0, 0.06);
      return {
        cart: cart,
        ask: ask,
        floor: Math.round(ask * floorRate * 10) / 10,
        patience: 3,
        offers: [],
        done: false,
        deal: 0
      };
    },

    offer: function (h, v) {
      h.offers.push(v);
      if (v >= h.floor) {
        h.done = true; h.deal = v;
        return { ok: true, msg: SB.line(SB.L.market.haggleOk) };
      }
      /* 差一点点：摊主反过来要一个中间价 */
      if (v >= h.floor * 0.93) {
        h.patience--;
        var counter = Math.round(((v + h.floor) / 2) * 10) / 10;
        h.counter = counter;
        if (h.patience <= 0) {
          h.done = true; h.deal = 0;
          return { ok: false, msg: SB.line(SB.L.market.haggleAngry), angry: true };
        }
        return { ok: false, msg: '「' + SB.money(counter) + '，一分不能少了。」', counter: counter };
      }
      h.patience -= 2;
      if (h.patience <= 0) {
        h.done = true; h.deal = 0;
        return { ok: false, msg: SB.line(SB.L.market.haggleAngry), angry: true };
      }
      return { ok: false, msg: SB.line(SB.L.market.haggleNo) };
    },

    /* 杂货今天的价钱。
     * 一口价的东西（棉签、冰棍、AV 线……）价格表写死，一分不浮动。
     * 只有标了 vary 的大件（那台二手主机）跟卡带一样按日期做确定性浮动，
     * 用的是同一套整数散列，所以同一天进两次集市看到的是同一个数。 */
    priceOfGood: function (good) {
      if (!good) return 0;
      if (!good.vary) return good.price;
      var day = SB.Save.d.day;
      var h = (day * 97 + 41) % 100;
      var swing = (h / 100 - 0.5) * 0.18;          // ±9%，45 元大概在 41–49 之间晃
      return Math.max(1, Math.round(good.price * (1 + swing) * 10) / 10);
    },

    /* 成交 */
    buyCart: function (cart, price) {
      var s = SB.Save.d;
      if (s.money < price) return { ok: false, why: 'poor' };
      SB.Save.addMoney(-price);
      var st = s.carts[cart.id];
      st.owned = true;
      st.dirt = SB.clamp(cart.startDirt + SB.rndInt(-8, 12), 10, 96);
      st.wear = SB.rndInt(0, Math.round(cart.startDirt / 8));
      /* 假卡：外观越旧、越便宜的卡越容易翻车 */
      st.fake = SB.chance(cart.fakeChance);
      if (st.fake) { st.dirt = SB.clamp(st.dirt + 20, 30, 99); }
      s.stats.buys++;
      SB.Save.save();
      return { ok: true, fake: st.fake };
    },

    /* 砍下来的差价也算一笔「攒到的钱」，记在账本上给玩家看。
     * 它不加钱，只是让「会砍价」这件事有个去处。 */
    noteHaggle: function (ask, deal) {
      var save = Math.round((ask - deal) * 10) / 10;
      if (save > 0 && SB.Story) SB.Story.saveUp(save);
      return save;
    },

    buyGood: function (good, price) {
      var s = SB.Save.d;
      if (price === undefined || price === null) price = this.priceOfGood(good);
      if (s.money < price) return { ok: false, why: 'poor' };
      if (good.once && s.owned[good.id]) return { ok: false, why: 'had' };
      SB.Save.addMoney(-price);
      if (good.once) s.owned[good.id] = true;
      else s.goods[good.id] = (s.goods[good.id] || 0) + 1;
      /* 那台二手主机不只是件商品，它是这个夏天的目标，得让剧情层知道 */
      if (SB.STORY && good.id === SB.STORY.CONSOLE_ID && SB.Story) SB.Story.gotConsole(price);
      SB.Save.save();
      return { ok: true, price: price };
    }
  };

})(window.SB);
