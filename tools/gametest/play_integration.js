/* PlayScene 集成检查：把每张卡都在「电视里」真开一遍。
 * 关心三件事：小游戏实例有没有建起来、画面有没有东西、有没有报错。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'play');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CASES = [
  { id: '01', tag: 'contra' },
  { id: '02', tag: 'tank' },
  { id: '03', tag: 'mario' },
  { id: '04', tag: 'fight' },
  { id: '05', tag: 'multi' },
  { id: '06', tag: 'garble' },
  { id: '08', tag: 'null_cart' },
  { id: '12', tag: 'crash' }
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);
  await sleep(1200);

  for (const c of CASES) {
    const before = errs.length;
    /* 先回到一个中立的屏（标题），把上一局残留的转场、对话、fadeOut 都走完，
     * 再干净地进 Play。否则上一局排队里的 scene.start 会把新开的 Play 顺手停掉。 */
    await page.evaluate(() => {
      const g = window.SB.game;
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
      g.scene.start('Title');
    });
    await sleep(1200);

    await page.evaluate((id) => {
      const S = window.SB;
      S.Save.reset();
      S.Save.d.seenIntro = true;
      S.Save.d.__nomom = true;          // 别让妈妈打断测试
      S.Save.d.carts[id].owned = true;
      S.Save.d.carts[id].dirt = 0;
      S.Save.d.inserted = id;
      S.Save.d.seated = true;
      S.Save.d.tvOn = true;
      S.Save.d.owned.mag = true;
      S.Save.save();
      const g = S.game;
      g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys') s.scene.stop(); });
      g.scene.start('Play', { cartId: id });
    }, c.id);

    /* 开机动画 + 标题画面大约 2.5 秒，多等一点 */
    await sleep(5200);
    const st1 = await page.evaluate(() => {
      const p = window.SB.game.scene.getScene('Play');
      return {
        active: p.scene.isActive(),
        gameKey: p.gameKey,
        hasInst: !!p.game_,
        objs: p.children.list.length,
        rootKids: p.gameRoot ? p.gameRoot.list.length : -1
      };
    });
    await page.screenshot({ path: path.join(OUT, c.tag + '_1_start.png') });

    /* 随便按一会儿：方向 + A/B，看会不会炸 */
    for (const k of ['ArrowRight', 'x', 'ArrowRight', 'z', 'ArrowUp', 'x', 'ArrowLeft', 'x', 'ArrowDown', 'x']) {
      await page.keyboard.down(k); await sleep(160); await page.keyboard.up(k); await sleep(90);
    }
    await page.keyboard.down('ArrowRight'); await sleep(1400); await page.keyboard.up('ArrowRight');
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, c.tag + '_2_input.png') });

    const st2 = await page.evaluate(() => {
      const p = window.SB.game.scene.getScene('Play');
      const g = p.game_;
      return {
        active: p.scene.isActive(),
        hasInst: !!g,
        rootKids: p.gameRoot ? p.gameRoot.list.length : -1,
        over: !!(g && g.over),
        score: (g && (g.score !== undefined ? g.score : (g.p1 && g.p1.score))) || 0
      };
    });
    const newErr = errs.slice(before);
    console.log(`${c.tag.padEnd(10)} key=${String(st1.gameKey).padEnd(7)} inst=${st1.hasInst} 画面对象=${st1.rootKids}→${st2.rootKids} 分=${st2.score} 错误=${newErr.length}`);
    newErr.slice(0, 4).forEach(e => console.log('    ' + e.slice(0, 160)));
  }

  console.log('--- 全部错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 12).forEach(e => console.log('  ' + e.slice(0, 200)));
  await browser.close();
})();
