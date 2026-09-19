#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pixlib —— 《那年的红白机》像素美术公共库（B 组：角色 / 卡带 / 修卡近景）

设计原则（见 docs/PALETTE.md）：
  * 严禁抗锯齿、严禁半透明羽化：所有绘制都是逐像素整数操作，
    输出前统一做 alpha 二值化（>=128 -> 255，其余 -> 0）。
  * 44 色调色板之外的颜色一律禁止（透明像素除外），由 assert_palette 断言。
  * "半透明"效果只能用棋盘 dither 实现。
"""
from __future__ import annotations

import os
import random

from PIL import Image

# ---------------------------------------------------------------- 调色板常量
PAL: dict[str, tuple[int, int, int]] = {}


def _load(block: str) -> None:
    for line in block.strip().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, hexv = line.split()
        PAL[name] = (int(hexv[1:3], 16), int(hexv[3:5], 16), int(hexv[5:7], 16))


_load("""
INK      #000000
GREY1    #14141c
GREY2    #24242f
GREY3    #383845
GREY4    #4f4f60
GREY5    #6d6d80
GREY6    #92929f
GREY7    #b8b8c2
GREY8    #dcdce2
WHITE    #ffffff
WOOD1    #2a1a10
WOOD2    #46291a
WOOD3    #63402a
WOOD4    #85583a
WOOD5    #a8764c
WOOD6    #c99a6a
WOOD7    #e6c49a
RED1     #4a0c12
RED2     #7a161c
RED3     #ad2229
RED4     #d93a34
RED5     #f2705a
GRN1     #102c1c
GRN2     #1d5230
GRN3     #2f7d42
GRN4     #55ab52
GRN5     #8fd15c
BLU1     #0c1832
BLU2     #17346b
BLU3     #2a61ad
BLU4     #4a9bd1
BLU5     #93d4ea
YEL1     #5c3f0e
YEL2     #a87a18
YEL3     #e0b422
YEL4     #f5db6e
PUR1     #32163f
PUR2     #6b2469
PUR3     #ad4287
PUR4     #e07db4
SKN1     #8f5a3c
SKN2     #c98a5f
SKN3     #e8be93
SKN4     #f7dcbe
""")

PAL_SET = set(PAL.values())
GREYS = ('INK', 'GREY1', 'GREY2', 'GREY3', 'GREY4', 'GREY5', 'GREY6', 'GREY7', 'GREY8', 'WHITE')

# 4×4 Bayer 有序抖动阈值矩阵（0..15）：所有非棋盘档位的密度都由它决定
BAYER4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)

# 描边取色表：每个颜色 -> 同色系最暗色（PALETTE.md §3「不要一律用纯黑」）
OUTLINE_MAP = {
    'WHITE': 'GREY4', 'GREY8': 'GREY4', 'GREY7': 'GREY3', 'GREY6': 'GREY3',
    'GREY5': 'GREY2', 'GREY4': 'GREY1', 'GREY3': 'INK', 'GREY2': 'INK',
    'GREY1': 'INK', 'INK': 'INK',
    'WOOD7': 'WOOD3', 'WOOD6': 'WOOD2', 'WOOD5': 'WOOD2', 'WOOD4': 'WOOD1',
    'WOOD3': 'WOOD1', 'WOOD2': 'WOOD1', 'WOOD1': 'WOOD1',
    'RED5': 'RED2', 'RED4': 'RED1', 'RED3': 'RED1', 'RED2': 'RED1', 'RED1': 'RED1',
    'GRN5': 'GRN2', 'GRN4': 'GRN1', 'GRN3': 'GRN1', 'GRN2': 'GRN1', 'GRN1': 'GRN1',
    'BLU5': 'BLU2', 'BLU4': 'BLU1', 'BLU3': 'BLU1', 'BLU2': 'BLU1', 'BLU1': 'BLU1',
    'YEL4': 'YEL1', 'YEL3': 'YEL1', 'YEL2': 'YEL1', 'YEL1': 'YEL1',
    'PUR4': 'PUR1', 'PUR3': 'PUR1', 'PUR2': 'PUR1', 'PUR1': 'PUR1',
    'SKN4': 'SKN1', 'SKN3': 'SKN1', 'SKN2': 'SKN1', 'SKN1': 'SKN1',
}
_RGB2NAME = {v: k for k, v in PAL.items()}


def C(name: str) -> tuple[int, int, int]:
    """按名取色，写错名字立刻报错（防止手滑造出板外颜色）。"""
    return PAL[name]


# ---------------------------------------------------------------- 画布
class Canvas:
    """稀疏像素画布：未写入的像素 = 完全透明。"""

    __slots__ = ('w', 'h', 'd')

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.d: dict[tuple[int, int], tuple[int, int, int]] = {}

    # -- 基本操作 --
    def set(self, x: int, y: int, col) -> None:
        if col is None:
            return
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.d[(x, y)] = PAL[col] if isinstance(col, str) else col

    def get(self, x: int, y: int):
        return self.d.get((int(x), int(y)))

    def clear(self, x: int, y: int) -> None:
        self.d.pop((int(x), int(y)), None)

    def rect(self, x: int, y: int, w: int, h: int, col) -> None:
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.set(xx, yy, col)

    def frame(self, x: int, y: int, w: int, h: int, col) -> None:
        self.hline(x, x + w - 1, y, col)
        self.hline(x, x + w - 1, y + h - 1, col)
        self.vline(x, y, y + h - 1, col)
        self.vline(x + w - 1, y, y + h - 1, col)

    def clear_rect(self, x: int, y: int, w: int, h: int) -> None:
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.clear(xx, yy)

    def hline(self, x0: int, x1: int, y: int, col) -> None:
        if x1 < x0:
            x0, x1 = x1, x0
        for x in range(int(x0), int(x1) + 1):
            self.set(x, y, col)

    def vline(self, x: int, y0: int, y1: int, col) -> None:
        if y1 < y0:
            y0, y1 = y1, y0
        for y in range(int(y0), int(y1) + 1):
            self.set(x, y, col)

    def line(self, x0: int, y0: int, x1: int, y1: int, col) -> None:
        """整数 Bresenham，无任何插值。"""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.set(x0, y0, col)
            if x0 == x1 and y0 == y1:
                break
            e2 = err * 2
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    # -- dither（唯一允许的"过渡/半透"手段）--
    def dither(self, x: int, y: int, w: int, h: int, c1, c2=None,
               mode: str = 'checker', phase: int = 0, only_on=None) -> None:
        """有序抖动。mode:
        checker 1/2 棋盘 | quarter 4/16 | three 12/16 | sparse 2/16 | faint 1/16
        | vstripe | hstripe
        非棋盘档位一律走 4×4 Bayer 阈值矩阵（避免出现规则斜条纹伪影）。
        """
        lvl = {'quarter': 4, 'three': 12, 'sparse': 2, 'faint': 1}.get(mode)
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if only_on is not None and self.get(xx, yy) not in only_on:
                    continue
                if mode == 'checker':
                    hit = (xx + yy + phase) % 2 == 0
                elif lvl is not None:
                    hit = BAYER4[(yy + phase) % 4][(xx + phase * 2) % 4] < lvl
                elif mode == 'vstripe':
                    hit = (xx + phase) % 2 == 0
                elif mode == 'hstripe':
                    hit = (yy + phase) % 2 == 0
                else:
                    raise ValueError(mode)
                self.set(xx, yy, c1 if hit else c2)

    def noise(self, x: int, y: int, w: int, h: int, col, prob: float,
              rng: random.Random, only_on=None) -> None:
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if only_on is not None and self.get(xx, yy) not in only_on:
                    continue
                if rng.random() < prob:
                    self.set(xx, yy, col)

    # -- 形状 --
    def rows(self, x_center: float, y0: int, widths, col) -> None:
        """按每行宽度表画对称圆角形体（自己算像素，不用 PIL 的反锯齿椭圆）。"""
        for i, wd in enumerate(widths):
            if wd <= 0:
                continue
            x0 = int(x_center - wd / 2.0 + 0.5)  # half-up，避免 banker's rounding 抖动
            self.hline(x0, x0 + wd - 1, y0 + i, col)

    def disc(self, cx: float, cy: float, r: float, col) -> None:
        """硬边圆（像素判定，无羽化）。"""
        r2 = (r + 0.35) ** 2
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                if (xx - cx) ** 2 + (yy - cy) ** 2 <= r2:
                    self.set(xx, yy, col)

    def ring(self, cx: float, cy: float, r: float, col) -> None:
        r2o, r2i = (r + 0.35) ** 2, (r - 0.75) ** 2
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                dd = (xx - cx) ** 2 + (yy - cy) ** 2
                if r2i <= dd <= r2o:
                    self.set(xx, yy, col)

    # -- 描边 --
    def outline(self, col=None, diag: bool = True) -> None:
        """在剪影外侧补 1px 描边。col=None 时按 OUTLINE_MAP 自动取同色系最暗色。"""
        nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            nb += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        add: dict[tuple[int, int], tuple[int, int, int]] = {}
        for (x, y), _ in list(self.d.items()):
            for dx, dy in nb:
                p = (x + dx, y + dy)
                if p in self.d or p in add:
                    continue
                if not (0 <= p[0] < self.w and 0 <= p[1] < self.h):
                    continue
                if col is not None:
                    add[p] = PAL[col] if isinstance(col, str) else col
                else:
                    votes: dict[str, int] = {}
                    for ddx, ddy in nb:
                        src = self.d.get((p[0] + ddx, p[1] + ddy))
                        if src is None:
                            continue
                        nm = _RGB2NAME.get(src)
                        if nm is None:
                            continue
                        o = OUTLINE_MAP[nm]
                        votes[o] = votes.get(o, 0) + 1
                    if not votes:
                        continue
                    best = max(votes.items(), key=lambda kv: kv[1])[0]
                    add[p] = PAL[best]
        self.d.update(add)

    def shade_edges(self, dark, side: str = 'br') -> None:
        """给剪影内侧最外一圈按光源方向压暗（光源固定左上）。"""
        dirs = {'br': [(1, 0), (0, 1)], 'r': [(1, 0)], 'b': [(0, 1)]}[side]
        hit = []
        for (x, y) in self.d:
            for dx, dy in dirs:
                if (x + dx, y + dy) not in self.d:
                    hit.append((x, y))
                    break
        for p in hit:
            self.d[p] = PAL[dark] if isinstance(dark, str) else dark

    # -- 组合 --
    def blit(self, other: 'Canvas', dx: int = 0, dy: int = 0, skip=None) -> None:
        for (x, y), v in other.d.items():
            if skip is not None and v == skip:
                continue
            self.set(x + dx, y + dy, v)

    def flip_x(self) -> 'Canvas':
        out = Canvas(self.w, self.h)
        for (x, y), v in self.d.items():
            out.d[(self.w - 1 - x, y)] = v
        return out

    def shifted(self, dx: int, dy: int) -> 'Canvas':
        out = Canvas(self.w, self.h)
        out.blit(self, dx, dy)
        return out

    def to_image(self) -> Image.Image:
        img = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        px = img.load()
        for (x, y), v in self.d.items():
            px[x, y] = (v[0], v[1], v[2], 255)
        return img


# ---------------------------------------------------------------- 输出流水线
def binarize(img: Image.Image) -> Image.Image:
    """alpha 二值化：>=128 -> 255，其余 -> 0（并清空全透明像素的 RGB）。"""
    img = img.convert('RGBA')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return img


def assert_palette(img: Image.Image, name: str, allow=None) -> None:
    """断言：不存在调色板外颜色（透明像素除外），且不存在中间 alpha。"""
    allowed = set(PAL_SET)
    if allow:
        allowed |= {PAL[a] if isinstance(a, str) else a for a in allow}
    bad: dict[tuple[int, int, int], int] = {}
    px = img.convert('RGBA').load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            assert a in (0, 255), f'{name}: 半透明像素 alpha={a} @({x},{y})'
            if a == 255 and (r, g, b) not in allowed:
                bad[(r, g, b)] = bad.get((r, g, b), 0) + 1
    assert not bad, f'{name}: 调色板外颜色 {[("#%02x%02x%02x" % k, v) for k, v in bad.items()]}'


def assert_greyscale(img: Image.Image, name: str) -> None:
    """cart_big_shell 红线：必须是纯灰阶（代码会 setTint 染色）。"""
    px = img.convert('RGBA').load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a:
                assert (r, g, b) in {PAL[g_] for g_ in GREYS}, \
                    f'{name}: 非灰阶像素 #{r:02x}{g:02x}{b:02x} @({x},{y})'


def sheet(frames: list[Canvas], fw: int, fh: int) -> Image.Image:
    """横向 sprite sheet：总宽 = 单帧宽 × 帧数，一个像素都不差。"""
    for i, f in enumerate(frames):
        assert (f.w, f.h) == (fw, fh), f'帧 {i} 尺寸 {f.w}x{f.h} != {fw}x{fh}'
    img = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        img.paste(f.to_image(), (i * fw, 0))
    return img


_WRITTEN: list[tuple[str, int, int, int]] = []


def save(img: Image.Image, path: str, fw: int = None, fh: int = None,
         nframes: int = 1, grey: bool = False) -> None:
    img = binarize(img)
    name = os.path.basename(path)
    if fw is not None:
        assert img.size == (fw * nframes, fh), \
            f'{name}: 尺寸 {img.size} != {(fw * nframes, fh)}'
    assert_palette(img, name)
    if grey:
        assert_greyscale(img, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    _WRITTEN.append((name, img.width, img.height, nframes))
    print(f'  ok {name:24s} {img.width}x{img.height}  frames={nframes}')


def report() -> None:
    print(f'-- 共写出 {len(_WRITTEN)} 个文件 --')
