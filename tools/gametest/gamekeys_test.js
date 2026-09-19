/* 电视画面里的按键指引：专盯「第一次插上这张卡，知不知道该按什么」。
 *
 * 覆盖的事情（都按真流程走：真起场景、真按键盘、真等时间）：
 *   1. 时机：开机演出、卡带标题、关卡卡片、开场 READY 的时候一张卡都不许弹；
 *      四个真游戏各自「真能动了」的那一刻才弹（坦克 phase=play、马里蘑 phase=play、
 *      拳霸 ph=fight、魂斗萝 create 完就能动）。
 *   2. 内容：卡上写的键位必须和 src/games/*.js 里真正读输入的那几行对得上，
 *      而且键名是现算的 —— 切成触屏就得改口写 A / B / 十字键。
 *   3. 3.5 秒自己走；不到时间按任意键立刻走。
 *   4. 卡走了以后留一条很淡的常驻键位条：不许压 HUD、血条、Boss 血槽、杂志秘技那几行
 *      （挨个 getBounds() 比一遍，再拿源码里的 HUD 坐标兜一遍底）。
 *   5. 暂停菜单里有「看按键说明」，能把卡再叫出来。
 *   6. 同屏双打时 1P / 2P 两套键位一起写；马里蘑是轮流上场，就老实说「轮流」。
 *   7. 死标题卡带（本来就不能玩）不弹卡，只在画面里留一句怎么退出去。
 *
 * 用法：先起 python3 -m http.server 8100，再 node tools/gametest/gamekeys_test.js
 *       换端口：node tools/gametest/gamekeys_test.js 8200
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.argv[2] || '8100';
const OUT = path.join(__dirname, 'gamekeys');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

/* 每张卡的 HUD 硬坐标，全部照 src/games/*.js 抄下来（画面内部坐标，0..360 / 0..270）。
 * Graphics 画的东西（Boss 血槽）量不出 bounds，只能这样兜底。 */
const HUD = {
  contra: [
    { n: '顶部 HUD 条', x: 0, y: 0, w: 360, h: 24 },        // buildHud: rect(0,0,W,24)
    { n: 'Boss 血槽', x: 120, y: 28, w: 120, h: 5 },        // bossBar
    { n: '杂志秘技行', x: 12, y: 246, w: 150, h: 14 }        // txt(12,246)
  ],
  tank: [
    { n: '右侧 HUD 底板', x: 236, y: 27, w: 116, h: 214 },   // rect(HX-4,FY-3,116,FW+6)
    { n: '秘技两行', x: 238, y: 250, w: 100, h: 28 }         // txt(HX-2,FY+220 / FY+234)
  ],
  mario: [
    { n: '顶部两行', x: 14, y: 12, w: 332, h: 32 },          // score/coin/world/time + life/power
    { n: '杂志秘技角', x: 14, y: 244, w: 130, h: 14 }        // hud.tip
  ],
  fight: [
    { n: '1P 血条', x: 10, y: 12, w: 140, h: 14 },
    { n: '2P 血条', x: 210, y: 12, w: 140, h: 14 },
    { n: '1P 能量槽', x: 42, y: 30, w: 110, h: 21 },         // 槽 + POW 字
    { n: '2P 能量槽', x: 208, y: 30, w: 110, h: 21 },
    { n: '1P 头像', x: 10, y: 28, w: 28, h: 28 },
    { n: '2P 头像', x: 322, y: 28, w: 28, h: 28 },
    { n: '中央倒计时', x: 166, y: 10, w: 28, h: 34 },        // 时间 + 回合
    { n: '杂志指令表', x: 8, y: 196, w: 122, h: 66 },
    { n: '变态版乱码框', x: 250, y: 240, w: 100, h: 16 }
  ],
  multi: [
    { n: '目录十行', x: 56, y: 66, w: 260, h: 168 },
    { n: '进不去的提示', x: 110, y: 250, w: 140, h: 14 }
  ],
  stub: [
    { n: '标题 / PUSH START', x: 60, y: 80, w: 240, h: 120 },
    { n: '按键次数提示', x: 100, y: 232, w: 160, h: 14 }
  ]
};

