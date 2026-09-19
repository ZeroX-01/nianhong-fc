/* 入口。
 *
 * 一台 480×270 的机器，整数放大到你的屏幕上。
 * pixelArt + roundPixels 是这个游戏的底线：像素必须硬，不能糊。 */
(function (SB) {
  'use strict';

  function fatal(msg) {
    var el = document.getElementById('fatal');
    if (el) { el.style.display = 'block'; el.textContent = msg; }
    if (window.console) console.error(msg);
  }

  window.addEventListener('error', function (e) {
    /* 只在还没进入游戏时把错误抛到脸上；进游戏后交给控制台，避免遮住画面 */
    if (!SB.started) fatal('出错了：' + (e.message || e.error) + '\n（可以按 F5 重来一次）');
  });

  function start() {
    SB.Save.load();

    var cfg = {
      type: Phaser.AUTO,
      parent: 'game',
      width: SB.W,
      height: SB.H,
      backgroundColor: '#000000',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      powerPreference: 'low-power',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        /* 手机横屏时也尽量铺满 */
        expandParent: true
      },
      dom: { createContainer: false },
      input: { activePointers: 4, touch: { capture: true } },
      audio: { disableWebAudio: false },
      scene: [
        SB.BootScene,
        SB.TitleScene,
        SB.PrologueScene,
        SB.RoomScene,
        SB.ShelfScene,
        SB.RepairScene,
        SB.PlayScene,
        SB.MarketScene,
        SB.FriendScene,
        SB.HomeworkScene,
        SB.SettingsScene,
        SB.AlbumScene,
        SB.SysScene
      ]
    };

    /* 场景列表里任何一个没定义都会静默炸掉整台机器，先自己查一遍 */
    for (var i = 0; i < cfg.scene.length; i++) {
      if (!cfg.scene[i]) { fatal('有场景没有加载成功（第 ' + (i + 1) + ' 个）。请检查 index.html 的脚本顺序。'); return; }
    }

    SB.game = new Phaser.Game(cfg);
    SB.started = true;

    /* 留给会按 F12 的那种人：当年说明书最后一页也总印着一行做游戏的人的名字 */
    if (window.console && console.log) {
      console.log('%c那年的红白机%c　程序 · 美术 · 音乐 · 文案：赵学　2026 年夏',
        'color:#f5db6e;font-weight:bold', 'color:#92929f');
    }

    /* 常驻系统层：全屏 / 静音 / 切后台静音 */
    SB.game.events.once(Phaser.Core.Events.READY, function () {
      SB.game.scene.start('Sys');
    });
  }

  /* 音频清单要在 BootScene 排队之前拿到，拿不到就整局静音开玩 */
  window.addEventListener('load', function () {
    if (typeof Phaser === 'undefined') { fatal('Phaser 没有加载成功。请确认 vendor/phaser.min.js 存在。'); return; }
    SB.Audio.fetchManifest().then(start, start);
  });

})(window.SB);
