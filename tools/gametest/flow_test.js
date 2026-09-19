/* 真流程冒烟：完全靠鼠标点 + 键盘按，走一遍
 *   客厅 → 鞋盒 → 选卡插进主机 → 开电视（脏卡必花屏）→ 修卡 → 插回去 → 进游戏。
 * 只用玩家能用的操作，不直接调场景方法，专门用来抓「玩家点不动」的坑。
 * 画布是 480×270 的两倍，逻辑坐标 ×2 就是鼠标坐标。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'flow');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const click = async (x, y) => { await page.mouse.click(x * 2, y * 2); await sleep(450); };
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(300); } };
  const scenes = () => page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  const shot = async (tag) => {
    const sc = await scenes();
    await page.screenshot({ path: path.join(OUT, tag + '.png') });
    console.log('  [' + tag + '] 场景=' + sc);
    return sc;
  };
  const menu = () => page.evaluate(() => {
    const m = window.SB.__menu;
    return (m && m.isOpen()) ? m.debug() : null;
  });
  /* 在当前菜单里找到某一项并按下去 */
  const pick = async (re) => {
    let m = await menu();
    if (!m) { console.log('    ！没有菜单'); return false; }
    const idx = m.labels.findIndex(l => re.test(l));
    if (idx < 0) { console.log('    ！菜单里没有 ' + re + '，只有 ' + m.labels.join('/')); return false; }
    while ((await menu()).cur !== idx) await key('ArrowDown');
    console.log('    选中「' + m.labels[idx] + '」');
    await key('x');
    return true;
  };
  /* 把所有对话框点完（对话框在时按 A 推进；没有对话框就停手） */
  const clearDialog = async (max = 6) => {
    for (let i = 0; i < max; i++) {
      const open = await page.evaluate(() => !!(window.SB.__dialogOpen));
      if (!open) break;
      /* 打字机没打完时第一下是补完，所以这里一直按到关掉为止 */
      await key('x');
    }
    await sleep(300);
  };

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);   // 解锁音频（「点击开机」）
  await sleep(1200);

  /* 干净档：跳过开场、关掉妈妈、给两张卡，其中 02 故意搞脏逼出花屏 */
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset();
    S.Save.d.seenIntro = true;
    S.Save.d.__nomom = true;
    S.Save.d.money = 30;
    S.Save.d.carts['02'].owned = true;
    /* 卡造得很脏、卡槽也脏 → 首次开机几乎必花屏；
     * 但 wear 保持低位（wear 是永久的，堆太高会让修完还是开不出画面）。
     * 棉签给足，修卡时能把脏污真正擦下来。 */
    S.Save.d.carts['02'].dirt = 100;
    S.Save.d.carts['02'].wear = 12;
    S.Save.d.slotDirt = 95;
    S.Save.d.goods.swab = 4;
    S.Save.d.carts['05'].owned = true;
    S.Save.save();
    const g = S.game;
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
    g.scene.start('Room', { from: 'test' });
  });
  await sleep(1800);
  await clearDialog();
  await shot('01_room');

  /* --- 1) 点鞋盒 --- */
  console.log('→ 点鞋盒');
  await click(96, 246);
  await sleep(800);
  let sc = await shot('02_shelf');
  if (sc.indexOf('Shelf') < 0) { console.log('  ！！鞋盒进不去'); }

  /* --- 2) 挑那张脏卡插进主机 --- */
  console.log('→ 选坦克（脏卡）→ 插进主机');
  await click(120, 74);
  await sleep(600);
  await shot('03_cart_menu');
  await pick(/插进主机|插到底/);
  await sleep(700);
  await clearDialog();
  await sleep(900);
  await shot('04_back_room');
  console.log('  插卡后：' + JSON.stringify(await page.evaluate(() => ({
    inserted: window.SB.Save.d.inserted, seated: window.SB.Save.d.seated,
    scene: window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(',')
  }))));

  /* --- 3) 开电视（脏卡大概率花屏；万一一次点亮就关掉再开，最多试 3 次） --- */
  console.log('→ 点电视 → 开电视');
  const gstate = () => page.evaluate(() => {
    const S = window.SB, c = S.Save.cart('02'), p = S.game.scene.getScene('Play');
    return {
      tvOn: S.Save.d.tvOn, fault: S.Save.d.fault, inserted: S.Save.d.inserted,
      dirt: Math.round(c.dirt), wear: Math.round(c.wear),
      slotDirt: Math.round(S.Save.d.slotDirt), swab: S.Save.d.goods.swab,
      playing: !!(p && p.scene.isActive()),
      scene: S.game.scene.getScenes(true).map(s => s.scene.key).join(',')
    };
  });

  let st2 = null;
  for (let t = 1; t <= 3; t++) {
    await click(196, 60);
    await sleep(600);
    if (t === 1) await shot('05_tv_menu');
    const on = (await gstate()).tvOn;
    if (!(await pick(on ? /关电视/ : /开电视/))) break;
    await sleep(on ? 900 : 2200);
    await clearDialog();
    await sleep(600);
    st2 = await gstate();
    if (!on && st2.fault) break;                 // 花屏了，正是要测的
    if (!on && !st2.fault) {                     // 运气太好，退出来关掉电视再开
      console.log('  第 ' + t + ' 次开机居然出画面了，退回客厅关掉再开');
      if (st2.playing) {
        await sleep(2200);                       // 等开机动画走完，暂停菜单才开得出来
        await key('Enter');                      // START → 暂停菜单
        await sleep(700);
        await pick(/关电视，回客厅/);
        await sleep(2000); await clearDialog(); await sleep(800);
      }
      continue;
    }
  }
  console.log('  开机后：' + JSON.stringify(st2));
  await shot('07_after_power');

  /* --- 4) 花屏了：认清故障类型，用对症的手法修 --- */
  const FIXFOR = { SNOW: 'reseat', GLITCH: 'blow', ROLL: 'rub', SHAKE: 'slap', RAINBOW: 'puff' };
  let rounds = 0, slaps = 0;
  while (st2 && st2.fault && rounds < 8) {
    rounds++;
    const fault = st2.fault, fix = FIXFOR[fault];
    console.log('→ 第 ' + rounds + ' 轮：' + fault + '（该 ' + fix + '）');

    if (fix === 'slap' && slaps < 2) {
      /* 抖动横条：就在客厅拍电视一巴掌（成功率 75%；连拍三下会被妈骂，就该改走修卡台） */
      slaps++;
      await click(196, 60); await sleep(600);
      const hit = await pick(/拍一巴掌/);
      if (!hit) { console.log('  电视菜单里没有拍一巴掌，改走修卡台'); }
      else {
        await sleep(1200); await clearDialog(); await sleep(1400);
        st2 = await gstate();
        console.log('  拍完：' + JSON.stringify(st2));
        if (!st2.fault) break;
        continue;
      }
    }

    /* 其余都在修卡台上处理 */
    if (st2.scene.indexOf('Repair') < 0) {
      await click(196, 60); await sleep(600);
      if (!(await pick(/拿出来弄一下|拿到手里弄一下|修/))) break;
      await sleep(1600);
    }
    if ((await gstate()).scene.indexOf('Repair') < 0) { console.log('  ！！进不了修卡台'); break; }
    if (rounds === 1) await shot('08_repair');
    await clearDialog(8);                  // 进屏那句话先点完，不然 busy 挡住所有操作

    if (fix === 'blow') {
      /* 哈气：长按 A 蓄力（0.55~0.85 是最佳力度，约 0.6~0.8 秒） */
      await page.keyboard.down('x'); await sleep(650); await page.keyboard.up('x');
      await sleep(1000); await clearDialog(4);
      if (rounds === 1) await shot('09_blow');
    } else if (fix === 'rub') {
      /* 划桌：左右来回推两下就够，划多了是在磨掉卡带的命 */
      await key('ArrowLeft'); await key('ArrowRight');
      await sleep(600); await clearDialog(4);
      if (rounds === 1) await shot('10_rub');
    } else if (fix === 'puff') {
      await click(340, 88);                // 「吹卡槽」按钮
      await sleep(800); await clearDialog(4);
    }
    /* reseat（雪花）交给「插回去，开电视」本身完成 */

    /* 顺手把脏污与卡槽灰压下去，不然修完开机还是碰运气 */
    let cur2 = await gstate();
    if (cur2.dirt > 30 && cur2.swab > 0) { await click(340, 112); await sleep(800); await clearDialog(4); }
    cur2 = await gstate();
    if (cur2.slotDirt > 45) { await click(340, 88); await sleep(800); await clearDialog(4); }

    console.log('  修完：' + JSON.stringify(await page.evaluate(() => ({
      dirt: Math.round(window.SB.Save.cart('02').dirt),
      wear: Math.round(window.SB.Save.cart('02').wear),
      slotDirt: Math.round(window.SB.Save.d.slotDirt),
      blows: window.SB.Save.d.stats.blows, rubs: window.SB.Save.d.stats.rubs
    }))));

    /* 插回去，开电视：START */
    await clearDialog(4);
    await key('Enter');
    await sleep(2400);
    await clearDialog();
    await sleep(1200);
    st2 = await gstate();
    console.log('  开机结果：' + JSON.stringify(st2));
    if (rounds === 1) await shot('11_after_repair');
  }

  /* --- 5) 进游戏 --- */
  console.log('→ 坐下来玩');
  st2 = await gstate();
  if (!st2.playing && st2.scene.indexOf('Room') >= 0) {
    console.log('  当前：' + JSON.stringify(st2));
    if (!st2.tvOn) {
      await click(196, 60); await sleep(600);
      await pick(/开电视/); await sleep(2400); await clearDialog(); await sleep(900);
      st2 = await gstate();
    }
    if (!st2.playing && !st2.fault && st2.tvOn) {
      await click(196, 60); await sleep(600);
      await pick(/坐下来玩/);
      await sleep(2600);
    } else if (st2.fault) {
      console.log('  还在花屏：' + JSON.stringify(st2));
    }
  }
  await shot('12_play');
  /* 等游戏实例真正建起来：开机小动画 + 「叮——」大约 1.5 秒。
   * 脏卡还可能玩着玩着又花屏（游戏内随机事件，会把实例销毁并退回客厅），
   * 所以这里记录「曾经跑起来过」，而不是只看最后一帧。 */
  let play = { active: false, cartId: null, hasGame: false };
  let sawGame = false;
  for (let i = 0; i < 24; i++) {
    play = await page.evaluate(() => {
      const p = window.SB.game.scene.getScene('Play');
      return { active: !!(p && p.scene.isActive()), cartId: p && p.cartId, hasGame: !!(p && p.game_) };
    });
    if (play.hasGame) { sawGame = true; break; }
    if (!play.active && i > 6) break;
    await sleep(350);
  }
  await sleep(1200);
  await shot('13_playing');
  console.log('  Play 里：' + JSON.stringify(play) + '　跑起来过=' + sawGame);

  console.log('--- 错误 ---');
  if (!errs.length) console.log('  无');
  errs.slice(0, 20).forEach(e => console.log('  ' + e));

  const ok = sawGame && !errs.length;
  console.log('--- 结论 ---');
  console.log('  修卡轮数=' + rounds + '　进入游戏=' + sawGame + '　卡带=' + play.cartId);
  console.log(ok ? '  ✓ 全流程通' : '  ✗ 全流程没走通');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
