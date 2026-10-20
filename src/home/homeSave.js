/* 回家吃饭 · 独立存档。
 *
 * 只写 huijia_save_v1；原作的 nianhong_save_v1 只读，不调用 SB.Save.load()，
 * 因为 load() 会跑 migrate()，老档会被写一次。
 * 这里把原作档解析成一个只读的 origin 视图，再给 core 模块一个最小 settings 视图。 */
(function (SB) {
  'use strict';

  var KEY = 'huijia_save_v1';
  var ORIGIN_KEY = 'nianhong_save_v1';
  var VER = 1;

  var DEFAULT_SETTINGS = {
    crt: 1, scanline: true, bgm: 0.5, sfx: 0.8, mic: false, shake: true
  };

  function def() {
    return {
      v: VER,
      chapter: 'bus',          // bus | kitchen | table | end
      reply: 'none',           // yes | eight | late
      listen: 0,
      phone: 0,
      stay: false,
      takeConsole: false,
      takeConsoleDown: false,
      groceries: [],
      ending: null,
      flags: {}
    };
  }

  SB.HomeSave = {
    d: null,
    originRaw: null,
    origin: null,

    def: def,

    load: function () {
      var d = def();
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            for (var k in d) {
              if (Object.prototype.hasOwnProperty.call(d, k) &&
                  saved[k] !== undefined && saved[k] !== null) {
                d[k] = saved[k];
              }
            }
            if (!d.flags || typeof d.flags !== 'object') d.flags = {};
          }
        }
      } catch (e) { /* 坏档当新档 */ }
      d.listen = Math.max(0, Math.min(5, d.listen | 0));
      d.phone = Math.max(0, d.phone | 0);
      this.d = d;
      this.readOrigin();
      this.bindSettings();
      return d;
    },

    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) {}
    },

    reset: function () {
      this.d = def();
      this.save();
      return this.d;
    },

    setChapter: function (c) {
      this.d.chapter = c;
      this.save();
    },

    /* 只读原作档。不调用 SB.Save.load()，也不写 nianhong_save_v1。 */
    readOrigin: function () {
      this.originRaw = null;
      this.origin = null;
      try {
        var raw = localStorage.getItem(ORIGIN_KEY);
        if (!raw) return null;
        var o = JSON.parse(raw);
        this.originRaw = o;
        var st = o.story || {};
        this.origin = {
          ending: st.ending || null,
          ownConsole: !!st.ownConsole,
          momTrust: typeof o.momTrust === 'number' ? o.momTrust : 50,
          caught: o.caught | 0,
          album: Array.isArray(o.album) ? o.album : []
        };
      } catch (e) {
        this.origin = null;
      }
      return this.origin;
    },

    /* core 里的 audio/crt/input 会读 SB.Save.d.settings；
     * 给它们一个最小只读视图，不碰原作的 save()/migrate()。 */
    bindSettings: function () {
      var st = {};
      for (var k in DEFAULT_SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) st[k] = DEFAULT_SETTINGS[k];
      }
      var src = this.originRaw && this.originRaw.settings;
      if (src && typeof src === 'object') {
        for (var j in st) {
          if (Object.prototype.hasOwnProperty.call(st, j) && src[j] !== undefined) st[j] = src[j];
        }
      }
      SB.Save.d = { settings: st };
      return st;
    },

    /* 结算用的有效 listen：看手机太多扣一分。 */
    effectiveListen: function () {
      var n = this.d.listen;
      if (this.d.phone >= 3) n -= 1;
      return Math.max(0, Math.min(5, n));
    },

    ending: function () {
      var eff = this.effectiveListen();
      if (this.d.stay && eff >= 2) return 'stay_warm';
      if (!this.d.stay && eff >= 2) return 'leave_warm';
      if (this.d.stay) return 'stay_cold';
      return 'leave_cold';
    }
  };

})(window.SB);
