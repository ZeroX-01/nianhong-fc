/* 显像管。所有「隔着一层玻璃看老电视」的质感都在这里：
 * 扫描线 / 荫罩栅格 / 暗角圆角 / 玻璃反光 / 雪花 / 花屏 / 开机白光扫过 / 滚屏。
 * 同一套代码同时服务客厅里那台 140×104 的小屏幕和全屏 360×270 的游戏画面。 */
(function (SB) {
  'use strict';

  var SRC_W = 360, SRC_H = 270;   // 特效贴图的原始尺寸

  function CRT(scene, rect, opts) {
    this.scene = scene;
    this.r = rect;
    this.o = opts || {};
    this.depth = this.o.depth || SB.D.CRT;
    this.fault = null;
    this.rollY = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.t = 0;
    this.on = false;
    this.layers = [];
    this.build();
  }

  CRT.prototype.add = function (o, dz) {
    o.setDepth(this.depth + (dz || 0));
    this.layers.push(o);
    return o;
  };

  CRT.prototype.build = function () {
    var sc = this.scene, r = this.r;
    var sx = r.w / SRC_W, sy = r.h / SRC_H;

    /* --- 屏幕本体的黑底（关机时能看见自己的脸，所以不是纯黑） ---
     * 这一层必须垫在画面内容「下面」。客厅里的小电视靠 depth 顺序天然满足，
     * 全屏玩游戏时特效层整体被抬到最上面，所以要用 darkDepth 单独把黑底压回去，
     * 否则开机动画结束以后，这块黑底会把整个小游戏画面糊住。 */
    this.dark = this.add(sc.add.rectangle(r.x, r.y, r.w, r.h, 0x0a0b10, 1).setOrigin(0, 0), -6);
    if (this.o.darkDepth !== undefined) this.dark.setDepth(this.o.darkDepth);

    /* --- 雪花 / 花屏（内容层，在扫描线之下） --- */
    if (sc.textures.exists('snow')) {
      this.snow = this.add(sc.add.sprite(r.x, r.y, 'snow', 0).setOrigin(0, 0).setScale(sx, sy).setVisible(false), -5);
    }
    if (sc.textures.exists('glitch')) {
      this.glitch = this.add(sc.add.sprite(r.x, r.y, 'glitch', 0).setOrigin(0, 0).setScale(sx, sy).setVisible(false), -4);
    }

    /* --- 滚屏时压过画面的那道黑带 --- */
    this.rollBand = this.add(sc.add.rectangle(r.x, r.y, r.w, 16, SB.C.INK, 0.55).setOrigin(0, 0).setVisible(false), 1);

    /* --- 扫描线：TileSprite 保证 1:1 不缩放，永远是硬边 --- */
    if (sc.textures.exists('scanline')) {
      this.scan = this.add(sc.add.tileSprite(r.x, r.y, r.w, r.h, 'scanline').setOrigin(0, 0), 2);
    } else {
      var g = sc.add.graphics();
      g.fillStyle(SB.C.INK, 0.26);
      for (var y = 0; y < r.h; y += 2) g.fillRect(r.x, r.y + y, r.w, 1);
      this.scan = this.add(g, 2);
    }

    /* --- 荫罩 RGB 栅格：极淡，只在大屏幕上开 --- */
    if (sc.textures.exists('aperture') && r.w >= 240) {
      this.aper = this.add(sc.add.tileSprite(r.x, r.y, r.w, r.h, 'aperture').setOrigin(0, 0).setAlpha(0.5), 3);
    }

    /* --- 暗角（含 CRT 圆角） --- */
    if (sc.textures.exists('vignette')) {
      this.vig = this.add(sc.add.image(r.x, r.y, 'vignette').setOrigin(0, 0).setScale(sx, sy), 4);
    }

    /* --- 玻璃反光 --- */
    if (sc.textures.exists('glass')) {
      this.glass = this.add(sc.add.image(r.x, r.y, 'glass').setOrigin(0, 0).setScale(sx, sy).setAlpha(0.7), 5);
    }

    /* --- 开机白光 --- */
    if (sc.textures.exists('flash')) {
      this.flash = this.add(sc.add.image(r.x, r.y, 'flash').setOrigin(0, 0).setScale(sx, sy).setVisible(false), 6);
    }
    /* 开关机时整屏塌缩用的白条 */
    this.collapse = this.add(sc.add.rectangle(r.x, r.y + r.h / 2, r.w, 2, SB.C.WHITE, 1).setOrigin(0, 0.5).setVisible(false), 7);

    this.applyIntensity();
  };

  CRT.prototype.applyIntensity = function () {
    var s = (SB.Save.d && SB.Save.d.settings) || {};
    var k = s.crt === undefined ? 1 : s.crt;
    if (this.scan) this.scan.setAlpha((s.scanline === false ? 0 : 1) * k);
    if (this.aper) this.aper.setAlpha(0.5 * k);
    if (this.vig) this.vig.setAlpha(0.85 * k);
    if (this.glass) this.glass.setAlpha(0.7 * k);
  };

  /* ---------------- 状态切换 ---------------- */

  /* 关机：白条塌缩 + 全黑 */
  CRT.prototype.powerOff = function (cb) {
    var self = this, r = this.r;
    this.on = false;
    this.setFault(null);
    if (this.snow) this.snow.setVisible(false);
    if (this.glitch) this.glitch.setVisible(false);
    this.dark.setAlpha(1);
    this.collapse.setVisible(true).setDisplaySize(r.w, r.h);
    this.scene.tweens.add({
      targets: this.collapse, displayHeight: 2, duration: 180, ease: 'Quart.easeIn',
      onComplete: function () {
        self.scene.tweens.add({
          targets: self.collapse, displayWidth: 4, alpha: 0, duration: 160, ease: 'Quart.easeIn',
          onComplete: function () { self.collapse.setVisible(false).setAlpha(1); if (cb) cb(); }
        });
      }
    });
    SB.Audio.sfx('tv_power_off');
  };

  /* 开机：一声「啵」，白光横扫，然后进入指定状态 */
  CRT.prototype.powerOn = function (cb) {
    var self = this, r = this.r;
    this.on = true;
    this.dark.setAlpha(1);
    SB.Audio.sfx('tv_power_on');

    /* 先来一道横向白线，再展开 */
    this.collapse.setVisible(true).setAlpha(1).setDisplaySize(4, 2);
    this.scene.tweens.add({
      targets: this.collapse, displayWidth: r.w, duration: 130, ease: 'Quart.easeOut',
      onComplete: function () {
        self.scene.tweens.add({
          targets: self.collapse, displayHeight: r.h * 0.9, alpha: 0.35, duration: 170, ease: 'Quart.easeOut',
          onComplete: function () {
            self.collapse.setVisible(false).setAlpha(1).setDisplaySize(r.w, 2);
            if (self.flash) {
              self.flash.setVisible(true).setY(r.y - 40 * (r.h / SRC_H));
              self.scene.tweens.add({
                targets: self.flash, y: r.y + r.h, duration: 320, ease: 'Sine.easeIn',
                onComplete: function () { self.flash.setVisible(false); }
              });
            }
            if (cb) cb();
          }
        });
      }
    });
  };

  /* fault: null | 'SNOW' | 'GLITCH' | 'ROLL' | 'SHAKE' | 'RAINBOW' */
  CRT.prototype.setFault = function (fault) {
    this.fault = fault;
    var hasSnow = fault === 'SNOW';
    var hasGlitch = fault === 'GLITCH' || fault === 'RAINBOW';
    if (this.snow) this.snow.setVisible(hasSnow);
    if (this.glitch) {
      this.glitch.setVisible(hasGlitch);
      /* 彩虹纹：把花屏图压得很淡，糊在画面上 */
      this.glitch.setAlpha(fault === 'RAINBOW' ? 0.42 : 1);
      this.glitch.setBlendMode(fault === 'RAINBOW' ? Phaser.BlendModes.SCREEN : Phaser.BlendModes.NORMAL);
    }
    this.rollBand.setVisible(fault === 'ROLL');
    /* 偏色：滚屏故障时整块屏幕泛绿 */
    if (fault === 'ROLL') { this.dark.setFillStyle(0x0d1a10, 1); }
    else { this.dark.setFillStyle(0x0a0b10, 1); }

    if (hasSnow) SB.Audio.loop('tv_static', 0.22); else SB.Audio.stopLoop('tv_static');
    if (hasGlitch) SB.Audio.loop('tv_static', 0.13); else if (!hasSnow) SB.Audio.stopLoop('tv_static');
  };

  /* 屏幕内容是否需要被遮住（有内容时黑底要透出画面） */
  CRT.prototype.setContentVisible = function (v) {
    this.dark.setAlpha(v ? 0 : 1);
  };

  CRT.prototype.update = function (dt) {
    this.t += dt;
    var r = this.r;

    /* 雪花 / 花屏逐帧跳动 */
    if (this.snow && this.snow.visible) {
      this.snow.setFrame(Math.floor(this.t / 55) % 4);
    }
    if (this.glitch && this.glitch.visible) {
      this.glitch.setFrame(Math.floor(this.t / (this.fault === 'RAINBOW' ? 140 : 70)) % 3);
      /* 花屏时整块画面轻微左右错位 */
      var jitter = this.fault === 'GLITCH' ? (Math.random() < 0.25 ? SB.rndInt(-2, 2) : 0) : 0;
      this.glitch.setX(r.x + jitter);
    }

    /* 滚屏：黑带往上跑，同时把内容整体位移（由调用方读取 rollY） */
    if (this.fault === 'ROLL') {
      this.rollY = (this.rollY + dt * 0.06) % r.h;
      this.rollBand.setY(r.y + r.h - this.rollY);
    } else {
      this.rollY = 0;
    }

    /* 抖动横条 */
    if (this.fault === 'SHAKE') {
      this.shakeX = Math.random() < 0.4 ? SB.rndInt(-2, 2) : 0;
      this.shakeY = Math.random() < 0.2 ? SB.rndInt(-1, 1) : 0;
      if (this.scan) this.scan.setY(r.y + this.shakeY);
    } else {
      this.shakeX = this.shakeY = 0;
      if (this.scan) this.scan.setY(r.y);
    }

    /* 扫描线极缓慢地漂移，模仿行同步不完全稳定 */
    if (this.scan && this.scan.tilePositionY !== undefined) {
      this.scan.tilePositionY = (this.t * 0.004) % 4;
    }
  };

  CRT.prototype.setVisible = function (v) {
    this.layers.forEach(function (l) { if (l.setVisible) l.setVisible(v); });
    return this;
  };

  CRT.prototype.destroy = function () {
    SB.Audio.stopLoop('tv_static');
    this.layers.forEach(function (l) { if (l && l.destroy) l.destroy(); });
    this.layers = [];
  };

  SB.CRT = {
    create: function (scene, rect, opts) { return new CRT(scene, rect, opts); },

    /* 电视木框：给全屏 4:3 画面区的左右两侧补上电视机的边框和喇叭孔，
     * 让 16:9 的浏览器窗口看起来像在盯着一台 4:3 的显像管电视。 */
    bezel: function (scene, depth) {
      var d = depth || (SB.D.CRT + 20);
      var sx = SB.SCREEN.x, sw = SB.SCREEN.w;
      var g = scene.add.graphics().setDepth(d);

      function panel(x, w) {
        /* 塑料壳：主体 + 上缘高光 + 下缘暗部 */
        g.fillStyle(SB.C.WOOD6, 1); g.fillRect(x, 0, w, SB.H);
        g.fillStyle(SB.C.WOOD7, 1); g.fillRect(x, 0, w, 2);
        g.fillStyle(SB.C.WOOD5, 1); g.fillRect(x, SB.H - 3, w, 3);
        /* 竖向发黄斑驳 */
        g.fillStyle(SB.C.WOOD5, 0.35);
        for (var i = 0; i < w; i += 7) g.fillRect(x + i, 0, 1, SB.H);
        /* 喇叭孔阵列 */
        g.fillStyle(SB.C.WOOD4, 0.9);
        for (var yy = 74; yy < 196; yy += 4) {
          for (var xx = 12; xx < w - 12; xx += 4) g.fillRect(x + xx, yy, 2, 2);
        }
        /* 内侧一圈深色，让屏幕像凹进去 */
        g.fillStyle(SB.C.GREY2, 1);
      }
      panel(0, sx);
      panel(sx + sw, SB.W - sx - sw);

      /* 屏幕四周的内凹深边 */
      g.fillStyle(SB.C.GREY2, 1);
      g.fillRect(sx - 3, 0, 3, SB.H);
      g.fillRect(sx + sw, 0, 3, SB.H);
      g.fillStyle(SB.C.GREY1, 1);
      g.fillRect(sx - 1, 0, 1, SB.H);
      g.fillRect(sx + sw, 0, 1, SB.H);

      /* 右侧面板上的旋钮与电源灯，作为「这是一台实体电视」的锚点 */
      var rx = sx + sw + Math.floor((SB.W - sx - sw) / 2);
      g.fillStyle(SB.C.GREY5, 1); g.fillCircle(rx, 224, 7);
      g.fillStyle(SB.C.GREY3, 1); g.fillCircle(rx, 224, 5);
      g.fillStyle(SB.C.GREY7, 1); g.fillRect(rx - 1, 220, 2, 5);
      g.fillStyle(SB.C.GREY5, 1); g.fillCircle(rx, 246, 7);
      g.fillStyle(SB.C.GREY3, 1); g.fillCircle(rx, 246, 5);
      g.fillStyle(SB.C.GREY7, 1); g.fillRect(rx - 1, 242, 2, 5);
      g.fillStyle(SB.C.RED4, 1); g.fillRect(rx - 1, 40, 2, 2);

      /* 左侧铭牌 */
      var lx = Math.floor(sx / 2);
      g.fillStyle(SB.C.GREY3, 1); g.fillRect(lx - 16, 236, 32, 8);
      g.fillStyle(SB.C.GREY6, 1);
      for (var k = 0; k < 5; k++) g.fillRect(lx - 12 + k * 5, 239, 3, 2);

      return g;
    }
  };

})(window.SB);
