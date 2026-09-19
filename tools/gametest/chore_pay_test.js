/* 「主动干活挣钱」+「收钱特写」的回归。
 *
 * 这一份要盯死的是两件容易坏、坏了还不容易发现的事：
 *
 *   规矩（SB.Chore）
 *     1. 碗只在饭点之后有：上午 / 中午 / 晚上，一顿一次，一天顶到三次。
 *     2. 地只白天扫，垃圾只等傍晚那趟车，小卖部只在开门的时候搬货。
 *     3. 没劲了就干不了，而且是 'ap' 这个原因，不是含糊的「不行」。
 *     4. 妈不在家：活照干，钱先挂着，不涨信任，不当场进兜。
 *     5. 跨天清今天干过几回，但绝不许把挂账一起清掉 —— 活是真干了的。
 *
 *   钱（SB.PayAnim）
 *     6. 钱不许丢。一枚一枚数完、按 B 一把数完、场景被强行掐掉，
 *        三条路进兜的金额必须一模一样。
 *     7. 进账只发生一次。日常事件（rollEvent 已经记过账）那一屏只演不记。
 *     8. 演出期间锁输入（SB.__interludeOpen > 0），取景框不压 HUD。
 *     9. 同一天看第二遍、第三遍要变短，不然刷三回碗就成了罚站。
 *
 * 用法：先起 python3 -m http.server 8142
 *       再 node tools/gametest/chore_pay_test.js [端口]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || process.env.PORT || '8142';
const OUT = path.join(__dirname, 'chore_pay');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  /* 两种参数顺序都收：(条件, 名字) 和 (名字, 条件)。
   * 顺序写反会让断言全变成「PASS true」，看着全绿其实什么都没测 —— 
   * 这一份第一版就是这么骗过自己的。 */
  if (typeof c === 'string' && typeof m !== 'string') { const t = c; c = m; m = t; }
  if (c) { pass++; console.log('  PASS ' + m); }
  else { fail++; console.log('  FAIL ' + m + (extra ? '  << ' + extra : '')); }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const shot = (tag) => page.screenshot({ path: path.join(OUT, 'shot_' + tag + '.png') });

  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3200);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await sleep(1200);

  ok('页面起得来，四张收钱贴图都装好了', await page.evaluate(() => {
    const S = window.SB;
    return !!(S && S.Chore && S.PayAnim && S.CHORES && S.CHORES.length === 4);
  }));

  /* =================================================================
   * 第一段：规矩。纯逻辑，不碰画面，全在一次 evaluate 里跑完。
   * ================================================================= */
  console.log('\n-- 一、干活的规矩 --');
  const rules = await page.evaluate(() => {
    const S = window.SB, R = [];
    const say = (name, cond, extra) => R.push([name, !!cond, extra === undefined ? '' : String(extra)]);

    /* 干净档，妈妈状态由我们说了算 */
    const fresh = (slot, home) => {
      S.Save.reset();
      const s = S.Save.d;
      s.seenIntro = true;
      s.slot = slot === undefined ? 0 : slot;
      s.ap = 4;
      s.__momHome = home === undefined ? true : home;
      s.flags.momOut = false;
      s.chores.day = s.day;      // 不写这一行，第一次 cs() 会当成跨天把 seed 清掉
      return s;
    };
    const SLOT = { morning: 0, noon: 1, after: 2, dusk: 3, night: 4 };

    /* ---- 1. 碗的时段 ---- */
    let good = [], bad = [];
    Object.keys(SLOT).forEach(k => {
      fresh(SLOT[k], true);
      (S.Chore.check('dish').ok ? good : bad).push(k);
    });
    say('碗只在三个饭点后有：上午 / 中午 / 晚上',
      good.join(',') === 'morning,noon,night' && bad.join(',') === 'after,dusk',
      '能刷=' + good.join('/') + ' 不能=' + bad.join('/'));

    fresh(SLOT.after, true);
    say('不是饭点按下去会告诉你「得等下一顿饭吃完」',
      S.Chore.check('dish').code === 'slot' &&
      S.Chore.check('dish').why.indexOf('下一顿') >= 0,
      S.Chore.check('dish').why);

    /* ---- 2. 一顿饭只刷一次 ---- */
    fresh(SLOT.morning, true);
    S.Save.d.chores.done.dish = 1;
    S.Save.d.chores.slots.dish = [SLOT.morning];
    say('这顿的碗刷过了，同一个时段不让再刷',
      S.Chore.check('dish').code === 'slotDone', S.Chore.check('dish').code);
    S.Save.d.slot = SLOT.noon;
    say('换了一顿饭，碗又有了', S.Chore.check('dish').ok === true);

    /* ---- 3. 一天顶三回 ---- */
    fresh(SLOT.night, true);
    S.Save.d.chores.done.dish = 3;
    S.Save.d.chores.slots.dish = [SLOT.morning, SLOT.noon, SLOT.after];
    say('一天刷满三回就到顶了',
      S.Chore.check('dish').code === 'max' &&
      S.Chore.check('dish').why.indexOf('3') >= 0, S.Chore.check('dish').why);

    /* ---- 4. 别的活的时段 ---- */
    const slotsOf = (id) => {
      const out = [];
      Object.keys(SLOT).forEach(k => { fresh(SLOT[k], true); if (S.Chore.check(id).ok) out.push(k); });
      return out.join(',');
    };
    say('地只趁白天扫', slotsOf('sweep') === 'morning,after', slotsOf('sweep'));
    say('垃圾只等傍晚那趟车', slotsOf('trash_out') === 'dusk,night', slotsOf('trash_out'));
    say('小卖部只在开门的时候搬货', slotsOf('haul') === 'morning,after,dusk', slotsOf('haul'));
    say('扫地 / 倒垃圾 / 搬货都是一天一次',
      ['sweep', 'trash_out', 'haul'].every(id => S.Chore.byId(id).max === 1));

    /* ---- 5. 没劲了 ---- */
    fresh(SLOT.noon, true);
    S.Save.d.ap = 0;
    say('没劲了就干不了，而且说得出是没劲',
      S.Chore.check('dish').code === 'ap' && S.Chore.check('dish').why.indexOf('没劲') >= 0,
      S.Chore.check('dish').why);

    /* ---- 6. 妈在家：当场给，但钱不在这一层进兜 ---- */
    let s = fresh(SLOT.noon, true);
    const m0 = s.money, tr0 = s.momTrust;
    let r = S.Chore.doChore('dish');
    say('妈在屋里，刷完碗是「当场给钱」', r.ok && r.paid === true && r.owed === false,
      JSON.stringify({ paid: r.paid, owed: r.owed }));
    say('她看见你干了，信任才涨', r.sawIt === true && s.momTrust > tr0, tr0 + '→' + s.momTrust);
    say('钱还没进兜 —— 要等收钱那一屏把钱递到手里', s.money === m0, m0 + '→' + s.money);
    say('刷碗记了一次', S.Chore.doneToday('dish') === 1);
    say('干活花掉一格精力', s.ap === 3, 'ap=' + s.ap);

    /* ---- 7. 妈不在家：挂账 ---- */
    s = fresh(SLOT.noon, false);
    const tr1 = s.momTrust, m1 = s.money;
    r = S.Chore.doChore('dish');
    say('她不在家，碗照样能刷', r.ok === true);
    say('没人给钱，先挂着', r.owed === true && S.Chore.owed() === 0.2,
      '挂账 ' + S.Chore.owed());
    say('她没看见，信任不涨', s.momTrust === tr1, tr1 + '→' + s.momTrust);
    say('挂着的钱没进兜', s.money === m1);
    say('挂账记得住这笔是干什么挣的', S.Chore.owedSrc() === 'dish', S.Chore.owedSrc());

    /* 搬货是老板给的，跟妈在不在家没关系 */
    s = fresh(SLOT.morning, false);
    r = S.Chore.doChore('haul');
    say('小卖部搬货是老板给钱，妈不在家也当场结', r.ok && r.paid === true && r.payer === 'shop',
      JSON.stringify({ paid: r.paid, payer: r.payer }));

    /* ---- 8. 跨天 ---- */
    s = fresh(SLOT.noon, false);
    S.Chore.doChore('dish');
    const owedBefore = S.Chore.owed();
    s.day = s.day + 1;
    say('新的一天，今天干过几回清零', S.Chore.doneToday('dish') === 0);
    say('但挂账绝不能跟着跨天清掉', S.Chore.owed() === owedBefore,
      owedBefore + '→' + S.Chore.owed());

    /* 结算挂账：交出去之后自己清零 */
    const got = S.Chore.takeOwed();
    say('挂账结算交得出金额和来源', got && got.pay === owedBefore && got.payer === 'mom',
      JSON.stringify(got));
    say('结算过一次就清零，不会重复给', S.Chore.owed() === 0 && S.Chore.takeOwed() === null);

    /* ---- 9. 谁给钱 ---- */
    const who = (src) => { const p = S.Chore.payerOf(src); return p ? p.id : 'null'; };
    say('家里的活是妈给钱',
      ['dish', 'sweep', 'trash_out', 'soy', 'exam'].every(k => who(k) === 'mom'));
    say('瓶子 / 废纸 / 旧课本是收废品的老汉给钱',
      ['trash', 'bottle', 'books'].every(k => who(k) === 'laohan'));
    say('跑腿搬货是小卖部老板给钱', who('errand') === 'shop');
    say('沙发缝里摸到的钱没人给，不走收钱屏',
      who('find') === 'null' && who('allowance') === 'null');

    /* ---- 10. 拆钱 ---- */
    const bd = (v) => S.Chore.breakdown(v).join('+');
    say('两毛就是一枚两毛', bd(0.2) === '0.2', bd(0.2));
    say('一块二拆成一块加两毛', bd(1.2) === '1+0.2', bd(1.2));
    say('三块七拆成 2+1+0.5+0.2', bd(3.7) === '2+1+0.5+0.2', bd(3.7));
    say('拆出来的加回去一分不差',
      [0.1, 0.2, 0.5, 1.2, 3.7, 12.6].every(v =>
        Math.round(S.Chore.breakdown(v).reduce((a, b) => a + b, 0) * 10) / 10 === v));
    say('再大的数也不会数到手酸（最多八件）',
      S.Chore.breakdown(48.9).length <= 8, S.Chore.breakdown(48.9).length + ' 件');

    /* ---- 11. 菜单：干不了的活也要能选中，不然读不到原因 ---- */
    fresh(SLOT.after, true);
    const items = S.Chore.items();
    say('小方桌那一屏四样活全列出来', items.length === 4);
    say('干不了的活不置灰 —— 灰的行光标跳不过去，就读不到为什么',
      items.every(it => !it.disabled));
    say('干不了的活右边小字是暗的，而且说得出原因',
      items.filter(it => it.__code !== 'ok').every(it => it.subTint !== undefined && it.__why));

    /* ---- 12. 存档 ---- */
    say('存档版本升到 4', S.Save.VER === 4, 'VER=' + S.Save.VER);
    /* 老档（v3，没有 chores）迁移 */
    S.Save.reset();
    const old = JSON.parse(JSON.stringify(S.Save.d));
    old.v = 3; old.day = 7; delete old.chores;
    localStorage.setItem('nianhong_save_v1', JSON.stringify(old));
    S.Save.load();
    const c = S.Save.d.chores;
    say('v3 的老档读进来会补上 chores，而且不崩',
      !!c && c.day === 7 && c.owed === 0 && Object.keys(c.done).length === 0,
      JSON.stringify(c));

    return R;
  });
  rules.forEach(([n, c, e]) => ok(c, n, e));

  /* =================================================================
   * 第二段：收钱那一屏。真按键盘。
   * ================================================================= */
  console.log('\n-- 二、收钱特写 --');

  /* 干净档 + 直接进客厅，妈妈在不在家由参数说 */
  const enterRoom = async (slot, home) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      const s = S.Save.d;
      s.seenIntro = true;
      s.slot = a.slot;
      s.ap = 4;
      s.__momHome = a.home;
      s.flags.momOut = false;
      s.flags.dayRolled = s.day;        // 别在这儿摇日常事件，免得抢戏
      s.seated = false;
      S.Save.save();
      if (S.PayAnim) S.PayAnim.resetSeen();
      const g = S.game;
      g.scene.getScenes(true).forEach(x => {
        if (x.scene.key !== 'Sys' && x.scene.key !== 'Room') x.scene.stop();
      });
      const t = g.scene.getScene('Room');
      if (t && t.scene.isActive()) t.scene.restart({ from: 'test' });
      else g.scene.start('Room', { from: 'test' });
    }, { slot: slot, home: home });
    await sleep(1000);
    for (let i = 0; i < 12; i++) {
      if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
      await page.keyboard.press('x');
      await sleep(200);
    }
    await sleep(250);
  };

  const st = () => page.evaluate(() => {
    const S = window.SB, s = S.Save.d;
    const r = S.game.scene.getScene('Room');
    const show = r && r.__paySpy;
    return {
      money: s.money,
      owed: S.Chore.owed(),
      dish: S.Chore.doneToday('dish'),
      interlude: S.__interludeOpen || 0,
      dialog: !!S.__dialogOpen,
      stage: show ? show.stage : '',
      counted: show ? show.counted : -1,
      total: show ? show.items.length : -1,
      got: show ? show.got : -1,
      closed: show ? !!show.closed : null,
      ledgerToday: S.Story.todayTotal()
    };
  });

  /* 把 PayAnim.play 包一层，好在测试里看见那一屏的内部状态 */
  await page.evaluate(() => {
    const S = window.SB, orig = S.PayAnim.play.bind(S.PayAnim);
    S.PayAnim.play = function (scene, opts) {
      const show = orig(scene, opts);
      scene.__paySpy = show;
      return show;
    };
  });

  /* 菜单导航另有断言盯（下面抄 openMenu 的配置），这里直接走生产路径
   * doChore -> say -> payAndCheer -> PayAnim，免得靠一串盲按键去猜光标在哪行。
   * 盲按键多按一下就会顺手把下一样活也干了（第一版就这么挣出了 0.5 块）。 */
  const startChore = async (id) => {
    await page.evaluate((cid) => {
      const S = window.SB, r = S.game.scene.getScene('Room');
      r.__paySpy = null;
      r.busy = false;
      r.doChore(cid);
    }, id);
    await sleep(320);
    /* 干活那几句话推完，推到收钱屏起来、或者话说完了（挂账那条路） */
    for (let i = 0; i < 12; i++) {
      const s = await st();
      if (s.stage && s.stage !== 'over') break;
      if (!s.dialog) break;
      await page.keyboard.press('x');
      await sleep(280);
    }
    await sleep(320);
  };

  /* 一枚一枚数到底，再按 A 收起来 */
  const countOneByOne = async () => {
    let presses = 0;
    for (let i = 0; i < 14; i++) {
      const s = await st();
      if (s.stage === '' || s.closed) break;
      await page.keyboard.press('x');
      presses++;
      await sleep(300);
    }
    await sleep(800);
    return presses;
  };

  /* ---- 菜单长什么样（抄配置，不真开）---- */
  await enterRoom(1, true);   // 中午，妈在屋里
  const deskItems = await page.evaluate(() => {
    const r = window.SB.game.scene.getScene('Room');
    const real = r.openMenu;
    let cfg = null;
    r.openMenu = function (opts) { cfg = opts; };
    r.deskMenu();
    r.openMenu = real;
    r.busy = false;
    return cfg ? { title: cfg.title, labels: cfg.items.map(i => i.label), subs: cfg.items.map(i => i.sub || '') } : null;
  });
  ok('小方桌上摆着「帮家里干活」这一项',
    !!deskItems && deskItems.labels.indexOf('帮家里干活') >= 0,
    deskItems && deskItems.labels.join(' / '));
  ok('挣钱这一项就写着「这会儿有几样能干」，不用点进去猜',
    !!deskItems && /这会儿(有 \d+ 样能干|没活)/.test(deskItems.subs[deskItems.labels.indexOf('帮家里干活')] || ''),
    deskItems && deskItems.subs.join(' / '));

  const choreItems = await page.evaluate(() => {
    const r = window.SB.game.scene.getScene('Room');
    const real = r.openMenu;
    let cfg = null;
    r.openMenu = function (opts) { cfg = opts; };
    r.choreMenu();
    r.openMenu = real;
    r.busy = false;
    return cfg ? { title: cfg.title, labels: cfg.items.map(i => i.label) } : null;
  });
  ok('干活那一屏头一行先告诉你妈在不在家',
    !!choreItems && /妈(在屋里|不在家)/.test(choreItems.labels[0]),
    choreItems && choreItems.labels.join(' / '));
  ok('四样活加上「不干了」都在',
    !!choreItems && choreItems.labels.length === 6 &&
    choreItems.labels.indexOf('刷碗') >= 0 && choreItems.labels.indexOf('帮小卖部搬货') >= 0,
    choreItems && choreItems.labels.join(' / '));

  /* ---- 取景框的位置 ---- */
  const geo = await page.evaluate(() => {
    const S = window.SB;
    return {
      W: S.W, H: S.H,
      x: S.PayAnim.BOX.x, y: S.PayAnim.BOX.y,
      fw: S.PayAnim.FW, fh: S.PayAnim.FH,
      capY: S.PayAnim.BOX.y + S.PayAnim.FH + 6,
      tipY: S.PayAnim.BOX.y + S.PayAnim.FH + 45,
      barBottom: S.PayAnim.BOX.y + S.PayAnim.FH + 3 + 57
    };
  });
  ok('取景框横向是居中的', geo.x * 2 + geo.fw === geo.W,
    'x=' + geo.x + ' fw=' + geo.fw + ' W=' + geo.W);
  ok('地点条在框上头，还留在屏幕里', geo.y - 14 >= 0, 'y=' + geo.y);
  ok('字幕条整条都在屏幕里', geo.barBottom <= geo.H,
    '字幕底 ' + geo.barBottom + ' / 屏高 ' + geo.H);
  /* 台词是「动作 + 她说的那句」连着写的，最长折到三行，
   * 所以「按 A 一张一张数」必须让到第四行。原来放在第二行的位置，
   * 被台词整整压住，一个字都看不见。 */
  const wrapMax = await page.evaluate(() => {
    const S = window.SB, L = S.L.pay;
    let worst = 0, sample = '';
    Object.keys(L).forEach(who => Object.keys(L[who]).forEach(k => {
      ['give', 'tail'].forEach(f => {
        const line = L[who][k] && L[who][k][f];
        if (!line) return;
        const n = S.Text.wrap(line, S.PayAnim.FW - 6, 12).split('\n').length;
        if (n > worst) { worst = n; sample = line; }
      });
    }));
    return { worst: worst, sample: sample };
  });
  ok('最长的一句台词折下来不超过三行', wrapMax.worst <= 3,
    wrapMax.worst + ' 行：' + wrapMax.sample);
  ok('台词压不到「按 A」那一行', geo.tipY - geo.capY >= wrapMax.worst * 12,
    '台词 y=' + geo.capY + '（' + wrapMax.worst + ' 行） 提示 y=' + geo.tipY);

  /* ---- 一枚一枚数 ---- */
  await enterRoom(1, true);
  let base = (await st()).money;
  await startChore('dish');
  let a = await st();
  await shot('01_pay_open');
  ok('刷完碗真的起了一屏收钱特写', a.stage === 'act' || a.stage === 'count', 'stage=' + a.stage);
  ok('演出期间锁着输入（客厅那边按不动）', a.interlude > 0, 'interludeOpen=' + a.interlude);
  ok('这一屏站着的是妈', await page.evaluate(() => {
    const show = window.SB.game.scene.getScene('Room').__paySpy;
    return !!show && show.payerId === 'mom' && show.payer.place === '厨房门口';
  }));
  ok('钱还没进兜 —— 得等她把钱递到手里', a.money === base, '￥' + a.money);
  ok('两毛钱就是一枚，不用数半天', a.total === 1, a.total + ' 件');

  await countOneByOne();
  a = await st();
  await shot('02_after_pay');
  ok('数完钱正好进兜两毛', a.money === base + 0.2, base + '→' + a.money);
  ok('账本上记着这两毛是刷碗挣的', await page.evaluate(() =>
    window.SB.Story.todayRows().some(r => r.name === '刷碗' && r.v >= 0.2)));
  ok('收完钱输入解锁了', a.interlude === 0, 'interludeOpen=' + a.interlude);
  ok('刷碗记了一次，一天还剩两回', a.dish === 1, '干了 ' + a.dish + ' 回');

  /* ---- B：不想数了，钱一分不少 ---- */
  await enterRoom(1, true);
  base = (await st()).money;
  await startChore('dish');
  a = await st();
  ok('（对照组）收钱屏起来了', a.stage === 'act' || a.stage === 'count', 'stage=' + a.stage);
  await page.keyboard.press('z'); await sleep(450);   // B：一把数完
  a = await st();
  ok('按 B 一把数完，手里的钱一次到齐', a.got === 0.2 && a.stage === 'tail',
    '数到 ' + a.got + ' stage=' + a.stage);
  await page.keyboard.press('z'); await sleep(900);   // 收起来
  a = await st();
  ok('跳过数钱，钱照样一分不少', a.money === base + 0.2, base + '→' + a.money);

  /* ---- 大额：一块二要拆成一块加两毛，分两下数 ---- */
  await enterRoom(0, true);                            // 上午，小卖部开门
  base = (await st()).money;
  await startChore('haul');
  a = await st();
  ok('搬货这一屏站着的是小卖部老板', await page.evaluate(() => {
    const show = window.SB.game.scene.getScene('Room').__paySpy;
    return !!show && show.payerId === 'shop' && show.payer.place === '小卖部柜台';
  }), 'stage=' + a.stage);
  await countOneByOne();
  a = await st();
  ok('搬一趟货是五毛，进兜了', a.money === base + 0.5, base + '→' + a.money);

  /* ---- 同一天越看越短 ---- */
  const durs = await page.evaluate(() => {
    const S = window.SB;
    S.PayAnim.resetSeen();
    const out = [];
    for (let i = 0; i < 3; i++) {
      const pl = S.PayAnim.plan(i);
      out.push(S.PayAnim.duration(pl.names, pl.speed));
    }
    return out;
  });
  ok('第一次收钱是完整版，第二次第三次一次比一次短',
    durs[0] > durs[1] && durs[1] > durs[2], durs.join('ms → ') + 'ms');
  ok('完整版三秒上下，不是一闪而过也不是没完没了',
    durs[0] >= 2000 && durs[0] <= 4500, durs[0] + 'ms');
  ok('第三遍只剩掏钱那几拍', await page.evaluate(() =>
    window.SB.PayAnim.plan(2).names.join(',') === 'out,give,let'));

  /* ---- 挂账：妈不在家干活，她回来才给 ---- */
  await enterRoom(1, false);   // 中午，妈不在家
  base = (await st()).money;
  await startChore('dish');
  /* 挂账那条路只出文字，把话说完 */
  for (let i = 0; i < 10; i++) {
    if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
    await page.keyboard.press('x'); await sleep(260);
  }
  await sleep(400);
  a = await st();
  await shot('03_owed');
  ok('妈不在家，刷完碗钱先挂着，没进兜', a.owed === 0.2 && a.money === base,
    '挂账 ' + a.owed + ' / ￥' + a.money);
  ok('挂着的时候不起收钱屏 —— 没人在跟前，钱从哪儿递过来',
    a.stage === '' || a.closed === true, 'stage=' + a.stage);

  /* 让她回来，再进一次客厅 */
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.d.__momHome = true;
    S.Save.save();
    const r = S.game.scene.getScene('Room');
    r.__paySpy = null;
    r.scene.restart({ from: 'test' });
  });
  await sleep(1100);
  for (let i = 0; i < 10; i++) {
    const s = await st();
    if (s.stage && s.stage !== 'over') break;
    if (!s.dialog) break;
    await page.keyboard.press('x'); await sleep(260);
  }
  await sleep(350);
  a = await st();
  ok('她一回来，挂着的那笔就起了收钱屏',
    (a.stage === 'act' || a.stage === 'count') && a.owed === 0,
    'stage=' + a.stage + ' 挂账 ' + a.owed);
  await countOneByOne();
  a = await st();
  ok('挂账结清，钱进兜了，账上也不欠了', a.money === base + 0.2 && a.owed === 0,
    base + '→' + a.money + ' 挂账 ' + a.owed);

  /* ---- 日常事件：rollEvent 已经记过账，这一屏只演不记 ---- */
  await enterRoom(1, true);
  await page.evaluate(() => {
    const S = window.SB;
    /* 造一个一定有进账、而且该由老汉给钱的日常事件 */
    const ev = { id: 'bottle', text: '你在猪圈后头翻出一堆酒瓶子。', money: [1.2, 1.2] };
    S.__realRoll = S.Time.rollEvent;
    S.Time.rollEvent = function () {
      S.Story.earn(1.2, 'bottle');       // 真实实现就是在这儿记账的
      ev.__gain = 1.2;
      return ev;
    };
    /* 把那一屏换成「立刻结束」，只看它会不会再记一次账 */
    S.__realPlay = S.PayAnim.play;
    S.__payCalls = [];
    S.PayAnim.play = function (scene, opts) {
      S.__payCalls.push({ payer: opts.payer, src: opts.src, amount: opts.amount });
      if (opts && opts.onDone) opts.onDone(opts.amount);
      return { stage: 'over', closed: true, counted: 0, items: [], got: 0 };
    };
    S.Save.d.flags.dayRolled = -1;
    S.Save.d.money = 3;
    const lg = S.Story.state().ledger;
    lg.day = S.Save.d.day; lg.today = 0; lg.src = {};
    S.game.scene.getScene('Room').dailyCheck();
  });
  await sleep(400);
  for (let i = 0; i < 10; i++) {
    if (!(await page.evaluate(() => !!window.SB.__dialogOpen))) break;
    await page.keyboard.press('x'); await sleep(260);
  }
  await sleep(500);
  const once = await page.evaluate(() => {
    const S = window.SB;
    const out = {
      calls: S.__payCalls.slice(),
      money: S.Save.d.money,
      total: S.Story.todayTotal()
    };
    S.Time.rollEvent = S.__realRoll;
    S.PayAnim.play = S.__realPlay;
    return out;
  });
  ok('捡瓶子这种日常进账会走收废品老汉那一屏',
    once.calls.length === 1 && once.calls[0].payer === 'laohan' && once.calls[0].amount === 1.2,
    JSON.stringify(once.calls));
  ok('日常事件的钱只记一次账 —— rollEvent 记过了，特写不许再加一遍',
    once.total === 1.2 && once.money === 4.2,
    '今天进账 ￥' + once.total + ' 兜里 ￥' + once.money);

  /* ---- 台词按人分开 ---- */
  const lines = await page.evaluate(() => {
    const P = window.SB.L.pay || {};
    return {
      keys: Object.keys(P),
      mom: JSON.stringify(P.mom || {}),
      laohan: JSON.stringify(P.laohan || {}),
      shop: JSON.stringify(P.shop || {})
    };
  });
  ok('三个人各有各的台词，不共用一句',
    lines.keys.indexOf('mom') >= 0 && lines.keys.indexOf('laohan') >= 0 &&
    lines.keys.indexOf('shop') >= 0 && lines.mom !== lines.laohan && lines.laohan !== lines.shop);

  /* ---- 场景被强行掐掉：钱不能跟着画面消失 ----
   * 放在最后跑。这一步会把客厅整个掐掉，是全场最脏的一个操作。 */
  await enterRoom(1, true);
  base = (await st()).money;
  await startChore('dish');
  await page.evaluate(() => window.SB.game.scene.getScene('Room').scene.stop());
  await sleep(900);
  a = await st();
  ok('演出中场景被强行掐掉，钱也得到账', a.money === base + 0.2, base + '→' + a.money);
  ok('画面掐掉后输入锁解开了，不会永久卡死', a.interlude === 0, 'interludeOpen=' + a.interlude);
  ok('画面没了也不会往销毁掉的控件上写字', errs.length === 0, errs.slice(0, 2).join(' | '));

  ok('全程没有脚本报错', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 挂');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
