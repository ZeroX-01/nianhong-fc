/* 剧情核心断言：借来的机器、二手主机、零花钱账本、心情、被抓原因、
 * 作业本提示、老档迁移、结局分化。
 *
 * 这一份只跑规则，不截图。它要守住的是这一版新加的那条主线：
 *   家里那台是别人的 → 攒钱 → 45 块买下自己那台 → 结局跟着变。
 * 以及一条底线：老玩家的存档不能因为版本号变了就凭空消失。
 *
 * 跑法：node tools/gametest/story_core_test.js  （需要本地 8100 起着）*/
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8100';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1500);

  const out = await page.evaluate(() => {
    const S = window.SB;
    const R = [];
    const ok = (name, cond, extra) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
    const fresh = () => { S.Save.reset(); S.Save.d.__nomom = true; S.Save.d.seenIntro = true; return S.Save.d; };
    const KEY = 'nianhong_save_v1';

    /* ================= 1. 年代 ================= */
    let s = fresh();
    ok('这个夏天是 2004 年 7 月 15 日开始的',
      S.Time.date().getFullYear() === 2004 && S.Time.date().getMonth() === 6 && S.Time.date().getDate() === 15,
      S.Time.date().getFullYear() + '-' + S.Time.dateStr());
    ok('开场就说了这台机器是别人的',
      S.L.intro.join('').indexOf('同事') >= 0 && S.L.intro.join('').indexOf('开学前还') >= 0);

    /* ================= 2. 借来的那台 ================= */
    s = fresh();
    ok('新档里客厅那台是借的', S.Story.lent() === true);
    ok('还机的日子就是暑假最后一天', S.Story.dueDay() === S.Time.summerDayCount,
      'due=' + S.Story.dueDay() + ' 暑假=' + S.Time.summerDayCount);
    const left0 = S.Story.dueLeft();
    s.day = 40;
    ok('越往后剩的天数越少', S.Story.dueLeft() < left0, left0 + '→' + S.Story.dueLeft());
    s.day = 48;
    ok('最后一天就是 0 天', S.Story.dueLeft() === 0 && S.Time.isLastDay() === true);

    /* ================= 3. 集市上那台二手主机 ================= */
    s = fresh();
    const g = S.GOODS_BY_ID[S.STORY.CONSOLE_ID];
    ok('集市有一台二手主机在卖', !!g, g && g.name);
    const price = S.Econ.priceOfGood(g);
    ok('主机价钱在 45 块上下浮动', price >= 38 && price <= 52, '￥' + price);
    let same = true;
    for (let i = 0; i < 5; i++) if (S.Econ.priceOfGood(g) !== price) same = false;
    ok('同一天进两次集市看到的是同一个价', same, '￥' + price);
    let varied = false;
    for (let d = 1; d <= 20; d++) { s.day = d; if (S.Econ.priceOfGood(g) !== price) varied = true; }
    ok('换一天价钱会变', varied);
    s.day = 1;
    ok('一口价的小东西一分不浮动', S.Econ.priceOfGood(S.GOODS_BY_ID['swab']) === S.GOODS_BY_ID['swab'].price);

    /* 钱不够买不走；钱够了买下来就是自己的 */
    s.money = 3;
    let r = S.Econ.buyGood(g, S.Econ.priceOfGood(g));
    ok('钱不够抱不走那台主机', r.ok === false && S.Story.ownConsole() === false, JSON.stringify(r));
    ok('还差多少算得出来', S.Story.goalGap() > 0, '还差 ￥' + S.Story.goalGap());
    s.money = 60;
    const before = s.money, mood0 = S.Story.mood();
    r = S.Econ.buyGood(g, S.Econ.priceOfGood(g));
    ok('钱够了就能把主机买下来', r.ok === true && S.Story.ownConsole() === true, JSON.stringify(r));
    ok('买主机真的扣钱了', s.money < before, before + '→' + s.money);
    ok('买到自己那台是这个夏天最高兴的事', S.Story.mood() > mood0, mood0 + '→' + S.Story.mood());
    ok('买到之后目标差额归零', S.Story.goalGap() === 0);
    ok('买到主机会记进回忆册', s.album.some(a => a.id === 'own_console'));
    ok('一台只能买一次', S.Econ.buyGood(g, 45).ok === false);

    /* ================= 4. 零花钱账本 ================= */
    s = fresh();
    const t0 = S.Story.state().ledger.total;
    S.Story.earn(1.2, 'bottle');
    S.Story.earn(0.5, 'allowance');
    S.Story.earn(2.0, 'errand');
    ok('进账都记进了总数', S.Story.state().ledger.total === Math.round((t0 + 3.7) * 10) / 10,
      '总计 ￥' + S.Story.state().ledger.total);
    ok('今天的进账单独算', S.Story.todayTotal() === 3.7, '￥' + S.Story.todayTotal());
    const rows = S.Story.todayRows();
    ok('账本分得清钱是哪儿来的', rows.length === 3 && rows[0].v >= rows[1].v,
      rows.map(x => x.name + ' ' + x.v).join(' / '));
    ok('进账真的进了兜里', s.money > 3.5, '￥' + s.money);

    /* 睡一觉：今天清零，累计留着。
     * 别拿「今日 ≤ 0.5」当断言——睡觉时会掉随机事件，进账多少不由这里说了算；
     * 要验的是「今天这一栏只装今天新进的钱」。 */
    const total1 = S.Story.state().ledger.total;
    S.Time.sleep();
    const total2 = S.Story.state().ledger.total;
    ok('第二天今日进账清零，累计不清',
      total2 > total1 && S.Story.todayTotal() === Math.round((total2 - total1) * 10) / 10,
      '今日 ￥' + S.Story.todayTotal() + '　昨天累计 ￥' + total1 + ' → 今天累计 ￥' + total2);
    ok('每天有五毛零花钱，且记的是「零花钱」这一笔',
      S.Story.todayRows().some(x => x.name.indexOf('零花') >= 0), JSON.stringify(S.Story.todayRows()));

    /* 砍价省下的钱单独记一笔，且不是白给的钱 */
    s = fresh();
    const money0 = s.money;
    S.Econ.noteHaggle(10, 8.5);
    ok('砍价省下的钱记在账本上', S.Story.state().ledger.saved === 1.5, '省下 ￥' + S.Story.state().ledger.saved);
    ok('砍价不会凭空多出钱来', s.money === money0, '￥' + s.money);

    /* 心愿单：读得出目标、余额、心情，最后一行是能按的 */
    s = fresh();
    const wish = S.Story.wishItems();
    const wishTxt = wish.map(i => i.label + '|' + (i.sub || '')).join('　');
    ok('心愿单上写着那台二手主机', /二手小旋风主机|二手主机/.test(wishTxt), wishTxt.slice(0, 80));
    ok('心愿单上写着还差多少', /还差/.test(wishTxt));
    ok('心愿单上写着柜子上那台是借的', /借的/.test(wishTxt));
    ok('心愿单上有心情', wish.some(i => i.label === '心情'));
    ok('心愿单只有最后一行能按',
      wish.filter(i => !i.disabled).length === 1 && !wish[wish.length - 1].disabled);

    /* ================= 5. 心情 ================= */
    s = fresh();
    ok('心情是 0–100 的一个数', S.Story.mood() >= 0 && S.Story.mood() <= 100, S.Story.mood());
    ok('心情有一个说得出口的词', typeof S.Story.moodWord() === 'string' && S.Story.moodWord().length > 0,
      S.Story.moodWord());
    S.Story.addMood(-100);
    ok('心情跌到底也不会变成负数', S.Story.mood() === 0, S.Story.mood());
    const lowWord = S.Story.moodWord();
    S.Story.addMood(200);
    ok('心情涨破天也不会超过 100', S.Story.mood() === 100, S.Story.mood());
    ok('不同心情说的是不同的词', S.Story.moodWord() !== lowWord, lowWord + ' → ' + S.Story.moodWord());
    ok('心情不是资源：没有任何操作要「花心情」',
      typeof S.Story.spendMood === 'undefined' && typeof S.Story.useMood === 'undefined');

    /* 连着几天只写作业不玩，会闷 */
    s = fresh();
    S.Story.state().mood = 60;
    s.stats.plays = 0;
    for (let i = 0; i < S.STORY.QUIET_DAYS; i++) S.Time.sleep();
    ok('连着几天不玩会闷下来', S.Story.mood() < 60, '心情 ' + S.Story.mood() + '（' + S.Story.moodWord() + '）');
    /* 玩了就不闷 */
    s = fresh();
    S.Story.state().mood = 60;
    for (let i = 0; i < S.STORY.QUIET_DAYS; i++) { s.stats.plays += 3; S.Time.sleep(); }
    ok('天天有玩就不会闷', S.Story.mood() >= 60, '心情 ' + S.Story.mood());

    /* 跟妈妈和解：被抓过 + 信任挣回来，一次性 */
    s = fresh();
    s.caught = 2;
    s.momTrust = 90;
    const m0 = S.Story.mood();
    S.Time.sleep();
    ok('被抓过又把信任挣回来 = 和解，心情大涨', S.Story.mood() > m0 && s.flags.momWarm === true,
      m0 + '→' + S.Story.mood());
    const m1 = S.Story.mood();
    S.Time.sleep();
    ok('和解只发生一次', S.Story.mood() <= m1 + 1, m1 + '→' + S.Story.mood());

    /* ================= 6. 被抓要说清原因 ================= */
    s = fresh();
    s.__nomom = false;
    s.carts['02'].owned = true;
    S.Parent.init();
    s.tvOn = true; s.inserted = '02'; s.hidden = null;
    let res = S.Parent.resolve();
    ok('电视没关：原因写的是电视', res.why === 'tv' && res.level === 2, JSON.stringify(res.why));
    ok('电视没关：当场把原因说出来', res.lines.join('').indexOf('电视') >= 0, res.lines.join(' / ').slice(0, 60));

    s.tvOn = false; s.inserted = '02';
    res = S.Parent.resolve();
    ok('电视关了但卡带还插着：原因写的是卡带', res.why === 'cart' && res.level === 1, JSON.stringify(res.why));
    ok('卡带没拔：当场把原因说出来', res.lines.join('').indexOf('卡带') >= 0, res.lines.join(' / ').slice(0, 60));

    s.tvOn = false; s.inserted = null; s.hidden = '02';
    res = S.Parent.resolve();
    ok('电视关了卡带也拔了就没事', res.level === 0 && !res.why);

    /* 被抓心情会掉，而且电视开着掉得更多 */
    s = fresh(); s.__nomom = false; s.carts['02'].owned = true;
    S.Story.state().mood = 80;
    s.tvOn = false; s.inserted = '02';
    S.Parent.resolve();
    const moodCart = S.Story.mood();
    S.Story.state().mood = 80;
    s.tvOn = true; s.inserted = '02';
    S.Parent.resolve();
    const moodTv = S.Story.mood();
    ok('被抓会难受，现行比漏卡更难受', moodTv < moodCart && moodCart < 80,
      '漏卡后 ' + moodCart + '　现行后 ' + moodTv);

    /* ================= 7. 作业本只减轻惩罚，救不了没关电视 ================= */
    s = fresh(); s.__nomom = false; s.carts['02'].owned = true;
    ok('作业本的说明写清了它救不了什么',
      S.L.story.book.join('').indexOf('关电视') >= 0 && S.L.story.book.join('').indexOf('拔卡带') >= 0,
      S.L.story.book.join(' '));
    s.tvOn = true; s.inserted = '02'; s.homework = 0; s.flags.bookOpen = false;
    s.caught = 2;
    const noBook = S.Parent.resolve();
    s.caught = 2; s.tvOn = true; s.inserted = '02';
    S.Parent.actions.openBook();
    const withBook = S.Parent.resolve();
    ok('摊开作业本救不了「电视还开着」', withBook.level === 2, 'level=' + withBook.level);
    ok('但摊开作业本能把惩罚降一档',
      ['homework', 'pad', 'cart'].indexOf(withBook.punish) <= ['homework', 'pad', 'cart'].indexOf(noBook.punish),
      noBook.punish + ' → ' + withBook.punish);
    ok('作业本救下来的那一档要让玩家看见',
      withBook.lines.join('').indexOf('作业本') >= 0, withBook.lines.join(' / ').slice(0, 80));

    /* ================= 8. 老存档迁移 ================= */
    /* 1.0 的档：只有 v:1 和几个字段，机器要能读进来，钱和天数一个都不能丢 */
    localStorage.setItem(KEY, JSON.stringify({
      v: 1, day: 20, money: 12.5, caught: 3, momTrust: 30,
      carts: { '02': { owned: true, dirt: 40, cleared: true, plays: 9 } },
      stats: { plays: 9, days: 20 }, album: [{ id: 'old', title: '旧回忆', text: '旧的', day: 3 }]
    }));
    S.Save.load();
    let d = S.Save.d;
    ok('老档读得进来，天数和钱都没丢', d.day === 20 && d.money === 12.5, 'day=' + d.day + ' ￥' + d.money);
    ok('老档不会被当成新档清掉', d.album.length === 1 && d.carts['02'].owned === true);
    ok('老档补上了新字段', !!d.story && !!d.story.ledger && !!d.carts['07'],
      'story=' + JSON.stringify(d.story).slice(0, 60));
    ok('老档也按「机器是借的」补上设定', d.story.lent === true && d.story.dueDay === S.Time.summerDayCount);
    ok('老档要用一句短的把设定补上，而不是重播开场', S.Story.needLateNote() === true);
    ok('老档手上的钱记成了以前攒的', d.story.ledger.total >= 12.5 && d.story.ledger.legacy === true,
      '累计 ￥' + d.story.ledger.total);
    ok('老档的心情按他这个夏天过得怎么样估的（被抓 3 次、信任 30）',
      d.story.mood > 0 && d.story.mood < 60, '心情 ' + d.story.mood);
    ok('迁移完版本号升上去了', d.v === S.Save.VER, 'v=' + d.v);
    ok('迁移完立刻落了盘', JSON.parse(localStorage.getItem(KEY)).v === S.Save.VER);
    /* 再读一次不会把已经讲过的设定重讲、也不会把账本重算 */
    d.story.told = true; d.story.legacyNote = false; S.Save.save();
    S.Save.load();
    ok('迁移过的档再开机不会重来一遍', S.Save.d.story.told === true && S.Save.d.story.ledger.legacy === true);

    /* 数值状态不许塞 flags：flags 默认是 {}，merge 不会给它内部补默认值 */
    localStorage.setItem(KEY, JSON.stringify({ v: 1, day: 3, money: 1, flags: {} }));
    S.Save.load();
    ok('心情和账本不在 flags 里（否则老档会读出 undefined）',
      typeof S.Save.d.story.mood === 'number' && typeof S.Save.d.story.ledger.total === 'number'
      && S.Save.d.flags.mood === undefined,
      '心情 ' + S.Save.d.story.mood);

    /* 比当前版本更新的档（玩家退回老版本）也不能清 */
    localStorage.setItem(KEY, JSON.stringify({ v: 99, day: 7, money: 4, __future: 1 }));
    S.Save.load();
    ok('比自己新的档也不清，多出来的键还留着',
      S.Save.d.day === 7 && S.Save.d.__future === 1, 'day=' + S.Save.d.day);
    /* 坏档才允许开新档 */
    localStorage.setItem(KEY, '{这不是 JSON');
    S.Save.load();
    ok('只有真读不出来的档才开新的', S.Save.d.day === 1);

    /* ================= 9. 睡觉不会把剧情状态冲掉 ================= */
    s = fresh();
    S.Story.earn(5, 'books');
    S.Story.state().mood = 42;
    const keep = { total: S.Story.state().ledger.total };
    S.Time.sleep(); S.Time.sleep();
    ok('睡两觉，累计进账还在', S.Story.state().ledger.total > keep.total, '￥' + S.Story.state().ledger.total);
    ok('睡两觉，借机状态还在', S.Story.lent() === true);
    /* 睡觉只会让心情往下走（闷了几天）或不动，绝不能被冲回默认的 60 */
    ok('睡两觉，心情不会被重置成初始值',
      S.Story.mood() !== 60 && S.Story.mood() <= 42, '心情 ' + S.Story.mood());

    /* ================= 10. 结局分化 ================= */
    const variantOf = (setup) => {
      const st = fresh();
      setup(st);
      return S.Story.endingVariant();
    };
    const vOwnWarm = variantOf(st => { S.Story.state().ownConsole = true; st.momTrust = 80; });
    const vOwnCold = variantOf(st => { S.Story.state().ownConsole = true; st.momTrust = 20; st.flags.momWarm = false; });
    const vLostWarm = variantOf(st => { st.momTrust = 80; S.Story.state().mood = 70; });
    const vLostCold = variantOf(st => { st.momTrust = 10; st.caught = 6; S.Story.state().mood = 15; });
    ok('买到主机 + 妈妈关系好 = 一个结局', vOwnWarm === 'own_warm', vOwnWarm);
    ok('买到主机 + 妈妈关系差 = 另一个结局', vOwnCold === 'own_cold', vOwnCold);
    ok('没买到但过得不错 = 又一个结局', vLostWarm === 'lost_warm', vLostWarm);
    ok('没买到又一直被抓 = 最冷的那个结局', vLostCold === 'lost_cold', vLostCold);
    ok('四个结局互不相同', new Set([vOwnWarm, vOwnCold, vLostWarm, vLostCold]).size === 4);

    /* 结局正文跟着「机器还了没有」变 */
    s = fresh();
    const lostBody = S.Story.endingBody().join('');
    S.Story.state().ownConsole = true;
    const ownBody = S.Story.endingBody().join('');
    ok('没买到：8 月 31 日机器被搬走', lostBody.indexOf('搬走') >= 0 || lostBody.indexOf('箱') >= 0,
      lostBody.slice(0, 40));
    ok('买到了：搬走的是别人那台，你留下自己那台',
      ownBody !== lostBody && ownBody.indexOf('不用还') >= 0, ownBody.slice(-24));
    const tail = S.Story.endingTail().join('');
    ok('结尾那两句也分两版', tail.length > 0 && tail !== S.L.story.endTail.lost.join(''), tail.slice(0, 30));
    /* 命中的变体要落盘，回忆册和存档都查得到 */
    s = fresh();
    s.momTrust = 80; S.Story.state().ownConsole = true;
    const lines = S.Story.endingVariantLines();
    ok('结局变体有正文', lines.length > 0, lines[0]);
    ok('命中的结局记在存档里', S.Save.d.story.ending === 'own_warm' && S.Save.d.flags.endingVariant === 'own_warm',
      S.Save.d.story.ending);

    /* ================= 11. 章节 ================= */
    s = fresh();
    const chs = [];
    [1, 8, 20, 30, 45].forEach(day => { s.day = day; chs.push(S.Story.chapterNow().id); });
    ok('五章按天数往前走', new Set(chs).size === 5, chs.join(' → '));
    ok('章节有一行能显示的字', /第.章 · /.test(S.Story.chapterLine()), S.Story.chapterLine());

    S.Save.wipe(); S.Save.load();
    return R;
  });

  out.forEach(l => console.log(l));
  const fails = out.filter(l => l.startsWith('FAIL'));
  console.log('--- ' + (out.length - fails.length) + ' 过 / ' + fails.length + ' 挂 ---');
  if (errs.length) { console.log('--- JS 错误 ---'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
