/* 《拳霸98加强变态版》—— 卡带 04。
 *
 * 这是「去发小家双打」那天插上的卡。当年满街都是这种盗版改版卡：
 * 标题上永远写着「加强变态版」，电脑偶尔莫名回血、一招打你半条命，
 * 你骂一句「这卡是改过的吧」，然后接着打第二局。
 *
 * 设计要点（为什么这么写）：
 *  1. 没有物理引擎。走位、重力、判定框、推挤、边界全部手算，帧数据说了算。
 *  2. 真做帧数据：每招 起手(su) / 判定(ac) / 收招(rc)，命中有 hitstop + 受击僵直 + 击退，
 *     防御有防御硬直与削血，轻招命中后有取消窗口 → 能连段。手感的根全在这。
 *  3. 每人只有两个键（A=拳 B=脚），所以轻重靠「方向 + 键」区分：
 *     A / B、→+A / →+B（重）、↓+A / ↓+B（下段）、空中 A/B（跳攻）、方向指令 + 键（必杀）。
 *  4. 双人对战是第一等公民：1P/2P 走的是同一套代码，单人时 2P 的手柄由 AI「按」。
 *     AI 也走同一个指令解析器，所以 AI 会真的搓出气功波。
 *  5. 所有取图前过 has()，缺图用同尺寸色块兜底，资源没到位也照样能打。
 *  6. 屏幕是显像管，HUD 一律离边 8px 以上。 */
