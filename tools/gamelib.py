# -*- coding: utf-8 -*-
"""gamelib —— D 组（4 个内嵌小游戏）美术生产公共库。

复用 tools/pixlib.py 的 Canvas / 调色板 / 二值化 / 断言，额外提供：
  * from_rows：ASCII 点阵 -> Canvas（带行宽断言，防手滑）
  * assert_maxcolors：NES 硬限制，单个精灵 <= 4 色（含描边）
  * assert_bottom_aligned：角色脚底必须紧贴单帧底边
  * assert_wrap_x / assert_wrap_y：接缝定量检查（可平铺图块 / 横向滚动背景）
  * tile_grid：把 tiles sheet 铺成阵列，用于自查图
所有绘制均为整像素操作，输出前统一 alpha 二值化（pixlib.save）。
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image

from pixlib import (PAL, Canvas, assert_palette, binarize, sheet,  # noqa: F401
                    save as _pix_save)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_RGB2NAME = {v: k for k, v in PAL.items()}


# ---------------------------------------------------------------- ASCII 点阵
class WrapCanvas(Canvas):
    """横向环绕画布：所有落在 x<0 / x>=w 的像素自动绕回，
    因此凡是用它绘制的图（滚动背景、可平铺图块）天生左右无缝。"""

    def set(self, x, y, col):
        if col is None:
            return
        x, y = int(x) % self.w, int(y)
        if 0 <= y < self.h:
            self.d[(x, y)] = PAL[col] if isinstance(col, str) else col

    def get(self, x, y):
        return self.d.get((int(x) % self.w, int(y)))


def from_rows(rows, cmap, w, h) -> Canvas:
    """ASCII 行 -> Canvas。'.' / ' ' 视为透明。"""
    assert len(rows) == h, f'行数 {len(rows)} != {h}'
    cv = Canvas(w, h)
    for y, r in enumerate(rows):
        assert len(r) == w, f'第 {y} 行宽度 {len(r)} != {w}: {r!r}'
        for x, ch in enumerate(r):
            if ch in '. ':
                continue
            c = cmap.get(ch)
            assert c is not None, f'未定义字符 {ch!r} @({x},{y})'
            cv.set(x, y, c)
    return cv


def recolor(cv: Canvas, mapping) -> Canvas:
    """按颜色名替换（用于「白色剪影」「变色版本」等）。"""
    out = Canvas(cv.w, cv.h)
    m = {PAL[k]: PAL[v] for k, v in mapping.items()}
    for p, v in cv.d.items():
        out.d[p] = m.get(v, v)
    return out


# ---------------------------------------------------------------- 断言
def colors_of(cv: Canvas):
    return {_RGB2NAME.get(v, v) for v in cv.d.values()}


def assert_maxcolors(frames, name, maxn=4):
    for i, f in enumerate(frames):
        cs = colors_of(f)
        assert len(cs) <= maxn, f'{name} 帧{i + 1} 用了 {len(cs)} 色 > {maxn}: {sorted(cs)}'


def assert_bottom_aligned(cv: Canvas, name, tag=''):
    """脚底对齐：单帧最后一行必须有不透明像素。"""
    ok = any(y == cv.h - 1 for (_, y) in cv.d)
    assert ok, f'{name} {tag}: 底边(y={cv.h - 1})无像素，角色会浮空'


def _cols(img):
    px = img.convert('RGBA').load()
    w, h = img.size
    out = []
    for x in range(w):
        out.append([px[x, y] for y in range(h)])
    return out


def _rows(img):
    px = img.convert('RGBA').load()
    w, h = img.size
    return [[px[x, y] for x in range(w)] for y in range(h)]


def _diff(a, b):
    s = 0
    for pa, pb in zip(a, b):
        if pa[3] == 0 and pb[3] == 0:
            continue
        if (pa[3] == 0) != (pb[3] == 0):
            s += 255 * 3
            continue
        s += abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]) + abs(pa[2] - pb[2])
    return s / max(1, len(a))


def wrap_score_x(img):
    """返回 (环绕接缝差, 内部平均相邻列差)。接缝差不显著高于内部差即视为无缝。"""
    cs = _cols(img)
    inner = [_diff(cs[i], cs[i + 1]) for i in range(len(cs) - 1)]
    avg = sum(inner) / max(1, len(inner))
    return _diff(cs[-1], cs[0]), avg


def wrap_score_y(img):
    rs = _rows(img)
    inner = [_diff(rs[i], rs[i + 1]) for i in range(len(rs) - 1)]
    avg = sum(inner) / max(1, len(inner))
    return _diff(rs[-1], rs[0]), avg


def _inner_x(img):
    cs = _cols(img)
    return [_diff(cs[i], cs[i + 1]) for i in range(len(cs) - 1)]


def _inner_y(img):
    rs = _rows(img)
    return [_diff(rs[i], rs[i + 1]) for i in range(len(rs) - 1)]


def assert_wrap_x(img, name, k=1.6, floor=6.0, vs='avg'):
    """vs='avg'：背景类，接缝处必须和内部平均一样平滑。
       vs='max'：带纹样的图块，接缝差只要不超过内部最剧烈的一条边界即可
                （即拼接处不引入任何新的突变）。"""
    inner = _inner_x(img)
    avg = sum(inner) / max(1, len(inner))
    seam = _diff(_cols(img)[-1], _cols(img)[0])
    ref = max(inner) if vs == 'max' else avg * k
    assert seam <= max(ref, floor), \
        f'{name}: 横向接缝差 {seam:.1f} > 参照 {ref:.1f}（内部均差 {avg:.1f}）不能无缝拼接'
    return seam, avg


def assert_wrap_y(img, name, k=1.6, floor=6.0, vs='avg'):
    inner = _inner_y(img)
    avg = sum(inner) / max(1, len(inner))
    seam = _diff(_rows(img)[-1], _rows(img)[0])
    ref = max(inner) if vs == 'max' else avg * k
    assert seam <= max(ref, floor), \
        f'{name}: 纵向接缝差 {seam:.1f} > 参照 {ref:.1f}（内部均差 {avg:.1f}）不能无缝拼接'
    return seam, avg


# ---------------------------------------------------------------- 输出
def save_frames(frames, rel_path, fw, fh, maxcolors=4, wrap_x=False, wrap_y=None,
                vs='max'):
    """frames: list[Canvas] -> 横向 sheet 落盘（总宽 = fw*帧数）。"""
    if maxcolors:
        assert_maxcolors(frames, os.path.basename(rel_path), maxcolors)
    if wrap_x:
        for i, f in enumerate(frames):
            im = binarize(f.to_image())
            assert_wrap_x(im, f'{os.path.basename(rel_path)} 帧{i + 1}', vs=vs)
    for i in (wrap_y or []):
        im = binarize(frames[i].to_image())
        assert_wrap_y(im, f'{os.path.basename(rel_path)} 帧{i + 1}', vs=vs)
    img = sheet(frames, fw, fh)
    _pix_save(img, os.path.join(ROOT, rel_path), fw, fh, len(frames))
    return img


def save_single(cv, rel_path, w=None, h=None, maxcolors=None):
    img = cv.to_image() if isinstance(cv, Canvas) else cv
    if maxcolors and isinstance(cv, Canvas):
        assert_maxcolors([cv], os.path.basename(rel_path), maxcolors)
    _pix_save(img, os.path.join(ROOT, rel_path), w, h, 1)
    return img


# ---------------------------------------------------------------- 自查工具
def load_sheet(rel_path, fw, fh):
    img = Image.open(os.path.join(ROOT, rel_path)).convert('RGBA')
    n = img.width // fw
    assert img.width == fw * n and img.height == fh, f'{rel_path} 尺寸异常 {img.size}'
    return [img.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(n)]


def tile_grid(tiles, cols, rows, size=16, layout=None):
    """把 tiles 铺成 cols×rows 阵列。layout: 二维索引表，None 则循环铺。"""
    out = Image.new('RGBA', (cols * size, rows * size), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            idx = layout[r][c] if layout else (r * cols + c) % len(tiles)
            if idx is None:
                continue
            out.alpha_composite(tiles[idx], (c * size, r * size))
    return out


def scale(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


# ---------------------------------------------------------------- 数学
def wave(x, period, amp, phase=0.0):
    """周期严格为 period 的整数波（保证背景左右无缝）。"""
    return int(round(amp * math.sin(2 * math.pi * (x / period) + phase)))
