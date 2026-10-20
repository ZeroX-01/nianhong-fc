/* 回家吃饭 · 语音。
 *
 * 现在接的是 TTS 占位（见 assets/audio/voice/README.md），
 * 换成真人录音时保持文件名不变即可，代码不用动。
 *
 * 只有四段：妈妈的语音、门口一句、上桌一句、老板电话。
 * 面对面对话仍然以文字为主——全量配音会把这部片子的气质变成广播剧，
 * 也会把仓库撑大好几倍；先用这四段把“声音”这条路跑通。 */
(function (SB) {
  'use strict';

  var PATH = 'assets/audio/voice/';

  SB.HVoice = {
    enabled: true,
    current: null,
    currentKey: null,

    init: function () {
      var d = SB.HomeSave && SB.HomeSave.d;
      this.enabled = !(d && d.flags && d.flags.voice === false);
      return this;
    },

    toggle: function () {
      this.enabled = !this.enabled;
      if (!this.enabled) this.stop();
      var d = SB.HomeSave && SB.HomeSave.d;
      if (d) {
        if (!d.flags) d.flags = {};
        d.flags.voice = this.enabled;
        SB.HomeSave.save();
      }
      return this.enabled;
    },

    play: function (key) {
      if (!this.enabled || !key) return null;
      this.stop();
      try {
        var a = new Audio(PATH + key + '.mp3');
        a.volume = 0.9;
        a.preload = 'auto';
        this.current = a;
        this.currentKey = key;
        var p = a.play();
        if (p && p.catch) p.catch(function () { /* 自动播放被拦：静默，文字还在 */ });
        return a;
      } catch (e) {
        return null;
      }
    },

    stop: function () {
      if (this.current) {
        try { this.current.pause(); this.current.currentTime = 0; } catch (e) {}
      }
      this.current = null;
      this.currentKey = null;
    },

    playing: function () { return !!this.current; }
  };

})(window.SB);
