/* 电视画面里的按键指引。
 *
 * 要解决的事情只有一件：卡带标题一过、游戏真的能动了，第一次玩的人不知道该按什么。
 * 以前这件事全靠玩家自己乱按，或者靠买了《电子游戏时代》才有的那个秘技角落。
 *
 * 做法：
 *   1. 小游戏「真正可操作」的那一刻，在电视画面正中盖一张半透明的按键卡，3.5 秒后自己淡掉，
 *      按任意键或点一下画面立刻收掉 —— 它绝不拦着人玩；
 *   2. 卡收掉以后，画面角上留一条很淡的常驻键位条，位置一张卡一张卡挑过，
 *      不压 HUD、不压血条、不压 Boss 血槽、不压杂志秘技那几行；
 *   3. 暂停菜单里有「看按键说明」，随时能把那张卡再叫出来。
 *
 * 两条硬规矩：
 *   - 键名一个都不写死。全部现算 SB.Input.keyName() / tip()，
 *     所以键盘、屏幕手柄、实体手柄、单人、同屏双打，说的都是玩家手上那一套。
 *   - 表里的每一条都是照着 src/games/*.js 里真正读输入的那几行抄出来的，
 *     一行玩法逻辑都没动。改了玩法就回来改这张表。 */
(function (SB) {
  'use strict';

  var W = 360;                 // 电视画面区内部宽（GameBase 的坐标系）
  var H = 270;
  var SHOW_MS = 3500;          // 按键卡自己站台的时间
  var FADE_IN = 140;
  var FADE_OUT = 200;

  function kn(k, who) { return SB.Input.keyName(k, who); }
  /* 短写法：不带「/ WASD」那半截。补充说明那一列本来就长，别再往里塞。 */
  function knb(k, who) { return SB.Input.keyName(k, who, true); }

  /* ================================================================
   * 一、键位表（纯数据；note / kt 允许写成函数，因为键名要现算）
   * ================================================================
   * row: { k: 手柄键位, act: 干什么, note: 补充说明, kt: 自定义键位写法, p1: 只有 1P 有 }
   * same: 是不是同屏双打（马里蘑是轮流上场，不是同屏；合 1 的目录只有 1P 能动）
   * spot: 常驻键位条的落点（画面内部坐标，ox = 水平原点）
   */
  var TABLE = {

    /* 魂斗萝：ContraGame.updatePlayer / aimOf / fire
     *   pad.h 走 + 定朝向；pad.up 抬枪打上、up+左右打斜上；
     *   跳在空中按 down 打斜下 / 正下；down+onGround 趴下；
     *   just.a 起跳、松开 A 立刻砍速（短跳）；趴着 just.a 从单向平台落下去；
     *   pad.b 按住连发。 */
    contra: {
      rows: [
        { k: 'lr', act: '走' },
        { k: 'a', act: '跳', note: '按住跳得更高' },
        { k: 'b', act: '开枪', note: '按住不放连着打' },
        { k: 'up', act: '朝上打', note: function () { return '斜着打：' + knb('up') + ' 加 ' + knb('lr'); } },
        { k: 'down', act: '趴下', note: function () { return '趴着按 ' + kn('a') + ' 落下平台'; } },
        { k: 'start', act: '暂停', note: '也从这里关电视', p1: true }
      ],
      strip: [['lr', '走'], ['a', '跳'], ['b', '开枪']],
      spot: { x: 348, y: 250, ox: 1 },
      same: true
    },

    /* 铁甲坦克：TankGame.updateTank / updatePlay
     *   四个方向开着走；pad.a || pad.b 都是开炮；
     *   开场卡那 1.5 秒按 A / B 可以跳过（卡在这之后才弹，所以不写进表里）。 */
    tank: {
      rows: [
        { k: 'dir', act: '开着走' },
        { k: 'a', act: '开炮', note: function () { return kn('b') + ' 也一样'; } },
        { k: 'start', act: '暂停', note: '也从这里关电视', p1: true }
      ],
      strip: [['dir', '走'], ['a', '开炮']],
      spot: { x: 20, y: 252, ox: 0 },
      same: true,
      /* 双打时右边那列只放得下一个键名，「B 也开炮」这句就落到底下说清楚，
       * 别让 2P 只知道 H 不知道 G。 */
      note2p: function () { return '开炮：' + kn('b') + ' 也一样，2P 是 ' + kn('b', 2); }
    },

    /* 马里蘑：MarioGame.updatePlayer / tryPipe
     *   pad.h 走；just.a 起跳、按住 A 跳得更高；pad.b 跑，吃了花以后 just.b 发火球；
     *   站在能钻的管口上按 down 进管子。
     *   双人是「轮流上场」（this.cur 换人），不是同屏，所以 same = false。 */
    mario: {
      rows: [
        { k: 'lr', act: '走' },
        { k: 'a', act: '跳', note: '按住跳得更高' },
        { k: 'b', act: '跑', note: '吃了花以后按它发火球' },
        { k: 'down', act: '钻管子', note: '站在管口上按' },
        { k: 'start', act: '暂停', note: '也从这里关电视', p1: true }
      ],
      strip: [['lr', '走'], ['a', '跳'], ['b', '跑']],
      spot: { x: 346, y: 250, ox: 1 },
      same: false,
      note2p: '两个人轮流上场，键位一样'
    },

    /* 拳霸 98 加强变态版：FightGame.readPad / step / doAttack
     *   左右 = 朝前走 / 后退，后退就是站防；down 蹲，后下蹲防；up 跳；
     *   A 出拳、B 出腿，往前按是重的，蹲着是下段，空中是空中攻击；
     *   必杀那几条只有买了杂志才写出来（游戏自己的指令表也是这个规矩）。 */
    fight: {
      rows: [
        { k: 'lr', act: '走', note: '往后走就是防御' },
        { k: 'a', act: '出拳', note: '往前按是重拳' },
        { k: 'b', act: '出腿', note: '往前按是重踢' },
        { k: 'up', act: '跳' },
        { k: 'down', act: '蹲', note: '蹲着打下段' },
        { k: 'start', act: '暂停', note: '也从这里关电视', p1: true }
      ],
      mag: [
        { act: '气功波', kt: function (w) { return '↓→+' + kn('a', w); } },
        { act: '升龙拳', kt: function (w) { return '→↓→+' + kn('a', w); } },
        { act: '旋风腿', kt: function (w) { return '↓←+' + kn('b', w); } },
        { act: '超必杀', kt: function (w) { return '↓→+' + kn('a', w) + '+' + kn('b', w); } }
      ],
      strip: [['a', '拳'], ['b', '腿']],
      spot: { x: 190, y: 250, ox: 0.5 },
      same: true
    },

    /* 100 万合 1 的目录：StubGame(MultiGame).update
     *   上下挪光标，A 或 B 进去。目录只读 1P 的手柄。 */
    multi: {
      rows: [
        { k: 'ud', act: '选' },
        { k: 'a', act: '进去', note: function () { return kn('b') + ' 也一样'; } },
        { k: 'start', act: '暂停', note: '也从这里关电视', p1: true }
      ],
      strip: [['ud', '选'], ['a', '进去']],
      spot: { x: 8, y: 236, ox: 0 },
      same: false,
      note2p: '目录只认 1P 那只手柄'
    },

    /* 死标题卡带：StubGame.update —— 它本来就不能玩，所以不主动弹卡（auto: false）。
     * 只在画面里留一条「怎么退出去」，别让人以为自己把机器按坏了；
     * 至于按别的键有没有反应，是这张卡自己的事，指引不替它说。 */
    stub: {
      rows: [
        { k: 'start', act: '暂停', note: '关掉电视回客厅', p1: true }
      ],
      foot: '别的键，自己一个个试',
      strip: [['start', '暂停']],
      spot: { x: 180, y: 252, ox: 0.5 },
      same: false,
      auto: false
    }
  };

  /* 套壳卡带（汉化版 / 未完成版 / 合 1 目录）会在里面再 new 一个真游戏出来，
   * 指引一路跟到最里面那层：外面那层演出还在放的时候，什么都不弹。 */
  function innerMost(g) {
    var n = 0;
    while (g && g.inner && n < 4) { g = g.inner; n++; }
    return g;
  }

  var ORDER = ['contra', 'tank', 'mario', 'fight', 'multi', 'garble', 'crash', 'stub'];

  /* 这个小游戏对象是哪张卡的玩法。用构造器认，不去问 opts.mode：
   * 合 1 目录里跑起来的那个坦克，opts.mode 还写着 'multi'。 */
  function modeOf(g) {
    if (!g || !SB.Games) return null;
    for (var i = 0; i < ORDER.length; i++) {
      var C = SB.Games[ORDER[i]];
      if (C && g instanceof C) return ORDER[i];
    }
    return null;
  }

  /* 「真正可操作了没有」。开机演出、卡带标题、关卡卡片、开场 READY 都不算。 */
  var READY = {
    contra: function () { return true; },                       // create() 完就能动
    tank: function (g) { return g.phase === 'play'; },          // intro → play
    mario: function (g) { return g.phase === 'play'; },         // card → play
    fight: function (g) { return g.ph === 'fight'; },           // title → intro → fight
    multi: function (g) { return !g.inner; },                   // 目录本身可操作
    stub: function () { return true; },
    garble: function () { return false; },                      // 只是个演出层，等里面那个游戏
    crash: function () { return false; }
  };

  SB.KeyGuide = {

    SHOW_MS: SHOW_MS,

    /* 给测试和其它地方用：拿到某个玩法的键位表 */
    spec: function (mode) { return TABLE[mode] || null; },
    modeOf: modeOf,

    /* 现在画面上真正在跑的是哪张卡的玩法、能不能动了 */
    state: function (game) {
      var g = innerMost(game);
      var mode = modeOf(g);
      if (!mode || !TABLE[mode]) return { mode: null, game: g, ready: false };
      var r = READY[mode] || function () { return true; };
      var ready = !g.over && !g.cleared && !!r(g);
      return { mode: mode, game: g, ready: ready };
    },

    /* 一行短提示（常驻条用的那一行）。who = 2 时写 2P 的键位。
     * 这里走 brief：常驻条是一行到底的东西，键名后面再挂半截 WASD 就会压到别人，
     * 「WASD 也能走」这件事由开局那张卡负责讲清楚。 */
    stripText: function (mode, who) {
      var s = TABLE[mode];
      if (!s) return '';
      return SB.Input.tip(s.strip, who, true);
    },

    /* 挂到 PlayScene 上。返回的对象由场景自己驱动（reset / update / showCard / destroy）。 */
    attach: function (scene) { return new Guide(scene); }
  };

  /* ================================================================
   * 二、指引对象
   * ================================================================ */
  function Guide(scene) {
    this.scene = scene;
    this.mode = null;          // 当前常驻条讲的是哪张卡
    this.told = {};            // 这一局里已经弹过卡的玩法
    this.card = null;
    this.strip = null;
    this.t = 0;                // 按键卡站台计时
    this.openFrame = -1;
    this.manual = false;

    var self = this;
    /* 拿起手柄、去摸屏幕、双打开关一变，说法要跟着改口 */
    this.offLabels = SB.Input.onLabels(function () { self.relabel(); });
    this.onPointer = function () { self.hideCard(false); };
    scene.input.on('pointerdown', this.onPointer);
  }

  Guide.prototype = {

    /* ---------------- 一局的开始（startGame / RESET / 再来一局） ---------------- */
    reset: function () {
      this.killCard(); this.killStrip();
      this.mode = null; this.told = {}; this.manual = false;
    },

    /* ---------------- 每帧 ---------------- */
    update: function (dt) {
      var st = SB.KeyGuide.state(this.scene.game_);

      /* 换玩法了（合 1 目录进了坦克、汉化版进了魂斗萝）：常驻条跟着换 */
      if (st.mode !== this.mode) {
        this.killStrip();
        this.mode = st.mode;
      }
      if (!st.mode || !st.ready) { this.killCard(); this.killStrip(); return; }

      var spec = TABLE[st.mode];
      /* 该讲的时候讲一次 */
      if (!this.told[st.mode]) {
        this.told[st.mode] = true;
        if (spec.auto === false) this.buildStrip();     // 不能玩的卡：只留退出提示
        else this.showCard(st.mode);
      }
      if (!this.card && !this.strip) this.buildStrip();

      /* 按键卡：任意键 / 点画面 / 到时间，三条都收。
       * 收卡的那一下按键照旧交给小游戏 —— 「按任意键」的下一秒就该是在玩了，
       * 而不是先白按一下。 */
      if (this.card) {
        this.t += dt;
        var anyKey = SB.Input.frame > this.openFrame &&
          (SB.Input.p1.anyJust() || SB.Input.p2.anyJust());
        if (anyKey || this.t >= SHOW_MS) this.hideCard(false);
      }
    },

    /* 按键卡还盖在画面上没有？（暂停菜单和测试用） */
    holding: function () { return !!this.card; },
    hasCard: function () { return !!this.card; },

    /* ---------------- 按键卡 ---------------- */
    showCard: function (mode) {
      mode = mode || this.mode || SB.KeyGuide.state(this.scene.game_).mode;
      if (!mode || !TABLE[mode]) return null;
      this.killCard();
      this.mode = mode;
      this.told[mode] = true;
      this.t = 0;
      this.openFrame = SB.Input.frame;
      this.card = this.buildCard(mode);
      this.killStrip();                                  // 卡在的时候不重复讲
      return this.card;
    },

    hideCard: function (now) {
      if (!this.card) return;
      var c = this.card, self = this;
      this.card = null;
      if (now) { c.destroy(); this.buildStrip(); return; }
      this.scene.tweens.add({
        targets: c, alpha: 0, duration: FADE_OUT,
        onComplete: function () { c.destroy(); }
      });
      this.buildStrip();
    },

    /* 一张卡的排版：标题 / 一行一条 / 底下一句「按任意键」。
     * 单人是「动作 + 键名 + 说明」三列；同屏双打去掉说明，换成 1P / 2P 两列键名。 */
    buildCard: function (mode) {
      var sc = this.scene, S = SB.SCREEN, spec = TABLE[mode];
      var twoP = !!(sc.twoP && spec.same);
      var rows = this.rowsOf(spec, twoP);
      var PAD = 10, ROW = 15, i, r;

      var wAct = 0, wK1 = 0, wK2 = 0, wNote = 0;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        wAct = Math.max(wAct, SB.Text.width(r.act, 12));
        wK1 = Math.max(wK1, SB.Text.width(r.k1, 12));
        wK2 = Math.max(wK2, SB.Text.width(r.k2 || '', 12));
        wNote = Math.max(wNote, SB.Text.width(r.note || '', 12));
      }
      var xAct = PAD, xK1 = xAct + wAct + 10;
      var xK2 = xK1 + wK1 + 12;
      var xNote = xK1 + wK1 + 12;
      var inner = twoP ? (xK2 + wK2) : (xNote + (wNote ? wNote : 0));

      var title = '怎 么 玩';
      /* 底下那一句也得跟着输入方式改口：摸屏幕的人手边没有「任意键」。 */
      var foot = spec.foot || (SB.Input.src === 'touch' ? '点一下画面接着玩' : '按任意键接着玩');
      /* note2p：两个人一起玩的时候才多说的那一句（轮流上场、目录只认 1P、2P 的备用键） */
      var n2 = spec.note2p;
      var note = (sc.twoP && n2) ? (typeof n2 === 'function' ? n2() : n2) : '';
      inner = Math.max(inner, PAD + SB.Text.width(title, 16), PAD + SB.Text.width(foot, 12),
        PAD + SB.Text.width(note, 12));

      var w = Math.min(W - 24, inner + PAD);
      var headH = 26;
      var h = headH + rows.length * ROW + (twoP ? 14 : 0) + (note ? 15 : 0) + 8 + 14 + PAD;
      var x0 = Math.round((W - w) / 2);
      var y0 = Math.round(Math.max(40, (H - h) / 2));

      var box = sc.add.container(S.x, S.y).setDepth(SB.D.DIALOG).setAlpha(0);
      var g = sc.add.graphics();
      g.fillStyle(SB.C.INK, 0.84); g.fillRect(x0, y0, w, h);
      g.lineStyle(1, SB.C.GREY5, 0.9); g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      g.lineStyle(1, SB.C.GREY3, 0.9);
      g.beginPath(); g.moveTo(x0 + 6, y0 + headH - 4); g.lineTo(x0 + w - 6, y0 + headH - 4); g.strokePath();
      box.add(g);

      var t = SB.Text.add(sc, x0 + w / 2, y0 + 5, title, 16, SB.C.YEL3).setOrigin(0.5, 0);
      box.add(t);

      var y = y0 + headH;
      if (twoP) {
        box.add(SB.Text.add(sc, x0 + xK1, y, '1P', 12, SB.C.GREY5).setAlpha(0.9));
        box.add(SB.Text.add(sc, x0 + xK2, y, '2P', 12, SB.C.GREY5).setAlpha(0.9));
        y += 14;
      }
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        box.add(SB.Text.add(sc, x0 + xAct, y, r.act, 12, SB.C.GREY8));
        box.add(SB.Text.add(sc, x0 + xK1, y, r.k1, 12, SB.C.YEL4));
        if (twoP) {
          if (r.k2) box.add(SB.Text.add(sc, x0 + xK2, y, r.k2, 12, SB.C.BLU5));
        } else if (r.note) {
          box.add(SB.Text.add(sc, x0 + xNote, y, r.note, 12, SB.C.GREY6).setAlpha(0.92));
        }
        y += ROW;
      }
      if (note) {
        box.add(SB.Text.add(sc, x0 + PAD, y + 2, note, 12, SB.C.GRN5).setAlpha(0.95));
        y += 15;
      }
      box.add(SB.Text.add(sc, x0 + w / 2, y0 + h - PAD - 12, foot, 12, SB.C.GREY5)
        .setOrigin(0.5, 0).setAlpha(0.95));

      sc.tweens.add({ targets: box, alpha: 1, duration: FADE_IN });
      box.__rows = rows;
      box.__box = { x: S.x + x0, y: S.y + y0, w: w, h: h };
      return box;
    },

    /* 表 → 一行一行的文字。键名全部现算。 */
    rowsOf: function (spec, twoP) {
      var out = [], list = (spec.rows || []).slice(), i, r, o;
      if (spec.mag && SB.Save.d && SB.Save.d.owned && SB.Save.d.owned.mag) {
        list = list.slice(0, list.length - 1).concat(spec.mag, list.slice(list.length - 1));
      }
      for (i = 0; i < list.length; i++) {
        r = list[i];
        o = {
          act: r.act,
          k1: r.kt ? r.kt() : kn(r.k),
          k2: (twoP && !r.p1) ? (r.kt ? r.kt(2) : kn(r.k, 2)) : '',
          note: typeof r.note === 'function' ? r.note() : (r.note || '')
        };
        out.push(o);
      }
      return out;
    },

    /* ---------------- 常驻键位条 ---------------- */
    buildStrip: function () {
      if (this.strip || !this.mode) return null;
      var sc = this.scene, spec = TABLE[this.mode];
      if (!spec) return null;
      var twoP = !!(sc.twoP && spec.same);
      var s1 = SB.KeyGuide.stripText(this.mode, undefined);
      var str = twoP ? ('1P ' + s1 + '\n2P ' + SB.KeyGuide.stripText(this.mode, 2)) : s1;

      var tw = SB.Text.width(str, 12), th = SB.Text.height(str, 12);
      var sp = spec.spot;
      var x = Math.round(sp.x - tw * (sp.ox || 0));
      var y = Math.round(sp.y - (th - 14));            // 两行时往上长，不往下压

      var box = sc.add.container(0, 0);
      var g = sc.add.graphics();
      g.fillStyle(SB.C.INK, 0.3); g.fillRect(x - 3, y - 2, tw + 6, th + 1);
      box.add(g);
      var t = SB.Text.add(sc, x, y, str, 12, SB.C.GREY8).setAlpha(0.58);
      box.add(t);
      /* 挂进画面容器：跟着电视一起被遮罩、一起盖上扫描线，像是游戏自己画的 */
      sc.gameRoot.add(box);

      box.__txt = t;
      box.__rect = { x: SB.SCREEN.x + x, y: SB.SCREEN.y + y, w: tw, h: th };
      this.strip = box;
      return box;
    },

    /* 常驻条在整块画布上的位置（测试拿它跟 HUD 比对） */
    stripRect: function () { return this.strip ? this.strip.__rect : null; },
    stripLine: function () { return this.strip ? this.strip.__txt.text : ''; },
    cardText: function () {
      if (!this.card) return '';
      var out = [], i, l = this.card.list;
      for (i = 0; i < l.length; i++) if (typeof l[i].text === 'string') out.push(l[i].text);
      return out.join('　');
    },

    /* 输入方式 / 双打开关一变，把现有的两样东西按新键名重画 */
    relabel: function () {
      if (this.card) {
        var m = this.mode, t = this.t, f = this.openFrame;
        this.killCard();
        this.card = this.buildCard(m);
        this.card.setAlpha(1);
        this.t = t; this.openFrame = f;
      }
      if (this.strip) { this.killStrip(); this.buildStrip(); }
    },

    /* 这一局到此为止（花屏、关电视、妈妈进门、退场）：卡和键位条一起撤掉 */
    clear: function () { this.killCard(); this.killStrip(); },

    killCard: function () { if (this.card) { this.card.destroy(); this.card = null; } },
    killStrip: function () { if (this.strip) { this.strip.destroy(); this.strip = null; } },

    destroy: function () {
      if (this.offLabels) { this.offLabels(); this.offLabels = null; }
      if (this.onPointer && this.scene.input) this.scene.input.off('pointerdown', this.onPointer);
      this.killCard(); this.killStrip();
    }
  };

})(window.SB);