const CARTS = {
  contra: { cartId: '01', gameKey: 'contra', name: '魂斗萝' },
  tank: { cartId: '02', gameKey: 'tank', name: '铁甲坦克1990' },
  mario: { cartId: '03', gameKey: 'mario', name: '超级马里蘑' },
  fight: { cartId: '04', gameKey: 'fight', name: '拳霸98加强变态版' },
  multi: { cartId: '05', gameKey: 'multi', name: '100万合1' },
  stub: { cartId: '07', gameKey: 'blocks', name: '方块大陆（无敌版）' }
};

/* 每张卡「必须写出来」的动作词 + 必须出现的键名。
 * 键名按「单人在小游戏里」那一套算：方向多了一套 WASD（见 Input.CODE_1P_MOVE），
 * 所以「走」那一行必须把两套都写出来；A 键盘上让给了「往左」，只写 X。 */
const MUST = {
  contra: { acts: ['走', '跳', '开枪', '趴下'], keys: ['←→ 或 A/D', 'X', 'Z/B', '↓'] },
  tank: { acts: ['开着走', '开炮'], keys: ['方向键 或 WASD', 'X'] },
  mario: { acts: ['走', '跳', '跑', '钻管子'], keys: ['←→ 或 A/D', 'X', 'Z/B', '↓'] },
  fight: { acts: ['走', '出拳', '出腿', '跳', '蹲'], keys: ['←→ 或 A/D', 'X', 'Z/B', '↑', '↓'] }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const shot = (tag) => page.screenshot({ path: path.join(OUT, tag + '.png') });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(220); } };

  /* ---------- 开机 ---------- */
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3400);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);   // 点击开机 + 解锁音频
  await sleep(1500);

  await page.evaluate(() => {
    /* 指引现在是什么状态。cardText / stripLine 都是指引自己吐出来的原文。 */
    window.__guide = function () {
      const S = window.SB;
      const s = S.game.scene.getScene('Play');
      if (!s || !s.guide) return null;
      const st = S.KeyGuide.state(s.game_);
      const g = s.game_;
      return {
        mode: st.mode, ready: st.ready,
        phase: g ? (g.phase || g.ph || (g.inner ? (g.inner.phase || g.inner.ph) : '') || '') : '',
        card: s.guide.hasCard(),
        cardText: s.guide.cardText(),
        strip: s.guide.stripLine(),
        rect: s.guide.stripRect(),
        titleCardUp: !!(s.crt && !g)
      };
    };
    /* 常驻条和 HUD 到底有没有叠在一起：拿 Phaser 的 getBounds 挨个比。 */
    window.__stripHits = function () {
      const S = window.SB;
      const s = S.game.scene.getScene('Play');
      const g = s && s.guide;
      if (!g || !g.strip || !s.game_) return null;
      const b = g.strip.__txt.getBounds();
      const hits = [];
      const walk = function (c) {
        c.list.forEach(function (o) {
          if (o.list) { walk(o); return; }
          if (!o.visible || typeof o.getBounds !== 'function') return;
          const r = o.getBounds();
          if (!r || !r.width || !r.height) return;              // Graphics 量不出来，跳过
          if (r.width * r.height > 360 * 270 * 0.7) return;      // 铺满画面的背景板不算 HUD
          if (Phaser.Geom.Intersects.RectangleToRectangle(b, r)) {
            hits.push((typeof o.text === 'string' ? o.text.split('\n')[0] : o.type) +
              '@' + Math.round(r.x) + ',' + Math.round(r.y));
          }
        });
      };
      walk(s.game_.ui);
      return { box: { x: b.x, y: b.y, w: b.width, h: b.height }, hits: hits };
    };
    /* 指引上的字有没有字库里画不出来的 */
    window.__guideMissing = function () {
      const S = window.SB;
      const s = S.game.scene.getScene('Play');
      const out = {};
      const objs = [];
      if (s.guide && s.guide.card) s.guide.card.list.forEach(o => objs.push(o));
      if (s.guide && s.guide.strip) s.guide.strip.list.forEach(o => objs.push(o));
      objs.forEach(function (o) {
        if (typeof o.text !== 'string' || !o.text) return;
        if (!o.font || !s.cache.bitmapFont.exists(o.font)) return;
        const chars = s.cache.bitmapFont.get(o.font).data.chars;
        for (let i = 0; i < o.text.length; i++) {
          const ch = o.text[i];
          if (ch === '\n' || ch === ' ' || ch === '\u3000') continue;
          if (!chars[ch.charCodeAt(0)]) out[ch] = 1;
        }
      });
      return Object.keys(out);
    };
  });

  /* 干净存档 + 直接开某张卡（妈妈不来，卡不脏） */
  const startPlay = async (g, extra) => {
    const c = CARTS[g];
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.__nomom = true;
      S.Save.d.money = 60;
      S.CARTS.forEach(c => { S.Save.d.carts[c.id].owned = true; S.Save.d.carts[c.id].dirt = 0; S.Save.d.carts[c.id].wear = 0; });
      S.Save.d.owned.mag = !!a.mag;
      S.Save.d.inserted = a.cartId;
      S.Save.d.seated = true;
      S.Save.save();
      const g2 = S.game;
      const target = g2.scene.getScene('Play');
      g2.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== 'Play') s.scene.stop(); });
      /* 同一帧里 stop 又 start 同一个场景，旧的 shutdown 会把新建出来的东西一起清掉。
       * 已经在这一屏就老实 restart（和 keys_ui_test 同一个套路）。 */
      if (target && target.scene.isActive()) target.scene.restart(a);
      else g2.scene.start('Play', a);
    }, Object.assign({ cartId: c.cartId, gameKey: c.gameKey }, extra || {}));
    /* 等场景真的重开：小游戏还没 new 出来（卡带标题正在放），指引也还是空的。
     * 不等这一下，下面读到的会是上一局留下的状态。 */
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const fresh = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Play');
        return !!(s && s.guide && !s.game_ && !s.guide.hasCard() && s.guide.mode === null);
      });
      if (fresh) return;
      await sleep(80);
    }
  };

  /* 一直盯着，直到按键卡出现（同时记下它出现那一刻游戏跑到哪一步了） */
  const waitCard = async (mode, ms = 14000) => {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < ms) {
      last = await page.evaluate(() => window.__guide());
      if (last && last.card && (!mode || last.mode === mode)) return last;
      await sleep(100);
    }
    return last;
  };
  const waitStrip = async (mode, ms = 9000) => {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < ms) {
      last = await page.evaluate(() => window.__guide());
      if (last && !last.card && last.strip && (!mode || last.mode === mode)) return last;
      await sleep(120);
    }
    return last;
  };
  const guide = () => page.evaluate(() => window.__guide());

  /* ================= 1. 四个真游戏：卡在对的时候弹，写的是对的键 ================= */
  for (const g of ['contra', 'tank', 'mario', 'fight']) {
    console.log('\n--- 1.' + g + ' ' + CARTS[g].name + ' ---');

    await startPlay(g);
    /* 卡带标题演出期间（这时候小游戏还没 new 出来）一张卡都不许弹 */
    let early = await guide();
    ok(!!early && !early.card, g + '：卡带标题还在放的时候不弹按键卡');

    const at = await waitCard(g);
    ok(!!at && at.card, g + '：游戏能动了以后弹出了按键卡');
    if (at) {
      ok(at.mode === g && at.ready === true, g + '：弹卡的那一刻游戏确实已经可操作（mode=' + at.mode + ' ready=' + at.ready + '）');
      const want = { contra: '', tank: 'play', mario: 'play', fight: 'fight' }[g];
      if (want) ok(at.phase === want, g + '：弹卡时正处在真正能动的那一段（phase=' + at.phase + '，应为 ' + want + '）');
      const t = at.cardText;
      ok(/怎 么 玩/.test(t), g + '：卡上有标题「怎么玩」');
      const missAct = MUST[g].acts.filter(a => t.indexOf(a) < 0);
      ok(missAct.length === 0, g + '：源码里真有的动作一个都没漏（' + MUST[g].acts.join('/') + '）'
        + (missAct.length ? '，漏了 ' + missAct.join('、') : ''));
      const missKey = MUST[g].keys.filter(k => t.indexOf(k) < 0);
      ok(missKey.length === 0, g + '：键名都是现算出来的键盘键名（' + MUST[g].keys.join(' ') + '）'
        + (missKey.length ? '，缺 ' + missKey.join(' ') : ''));
      ok(/暂停/.test(t) && /Enter/.test(t), g + '：卡上写了怎么暂停 / 关电视（START = Enter）');
      ok(/按任意键/.test(t), g + '：卡上写了「按任意键」怎么把它收掉');
      const miss = await page.evaluate(() => window.__guideMissing());
      ok(miss.length === 0, g + '：卡上的字都在点阵字库里' + (miss.length ? '（缺：' + miss.join(' ') + '）' : ''));
    }
    await shot(g + '_1_card');

    /* 3.5 秒到了自己走，走完留一条常驻条 */
    const later = await waitStrip(g);
    ok(!!later && !later.card, g + '：不按键也会自己淡掉（3.5 秒）');
    ok(!!later && !!later.strip, g + '：卡走了以后留下常驻键位条（' + (later && later.strip) + '）');

    /* 常驻条不许压 HUD */
    const hit = await page.evaluate(() => window.__stripHits());
    ok(!!hit, g + '：能量到常驻条的 getBounds');
    if (hit) {
      ok(hit.hits.length === 0, g + '：常驻条没和 HUD 里任何一个看得见的东西相交'
        + (hit.hits.length ? '（叠着：' + hit.hits.join(' | ') + '）' : ''));
      const S = { x: 60, y: 0, w: 360, h: 270 };
      ok(hit.box.x >= S.x && hit.box.x + hit.box.w <= S.x + S.w && hit.box.y >= 0 && hit.box.y + hit.box.h <= S.h,
        g + '：常驻条整条都在电视画面里（' + Math.round(hit.box.x) + ',' + Math.round(hit.box.y)
        + ' ' + Math.round(hit.box.w) + '×' + Math.round(hit.box.h) + '）');
      /* 再拿源码里的 HUD 硬坐标兜一遍（Graphics 画的 Boss 血槽只能这样查） */
      const bad = HUD[g].filter(r => {
        const rx = r.x + S.x;
        return hit.box.x < rx + r.w && hit.box.x + hit.box.w > rx &&
          hit.box.y < r.y + r.h && hit.box.y + hit.box.h > r.y;
      });
      ok(bad.length === 0, g + '：也没压到源码里那几块 HUD 区域'
        + (bad.length ? '（压着：' + bad.map(b => b.n).join('、') + '）' : ''));
    }
    /* 玩两下，拍一张「常驻条 + 正常玩法画面」 */
    await key('ArrowRight', 2);
    await key('x'); await key('z');
    await sleep(600);
    await shot(g + '_2_strip');
  }

  /* ================= 2. 按任意键立刻收 ================= */
  console.log('\n--- 2. 按任意键立刻收掉 ---');
  await startPlay('tank');
  let c1 = await waitCard('tank');
  ok(!!c1 && c1.card, '坦克：卡先弹出来了');
  await key('ArrowLeft');
  const afterKey = await guide();
  ok(!!afterKey && !afterKey.card, '按一下方向键，卡当场就收（不用等 3.5 秒）');
  ok(!!afterKey && !!afterKey.strip, '收掉之后常驻条马上接上');

  /* 点一下画面也一样 */
  await startPlay('tank');
  c1 = await waitCard('tank');
  ok(!!c1 && c1.card, '坦克：再弹一次');
  await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.75);
  await sleep(400);
  const afterClick = await guide();
  ok(!!afterClick && !afterClick.card, '用鼠标点一下画面，卡也会收掉');

  /* ================= 3. 暂停菜单里能把说明再叫出来 ================= */
  console.log('\n--- 3. 暂停菜单：看按键说明 ---');
  await startPlay('mario');
  await waitStrip('mario');
  await key('Enter');
  await sleep(500);
  const menu = await page.evaluate(() => {
    const m = window.SB.__menu;
    return m && m.isOpen() ? m.debug() : null;
  });
  ok(!!menu, '按 Enter 开出了暂停菜单');
  ok(!!menu && menu.labels.indexOf('看按键说明') >= 0,
    '暂停菜单里有「看按键说明」这一项（' + (menu ? menu.labels.join(' / ') : '') + '）');
  const idx = menu ? menu.labels.indexOf('看按键说明') : -1;
  if (idx >= 0) {
    for (let i = 0; i < idx; i++) await key('ArrowDown');
    await key('x');
    await sleep(600);
    const back = await guide();
    ok(!!back && back.card, '选它以后按键卡又回来了');
    ok(!!back && /怎 么 玩/.test(back.cardText) && /钻管子/.test(back.cardText),
      '再叫出来的还是这张卡自己的键位（马里蘑有「钻管子」）');
    await shot('mario_3_from_pause');
  }

  /* ================= 4. 换成触屏：说法跟着改口 ================= */
  console.log('\n--- 4. 换输入方式，键名跟着改 ---');
  await startPlay('contra');
  let cc = await waitCard('contra');
  ok(!!cc && /X/.test(cc.cardText) && !/X\/A/.test(cc.cardText),
    '键盘玩家看到的跳键是 X（游戏里 A 已经让给「往左走」，所以不再写 X/A）');
  ok(!!cc && /←→ 或 A\/D/.test(cc.cardText), '卡上把「方向 = 移动」两套键都写了：←→ 或 A/D');
  /* 改口是 SB.Input.onLabels 同步回调里重画的，所以切完当场读：
   * 卡自己只站 3.5 秒，一来一回地问会把这点时间耗光，那是测试自己的账，不是指引的。 */
  const touched = await page.evaluate(() => {
    const s = window.SB.game.scene.getScene('Play'), g = s.guide;
    const before = g.cardText();
    window.SB.Input.setSrc('touch');
    return { card: g.hasCard(), cardText: g.cardText(), before: before };
  });
  ok(touched.card, '切成触屏，卡还在（没有被重画搞没）');
  ok(!/X\/A/.test(touched.cardText) && /十字键|←→/.test(touched.cardText),
    '摸屏幕的人看到的是手柄按钮名，不再写 X/A（' + touched.cardText.slice(0, 24) + '…）');
  ok(/点一下画面/.test(touched.cardText) && !/按任意键/.test(touched.cardText),
    '摸屏幕的人手边没有「任意键」，底下那句改成「点一下画面接着玩」');
  const tMiss = await page.evaluate(() => window.__guideMissing());
  ok(tMiss.length === 0, '触屏说法里的字也都在点阵字库里' + (tMiss.length ? '（缺：' + tMiss.join(' ') + '）' : ''));
  await shot('contra_4_touch');
  /* 卡收掉以后，常驻条也得是触屏的说法 */
  const tStrip = await (async () => {
    for (let i = 0; i < 40; i++) {
      const v = await guide();
      if (v && !v.card && v.strip) return v.strip;
      await sleep(150);
    }
    return '';
  })();
  ok(/十字键/.test(tStrip) && !/X\/A/.test(tStrip),
    '常驻条跟着改口：' + tStrip);
  await page.evaluate(() => window.SB.Input.setSrc('key'));
  await sleep(300);
  const kStrip = await guide();
  ok(!!kStrip && /走 ←→/.test(kStrip.strip) && /跳 X/.test(kStrip.strip),
    '切回键盘，常驻条又写回键盘键名：' + (kStrip ? kStrip.strip : ''));
  ok(!!kStrip && kStrip.strip.indexOf('A/D') < 0,
    '常驻条只写主键名，不把 WASD 那半截也塞进来（长了会压到 HUD）');

  /* ================= 5. 同屏双打：两套键位一起写 ================= */
  console.log('\n--- 5. 同屏双打 ---');
  for (const g of ['tank', 'contra', 'fight']) {
    await startPlay(g, { twoP: true, friend: true });
    const t2 = await waitCard(g);
    ok(!!t2 && t2.card, g + ' 双打：弹出了按键卡');
    if (t2) {
      const t = t2.cardText;
      ok(/1P/.test(t) && /2P/.test(t), g + ' 双打：卡上 1P / 2P 两列都在');
      /* 坦克只有「开炮」一个动作键（源码里 A、B 都是开炮），主列写 A，
       * 「B 也一样」这句落在卡底下那行，所以两处分开查 */
      const need2 = g === 'tank' ? ['H'] : ['H', 'G'];
      ok(need2.every(k => t.split('　').indexOf(k) >= 0),
        g + ' 双打：2P 的动作键写的是 ' + need2.join(' / '));
      if (g === 'tank') {
        ok(/开炮：Z\/B 也一样，2P 是 G/.test(t),
          '坦克双打：底下那行把 2P 的备用开炮键 G 也说了出来');
      }
      const dir2 = g === 'tank' ? 'WASD' : 'A/D';
      ok(t.indexOf(dir2) >= 0, g + ' 双打：2P 的方向写的是 ' + dir2);
      ok(t.split('　').indexOf('X') >= 0 && !/X\/A/.test(t),
        g + ' 双打：1P 的 A 键只写 X，不再写 A（键盘 A 已经让给 2P 了）');
    }
    await shot(g + '_5_twoP_card');
    const st2 = await waitStrip(g);
    ok(!!st2 && /1P/.test(st2.strip) && /2P/.test(st2.strip),
      g + ' 双打：常驻条也是两行（' + (st2 && st2.strip.replace('\n', ' ⏎ ')) + '）');
    const hit2 = await page.evaluate(() => window.__stripHits());
    ok(!!hit2 && hit2.hits.length === 0, g + ' 双打：两行的常驻条也没压 HUD'
      + (hit2 && hit2.hits.length ? '（叠着：' + hit2.hits.join(' | ') + '）' : ''));
    await shot(g + '_6_twoP_strip');
  }

  /* 马里蘑是轮流上场，不是同屏，就别假装有两套 */
  await startPlay('mario', { twoP: true, friend: true });
  const mt = await waitCard('mario');
  ok(!!mt && /轮流/.test(mt.cardText), '马里蘑双人：老实写「两个人轮流上场，键位一样」');
  ok(!!mt && !/H/.test(mt.cardText), '马里蘑双人：不去编一套 2P 键位出来');
  await shot('mario_7_twoP');

  /* ================= 6. 买了杂志才多出必杀那几条 ================= */
  console.log('\n--- 6. 拳霸：必杀该不该写 ---');
  await startPlay('fight');
  const noMag = await waitCard('fight');
  ok(!!noMag && !/气功波/.test(noMag.cardText), '没买杂志时，按键卡不剧透必杀指令');
  await startPlay('fight', { mag: true });
  const withMag = await waitCard('fight');
  ok(!!withMag && /气功波/.test(withMag.cardText) && /超必杀/.test(withMag.cardText),
    '买了《电子游戏时代》以后，按键卡上才写气功波 / 升龙拳 / 旋风腿 / 超必杀');
  ok(!!withMag && /↓→\+X/.test(withMag.cardText.replace(/\s/g, '')),
    '必杀指令里的 A 也是现算的键名（游戏里写 X）');
  await shot('fight_8_mag');

  /* ================= 7. 不能玩的卡：不弹卡，只说怎么出去 ================= */
  console.log('\n--- 7. 死标题卡带 / 合 1 目录 ---');
  await startPlay('stub');
  await sleep(4500);
  const stub = await guide();
  ok(!!stub && stub.mode === 'stub', '死标题卡带认出来了（mode=stub）');
  ok(!!stub && !stub.card, '这种卡本来就不能玩，不弹按键卡，也不替它剧透');
  ok(!!stub && /暂停/.test(stub.strip) && /Enter/.test(stub.strip),
    '但画面里留了一句怎么退出去（' + (stub && stub.strip) + '）');
  const stubHit = await page.evaluate(() => window.__stripHits());
  ok(!!stubHit && stubHit.hits.length === 0, '死标题卡带上的提示条没压住标题画面上的字'
    + (stubHit && stubHit.hits.length ? '（叠着：' + stubHit.hits.join(' | ') + '）' : ''));
  await shot('stub_9_exit_only');
  /* 暂停菜单里还是能看说明（起码告诉人怎么走） */
  await key('Enter');
  await sleep(500);
  const stubMenu = await page.evaluate(() => {
    const m = window.SB.__menu;
    return m && m.isOpen() ? m.debug() : null;
  });
  ok(!!stubMenu && stubMenu.labels.indexOf('看按键说明') >= 0, '死标题卡带的暂停菜单里也有「看按键说明」');
  await key('b');
  await sleep(400);

  /* 100 万合 1：目录本身可操作 → 给目录的键位；进了坦克 → 换成坦克的 */
  await startPlay('multi');
  const menuCard = await waitCard('multi');
  ok(!!menuCard && menuCard.mode === 'multi', '合 1 目录：目录本身是可操作的，给它一张卡');
  ok(!!menuCard && /选/.test(menuCard.cardText) && /进去/.test(menuCard.cardText),
    '合 1 目录：写的是上下选、按 A 进去');
  await shot('multi_10_menu');
  await waitStrip('multi');
  const mHit = await page.evaluate(() => window.__stripHits());
  ok(!!mHit && mHit.hits.length === 0, '合 1 目录的常驻条没压住十行目录'
    + (mHit && mHit.hits.length ? '（叠着：' + mHit.hits.join(' | ') + '）' : ''));
  await key('x');                       // 第一项「超级坦克」是能进的
  const innerCard = await waitCard('tank');
  ok(!!innerCard && innerCard.mode === 'tank', '从目录进去以后，指引跟到了里面那个坦克（mode=' + (innerCard && innerCard.mode) + '）');
  ok(!!innerCard && /开炮/.test(innerCard.cardText), '换成了坦克自己的键位');
  await shot('multi_11_inner_tank');

  /* ================= 8. RESET / 再来一局，说明会再讲一次 ================= */
  console.log('\n--- 8. 按了 RESET 之后 ---');
  /* 一按 RESET 本来就有一点点概率直接把画面按花（PlayScene.hitReset 里那 1%），
   * 花屏时不该有按键卡，所以碰上了就重来一局再按，别把游戏自己的设计算成挂。 */
  /* 重试次数给到 6、等卡片给到 12 秒：这一段本来 8 秒就放弃，机器一忙
   * （比如同时在跑另一组测试）卡片动画还没播完就被判成花屏，报出来的是假挂。 */
  let again = null, resetTries = 0, faulted = 0;
  while (resetTries < 6) {
    resetTries++;
    await startPlay('tank');
    await waitStrip('tank');
    await page.keyboard.press('r');
    again = await waitCard('tank', 12000);
    if (again && again.card) break;
    const bad = await page.evaluate(() => {
      const s = window.SB.game.scene.getScene('Play');
      return { faulting: !!(s && s.faulting), fault: window.SB.Save.d.fault || null };
    });
    if (!bad.faulting && !bad.fault) break;      // 不是花屏，那就是真挂了
    faulted++;
    console.log('  （这次 RESET 把画面按花了：' + bad.fault + '，重来一次）');
  }
  ok(!!again && again.card,
    '按一下主机 RESET，重开这局时按键卡会再讲一遍' + (faulted ? '（中途花屏 ' + faulted + ' 次）' : ''));
  ok(!!again && /开炮/.test(again.cardText), 'RESET 之后讲的还是这张卡的键位');
  await shot('tank_12_after_reset');

  /* ================= 9. 没有 JS 报错 ================= */
  console.log('\n--- 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '整段没有 JS 报错');

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  console.log('截图在 ' + OUT);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
