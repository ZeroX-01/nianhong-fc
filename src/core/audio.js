/* 音频。所有音源在 assets/audio/manifest.json 里登记。
 * 资源缺失时全部静默降级为空操作，保证游戏永远能跑。 */
(function (SB) {
  'use strict';

  SB.Audio = {
    game: null,
    manifest: null,
    ready: false,
    curBgm: null,
    curBgmKey: null,
    loops: {},          // 环境循环音
    missing: {},

    /* BootScene 里调用：拉取 manifest（失败也不阻塞）*/
    fetchManifest: function () {
      return fetch(SB.ASSETS.audioManifest, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { SB.Audio.manifest = j; return j; })
        .catch(function () { SB.Audio.manifest = null; return null; });
    },

    /* 把 manifest 里的条目排进 Phaser loader */
    queue: function (loader) {
      var m = this.manifest;
      if (!m) return 0;
      var n = 0;
      var add = function (item) {
        if (!item || !item.key || !item.file) return;
        loader.audio(item.key, ['assets/audio/' + item.file + '.ogg', 'assets/audio/' + item.file + '.mp3']);
        n++;
      };
      (m.sfx || []).forEach(add);
      (m.bgm || []).forEach(add);
      return n;
    },

    init: function (game) {
      this.game = game;
      this.ready = true;
      this.vol();
      return this;
    },

    meta: function (key) {
      var m = this.manifest;
      if (!m) return null;
      var i, a = m.sfx || [];
      for (i = 0; i < a.length; i++) if (a[i].key === key) return a[i];
      a = m.bgm || [];
      for (i = 0; i < a.length; i++) if (a[i].key === key) return a[i];
      return null;
    },

    exists: function (key) {
      return !!(this.game && this.game.cache.audio.exists(key));
    },

    vol: function () {
      if (!this.game) return;
      var s = SB.Save.d && SB.Save.d.settings;
      this.game.sound.volume = 1;
      if (this.curBgm && s) this.curBgm.setVolume((this.curBgmMeta && this.curBgmMeta.volume || 0.45) * s.bgm);
      var k;
      for (k in this.loops) {
        if (this.loops[k] && this.loops[k].setVolume) {
          this.loops[k].setVolume((this.loops[k].__base || 0.4) * (s ? s.sfx : 1));
        }
      }
    },

    /* ---------- 音效 ---------- */
    sfx: function (key, opts) {
      if (!this.ready || !this.exists(key)) { this.missing[key] = 1; return null; }
      var s = SB.Save.d && SB.Save.d.settings;
      var meta = this.meta(key) || {};
      var cfg = {
        volume: (opts && opts.volume !== undefined ? opts.volume : (meta.volume !== undefined ? meta.volume : 0.7)) * (s ? s.sfx : 1),
        rate: (opts && opts.rate) || 1,
        detune: (opts && opts.detune) || 0
      };
      try { return this.game.sound.play(key, cfg); } catch (e) { return null; }
    },

    /* ---------- 循环环境音 ---------- */
    loop: function (key, volume) {
      if (!this.ready || !this.exists(key)) return null;
      if (this.loops[key]) return this.loops[key];
      var s = SB.Save.d && SB.Save.d.settings;
      try {
        var snd = this.game.sound.add(key, { loop: true, volume: (volume || 0.35) * (s ? s.sfx : 1) });
        snd.__base = volume || 0.35;
        snd.play();
        this.loops[key] = snd;
        return snd;
      } catch (e) { return null; }
    },

    stopLoop: function (key) {
      var snd = this.loops[key];
      if (snd) { try { snd.stop(); snd.destroy(); } catch (e) {} delete this.loops[key]; }
    },

    stopAllLoops: function () {
      var k; for (k in this.loops) this.stopLoop(k);
    },

    /* 找一个还活着的场景来挂 tween。切场景那一瞬间可能一个都没有。 */
    _liveScene: function () {
      try {
        var list = this.game.scene.getScenes(true);
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].tweens && list[i].scene.isActive()) return list[i];
        }
      } catch (e) {}
      return null;
    },

    /* 音量渐变。
     * 关键点：绝不能把 tween 直接挂在 Sound 对象上 —— 声音一旦被 destroy，
     * tween 下一帧还会往它身上写 volume，Web Audio 的节点已经是 null，就会抛
     * 「Cannot set properties of null」。所以这里 tween 一个中间量，每帧再
     * 小心地喂给声音。 */
    _fade: function (snd, from, to, ms, onDone) {
      var sc = this._liveScene();
      var live = function () {
        return !!(snd && snd.manager && !snd.pendingRemove && snd.setVolume);
      };
      if (!sc) {
        if (live()) { try { snd.setVolume(to); } catch (e) {} }
        if (onDone) onDone();
        return;
      }
      var st = { v: from };
      if (live()) { try { snd.setVolume(from); } catch (e) {} }
      sc.tweens.add({
        targets: st, v: to, duration: ms,
        onUpdate: function () { if (live()) { try { snd.setVolume(st.v); } catch (e) {} } },
        onComplete: function () { if (onDone) onDone(); }
      });
    },

    /* ---------- BGM ---------- */
    bgm: function (key, fade) {
      if (!this.ready) return;
      if (this.curBgmKey === key && this.curBgm && this.curBgm.isPlaying) return;
      var s = SB.Save.d && SB.Save.d.settings;
      var meta = this.meta(key) || {};
      var target = (meta.volume !== undefined ? meta.volume : 0.45) * (s ? s.bgm : 0.5);

      var old = this.curBgm;
      if (old) {
        var kill = function () { try { old.stop(); old.destroy(); } catch (e) {} };
        if (fade === false) kill();
        else this._fade(old, old.volume, 0, 420, kill);
      }
      this.curBgm = null; this.curBgmKey = null; this.curBgmMeta = null;

      if (!key || !this.exists(key)) return;
      try {
        var snd = this.game.sound.add(key, { loop: (meta.loop !== false), volume: fade === false ? target : 0 });
        snd.play();
        this.curBgm = snd; this.curBgmKey = key; this.curBgmMeta = meta;
        if (fade !== false) this._fade(snd, 0, target, 600);
      } catch (e) {}
    },

    stopBgm: function () { this.bgm(null, true); },

    /* 浏览器音频解锁状态 */
    locked: function () {
      return !!(this.game && this.game.sound && this.game.sound.locked);
    }
  };

  /* ---------- 麦克风哈气检测（可选彩蛋） ---------- */
  SB.Mic = {
    ctx: null, analyser: null, data: null, stream: null,
    on: false, level: 0, failed: false,

    enable: function () {
      var self = this;
      if (this.on) return Promise.resolve(true);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.failed = true; return Promise.resolve(false);
      }
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (stream) {
          var AC = window.AudioContext || window.webkitAudioContext;
          self.ctx = new AC();
          var src = self.ctx.createMediaStreamSource(stream);
          self.analyser = self.ctx.createAnalyser();
          self.analyser.fftSize = 1024;
          self.analyser.smoothingTimeConstant = 0.75;
          src.connect(self.analyser);
          self.data = new Uint8Array(self.analyser.frequencyBinCount);
          self.stream = stream;
          self.on = true;
          return true;
        })
        .catch(function () { self.failed = true; return false; });
    },

    disable: function () {
      if (this.stream) { this.stream.getTracks().forEach(function (t) { t.stop(); }); }
      if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
      this.ctx = this.analyser = this.data = this.stream = null;
      this.on = false; this.level = 0;
    },

    /* 返回 0..1 的「吹气强度」：吹气的能量集中在低频且宽带 */
    read: function () {
      if (!this.on || !this.analyser) return 0;
      this.analyser.getByteFrequencyData(this.data);
      var n = this.data.length;
      var lowEnd = Math.floor(n * 0.12);     // 约 0–2.5kHz
      var sumLow = 0, sumAll = 0, i;
      for (i = 0; i < n; i++) {
        sumAll += this.data[i];
        if (i < lowEnd) sumLow += this.data[i];
      }
      var avgLow = sumLow / lowEnd;
      var ratio = sumAll > 0 ? sumLow / sumAll : 0;
      /* 吹气：低频均值高 且 低频占比高（说话/音乐会有更多高频结构） */
      var v = (avgLow / 110) * SB.clamp((ratio - 0.35) / 0.4, 0, 1.4);
      this.level = SB.clamp(v, 0, 1);
      return this.level;
    }
  };

})(window.SB);
