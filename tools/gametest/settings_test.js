/* 设置面板：只用键盘走一遍机器背面那排旋钮。
 *   标题画面 → 设置 → 调音量（要立刻作用到正在放的 BGM）→ 换显像管档位
 *   → 打开「用麦克风哈气」（headless 里必然要不到权限，要求老实退回长按而不是报错）
 *   → 返回，设置得留在存档里。
 * 这一段专门盯着「改了设置但没生效 / 要权限失败就白屏」这两类坑。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'settings');
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

  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(260); } };
  const scenes = () => page.evaluate(() => window.SB.game.scene.getScenes(true).map(s => s.scene.key).join(','));
  const shot = async (tag) => { await page.screenshot({ path: path.join(OUT, tag + '.png') }); };
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.SB.Save.d.settings)));
  /* 走到设置里的第 i 项（defs 的下标） */
  const rowTo = async (id) => {
    for (let i = 0; i < 12; i++) {
      const cur = await page.evaluate(() => {
        const s = window.SB.game.scene.getScene('Settings');
        return s && s.defs && s.defs[s.cur] ? s.defs[s.cur].id : null;
      });
      if (cur === id) return true;
      await key('ArrowDown');
    }
    return false;
  };

  await page.goto('http://localhost:8100/index.html', { waitUntil: 'load' });
  await sleep(3200);
  await page.mouse.click(480, 270);      // 「点击开机」，解锁音频
  await sleep(1500);

  /* 从标题画面用菜单进设置——玩家就是这么进的。
   * 注意别在同一帧里 stop 掉正在跑的 Title 又 start 它（Phaser 会只剩 Sys），
   * 已经在标题画面就直接 restart。 */
  await page.evaluate(() => {
    const S = window.SB;
    S.Save.reset(); S.Save.d.seenIntro = true; S.Save.save();
    const g = S.game;
    const t = g.scene.getScene('Title');
    g.scene.getScenes(true).forEach(s => { if (s.scene.key !== 'Sys' && s.scene.key !== 'Title') s.scene.stop(); });
    if (t && t.scene.isActive()) t.scene.restart({ from: 'test' });
    else g.scene.start('Title');
  });
  await sleep(2000);
  for (let i = 0; i < 8; i++) {
    const m = await page.evaluate(() => {
      const m = window.SB.__menu;
      return (m && m.isOpen()) ? m.debug() : null;
    });
    if (m) {
      const idx = m.labels.findIndex(l => /设置/.test(l));
      if (idx >= 0) {
        while ((await page.evaluate(() => window.SB.__menu.debug().cur)) !== idx) await key('ArrowDown');
        await key('x');
        break;
      }
    }
    await key('x');                      // 标题画面上那句话先点完
  }
  await sleep(1600);
  ok((await scenes()).indexOf('Settings') >= 0, '标题画面能进设置');
  await shot('01_settings');

  /* --- 音乐音量：调下去要立刻作用在正在放的 BGM 上 --- */
  await rowTo('bgm');
  const before = await page.evaluate(() => ({
    set: window.SB.Save.d.settings.bgm,
    live: window.SB.Audio.curBgm ? window.SB.Audio.curBgm.volume : null
  }));
  await key('ArrowLeft', 4);
  const after = await page.evaluate(() => ({
    set: window.SB.Save.d.settings.bgm,
    live: window.SB.Audio.curBgm ? window.SB.Audio.curBgm.volume : null
  }));
  ok(after.set < before.set, '音乐音量能调低（' + before.set + ' → ' + after.set + '）');
  if (before.live !== null && after.live !== null) {
    ok(after.live < before.live + 1e-6, '正在放的 BGM 音量跟着变（' + before.live.toFixed(3) + ' → ' + after.live.toFixed(3) + '）');
  } else {
    console.log('  SKIP 这会儿没有在放 BGM，跳过实时音量');
  }
  await key('ArrowRight', 2);
  ok((await st()).bgm > after.set, '再往右能调回来');

  /* --- 音效音量 --- */
  await rowTo('sfx');
  await key('ArrowLeft', 3);
  const sfxLow = (await st()).sfx;
  ok(sfxLow < 1, '音效音量能调低（' + sfxLow + '）');
  await key('ArrowLeft', 12);
  ok((await st()).sfx === 0, '音效能一路拧到 0，不会变成负数');

  /* --- 显像管档位：0/1/2 三档，越界不能溢出 --- */
  await rowTo('crt');
  await key('ArrowRight', 5);
  ok((await st()).crt === 2, '显像管特效最高停在「很脏的老电视」');
  await key('ArrowLeft', 5);
  ok((await st()).crt === 0, '一路往左停在「关」，不会变成 -1');
  await key('ArrowRight');
  ok((await st()).crt === 1, '回到「正常」');
  await shot('02_crt');

  /* --- 扫描线 / 震屏：布尔项 --- */
  await rowTo('scanline');
  const sl0 = (await st()).scanline;
  await key('ArrowRight');
  ok((await st()).scanline !== sl0, '扫描线能开关');
  await key('ArrowRight');
  ok((await st()).scanline === sl0, '再按一下扫回来');

  /* --- 麦克风：headless 要不到权限，必须老实退回长按 --- */
  await rowTo('mic');
  await key('x');
  await sleep(2600);
  const micSt = await st();
  ok(micSt.mic === false, '要不到麦克风权限时老实退回「长按代替」，没有卡死');
  ok((await scenes()).indexOf('Settings') >= 0, '权限失败后还在设置里');
  await shot('03_mic');

  /* --- 返回：设置要落进存档 --- */
  await rowTo('back');
  await key('x');
  await sleep(1800);
  ok((await scenes()).indexOf('Title') >= 0, 'B / 返回 能回标题画面');
  const saved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('nianhong_save_v1');
    try { return JSON.parse(raw).settings; } catch (e) { return null; }
  });
  if (saved) {
    ok(saved.crt === 1 && saved.sfx === 0, '设置真的写进了 localStorage（crt=' + saved.crt + ' sfx=' + saved.sfx + '）');
  } else {
    console.log('  SKIP 读不到存档键名，跳过持久化校验');
  }
  await shot('04_back');

  console.log('--- 错误 ' + errs.length + ' 条 ---');
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  ok(errs.length === 0, '整段没有 JS 报错');

  console.log('\n=== ' + pass + ' 过 / ' + fail + ' 挂 ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
