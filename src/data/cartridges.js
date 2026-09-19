/* 12 张卡带 + 集市杂货的数据。
 * game 字段为 null 的卡带不是"没做完"，而是刻意还原那个年代盗版卡的真实体验：
 * 你花了半个月零花钱，插进去只有一个标题画面，或者玩到第二关就死机。 */
(function (SB) {
  'use strict';

  SB.CARTS = [
    {
      id: '01', name: '魂斗萝', game: 'contra', price: 22, rarity: 3,
      shell: '灰白', label: '两个光膀子的兵举着枪，背景是丛林',
      back: '背面用蓝色马克笔写着一个「强」字，不知道是谁的名字',
      desc: '横版跑打。三十条命的秘技传遍了整条街，但没人说得清到底怎么按。',
      pitch: '这个卡带！三十条命！按上上下下左右左右BA就有！我保证！',
      truth: '真卡。摊主难得没吹牛，就是没有三十条命。',
      startDirt: 55, fakeChance: 0.05
    },
    {
      id: '02', name: '铁甲坦克1990', game: 'tank', price: 18, rarity: 2,
      shell: '军绿', label: '一辆俯视的坦克压过砖墙',
      back: '边缘磨得发白，贴纸角上撕掉了一小块',
      desc: '守住老家那只鹰。双人模式里最容易吵架的一张卡。',
      pitch: '这张不用我说了吧，家家都有，我这张是原装的。',
      truth: '发小玩腻了塞给你的，壳上还有他家窗台的灰。',
      startDirt: 62, fakeChance: 0
    },
    {
      id: '03', name: '超级马里蘑', game: 'mario', price: 28, rarity: 4,
      shell: '红', label: '蓝天白云，一个戴红帽的小人顶砖块',
      back: '几乎全新，只有一道浅浅的指甲印',
      desc: '所有人都会哼那段旋律，但很少有人真的见过城堡。',
      pitch: '新到的！包装都没拆！你摸摸这个手感，跟别人那种能一样吗？',
      truth: '真卡，而且是这条街上品相最好的一张。贵有贵的道理。',
      startDirt: 18, fakeChance: 0.02
    },
    {
      id: '04', name: '拳霸98加强变态版', game: 'fight', price: 25, rarity: 3,
      shell: '蓝', label: '两个格斗小人对着一拳，中间炸开一团火',
      back: '贴纸上被人用圆珠笔加了两撇胡子',
      desc: '「加强变态版」这五个字是那个年代最有号召力的广告。',
      pitch: '变态版！招都能放！一拳半条血！不骗你！',
      truth: '真卡，只是「变态」的部分主要体现在电脑对手的手速上。',
      startDirt: 48, fakeChance: 0.08
    },
    {
      id: '05', name: '100万合1', game: 'multi', price: 12, rarity: 1,
      shell: '黄', label: '密密麻麻的小方格，中间一个巨大的「1000000」',
      back: '贴纸整个卷了边，露出下面另一张贴纸的一角',
      desc: '目录能翻到手指发酸，能玩的只有前三个，而且是同一个游戏换了颜色。',
      pitch: '一百万个游戏！一百万！你一辈子都玩不完！',
      truth: '你一辈子都玩不完，因为你会在第四个游戏那里放弃。',
      startDirt: 70, fakeChance: 0
    },
    {
      id: '06', name: '赤血要塞·汉化版', game: 'garble', price: 6, rarity: 1,
      shell: '深灰', label: '红色的要塞城墙和一辆吉普车',
      back: '被水泡过，贴纸的颜色晕成一片',
      desc: '汉化的意思是，所有汉字都变成了看不懂的方块。',
      pitch: '汉化的啊！中文的！小孩子看得懂！',
      truth: '汉化组大概只汉化了标题的前两个字。',
      startDirt: 80, fakeChance: 0.15
    },
    {
      id: '07', name: '方块大陆（无敌版）', game: 'blocks', price: 12, rarity: 2,
      shell: '紫', label: '四种颜色的方块拼成 L 和 T',
      back: '干净得可疑，像是刚从别的壳里换过来的',
      desc: '「无敌版」指的是你按加速键，它会更慢。',
      pitch: '无敌版！死不了的！你妈来了都能接着玩！',
      truth: '真卡。方块是真的方块，无敌是真的没有。',
      startDirt: 30, fakeChance: 0.05
    },
    {
      id: '08', name: '足球小子', game: null, price: 14, rarity: 2,
      shell: '亮绿', label: '绿色球场、一个足球、一个球门',
      back: '螺丝孔里有一颗螺丝是拧歪的',
      desc: '据说能用头把对方铲飞，但你从来没进去过。',
      pitch: '这张我告你，不光踢球，还能踢人！',
      truth: '插进去只有一个球场的标题画面，音乐循环了七遍，然后黑屏。',
      startDirt: 75, fakeChance: 0.3
    },
    {
      id: '09', name: '冒险蛋', game: null, price: 11, rarity: 2,
      shell: '米黄', label: '一棵棕榈树，一个踩着滑板的小人',
      back: '有人用小刀在壳上刻了一个歪歪扭扭的「王」',
      desc: '原名到底是「冒险岛」还是「冒险蛋」，这条街上有两种说法。',
      pitch: '冒险蛋！滑板那个！蹦得特别高！',
      truth: '标题画面上的字确实是「蛋」。滑板小人一动不动。',
      startDirt: 66, fakeChance: 0.25
    },
    {
      id: '10', name: '雪人哥俩', game: null, price: 9, rarity: 1,
      shell: '浅蓝', label: '雪山下站着两个雪人',
      back: '很新，但金手指黑得不像话',
      desc: '双人合作，据说通关会下一场雪。',
      pitch: '两个人玩的！合作的！兄弟感情就靠这张卡了！',
      truth: '两个雪人在标题画面上站着，站了很久，一直站着。',
      startDirt: 85, fakeChance: 0.2
    },
    {
      id: '11', name: '影子传书', game: null, price: 16, rarity: 3,
      shell: '深棕', label: '一个忍者剪影，背后一轮月亮',
      back: '磨损严重，边角都圆了，像被很多人玩过',
      desc: '卡面上那两个字本该是「传说」，印出来却成了「传书」。',
      pitch: '忍者那个！能变四个影子的！这张可难找了！',
      truth: '这张卡确实被很多人玩过，也确实早就坏了。',
      startDirt: 88, fakeChance: 0.35
    },
    {
      id: '12', name: '西游记（未完成版）', game: 'crash', price: 4, rarity: 1,
      shell: '亮红', label: '金箍棒、一团云、一个猴头',
      back: '贴纸被水泡过，摊主说这叫「做旧」',
      desc: '四块钱。摊主说四块钱你还想要什么。',
      pitch: '四块！四块钱你还挑什么！拿走拿走！',
      truth: '第一关是真的能玩的，玩到第二关会死机成一屏彩条。',
      startDirt: 72, fakeChance: 0
    }
  ];

  SB.CART_BY_ID = {};
  SB.CARTS.forEach(function (c) { SB.CART_BY_ID[c.id] = c; });

  /* 集市杂货。
   * console2 是这个夏天的目标：家里那台是借的，开学要还，
   * 只有它是「买下来就不用还」的那一台。价格标了 vary，
   * 会跟卡带一样按日期上下浮动（见 SB.Econ.priceOfGood）。 */
  SB.GOODS = [
    {
      id: 'swab', name: '卡带清洁棉签', price: 3, stack: true,
      desc: '蘸一点酒精擦金手指，比哈气管用，但用一次少一支。',
      pitch: '专业的！比你哈气强一百倍！'
    },
    {
      id: 'avline', name: '像样点的 AV 线', price: 5, once: true,
      desc: '换掉家里那根接触不良的旧线，所有卡带的故障率都降一档。',
      pitch: '你家那根线都氧化成什么样了？换一根，画面立马干净。'
    },
    {
      id: 'pad2', name: '山寨 2P 手柄', price: 8, once: true,
      desc: '按键手感偏硬，但总算能在家里凑成两个人玩。',
      pitch: '手感一模一样！你闭着眼都摸不出来！'
    },
    {
      id: 'mag', name: '《电子游戏时代》', price: 10, once: true,
      desc: '一本翻烂了的杂志。上面有秘技，玩小游戏时会显示提示。',
      pitch: '秘技全在这里头！三十条命那个也在！第 42 页！'
    },
    {
      id: 'popsicle', name: '老冰棍', price: 0.5, stack: true,
      desc: '五毛钱一根。吃了会开心一点，开心一点手就稳一点。',
      pitch: '天这么热，先来一根？'
    },
    {
      id: 'fan', name: '二手小台扇', price: 15, once: true,
      desc: '插上以后客厅凉快一点，主机也不容易热到死机。',
      pitch: '这天气不买个扇子？你那个游戏机自己都受不了。'
    },
    {
      id: 'console2', name: '二手小旋风主机', price: 45, once: true, vary: true,
      desc: '壳上一道划痕，卡槽有点松。跟你家那台一模一样——区别是这台买下来就是你的。',
      pitch: '现在没人要这个了，四十来块你抱走。你家那台不是借的吗？'
    }
  ];

  SB.GOODS_BY_ID = {};
  SB.GOODS.forEach(function (g) { SB.GOODS_BY_ID[g.id] = g; });

  /* 「100 万合 1」的假目录：前 3 个能进，都是同一个游戏换配色 */
  SB.MULTI_MENU = [
    { n: 1, name: '超级坦克', ok: true, skin: 0 },
    { n: 2, name: '超级坦克 II', ok: true, skin: 1 },
    { n: 3, name: '超级坦克 III 最终版', ok: true, skin: 2 },
    { n: 4, name: '沙漠风暴', ok: false },
    { n: 5, name: '沙漠风暴 II', ok: false },
    { n: 6, name: '装甲雄狮', ok: false },
    { n: 7, name: '钢铁洪流', ok: false },
    { n: 8, name: '超级坦克（新）', ok: false },
    { n: 9, name: '超级坦克（真）', ok: false },
    { n: 10, name: '超级坦克（最新）', ok: false }
  ];

})(window.SB);
