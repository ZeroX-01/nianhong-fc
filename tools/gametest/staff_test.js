/* 藏起来的制作名单（标题屏秘技 ↑↑↓↓←→←→）的回归测试。
 *
 * 为什么要有这个文件：这一页是发布版里唯一一处「藏着的」内容，
 * 它最容易在以后改标题屏时被静默弄坏 —— 没人会主动去按那八下。
 * 断言按以下顺序走：
 *   1. 秘技没输完之前不许出现（输错一下要从头数）
 *   2. 八下输对 → 名单出来，四行字都在，署名在里面
 *   3. 名单开着时主菜单必须是关掉的（否则底下的菜单会偷键）
 *   4. 按 B 收回 → 主菜单回来，光标还在原处，这一屏不许死掉
 *   5. 反复开关三次都稳
 *   6. 整段零 JS 报错
 *
 * 用法：node tools/gametest/staff_test.js [端口]
 *       脚本自己起 http 服务器，不用手动开。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = process.env.PORT || process.argv[2] || '8141';
const ROOT = path.join(__dirname, '..', '..');
const BASE = /^https?:\/\//.test(PORT) ? String(PORT).replace(/\/$/, '') : 'http://localhost:' + PORT;
const OUT = path.join(__dirname, 'staff');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

(async () => {
  let srv = null;
  if (!/^https?:\/\//.test(PORT)) {
    srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
    await sleep(1200);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', e => errs.push('' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(150); } };
  const state = () => page.evaluate(() => {
    const T = window.SB.game.scene.getScene('Title');
    if (!T) return null;
    /* 名单上的字直接从画面对象里捞，不看内部变量：玩家看见的才算 */
    const texts = [];
    T.children.list.forEach(o => {
      if (o.depth >= window.SB.D.OVERLAY && typeof o.text === 'string' && o.text) texts.push(o.text);
    });
    return {
      staffOn: !!T.staffOn,
      codeAt: T.codeAt | 0,
      menuOpen: !!(T.menu && T.menu.isOpen && T.menu.isOpen()),
      lastCur: T.lastCur | 0,
      texts: texts
    };
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await sleep(3000);
  /* 端口可能被别的项目的服务器占着（起服务器失败是静默的），先确认这一份是自己 */
  const title = await page.title();
  if (title !== '那年的红白机') {
    console.log('FAIL 端口 ' + PORT + ' 上跑的不是这个项目（title=' + title + '），换个端口再来');
    await browser.close(); if (srv) srv.kill(); process.exit(1);
  }
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);  // 点击开机
  await sleep(1800);

  console.log('\n[1] 秘技没输完不许出现');
  await key('ArrowUp', 2); await key('ArrowDown', 2); await key('ArrowLeft');
  let s = await state();
  ok(s && !s.staffOn, '输到一半（5/8）名单不出来');
  ok(s && s.codeAt === 5, '进度记在第 5 下　codeAt=' + (s && s.codeAt));
  await key('KeyX');                       // A 键：这一下是错的，会把进度打回去
  s = await state();
  ok(s && s.codeAt === 0, '按错一下从头数　codeAt=' + (s && s.codeAt));
  ok(s && !s.staffOn, '按错之后名单还是不出来');

  console.log('\n[2] 八下输对，名单出来');
  /* 上一步按了 A，会把主菜单的第一项选中并进游戏 —— 所以先回标题重来一遍 */
  await page.evaluate(() => { window.SB.game.scene.start('Title'); });
  await sleep(1800);
  await key('ArrowUp', 2); await key('ArrowDown', 2);
  await key('ArrowLeft'); await key('ArrowRight'); await key('ArrowLeft'); await key('ArrowRight');
  await sleep(600);
  s = await state();
  ok(s && s.staffOn, '八下输对，名单出来了');
  const joined = (s ? s.texts : []).join(' | ');
  ok(/制作名单/.test(joined), '第一行是「制作名单」');
  ok(/赵学/.test(joined), '署名在里面');
  ok(/2004/.test(joined), '有「写给 2004 年那个下午」这一行');
  ok(/按 B 回去/.test(joined), '写清楚了怎么退出');

  console.log('\n[3] 名单开着时菜单是关掉的');
  ok(s && !s.menuOpen, '主菜单已经关掉，不会在底下偷键');
  await page.screenshot({ path: path.join(OUT, 'staff_roll.png') });

  console.log('\n[4] 按 B 收回，这一屏不许死掉');
  await key('KeyZ');                       // B 键
  await sleep(700);
  s = await state();
  ok(s && !s.staffOn, '名单收回去了');
  ok(s && s.menuOpen, '主菜单回来了（没死屏）');
  ok(s && (s.texts.join('') === '' || !/制作名单/.test(s.texts.join(''))), '名单的字清干净了');

  console.log('\n[5] 反复开关三次');
  let stable = true;
  for (let i = 0; i < 3; i++) {
    await key('ArrowUp', 2); await key('ArrowDown', 2);
    await key('ArrowLeft'); await key('ArrowRight'); await key('ArrowLeft'); await key('ArrowRight');
    await sleep(450);
    let a = await state();
    if (!a || !a.staffOn) stable = false;
    await key('KeyZ');
    await sleep(600);
    let b = await state();
    if (!b || b.staffOn || !b.menuOpen) stable = false;
  }
  ok(stable, '开三次关三次，每次都稳');

  console.log('\n[6] 报错 ' + errs.length + ' 条');
  ok(errs.length === 0, '整段没有 JS 报错　' + JSON.stringify(errs.slice(0, 3)));

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  console.log('截图在 ' + OUT);
  await browser.close();
  if (srv) srv.kill();
  process.exit(fail ? 1 : 0);
})();
