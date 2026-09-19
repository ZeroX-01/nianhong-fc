/* 剧情结构（不含长文本）。
 *
 * 这个夏天的北极星：客厅里那台小旋风是你爸单位同事寄放的，开学前必须还回去。
 * 想留下一台自己的，就得在 48 天里精打细算，去集市把那台 45 块的二手主机抱回来。
 *
 * 文案在 storyLines.js，求值与推进在 systems/story.js。
 * 这里只放表和常量：改一个数字不用碰逻辑，改一句话不用碰结构。 */
(function (SB) {
  'use strict';

  SB.STORY = {
    /* 集市上那台二手主机，同时也是 SB.GOODS 里的商品 id */
    CONSOLE_ID: 'console2',
    CONSOLE_PRICE: 45,

    /* 章节只做三件事：挂历上多一行、心愿单上多一行、结局里被提一次。
     * 不是关卡，不阻塞任何推进；天数区间纯粹用于显示。 */
    chapters: [
      { id: 'ch1', no: 1, title: '这台机器不是你的', from: 1,  to: 5 },
      { id: 'ch2', no: 2, title: '一块五能买什么',   from: 6,  to: 15 },
      { id: 'ch3', no: 3, title: '哈两口气',         from: 16, to: 27 },
      { id: 'ch4', no: 4, title: '大衣柜最上层',     from: 28, to: 38 },
      { id: 'ch5', no: 5, title: '开学前还回去',     from: 39, to: 99 }
    ],

    /* 心情分档。从上往下第一个够 min 的就是它。
     * 心情不做资源条，全场只以这一个词的形式出现。 */
    moodBands: [
      { min: 85, word: '美得很',       tint: 'good' },
      { min: 68, word: '挺得劲',       tint: 'good' },
      { min: 45, word: '不咸不淡',     tint: 'calm' },
      { min: 25, word: '有点闷',       tint: 'warn' },
      { min: 0,  word: '一点劲都没有', tint: 'bad'  }
    ],

    /* 心情的加减。全部走 SB.Story.addMood(why)，方便一眼看清哪件事值几分。 */
    moodDelta: {
      caught: -14,      // 被抓（电视还开着）
      caughtCart: -8,   // 被抓（只是卡带没拔）
      escape: 3,        // 蒙过去了
      cleared: 12,      // 通关一张卡
      buyCart: 6,       // 买到一张卡
      dead: -10,        // 一张卡彻底废了
      quiet: -8,        // 连着几天只写作业不玩
      momWarm: 22,      // 跟妈妈和解
      ownConsole: 25    // 买下自己那台
    },

    /* 连着几天只写作业不玩，就开始闷 */
    QUIET_DAYS: 3,
    /* 和解需要的信任度（且被抓过至少一次，不然「和解」没有对象） */
    WARM_TRUST: 78,

    /* 账本上进账来源的名字。键对应 SB.L.events 的 id，另加一个 allowance。 */
    ledgerNames: {
      allowance: '零花钱',
      dish:      '刷碗',
      sweep:     '扫地',
      trash_out: '倒垃圾',
      trash:     '卖废品',
      bottle:    '退酒瓶',
      errand:    '帮人搬货',
      books:     '卖旧课本',
      soy:       '打酱油找零',
      find:      '沙发缝里摸到的',
      exam:      '考得还行',
      other:     '别的'
    },

    /* 结局变体。自上而下命中即停，条件全部读现有字段。 */
    endings: [
      { id: 'own_warm', title: '这台不用还' },
      { id: 'own_cold', title: '四十五块' },
      { id: 'lost_warm', title: '空了一块' },
      { id: 'lost_cold', title: '大衣柜最上层' },
      { id: 'default', title: '你还记得怎么哈那两口气' }
    ],

    /* ---------------------------------------------------------------- 序章 */

    /* 序章那一夜的日期条。现实层是 2026，梦里才是 2004 —— 这两个数字
     * 全场只在这里和 timeSystem.js 各写一次，别在文案里再写第二遍。 */
    PRO_SLUG: '2026 年 7 月 3 日',
    PRO_CLOCK: '23:47',
    PRO_PLACE: '公司　18 层',
    /* 梦里那一天。和 timeSystem.js 的 START 是同一天，改一个必须改另一个。 */
    DREAM_SLUG: '2004 年 7 月 15 日',
    /* S-05 楼下等车：等待条走满要多久。软件上写的是 14 分钟，玩家等 18 秒。 */
    PRO_WAIT_MS: 18000,

    /* 12 个分镜。kind 只有三种：
     *   wait   一行行念旁白，每行念完都停下来等玩家按 A / 点屏幕（不自动翻页），
     *          最后一行点掉之后进下一镜。holdMs 是早先自动播放时代的遗留字段，
     *          现在不再参与节奏，留着只是为了别动数据表。
     *   menu   出一个菜单；keepOpen 的菜单选完会自己端回来，直到选中带 next 的那项
     *   dialog 底部对话框，点完进下一镜
     * art 是这一镜画什么（PrologueScene 里的 ART 表），缺省沿用上一镜的画面。
     * skippable=false 的两镜（眨眼与色调迁移）按下 B 也不走 —— 一共 6 秒，
     * 这 6 秒是「2026 变成 2004」的全部交代，跳掉就没有故事了。 */
    prologue: [
      { id: 's01', kind: 'wait', art: 'office', lines: 's01', holdMs: 900, place: '公司　18 层' },
      { id: 's02', kind: 'menu', art: 'monitor', lines: 's02', place: '公司　18 层',
        options: [{ label: 's02opt', say: 's02say', next: true }] },
      { id: 's03', kind: 'wait', art: 'blackscreen', lines: 's03', holdMs: 700, place: '公司　18 层' },
      { id: 's04', kind: 'menu', art: 'phone_call', lines: 's04', place: '电梯',
        options: [
          { label: 's04a', say: 's04aSay', next: true },
          { label: 's04b', say: 's04bSay', next: true }
        ] },
      { id: 's05', kind: 'menu', art: 'street', lines: 's05', keepOpen: true, place: '楼下　雨',
        gate: true, gateLabel: 's05go', gateSay: 's05goSay',
        options: [
          { label: 's05a', say: 's05aSay' },
          { label: 's05b', say: 's05bSay' },
          { label: 's05c', say: 's05cSay' }
        ] },
      { id: 's06', kind: 'wait', art: 'taxi', lines: 's06', holdMs: 800, place: '出租车' },
      { id: 's07', kind: 'wait', art: 'radio', lines: 's07', holdMs: 900, place: '出租车' },
      { id: 's08', kind: 'menu', art: 'feed', lines: 's08', keepOpen: true, place: '出租车',
        options: [
          { label: 's08a', say: 's08aSay', once: true },
          { label: 's08b', say: 's08bSay', once: true },
          { label: 's08c', say: 's08cSay', once: true },
          { label: 's08d', next: true }
        ] },
      { id: 's09', kind: 'dialog', art: 'post', lines: 's09', who: 's09who', place: '出租车' },
      { id: 's10', kind: 'wait', art: 'blink', lines: 's10', holdMs: 500, skippable: false, place: '出租车' },
      { id: 's11', kind: 'wait', art: 'warm', lines: 's11', holdMs: 900, skippable: false, dream: true },
      { id: 's12', kind: 'wait', art: 'warm', lines: 's12', holdMs: 0, last: true, dream: true }
    ]
  };

})(window.SB);
