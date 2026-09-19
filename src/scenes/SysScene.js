/* 常驻系统层。
 *
 * 一直挂在最上面、平时什么都不画，只管三件跟剧情无关的事：
 *   F 全屏、M 静音、以及切到后台时自动停掉声音（不然妈妈真的会听见）。 */
(function (SB) {
  'use strict';

  SB.SysScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function SysScene() { Phaser.Scene.call(this, { key: 'Sys', active: false }); },

    create: function () {
      var self = this;
      this.scene.bringToTop();

      this.input.keyboard.on('keydown-F', function () { self.toggleFullscreen(); });
      this.input.keyboard.on('keydown-M', function () { self.toggleMute(); });

      /* 切后台就闭嘴 */
      this.game.events.on(Phaser.Core.Events.BLUR, function () {
        self.game.sound.pauseAll();
      });
      this.game.events.on(Phaser.Core.Events.FOCUS, function () {
        if (!self.muted) self.game.sound.resumeAll();
      });

      this.muted = false;
    },

    toggleFullscreen: function () {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    },

    toggleMute: function () {
      this.muted = !this.muted;
      this.game.sound.mute = this.muted;
      this.toast(this.muted ? '静音' : '有声');
    },

    toast: function (msg) {
      if (this.tip) this.tip.destroy();
      this.tip = SB.Text.add(this, SB.W - 8, 4, msg, 12, SB.C.GREY8).setOrigin(1, 0).setDepth(SB.D.TOP);
      var t = this.tip;
      this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: function () { t.destroy(); } });
      this.tip = null;
    }
  });

})(window.SB);
