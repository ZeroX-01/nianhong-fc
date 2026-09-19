/* 位图文字。中文用点阵字体（12/16px 两套），全角 = 字号宽，半角 = 半宽。
 * 字体图集缺失时退化成系统等宽字体，游戏仍可运行（只是不够像素）。 */
(function (SB) {
  'use strict';

  var METRIC = {
    12: { font: 'pix12', line: 14, full: 12, half: 6 },
    16: { font: 'pix16', line: 18, full: 16, half: 8 }
  };

  function isHalf(code) {
    /* ASCII 与半角符号算半宽，其余（含中文、全角标点）算全宽 */
    return code >= 0x20 && code <= 0x7e;
  }

  SB.Text = {
    ok: function (scene, size) {
      var m = METRIC[size || 12];
      return !!(m && scene.cache.bitmapFont && scene.cache.bitmapFont.exists(m.font));
    },

    metric: function (size) { return METRIC[size] || METRIC[12]; },

    width: function (str, size) {
      var m = this.metric(size || 12), w = 0, max = 0;
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (str[i] === '\n') { if (w > max) max = w; w = 0; continue; }
        w += isHalf(c) ? m.half : m.full;
      }
      return Math.max(max, w);
    },

    lines: function (str) { return str.split('\n').length; },

    height: function (str, size) {
      return this.lines(str) * this.metric(size || 12).line;
    },

    /* 按像素宽度折行。中文可在任意位置断，英文尽量整词断。 */
    wrap: function (str, maxW, size) {
      var m = this.metric(size || 12);
      var out = '', lineW = 0, i, buf = '';
      var flushWord = function () { out += buf; buf = ''; };

      for (i = 0; i < str.length; i++) {
        var ch = str[i];
        if (ch === '\n') { flushWord(); out += '\n'; lineW = 0; continue; }
        var code = str.charCodeAt(i);
        var half = isHalf(code);
        var cw = half ? m.half : m.full;

        /* 行首禁止出现的标点：把它拉回上一行 */
        var noStart = '，。、；：？！）》】”’…—·%';
        if (lineW + cw > maxW) {
          if (noStart.indexOf(ch) >= 0) {
            /* 让标点挤在行尾，允许轻微溢出 */
          } else if (half && /[A-Za-z0-9]/.test(ch)) {
            /* 英文单词整体换行 */
            out += '\n'; lineW = 0;
            out += buf; lineW += this.width(buf, size); buf = '';
          } else {
            flushWord();
            out += '\n'; lineW = 0;
          }
        }

        if (half && /[A-Za-z0-9'\-]/.test(ch)) {
          buf += ch; lineW += cw;
          continue;
        }
        flushWord();
        out += ch; lineW += cw;
      }
      flushWord();
      return out;
    },

    add: function (scene, x, y, str, size, tint) {
      size = size || 12;
      var m = this.metric(size);
      var t;
      if (this.ok(scene, size)) {
        t = scene.add.bitmapText(Math.round(x), Math.round(y), m.font, str, size);
        if (tint !== undefined && tint !== null) t.setTint(tint);
      } else {
        t = scene.add.text(Math.round(x), Math.round(y), str, {
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: size + 'px',
          color: '#' + ('000000' + (tint === undefined ? 0xffffff : tint).toString(16)).slice(-6),
          resolution: 1
        });
        t.setLineSpacing(m.line - size);
      }
      t.setLetterSpacing && t.setLetterSpacing(0);
      return t;
    },

    addWrapped: function (scene, x, y, str, maxW, size, tint) {
      return this.add(scene, x, y, this.wrap(str, maxW, size), size, tint);
    },

    /* 折行 + 限制行数：超出的部分砍掉，末尾补省略号。
     * 面板高度是有限的，宁可少讲一句，也不能让描述压到下面的数值条上。 */
    clamp: function (str, maxW, size, maxLines) {
      var wrapped = this.wrap(str, maxW, size);
      if (!maxLines || maxLines < 1) return wrapped;
      var arr = wrapped.split('\n');
      if (arr.length <= maxLines) return wrapped;

      arr = arr.slice(0, maxLines);
      /* 最后一行如果是空行（原文的段间空行），往前找到有字的一行 */
      while (arr.length > 1 && !arr[arr.length - 1].length) arr.pop();

      var last = arr[arr.length - 1];
      /* 给省略号腾出位置：一个「…」是一个全角宽 */
      while (last.length && this.width(last + '…', size) > maxW) last = last.slice(0, -1);
      /* 省略号别紧跟在标点后面，看着像漏字 */
      while (last.length && '，、；：'.indexOf(last.charAt(last.length - 1)) >= 0) last = last.slice(0, -1);
      arr[arr.length - 1] = last + '…';
      return arr.join('\n');
    },

    /* 打字机效果。返回一个控制器：{ skip(), done, destroy() } */
    typewriter: function (scene, obj, full, speed, onDone) {
      var i = 0, acc = 0;
      speed = speed || 32;   // ms / 字
      obj.setText('');
      var ctrl = {
        done: false,
        skip: function () {
          i = full.length; obj.setText(full); this.done = true;
          if (this.ev) { this.ev.remove(false); this.ev = null; }
          if (onDone) onDone();
        },
        destroy: function () { if (this.ev) { this.ev.remove(false); this.ev = null; } }
      };
      ctrl.ev = scene.time.addEvent({
        delay: speed, loop: true, callback: function () {
          if (ctrl.done) return;
          i++;
          /* 换行符与标点后稍作停顿，读起来更像人在说话 */
          var ch = full[i - 1];
          obj.setText(full.slice(0, i));
          if (i >= full.length) { ctrl.done = true; ctrl.ev.remove(false); ctrl.ev = null; if (onDone) onDone(); }
          else if (ch && '，。！？…；：'.indexOf(ch) >= 0) { acc = 1; }
        }
      });
      return ctrl;
    }
  };

})(window.SB);
