/* 回家吃饭 · 开机。只做两件事：装点阵字、初始化输入，然后进标题。 */
(function (SB) {
  'use strict';

  SB.HBootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function HBootScene() { Phaser.Scene.call(this, { key: 'HBoot' }); },

    preload: function () {
      this.load.bitmapFont('pix12', 'assets/font/pix12.png', 'assets/font/pix12.xml');
      this.load.bitmapFont('pix16', 'assets/font/pix16.png', 'assets/font/pix16.xml');
    },

    create: function () {
      SB.Input.init(this.game);
      SB.started = true;
      var boot = document.getElementById('boot');
      if (boot) {
        boot.classList.add('gone');
        setTimeout(function () { boot.style.display = 'none'; }, 520);
      }
      this.scene.start('HTitle');
    }
  });

})(window.SB);