(function (SB) {
  'use strict';

  /* ================= 基础常量（单位：像素 / 毫秒） ================= */
  var FR = 1000 / 60;              // 一「帧」= 16.67ms，帧数据都按 60Hz 写
  var GROUND_Y = 233;              // 地面线（角色脚底 y），背景底部 40px 是擂台地面
  var STAGE_L = 32, STAGE_R = 328; // 角色中心的活动范围（场地边界）
  var PUSH_W = 13;                 // 推挤半宽：两人不能重叠
  var MAX_HP = 120;
  var MAX_METER = 100;
  var ROUND_MS = 60000;            // 每回合 60 秒
  var NEED_WIN = 2;                // 3 回合 2 胜

  var WALK_F = 0.062;              // 前进速度
  var WALK_B = 0.048;              // 后退（同时是防御）
  var GRAV = 0.0016;
  var JUMP_V = -0.44;              // 跳跃初速 → 约 60px 高、550ms 滞空
  var JUMP_H = 0.105;              // 前跳/后跳的水平速度
  var COMBO_KEEP = 700;            // 连段计数保留时间

  /* p1.png / p2.png 的帧序（严格按 docs/ART_MANIFEST.md D4，不许猜） */
  var F_IDLE = 0, F_FWD = 1, F_BACK = 2, F_CROUCH = 3, F_PUNCH = 4,
      F_UPPER = 5, F_KICK = 6, F_JUMP = 7, F_HURT = 8, F_DOWN = 9;

  /* ================= 招式表（帧数据） =================
   * su/ac/rc  = 起手 / 判定 / 收招（帧）
   * dmg       = 伤害；lv = 判定高度：mid 站蹲都能防 / low 必须蹲防 / over 必须站防
   * hs/bs     = 命中僵直 / 防御硬直（帧）；push = 击退初速；kd = 击倒
   * box       = 判定框，x 是「朝向方向上」离身体中心的偏移，y 是相对脚底（负数向上）
   * cancel    = 命中/被防后可以取消成什么（'sp' = 任意必杀）
   * cost      = 消耗能量（必杀技本体免费，能量槽留给超必杀，跟当年街机上那些格斗游戏一个路子）
   * proj = 生成飞行道具；inv = 起手无敌帧；dash = 突进速度 */
  var MOVES = {
    jab: {
      name: '直拳', anim: F_PUNCH, type: 'stand',
      su: 4, ac: 3, rc: 7, dmg: 6, lv: 'mid', hs: 12, bs: 6, push: 0.08,
      meter: 5, sfx: 'punch', box: { x: 8, y: -44, w: 22, h: 12 },
      cancel: ['jab', 'kick', 'strong', 'sp']
    },
    strong: {
      name: '上勾拳', anim: F_UPPER, type: 'stand',
      su: 8, ac: 4, rc: 14, dmg: 12, lv: 'mid', hs: 17, bs: 9, push: 0.17,
      meter: 8, sfx: 'punch', box: { x: 6, y: -52, w: 20, h: 24 },
      cancel: ['sp'], heavy: true
    },
    kick: {
      name: '前踢', anim: F_KICK, type: 'stand',
      su: 6, ac: 4, rc: 10, dmg: 8, lv: 'mid', hs: 13, bs: 7, push: 0.11,
      meter: 6, sfx: 'kick', box: { x: 9, y: -38, w: 26, h: 12 },
      cancel: ['strong', 'sp']
    },
    hkick: {
      name: '回旋踢', anim: F_KICK, type: 'stand', squash: 1.06,
      su: 9, ac: 5, rc: 17, dmg: 15, lv: 'mid', hs: 18, bs: 11, push: 0.24,
      meter: 9, sfx: 'kick', box: { x: 10, y: -46, w: 28, h: 18 },
      cancel: [], kd: true, heavy: true
    },
    lowp: {
      name: '下段拳', anim: F_CROUCH, type: 'crouch', fist: true,
      su: 4, ac: 3, rc: 8, dmg: 5, lv: 'low', hs: 11, bs: 5, push: 0.06,
      meter: 4, sfx: 'punch', box: { x: 8, y: -26, w: 20, h: 11 },
      cancel: ['lowp', 'lowk', 'sp']
    },
    lowk: {
      name: '扫腿', anim: F_KICK, type: 'crouch', squash: 0.76,
      su: 7, ac: 4, rc: 16, dmg: 10, lv: 'low', hs: 14, bs: 8, push: 0.14,
      meter: 7, sfx: 'kick', box: { x: 10, y: -18, w: 30, h: 15 },
      cancel: [], kd: true
    },
    jattA: {
      name: '跳跃拳', anim: F_PUNCH, type: 'air',
      su: 4, ac: 9, rc: 5, dmg: 9, lv: 'over', hs: 14, bs: 8, push: 0.10,
      meter: 6, sfx: 'punch', box: { x: 8, y: -36, w: 22, h: 16 },
      cancel: []
    },
    jattB: {
      name: '跳踢', anim: F_KICK, type: 'air',
      su: 5, ac: 10, rc: 5, dmg: 11, lv: 'over', hs: 15, bs: 9, push: 0.13,
      meter: 7, sfx: 'kick', box: { x: 9, y: -32, w: 26, h: 20 },
      cancel: []
    },
    /* ---- 必杀技 ---- */
    qi: {
      name: '气功波', anim: F_PUNCH, type: 'stand', special: true,
      su: 10, ac: 3, rc: 20, cost: 0, sfx: 'shoot',
      proj: { dmg: 10, spd: 0.19, hs: 15, bs: 9, push: 0.15, w: 18, h: 12, tint: SB.C.BLU5 },
      cancel: []
    },
    dragon: {
      name: '升龙拳', anim: F_UPPER, type: 'stand', special: true,
      su: 4, ac: 9, rc: 26, dmg: 18, lv: 'mid', hs: 20, bs: 12, push: 0.20,
      cost: 0, sfx: 'punch', box: { x: 4, y: -60, w: 22, h: 38 },
      cancel: [], kd: true, inv: 6, rise: true, heavy: true
    },
    whirl: {
      name: '旋风腿', anim: F_KICK, type: 'stand', special: true, squash: 0.94,
      su: 8, ac: 12, rc: 18, dmg: 14, lv: 'mid', hs: 18, bs: 10, push: 0.18,
      cost: 0, sfx: 'kick', box: { x: 8, y: -40, w: 30, h: 26 },
      cancel: [], dash: 0.13, heavy: true
    },
    superqi: {
      name: '超级气功波', anim: F_UPPER, type: 'stand', special: true, sup: true,
      su: 12, ac: 4, rc: 26, cost: 100, sfx: 'explosion_s',
      proj: { dmg: 26, spd: 0.155, hs: 26, bs: 14, push: 0.26, w: 30, h: 22, tint: SB.C.PUR4, kd: true, big: true },
      cancel: []
    }
  };

  /* 必杀指令：数字键盘记法，相对「面向」——6 = 朝对手，4 = 背对
   * 键盘玩家搓不出干净的 236，所以每个必杀都留了一条宽松版本。 */
  var CMD_QCF = [['2', '3', '6'], ['2', '6']];             // ↓↘→
  var CMD_DP = [['6', '2', '3'], ['6', '2', '6']];          // →↓↘
  var CMD_QCB = [['2', '1', '4'], ['2', '4']];              // ↓↙←
  var CMD_WIN = 400;                                        // 指令缓冲窗口 400ms

  /* ================= 虚拟手柄 =================
   * AI 用它「按键」，字段与 SB.Input 的 Pad 完全一致（含 .just / .h / .v），
   * 这样人和 AI 走的是同一条状态机与同一个指令解析器。 */
  function VPad() {
    this.left = this.right = this.up = this.down = false;
    this.a = this.b = this.start = this.select = false;
    this.h = this.v = 0;
    this.just = {};
    this._prev = {};
    this.want = {};
  }
  VPad.KEYS = ['left', 'right', 'up', 'down', 'a', 'b'];
  VPad.prototype.clear = function () {
    var i; for (i = 0; i < VPad.KEYS.length; i++) this.want[VPad.KEYS[i]] = false;
  };
  VPad.prototype.commit = function () {
    var i, k, v;
    for (i = 0; i < VPad.KEYS.length; i++) {
      k = VPad.KEYS[i]; v = !!this.want[k];
      this.just[k] = v && !this._prev[k];
      this._prev[k] = v;
      this[k] = v;
    }
    this.h = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    this.v = (this.down ? 1 : 0) - (this.up ? 1 : 0);
  };

  /* 把「相对面向」的方向符号翻译成实际按键 */
  function symToPad(sym, face, want) {
    if (sym === undefined || sym === null) return;
    var fwd = face > 0 ? 'right' : 'left';
    var bwd = face > 0 ? 'left' : 'right';
    if (sym.indexOf('6') >= 0) want[fwd] = true;
    if (sym.indexOf('4') >= 0) want[bwd] = true;
    if (sym.indexOf('2') >= 0) want.down = true;
    if (sym.indexOf('8') >= 0) want.up = true;
    if (sym.indexOf('3') >= 0) { want.down = true; want[fwd] = true; }
    if (sym.indexOf('1') >= 0) { want.down = true; want[bwd] = true; }
    if (sym.indexOf('9') >= 0) { want.up = true; want[fwd] = true; }
    if (sym.indexOf('7') >= 0) { want.up = true; want[bwd] = true; }
  }

  /* ================================================================
   * 角色
   * ================================================================ */
  function Fighter(g, side) {
    this.g = g;
    this.side = side;                       // 1 = 左边（1P），2 = 右边（2P）
    this.key = side === 1 ? 'fight_p1' : 'fight_p2';
    /* p2.png 是「面朝左」画的，所以两张图的原生朝向不同，翻转要按各自的原生朝向算 */
    this.native = side === 1 ? 1 : -1;
    this.tintFall = side === 1 ? SB.C.GREY8 : SB.C.BLU3;
    this.beltFall = side === 1 ? SB.C.RED4 : SB.C.YEL3;

    this.wins = 0;
    this.x = 0; this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.face = side === 1 ? 1 : -1;
    this.hp = MAX_HP; this.meter = 0;

    this.st = 'idle'; this.stT = 0;
    this.mv = null; this.mvKey = null; this.mvT = 0;
    this.hitUsed = false; this.connected = false; this.projDone = false;
    this.air = false; this.guard = false; this.crouchGuard = false;
    this.stun = 0; this.invuln = 0; this.kdPending = false;
    this.combo = 0; this.comboT = 0; this.hitFlash = 0;
    this.hist = []; this.lastSym = '5';
    this.critNext = 0;                      // 变态版：下一击的伤害倍率
    this.freeCombo = 0;                     // 变态版：无限连剩余次数
    this.build();
  }
  var FP = Fighter.prototype;

  /* ---------------- 外观：有图用图，没图用色块拼一个 ---------------- */
  FP.build = function () {
    var g = this.g;
    /* 影子（先建 → 在角色下面） */
    this.shadow = g.rect(0, 0, 22, 4, SB.C.GREY1, 0.42);
    this.shadow.setOrigin(0.5, 0.5);

    if (g.has(this.key)) {
      this.spr = g.spr(0, 0, this.key, F_IDLE);
      this.spr.setOrigin(0.5, 1);
    } else {
      /* 兜底：躯干 + 头 + 腰带 + 一条会伸出去的肢体，姿态靠代码摆 */
      this.fall = g.group();
      this.fBody = g.rect(-9, -44, 18, 44, this.tintFall, 1);
      this.fHead = g.rect(-6, -56, 12, 12, SB.C.SKN3, 1);
      this.fBelt = g.rect(-9, -26, 18, 4, this.beltFall, 1);
      this.fLimb = g.rect(0, -40, 16, 6, SB.C.SKN3, 1);
      this.fall.add([this.fBody, this.fHead, this.fBelt, this.fLimb]);
      this.fLimb.setVisible(false);
    }
    /* 蹲下/下段拳时伸出的拳头（有图也画，让下段拳看得见判定） */
    this.fist = g.rect(0, 0, 9, 6, SB.C.SKN3, 1);
    this.fist.setOrigin(0.5, 0.5);
    this.fist.setVisible(false);
  };

  /* ---------------- 每帧记录方向指令（哪怕不能动也要记） ---------------- */
  FP.sampleCmd = function (pad) {
    var h = pad.h * this.face, v = pad.v, s = '5';
    if (v > 0 && h > 0) s = '3';
    else if (v > 0 && h < 0) s = '1';
    else if (v > 0) s = '2';
    else if (v < 0 && h > 0) s = '9';
    else if (v < 0 && h < 0) s = '7';
    else if (v < 0) s = '8';
    else if (h > 0) s = '6';
    else if (h < 0) s = '4';
    if (s !== this.lastSym) {
      this.lastSym = s;
      this.hist.push({ s: s, t: this.g.t });
      if (this.hist.length > 14) this.hist.shift();
    }
  };

  /* 指令识别：从后往前找序列，允许中间夹杂别的方向，但整段不超过 400ms。
   * 盗版卡的手感就是「宽松」，搓不出来才是最气人的事。 */
  FP.matchOne = function (seq) {
    var h = this.hist, i, idx = seq.length - 1, tEnd = -1, tStart = -1;
    for (i = h.length - 1; i >= 0 && idx >= 0; i--) {
      if (h[i].s === seq[idx]) {
        if (idx === seq.length - 1) tEnd = h[i].t;
        tStart = h[i].t;
        idx--;
      }
    }
    if (idx >= 0) return false;
    if (this.g.t - tEnd > 220) return false;           // 序列末尾要「刚刚」输入
    return (tEnd - tStart) <= CMD_WIN;
  };
  FP.matchCmd = function (list) {
    var i;
    for (i = 0; i < list.length; i++) if (this.matchOne(list[i])) return true;
    return false;
  };
  FP.eatCmd = function () { this.hist.length = 0; this.lastSym = '5'; };

  /* ---------------- 出招判定：两个键 + 方向 ----------------
   * allow 非空时只允许其中的招（取消窗口用） */
  FP.readAttack = function (pad, allow) {
    var aj = pad.just.a, bj = pad.just.b;
    if (!aj && !bj) return null;
    var self = this;
    var ok = function (k) {
      if (!allow) return k;
      var mv = MOVES[k], i;
      for (i = 0; i < allow.length; i++) {
        if (allow[i] === k) return k;
        if (allow[i] === 'sp' && mv.special) return k;
      }
      return null;
    };
    var afford = function (k) { return self.meter >= (MOVES[k].cost || 0); };

    /* 超必杀：A+B 同时按（能量满）*/
    if (pad.a && pad.b && afford('superqi') && this.matchCmd(CMD_QCF)) {
      if (ok('superqi')) { this.eatCmd(); return 'superqi'; }
    }
    /* 必杀技优先于普通招；能量不够就退化成普通招，不让输入吃掉 */
    if (aj) {
      if (this.matchCmd(CMD_DP) && afford('dragon') && ok('dragon')) { this.eatCmd(); return 'dragon'; }
      if (this.matchCmd(CMD_QCF) && afford('qi') && ok('qi')) { this.eatCmd(); return 'qi'; }
    }
    if (bj) {
      if (this.matchCmd(CMD_QCB) && afford('whirl') && ok('whirl')) { this.eatCmd(); return 'whirl'; }
      if (this.matchCmd(CMD_QCF) && afford('whirl') && ok('whirl')) { this.eatCmd(); return 'whirl'; }
    }
    if (this.air) return ok(aj ? 'jattA' : 'jattB');
    if (pad.down) return ok(aj ? 'lowp' : 'lowk');
    if (pad.h * this.face > 0) return ok(aj ? 'strong' : 'hkick');
    return ok(aj ? 'jab' : 'kick');
  };

  /* ---------------- 起招 ---------------- */
  FP.startMove = function (k) {
    var mv = MOVES[k];
    this.mvKey = k; this.mv = mv; this.mvT = 0;
    this.hitUsed = false; this.connected = false; this.projDone = false;
    this.st = 'attack'; this.stT = 0;
    this.vx = 0;
    if (mv.cost) this.meter -= mv.cost;
    else this.addMeter(mv.special ? 3 : 2);        // 挥空也涨一点能量，POW 攒得起来
    if (mv.special) this.g.onSpecial(this, k);
    if (mv.inv) this.invuln = Math.max(this.invuln, mv.inv * FR);
    if (mv.rise) { this.air = true; this.vy = -0.40; this.vx = this.face * 0.045; }
    if (mv.sfx && !mv.proj) this.g.sfx(mv.sfx, { rate: mv.heavy ? 0.85 : 1.1 });
  };

  FP.endMove = function () {
    this.mv = null; this.mvKey = null; this.mvT = 0;
    this.fist.setVisible(false);
    if (this.air) { this.st = 'air'; }
    else { this.st = 'idle'; this.stT = 0; }
  };

  FP.jump = function (dir) {
    this.air = true;
    this.vy = JUMP_V;
    this.vx = dir * JUMP_H;
    this.st = 'air'; this.stT = 0;
    this.g.sfx('jump', { rate: 1.05 });
  };

  FP.canAct = function () {
    return this.st === 'idle' || this.st === 'walk' || this.st === 'back' ||
      this.st === 'crouch' || this.st === 'air';
  };

  /* ---------------- 主步进 ---------------- */
  FP.step = function (dt, pad) {
    this.stT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    this.guard = false; this.crouchGuard = false;

    switch (this.st) {
      case 'ko': this.physics(dt); break;
      case 'hurt': this.stepHurt(dt); break;
      case 'blockstun': this.stepBlock(dt, pad); break;
      case 'down': this.stepDown(dt); break;
      case 'getup': this.physics(dt); if (this.stT >= 14 * FR) { this.st = 'idle'; this.stT = 0; } break;
      case 'land': this.physics(dt); if (this.stT >= 5 * FR) { this.st = 'idle'; this.stT = 0; } break;
      case 'attack': this.stepAttack(dt, pad); break;
      default: this.stepFree(dt, pad); break;
    }
  };

  FP.stepHurt = function (dt) {
    this.stun -= dt;
    this.physics(dt);
    if (this.stun <= 0) {
      if (this.air) this.st = 'air';
      else if (this.kdPending) { this.toDown(); }
      else { this.st = 'idle'; this.stT = 0; }
    }
  };

  FP.stepBlock = function (dt, pad) {
    this.stun -= dt;
    this.guard = true;
    this.crouchGuard = !!pad.down;
    this.physics(dt);
    if (this.stun <= 0) { this.st = 'idle'; this.stT = 0; }
  };

  FP.stepDown = function (dt) {
    this.physics(dt);
    this.invuln = Math.max(this.invuln, 4 * FR);
    if (this.stT >= 46 * FR) {
      this.st = 'getup'; this.stT = 0; this.kdPending = false;
      this.invuln = 16 * FR;                       // 起身无敌，避免被无限压制
    }
  };

  FP.toDown = function () {
    this.st = 'down'; this.stT = 0; this.kdPending = false;
    this.combo = 0;
    this.g.sfx('hit', { rate: 0.8 });
    this.g.dustAt(this.x, GROUND_Y);
  };

  /* 自由状态：走位 / 蹲 / 跳 / 出招 / 防御 */
  FP.stepFree = function (dt, pad) {
    var atk = this.readAttack(pad);
    if (atk) { this.startMove(atk); return; }

    if (this.air) { this.physics(dt); return; }

    if (pad.just.up) {
      this.jump(pad.h * this.face > 0 ? this.face : (pad.h * this.face < 0 ? -this.face : 0));
      return;
    }

    var toward = pad.h * this.face;           // 1 = 朝对手，-1 = 背对（= 防御）
    if (pad.down) {
      this.st = 'crouch';
      this.guard = toward < 0; this.crouchGuard = this.guard;
    } else if (toward > 0) {
      this.st = 'walk';
      this.x += this.face * WALK_F * dt;
    } else if (toward < 0) {
      this.st = 'back';
      this.guard = true;                       // 后退即防御（站防）
      this.x -= this.face * WALK_B * dt;
    } else {
      this.st = 'idle';
    }
    this.physics(dt);
  };

  /* 出招中：走帧数据，判定框在 ac 段有效，命中后开取消窗口 */
  FP.stepAttack = function (dt, pad) {
    var mv = this.mv;
    this.mvT += dt;
    var su = mv.su * FR, ac = mv.ac * FR, rc = mv.rc * FR;

    if (mv.dash && this.mvT > su * 0.6 && this.mvT < su + ac) this.x += this.face * mv.dash * dt;
    if (mv.proj && !this.projDone && this.mvT >= su) {
      this.projDone = true;
      this.g.spawnProj(this, mv);
      this.g.sfx(mv.sfx);
    }
    /* 取消窗口：命中或被防之后，起手结束到收招结束前都能接下一招 */
    if (this.connected && this.mvT > su && mv.cancel && mv.cancel.length) {
      var nk = this.readAttack(pad, mv.cancel);
      if (nk) { this.startMove(nk); return; }
    }
    this.physics(dt);
    if (this.mvT >= su + ac + rc) this.endMove();
  };

  /* ---------------- 手算物理 ---------------- */
  FP.physics = function (dt) {
    if (this.air) {
      this.vy += GRAV * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y; this.vy = 0; this.air = false;
        this.vx *= 0.25;
        this.g.dustAt(this.x, GROUND_Y);
        if (this.kdPending || this.st === 'hurt') { this.toDown(); }
        else if (this.st === 'attack') { this.endMove(); this.st = 'land'; this.stT = 0; }
        else { this.st = 'land'; this.stT = 0; }
      }
    } else {
      this.x += this.vx * dt;
      var k = Math.pow(0.87, dt / FR);
      this.vx *= k;
      if (Math.abs(this.vx) < 0.004) this.vx = 0;
    }
    this.x = SB.clamp(this.x, STAGE_L, STAGE_R);
  };

  /* ---------------- 判定框 ---------------- */
  FP.activeNow = function () {
    var mv = this.mv;
    if (!mv || !mv.box || this.hitUsed) return false;
    var su = mv.su * FR;
    return this.mvT >= su && this.mvT < su + mv.ac * FR;
  };
  FP.hitBox = function () {
    var b = this.mv.box;
    return {
      x: this.face > 0 ? this.x + b.x : this.x - b.x - b.w,
      y: this.y + b.y, w: b.w, h: b.h
    };
  };
  FP.hurtBox = function () {
    if (this.st === 'down') return { x: this.x - 17, y: this.y - 15, w: 34, h: 15 };
    if (this.air) return { x: this.x - 10, y: this.y - 44, w: 20, h: 40 };
    if (this.st === 'crouch' || this.st === 'blockstun' && this.crouchGuard ||
      (this.mv && this.mv.type === 'crouch')) return { x: this.x - 11, y: this.y - 34, w: 22, h: 34 };
    return { x: this.x - 11, y: this.y - 50, w: 22, h: 50 };
  };
  FP.pushBox = function () { return { x: this.x - PUSH_W, y: this.y - 46, w: PUSH_W * 2, h: 46 }; };

  /* 这一招能不能被现在的防御姿态挡住 */
  FP.canBlock = function (mv) {
    if (!this.guard) return false;
    if (mv.lv === 'low') return this.crouchGuard;
    if (mv.lv === 'over') return !this.crouchGuard;
    return true;
  };

  FP.addMeter = function (v) { this.meter = SB.clamp(this.meter + v, 0, MAX_METER); };

  /* ---------------- 受击 / 被防 ---------------- */
  FP.onHit = function (mv, dmg, fromFace, extraStun) {
    this.hp = Math.max(0, this.hp - dmg);
    this.combo = 0;
    this.stun = (mv.hs || 12) * FR + (extraStun || 0);
    this.st = 'hurt'; this.stT = 0;
    this.hitFlash = 90;
    this.vx = fromFace * (mv.push || 0.1);
    this.mv = null; this.mvKey = null;
    this.fist.setVisible(false);
    if (mv.kd || (mv.launch && !this.air)) this.kdPending = true;
    if (this.air) this.kdPending = true;                  // 空中被打必倒地
    if (mv.launch || (mv.kd && mv.heavy)) { this.air = true; this.vy = -0.24; }
    this.addMeter(dmg * 0.7);
  };

  FP.onBlocked = function (mv, chip, fromFace) {
    this.hp = Math.max(1, this.hp - chip);
    this.stun = (mv.bs || 6) * FR;
    this.st = 'blockstun'; this.stT = 0;
    this.vx = fromFace * (mv.push || 0.1) * 0.45;
    this.addMeter(2.5);
  };

  /* ---------------- 绘制 ---------------- */
  FP.curFrame = function () {
    switch (this.st) {
      case 'attack': return this.mv ? this.mv.anim : F_IDLE;
      case 'crouch': case 'blockstun': return this.crouchGuard ? F_CROUCH : (this.guard ? F_BACK : F_CROUCH);
      case 'walk': return (Math.floor(this.stT / 130) % 2) ? F_FWD : F_IDLE;
      case 'back': return F_BACK;
      case 'air': return F_JUMP;
      case 'hurt': return F_HURT;
      case 'down': return F_DOWN;
      case 'getup': return this.stT < 8 * FR ? F_DOWN : F_CROUCH;
      case 'land': return F_CROUCH;
      case 'ko': return F_DOWN;
      case 'win': return F_UPPER;
      default: return (Math.floor(this.stT / 260) % 2) ? F_FWD : F_IDLE;
    }
  };

  FP.render = function (shake) {
    var f = this.curFrame();
    var px = Math.round(this.x + (shake || 0));
    var py = Math.round(this.y);
    var sq = (this.st === 'attack' && this.mv && this.mv.squash) ? this.mv.squash : 1;

    if (this.spr) {
      this.spr.setFrame(f);
      this.spr.setPosition(px, py);
      this.spr.flipX = (this.face !== this.native);
      this.spr.setScale(1, sq);
      this.spr.setAlpha(this.invuln > 0 && this.st !== 'down' && Math.floor(this.g.t / 60) % 2 ? 0.45 : 1);
      this.spr.setTint(this.hitFlash > 0 ? SB.C.RED5 : 0xffffff);
      if (this.hitFlash > 0 && Math.floor(this.g.t / 40) % 2) this.spr.setTint(SB.C.WHITE);
    } else {
      this.renderFallback(f, px, py, sq);
    }

    /* 下段拳的拳头（也让缺图时判定看得见） */
    var showFist = this.st === 'attack' && this.mv && this.mv.fist &&
      this.mvT >= this.mv.su * FR && this.mvT < (this.mv.su + this.mv.ac) * FR;
    this.fist.setVisible(showFist);
    if (showFist) {
      var b = this.mv.box;
      this.fist.setPosition(px + this.face * (b.x + b.w * 0.6), py + b.y + b.h * 0.5);
    }

    /* 影子：跳起来变小 */
    var high = SB.clamp((GROUND_Y - this.y) / 60, 0, 1);
    this.shadow.setPosition(px, GROUND_Y + 1);
    this.shadow.setScale(1 - high * 0.45, 1);
    this.shadow.setAlpha(this.st === 'down' ? 0.15 : 0.42 - high * 0.22);
  };

  /* 缺图兜底：用色块摆姿态，蹲下矮一截、倒地躺平、出招伸肢体 */
  FP.renderFallback = function (f, px, py, sq) {
    var h = 44, hy = -56, crouch = (f === F_CROUCH), down = (f === F_DOWN);
    if (crouch) { h = 28; hy = -40; }
    if (f === F_JUMP) { h = 36; hy = -48; }
    this.fall.setPosition(px, py);
    this.fBody.setVisible(!down); this.fHead.setVisible(true); this.fBelt.setVisible(!down);
    if (down) {
      this.fBody.setVisible(true);
      this.fBody.setPosition(-17, -14); this.fBody.setSize(34, 14);
      this.fHead.setPosition(this.face > 0 ? -22 : 12, -14);
      this.fBelt.setVisible(false);
    } else {
      this.fBody.setPosition(-9, -h); this.fBody.setSize(18, h * sq);
      this.fHead.setPosition(-6, hy * sq);
      this.fBelt.setPosition(-9, -h * 0.55);
    }
    var lim = (f === F_PUNCH || f === F_UPPER || f === F_KICK);
    this.fLimb.setVisible(lim);
    if (lim && this.mv && this.mv.box) {
      var b = this.mv.box;
      this.fLimb.setPosition(this.face > 0 ? b.x : -b.x - b.w, b.y);
      this.fLimb.setSize(b.w, Math.max(5, b.h * 0.5));
    }
  };

  FP.resetRound = function (x) {
    this.x = x; this.y = GROUND_Y; this.vx = this.vy = 0;
    this.hp = MAX_HP;
    this.meter = Math.min(MAX_METER, this.meter * 0.4 + 10);
    this.st = 'idle'; this.stT = 0; this.air = false;
    this.mv = null; this.mvKey = null; this.mvT = 0;
    this.stun = 0; this.invuln = 0; this.kdPending = false;
    this.combo = 0; this.comboT = 0; this.hitFlash = 0;
    this.critNext = 0; this.freeCombo = 0;
    this.hist.length = 0; this.lastSym = '5';
  };

  /* ================================================================
   * 游戏本体
   * ================================================================ */
  function FightGame(host, opts) {
    SB.GameBase.call(this, host, opts);
    this.twoP = !!this.opts.twoP;
    this.garble = this.opts.garble === true;
    this.atFriend = this.opts.atFriend === true;

    this.projs = [];
    this.fx = [];
    this.floats = [];
    this.ph = 'title'; this.phT = 1900;
    this.round = 1;
    this.timeLeft = ROUND_MS;
    this.freeze = 0;        // hitstop（命中僵直冻结，手感的关键）
    this.slow = 0;          // KO 慢放
    this.shakeX = 0;
    this.winner = 0;
    this.vpad = new VPad();
    this.ai = { plan: [], think: 0, lv: 0.85, guardT: 0, memo: 0, reactCd: 0 };
    this.cheat = { n: 0, last: -6000, healed: 0, bonus: 0, t: 0 };
    this.garbleT = 0;
  }
  SB.extendGame(FightGame);
  var P = FightGame.prototype;

  /* 盗版汉化：HUD 中文全变 ■ */
  P.L = function (s) {
    if (!this.garble) return s;
    return s.replace(/[^\x00-\x7F]/g, '■');
  };

  /* ================= 创建 ================= */
  P.create = function () {
    /* CRT 的开机动画（crt.powerOn）会把屏幕黑底重新压回 alpha=1，
     * 而 PlayScene 是在 powerOn 之前才调的 setContentVisible(true)，
     * 于是画面会整块黑掉。共享文件不该由本游戏改，这里用公开接口补一刀；
     * 等 crt.js / PlayScene 修好后这行也是无害的。 */
    if (this.host.crt && this.host.crt.setContentVisible) this.host.crt.setContentVisible(true);

    this.buildStage();
    this.buildAnims();
    this.f1 = new Fighter(this, 1);
    this.f2 = new Fighter(this, 2);
    this.f1.x = 120; this.f2.x = 240;
    this.buildHud();
    this.buildMagPanel();
    this.buildTitle();
    this.bgm('bgm_fight');
    this.f1.render(); this.f2.render();
  };

  /* ---------------- 擂台 ----------------
   * 背景左右各铺一份，world 轻微跟随时不会露黑边 */
  P.buildStage = function () {
    var i, x;
    if (this.has('fight_bg')) {
      for (i = -1; i <= 1; i++) {
        var im = this.img(i * this.W, 0, 'fight_bg');
        im.setOrigin(0, 0);
      }
    } else {
      this.rect(-this.W, 0, this.W * 3, 190, SB.C.GREY2, 1);
      this.rect(-this.W, 190, this.W * 3, 40, SB.C.GREY3, 1);
      this.rect(-this.W, 230, this.W * 3, 40, SB.C.WOOD4, 1);
      for (x = -this.W; x < this.W * 2; x += 40) this.rect(x, 230, 2, 40, SB.C.WOOD2, 1);
      /* 缺图时也给几个红灯笼，别让画面空成一片 */
      for (x = -20; x < this.W + 20; x += 72) {
        this.rect(x, 30, 10, 14, SB.C.RED3, 1);
        this.rect(x + 2, 44, 6, 5, SB.C.YEL3, 1);
      }
    }
    /* 场地边界：两根柱子，提示「被压到角了」 */
    this.wallL = this.rect(STAGE_L - 22, 150, 3, 83, SB.C.WOOD2, 0.55);
    this.wallR = this.rect(STAGE_R + 19, 150, 3, 83, SB.C.WOOD2, 0.55);
  };

  P.buildAnims = function () {
    if (this.has('fight_spark')) this.anim('fight_spark_a', 'fight_spark', [0, 1, 2, 3], 22, 0);
  };

  /* ---------------- HUD（离边 ≥8px，过扫描安全） ---------------- */
  P.buildHud = function () {
    var i, s;
    /* 血条：两条 140×14 的框，内区 x+3..x+137、y+3..y+11 */
    this.barX1 = 10; this.barX2 = 210; this.barY = 12;
    this.hpLag1 = MAX_HP; this.hpLag2 = MAX_HP;

    this.hpFill1 = this.rect(this.barX1 + 3, this.barY + 3, 134, 8, SB.C.YEL3, 1, true);
    this.hpLagR1 = this.rect(this.barX1 + 3, this.barY + 3, 0, 8, SB.C.RED4, 1, true);
    this.hpFill2 = this.rect(this.barX2 + 3, this.barY + 3, 134, 8, SB.C.YEL3, 1, true);
    this.hpLagR2 = this.rect(this.barX2 + 3, this.barY + 3, 0, 8, SB.C.RED4, 1, true);

    if (this.has('fight_hudbar')) {
      this.bar1 = this.img(this.barX1, this.barY, 'fight_hudbar', 0, true); this.bar1.setOrigin(0, 0);
      this.bar2 = this.img(this.barX2, this.barY, 'fight_hudbar', 0, true); this.bar2.setOrigin(0, 0);
      /* 血条框内区是实心黑，所以填色画在框「上面」，再补回分段线 */
      this.host.gameRoot.bringToTop(this.ui);
      this.ui.bringToTop(this.hpFill1); this.ui.bringToTop(this.hpLagR1);
      this.ui.bringToTop(this.hpFill2); this.ui.bringToTop(this.hpLagR2);
    } else if (this.has('fight_hud')) {
      this.bar1 = this.img(this.barX1, this.barY, 'fight_hud', 0, true); this.bar1.setOrigin(0, 0);
      this.bar2 = this.img(this.barX2, this.barY, 'fight_hud', 0, true); this.bar2.setOrigin(0, 0);
      this.ui.bringToTop(this.hpFill1); this.ui.bringToTop(this.hpLagR1);
      this.ui.bringToTop(this.hpFill2); this.ui.bringToTop(this.hpLagR2);
    } else {
      /* 缺图兜底：自己描个框 */
      this.rect(this.barX1, this.barY, 140, 14, SB.C.GREY7, 1, true);
      this.rect(this.barX1 + 2, this.barY + 2, 136, 10, SB.C.INK, 1, true);
      this.rect(this.barX2, this.barY, 140, 14, SB.C.GREY7, 1, true);
      this.rect(this.barX2 + 2, this.barY + 2, 136, 10, SB.C.INK, 1, true);
      this.ui.bringToTop(this.hpFill1); this.ui.bringToTop(this.hpLagR1);
      this.ui.bringToTop(this.hpFill2); this.ui.bringToTop(this.hpLagR2);
    }
    /* 分段线（老卡血条都有格子） */
    for (i = 1; i <= 3; i++) {
      this.rect(this.barX1 + 3 + i * 33, this.barY + 3, 1, 8, SB.C.GREY4, 0.8, true);
      this.rect(this.barX2 + 3 + i * 33, this.barY + 3, 1, 8, SB.C.GREY4, 0.8, true);
    }

    /* 头像 */
    if (this.has('fight_portrait')) {
      s = this.img(10, 28, 'fight_portrait', 0, true); s.setOrigin(0, 0);
      s = this.img(322, 28, 'fight_portrait', 1, true); s.setOrigin(0, 0);
    } else {
      this.rect(10, 28, 28, 28, SB.C.GREY8, 1, true);
      this.rect(12, 30, 24, 24, SB.C.SKN2, 1, true);
      this.rect(322, 28, 28, 28, SB.C.BLU3, 1, true);
      this.rect(324, 30, 24, 24, SB.C.SKN2, 1, true);
    }

    /* 能量槽 */
    this.rect(42, 30, 110, 7, SB.C.INK, 0.85, true);
    this.rect(208, 30, 110, 7, SB.C.INK, 0.85, true);
    this.mFill1 = this.rect(43, 31, 0, 5, SB.C.BLU4, 1, true);
    this.mFill2 = this.rect(209, 31, 0, 5, SB.C.BLU4, 1, true);
    this.mTxt1 = this.txt(42, 39, 'POW', 12, SB.C.GREY6);
    this.mTxt2 = this.txt(292, 39, 'POW', 12, SB.C.GREY6);

    /* 回合胜利星标 */
    this.stars = [[], []];
    for (i = 0; i < 2; i++) {
      this.stars[0].push(this.txt(80 + i * 12, 39, '★', 12, SB.C.GREY4));
      this.stars[1].push(this.txt(254 + i * 12, 39, '★', 12, SB.C.GREY4));
    }

    /* 中央倒计时 */
    this.timeTxt = this.txt(180, 10, '60', 16, SB.C.WHITE);
    this.timeTxt.setOrigin(0.5, 0);
    this.roundTxt = this.txt(180, 30, this.L('第1回合'), 12, SB.C.YEL4);
    this.roundTxt.setOrigin(0.5, 0);

    /* 连段计数 */
    this.comboTxt1 = this.txt(44, 52, '', 12, SB.C.YEL3);
    this.comboTxt2 = this.txt(316, 52, '', 12, SB.C.YEL3);
    this.comboTxt2.setOrigin(1, 0);

    /* 中央演出文字 */
    this.annBig = this.txt(180, 96, '', 16, SB.C.YEL3);
    this.annBig.setOrigin(0.5, 0).setVisible(false);
    this.annSub = this.txt(180, 122, '', 12, SB.C.GREY8);
    this.annSub.setOrigin(0.5, 0).setVisible(false);

    /* 变态版乱码：右下角闪一下 */
    this.glBg = this.rect(250, 240, 100, 16, SB.C.PUR1, 0.8, true);
    this.glTxt = this.txt(254, 242, '', 12, SB.C.GRN5);
    this.glBg.setVisible(false); this.glTxt.setVisible(false);
  };

  /* 《电子游戏时代》买了才有的必杀指令表 —— 当年杂志最大的价值 */
  P.buildMagPanel = function () {
    if (!this.hasMag()) { this.magOn = false; return; }
    this.magOn = true;
    var y = 196;
    this.magBg = this.rect(8, y, 122, 66, SB.C.INK, 0.5, true);
    this.magTitle = this.txt(12, y + 2, this.L('秘技'), 12, SB.C.YEL4);
    this.magLines = [
      this.txt(12, y + 16, this.L('气功波') + ' ↓→+A', 12, SB.C.GREY8),
      this.txt(12, y + 28, this.L('升龙拳') + ' →↓→+A', 12, SB.C.GREY8),
      this.txt(12, y + 40, this.L('旋风腿') + ' ↓←+B', 12, SB.C.GREY8),
      this.txt(12, y + 52, this.L('超必杀') + ' ↓→+AB', 12, SB.C.PUR4)
    ];
    var i;
    this.magBg.setAlpha(0.45);
    for (i = 0; i < this.magLines.length; i++) this.magLines[i].setAlpha(0.8);
    this.magTitle.setAlpha(0.85);
  };

  /* ---------------- 开场标题：加强变态版 ---------------- */
  P.buildTitle = function () {
    this.tBg = this.rect(0, 0, this.W, this.H, SB.C.INK, 0.72, true);
    this.tA = this.txt(180, 62, this.L('拳霸 98'), 16, SB.C.YEL3);
    this.tA.setOrigin(0.5, 0);
    this.tB = this.txt(180, 86, this.L('加强变态版'), 16, SB.C.RED4);
    this.tB.setOrigin(0.5, 0);
    this.tC = this.txt(180, 112, this.L('电脑有时候会作弊，这很正常'), 12, SB.C.GREY7);
    this.tC.setOrigin(0.5, 0);
    var l4 = this.twoP ? '1P 方向+Z/X    2P WASD+G/H' : '方向键移动  Z=脚  X=拳';
    this.tD = this.txt(180, 132, this.L(l4), 12, SB.C.GREY8);
    this.tD.setOrigin(0.5, 0);
    var sub = this.twoP ? '两个人打，一人一个手柄' : '1P VS 电脑';
    if (this.atFriend) sub = '在发小家：他坚持要用 1P';
    this.tE = this.txt(180, 154, this.L(sub), 12, SB.C.GRN5);
    this.tE.setOrigin(0.5, 0);
    this.tF = this.txt(180, 178, this.L('气功波 ↓→+A    升龙拳 →↓→+A'), 12, SB.C.BLU5);
    this.tF.setOrigin(0.5, 0);
    this.tG = this.txt(180, 196, this.L('旋风腿 ↓←+B    超必杀 ↓→+A+B'), 12, SB.C.BLU5);
    this.tG.setOrigin(0.5, 0);
    this.titleParts = [this.tBg, this.tA, this.tB, this.tC, this.tD, this.tE, this.tF, this.tG];
  };

  P.killTitle = function () {
    var i;
    if (!this.titleParts) return;
    for (i = 0; i < this.titleParts.length; i++) this.titleParts[i].destroy();
    this.titleParts = null;
  };

  /* ================= 主循环 ================= */
  P.update = function (dt) {
    if (this.paused || this.over || this.cleared) return;
    if (this.slow > 0) { this.slow -= dt; dt = dt * 0.4; }
    this.t += dt;

    var p1 = this.pad;
    var p2 = this.twoP ? this.pad2 : this.vpad;

    /* 单人：AI 先「按键」，再走与人完全相同的那套状态机 */
    if (!this.twoP) this.aiUpdate(dt, p1);

    /* 指令历史每帧都记（哪怕在 hitstop 里），不然搓招会吃输入 */
    this.f1.sampleCmd(p1);
    this.f2.sampleCmd(p2);

    switch (this.ph) {
      case 'title': this.phTitle(dt, p1, p2); break;
      case 'intro': this.phIntro(dt); break;
      case 'fight': this.phFight(dt, p1, p2); break;
      case 'ko': this.phKo(dt); break;
      case 'result': this.phResult(dt); break;
      case 'matchend': this.phMatchEnd(dt); break;
    }

    this.updateProjs(dt);
    this.updateFx(dt);
    this.updateCam();
    this.updateHud(dt);
    this.updateGarble(dt);
  };

  P.phTitle = function (dt, p1, p2) {
    this.phT -= dt;
    this.tB.setAlpha(Math.floor(this.t / 160) % 2 ? 1 : 0.25);
    if (this.phT <= 0 || p1.just.a || p1.just.b || p2.just.a || p2.just.b) {
      this.killTitle();
      this.startRound(1);
    }
    this.f1.render(); this.f2.render();
  };

  P.startRound = function (n) {
    this.round = n;
    this.timeLeft = ROUND_MS;
    this.f1.resetRound(120);
    this.f2.resetRound(240);
    this.f1.face = 1; this.f2.face = -1;
    this.clearProjs();
    this.ai.plan.length = 0; this.ai.think = 320;
    this.ph = 'intro'; this.phT = 1500;
    this.roundTxt.setText(this.L('第' + n + '回合'));
    this.announce('ROUND ' + n, this.L(n === 3 ? '最后一回合' : '准备'), true);
    this.f1.render(); this.f2.render();
  };

  P.phIntro = function (dt) {
    this.phT -= dt;
    if (this.phT <= 560 && this.annBig.text !== 'FIGHT !') {
      this.announce('FIGHT !', '', true);
      this.sfx('powerup', { rate: 1.2 });
    }
    this.f1.render(); this.f2.render();
    if (this.phT <= 0) { this.ph = 'fight'; this.hideAnnounce(); }
  };

  P.phFight = function (dt, p1, p2) {
    /* hitstop：命中瞬间双方定格几帧，打击感全靠它 */
    if (this.freeze > 0) {
      this.freeze -= dt;
      var jit = Math.floor(this.t / 22) % 2 ? 1 : -1;
      this.f1.render(jit); this.f2.render(-jit);
      return;
    }

    this.timeLeft -= dt;
    this.cheatTick(dt);

    this.faceEachOther();
    this.f1.step(dt, p1);
    this.f2.step(dt, p2);
    this.separate();
    this.resolveHits();
    this.f1.render(); this.f2.render();

    if (this.f1.hp <= 0 || this.f2.hp <= 0) { this.toKo(); return; }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.toKo(true); }
  };

  /* 面向：只在能动的时候翻，出招中不许背刺翻身 */
  P.faceEachOther = function () {
    var a = this.f1, b = this.f2;
    if (a.canAct() && Math.abs(a.x - b.x) > 6) a.face = b.x > a.x ? 1 : -1;
    if (b.canAct() && Math.abs(a.x - b.x) > 6) b.face = a.x > b.x ? 1 : -1;
  };

  /* 推挤：两人不能重叠；被顶到边界时改推对方 */
  P.separate = function () {
    var a = this.f1, b = this.f2;
    var d = b.x - a.x;
    var min = PUSH_W * 2 - 4;
    if (Math.abs(d) >= min) return;
    var dir = d >= 0 ? 1 : -1;
    var need = (min - Math.abs(d)) / 2;
    var ax = a.x - dir * need, bx = b.x + dir * need;
    if (ax < STAGE_L) { bx += STAGE_L - ax; ax = STAGE_L; }
    if (bx > STAGE_R) { ax -= bx - STAGE_R; bx = STAGE_R; }
    if (bx < STAGE_L) { ax += STAGE_L - bx; bx = STAGE_L; }
    if (ax > STAGE_R) { bx -= ax - STAGE_R; ax = STAGE_R; }
    a.x = SB.clamp(ax, STAGE_L, STAGE_R);
    b.x = SB.clamp(bx, STAGE_L, STAGE_R);
  };

  /* ================= 命中判定 ================= */
  P.resolveHits = function () {
    this.tryHit(this.f1, this.f2);
    this.tryHit(this.f2, this.f1);
  };

  P.tryHit = function (a, d) {
    if (!a.activeNow()) return;
    var hb = a.hitBox(), db = d.hurtBox();
    if (!this.hit(hb, db)) return;
    a.hitUsed = true;

    /* 无敌帧（升龙起手、起身）：判定被吃掉，但仍算「碰到了」以便取消 */
    if (d.invuln > 0 || d.st === 'down' || d.st === 'ko') {
      a.connected = true;
      this.sparkAt((hb.x + hb.w * 0.5 + d.x) * 0.5, hb.y + hb.h * 0.5, true);
      return;
    }
    var cx = Math.max(hb.x, db.x) + Math.min(hb.x + hb.w, db.x + db.w);
    cx = cx * 0.5;
    var cy = Math.max(hb.y, db.y) + Math.min(hb.y + hb.h, db.y + db.h);
    cy = cy * 0.5;

    if (d.canBlock(a.mv)) this.applyBlock(a, d, cx, cy);
    else this.applyHit(a, d, cx, cy);
  };

  P.applyHit = function (a, d, cx, cy) {
    var mv = a.mv;
    var dmg = mv.dmg || 0;

    /* 连段递减，防止一套打死 */
    a.combo++;
    a.comboT = COMBO_KEEP;
    if (a.combo > 1) dmg = dmg * Math.max(0.42, 1 - 0.13 * (a.combo - 1));

    /* 变态版：电脑这一下打你半条血 */
    var crit = false;
    if (a.critNext > 0) {
      var bonus = dmg * (a.critNext - 1);
      if (this.cheat.bonus + bonus > 46) bonus = Math.max(0, 46 - this.cheat.bonus);
      this.cheat.bonus += bonus;
      dmg += bonus;
      a.critNext = 0;
      crit = bonus > 2;
    }
    dmg = Math.round(dmg);

    var extra = 0;
    if (a.freeCombo > 0) { a.freeCombo--; extra = 9 * FR; }   // 变态版：一次「无限连」

    d.onHit(mv, dmg, a.face, extra);
    a.connected = true;
    a.addMeter((mv.meter || 6) * 0.9);

    /* hitstop：伤害越高定格越久 */
    this.freeze = Math.min(11, 4 + dmg * 0.34) * FR;

    this.sparkAt(cx, cy, false, crit || mv.sup);
    this.sfx(mv.sup ? 'explosion_s' : 'hit', { rate: mv.heavy ? 0.86 : 1.12 });
    if (mv.heavy || mv.sup || crit) this.shake(crit ? 260 : 150, mv.sup ? 4 : 2);
    if (crit) {
      this.flashScreen(SB.C.RED4, 90);
      this.floatTxt(cx, cy - 22, this.L('半条血!'), SB.C.RED5);
      this.garbleFlash();
    }
    if (a === this.f1) this.addScore(Math.round(dmg * 10));
    if (a.combo >= 2) this.floatTxt(cx, cy - 14, a.combo + ' HIT', SB.C.YEL4);
  };

  P.applyBlock = function (a, d, cx, cy) {
    var mv = a.mv;
    var chip = Math.max(1, Math.round((mv.dmg || mv.proj && mv.proj.dmg || 6) * 0.11));
    d.onBlocked(mv, chip, a.face);
    a.connected = true;
    a.addMeter((mv.meter || 5) * 0.4);
    this.freeze = 4 * FR;
    this.sparkAt(cx, cy, true);
    this.sfx('block', { rate: 1.0 });
    this.floatTxt(cx, cy - 16, this.L('防御'), SB.C.BLU5);
  };

  /* ================= 飞行道具 ================= */
  P.spawnProj = function (f, mv) {
    var p = mv.proj;
    var o = {
      x: f.x + f.face * 22, y: f.y - 34, vx: f.face * p.spd,
      owner: f, dmg: p.dmg, hs: p.hs, bs: p.bs, push: p.push,
      kd: !!p.kd, big: !!p.big, life: 2600, t: 0, w: p.w, h: p.h, lv: 'mid'
    };
    if (this.has('fight_spark')) {
      o.spr = this.spr(o.x, o.y, 'fight_spark', 0);
      o.spr.setOrigin(0.5, 0.5);
      o.spr.setTint(p.tint);
      o.spr.setScale(p.big ? 1.5 : 0.9, p.big ? 1.2 : 0.7);
    } else {
      o.spr = this.rect(o.x, o.y, p.w, p.h, p.tint, 1);
      o.spr.setOrigin(0.5, 0.5);
    }
    if (p.big) { this.flashScreen(SB.C.PUR4, 110); this.shake(200, 3); }
    this.projs.push(o);
  };

  P.updateProjs = function (dt) {
    var i, j, o, q, tgt, box;
    for (i = this.projs.length - 1; i >= 0; i--) {
      o = this.projs[i];
      if (this.freeze <= 0 && this.ph === 'fight') {
        o.x += o.vx * dt;
        o.t += dt; o.life -= dt;
      }
      if (o.spr.setFrame) o.spr.setFrame(Math.floor(o.t / 60) % 4);
      o.spr.setPosition(Math.round(o.x), Math.round(o.y));

      if (o.x < -20 || o.x > this.W + 20 || o.life <= 0) { this.killProj(i); continue; }

      /* 波与波对撞：一起消失（当年这个最有仪式感） */
      for (j = this.projs.length - 1; j >= 0; j--) {
        q = this.projs[j];
        if (q === o || q.owner === o.owner) continue;
        if (Math.abs(q.x - o.x) < 14 && Math.abs(q.y - o.y) < 14) {
          this.sparkAt((q.x + o.x) / 2, o.y, false, true);
          this.sfx('explosion_s', { rate: 1.3 });
          this.killProj(i);
          this.killProj(this.projs.indexOf(q));
          o = null; break;
        }
      }
      if (!o) continue;

      tgt = o.owner === this.f1 ? this.f2 : this.f1;
      if (tgt.invuln > 0 || tgt.st === 'down' || tgt.st === 'ko') continue;
      box = { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h };
      if (!this.hit(box, tgt.hurtBox())) continue;

      var fake = {
        dmg: o.dmg, hs: o.hs, bs: o.bs, push: o.push, kd: o.kd,
        lv: 'mid', meter: 5, heavy: o.big, sup: o.big
      };
      if (tgt.canBlock(fake)) {
        tgt.onBlocked(fake, Math.max(1, Math.round(o.dmg * 0.12)), o.vx > 0 ? 1 : -1);
        this.sparkAt(o.x, o.y, true);
        this.sfx('block');
      } else {
        var dmg = o.dmg;
        if (o.owner.critNext > 0) {
          var bn = Math.min(dmg * (o.owner.critNext - 1), Math.max(0, 46 - this.cheat.bonus));
          this.cheat.bonus += bn; dmg += bn; o.owner.critNext = 0;
          this.garbleFlash();
        }
        dmg = Math.round(dmg);
        tgt.onHit(fake, dmg, o.vx > 0 ? 1 : -1, 0);
        o.owner.addMeter(4);
        this.freeze = (o.big ? 10 : 6) * FR;
        this.sparkAt(o.x, o.y, false, o.big);
        this.sfx('hit', { rate: o.big ? 0.75 : 1 });
        this.shake(o.big ? 240 : 120, o.big ? 4 : 2);
        if (o.owner === this.f1) this.addScore(dmg * 10);
      }
      this.killProj(i);
    }
  };

  P.killProj = function (i) {
    if (i < 0 || i >= this.projs.length) return;
    var o = this.projs[i];
    if (o && o.spr) o.spr.destroy();
    this.projs.splice(i, 1);
  };
  P.clearProjs = function () { while (this.projs.length) this.killProj(0); };

  /* ================= 特效 ================= */
  P.sparkAt = function (x, y, isBlock, big) {
    var o;
    x = Math.round(x); y = Math.round(y);
    if (this.has('fight_spark')) {
      o = { spr: this.spr(x, y, 'fight_spark', 0), t: 0, life: 220, kind: 'anim' };
      o.spr.setOrigin(0.5, 0.5);
      o.spr.setScale(big ? 1.8 : (isBlock ? 0.85 : 1.15));
      if (isBlock) o.spr.setTint(SB.C.BLU5);
      else if (big) o.spr.setTint(SB.C.PUR4);
      if (this.scene.anims.exists('fight_spark_a')) o.spr.play('fight_spark_a');
    } else {
      o = { spr: this.rect(x - 6, y - 6, 12, 12, isBlock ? SB.C.BLU5 : SB.C.WHITE, 1), t: 0, life: 170, kind: 'rect' };
    }
    this.fx.push(o);
  };

  P.dustAt = function (x, y) {
    var o = { spr: this.rect(Math.round(x) - 8, Math.round(y) - 3, 16, 3, SB.C.WOOD6, 0.7), t: 0, life: 180, kind: 'rect' };
    this.fx.push(o);
  };

  P.floatTxt = function (x, y, s, tint) {
    /* 飘字画在 world 层，跟着镜头一起动 */
    var t = this.txt(Math.round(SB.clamp(x, 20, this.W - 40)), Math.round(SB.clamp(y, 60, 210)), s, 12, tint, false);
    t.setOrigin(0.5, 0.5);
    this.floats.push({ o: t, t: 0, life: 620 });
  };

  P.updateFx = function (dt) {
    var i, o;
    for (i = this.fx.length - 1; i >= 0; i--) {
      o = this.fx[i];
      o.t += dt;
      if (o.kind === 'rect') {
        o.spr.setAlpha(Math.max(0, 1 - o.t / o.life));
        o.spr.setScale(1 + o.t / o.life, 1 + o.t / o.life * 0.6);
      }
      if (o.t >= o.life) { o.spr.destroy(); this.fx.splice(i, 1); }
    }
    for (i = this.floats.length - 1; i >= 0; i--) {
      o = this.floats[i];
      o.t += dt;
      o.o.y -= dt * 0.016;
      o.o.setAlpha(o.t > o.life * 0.6 ? Math.max(0, 1 - (o.t - o.life * 0.6) / (o.life * 0.4)) : 1);
      if (o.t >= o.life) { o.o.destroy(); this.floats.splice(i, 1); }
    }
  };

  /* 必杀技出招瞬间的招式名 + 光效 */
  P.onSpecial = function (f, key) {
    var mv = MOVES[key];
    this.floatTxt(f.x, f.y - 62, this.L(mv.name) + '!', mv.sup ? SB.C.PUR4 : SB.C.GRN5);
    if (mv.sup) { this.flashScreen(SB.C.WHITE, 120); this.shake(240, 3); }
  };

  /* ================= 镜头（轻微横向跟随） ================= */
  P.updateCam = function () {
    var mid = (this.f1.x + this.f2.x) * 0.5;
    var sh = SB.clamp(-(mid - 180) * 0.28, -14, 14) + this.shakeX;
    this.world.x = Math.round(sh);
    this.world.y = 0;
  };

  /* ================= 回合演出 ================= */
  P.announce = function (big, sub, show) {
    this.annBig.setText(big).setVisible(!!show).setAlpha(1);
    this.annSub.setText(sub || '').setVisible(!!(show && sub));
  };
  P.hideAnnounce = function () {
    this.annBig.setVisible(false);
    this.annSub.setVisible(false);
  };

  P.toKo = function (timeUp) {
    var a = this.f1, b = this.f2, self = this;
    this.ph = 'ko'; this.phT = 2000;
    this.clearProjs();
    this.freeze = 0;
    this.slow = 620;

    if (timeUp) {
      this.winner = a.hp === b.hp ? 0 : (a.hp > b.hp ? 1 : 2);
      this.announce('TIME UP', this.L('时间到，血多者胜'), true);
      this.sfx('ui_error');
    } else {
      this.winner = a.hp <= 0 ? (b.hp <= 0 ? 0 : 2) : 1;
      this.announce('K.O. !', '', true);
      this.sfx('ko');
      this.shake(420, 5);
      this.flashScreen(SB.C.WHITE, 150);
    }
    if (a.hp <= 0) { a.st = 'ko'; a.stT = 0; a.kdPending = false; a.mv = null; a.fist.setVisible(false); }
    if (b.hp <= 0) { b.st = 'ko'; b.stT = 0; b.kdPending = false; b.mv = null; b.fist.setVisible(false); }
    if (this.winner === 1 && b.hp <= 0) { a.st = 'win'; a.stT = 0; a.mv = null; }
    if (this.winner === 2 && a.hp <= 0) { b.st = 'win'; b.stT = 0; b.mv = null; }
  };

  P.phKo = function (dt) {
    this.phT -= dt;
    this.annBig.setAlpha(Math.floor(this.t / 110) % 2 ? 1 : 0.35);
    /* 倒地/胜利姿态还要走物理，让被 KO 的人落到地上 */
    this.f1.physics(dt); this.f2.physics(dt);
    this.f1.render(); this.f2.render();
    if (this.phT <= 0) this.roundEnd();
  };

  P.roundEnd = function () {
    var a = this.f1, b = this.f2;
    if (this.winner === 1) a.wins++;
    else if (this.winner === 2) b.wins++;
    else { a.wins++; b.wins++; }

    var msg = this.winner === 1 ? '1P WIN' : (this.winner === 2 ? '2P WIN' : 'DRAW');
    var sub = '';
    if (this.winner === 1) sub = this.L(this.twoP ? '这局你赢了' : '电脑输了一局');
    else if (this.winner === 2) sub = this.L(this.twoP ? '2P 赢了这局' : '这卡是改过的吧');
    else sub = this.L('两个人一起倒了');
    this.announce(msg, sub, true);
    if (this.winner === 1) this.addScore(1200);

    /* 电脑难度做橡皮筋：它输了就变凶一点，你输了就手下留情一点 */
    if (!this.twoP) {
      if (this.winner === 1) this.ai.lv = Math.min(2.4, this.ai.lv + 0.45);
      else if (this.winner === 2) this.ai.lv = Math.max(0.55, this.ai.lv - 0.3);
    }
    this.ph = 'result'; this.phT = 1700;
  };

  P.phResult = function (dt) {
    this.phT -= dt;
    this.f1.physics(dt); this.f2.physics(dt);
    this.f1.render(); this.f2.render();
    if (this.phT > 0) return;
    if (this.f1.wins >= NEED_WIN || this.f2.wins >= NEED_WIN || this.round >= 3) this.matchEnd();
    else this.startRound(this.round + 1);
  };

  P.matchEnd = function () {
    var a = this.f1, b = this.f2;
    var win = a.wins > b.wins ? 1 : (b.wins > a.wins ? 2 : (a.hp >= b.hp ? 1 : 2));
    this.matchWin = win;
    this.ph = 'matchend'; this.phT = 2100;
    if (win === 1) {
      this.announce('YOU WIN', this.L(this.twoP ? '1P 拿下这一场' : '你打赢了改过的卡'), true);
      this.sfx('stage_clear');
    } else {
      this.announce('YOU LOSE', this.L(this.twoP ? '2P 拿下这一场' : '再来一局，这次一定'), true);
      this.sfx('player_die');
    }
  };

  P.phMatchEnd = function (dt) {
    this.phT -= dt;
    this.annBig.setAlpha(Math.floor(this.t / 150) % 2 ? 1 : 0.5);
    this.f1.physics(dt); this.f2.physics(dt);
    this.f1.render(); this.f2.render();
    if (this.phT > 0) return;
    if (this.matchWin === 1) this.clearGame();
    else this.gameOver(1600);
    this.ph = 'done';
  };

  /* ================= HUD 刷新 ================= */
  P.updateHud = function (dt) {
    var i, r1 = this.f1.hp / MAX_HP, r2 = this.f2.hp / MAX_HP;

    /* 迟一步的红条：看得见「刚刚掉了多少」 */
    this.hpLag1 = Math.max(this.f1.hp, this.hpLag1 - dt * 0.045);
    this.hpLag2 = Math.max(this.f2.hp, this.hpLag2 - dt * 0.045);
    if (this.hpLag1 < this.f1.hp) this.hpLag1 = this.f1.hp;
    if (this.hpLag2 < this.f2.hp) this.hpLag2 = this.f2.hp;

    var w1 = Math.round(134 * r1), w2 = Math.round(134 * r2);
    var l1 = Math.round(134 * (this.hpLag1 / MAX_HP)), l2 = Math.round(134 * (this.hpLag2 / MAX_HP));

    this.hpFill1.setSize(Math.max(0, w1), 8);
    this.hpLagR1.setPosition(this.barX1 + 3 + w1, this.barY + 3);
    this.hpLagR1.setSize(Math.max(0, l1 - w1), 8);

    this.hpFill2.setPosition(this.barX2 + 3 + (134 - w2), this.barY + 3);
    this.hpFill2.setSize(Math.max(0, w2), 8);
    this.hpLagR2.setPosition(this.barX2 + 3 + (134 - l2), this.barY + 3);
    this.hpLagR2.setSize(Math.max(0, l2 - w2), 8);

    /* 血少了变红 */
    this.hpFill1.setFillStyle(r1 < 0.25 ? SB.C.RED4 : (r1 < 0.5 ? SB.C.YEL2 : SB.C.YEL3), 1);
    this.hpFill2.setFillStyle(r2 < 0.25 ? SB.C.RED4 : (r2 < 0.5 ? SB.C.YEL2 : SB.C.YEL3), 1);

    /* 能量槽 */
    this.mFill1.setSize(Math.round(108 * this.f1.meter / MAX_METER), 5);
    this.mFill2.setSize(Math.round(108 * this.f2.meter / MAX_METER), 5);
    var full = Math.floor(this.t / 130) % 2 ? SB.C.YEL4 : SB.C.PUR4;
    this.mFill1.setFillStyle(this.f1.meter >= MAX_METER ? full : SB.C.BLU4, 1);
    this.mFill2.setFillStyle(this.f2.meter >= MAX_METER ? full : SB.C.BLU4, 1);
    this.mTxt1.setTint(this.f1.meter >= MAX_METER ? SB.C.YEL4 : SB.C.GREY6);
    this.mTxt2.setTint(this.f2.meter >= MAX_METER ? SB.C.YEL4 : SB.C.GREY6);

    /* 星标 */
    for (i = 0; i < 2; i++) {
      this.stars[0][i].setTint(this.f1.wins > i ? SB.C.YEL3 : SB.C.GREY4);
      this.stars[1][i].setTint(this.f2.wins > i ? SB.C.YEL3 : SB.C.GREY4);
    }

    /* 倒计时 */
    var sec = Math.ceil(this.timeLeft / 1000);
    this.timeTxt.setText(sec < 10 ? '0' + sec : '' + sec);
    this.timeTxt.setTint(sec <= 10 ? (Math.floor(this.t / 200) % 2 ? SB.C.RED4 : SB.C.WHITE) : SB.C.WHITE);

    /* 连段计数 */
    this.comboTxt1.setText(this.f1.combo >= 2 && this.f1.comboT > 0 ? this.f1.combo + ' HIT' : '');
    this.comboTxt2.setText(this.f2.combo >= 2 && this.f2.comboT > 0 ? this.f2.combo + ' HIT' : '');

    /* 秘技表：有人靠近就淡一点，别挡住打架 */
    if (this.magOn) {
      var near = Math.min(this.f1.x, this.f2.x) < 120 ? 0.16 : 0.45;
      this.magBg.setAlpha(near);
      for (i = 0; i < this.magLines.length; i++) this.magLines[i].setAlpha(near * 1.8);
      this.magTitle.setAlpha(near * 1.9);
    }
  };

  /* ================= 变态版彩蛋 =================
   * 当年盗版改版卡的真实体验：电脑莫名回血、一招打你半条血、突然一套连不完。
   * 但必须有限度 —— 最多让人骂一句「这卡是改过的吧」，不能让人赢不了。 */
  P.cheatTick = function (dt) {
    if (this.twoP) return;                       // 人打人的时候不作弊
    var ai = this.f2, pl = this.f1, c = this.cheat;
    c.t += dt;
    if (c.n >= 3) return;
    if (this.t - c.last < 9000) return;
    if (c.t < 1600) return;
    c.t = 0;
    if (pl.hp < MAX_HP * 0.32) return;           // 玩家快死了就别再偏袒了
    if (ai.hp > pl.hp + 20) return;              // 电脑本来就赢着，不用帮
    if (!SB.chance(0.34)) return;

    var kinds = [];
    if (ai.hp < MAX_HP * 0.55 && c.healed < 30) kinds.push('heal');
    kinds.push('crit');
    if (ai.hp < pl.hp) kinds.push('combo');
    var kind = SB.pick(kinds);

    c.n++; c.last = this.t;
    if (kind === 'heal') {
      var amt = Math.min(14, 30 - c.healed, Math.max(0, MAX_HP * 0.7 - ai.hp));
      if (amt <= 0) return;
      ai.hp = Math.min(MAX_HP, ai.hp + amt);
      c.healed += amt;
      this.floatTxt(ai.x, ai.y - 62, this.L('血量+') + Math.round(amt) + '?', SB.C.GRN5);
    } else if (kind === 'crit') {
      ai.critNext = 2.0;
      this.floatTxt(ai.x, ai.y - 62, '■■?!', SB.C.RED5);
    } else {
      ai.freeCombo = 4;
      this.floatTxt(ai.x, ai.y - 62, this.L('无限连') + '?', SB.C.PUR4);
      /* 直接给 AI 塞一套连招计划 */
      this.ai.plan.length = 0;
      this.aiCombo(true);
    }
    this.garbleFlash();
  };

  /* 屏幕角落闪一下乱码 —— 改版卡的签名 */
  P.garbleFlash = function () {
    var pool = ['■■?9 加强', 'DATA■■?', '气?血+9■', '99■■版', 'P2■■?!'];
    this.glTxt.setText(SB.pick(pool));
    this.garbleT = 700;
    this.shakeX = 2;
    this.sfx('glitch_burst', { rate: 1.4, volume: 0.5 });
  };

  P.updateGarble = function (dt) {
    if (this.garbleT > 0) {
      this.garbleT -= dt;
      var on = Math.floor(this.t / 70) % 2 === 0;
      this.glBg.setVisible(on); this.glTxt.setVisible(on);
      if (this.garbleT <= 0) { this.glBg.setVisible(false); this.glTxt.setVisible(false); }
    }
    if (this.shakeX !== 0) {
      this.shakeX = this.shakeX > 0 ? this.shakeX - dt * 0.02 : 0;
      if (this.shakeX < 0.1) this.shakeX = 0;
    }
  };

  /* ================= AI =================
   * AI 不直接改角色状态，而是「按手柄」，所以它和人共用同一套出招/取消/指令识别。
   * 计划(plan) 是一串 {t: 持续毫秒, d: 相对面向的方向符号, a/b: 按键}。 */
  P.aiUpdate = function (dt) {
    var pad = this.vpad, me = this.f2, op = this.f1, A = this.ai;
    pad.clear();
    if (this.ph !== 'fight' || this.freeze > 0) { pad.commit(); return; }
    if (me.st === 'hurt' || me.st === 'down' || me.st === 'ko' || me.st === 'getup') {
      A.plan.length = 0; A.think = 120; pad.commit(); return;
    }
    if (A.reactCd > 0) A.reactCd -= dt;
    this.aiReact(op, me);

    if (A.plan.length) {
      var s = A.plan[0];
      s.t -= dt;
      symToPad(s.d, me.face, pad.want);
      if (s.a) pad.want.a = true;
      if (s.b) pad.want.b = true;
      if (s.t <= 0) A.plan.shift();
    } else {
      A.think -= dt;
      if (A.think <= 0) {
        /* 别贴着人一直打：对手还在受击硬直里时，按难度给点喘气时间，
         * 不然玩起来就真是「无限连的盗版卡」，那是彩蛋，不该是常态。 */
        if (op.st === 'hurt' && !me.freeCombo && SB.chance(0.36 - 0.14 * A.lv)) {
          A.plan.push({ t: SB.rnd(220, 440) });
        } else {
          this.aiDecide(op, me);
        }
        A.think = SB.rnd(70, 210) / Math.max(0.6, A.lv);
      }
    }
    pad.commit();
  };

  /* 反应：对手起手 → 防御；对手在头顶 → 升龙；波打过来 → 跳过去或防 */
  P.aiReact = function (op, me) {
    var A = this.ai;
    if (A.reactCd > 0) return;
    var dx = Math.abs(op.x - me.x), i, o;
    var bp = Math.min(0.62, 0.20 + 0.16 * A.lv);

    /* 飞行道具 */
    for (i = 0; i < this.projs.length; i++) {
      o = this.projs[i];
      if (o.owner === me) continue;
      if ((o.vx > 0) !== (me.x > o.x)) continue;
      if (Math.abs(o.x - me.x) > 130) continue;
      A.plan.length = 0; A.reactCd = 600;
      if (SB.chance(0.4)) { this.aiJumpIn(); }
      else A.plan.push({ t: 620, d: '4' });
      return;
    }
    /* 对手跳到近处 → 升龙拳对空 */
    if (op.air && dx < 66 && SB.chance(0.30 * A.lv)) {
      A.plan.length = 0; A.reactCd = 900;
      this.aiCmd('dragon');
      return;
    }
    /* 对手出招起手 */
    if (op.st === 'attack' && op.mv && op.mvT < op.mv.su * FR && dx < 78 && SB.chance(bp)) {
      A.plan.length = 0; A.reactCd = 700;
      A.plan.push({ t: SB.rnd(280, 460), d: op.mv.lv === 'low' ? '1' : '4' });
    }
  };

  P.aiDecide = function (op, me) {
    var dx = Math.abs(op.x - me.x), lv = this.ai.lv, r = Math.random();
    /* 被压到角上就别再往后退了，改成打回去 */
    var cornered = (me.face > 0 ? me.x - STAGE_L : STAGE_R - me.x) < 34;

    if (dx > 120) {
      if (r < 0.26) this.aiCmd('qi');                       // 远距离丢波，逼你跳
      else if (r < 0.40) this.aiJumpIn();
      else this.aiWalk(1, SB.rnd(340, 700));
    } else if (dx > 58) {
      if (r < 0.26) this.aiWalk(1, SB.rnd(200, 380));       // 走进有效距离
      else if (r < 0.44 + 0.08 * lv) { this.aiWalk(1, 170); this.aiPress('b', false); }
      else if (r < 0.56) this.aiCmd('whirl');               // 突进腿抢中距离
      else if (r < 0.64) this.aiGuard(SB.rnd(240, 400));
      else if (r < 0.76) this.aiJumpIn();
      else if (r < 0.90) { this.aiWalk(1, 140); this.aiPress('b', true); }
      else if (cornered) this.aiWalk(1, 260);
      else this.aiWalk(-1, SB.rnd(140, 260));
    } else {
      if (me.meter >= MAX_METER && r < 0.22) this.aiCmd('superqi');    // 满能量就放超必杀
      else if (r < 0.32 + 0.14 * lv) this.aiCombo();
      else if (r < 0.50) this.aiPress('b', true);           // 扫腿
      else if (r < 0.62) this.aiPress('a', false);          // 直拳
      else if (r < 0.72) this.aiFwd('a');                   // →+A 上勾拳
      else if (r < 0.80) this.aiGuard(SB.rnd(220, 380));
      else if (r < 0.90) this.aiCmd('dragon');
      else if (cornered) this.aiCombo();
      else this.aiWalk(-1, SB.rnd(140, 260));
    }
  };

  P.aiWalk = function (dir, ms) { this.ai.plan.push({ t: ms, d: dir > 0 ? '6' : '4' }); };
  P.aiGuard = function (ms) { this.ai.plan.push({ t: ms, d: SB.chance(0.4) ? '1' : '4' }); };
  P.aiPress = function (btn, down) {
    var p = this.ai.plan;
    p.push({ t: 40, d: down ? '2' : null, a: btn === 'a', b: btn === 'b' });
    p.push({ t: 130, d: down ? '2' : null });
  };
  P.aiFwd = function (btn) {
    var p = this.ai.plan;
    p.push({ t: 60, d: '6' });
    p.push({ t: 45, d: '6', a: btn === 'a', b: btn === 'b' });
    p.push({ t: 170 });
  };
  P.aiCombo = function (long) {
    var p = this.ai.plan, i, n = long ? 5 : (SB.chance(0.5) ? 3 : 2);
    for (i = 0; i < n; i++) {
      p.push({ t: 38, a: true });
      p.push({ t: 58 });
    }
    /* 收尾换个重的，或者取消成必杀 */
    if (SB.chance(0.4)) this.aiCmd('qi');
    else { p.push({ t: 40, d: '6', b: true }); p.push({ t: 180 }); }
  };
  P.aiJumpIn = function () {
    var p = this.ai.plan;
    p.push({ t: 70, d: '9' });
    p.push({ t: 210, d: '6' });
    p.push({ t: 45, d: '6', a: SB.chance(0.5), b: true });
    p.push({ t: 200, d: '6' });
  };
  P.aiCmd = function (key) {
    var p = this.ai.plan;
    if (key === 'qi') {
      p.push({ t: 70, d: '2' }); p.push({ t: 55, d: '3' });
      p.push({ t: 50, d: '6', a: true }); p.push({ t: 120, d: '6' });
    } else if (key === 'dragon') {
      p.push({ t: 55, d: '6' }); p.push({ t: 60, d: '2' });
      p.push({ t: 50, d: '3', a: true }); p.push({ t: 150 });
    } else if (key === 'whirl') {
      p.push({ t: 70, d: '2' }); p.push({ t: 55, d: '1' });
      p.push({ t: 50, d: '4', b: true }); p.push({ t: 150 });
    } else if (key === 'superqi') {
      p.push({ t: 70, d: '2' }); p.push({ t: 55, d: '3' });
      p.push({ t: 60, d: '6', a: true, b: true }); p.push({ t: 200, d: '6' });
    }
  };

  /* ================= 清理 ================= */
  P.destroy = function () {
    var i;
    for (i = 0; i < this.fx.length; i++) if (this.fx[i].spr) this.fx[i].spr.destroy();
    for (i = 0; i < this.floats.length; i++) if (this.floats[i].o) this.floats[i].o.destroy();
    for (i = 0; i < this.projs.length; i++) if (this.projs[i].spr) this.projs[i].spr.destroy();
    this.fx.length = 0; this.floats.length = 0; this.projs.length = 0;
    this.f1 = this.f2 = null;
    this.titleParts = null;
    SB.GameBase.prototype.destroy.call(this);
  };

  SB.Games = SB.Games || {};
  SB.Games.fight = FightGame;

})(window.SB);
