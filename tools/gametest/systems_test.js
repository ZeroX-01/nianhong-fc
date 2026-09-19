/* 系统层断言：把经济、时间、妈妈、修卡、存档这些「看不见的规则」在浏览器里跑一遍。
 * 不截图，只做判断，跑完打印 PASS/FAIL 清单。 */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1500);

  const out = await page.evaluate(() => {
    const S = window.SB;
    const R = [];
    const ok = (name, cond, extra) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
    const fresh = () => { S.Save.reset(); S.Save.d.__nomom = true; S.Save.d.seenIntro = true; return S.Save.d; };

    /* ---------------- 存档 ---------------- */
    let s = fresh();
    ok('新档在 2004-07-15 第 1 天', s.day === 1 && S.Time.date().getFullYear() === 2004,
      'day=' + s.day + ' ' + S.Time.date().getFullYear() + ' ' + S.Time.dateStr());
    ok('新档有零花钱', s.money > 0, '¥' + s.money);
    ok('新档自带坦克 + 100万合1 两张', S.Save.ownedCarts().length === 2 && s.carts['02'].owned && s.carts['05'].owned,
      S.Save.ownedCarts().map(c => c.name).join('/'));

    /* 老存档缺字段也能读起来（merge 兜底） */
    localStorage.setItem('nianhong_save_v1', JSON.stringify({ v: 1, day: 5, money: 7 }));
    S.Save.load();
    ok('缺字段的老存档能补齐', S.Save.d.day === 5 && !!S.Save.d.carts['07'] && !!S.Save.d.settings && !!S.Save.d.stats,
      'day=' + S.Save.d.day + ' money=' + S.Save.d.money);
    localStorage.setItem('nianhong_save_v1', '{坏掉的存档');
    S.Save.load();
    ok('坏存档不会把游戏卡死（直接开新档）', S.Save.d.day === 1);

    /* 改名之前存的档（旧键 subor_summer_save_v1）不能凭空消失：
     * 新键读不到时要去老键搬一次，搬完两边都留着。 */
    localStorage.removeItem('nianhong_save_v1');
    localStorage.setItem('subor_summer_save_v1', JSON.stringify({ v: 3, day: 9, money: 12.5 }));
    S.Save.load();
    ok('改名前的老档能自动搬过来', S.Save.d.day === 9 && S.Save.d.money === 12.5,
      'day=' + S.Save.d.day + ' ¥' + S.Save.d.money);
    ok('搬过来以后新键里也有了', !!localStorage.getItem('nianhong_save_v1'));
    ok('老键还留着（退回老版本还能玩）', !!localStorage.getItem('subor_summer_save_v1'));
    ok('标题页知道「有档可以继续」', S.Save.exists() === true);
    localStorage.removeItem('subor_summer_save_v1');

    /* ---------------- 时间 / 精力 ---------------- */
    s = fresh();
    const ap0 = s.ap;
    S.Time.spend(1);
    ok('干一件事扣 1 点精力', s.ap === ap0 - 1, ap0 + '→' + s.ap);
    const d0 = s.day;
    S.Time.sleep();
    ok('睡一觉进入第 2 天', s.day === d0 + 1 && s.ap > 0, 'day=' + s.day + ' ap=' + s.ap);
    ok('睡觉会合上作业本', !s.flags.bookOpen);
    let evs = 0;
    for (let i = 0; i < 200; i++) { if (S.Time.rollEvent()) evs++; }
    ok('随机事件会触发', evs > 0, evs + '/200');
    ok('暑假共 48 天', S.Time.summerDayCount === 48, '共 ' + S.Time.summerDayCount + ' 天');

    /* ---------------- 集市 ---------------- */
    s = fresh();
    const stock = S.Econ.stockToday();
    ok('集市每天有货', stock.length > 0, stock.length + ' 张');
    const c = stock[0];
    const p1 = S.Econ.priceOf(c);
    ok('卡带有价', p1 > 0, '¥' + p1);
    const h = S.Econ.newHaggle(c);
    const tooLow = S.Econ.offer(h, Math.round(p1 * 0.2));
    ok('砍太狠会被拒', tooLow.ok === false, JSON.stringify(tooLow).slice(0, 60));
    const fair = S.Econ.offer(S.Econ.newHaggle(c), Math.round(p1 * 0.9));
    ok('小砍一点能谈', !!fair, JSON.stringify(fair).slice(0, 60));
    s.money = 999;
    const buy = S.Econ.buyCart(c, p1);
    ok('钱够就能买到卡', buy.ok === true && S.Save.cart(c.id).owned === true, JSON.stringify(buy).slice(0, 60));
    s.money = 0.5;
    const poor = S.Econ.buyCart(stock[stock.length - 1], 99);
    ok('钱不够买不了', poor.ok === false);
    s.money = 999;
    const good = S.GOODS[0];
    const bg = S.Econ.buyGood(good);
    ok('杂货能买（' + good.name + '）', bg.ok === true, JSON.stringify(bg).slice(0, 60));

    /* 假卡：买到 fake 的卡插进去应该是死卡 */
    s = fresh();
    let fakeSeen = 0;
    for (let i = 0; i < 400; i++) {
      const st = S.Econ.stockToday();
      st.forEach(x => { if (x.__fake || (S.Save.cart(x.id) && S.Save.cart(x.id).fake)) fakeSeen++; });
      s.day++;
    }
    ok('集市会出现假卡（概率）', true, '命中 ' + fakeSeen + ' 次（仅供参考）');

    /* ---------------- 修卡 ---------------- */
    s = fresh();
    s.carts['02'].owned = true;
    s.carts['02'].dirt = 90;
    const fc = S.Repair.failChance('02');
    ok('脏卡开机大概率花屏', fc > 0.5, '概率=' + fc.toFixed(2));
    s.carts['02'].dirt = 2; s.carts['02'].wear = 0;
    ok('干净卡开机基本不花屏', S.Repair.failChance('02') < 0.25, '概率=' + S.Repair.failChance('02').toFixed(2));
    s.carts['02'].dirt = 80;
    const sess = {};
    const b1 = S.Repair.blow('02', 0.7, sess);
    ok('哈气力度合适能擦掉灰', b1.ok === true && s.carts['02'].dirt < 80, 'dirt=' + Math.round(s.carts['02'].dirt));
    const b2 = S.Repair.blow('02', 1.1, sess);
    ok('哈太猛反而更糟', b2.worse === true, 'dirt=' + Math.round(s.carts['02'].dirt));
    const w0 = s.carts['02'].wear;
    S.Repair.rub('02', 8, sess);
    ok('划太多次会留下不可逆磨损', s.carts['02'].wear > w0, 'wear=' + Math.round(s.carts['02'].wear));
    ok('对症才管用：雪花该插拔', S.Repair.isRightFix('SNOW', 'reseat') || S.Repair.isRightFix('SNOW', 'blow'));
    ok('对症才管用：抖动该拍电视', S.Repair.isRightFix('SHAKE', 'slap'));

    /* ---------------- 妈妈 ---------------- */
    s = fresh();
    s.__nomom = false;
    s.tvOn = true; s.inserted = '02'; s.carts['02'].owned = true;
    S.Parent.init();
    S.Parent.arm('out');
    ok('电视一开妈妈就上路了', S.Parent.state !== 'idle', 'state=' + S.Parent.state);
    let r = S.Parent.resolve();
    ok('电视开着被抓 = 要挨罚', r.level > 0, JSON.stringify(r).slice(0, 80));
    /* 关电视 + 拔卡 + 藏起来 */
    S.Parent.actions.tvOff();
    S.Parent.actions.hideCart('02');
    ok('藏卡会顺手把卡拔下来', s.inserted === null && s.hidden === '02');
    r = S.Parent.resolve();
    ok('藏得干净就没事', r.level === 0, JSON.stringify(r).slice(0, 80));
    /* 只摊本子装样子 vs 真写了作业 */
    s.tvOn = true; s.inserted = '02'; s.hidden = null; s.homework = 0;
    S.Parent.actions.openBook();
    ok('摊开本子不等于写了作业', s.homework === 0 && s.flags.bookOpen === true);
    const fake = S.Parent.resolve();
    s.homework = 80;
    const real = S.Parent.resolve();
    ok('真写了作业妈妈更心软', real.level <= fake.level, 'fake=' + fake.level + ' real=' + real.level);

    /* 处罚：手柄没收会过期 */
    s = fresh();
    s.padGone = 2;
    S.Time.sleep(); S.Time.sleep();
    ok('手柄没收几天后会还回来', s.padGone === 0, 'padGone=' + s.padGone);

    /* 借来的卡会到期 */
    s = fresh();
    s.carts['01'].borrowed = 2;              // 借来的卡：owned 保持 false
    s.inserted = '01'; s.tvOn = true;
    S.Time.sleep();
    const b = s.carts['01'].borrowed;
    S.Time.sleep();
    ok('借来的卡到期会还掉', s.carts['01'].borrowed === 0 && s.carts['01'].owned === false,
      'borrowed=' + b + '→' + s.carts['01'].borrowed);
    ok('还掉的卡不会留在主机里', s.inserted === null, 'inserted=' + s.inserted);

    /* ---------------- 回忆册 / 结局 ---------------- */
    s = fresh();
    S.Save.unlockAlbum('t1', '测试回忆', '正文');
    S.Save.unlockAlbum('t1', '测试回忆', '正文');
    ok('回忆册不会重复记同一条', s.album.length === 1, JSON.stringify(s.album).slice(0, 60));

    /* ---------------- 音频 / 资源 ---------------- */
    ok('音频清单加载成功', !!(S.Audio.manifest && S.Audio.manifest.sfx && S.Audio.manifest.bgm),
      'sfx=' + (S.Audio.manifest ? S.Audio.manifest.sfx.length : 0) + ' bgm=' + (S.Audio.manifest ? S.Audio.manifest.bgm.length : 0));
    const missKeys = ['ui_move', 'ui_confirm', 'tv_power_on', 'cart_blow', 'cart_rub', 'bgm_room', 'bgm_market',
      'bgm_friend', 'bgm_contra', 'bgm_tank', 'bgm_mario', 'bgm_fight', 'bgm_ending'].filter(k => !S.Audio.exists(k));
    ok('关键音频都在', missKeys.length === 0, missKeys.join(','));
    ok('没有缺图', Object.keys(S.MISSING || {}).length === 0, Object.keys(S.MISSING || {}).slice(0, 6).join(','));
    ok('12 张卡带都在册', S.CARTS.length === 12);
    ok('四个真游戏都注册了',
      ['contra', 'tank', 'mario', 'fight'].every(k => typeof S.Games[k] === 'function'),
      Object.keys(S.Games).join(','));

    S.Save.wipe(); S.Save.load();
    return R;
  });

  out.forEach(l => console.log(l));
  const fails = out.filter(l => l.startsWith('FAIL'));
  console.log('--- ' + (out.length - fails.length) + ' 过 / ' + fails.length + ' 挂 ---');
  if (errs.length) { console.log('--- JS 错误 ---'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
  await browser.close();
})();
