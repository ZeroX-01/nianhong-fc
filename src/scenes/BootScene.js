/* 开机。
 *
 * 这个场景做三件事：把资源全部读进来、把缺失的资源老实登记下来、
 * 等玩家点一下屏幕好让浏览器放我们出声（这一点点无奈也被写成了「点击开机」）。
 *
 * 原则：**任何资源缺失都不允许让游戏起不来**。缺图就登记在 SB.MISSING 里，
 * 后面的场景会用色块把画面画出来；缺音就静默。 */
(function (SB) {
  'use strict';

  SB.MISSING = {};

  function setBar(p, tip) {
    var bar = document.getElementById('bootbar');
    var t = document.getElementById('boottip');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
    if (t && tip) t.textContent = tip;
  }

  SB.BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); },

    preload: function () {
      var self = this, A = SB.ASSETS;

      this.load.on('progress', function (p) { setBar(p * 0.98, '正在预热显像管…'); });
      this.load.on('loaderror', function (f) {
        SB.MISSING[f.key] = true;
        if (window.console) console.warn('[资源缺失] ' + f.key + ' → ' + f.url);
      });

      /* 中文点阵字体：整个游戏的文字都靠它 */
      this.load.bitmapFont('pix12', A.fontBase + 'pix12.png', A.fontBase + 'pix12.xml');
      this.load.bitmapFont('pix16', A.fontBase + 'pix16.png', A.fontBase + 'pix16.xml');

      (A.images || []).forEach(function (a) { self.load.image(a.key, A.imgBase + a.path); });
      (A.sheets || []).forEach(function (a) {
        self.load.spritesheet(a.key, A.imgBase + a.path, { frameWidth: a.w, frameHeight: a.h });
      });

      /* 音频清单已在 main.js 里取好，这里只负责排进队列 */
      SB.Audio.queue(this.load);
    },

    create: function () {
      var self = this;
      setBar(1, '好了');

      this.makeFallbackTextures();

      SB.Audio.init(this.game);
      SB.Input.init(this.game);
      SB.Parent.init();

      /* 缺失清单打在控制台，方便后续补资源 */
      var miss = Object.keys(SB.MISSING);
      if (miss.length && window.console) {
        console.warn('本次共有 ' + miss.length + ' 个资源缺失，已用色块兜底：', miss.join(', '));
      }

      var bootEl = document.getElementById('boot');
      if (bootEl) { bootEl.classList.add('gone'); setTimeout(function () { bootEl.style.display = 'none'; }, 520); }

      /* 浏览器的自动播放策略：必须有一次手势才能出声。
       * 与其偷偷解锁，不如把它写成开机动作本身 —— 「点击开机」。 */
      if (this.sound && this.sound.locked) {
        var tap = document.getElementById('tapstart');
        if (tap) tap.classList.add('show');
        var go = function () {
          if (tap) tap.classList.remove('show');
          self.scene.start('Title');
        };
        this.sound.once(Phaser.Sound.Events.UNLOCKED, go);
        /* 有些环境不会派发 UNLOCKED（比如已经允许播放），兜一层超时 */
        this.time.delayedCall(4000, function () {
          if (self.scene.isActive('Boot')) { if (tap) tap.classList.remove('show'); self.scene.start('Title'); }
        });
        if (tap) tap.addEventListener('pointerdown', function () { self.sound.unlock(); }, { once: true });
        this.input.once('pointerdown', function () { self.sound.unlock(); });
      } else {
        this.scene.start('Title');
      }
    },

    /* 一些一定要有的小纹理，直接在运行时画出来，不依赖美术产出 */
    makeFallbackTextures: function () {
      if (!this.textures.exists('px')) {
        var g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 1, 1);
        g.generateTexture('px', 1, 1);
        g.destroy();
      }
      /* 沙沙的雪花：CRT 找不到 snow.png 时用它 */
      if (!this.textures.exists('snow')) {
        var w = 180, h = 135;
        var c = this.textures.createCanvas('snow', w, h);
        var ctx = c.getContext();
        var img = ctx.createImageData(w, h);
        for (var i = 0; i < w * h; i++) {
          var v = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 128 : 255);
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        c.refresh();
      }
      /* 扫描线：一像素亮、一像素暗，缩放时靠 NEAREST 保持锐利 */
      if (!this.textures.exists('scanline')) {
        var sc = this.textures.createCanvas('scanline', 4, 4);
        var sx = sc.getContext();
        sx.fillStyle = 'rgba(0,0,0,0)'; sx.fillRect(0, 0, 4, 4);
        sx.fillStyle = 'rgba(0,0,0,0.55)'; sx.fillRect(0, 1, 4, 1); sx.fillRect(0, 3, 4, 1);
        sc.refresh();
      }
    }
  });

})(window.SB);
