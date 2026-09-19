/* 家里的活儿，和谁给你钱。
 *
 * 这一屏要解决的是 v1 最大的一个空洞：钱只会「发生」在你身上 ——
 * 睡一觉多五毛，隔几天随机撞上一次卖瓶子。玩家想多挣一点，无事可做。
 * 现在客厅的小方桌上多一项「帮家里干活」，你可以自己去干。
 *
 * 但它必须像 2004 年那样有规矩，不能变成一个「点一下加两毛」的按钮：
 *   * 碗只在饭点之后有 —— 上午（早饭后）、中午（午饭后）、晚上（晚饭后），
 *     一顿饭一次，所以一天顶多三次，这就是「不能超过三次」的由来。
 *   * 地只在白天扫 —— 天黑了看不见灰，扫了也是白扫。
 *   * 垃圾要等傍晚那趟车 —— 早倒出去只是堆在路口。
 *   * 小卖部的货只在开门的时候搬。
 * 每样活都要花一格精力，也就是要花掉你半天。挣钱和玩，是同一格精力的两种花法。
 *
 * 报酬写死不随机：妈妈给的是「刷一次碗两毛」这种固定规矩，不是抽奖。
 * 数字全部落在这张表里，改平衡不用碰 systems/chore.js。
 *
 * 台词在 storyLines.js 的 SB.L.pay，画面在 anim/payAnim.js。 */
(function (SB) {
  'use strict';

  /* slots 填 SB.SLOTS 的 key。max 是一天的次数上限；
   * 需要「一个时段只能干一次」的（刷碗）靠 perSlot 打开。 */
  SB.CHORES = [
    {
      id: 'dish', name: '刷碗', ap: 1, pay: 0.2, payer: 'mom', src: 'dish',
      slots: ['morning', 'noon', 'night'], max: 3, perSlot: 1, trust: 2,
      sub: '一顿饭后刷一次',
      no: '现在没碗可刷。得等下一顿饭吃完。',
      noSlot: '这顿的碗刚才就刷了。'
    },
    {
      id: 'sweep', name: '扫地', ap: 1, pay: 0.3, payer: 'mom', src: 'sweep',
      slots: ['morning', 'after'], max: 1, perSlot: 1, trust: 3,
      sub: '趁白天，看得见灰',
      no: '天暗下来了，扫也扫不干净。明天白天再说。',
      noSlot: '今天已经扫过一遍了。'
    },
    {
      id: 'trash_out', name: '倒垃圾', ap: 1, pay: 0.1, payer: 'mom', src: 'trash_out',
      slots: ['dusk', 'night'], max: 1, perSlot: 1, trust: 1,
      sub: '等傍晚那趟车',
      no: '收垃圾的车还没来。这会儿倒出去也是堆在路口。',
      noSlot: '今天的垃圾已经拎下去了。'
    },
    {
      id: 'haul', name: '帮小卖部搬货', ap: 1, pay: 0.5, payer: 'shop', src: 'errand',
      slots: ['morning', 'after', 'dusk'], max: 1, perSlot: 1, trust: 0,
      sub: '一箱汽水一箱汽水地往里搬',
      no: '小卖部这个点上着门板。',
      noSlot: '今天那两箱汽水已经搬完了。'
    }
  ];

  SB.CHORE_BY_ID = {};
  SB.CHORES.forEach(function (c) { SB.CHORE_BY_ID[c.id] = c; });

  /* ---------------------------------------------------------------- 谁给你钱
   * 钱不会从天上掉下来，总是某个人从兜里摸出来递给你的。这张表就是
   * 「这笔进账该谁掏钱」。tex 是他那一屏特写的贴图（pay_*.png），
   * n 是帧数，必须和 tools/gen_pay_anim.py 里的 PAYERS 对上。 */
  SB.PAYERS = {
    mom: {
      id: 'mom', tex: 'pay_mom', n: 5, who: '妈',
      place: '厨房门口', sfx: 'money_get'
    },
    laohan: {
      id: 'laohan', tex: 'pay_laohan', n: 5, who: '收废品的老汉',
      place: '院门外', sfx: 'coin_get'
    },
    shop: {
      id: 'shop', tex: 'pay_shop', n: 5, who: '小卖部老板',
      place: '小卖部柜台', sfx: 'coin_get'
    }
  };

  /* 账本来源 -> 付款方。查不到的（比如沙发缝里摸到的钱）没有付款方，
   * 不走收钱特写 —— 那笔钱本来就没人递给你。
   * 每天的零花钱（allowance）也刻意不在表里：它在睡觉那一刻发，
   * 每天早上拦一屏特写，第三天就成了负担。 */
  SB.PAY_BY_SRC = {
    dish: 'mom',
    sweep: 'mom',
    trash_out: 'mom',
    soy: 'mom',
    exam: 'mom',
    trash: 'laohan',
    bottle: 'laohan',
    books: 'laohan',
    errand: 'shop'
  };

  /* 找零用的面额（元）。数钱那一步按这张表把金额拆成几张几枚，
   * 大面额在前。2004 年的村里最小就是一毛。 */
  SB.PAY_DENOM = [10, 5, 2, 1, 0.5, 0.2, 0.1];

})(window.SB);
