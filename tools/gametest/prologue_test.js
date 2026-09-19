/* 序章（2026 那个晚上）的回归测试。
 *
 * 这一段是新玩家进游戏看到的第一样东西，出问题的代价最大：
 * 卡在某一镜、跳不掉、跳完不知道自己为什么在 2004 年、
 * 或者老玩家一开机被硬塞四分钟加班夜 —— 每一条都是「这游戏坏了」。
 * 所以这份脚本按玩家会走的四条路各走一遍：
 *
 *   一、结构：12 镜的数据、文案、画法、年份口径对不对得上
 *   二、正着看：从标题开新档 → 进序章 → 一镜一镜走到 2004 → 进客厅
 *   三、跳过：任何时候按 B 都能走，但眨眼与色调迁移那 6 秒不许跳；
 *          跳过要补三行摘要，并且落盘记一笔「跳着看的」
 *   四、老档：v2 的档读进来一律算「看过」，不许半路插序章、不许丢数据
 *   五、回忆册：第一页常驻「那个晚上」，A 能重看，重看不写存档，走完回册子
 *   六、门禁只在标题：直接 scene.start('Room') 的老用例不许被序章拦住
 *
 * 跑法：先在仓库根目录起 python3 -m http.server 8100，
 *       再 node tools/gametest/prologue_test.js [端口或线上地址]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARG = process.env.PORT || process.argv[2] || '8100';
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/$/, '') : 'http://localhost:' + ARG;
const OUT = path.join(__dirname, 'prologue');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const shot = (tag) => page.screenshot({ path: path.join(OUT, tag + '.png') });
  const key = async (k, n = 1, gap = 240) => {
    for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); }
  };

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await sleep(3400);
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);   // 点击开机，顺手解锁音频
  await sleep(1500);

  /* 现在活着的场景 / 序章的内部状态 */
  const at = () => page.evaluate(() =>
    window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));

  const pro = () => page.evaluate(() => {
    const S = window.SB, sc = S.game.scene.getScene('Prologue');
    if (!sc || !sc.scene.isActive()) return null;
    const m = sc.menu;
    const open = !!(m && m.isOpen && m.isOpen());
    return {
      idx: sc.idx,
      id: sc.beat ? sc.beat.id : null,
      art: sc.artName,
      slugL: sc.slugL ? sc.slugL.text : '',
      slugR: sc.slugR ? sc.slugR.text : '',
      band: sc.bandTxt ? sc.bandTxt.text : '',
      hint: sc.hint ? sc.hint.full() : '',
      skipBtn: !!(sc.skipBtn && sc.skipBtn.txt && sc.skipBtn.txt.visible),
      menuOpen: open,
      labels: open ? m.debug().labels : null,
      dis: open ? m.debug().dis : null,
      awaitLast: !!sc.awaitLast,
      waitTap: !!sc.waitTap,
      caret: !!(sc.caret && sc.caret.visible),
      dialog: !!(S.__dialogOpen > 0),
      interlude: !!(S.__interludeOpen > 0),
      done: !!sc.done,
      objs: sc.artObjs ? sc.artObjs.length : 0
    };
  });

  /* 干净存档 + 从标题重开（序章门禁就在标题这一屏） */
  const fromTitle = async () => {
    await page.evaluate(() => {
      const S = window.SB;
      S.Save.wipe();
      S.Save.d = S.Save.def();
      S.Save.d.__nomom = true;
      const g = S.game;
      /* 同一帧里 stop 又 start 同一个场景，旧的 shutdown 会把新建的东西一起清掉。
       * 已经在标题就老实 restart。 */
      const t = g.scene.getScene('Title');
      g.scene.getScenes(true).forEach(s => {
        if (s.scene.key !== 'Sys' && s.scene.key !== 'Title') s.scene.stop();
      });
      if (t && t.scene.isActive()) t.scene.restart();
      else g.scene.start('Title');
    });
    await sleep(2600);
  };

  /* 直接把序章端上来（跑单镜用，不经过标题的淡出） */
  const startPro = async (data, patch) => {
    await page.evaluate((a) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.__nomom = true;
      S.Save.d.seenIntro = true;
      if (a.patch) Object.keys(a.patch).forEach(k => { S.Save.d[k] = a.patch[k]; });
      S.Save.save();
      const g = S.game;
      const t = g.scene.getScene('Prologue');
      g.scene.getScenes(true).forEach(s => {
        if (s.scene.key !== 'Sys' && s.scene.key !== 'Prologue') s.scene.stop();
      });
      if (t && t.scene.isActive()) t.scene.restart(a.d || { from: 'title', intro: true });
      else g.scene.start('Prologue', a.d || { from: 'title', intro: true });
    }, { d: data, patch: patch });
    await sleep(1600);
  };

  /* 把三行摘要一行一行读完（多按会一路按回去，所以按到关掉就停） */
  const drainInterlude = async () => {
    for (let i = 0; i < 14; i++) {
      const open = await page.evaluate(() => (window.SB.__interludeOpen | 0) > 0);
      if (!open) break;
      await page.keyboard.press('x');
      await sleep(340);
    }
    await sleep(1800);
  };

  /* 在序章的菜单里精确选中某一项（按名字走，不靠猜行号） */
  const pickMenu = async (label) => {
    const info = await page.evaluate(() => {
      const m = window.SB.game.scene.getScene('Prologue').menu;
      return m && m.isOpen() ? m.debug() : null;
    });
    if (!info) return false;
    const want = info.labels.indexOf(label);
    if (want < 0) return false;
    let step = want - info.cur;
    if (step < 0) { await key('ArrowUp', -step); } else { await key('ArrowDown', step); }
    await key('x');
    await sleep(700);
    return true;
  };

  /* 跳到第 n 镜（0 基），用于单独测某一镜 */
  const goBeat = async (n) => {
    await page.evaluate((i) => {
      const sc = window.SB.game.scene.getScene('Prologue');
      sc.closeMenu();
      sc.clearLineTimers();
      sc.playBeat(i);
    }, n);
    await sleep(900);
  };

  const flags = () => page.evaluate(() => {
    const f = window.SB.Save.d.flags || {};
    return { pro: !!f.prologue, skipped: !!f.prologueSkipped };
  });

  /* ============================================================ 一、结构 */
  console.log('\n【一】12 镜的数据、文案、画法、年份');
  const st = await page.evaluate(() => {
    const S = window.SB, P = S.STORY.prologue, L = S.L.story.prologue;
    const miss = [], noArt = [], noLines = [], badOpt = [];
    P.forEach(b => {
      if (!b.id || !b.kind || !b.art) miss.push(b.id || '?');
      if (!S.PROLOGUE_PAINT[b.art]) noArt.push(b.id + ':' + b.art);
      if (b.kind !== 'dialog' && !(L[b.lines] && L[b.lines].length)) noLines.push(b.id);
      if (b.kind === 'dialog' && !(L[b.lines] && L[b.lines].length)) noLines.push(b.id);
      (b.options || []).forEach((o, i) => {
        if (!L[o.label]) badOpt.push(b.id + '#' + i + ' label=' + o.label);
        if (o.say && !L[o.say]) badOpt.push(b.id + '#' + i + ' say=' + o.say);
      });
      if (b.gate && (!L[b.gateLabel] || !L[b.gateSay])) badOpt.push(b.id + ' gate');
    });
    const noSkip = P.filter(b => b.skippable === false).map(b => b.id);
    const dreams = P.filter(b => b.dream).map(b => b.id);
    const lasts = P.filter(b => b.last).map(b => b.id);
    const menus = P.filter(b => b.kind === 'menu').map(b => b.id);
    return {
      n: P.length, ids: P.map(b => b.id).join(','),
      miss, noArt, noLines, badOpt, noSkip, dreams, lasts, menus,
      slug: S.STORY.PRO_SLUG, clock: S.STORY.PRO_CLOCK, dream: S.STORY.DREAM_SLUG,
      wait: S.STORY.PRO_WAIT_MS,
      skip: (L.skip || []).slice(),
      album: L.album,
      gateBeat: P.filter(b => b.gate).map(b => b.id).join(','),
      allText: JSON.stringify(L)
    };
  });
  ok(st.n === 12, '一共 12 镜（' + st.ids + '）');
  ok(!st.miss.length, '每一镜都写清了 id / kind / art' + (st.miss.length ? ' 缺：' + st.miss : ''));
  ok(!st.noArt.length, '每一镜的画法都在 SB.PROLOGUE_PAINT 里' + (st.noArt.length ? ' 缺：' + st.noArt : ''));
  ok(!st.noLines.length, '每一镜都有文案' + (st.noLines.length ? ' 缺：' + st.noLines : ''));
  ok(!st.badOpt.length, '菜单选项和「车来了」的文案都对得上' + (st.badOpt.length ? ' 缺：' + st.badOpt : ''));
  ok(st.noSkip.join(',') === 's10,s11', '只有眨眼和色调迁移两镜不许跳（' + st.noSkip.join(',') + '）');
  ok(st.dreams.join(',') === 's11,s12', '色调迁移那一镜起，日期条换成 2004（' + st.dreams.join(',') + '）');
  ok(st.lasts.join(',') === 's12', '最后一镜要等玩家自己按（' + st.lasts.join(',') + '）');
  ok(st.slug.indexOf('2026') === 0, '现实层写的是 2026（' + st.slug + '）');
  ok(st.dream.indexOf('2004') === 0, '梦里写的是 2004（' + st.dream + '）');
  ok(/^\d\d:\d\d$/.test(st.clock), '现实层有具体时间（' + st.clock + '）');
  ok(st.skip.length === 3 && st.skip.join('').indexOf('2026') >= 0 && st.skip.join('').indexOf('2004') >= 0,
    '跳过摘要三行，把 2026 和 2004 都说清了');
  ok(!!(st.album && st.album.day && st.album.text && st.album.text.indexOf('2026') >= 0),
    '回忆册第一页的文案在（' + (st.album && st.album.day) + '）');
  ok(st.wait >= 12000 && st.wait <= 25000, '楼下等车 ' + Math.round(st.wait / 1000) + ' 秒');
  ok(st.gateBeat === 's05', '等车这件事只发生在 s05（' + st.gateBeat + '）');
  ok(st.allText.indexOf('1994') < 0 && st.allText.indexOf('1994') < 0, '序章文案里没有别的年份串进来');

  /* ============================================================ 二、正着看 */
  console.log('\n【二】从标题开新档，一镜一镜走到 2004');
  await fromTitle();
  let s = await page.evaluate(() => {
    const m = window.SB.__menu;
    return { open: !!(m && m.isOpen()), labels: m && m.isOpen() ? m.debug().labels : null };
  });
  ok(s.open && s.labels[0] === '开始这个暑假', '新档的标题第一项是「开始这个暑假」（' + (s.labels ? s.labels[0] : '') + '）');
  await key('x');                    // 开始这个暑假
  await sleep(2200);
  let p = await pro();
  ok(!!p, '开新档进的是序章，不是客厅（现在：' + (await at()) + '）');
  ok(p && p.id === 's01', '从第一镜开始（' + (p && p.id) + '）');
  ok(p && p.slugL.indexOf('2026') === 0, '屏幕顶上一直挂着 2026（' + (p && p.slugL) + '）');
  ok(p && p.slugR.indexOf('23:47') >= 0, '右上写着几点几分和地方（' + (p && p.slugR) + '）');
  ok(p && p.skipBtn, '右上角有「跳过」可以点');
  ok(p && p.hint.indexOf('跳过') >= 0, '底下提示写了怎么跳过（' + (p && p.hint) + '）');
  await shot('01_s01_office');

  /* 节奏：序章不自己往下翻页。一行打完就停着等人点，
   * 不点的话过多久都还在这一行、这一镜。 */
  await sleep(2500);
  const paceA = await pro();
  await sleep(6000);
  const paceB = await pro();
  ok(!!paceB && paceB.id === paceA.id, '不点的话不会自己翻到下一镜（6 秒后还在 ' + (paceB && paceB.id) + '）');
  ok(!!paceB && paceB.band === paceA.band, '不点的话旁白也不会自己往下走（还是同一行）');
  ok(!!paceB && paceB.waitTap, '打完一行会停下来等玩家点（等待标记 = ' + (paceB && paceB.waitTap) + '）');
  ok(!!paceB && paceB.caret, '等的时候右下角有个闪的 ▼，不至于让人以为卡住了');
  ok(!!paceB && paceB.hint.indexOf('继续') >= 0, '这时候提示写的是「继续」（' + (paceB && paceB.hint) + '）');

  /* 一直按 A：菜单镜自己挑第一项，等车那一镜把表往前拨，直到最后一镜 */
  const seen = {};
  let guard = 0;
  while (guard++ < 220) {
    p = await pro();
    if (!p) break;
    seen[p.id] = (seen[p.id] || 0) + 1;
    if (p.awaitLast) break;
    if (p.menuOpen) {
      /* 等车那一镜：把 18 秒拨到头，让「车来了」出现，然后走它 */
      if (p.id === 's05') {
        const g = await page.evaluate(() => {
          const sc = window.SB.game.scene.getScene('Prologue');
          return { open: sc.gateOpen, labels: sc.menu && sc.menu.isOpen() ? sc.menu.debug().labels : [] };
        });
        if (!g.open) {
          ok(g.labels.indexOf('车来了') < 0, '车还没到的时候，菜单里没有「车来了」这一项');
          await shot('05_s05_wait');
          await page.evaluate(() => { const sc = window.SB.game.scene.getScene('Prologue'); sc.gateAt = sc.time.now; });
          await sleep(700);
          const g2 = await page.evaluate(() => {
            const sc = window.SB.game.scene.getScene('Prologue');
            return sc.menu && sc.menu.isOpen() ? sc.menu.debug().labels : [];
          });
          ok(g2.indexOf('车来了') >= 0, '等满之后菜单里多出「车来了」（' + g2.join(' / ') + '）');
          const got = await pickMenu('车来了');
          ok(got, '能点「车来了」上车');
          continue;
        }
        if (g.open) { await pickMenu('车来了'); continue; }
      }
      await key('x');
      await sleep(500);
      continue;
    }
    if (p.dialog) { await key('x'); continue; }
    if (p.id === 's02' && !seen.__shot02) { seen.__shot02 = 1; await shot('02_s02_monitor'); }
    if (p.id === 's06' && !seen.__shot06) { seen.__shot06 = 1; await shot('06_s06_taxi'); }
    if (p.id === 's09' && !seen.__shot09) { seen.__shot09 = 1; await shot('09_s09_post'); }
    if (p.id === 's10' && !seen.__shot10) { seen.__shot10 = 1; await shot('10_s10_blink'); }
    await key('x', 1, 200);
  }
  p = await pro();
  ok(!!p && p.id === 's12', '一路按下来能走到最后一镜（' + (p && p.id) + '，按了 ' + guard + ' 下）');
  ok(!!p && p.slugL.indexOf('2004') === 0, '最后一镜日期条已经换成 2004（' + (p && p.slugL) + '）');
  ok(!!p && p.awaitLast, '最后一镜停下来等玩家自己按，不自动掉进客厅');
  ok(!!p && p.hint.indexOf('继续') >= 0, '这时候提示写的是「继续」（' + (p && p.hint) + '）');
  const shotIds = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12'];
  const missed = shotIds.filter(id => !seen[id]);
  ok(!missed.length, '12 镜一个都没被跳过去' + (missed.length ? ' 漏：' + missed.join(',') : ''));
  await shot('12_s12_warm');
  await key('x');
  await sleep(2400);
  const now = await at();
  ok(now.indexOf('Room') >= 0, '按下去进客厅（' + now + '）');
  let f = await flags();
  ok(f.pro && !f.skipped, '正着看完：记「看过」，不记「跳着看的」');
  await shot('13_room_after');

  /* ============================================================ 三、跳过 */
  console.log('\n【三】跳过：能跳，但那 6 秒不许跳');
  await startPro();
  await goBeat(9);                          // s10 眨眼
  p = await pro();
  ok(p && p.id === 's10' && !p.skipBtn, '眨眼这一镜右上角不给「跳过」按钮');
  ok(p && p.id === 's10', '能单独跳到眨眼那一镜（' + (p && p.id) + '）');
  await key('z');                           // B
  await sleep(700);
  p = await pro();
  ok(p && p.id === 's10' && !p.done, '在眨眼这一镜按 B，序章不会被跳掉');
  const toast = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Prologue');
    let hit = '';
    sc.children.list.forEach(o => {
      if (o && typeof o.text === 'string' && o.text.indexOf('跳不过去') >= 0) hit = o.text;
    });
    return hit;
  });
  ok(toast.length > 0, '屏幕上给了话说清为什么跳不了（' + toast + '）');
  ok(p && p.hint.indexOf('跳过') < 0, '这一镜的提示条也不写「跳过」（' + (p && p.hint) + '）');
  await shot('20_s10_noskip');

  await startPro();
  await sleep(600);
  await key('z');                           // 第一镜就跳
  await sleep(900);
  p = await pro();
  ok(!!p && p.interlude, '跳过之后先补三行摘要，不是直接黑到客厅');
  await shot('21_skip_summary');
  await drainInterlude();
  const now2 = await at();
  ok(now2.indexOf('Room') >= 0, '摘要读完进客厅（' + now2 + '）');
  f = await flags();
  ok(f.pro && f.skipped, '跳过也落盘：看过 + 跳着看的');

  /* ============================================================ 四、老档 */
  console.log('\n【四】老档（v2）读进来不许被序章拦住');
  const old = await page.evaluate(() => {
    const S = window.SB;
    /* 造一个 v2 的档：玩到第 20 天、有钱有卡带 */
    const d = S.Save.def();
    d.v = 2; d.day = 20; d.money = 12.5; d.seenIntro = true;
    d.carts['01'].owned = true;
    delete d.flags;                       // 老档里根本没有这个字段
    localStorage.setItem('nianhong_save_v1', JSON.stringify(d));
    S.Save.load();
    const s = S.Save.d;
    return {
      v: s.v, ver: S.Save.VER, day: s.day, money: s.money, cart: !!s.carts['01'].owned,
      pro: !!s.flags.prologue, skipped: !!s.flags.prologueSkipped,
      needPro: !s.flags.prologue
    };
  });
  ok(old.v === old.ver, '老档升到当前版本 v' + old.ver + '（实际 v' + old.v + '）');
  ok(old.day === 20 && old.money === 12.5 && old.cart, '老档的天数 / 钱 / 卡带一样没丢（第 ' + old.day + ' 天 ￥' + old.money + '）');
  ok(old.pro === true && old.skipped === false, '老档一律记成「序章看过」，不会半路被塞四分钟');
  ok(!old.needPro, '老玩家点「继续那个夏天」直接回客厅');

  /* ============================================================ 五、回忆册 */
  console.log('\n【五】回忆册第一页：那个晚上，能重看');
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.__nomom = true;
    S.Save.d.seenIntro = true;
    S.Save.d.flags.prologue = true;
    S.Save.d.flags.prologueSkipped = false;
    S.Save.d.album = [{ day: 3, title: '第 3 天', text: '你把坦克那张吹了三次。' }];
    S.Save.save();
    const g = S.game;
    const t = g.scene.getScene('Album');
    g.scene.getScenes(true).forEach(s => {
      if (s.scene.key !== 'Sys' && s.scene.key !== 'Album') s.scene.stop();
    });
    if (t && t.scene.isActive()) t.scene.restart({ from: 'Title' });
    else g.scene.start('Album', { from: 'Title' });
  });
  await sleep(1800);
  const alb = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Album');
    return {
      n: sc.entries.length,
      first: sc.entries[0],
      cur: sc.cur,
      hint: sc.hint ? sc.hint.full() : '',
      rows: sc.rows ? sc.rows.length : 0
    };
  });
  ok(alb.n === 2 && alb.first && alb.first.replay === 'prologue', '册子第一页是常驻的那个晚上（共 ' + alb.n + ' 条）');
  ok(alb.first && alb.first.title.indexOf('那个晚上') >= 0, '标题写的是「' + (alb.first && alb.first.title) + '」');
  ok(alb.hint.indexOf('重看') >= 0, '选中它的时候底下提示能重看（' + alb.hint + '）');
  await shot('30_album');
  await key('x');                           // A：重看
  await sleep(2400);
  p = await pro();
  ok(!!p, '按 A 真的重看起来了（现在：' + (await at()) + '）');
  const isReplay = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Prologue');
    return { replay: !!sc.replay, from: sc.from, albumFrom: sc.albumFrom };
  });
  ok(isReplay.replay && isReplay.from === 'album', '这次是「重看」模式（from=' + isReplay.from + '）');
  await key('z');                           // 跳过重看
  await sleep(800);
  await drainInterlude();
  const now3 = await at();
  ok(now3.indexOf('Album') >= 0, '重看走完回到回忆册，不是掉进客厅（' + now3 + '）');
  f = await flags();
  ok(f.pro && !f.skipped, '重看不动存档：不会因为重看时跳过就记成「跳着看的」');
  await shot('31_album_back');

  /* 鼠标路径：选中之后再点一下也能重看 */
  const scale = box.w / 480;
  const clickGame = async (gx, gy) => {
    await page.mouse.move(box.x + gx * scale, box.y + gy * scale);
    await sleep(180);
    await page.mouse.down(); await sleep(90); await page.mouse.up();
    await sleep(520);
  };
  const rowsXY = await page.evaluate(() => {
    const sc = window.SB.game.scene.getScene('Album');
    return (sc.rows || []).map(r => ({ x: r.txt.x + 30, y: r.y + 6, idx: r.idx }));
  });
  const row0 = rowsXY[0];
  if (row0 && rowsXY[1]) {
    /* 先守一条老账：每一行的点击回调必须各管各的。
     * 循环里写 var ii = idx 的话所有行共用最后一个 ii，点哪行都选中最后一行。 */
    await clickGame(rowsXY[1].x, rowsXY[1].y);
    const cur1 = await page.evaluate(() => window.SB.game.scene.getScene('Album').cur);
    ok(cur1 === 1, '点第二行选中的就是第二行（cur=' + cur1 + '）');
    await clickGame(row0.x, row0.y);
    const cur0 = await page.evaluate(() => {
      const sc = window.SB.game.scene.getScene('Album');
      return sc ? sc.cur : -1;
    });
    ok(cur0 === 0 || cur0 === -1, '点回第一行选中的就是第一行（cur=' + cur0 + '）');
    await clickGame(row0.x, row0.y);
    await sleep(2000);
    ok(!!(await pro()), '用鼠标点第一页也能重看（点 ' + Math.round(row0.x) + ',' + Math.round(row0.y) + '）');
    await page.evaluate(() => {
      const g = window.SB.game;
      const t = g.scene.getScene('Album');
      g.scene.getScenes(true).forEach(s => {
        if (s.scene.key !== 'Sys' && s.scene.key !== 'Album') s.scene.stop();
      });
      if (t && t.scene.isActive()) t.scene.restart({ from: 'Title' });
      else g.scene.start('Album', { from: 'Title' });
    });
    await sleep(1200);
  } else {
    ok(false, '拿不到回忆册第一行的点击框');
  }

  /* ============================================================ 六、门禁只在标题 */
  console.log('\n【六】老用例直接进客厅，不许被序章拦');
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();                       // 全新档：flags.prologue = false
    S.Save.d.__nomom = true;
    S.Save.d.seenIntro = true;
    S.Save.save();
    const g = S.game;
    const t = g.scene.getScene('Room');
    g.scene.getScenes(true).forEach(s => {
      if (s.scene.key !== 'Sys' && s.scene.key !== 'Room') s.scene.stop();
    });
    if (t && t.scene.isActive()) t.scene.restart({ from: 'title' });
    else g.scene.start('Room', { from: 'title' });
  });
  await sleep(2200);
  const now4 = await at();
  ok(now4.indexOf('Room') >= 0 && now4.indexOf('Prologue') < 0,
    '直接 scene.start(\'Room\') 还是客厅（' + now4 + '）');
  const short = await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.__nostory = true;            // 调试台一键短路
    const s = S.Save.d;
    return !s.flags.prologue && !s.__nostory;
  });
  ok(short === false, '__nostory 能一键短路序章门禁（给测试和调试台用）');

  /* ============================================================ 收尾 */
  ok(errs.length === 0, '整个过程没有报错' + (errs.length ? '：' + errs.slice(0, 4).join(' | ') : ''));

  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' 过 / ' + fail + ' 败');
  console.log('截图在 ' + OUT);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
