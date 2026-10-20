/* 回家吃饭 · 入口。
 * 和 index.html 共用 src/core；独立存档，只读原作档。 */
(function (SB) {
  'use strict';

  SB.HomeSave.load();
  SB.HVoice.init();

  var cfg = {
    type: Phaser.AUTO,
    parent: 'game',
    width: SB.W,
    height: SB.H,
    backgroundColor: '#07070a',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    powerPreference: 'low-power',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      expandParent: true
    },
    input: { activePointers: 4, touch: { capture: true } },
    scene: [
      SB.HBootScene,
      SB.HTitleScene,
      SB.HBusScene,
      SB.HKitchenScene,
      SB.HTableScene,
      SB.HEndScene
    ]
  };

  var i;
  for (i = 0; i < cfg.scene.length; i++) {
    if (!cfg.scene[i]) {
      var el = document.getElementById('fatal');
      if (el) { el.style.display = 'block'; el.textContent = '有场景没有加载成功（第 ' + (i + 1) + ' 个）。'; }
      return;
    }
  }

  SB.game = new Phaser.Game(cfg);
  SB.started = true;

  if (window.console && console.log) {
    console.log('%c回家吃饭%c　《那年的红白机》续篇 · 可玩样片',
      'color:#f5db6e;font-weight:bold', 'color:#92929f');
  }

})(window.SB);
