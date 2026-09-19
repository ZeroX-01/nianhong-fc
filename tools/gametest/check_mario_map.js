/* 关卡字符图的静态校验：每段必须 17 行，行长不能超过段宽；
 * 同时把拼好的整张图导出成文本，肉眼确认地形（管道、坑、阶梯）画对了。 */
'use strict';
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(path.join(__dirname, '../../src/games/MarioGame.js'), 'utf8');

/* 用一个假的 SB 环境把文件跑起来，取出内部的关卡表 */
global.window = {};
var SB = {
  C: new Proxy({}, { get: function () { return 0x808080; } }),
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  rnd: function () { return 0; }, rndInt: function () { return 0; },
  pick: function (a) { return a[0]; }, chance: function () { return false; },
  GameBase: function () {},
  extendGame: function (c) { c.prototype = Object.create(SB.GameBase.prototype); return c; },
  Games: {}
};
SB.GameBase.prototype = { destroy: function () {} };
global.window.SB = SB;

/* 把 LEVELS / BONUS 暴露出来 */
var patched = src.replace('SB.Games.mario = MarioGame;',
  'SB.Games.mario = MarioGame; SB.__LEVELS = LEVELS; SB.__BONUS = BONUS; SB.__ROWS = ROWS;');
eval(patched);

var ROWS = SB.__ROWS;
var bad = 0;

function checkLevel(name, segs) {
  var cols = 0;
  segs.forEach(function (s, i) {
    if (s.rows.length !== ROWS) {
      console.log('  ✗ ' + name + ' 第' + i + '段行数=' + s.rows.length + '（应为 ' + ROWS + '）');
      bad++;
    }
    s.rows.forEach(function (r, ri) {
      if (r.length > s.w) {
        console.log('  ✗ ' + name + ' 第' + i + '段 r' + ri + ' 长度=' + r.length + ' > ' + s.w + ' 「' + r + '」');
        bad++;
      }
    });
    cols += s.w;
  });
  console.log(name + '：' + segs.length + ' 段 / ' + cols + ' 列 / ' + (cols * 16) + 'px');
  return cols;
}

var dump = '';
function render(name, segs) {
  var cols = checkLevel(name, segs);
  var rows = [];
  for (var r = 0; r < ROWS; r++) rows[r] = '';
  segs.forEach(function (s) {
    for (var r = 0; r < ROWS; r++) {
      var line = s.rows[r] || '';
      for (var c = 0; c < s.w; c++) rows[r] += c < line.length ? line.charAt(c) : ' ';
    }
  });
  dump += '==== ' + name + ' (' + cols + ' cols) ====\n';
  rows.forEach(function (r, i) { dump += (i < 10 ? ' ' : '') + i + '|' + r + '\n'; });
  dump += '\n';
  return rows;
}

var l1 = render('1-1', SB.__LEVELS[0].segs);
var l2 = render('1-2', SB.__LEVELS[1].segs);
render('bonus', SB.__BONUS);

/* 额外体检：所有敌人/金币标记脚下不能是坑（否则一生成就掉下去） */
function checkMarks(name, rows) {
  var cols = rows[0].length;
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < cols; c++) {
      var ch = rows[r][c];
      if (ch === 'm' || ch === 'k' || ch === 'j') {
        var floor = false;
        for (var rr = r + 1; rr < ROWS; rr++) if ('G#XBb?MSFH[]{}LR'.indexOf(rows[rr][c]) >= 0) { floor = true; break; }
        if (!floor) { console.log('  ✗ ' + name + ' (' + c + ',' + r + ') 敌人脚下是坑'); bad++; }
      }
    }
  }
}
checkMarks('1-1', l1);
checkMarks('1-2', l2);

fs.writeFileSync(path.join(__dirname, 'map_dump.txt'), dump);
console.log(bad === 0 ? '\n全部检查通过，地图已导出 map_dump.txt' : '\n有 ' + bad + ' 处问题');
process.exit(bad === 0 ? 0 : 1);
