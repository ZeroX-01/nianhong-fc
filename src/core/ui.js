/* UI 组件：面板、对话框、菜单、提示条、顶部状态栏、焦点框、转场。
 * 所有组件都能在纹理缺失时用 Graphics 兜底。 */
(function (SB) {
  'use strict';

  var SLICE = 12;   // panel.png 的切角

  /* 这一屏还开着几个菜单。
   * 「选完一项，场景里就一个菜单都不剩了」是死屏的标准形状，
   * 所以必须有个地方能问出这件事，兜底机制才有依据。 */
  function track(scene, api) {
    if (!scene.__uiMenus) {
      scene.__uiMenus = [];
      scene.events.once('shutdown', function () { scene.__uiMenus = []; });
    }
    scene.__uiMenus.push(api);
  }
  function untrack(scene, api) {
    var list = scene.__uiMenus;
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) if (list[i] === api) list.splice(i, 1);
  }

  /* 系统偏好里关掉了动效就不做呼吸/闪动，只留静态的高对比描边 */
  function calmMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  SB.UI = {

    /* ---------------- 这一屏现在有没有「可操作的东西」 ----------------
     * 菜单、对话框、过场三者全空 = 玩家点什么都没反应。
     * 死屏兜底（TitleScene.update）就是靠这个判断该不该把主菜单端回来。 */
    openMenus: function (scene) {
      var list = (scene && scene.__uiMenus) || [], n = 0;
      for (var i = 0; i < list.length; i++) if (list[i].isOpen && list[i].isOpen()) n++;
      return n;
    },
    idle: function (scene) {
      return this.openMenus(scene) === 0
        && !(SB.__dialogOpen > 0)
        && !(SB.__interludeOpen > 0);
    },

    /* ---------------- 面板 ---------------- */
    panel: function (scene, x, y, w, h, dark) {
      var key = dark ? 'panel_dark' : 'panel';
      var o;
      if (scene.textures.exists(key) && scene.add.nineslice) {
        o = scene.add.nineslice(x, y, key, null, w, h, SLICE, SLICE, SLICE, SLICE).setOrigin(0, 0);
      } else {
        var g = scene.add.graphics();
        g.fillStyle(dark ? SB.C.GREY2 : SB.C.WOOD7, 1);
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.lineStyle(2, dark ? SB.C.GREY5 : SB.C.WOOD2, 1);
        g.strokeRect(x + 1, y + 1, w - 2, h - 2);
        o = g;
      }
      return o;
    },

    /* ---------------- 按钮 ----------------
     * opts.sub：右侧的小字副标题（棉签还剩几支、按住哪个键这类补充信息）。 */
    button: function (scene, x, y, w, label, onClick, opts) {
      opts = opts || {};
      var h = 20, obj = {};
      var bg;
      if (scene.textures.exists('btn') && scene.add.nineslice) {
        bg = scene.add.nineslice(x, y, 'btn', 0, w, h, 6, 6, 4, 4).setOrigin(0, 0);
      } else {
        bg = scene.add.graphics();
        bg.fillStyle(SB.C.WOOD5, 1); bg.fillRect(x, y, w, h);
        bg.lineStyle(2, SB.C.WOOD2, 1); bg.strokeRect(x, y, w, h);
      }
      /* 有副标题时正文左对齐，把右边让给小字；没有就还是居中 */
      var hasSub = !!opts.sub;
      var txt = hasSub
        ? SB.Text.add(scene, x + 8, y + h / 2 - 5, label, 12, opts.tint || SB.C.WOOD1).setOrigin(0, 0)
        : SB.Text.add(scene, x + w / 2, y + h / 2 - 5, label, 12, opts.tint || SB.C.WOOD1).setOrigin(0.5, 0);
      var sub = hasSub
        ? SB.Text.add(scene, x + w - 8, y + h / 2 - 5, opts.sub, 12, opts.subTint || SB.C.WOOD3).setOrigin(1, 0)
        : null;
      var zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });

      var baseY = y + h / 2 - 5;
      var setFrame = function (f) { if (bg.setFrame) bg.setFrame(f); };
      var lift = function (dy) { txt.setY(baseY + dy); if (sub) sub.setY(baseY + dy); };
      zone.on('pointerover', function () { setFrame(1); lift(0); });
      zone.on('pointerout', function () { setFrame(0); lift(0); });
      zone.on('pointerdown', function () { setFrame(2); lift(1); SB.Audio.sfx('ui_move'); });
      zone.on('pointerup', function () {
        setFrame(1); lift(0);
        SB.Audio.sfx('ui_confirm');
        if (onClick) onClick();
      });

      obj.bg = bg; obj.txt = txt; obj.sub = sub; obj.zone = zone;
      /* 自动化测试和布局检查要用到按钮的实际范围 */
      obj.rect = { x: x, y: y, w: w, h: h };
      obj.setDepth = function (d) { bg.setDepth(d); txt.setDepth(d + 1); if (sub) sub.setDepth(d + 1); zone.setDepth(d + 2); return obj; };
      obj.destroy = function () { bg.destroy(); txt.destroy(); if (sub) sub.destroy(); zone.destroy(); };
      obj.setLabel = function (s) { txt.setText(s); };
      obj.setSub = function (s) { if (sub) sub.setText(s); };
      obj.setVisible = function (v) {
        bg.setVisible(v); txt.setVisible(v); if (sub) sub.setVisible(v);
        if (v) zone.setInteractive({ useHandCursor: true }); else zone.disableInteractive();
        return obj;
      };
      return obj;
    },

    /* ---------------- 右上角常驻按钮 ----------------
     * 「返回」这件事必须随时看得见、点得到：键盘玩家按 B，
     * 用鼠标或手指的人就点这里。视觉上沿用同一套木纹按钮，不另造风格。 */
    corner: function (scene, label, onClick, opts) {
      opts = opts || {};
      var w = opts.width || (SB.Text.width(label, 12) + 16);
      var x = opts.x !== undefined ? opts.x : SB.W - w - 6;
      var y = opts.y !== undefined ? opts.y : 20;
      var b = this.button(scene, x, y, w, label, onClick, { tint: opts.tint });
      b.setDepth(opts.depth !== undefined ? opts.depth : SB.D.HUD + 4);
      return b;
    },

    /* ---------------- 底部对话框 ----------------
     * lines 可以是字符串或字符串数组；speaker 可空。
     * A 键 / 点击 推进；未打完时先补完。 */
    dialog: function (scene, lines, opts) {
      opts = opts || {};
      if (typeof lines === 'string') lines = [lines];
      var W = 448, H = opts.tall ? 76 : 62;
      var X = (SB.W - W) / 2, Y = SB.H - H - 8;
      var d = SB.D.DIALOG;
      var objs = [];

      var shade = scene.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, opts.dim === false ? 0 : 0.28)
        .setOrigin(0, 0).setDepth(d - 1).setInteractive();
      objs.push(shade);

      /* 对话框压在最下面，会盖住常驻提示条。开着的时候先把提示条收起来。 */
      var hintWasOn = false;
      if (scene.hint && scene.hint.show) { scene.hint.show(false); hintWasOn = true; }
      SB.__dialogOpen = (SB.__dialogOpen || 0) + 1;

      var bg = this.panel(scene, X, Y, W, H, !!opts.dark).setDepth(d);
      objs.push(bg);

      var tx = X + 12, ty = Y + 10;
      var nameObj = null;
      if (opts.speaker) {
        nameObj = SB.Text.add(scene, tx, ty, '【' + opts.speaker + '】', 12,
          opts.dark ? SB.C.YEL4 : SB.C.RED2).setDepth(d + 1);
        objs.push(nameObj);
        ty += 16;
      }

      var textObj = SB.Text.add(scene, tx, ty, '', 12, opts.dark ? SB.C.GREY8 : SB.C.WOOD1).setDepth(d + 1);
      objs.push(textObj);

      var arrow = null;
      if (scene.textures.exists('arrow')) {
        arrow = scene.add.sprite(X + W - 16, Y + H - 12, 'arrow', 0).setDepth(d + 1).setVisible(false);
        scene.tweens.add({ targets: arrow, x: X + W - 14, duration: 420, yoyo: true, repeat: -1 });
      } else {
        arrow = SB.Text.add(scene, X + W - 20, Y + H - 18, '▼', 12, SB.C.RED3).setDepth(d + 1).setVisible(false);
      }
      objs.push(arrow);

      var idx = -1, tw = null, closed = false;
      var maxW = W - 24;

      function show(i) {
        idx = i;
        var raw = SB.line(lines[i]);
        var wrapped = SB.Text.wrap(raw, maxW, 12);
        arrow.setVisible(false);
        if (tw) tw.destroy();
        tw = SB.Text.typewriter(scene, textObj, wrapped, opts.speed || 26, function () {
          arrow.setVisible(true);
        });
      }

      function next() {
        if (closed) return;
        if (tw && !tw.done) { tw.skip(); return; }
        if (idx + 1 < lines.length) { SB.Audio.sfx('ui_move', { volume: 0.35 }); show(idx + 1); }
        else close();
      }

      function close() {
        if (closed) return;
        closed = true;
        if (tw) tw.destroy();
        objs.forEach(function (o) { if (o && o.destroy) o.destroy(); });
        scene.events.off('update', poll);
        scene.events.off('shutdown', abort);
        if (hintWasOn && scene.hint && scene.hint.show) scene.hint.show(true);
        SB.__dialogOpen = Math.max(0, (SB.__dialogOpen || 1) - 1);
        if (opts.onDone) opts.onDone();
      }

      /* 场景被直接停掉（换场、重开）时，对话框跟着一起收摊：
       * 只清状态，不触发 onDone —— 否则旧对话的回调会在新场景里乱跳转。
       * 监听器不摘掉的话，场景复用时旧的 poll 还会跑，去动已经销毁的文字对象。 */
      function abort() {
        if (closed) return;
        closed = true;
        if (tw) tw.destroy();
        scene.events.off('update', poll);
        SB.__dialogOpen = Math.max(0, (SB.__dialogOpen || 1) - 1);
      }
      scene.events.once('shutdown', abort);

      shade.on('pointerdown', next);

      var bornFrame = SB.Input.frame;
      function poll() {
        if (closed) return;
        /* 开框那一帧的按键不算，否则一下按键会既开框又翻页 */
        if (SB.Input.frame === bornFrame) return;
        if (SB.Input.p1.just.a || SB.Input.p1.just.start || SB.Input.p1.just.b) next();
      }
      scene.events.on('update', poll);

      show(0);
      return { next: next, close: close, isOpen: function () { return !closed; } };
    },

    /* ---------------- 竖排菜单 ----------------
     * items: [{label, sub, disabled, value}]
     *
     * opts.cur：开出来时光标停在第几项（默认 0）。
     *
     * 叠加子菜单怎么办：选中一项的那一刻父菜单就已经 close 掉了，
     * 所以 onPick 的第三个参数给的是「怎么把父菜单原样端回来」——
     * ctx.reopen() 会用同一份 opts、同一个光标位置重建它，并返回新的 api。
     * 子菜单里的「不了 / 算了」和 B 键都该调它，这样任何一层都退得回去，
     * 不会出现「父菜单没了、子菜单也关了、屏幕上一个能点的都不剩」。 */
    menu: function (scene, opts) {
      var items = opts.items || [];
      var W = opts.width || 260;
      var rowH = opts.rowH || 20;
      var titleH = opts.title ? 22 : 8;
      var H = titleH + items.length * rowH + 10;
      var X = opts.x !== undefined ? opts.x : Math.round((SB.W - W) / 2);
      var Y = opts.y !== undefined ? opts.y : Math.round((SB.H - H) / 2);
      var d = opts.depth || SB.D.DIALOG;
      var objs = [];
      var cur = SB.clamp(opts.cur | 0, 0, Math.max(0, items.length - 1)), closed = false;
      var self = this;

      var shade = scene.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, opts.dim === false ? 0.001 : 0.42)
        .setOrigin(0, 0).setDepth(d - 1).setInteractive();
      objs.push(shade);

      /* 菜单开着的时候，底部那行提示不藏起来，而是临时改成「菜单自己的键位」：
       * 菜单本身没有任何文字说明该按哪个键，第一次玩的人在这里最容易卡住。
       * 关掉时原样还回去（可见性不动，免得抢了对话框的位置）。 */
      var hint = (scene.hint && scene.hint.set && scene.hint.raw) ? scene.hint : null;
      var hintPrev = hint ? hint.raw() : null;
      if (hint) {
        hint.set(function () {
          var parts = [['ud', '选'], ['a', '确认']];
          if (opts.cancelable !== false) parts.push(['b', '返回']);
          return SB.Input.tip(parts);
        });
      }
      var bg = this.panel(scene, X, Y, W, H, opts.dark !== false).setDepth(d);
      objs.push(bg);

      if (opts.title) {
        objs.push(SB.Text.add(scene, X + 10, Y + 7, opts.title, 12, SB.C.YEL4).setDepth(d + 1));
        var line = scene.add.rectangle(X + 8, Y + titleH - 2, W - 16, 1, SB.C.GREY5, 0.8).setOrigin(0, 0).setDepth(d + 1);
        objs.push(line);
      }

      var rows = [];
      items.forEach(function (it, i) {
        var ry = Y + titleH + i * rowH + 2;
        var tint = it.disabled ? SB.C.GREY5 : SB.C.GREY8;
        /* 右边有小字时，正文最多占到小字左侧为止：宁可截断，也不让两段字叠在一起 */
        var subW = it.sub ? SB.Text.width(it.sub, 12) : 0;
        var room = W - 22 - 12 - (subW ? subW + 8 : 0);
        var label = SB.Text.clamp(it.label, room, 12, 1);
        var t = SB.Text.add(scene, X + 22, ry + 3, label, 12, tint).setDepth(d + 1);
        var s = null;
        if (it.sub) s = SB.Text.add(scene, X + W - 12 - subW, ry + 3, it.sub, 12,
          it.subTint || SB.C.WOOD6).setDepth(d + 1);
        var z = scene.add.zone(X + 4, ry, W - 8, rowH).setOrigin(0, 0).setDepth(d + 2).setInteractive({ useHandCursor: !it.disabled });
        z.on('pointerover', function () { if (!it.disabled) { cur = i; refresh(); } });
        z.on('pointerdown', function () { if (!it.disabled) { cur = i; refresh(); pick(); } });
        rows.push({ t: t, s: s, z: z, y: ry, item: it });
        objs.push(t, z); if (s) objs.push(s);
      });

      /* 光标用「→」：点阵字库里没有 ▶ 这个字，原来画出来是一片空白，
       * 选中项只靠一点点颜色差别区分，很难看出来现在停在哪一行。 */
      var cursor = SB.Text.add(scene, X + 8, Y + titleH + 5, '→', 12, SB.C.RED4).setDepth(d + 1);
      objs.push(cursor);

      function refresh() {
        rows.forEach(function (r, i) {
          r.t.setTint(r.item.disabled ? SB.C.GREY5 : (i === cur ? SB.C.WHITE : SB.C.GREY7));
        });
        cursor.setY(rows[cur] ? rows[cur].y + 4 : Y);
        cursor.setVisible(!!rows[cur]);
      }

      function move(dir) {
        if (!items.length) return;
        var n = items.length, i = cur, guard = 0;
        do { i = (i + dir + n) % n; guard++; } while (items[i].disabled && guard <= n);
        if (i !== cur) { cur = i; SB.Audio.sfx('ui_move', { volume: 0.4 }); refresh(); }
      }

      function pick() {
        var it = items[cur];
        if (!it || it.disabled) { SB.Audio.sfx('ui_error'); return; }
        SB.Audio.sfx('ui_confirm');
        var ctx = makeCtx(cur);
        if (opts.keepOpen) { if (opts.onPick) opts.onPick(it, cur, ctx); return; }
        close();
        if (opts.onPick) opts.onPick(it, cur, ctx);
      }

      /* 交给 onPick 的「回上一层」把手：把这个菜单原封不动重建一遍。
       * 只重建一次，重复调用返回同一个实例，免得手抖点两下叠出两层菜单。 */
      function makeCtx(atIndex) {
        var again = null;
        return {
          index: atIndex,
          reopen: function (i) {
            if (again && again.isOpen && again.isOpen()) return again;
            var o = {}, k;
            for (k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];
            o.cur = (i === undefined) ? atIndex : i;
            again = self.menu(scene, o);
            return again;
          }
        };
      }

      function close() {
        if (closed) return;
        closed = true;
        objs.forEach(function (o) { if (o && o.destroy) o.destroy(); });
        scene.events.off('update', poll);
        scene.events.off('shutdown', abort);
        if (hint) hint.set(hintPrev);
        untrack(scene, api);
        if (SB.__menu === api) SB.__menu = null;
      }

      /* 同对话框：场景一停，菜单也得算关掉，别让旧菜单的 poll 活到下一次进场 */
      function abort() {
        if (closed) return;
        closed = true;
        scene.events.off('update', poll);
        untrack(scene, api);
        if (SB.__menu === api) SB.__menu = null;
      }
      scene.events.once('shutdown', abort);

      function cancel() {
        if (opts.cancelable === false) return;
        SB.Audio.sfx('ui_cancel');
        close();
        if (opts.onCancel) opts.onCancel();
      }

      var bornFrame = SB.Input.frame;
      function poll() {
        if (closed) return;
        /* 同上：按 A 打开菜单的那一下，不能顺手把第一项选掉 */
        if (SB.Input.frame === bornFrame) return;
        var p = SB.Input.p1;
        if (p.just.up) move(-1);
        if (p.just.down) move(1);
        if (p.just.a) pick();
        if (p.just.b || p.just.select) cancel();
      }
      scene.events.on('update', poll);
      shade.on('pointerdown', cancel);

      /* 跳过禁用项（包括 opts.cur 指到禁用项的情况） */
      if (items.length && items[cur] && items[cur].disabled) move(1);
      refresh();

      var api = {
        close: close,
        refresh: refresh,
        isOpen: function () { return !closed; },
        setSub: function (i, s) { if (rows[i] && rows[i].s) rows[i].s.setText(s); },
        /* 自动化测试用：让脚本能知道光标停在哪一项 */
        /* 给自动化测试看的：光标在哪、有哪几行、哪几行是灰的 */
        debug: function () {
          return {
            cur: cur,
            labels: items.map(function (it) { return it.label; }),
            dis: items.map(function (it) { return !!it.disabled; })
          };
        }
      };
      track(scene, api);
      SB.__menu = api;
      return api;
    },

    /* ---------------- 浮动提示 ---------------- */
    toast: function (scene, text, ms) {
      var w = SB.Text.width(text, 12) + 20;
      var x = Math.round((SB.W - w) / 2), y = 34;
      var d = SB.D.OVERLAY;
      var bg = scene.add.rectangle(x, y, w, 20, SB.C.INK, 0.82).setOrigin(0, 0).setDepth(d);
      var bd = scene.add.rectangle(x, y, w, 20, 0, 0).setOrigin(0, 0).setStrokeStyle(1, SB.C.YEL3, 0.9).setDepth(d);
      var t = SB.Text.add(scene, x + 10, y + 4, text, 12, SB.C.YEL4).setDepth(d + 1);
      var kill = function () { bg.destroy(); bd.destroy(); t.destroy(); };
      scene.tweens.add({
        targets: [bg, bd, t], alpha: 0, delay: ms || 1500, duration: 350, onComplete: kill
      });
      return { destroy: kill };
    },

    /* ---------------- 底部单行提示（常驻） ----------------
     * text 可以是字符串，也可以是「返回字符串的函数」。传函数时，
     * 输入方式一变（拿起手柄、去摸屏幕、双人模式开关）会自动重算，
     * 提示上写的键名永远和玩家手上真按的那个键一致。 */
    hint: function (scene, text) {
      var d = SB.D.HUD;
      var bg = scene.add.rectangle(0, SB.H - 16, SB.W, 16, SB.C.INK, 0.66).setOrigin(0, 0).setDepth(d);
      var t = SB.Text.add(scene, 8, SB.H - 13, '', 12, SB.C.GREY7).setDepth(d + 1);
      var src = text || '';
      var full = '';

      var api = {
        set: function (s) {
          src = s || '';
          api.refresh();
        },
        refresh: function () {
          var s = (typeof src === 'function') ? src() : src;
          full = s || '';
          t.setText(SB.Text.wrap(full, SB.W - 16, 12).split('\n')[0]);
        },
        setTint: function (c) { t.setTint(c); },
        /* 自动化测试用：读回这一刻真正显示出来的那行字，以及本该显示的全文。
         * 两者不一致就说明提示被这一行的宽度截掉了——必须当成 bug 修文案。 */
        text: function () { return t.text; },
        full: function () { return full; },
        /* 原始来源（字符串或函数）。菜单要临时借走这一行，用完得原样还回去。 */
        raw: function () { return src; },
        visible: function () { return t.visible; },
        show: function (v) { bg.setVisible(v); t.setVisible(v); },
        destroy: function () { off(); bg.destroy(); t.destroy(); }
      };

      var off = SB.Input.onLabels(function () { api.refresh(); });
      scene.events.once('shutdown', off);
      api.refresh();
      return api;
    },

    /* ---------------- 顶部状态栏 ---------------- */
    hud: function (scene) {
      var d = SB.D.HUD;
      var bg = scene.add.rectangle(0, 0, SB.W, 16, SB.C.INK, 0.62).setOrigin(0, 0).setDepth(d);
      var left = SB.Text.add(scene, 6, 3, '', 12, SB.C.GREY8).setDepth(d + 1);
      var right = SB.Text.add(scene, SB.W - 6, 3, '', 12, SB.C.YEL4).setOrigin(1, 0).setDepth(d + 1);

      var api = {
        refresh: function () {
          var s = SB.Save.d;
          var slot = SB.SLOTS[s.slot] || SB.SLOTS[0];
          var dt = SB.Time.dateStr();
          left.setText(dt + '  ' + slot.name + ' ' + slot.time + '   精力 ' + '●'.repeat(Math.max(0, s.ap)) + '○'.repeat(Math.max(0, 4 - s.ap)));
          var own = SB.Save.ownedCarts().length;
          right.setText(SB.money(s.money) + '   卡带 ' + own + '/' + SB.CARTS.length);
        },
        show: function (v) { bg.setVisible(v); left.setVisible(v); right.setVisible(v); },
        destroy: function () { bg.destroy(); left.destroy(); right.destroy(); }
      };
      api.refresh();
      return api;
    },

    /* ---------------- 可交互物件的高亮框 ----------------
     * 原来只有一层淡黄细描边，压在木纹墙纸上几乎看不见，
     * 「现在选的是哪一个」全靠猜。现在同一个 at() 里叠四层：
     *
     *   1. 四周压暗一档（opts.dim）：只暗框外，被选中的东西相对变亮，
     *      视线自然被圈进去。用四条边带拼出「中间挖空」，不动物件本身。
     *   2. 深色垫底描边 + 框内极淡提亮：浅墙、深门、电视黑屏上都有对比，
     *      不依赖单一颜色（色彩不是唯一指示）。
     *   3. 亮白卡角（2px、L 形、只占四角）+ 呼吸：动的只有这一层，
     *      整屏不闪；系统关了动效就静态显示。
     *   4. opts.label 时把物件名贴在框边上，深底衬 + 1px 描边，
     *      名字和高亮框永远同一次 at() 里更新，所以鼠标 hover 和
     *      方向键/TAB 选中看到的是同一套东西，不会错位。
     *
     * 只有 at() 一个入口，这就是「hover 与键盘选中视觉一致」的机制保证。 */
    focus: function (scene, opts) {
      opts = opts || {};
      var d = SB.D.FOCUS;
      var dimA = opts.dim || 0;
      var dim = dimA ? scene.add.graphics().setDepth(d).setVisible(false) : null;
      var base = scene.add.graphics().setDepth(d + 1).setVisible(false);
      var ring = scene.add.graphics().setDepth(d + 2).setVisible(false);
      var plate = null, plateTxt = null;
      if (opts.label) {
        plate = scene.add.rectangle(0, 0, 4, 15, SB.C.INK, 0.88).setOrigin(0, 0)
          .setStrokeStyle(1, SB.C.YEL3, 1).setDepth(d + 3).setVisible(false);
        plateTxt = SB.Text.add(scene, 0, 0, '', 12, SB.C.YEL4).setDepth(d + 4).setVisible(false);
      }

      var api = {
        at: function (x, y, w, h, name) {
          /* --- 1. 框外压暗 --- */
          if (dim) {
            dim.clear();
            dim.fillStyle(SB.C.INK, dimA);
            dim.fillRect(0, 0, SB.W, y);
            dim.fillRect(0, y + h, SB.W, SB.H - (y + h));
            dim.fillRect(0, y, x, h);
            dim.fillRect(x + w, y, SB.W - (x + w), h);
            dim.setVisible(true);
          }
          /* --- 2. 深色垫底 + 框内提亮 --- */
          base.clear();
          base.fillStyle(SB.C.YEL4, 0.09);
          base.fillRect(x, y, w, h);
          base.lineStyle(1, SB.C.INK, 0.9);
          base.strokeRect(x - 1, y - 1, w + 2, h + 2);
          base.lineStyle(1, SB.C.YEL2, 0.75);
          base.strokeRect(x, y, w, h);
          base.setVisible(true);
          /* --- 3. 高对比卡角 --- */
          ring.clear();
          var L = Math.max(4, Math.min(8, Math.round(Math.min(w, h) / 4)));
          ring.lineStyle(2, SB.C.WHITE, 1);
          ring.beginPath();
          ring.moveTo(x, y + L); ring.lineTo(x, y); ring.lineTo(x + L, y);
          ring.moveTo(x + w - L, y); ring.lineTo(x + w, y); ring.lineTo(x + w, y + L);
          ring.moveTo(x + w, y + h - L); ring.lineTo(x + w, y + h); ring.lineTo(x + w - L, y + h);
          ring.moveTo(x + L, y + h); ring.lineTo(x, y + h); ring.lineTo(x, y + h - L);
          ring.strokePath();
          ring.setVisible(true);
          /* --- 4. 名字底衬 --- */
          if (plate) {
            var s = name || '';
            if (!s) { plate.setVisible(false); plateTxt.setVisible(false); }
            else {
              var pw = SB.Text.width(s, 12) + 10, ph = 15;
              var px = SB.clamp(x, 2, SB.W - pw - 2);
              /* 优先贴在框上方；上面没地方（顶到状态栏）就翻到框下方 */
              var py = y - ph - 2;
              if (py < 18) py = y + h + 2;
              py = SB.clamp(py, 18, SB.H - 18 - ph);
              plate.setPosition(px, py); plate.setSize(pw, ph); plate.setVisible(true);
              plateTxt.setPosition(px + 5, py + 2).setText(s).setVisible(true);
            }
          }
        },
        hide: function () {
          if (dim) dim.setVisible(false);
          base.setVisible(false); ring.setVisible(false);
          if (plate) { plate.setVisible(false); plateTxt.setVisible(false); }
        },
        destroy: function () {
          if (dim) dim.destroy();
          base.destroy(); ring.destroy();
          if (plate) { plate.destroy(); plateTxt.destroy(); }
        }
      };
      if (!calmMotion()) {
        scene.tweens.add({ targets: ring, alpha: 0.5, duration: 620, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
      }
      return api;
    },

    /* ---------------- 转场 ---------------- */
    fadeOut: function (scene, ms, cb) {
      var r = scene.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 0).setOrigin(0, 0).setDepth(SB.D.FADE);
      scene.tweens.add({
        targets: r, alpha: 1, duration: ms || 300,
        onComplete: function () { if (cb) cb(); }
      });
      return r;
    },

    fadeIn: function (scene, ms) {
      var r = scene.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 1).setOrigin(0, 0).setDepth(SB.D.FADE);
      scene.tweens.add({
        targets: r, alpha: 0, duration: ms || 320,
        onComplete: function () { r.destroy(); }
      });
      return r;
    },

    /* 换场景：淡出 → start */
    go: function (scene, key, data) {
      if (scene.__going) return;
      scene.__going = true;
      /* Phaser 会复用场景实例，这把锁必须在场景退出时解开，
       * 否则第二次回到同一屏就再也走不出去了。 */
      scene.events.once('shutdown', function () { scene.__going = false; });
      this.fadeOut(scene, 260, function () {
        scene.scene.start(key, data);
      });
    },

    /* 一段黑底白字的过场（用于时间流逝、结局等） */
    interlude: function (scene, lines, onDone) {
      var d = SB.D.OVERLAY;
      var bg = scene.add.rectangle(0, 0, SB.W, SB.H, SB.C.INK, 1).setOrigin(0, 0).setDepth(d).setInteractive();
      var txt = SB.Text.add(scene, 40, 100, '', 12, SB.C.GREY8).setDepth(d + 1);
      var i = -1, tw = null, closed = false;
      /* 过场也算「屏幕正忙」：死屏兜底不能在黑幕里插一个菜单进来 */
      SB.__interludeOpen = (SB.__interludeOpen || 0) + 1;
      function release() { SB.__interludeOpen = Math.max(0, (SB.__interludeOpen || 1) - 1); }

      function step() {
        if (closed) return;
        if (tw && !tw.done) { tw.skip(); return; }
        i++;
        if (i >= lines.length) { fin(); return; }
        var s = SB.Text.wrap(SB.line(lines[i]), SB.W - 80, 12);
        var h = SB.Text.height(s, 12);
        txt.setY(Math.round((SB.H - h) / 2));
        tw = SB.Text.typewriter(scene, txt, s, 44);
      }
      function fin() {
        closed = true;
        release();
        scene.events.off('update', poll);
        scene.tweens.add({
          targets: [bg, txt], alpha: 0, duration: 420,
          onComplete: function () { bg.destroy(); txt.destroy(); if (onDone) onDone(); }
        });
      }
      var bornFrame = SB.Input.frame;
      function poll() {
        if (SB.Input.frame === bornFrame) return;
        if (SB.Input.p1.just.a || SB.Input.p1.just.start) step();
      }
      scene.events.on('update', poll);
      /* 过场文字期间被强行换场：把监听摘掉，别在下一次进场里接着跑 */
      scene.events.once('shutdown', function () {
        if (!closed) release();
        closed = true;
        scene.events.off('update', poll);
      });
      bg.on('pointerdown', step);
      step();
      return { skip: fin };
    }
  };

})(window.SB);
