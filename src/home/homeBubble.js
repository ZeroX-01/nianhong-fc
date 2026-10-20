/* 回家吃饭 · 人物气泡。
 *
 * 和底部大对话框不同：气泡贴着说话的人，短句、一次一句，A / 点屏幕继续。
 * 叙述仍然用 SB.UI.dialog（它更像“旁白字幕”），面对面的对话尽量走这里。
 *
 * 用法：
 *   SB.HomeBubble.say(scene, [
 *     { who: 'mom', text: '回来啦。' },
 *     { who: 'you', text: '嗯。' }
 *   ], { onDone: function () {} });
 */
(function (SB) {
  'use strict';

  var DEPTH = SB.D.DIALOG;

  SB.HomeBubble = {
    active: null,

    say: function (scene, lines, opts) {
      opts = opts || {};
      if (!lines || !lines.length) { if (opts.onDone) opts.onDone(); return null; }
      if (this.active) this.active.close(true);

      var self = this;
      var i = 0, closed = false, tw = null, objs = [], zone = null;
      var bornFrame = SB.Input.frame;
      var W = SB.W, H = SB.H;
      var momAnchor = opts.momPos || { x: 320, y: 60 };

      var api = {
        close: function () { close(false); },
        next: next,
        isOpen: function () { return !closed; }
      };

      function clear() {
        if (tw) { tw.destroy(); tw = null; }
        for (var k = 0; k < objs.length; k++) {
          if (objs[k] && objs[k].destroy) objs[k].destroy();
        }
        objs = [];
      }

      function boxOf(who) {
        if (who === 'mom') return { maxW: 232, fill: 0x2a1a10, border: 0xe6c49a, text: 0xf7dcbe, tail: 1 };
        if (who === 'you') return { x: W - 24, y: 146, maxW: 228, fill: 0x14141c, border: 0x93d4ea, text: 0xdcdce2, tail: -1 };
        return { x: 40, y: 210, maxW: 400, fill: 0x14141c, border: 0x6d6d80, text: 0xdcdce2, tail: 0 };
      }

      function maxLineWidth(s) {
        var arr = (s || '').split('\n'), m = 0, k;
        for (k = 0; k < arr.length; k++) m = Math.max(m, SB.Text.width(arr[k], 12));
        return m;
      }

      function show() {
        if (closed) return;
        if (i >= lines.length) { close(false); return; }
        clear();
        var item = lines[i];
        var who = item.who || 'narr';
        var text = item.text || '';
        var b = boxOf(who);
        var wrapped = SB.Text.wrap(text, b.maxW, 12);
        var n = SB.Text.lines(wrapped);
        var tw2 = Math.min(b.maxW, maxLineWidth(wrapped) + 20);
        var h = n * 14 + 12;
        var x = who === 'you' ? (W - 24 - tw2) : (who === 'narr' ? Math.round((W - tw2) / 2) : 24);
        var y = b.y || 40;
        if (who === 'mom') {
          /* 气泡贴在妈妈左边，尾巴指向她；不再固定钉在左上角 */
          x = Math.max(8, Math.min(momAnchor.x - tw2 - 12, W - tw2 - 8));
          y = Math.max(22, Math.min(momAnchor.y - 24, 150));
        }

        var bg = scene.add.rectangle(x, y, tw2, h, b.fill, 0.95).setOrigin(0, 0).setDepth(DEPTH);
        bg.setStrokeStyle(1, b.border, 1);
        objs.push(bg);

        /* 尾巴 */
        var tail = scene.add.graphics().setDepth(DEPTH);
        tail.fillStyle(b.fill, 0.95);
        if (who === 'mom') {
          var tx = Math.min(x + tw2 - 14, momAnchor.x - 8);
          tail.fillRect(tx, y + h, 10, 3);
          tail.fillRect(tx + 6, y + h + 3, 6, 3);
          tail.fillRect(tx + 9, y + h + 6, 3, 3);
        } else if (who === 'you') {
          tail.fillRect(x + tw2 - 28, y + h, 10, 3);
          tail.fillRect(x + tw2 - 34, y + h + 3, 6, 3);
          tail.fillRect(x + tw2 - 37, y + h + 6, 3, 3);
        }
        objs.push(tail);

        if (who !== 'narr') {
          var name = who === 'mom' ? '妈' : '你';
          var tag = SB.Text.add(scene, x + 6, y - 12, name, 12, b.border).setDepth(DEPTH + 1);
          objs.push(tag);
        }

        var txt = SB.Text.add(scene, x + 10, y + 6, '', 12, b.text).setDepth(DEPTH + 1);
        objs.push(txt);
        tw = SB.Text.typewriter(scene, txt, wrapped, 22, function () {});

        var mark = SB.Text.add(scene, x + tw2 - 10, y + h - 12, 'A', 12, b.border)
          .setOrigin(1, 0).setDepth(DEPTH + 1).setAlpha(0.65);
        objs.push(mark);
      }

      function next() {
        if (closed) return;
        if (tw && !tw.done) { tw.skip(); return; }
        i++;
        show();
      }

      function close(silent) {
        if (closed) return;
        closed = true;
        clear();
        scene.events.off('update', poll);
        scene.events.off('shutdown', abort);
        if (zone) { zone.destroy(); zone = null; }
        if (SB.HomeBubble.active === api) SB.HomeBubble.active = null;
        if (!silent && opts.onDone) opts.onDone();
      }

      function abort() { close(true); }

      function poll() {
        if (closed) return;
        if (SB.Input.frame === bornFrame) return;
        if (SB.Input.p1.just.a || SB.Input.p1.just.start) next();
      }

      /* 全屏点击层：气泡开着的时候，别让下面的热点被点穿 */
      zone = scene.add.zone(0, 0, W, H).setOrigin(0, 0).setDepth(DEPTH - 1).setInteractive();
      zone.on('pointerdown', next);
      scene.events.on('update', poll);
      scene.events.once('shutdown', abort);

      this.active = api;
      show();
      return api;
    }
  };

})(window.SB);
