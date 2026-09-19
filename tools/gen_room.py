#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《那年的红白机》 A 组：客厅场景美术 生成器
=================================================
用法：  cd <项目根> && python3 tools/gen_room.py
输出：  assets/img/room/  下 24 个 PNG（尺寸严格按 docs/ART_MANIFEST.md）

设计约束（docs/PALETTE.md）：
  * 只允许 44 色调色板内的颜色，禁止插值/半透明羽化
  * 全部 1:1 像素，圆形/圆角一律按像素判定
  * 输出前统一 alpha 二值化（>=128 -> 255，其余 -> 0）
  * 每个独立物件 1px 同色系最暗色描边；光源统一来自【左上方】
"""

import math
import os
import random

from PIL import Image

# ---------------------------------------------------------------------------
# 0. 调色板（44 色，常量字典，严禁板外颜色）
# ---------------------------------------------------------------------------

PALETTE = {
    # 黑白灰阶
    "INK":   "#000000",
    "GREY1": "#14141c",
    "GREY2": "#24242f",
    "GREY3": "#383845",
    "GREY4": "#4f4f60",
    "GREY5": "#6d6d80",
    "GREY6": "#92929f",
    "GREY7": "#b8b8c2",
    "GREY8": "#dcdce2",
    "WHITE": "#ffffff",
    # 木头 / 家具 / 纸箱
    "WOOD1": "#2a1a10",
    "WOOD2": "#46291a",
    "WOOD3": "#63402a",
    "WOOD4": "#85583a",
    "WOOD5": "#a8764c",
    "WOOD6": "#c99a6a",
    "WOOD7": "#e6c49a",
    # 小旋风红 / 中国红
    "RED1":  "#4a0c12",
    "RED2":  "#7a161c",
    "RED3":  "#ad2229",
    "RED4":  "#d93a34",
    "RED5":  "#f2705a",
    # 绿
    "GRN1":  "#102c1c",
    "GRN2":  "#1d5230",
    "GRN3":  "#2f7d42",
    "GRN4":  "#55ab52",
    "GRN5":  "#8fd15c",
    # 蓝青
    "BLU1":  "#0c1832",
    "BLU2":  "#17346b",
    "BLU3":  "#2a61ad",
    "BLU4":  "#4a9bd1",
    "BLU5":  "#93d4ea",
    # 黄橙
    "YEL1":  "#5c3f0e",
    "YEL2":  "#a87a18",
    "YEL3":  "#e0b422",
    "YEL4":  "#f5db6e",
    # 紫红
    "PUR1":  "#32163f",
    "PUR2":  "#6b2469",
    "PUR3":  "#ad4287",
    "PUR4":  "#e07db4",
    # 皮肤
    "SKN1":  "#8f5a3c",
    "SKN2":  "#c98a5f",
    "SKN3":  "#e8be93",
    "SKN4":  "#f7dcbe",
}


def _hex2rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


RGB = {k: _hex2rgb(v) for k, v in PALETTE.items()}
RGB_SET = set(RGB.values())

# 便捷别名（脚本内直接用大写名字取色）
def c(name):
    """按调色板名取 RGB 三元组。"""
    return RGB[name]


# 4x4 Bayer 有序抖动矩阵
BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]


# ---------------------------------------------------------------------------
# 1. 像素画布：自建缓冲，彻底避免 PIL 的抗锯齿
# ---------------------------------------------------------------------------

class Cv(object):
    """一张像素画布。None = 透明；其余存 RGB 三元组。"""

    def __init__(self, w, h, fill=None):
        self.w = w
        self.h = h
        self.buf = [[fill for _ in range(w)] for _ in range(h)]

    # -- 基础 ---------------------------------------------------------------
    def set(self, x, y, col):
        x = int(x); y = int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.buf[y][x] = col

    def get(self, x, y):
        x = int(x); y = int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.buf[y][x]
        return None

    def opaque(self, x, y):
        return self.get(x, y) is not None

    def rect(self, x, y, w, h, col):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.set(xx, yy, col)

    def frame(self, x, y, w, h, col):
        """1px 边框（不填充内部）。"""
        x, y, w, h = int(x), int(y), int(w), int(h)
        self.hline(x, y, w, col)
        self.hline(x, y + h - 1, w, col)
        self.vline(x, y, h, col)
        self.vline(x + w - 1, y, h, col)

    def hline(self, x, y, w, col):
        for xx in range(int(x), int(x + w)):
            self.set(xx, y, col)

    def vline(self, x, y, h, col):
        for yy in range(int(y), int(y + h)):
            self.set(x, yy, col)

    def line(self, x0, y0, x1, y1, col):
        """Bresenham 直线，1px，无 AA。"""
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx = abs(x1 - x0); dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            self.set(x0, y0, col)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    # -- 圆 -----------------------------------------------------------------
    def disc(self, cx, cy, r, col):
        """实心圆（按像素中心判定，无 AA）。"""
        rr = (r + 0.35) ** 2
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                if (xx - cx) ** 2 + (yy - cy) ** 2 <= rr:
                    self.set(xx, yy, col)

    def ring(self, cx, cy, r, col, thick=1):
        inner = (r - thick + 0.35) ** 2
        outer = (r + 0.35) ** 2
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                d = (xx - cx) ** 2 + (yy - cy) ** 2
                if inner < d <= outer:
                    self.set(xx, yy, col)

    def arc_disc_mask(self, cx, cy, r):
        pts = []
        rr = (r + 0.35) ** 2
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                if (xx - cx) ** 2 + (yy - cy) ** 2 <= rr:
                    pts.append((xx, yy))
        return pts

    # -- 抖动 ---------------------------------------------------------------
    def dither(self, x, y, w, h, c1, c2, ratio=0.5, only_over=None):
        """Bayer 有序抖动：ratio 为 c2 的占比。only_over=True 时只覆盖已有像素。"""
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if only_over and not self.opaque(xx, yy):
                    continue
                t = (BAYER4[yy % 4][xx % 4] + 0.5) / 16.0
                self.set(xx, yy, c2 if t < ratio else c1)

    def dither_over(self, x, y, w, h, col, ratio=0.5, phase=0):
        """在已有像素上按比例撒 col（用于旧化 / 污渍 / 半透感）。"""
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if not self.opaque(xx, yy):
                    continue
                t = (BAYER4[(yy + phase) % 4][(xx + phase) % 4] + 0.5) / 16.0
                if t < ratio:
                    self.set(xx, yy, col)

    def noise_over(self, x, y, w, h, col, prob, rng, only_over=True):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if only_over and not self.opaque(xx, yy):
                    continue
                if rng.random() < prob:
                    self.set(xx, yy, col)

    def vgrad(self, x, y, w, h, cols, only_over=False):
        """竖向多色带渐变，带间用 Bayer 抖动过渡（不产生新颜色）。"""
        n = len(cols)
        h = int(h)
        for i in range(h):
            yy = int(y) + i
            p = i / max(1, h - 1) * (n - 1)
            lo = min(int(p), n - 2) if n > 1 else 0
            frac = p - lo
            for xx in range(int(x), int(x + w)):
                if only_over and not self.opaque(xx, yy):
                    continue
                t = (BAYER4[yy % 4][xx % 4] + 0.5) / 16.0
                self.set(xx, yy, cols[lo + 1] if t < frac else cols[lo])

    # -- 材质 ---------------------------------------------------------------
    def wood_grain(self, x, y, w, h, col, rng, density=0.35, only_over=True):
        """木纹：1px 断续横线。"""
        for yy in range(int(y), int(y + h)):
            if rng.random() > density:
                continue
            xx = int(x)
            end = int(x + w)
            while xx < end:
                seg = rng.randint(2, 9)
                gap = rng.randint(2, 7)
                if rng.random() < 0.72:
                    for k in range(seg):
                        if xx + k < end:
                            if only_over and not self.opaque(xx + k, yy):
                                continue
                            self.set(xx + k, yy, col)
                xx += seg + gap

    def bevel(self, x, y, w, h, hi, lo):
        """塑料/木板受光：上+左 1px 亮，下+右 1px 暗（光来自左上）。"""
        x, y, w, h = int(x), int(y), int(w), int(h)
        self.hline(x, y, w, hi)
        self.vline(x, y, h, hi)
        self.hline(x, y + h - 1, w, lo)
        self.vline(x + w - 1, y, h, lo)

    def plastic_panel(self, x, y, w, h, base, hi, lo, edge=None):
        """一块塑料面板：主体 + 上缘高光 + 下缘暗部 (+ 可选描边)。"""
        self.rect(x, y, w, h, base)
        self.bevel(x, y, w, h, hi, lo)
        if edge:
            self.frame(x - 1, y - 1, w + 2, h + 2, edge)

    def metal_gloss(self, x, y, w, h, base, hi, lo, edge):
        """金属块：GREY 系 + 1px 高光 + 深描边。"""
        self.rect(x, y, w, h, base)
        self.hline(x, y, w, hi)
        self.hline(x, y + h - 1, w, lo)
        self.frame(x - 1, y - 1, w + 2, h + 2, edge)

    def rounded_rect(self, x, y, w, h, col, r=2, cuts=None):
        """圆角矩形（像素级切角）。cuts 给出每行从角落起要挖掉的像素数。"""
        if cuts is None:
            cuts = ROUND_CUTS.get(r, [r])
        self.rect(x, y, w, h, col)
        self.carve_corners(x, y, w, h, cuts, None)

    def carve_corners(self, x, y, w, h, cuts, col):
        """把四角按 cuts 形状设为 col（None = 挖成透明）。"""
        x, y, w, h = int(x), int(y), int(w), int(h)
        for i, n in enumerate(cuts):
            for k in range(n):
                self.set(x + k, y + i, col)
                self.set(x + w - 1 - k, y + i, col)
                self.set(x + k, y + h - 1 - i, col)
                self.set(x + w - 1 - k, y + h - 1 - i, col)

    # -- 描边 ---------------------------------------------------------------
    def outline(self, col, diag=True, region=None):
        """在不透明区域外侧补 1px 描边。region=(x,y,w,h) 可限制范围。"""
        if region:
            rx, ry, rw, rh = region
        else:
            rx, ry, rw, rh = 0, 0, self.w, self.h
        todo = []
        nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            nb += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        for yy in range(ry, ry + rh):
            for xx in range(rx, rx + rw):
                if self.opaque(xx, yy):
                    continue
                for dx, dy in nb:
                    if self.opaque(xx + dx, yy + dy):
                        todo.append((xx, yy))
                        break
        for xx, yy in todo:
            self.set(xx, yy, col)

    def outline_inward(self, col, diag=False):
        """把不透明区域的最外一圈像素改成描边色（不改变外形尺寸）。"""
        todo = []
        nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            nb += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        for yy in range(self.h):
            for xx in range(self.w):
                if not self.opaque(xx, yy):
                    continue
                for dx, dy in nb:
                    nx, ny = xx + dx, yy + dy
                    if nx < 0 or ny < 0 or nx >= self.w or ny >= self.h or not self.opaque(nx, ny):
                        todo.append((xx, yy))
                        break
        for xx, yy in todo:
            self.set(xx, yy, col)

    def ground_shadow(self, col, ratio=0.5, dy=1):
        """贴地投影：在每列最低不透明像素下方 dy 处按 dither 撒暗点。"""
        todo = []
        for x in range(self.w):
            low = None
            for y in range(self.h):
                if self.opaque(x, y):
                    low = y
            if low is None:
                continue
            y = low + dy
            if y < self.h and not self.opaque(x, y):
                if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < ratio:
                    todo.append((x, y))
        for x, y in todo:
            self.set(x, y, col)

    def drop_shadow(self, col, dx=1, dy=1):
        """在物件右下投一层 1px 硬阴影（只画到透明处）。"""
        todo = []
        for yy in range(self.h):
            for xx in range(self.w):
                if self.opaque(xx, yy) and not self.opaque(xx + dx, yy + dy):
                    todo.append((xx + dx, yy + dy))
        for xx, yy in todo:
            self.set(xx, yy, col)

    # -- 组合 ---------------------------------------------------------------
    def blit(self, other, x, y):
        for yy in range(other.h):
            for xx in range(other.w):
                v = other.buf[yy][xx]
                if v is not None:
                    self.set(x + xx, y + yy, v)

    def sub(self, x, y, w, h):
        out = Cv(w, h)
        for yy in range(h):
            for xx in range(w):
                out.buf[yy][xx] = self.get(x + xx, y + yy)
        return out

    def shear_y(self, per_px, base_x=0):
        """按列做整数错切（做"略歪"的奖状等）。"""
        out = Cv(self.w, self.h)
        for xx in range(self.w):
            off = int(round((xx - base_x) * per_px))
            for yy in range(self.h):
                v = self.buf[yy][xx]
                if v is not None:
                    out.set(xx, yy + off, v)
        return out

    # -- 导出 ---------------------------------------------------------------
    def to_image(self):
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        px = img.load()
        for yy in range(self.h):
            row = self.buf[yy]
            for xx in range(self.w):
                v = row[xx]
                if v is not None:
                    px[xx, yy] = (v[0], v[1], v[2], 255)
        return img


# 像素级圆角切角表：key = 半径，value = 每行需要挖掉的像素数
ROUND_CUTS = {
    1: [1],
    2: [2, 1],
    3: [3, 1, 1],
    4: [4, 2, 1, 1],
    5: [5, 3, 2, 1, 1],
    6: [6, 4, 2, 1, 1, 1],
    8: [8, 5, 3, 2, 1, 1, 1, 1],
}


def sheet(frames):
    """把多帧横向拼成 sprite sheet。"""
    w = frames[0].w
    h = frames[0].h
    out = Cv(w * len(frames), h)
    for i, f in enumerate(frames):
        assert f.w == w and f.h == h, "帧尺寸不一致"
        out.blit(f, i * w, 0)
    return out


# ---------------------------------------------------------------------------
# 2. 质量校验：alpha 二值化 + 板外颜色断言
# ---------------------------------------------------------------------------

def finalize(img, name):
    """alpha 二值化（>=128->255，其余->0）并断言无板外颜色。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    bad = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 128:
                a = 255
            else:
                px[x, y] = (0, 0, 0, 0)
                continue
            px[x, y] = (r, g, b, 255)
            if (r, g, b) not in RGB_SET:
                bad[(r, g, b)] = bad.get((r, g, b), 0) + 1
    assert not bad, "%s 出现调色板外颜色: %s" % (
        name, ", ".join("#%02x%02x%02x x%d" % (k[0], k[1], k[2], v) for k, v in bad.items()))
    return img


def save(cv, name, out_dir, expect_size, frames=1):
    img = finalize(cv.to_image(), name)
    assert img.size == (expect_size[0] * frames, expect_size[1]), \
        "%s 尺寸错误: %s, 期望 %s" % (name, img.size, (expect_size[0] * frames, expect_size[1]))
    path = os.path.join(out_dir, name)
    img.save(path)
    print("  [ok] %-20s %3dx%-3d  frames=%d" % (name, img.size[0], img.size[1], frames))
    return path


# ---------------------------------------------------------------------------
# 3. 小工具：抽象字纹 / 旋钮 / 螺丝
# ---------------------------------------------------------------------------

# 5x5 抽象字纹（1px 笔画，示意"小旋风"等，非真实字体渲染）
GLYPH5 = {
    "xiao": ["..#..", "#.#.#", "#.#.#", "..#..", ".##.."],   # 小
    "ba":   ["#####", "#.#.#", "#####", "#.#.#", "##.##"],   # 霸（密笔画示意）
    "wang": ["#####", "..#..", "#####", "..#..", "#####"],   # 王
    "ji":   ["#.#..", "###.#", "#.#.#", "#.###", "..#.#"],   # 机（示意）
    "dian": ["#####", "..#..", "#####", "#.#.#", "..#.#"],   # 电（示意）
    "shi":  ["#####", "..#..", "##.##", "#.#.#", "#.#.#"],   # 视（示意）
    "cai":  [".#.#.", "#####", ".###.", "#####", "..#.."],   # 彩（示意）
}


def glyph(cv, x, y, key, col, scale=1):
    """画一个 5x5 抽象字纹。"""
    rows = GLYPH5[key]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "#":
                if scale == 1:
                    cv.set(x + i, y + j, col)
                else:
                    cv.rect(x + i * scale, y + j * scale, scale, scale, col)


def micro_text(cv, x, y, w, col, seed=1, gap=2, dash=(1, 3)):
    """1px 断续小字纹（远看像一行字）。"""
    rng = random.Random(seed)
    xx = x
    while xx < x + w:
        n = rng.randint(dash[0], dash[1])
        for k in range(n):
            if xx + k < x + w:
                cv.set(xx + k, y, col)
        xx += n + gap


def knob(cv, cx, cy, r, angle_deg, body="GREY5", hi="GREY7", edge="GREY3",
         notch="INK", ticks=True):
    """CRT 旋钮：圆形塑料 + 左上高光 + 缺口指示 + 周围刻度点。"""
    cv.disc(cx, cy, r, c(edge))
    cv.disc(cx, cy, r - 1, c(body))
    # 左上高光弧
    for a in range(120, 231, 6):
        rad = math.radians(a)
        hx = cx + math.cos(rad) * (r - 2)
        hy = cy - math.sin(rad) * (r - 2)
        cv.set(round(hx), round(hy), c(hi))
    # 右下暗部
    for a in range(-60, 51, 8):
        rad = math.radians(a)
        hx = cx + math.cos(rad) * (r - 2)
        hy = cy - math.sin(rad) * (r - 2)
        cv.set(round(hx), round(hy), c(edge))
    # 中心微亮
    cv.set(cx - 1, cy - 1, c(hi))
    # 缺口指示（从中心向外一条槽）
    rad = math.radians(angle_deg)
    for k in range(1, r):
        cv.set(round(cx + math.cos(rad) * k), round(cy - math.sin(rad) * k), c(notch))
    if ticks:
        for a in (145, 90, 35):
            rad = math.radians(a)
            cv.set(round(cx + math.cos(rad) * (r + 2)), round(cy - math.sin(rad) * (r + 2)), c("GREY4"))


def screw(cv, x, y, col="GREY5", edge="GREY3", cross=True):
    """2x2/3x3 螺丝。"""
    cv.rect(x, y, 3, 3, c(col))
    cv.set(x, y, c(edge)); cv.set(x + 2, y, c(edge))
    cv.set(x, y + 2, c(edge)); cv.set(x + 2, y + 2, c(edge))
    if cross:
        cv.set(x + 1, y + 1, c("INK"))


def speaker_grille(cv, x, y, w, h, hole="INK", body=None, step=2):
    """细密扬声器孔：1px 孔 + 1px 间隔。"""
    if body:
        cv.rect(x, y, w, h, c(body))
    for yy in range(y, y + h, step):
        for xx in range(x, x + w, step):
            cv.set(xx, yy, c(hole))


# ---------------------------------------------------------------------------
# 4. 核心资源 A：tv_crt.png（大屁股 CRT 电视，176x148）
#    透明屏幕区：offset(18,16) 尺寸 140x104，四角 3px 圆角（圆角处不透明）
# ---------------------------------------------------------------------------

SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H = 18, 16, 140, 104


def _punch_screen(cv):
    """把屏幕区挖成完全透明；四角 3px 圆角处填回机壳（GREY2 玻璃圈延续）。"""
    for y in range(SCREEN_Y, SCREEN_Y + SCREEN_H):
        for x in range(SCREEN_X, SCREEN_X + SCREEN_W):
            cv.set(x, y, None)
    cv.carve_corners(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, ROUND_CUTS[3], c("GREY2"))


def _aged_plastic(cv, x, y, w, h, rng, base="WOOD7", cool="GREY7", warm="WOOD6",
                  cool_ratio=0.10, warm_ratio=0.22, warm_prob=0.10):
    """80 年代米黄发黄塑料：奶油底 + 黄化 dither + 少量冷灰脏斑 + 随机旧化点。"""
    cv.rect(x, y, w, h, c(base))
    cv.dither_over(x, y, w, h, c(warm), ratio=warm_ratio)      # 整体发黄
    cv.dither_over(x, y, w, h, c(cool), ratio=cool_ratio, phase=2)
    cv.noise_over(x, y, w, h, c(warm), warm_prob, rng)


def make_tv_crt():
    W, H = 176, 148
    cv = Cv(W, H)
    rng = random.Random(1990)

    TOP_H = 5             # 顶面（向后收窄的透视平面）= 大屁股机壳的厚度暗示
    CASE_BOT = 142        # 前壳底边
    PL_Y = 143            # 底座（plinth）
    SH_Y = 147            # 投影

    # ---- 机壳基底：发黄米色塑料 ------------------------------------------
    _aged_plastic(cv, 0, 0, W, CASE_BOT + 1, rng)

    # ---- 顶面（梯形，后沿窄）--------------------------------------------
    insets = (3, 2, 1, 0, 0)
    for i, ins in enumerate(insets):
        cv.hline(0, i, W, None)
        cv.hline(ins, i, W - 2 * ins, c("WOOD7"))
    cv.dither_over(0, 0, W, TOP_H, c("GREY8"), ratio=0.28)
    cv.hline(insets[0], 0, W - 2 * insets[0], c("GREY8"))
    for i in range(6):                      # 顶面散热槽（凹进去的短槽）
        x0 = 56 + i * 11
        cv.hline(x0, 3, 8, c("GREY5"))
        cv.hline(x0, 4, 8, c("WOOD6"))
    cv.hline(2, TOP_H, W - 4, c("GREY8"))   # 顶面/前框转折高光

    # ---- 方向性受光（光源左上）------------------------------------------
    cv.vline(1, TOP_H, CASE_BOT - TOP_H + 1, c("GREY8"))
    cv.vline(2, TOP_H + 1, CASE_BOT - TOP_H, c("WOOD7"))
    for k in range(6):                      # 右侧向后转折的暗带
        cv.dither_over(W - 1 - k, TOP_H, 1, CASE_BOT - TOP_H + 1,
                       c("WOOD6"), ratio=0.25 + 0.12 * k)
    cv.vline(W - 2, TOP_H + 1, CASE_BOT - TOP_H, c("WOOD5"))
    cv.vline(W - 7, TOP_H + 2, CASE_BOT - TOP_H - 2, c("WOOD6"))   # 折面缝
    cv.dither_over(2, CASE_BOT - 4, W - 4, 5, c("WOOD6"), ratio=0.4)
    cv.hline(2, CASE_BOT, W - 4, c("WOOD5"))
    cv.hline(2, CASE_BOT - 1, W - 4, c("WOOD6"))

    # ---- 挖屏幕（透明），四角 3px 圆角保留机壳 ---------------------------
    _punch_screen(cv)

    # ---- 屏幕内凹（CRT 显像管：紧贴一圈 INK，再上左暗 / 下右亮）---------
    sx0, sy0 = SCREEN_X - 1, SCREEN_Y - 1
    sx1, sy1 = SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H
    cv.frame(sx0, sy0, SCREEN_W + 2, SCREEN_H + 2, c("INK"))
    cv.hline(sx0 - 1, sy0 - 1, SCREEN_W + 4, c("GREY3"))
    cv.vline(sx0 - 1, sy0 - 1, SCREEN_H + 4, c("GREY3"))
    cv.hline(sx0 - 1, sy1 + 1, SCREEN_W + 4, c("GREY6"))
    cv.vline(sx1 + 1, sy0 - 1, SCREEN_H + 4, c("GREY6"))
    cv.hline(sx0 - 2, sy0 - 2, SCREEN_W + 6, c("GREY5"))
    cv.vline(sx0 - 2, sy0 - 2, SCREEN_H + 6, c("GREY5"))
    cv.hline(sx0 - 2, sy1 + 2, SCREEN_W + 6, c("WOOD7"))
    cv.vline(sx1 + 2, sy0 - 2, SCREEN_H + 6, c("WOOD7"))
    cv.hline(sx0 - 3, sy1 + 3, SCREEN_W + 8, c("GREY8"))
    cv.vline(sx1 + 3, sy0 - 3, SCREEN_H + 8, c("GREY8"))
    # 显像管四角的黑角（贴着圆角）
    for (cxp, cyp) in ((sx0, sy0), (sx1, sy0), (sx0, sy1), (sx1, sy1)):
        cv.set(cxp, cyp, c("INK"))

    # ---- 下边框功能区 ----------------------------------------------------
    # 品牌铭牌（凹陷 + 白色抽象字纹）
    px0, py0, pw, ph = 8, 124, 39, 10
    cv.rect(px0, py0, pw, ph, c("GREY3"))
    cv.rect(px0 + 1, py0 + 1, pw - 2, ph - 2, c("GREY2"))
    cv.hline(px0, py0, pw, c("GREY4"))
    cv.hline(px0, py0 + ph, pw, c("WOOD7"))              # 凹陷下沿受光
    cv.vline(px0 - 1, py0, ph, c("GREY5"))
    for i, key in enumerate(("cai", "dian", "shi", "ji")):
        glyph(cv, px0 + 3 + i * 9, py0 + 3, key, c("GREY8"))

    # 红色电源指示灯
    lx, ly = 10, 137
    cv.rect(lx - 1, ly - 1, 4, 4, c("GREY3"))
    cv.rect(lx, ly, 2, 2, c("RED4"))
    cv.set(lx, ly, c("RED5"))
    cv.set(lx + 3, ly + 2, c("WOOD6"))
    # POWER 方按钮
    bx, by, bw, bh = 19, 134, 12, 8
    cv.rect(bx, by, bw, bh, c("GREY6"))
    cv.hline(bx, by, bw, c("GREY8"))
    cv.vline(bx, by, bh, c("GREY8"))
    cv.hline(bx, by + bh - 1, bw, c("GREY4"))
    cv.vline(bx + bw - 1, by, bh, c("GREY5"))
    cv.frame(bx - 1, by - 1, bw + 2, bh + 2, c("GREY3"))
    micro_text(cv, bx + 2, by + 3, 8, c("GREY3"), seed=3, gap=1, dash=(1, 2))
    micro_text(cv, 34, 139, 12, c("WOOD5"), seed=7, gap=2, dash=(1, 3))

    # 扬声器孔（细密 1px 孔阵 + 1px 凹陷框）
    gx, gy, gw, gh = 52, 123, 60, 18
    cv.rect(gx, gy, gw, gh, c("WOOD6"))
    cv.dither(gx, gy, gw, gh, c("WOOD6"), c("WOOD7"), ratio=0.5)
    for yy in range(gy + 1, gy + gh - 1, 2):
        for xx in range(gx + 1, gx + gw - 1, 2):
            cv.set(xx, yy, c("GREY3"))
            cv.set(xx + 1, yy + 1, c("INK"))
    cv.hline(gx - 1, gy - 1, gw + 2, c("GREY5"))
    cv.vline(gx - 1, gy - 1, gh + 2, c("GREY5"))
    cv.hline(gx - 1, gy + gh, gw + 2, c("WOOD7"))
    cv.vline(gx + gw, gy - 1, gh + 2, c("WOOD7"))

    # 两个旋钮（频道 / 音量）
    knob(cv, 128, 131, 8, 122)
    knob(cv, 150, 131, 7, 58)
    micro_text(cv, 121, 141, 15, c("WOOD5"), seed=11, gap=2)
    micro_text(cv, 144, 141, 13, c("WOOD5"), seed=13, gap=2)

    # ---- 外轮廓圆角 -----------------------------------------------------
    cv.carve_corners(0, 0, W, CASE_BOT + 1, ROUND_CUTS[4], None)
    cv.hline(insets[0] + 1, 0, W - 2 * insets[0] - 2, c("GREY8"))

    # ---- 底座（比机身略窄，机器"站"在上面）+ 投影 ------------------------
    for y in range(PL_Y, H):
        cv.hline(0, y, W, None)
    cv.rect(7, PL_Y, W - 14, 4, c("WOOD5"))
    cv.hline(8, PL_Y, W - 16, c("WOOD6"))
    cv.hline(7, PL_Y + 3, W - 14, c("WOOD4"))
    cv.rect(10, PL_Y + 1, 6, 2, c("WOOD4"))          # 底座上的散热缺口
    cv.rect(W - 16, PL_Y + 1, 6, 2, c("WOOD4"))

    # ---- 1px GREY3 描边 -------------------------------------------------
    cv.outline(c("GREY3"), diag=True)
    _punch_screen(cv)                     # 描边会侵入屏幕区，重新打一次孔

    # ---- 底部硬阴影（落在蕾丝罩布上）------------------------------------
    for xx in range(10, W - 10):
        if (BAYER4[SH_Y % 4][xx % 4] + 0.5) / 16.0 < 0.6:
            cv.set(xx, SH_Y, c("GREY4"))
    return cv


# ---------------------------------------------------------------------------
# 5. 核心资源 B：console.png（小旋风主机，84x30）
# ---------------------------------------------------------------------------

def make_console():
    W, H = 84, 30
    cv = Cv(W, H)
    rng = random.Random(1991)

    TOP_Y, TOP_H = 2, 8            # 顶面（微俯视）
    FRONT_Y = TOP_Y + TOP_H        # 10
    BOT = 26                       # 机壳底边

    # ---- 壳体：白灰塑料，顶面受光最亮 -----------------------------------
    cv.rect(1, FRONT_Y, W - 2, BOT - FRONT_Y + 1, c("GREY7"))
    # 顶面（后沿收窄 2px，微透视）
    for i in range(TOP_H):
        ins = 2 if i == 0 else (1 if i == 1 else 0)
        cv.hline(1 + ins, TOP_Y + i, W - 2 - 2 * ins, c("GREY8"))
    cv.hline(3, TOP_Y, W - 6, c("WHITE"))                   # 后沿高光
    cv.vline(2, TOP_Y + 1, TOP_H - 1, c("WHITE"))
    cv.dither_over(W - 24, TOP_Y + 1, 24, TOP_H - 1, c("GREY7"), ratio=0.3)
    cv.noise_over(1, TOP_Y, W - 2, TOP_H, c("WHITE"), 0.05, rng)
    # 顶面/前面板转折
    cv.hline(1, FRONT_Y - 1, W - 2, c("GREY6"))
    cv.hline(1, FRONT_Y, W - 2, c("GREY8"))
    # 前面板明暗
    cv.dither_over(1, BOT - 4, W - 2, 5, c("GREY6"), ratio=0.45)
    cv.hline(1, BOT - 1, W - 2, c("GREY6"))
    cv.hline(1, BOT, W - 2, c("GREY4"))
    cv.vline(1, FRONT_Y, BOT - FRONT_Y + 1, c("GREY8"))
    cv.vline(W - 2, FRONT_Y, BOT - FRONT_Y + 1, c("GREY6"))

    # ---- 顶面卡槽（矩形开口，INK 内凹 + GREY3 边）-----------------------
    sx, sy, sw, sh = 26, TOP_Y + 1, 31, 6
    cv.rect(sx - 1, sy - 1, sw + 2, sh + 2, c("GREY3"))
    cv.rect(sx, sy, sw, sh, c("INK"))
    cv.hline(sx, sy, sw, c("GREY2"))                        # 槽内后壁
    cv.hline(sx + 1, sy + sh - 1, sw - 2, c("GREY4"))       # 槽内前壁受光
    cv.hline(sx - 1, sy + sh + 1, sw + 2, c("WHITE"))       # 开口前沿高光
    cv.rect(sx + 3, sy + sh - 1, 3, 1, c("GREY5"))          # 导轨
    cv.rect(sx + sw - 6, sy + sh - 1, 3, 1, c("GREY5"))
    # 顶面右侧散热细纹（3 条干净的线）
    for i in range(3):
        cv.hline(62, TOP_Y + 2 + i * 2, 16, c("GREY6"))
        cv.hline(62, TOP_Y + 3 + i * 2, 16, c("GREY8"))

    # ---- POWER 滑动开关（RED4 滑块）-------------------------------------
    tx, ty = 4, FRONT_Y + 6
    cv.rect(tx, ty, 13, 6, c("GREY6"))
    cv.rect(tx + 1, ty + 1, 11, 4, c("GREY4"))
    cv.frame(tx - 1, ty - 1, 15, 8, c("GREY3"))
    cv.rect(tx + 1, ty + 1, 6, 4, c("RED4"))
    cv.hline(tx + 1, ty + 1, 6, c("RED5"))
    cv.hline(tx + 1, ty + 4, 6, c("RED2"))
    cv.vline(tx + 6, ty + 1, 4, c("RED2"))
    micro_text(cv, tx, FRONT_Y + 3, 13, c("GREY5"), seed=5, gap=2, dash=(1, 2))

    # ---- RESET 按钮 ------------------------------------------------------
    rx, ry = 20, FRONT_Y + 6
    cv.rect(rx, ry, 8, 6, c("GREY6"))
    cv.hline(rx, ry, 8, c("GREY8"))
    cv.vline(rx, ry, 6, c("GREY8"))
    cv.hline(rx, ry + 5, 8, c("GREY4"))
    cv.frame(rx - 1, ry - 1, 10, 8, c("GREY3"))
    micro_text(cv, rx, FRONT_Y + 3, 8, c("GREY5"), seed=9, gap=2, dash=(1, 2))

    # ---- 两个手柄插孔（INK 圆孔 + GREY5 环）-----------------------------
    for cx in (34, 46):
        cy = FRONT_Y + 8
        cv.disc(cx, cy, 4, c("GREY3"))
        cv.disc(cx, cy, 3, c("GREY5"))
        cv.disc(cx, cy, 2, c("INK"))
        cv.set(cx - 2, cy - 2, c("GREY7"))
        cv.set(cx - 1, cy - 3, c("GREY8"))
        cv.set(cx + 2, cy + 2, c("GREY2"))
        cv.set(cx, cy - 1, c("GREY4"))          # 孔内定位销
        cv.set(cx, cy + 2, c("GREY2"))

    # ---- 右侧红色铭牌（小旋风）------------------------------------------
    nx, ny, nw, nh = 55, FRONT_Y + 3, 25, 12
    cv.rect(nx, ny, nw, nh, c("RED3"))
    cv.hline(nx, ny, nw, c("RED4"))
    cv.vline(nx, ny, nh, c("RED4"))
    cv.hline(nx, ny + nh - 1, nw, c("RED1"))
    cv.frame(nx - 1, ny - 1, nw + 2, nh + 2, c("RED1"))
    for i, key in enumerate(("xiao", "ba", "wang")):
        glyph(cv, nx + 3 + i * 7, ny + 2, key, c("WHITE"))
    micro_text(cv, nx + 3, ny + 9, 19, c("RED5"), seed=17, gap=2, dash=(1, 2))

    # ---- 圆角 + 描边 + 底部投影 ------------------------------------------
    cv.carve_corners(1, TOP_Y, W - 2, BOT - TOP_Y + 1, ROUND_CUTS[2], None)
    cv.outline(c("GREY3"), diag=True)
    for xx in range(6, W - 6):
        if (BAYER4[(BOT + 3) % 4][xx % 4] + 0.5) / 16.0 < 0.55:
            cv.set(xx, BOT + 3, c("GREY4"))
    return cv


# ---------------------------------------------------------------------------
# 6. bg_room.png（480x270 整幅背景：墙 + 墙裙 + 踢脚线 + 水磨石地面）
# ---------------------------------------------------------------------------

def _blob(cv, cx, cy, n, col, rng, spread=6, only_over=True):
    """随机走点污渍块。"""
    x, y = cx, cy
    for _ in range(n):
        if not only_over or cv.opaque(x, y):
            cv.set(x, y, col)
        x += rng.randint(-2, 2)
        y += rng.randint(-2, 2)
        if abs(x - cx) > spread:
            x = cx + rng.randint(-1, 1)
        if abs(y - cy) > spread:
            y = cy + rng.randint(-1, 1)


def make_bg_room():
    W, H = 480, 270
    cv = Cv(W, H)
    rng = random.Random(1993)

    RAIL_Y = 120          # 墙裙腰线
    SKIRT_Y = 204         # 踢脚线顶
    FLOOR_Y = 210         # 地面顶

    # ---- 上墙：泛黄的石灰墙（浅奶油底，少量冷灰脏斑）--------------------
    cv.rect(0, 0, W, RAIL_Y, c("WOOD7"))
    cv.dither(0, 0, W, RAIL_Y, c("WOOD7"), c("GREY8"), ratio=0.38)
    cv.noise_over(0, 0, W, RAIL_Y, c("WOOD6"), 0.04, rng)
    cv.noise_over(0, 0, W, RAIL_Y, c("GREY7"), 0.05, rng)
    # ---- 下墙裙：刷了暖色墙裙漆，更脏 -----------------------------------
    cv.rect(0, RAIL_Y, W, SKIRT_Y - RAIL_Y, c("WOOD6"))
    cv.dither(0, RAIL_Y, W, SKIRT_Y - RAIL_Y, c("WOOD6"), c("WOOD7"), ratio=0.28)
    cv.noise_over(0, RAIL_Y, W, SKIRT_Y - RAIL_Y, c("WOOD5"), 0.05, rng)
    # 腰线
    cv.hline(0, RAIL_Y - 2, W, c("WOOD7"))
    cv.hline(0, RAIL_Y - 1, W, c("WOOD5"))
    cv.hline(0, RAIL_Y, W, c("WOOD4"))
    cv.hline(0, RAIL_Y + 1, W, c("WOOD5"))

    # ---- 1px 竖向斑驳 dither（水泥/墙纸旧化）-----------------------------
    for x in range(W):
        if rng.random() < 0.16:
            y0 = rng.randint(0, RAIL_Y - 24)
            y1 = min(RAIL_Y - 3, y0 + rng.randint(14, 74))
            col = c("WOOD6") if rng.random() < 0.65 else c("GREY7")
            for y in range(y0, y1):
                if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < 0.35:
                    cv.set(x, y, col)
        if rng.random() < 0.14:
            y0 = rng.randint(RAIL_Y + 3, SKIRT_Y - 20)
            y1 = min(SKIRT_Y - 1, y0 + rng.randint(10, 52))
            col = c("WOOD5") if rng.random() < 0.6 else c("GREY6")
            for y in range(y0, y1):
                if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < 0.32:
                    cv.set(x, y, col)

    # ---- 墙面明暗：左上受光，右侧与近地面压暗 ---------------------------
    for x in range(W):
        t = x / float(W - 1)
        ratio = 0.03 + 0.26 * t ** 1.6
        for y in range(0, SKIRT_Y):
            if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < ratio * 0.5:
                cv.set(x, y, c("WOOD6") if y < RAIL_Y else c("WOOD5"))
    # 贴近地面的一层脏灰
    cv.dither_over(0, SKIRT_Y - 22, W, 22, c("GREY6"), ratio=0.18, phase=2)
    cv.dither_over(0, SKIRT_Y - 10, W, 10, c("GREY6"), ratio=0.26, phase=1)
    # 左右墙角暗角
    cv.dither_over(0, 0, 8, SKIRT_Y, c("GREY7"), ratio=0.3)
    cv.dither_over(W - 12, 0, 12, SKIRT_Y, c("GREY6"), ratio=0.3)

    # ---- 墙角污渍 / 霉斑 -------------------------------------------------
    for (bx, by, n, col) in ((6, 186, 200, "GREY6"), (470, 30, 150, "GREY6"),
                             (474, 170, 180, "WOOD5"), (232, 197, 130, "GREY6"),
                             (150, 8, 110, "GREY7"), (356, 192, 130, "WOOD5")):
        _blob(cv, bx, by, n, c(col), rng, spread=11)
    # 一道旧漏水痕（从上往下）
    for y in range(0, 96):
        x = 306 + int(math.sin(y / 13.0) * 2)
        if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < 0.6:
            cv.set(x, y, c("WOOD6"))
            cv.set(x + 1, y, c("GREY7"))

    # ---- 一道电线（左上 -> 右上，1px INK，带自然下垂）-------------------
    for x in range(W):
        t = x / float(W - 1)
        y = 10 + 16 * t + 7 * math.sin(math.pi * t)
        cv.set(x, int(round(y)), c("INK"))
    cv.rect(0, 8, 3, 5, c("GREY4"))            # 左侧固定件
    cv.rect(W - 4, 24, 4, 5, c("GREY4"))       # 右侧固定件

    # ---- 踢脚线 ----------------------------------------------------------
    cv.rect(0, SKIRT_Y, W, FLOOR_Y - SKIRT_Y, c("WOOD3"))
    cv.hline(0, SKIRT_Y, W, c("WOOD4"))
    cv.hline(0, FLOOR_Y - 1, W, c("WOOD1"))
    cv.wood_grain(0, SKIRT_Y + 1, W, FLOOR_Y - SKIRT_Y - 2, c("WOOD2"), rng, density=0.5)

    # ---- 水磨石地面（透视格纹：往下格子变大）----------------------------
    fh = H - FLOOR_Y
    cv.rect(0, FLOOR_Y, W, fh, c("GREY7"))
    cv.dither(0, FLOOR_Y, W, fh, c("GREY7"), c("GREY8"), ratio=0.35)
    # 远处（上部）压暗
    for y in range(FLOOR_Y, H):
        t = (y - FLOOR_Y) / float(fh - 1)
        r = 0.5 * (1 - t) ** 1.5
        for x in range(W):
            if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < r:
                cv.set(x, y, c("GREY6"))
    # 水磨石颗粒
    for _ in range(1500):
        x = rng.randrange(W)
        y = rng.randrange(FLOOR_Y, H)
        cv.set(x, y, c(rng.choice(("GREY8", "GREY5", "WOOD6", "GREY8", "GREY6"))))
    # 横向缝（间距往下变大）
    rows = [0.0, 0.10, 0.235, 0.40, 0.60, 0.83, 1.06]
    line_ys = []
    for r in rows:
        y = FLOOR_Y + int(round(r * fh))
        if FLOOR_Y <= y < H:
            line_ys.append(y)
            cv.hline(0, y, W, c("GREY5"))
            if y + 1 < H:
                for x in range(W):
                    if (BAYER4[(y + 1) % 4][x % 4] + 0.5) / 16.0 < 0.6:
                        cv.set(x, y + 1, c("GREY8"))  # 缝下受光高光
    # 纵向缝（向消失点收拢）
    vpx, vpy = 236.0, 150.0
    for i in range(-5, 6):
        for y in range(FLOOR_Y, H):
            k = (y - vpy) / float(H - 1 - vpy)
            x = vpx + i * 66.0 * k
            if 0 <= x < W:
                cv.set(int(round(x)), y, c("GREY5"))
                if (BAYER4[y % 4][int(x) % 4] + 0.5) / 16.0 < 0.6:
                    cv.set(int(round(x)) + (1 if i >= 0 else -1), y, c("GREY8"))
    # 地面裂缝与水渍
    _blob(cv, 92, 250, 220, c("GREY6"), rng, spread=16)
    _blob(cv, 404, 240, 150, c("GREY6"), rng, spread=12)
    for k in range(26):
        cv.set(150 + k, 236 + int(math.sin(k / 4.0) * 1.5), c("GREY4"))

    # ---- 窗洞（x24..107, y36..99）+ 窗框 + 窗台 -------------------------
    wx, wy, ww, wh = 24, 36, 84, 64
    cv.rect(wx - 4, wy - 4, ww + 8, wh + 8, c("WOOD3"))
    cv.hline(wx - 4, wy - 4, ww + 8, c("WOOD4"))
    cv.vline(wx - 4, wy - 4, wh + 8, c("WOOD4"))
    cv.hline(wx - 4, wy + wh + 3, ww + 8, c("WOOD2"))
    cv.vline(wx + ww + 3, wy - 4, wh + 8, c("WOOD2"))
    cv.frame(wx - 5, wy - 5, ww + 10, wh + 10, c("WOOD2"))
    cv.rect(wx, wy, ww, wh, c("BLU2"))          # 兜底：窗 sprite 会覆盖
    cv.frame(wx - 1, wy - 1, ww + 2, wh + 2, c("WOOD2"))
    # 窗台
    cv.rect(wx - 8, wy + wh + 4, ww + 16, 5, c("WOOD4"))
    cv.hline(wx - 8, wy + wh + 4, ww + 16, c("WOOD6"))
    cv.hline(wx - 8, wy + wh + 8, ww + 16, c("WOOD2"))
    cv.wood_grain(wx - 8, wy + wh + 5, ww + 16, 3, c("WOOD3"), rng, density=0.6)

    # ---- 门洞（x398..459, y92..231）+ 门框 ------------------------------
    dx, dy, dw, dh = 398, 92, 62, 140
    cv.rect(dx, dy, dw, dh, c("GREY1"))         # 楼道黑暗兜底
    cv.dither(dx, dy, dw, dh, c("GREY1"), c("GREY2"), ratio=0.3)
    # 门框（左/上/右，3px WOOD3）
    cv.rect(dx - 4, dy - 4, dw + 8, 4, c("WOOD3"))
    cv.rect(dx - 4, dy, 4, dh + 4, c("WOOD3"))
    cv.rect(dx + dw, dy, 4, dh + 4, c("WOOD3"))
    cv.hline(dx - 4, dy - 4, dw + 8, c("WOOD4"))
    cv.vline(dx - 4, dy - 4, dh + 8, c("WOOD4"))
    cv.vline(dx + dw + 3, dy, dh + 4, c("WOOD2"))
    cv.vline(dx - 1, dy, dh + 4, c("WOOD2"))
    cv.vline(dx + dw, dy, dh + 4, c("WOOD5"))
    cv.hline(dx - 4, dy - 1, dw + 8, c("WOOD2"))
    cv.frame(dx - 5, dy - 5, dw + 10, dh + 10, c("WOOD2"))
    cv.wood_grain(dx - 4, dy, 4, dh, c("WOOD2"), rng, density=0.35)
    cv.wood_grain(dx + dw, dy, 4, dh, c("WOOD2"), rng, density=0.35)

    # ---- 傍晚斜阳：从窗口斜射到墙裙与地面（克制的 YEL dither）----------
    for y in range(wy + wh + 10, H):
        t = (y - (wy + wh + 10)) / float(H - (wy + wh + 10))
        x0 = int(96 + 78 * t) + rng.randint(-2, 2)
        x1 = int(x0 + 86 + 36 * t) + rng.randint(-2, 2)
        ratio = 0.13 * (1 - t * 0.5)
        for x in range(max(0, x0), min(W, x1)):
            edge = min(x - x0, x1 - x) / 10.0
            r = ratio * min(1.0, max(0.15, edge))
            if (BAYER4[y % 4][x % 4] + 0.5) / 16.0 < r:
                cv.set(x, y, c("YEL4") if y < FLOOR_Y else c("WOOD7"))
    return cv


# ---------------------------------------------------------------------------
# 7. window.png（84x64 木窗棂 + 傍晚天空 + 蒜苗）
# ---------------------------------------------------------------------------

def make_window():
    W, H = 84, 64
    cv = Cv(W, H)
    rng = random.Random(51)

    # 天空（整窗统一渐变，之后压窗棂）
    cv.vgrad(0, 0, W, H, [c("BLU4"), c("BLU5"), c("YEL4"), c("YEL3"), c("YEL3")])
    # 远处楼房剪影 + 电线杆（地平线 y=50，下两格玻璃仍以天空为主）
    HZ = 50
    cv.rect(0, HZ, W, H - HZ, c("WOOD5"))
    cv.dither(0, HZ, W, H - HZ, c("WOOD5"), c("WOOD4"), ratio=0.4)
    cv.hline(0, HZ, W, c("WOOD6"))
    cv.dither(0, HZ + 6, W, H - HZ - 6, c("WOOD4"), c("WOOD3"), ratio=0.45)
    for (bx, bw, bh) in ((4, 12, 10), (18, 8, 6), (30, 15, 14), (48, 10, 8), (62, 13, 12)):
        cv.rect(bx, HZ - bh, bw, bh, c("GREY5"))
        cv.dither(bx, HZ - bh, bw, bh, c("GREY5"), c("GREY4"), ratio=0.4)
        cv.hline(bx, HZ - bh, bw, c("GREY6"))
        for wy2 in range(HZ - bh + 2, HZ - 1, 3):
            for wx2 in range(bx + 1, bx + bw - 1, 3):
                cv.set(wx2, wy2, c(rng.choice(("YEL3", "GREY6", "YEL4"))))
    cv.vline(60, 16, HZ - 16, c("GREY4"))       # 电线杆
    cv.hline(56, 19, 9, c("GREY4"))
    cv.line(0, 21, 60, 17, c("GREY4"))
    cv.line(60, 17, 83, 23, c("GREY4"))
    # 玻璃 45° 高光
    for k in range(30):
        cv.set(6 + k, 4 + k, c("GREY8"))
        if k % 2 == 0:
            cv.set(7 + k, 4 + k, c("GREY8"))
    for k in range(16):
        cv.set(50 + k, 6 + k, c("GREY8") if k % 2 == 0 else c("BLU5"))

    # ---- 蒜苗（窗台上的一盆，玻璃前）------------------------------------
    px0, py0 = 8, 46
    cv.rect(px0, py0, 17, 12, c("WOOD6"))                 # 瓷盆
    cv.dither(px0, py0, 17, 12, c("WOOD6"), c("WOOD5"), ratio=0.4)
    cv.hline(px0, py0, 17, c("WOOD7"))
    cv.hline(px0, py0 + 11, 17, c("WOOD4"))
    cv.frame(px0 - 1, py0 - 1, 19, 14, c("WOOD2"))
    cv.rect(px0 + 1, py0 + 1, 15, 2, c("WOOD3"))          # 盆里的水
    for i, (gx, gh) in enumerate(((3, 14), (7, 20), (11, 17), (15, 22), (12, 11))):
        base_y = py0 + 1
        cv.rect(px0 + gx, base_y - 3, 3, 4, c("GREY8"))   # 蒜瓣
        cv.set(px0 + gx, base_y - 3, c("WOOD7"))
        col = c("GRN3") if i % 2 else c("GRN4")
        for k in range(gh):
            bend = int(k * k * 0.02) * (1 if i % 2 else -1)
            cv.set(px0 + gx + 1 + bend, base_y - 3 - k, col)
            if k < gh - 3:
                cv.set(px0 + gx + bend, base_y - 3 - k, c("GRN2"))
            if k > gh - 8:
                cv.set(px0 + gx + 1 + bend, base_y - 3 - k, c("GRN5"))

    # ---- 窗棂（十字 4 格）+ 外框 ----------------------------------------
    # 外框 3px
    cv.rect(0, 0, W, 3, c("WOOD4"))
    cv.rect(0, H - 3, W, 3, c("WOOD4"))
    cv.rect(0, 0, 3, H, c("WOOD4"))
    cv.rect(W - 3, 0, 3, H, c("WOOD4"))
    # 中央十字
    cv.rect(40, 0, 4, H, c("WOOD4"))
    cv.rect(0, 30, W, 4, c("WOOD4"))
    # 木纹与受光
    for (rx, ry, rw, rh) in ((0, 0, W, 3), (0, H - 3, W, 3), (0, 0, 3, H), (W - 3, 0, 3, H),
                             (40, 0, 4, H), (0, 30, W, 4)):
        cv.wood_grain(rx, ry, rw, rh, c("WOOD3"), rng, density=0.55)
        cv.hline(rx, ry, rw, c("WOOD5"))
        cv.vline(rx, ry, rh, c("WOOD5"))
        cv.hline(rx, ry + rh - 1, rw, c("WOOD2"))
        cv.vline(rx + rw - 1, ry, rh, c("WOOD2"))
    cv.frame(0, 0, W, H, c("WOOD2"))
    # 窗钩
    cv.rect(36, 34, 3, 6, c("GREY5"))
    cv.set(36, 34, c("GREY7"))
    return cv


# ---------------------------------------------------------------------------
# 8. door.png（62x140 x3 帧：关 / 半开 / 全开）
# ---------------------------------------------------------------------------

def _door_slab(cv, x0, w, rng, lit=True):
    """在 cv 上画门扇正面（x0 起，宽 w，高 140）。"""
    H = 140
    cv.rect(x0, 0, w, H, c("WOOD4"))
    cv.dither(x0, 0, w, H, c("WOOD4"), c("WOOD3"), ratio=0.28)
    cv.wood_grain(x0, 0, w, H, c("WOOD3"), rng, density=0.42)
    if lit:
        cv.vline(x0, 0, H, c("WOOD5"))
        cv.vline(x0 + 1, 0, H, c("WOOD5"))
        cv.hline(x0, 0, w, c("WOOD5"))
    # 两块凹陷门芯板
    for (py, ph) in ((10, 50), (72, 56)):
        pw = max(6, w - 14)
        px = x0 + 7
        cv.rect(px, py, pw, ph, c("WOOD3"))
        cv.wood_grain(px, py, pw, ph, c("WOOD2"), rng, density=0.4)
        # 凹陷：上/左暗，下/右亮
        cv.hline(px - 1, py - 1, pw + 2, c("WOOD2"))
        cv.vline(px - 1, py - 1, ph + 2, c("WOOD2"))
        cv.hline(px - 1, py + ph, pw + 2, c("WOOD5"))
        cv.vline(px + pw, py - 1, ph + 2, c("WOOD5"))
        cv.hline(px - 2, py - 2, pw + 4, c("WOOD5"))
        cv.vline(px - 2, py - 2, ph + 4, c("WOOD5"))
        cv.hline(px - 2, py + ph + 1, pw + 4, c("WOOD2"))
        cv.vline(px + pw + 1, py - 2, ph + 4, c("WOOD2"))


def make_door():
    W, H, N = 62, 140, 3
    frames = []
    for fi in range(N):
        rng = random.Random(300 + fi)
        cv = Cv(W, H)
        if fi == 0:
            open_x = 0
        elif fi == 1:
            open_x = 24          # 露出的楼道宽度
        else:
            open_x = 46
        # 楼道黑暗
        if open_x:
            cv.rect(0, 0, open_x, H, c("GREY1"))
            cv.dither(0, 0, open_x, H, c("GREY1"), c("GREY2"), ratio=0.26)
            # 楼道里一点微光（扶手 / 台阶暗示）
            cv.vline(2, 0, H, c("GREY2"))
            cv.hline(0, 96, open_x, c("GREY2"))
            cv.hline(0, 108, open_x, c("GREY3"))
            if fi == 2:
                cv.hline(0, 120, open_x, c("GREY2"))
                cv.rect(open_x - 8, 40, 3, 26, c("GREY3"))
        slab_x = open_x
        slab_w = W - open_x
        if fi == 2:
            # 全开：只看到门的厚度侧面 + 背面一条
            cv.rect(slab_x, 0, 4, H, c("WOOD5"))
            cv.dither(slab_x, 0, 4, H, c("WOOD5"), c("WOOD6"), ratio=0.3)
            cv.rect(slab_x + 4, 0, slab_w - 4, H, c("WOOD3"))
            cv.dither(slab_x + 4, 0, slab_w - 4, H, c("WOOD3"), c("WOOD2"), ratio=0.35)
            cv.wood_grain(slab_x + 4, 0, slab_w - 4, H, c("WOOD2"), rng, density=0.4)
            cv.vline(slab_x + 4, 0, H, c("WOOD2"))
            cv.vline(W - 1, 0, H, c("WOOD2"))
        else:
            _door_slab(cv, slab_x, slab_w, rng)
            if fi == 1:
                # 半开：门内侧边缘的厚度高光
                cv.vline(slab_x, 0, H, c("WOOD6"))
                cv.vline(slab_x + 1, 0, H, c("WOOD5"))
            # 猫眼
            cx, cy = slab_x + slab_w // 2, 33
            cv.disc(cx, cy, 4, c("GREY3"))
            cv.disc(cx, cy, 3, c("GREY5"))
            cv.disc(cx, cy, 2, c("GREY2"))
            cv.set(cx - 1, cy - 1, c("GREY7"))
            cv.set(cx + 1, cy + 1, c("INK"))
            # 门把手（GREY6）：竖长底座 + 横向拉杆 + 下折手柄头
            hx = W - 10
            cv.rect(hx - 1, 72, 5, 16, c("GREY5"))          # 底座面板
            cv.hline(hx - 1, 72, 5, c("GREY7"))
            cv.vline(hx - 1, 72, 16, c("GREY7"))
            cv.hline(hx - 1, 87, 5, c("GREY3"))
            cv.vline(hx + 3, 72, 16, c("GREY3"))
            cv.frame(hx - 2, 71, 7, 18, c("GREY3"))
            cv.rect(hx - 8, 77, 8, 3, c("GREY6"))           # 拉杆
            cv.hline(hx - 8, 77, 8, c("GREY8"))
            cv.hline(hx - 8, 79, 8, c("GREY3"))
            cv.rect(hx - 9, 77, 2, 5, c("GREY6"))           # 手柄头下折
            cv.set(hx - 9, 77, c("GREY8"))
            cv.set(hx - 8, 81, c("GREY3"))
            cv.rect(hx, 82, 3, 3, c("GREY3"))               # 锁孔
            cv.set(hx + 1, 83, c("INK"))
        # 底部门缝光
        cv.hline(slab_x, H - 2, W - slab_x, c("YEL3"))
        cv.hline(slab_x, H - 1, W - slab_x, c("YEL4"))
        if open_x:
            cv.hline(0, H - 1, open_x, c("YEL3"))
        # 描边
        cv.frame(0, 0, W, H, c("WOOD2"))
        if open_x:
            cv.vline(0, 0, H, c("GREY2"))
        frames.append(cv)
    return sheet(frames)


# ---------------------------------------------------------------------------
# 9. tv_cabinet.png（244x64 老式木质电视柜）
# ---------------------------------------------------------------------------

def make_tv_cabinet():
    W, H = 244, 64
    cv = Cv(W, H)
    rng = random.Random(77)

    TOP_H = 12                 # 顶面（受光）
    FRONT_Y = TOP_H            # 12
    FRONT_H = 40               # 柜门区 y12..51
    APRON_Y = FRONT_Y + FRONT_H  # 52

    # ---- 顶面 ------------------------------------------------------------
    cv.rect(0, 0, W, TOP_H, c("WOOD6"))
    cv.dither(0, 0, W, TOP_H, c("WOOD6"), c("WOOD7"), ratio=0.4)
    cv.dither(W - 60, 0, 60, TOP_H, c("WOOD6"), c("WOOD5"), ratio=0.35)  # 右侧渐暗
    cv.wood_grain(0, 1, W, TOP_H - 3, c("WOOD5"), rng, density=0.5)
    cv.hline(0, 0, W, c("WOOD7"))
    cv.hline(0, TOP_H - 2, W, c("WOOD5"))      # 台面前缘厚度
    cv.hline(0, TOP_H - 1, W, c("WOOD4"))

    # ---- 正面：两扇柜门 + 中竖档 ----------------------------------------
    cv.rect(0, FRONT_Y, W, FRONT_H, c("WOOD4"))
    cv.dither(0, FRONT_Y, W, FRONT_H, c("WOOD4"), c("WOOD3"), ratio=0.3)
    stile_x = W // 2 - 3
    doors = ((2, stile_x - 3), (stile_x + 6, W - 2 - (stile_x + 6)))
    for i, (dx, dw) in enumerate(doors):
        cv.rect(dx, FRONT_Y + 2, dw, FRONT_H - 5, c("WOOD4"))
        cv.wood_grain(dx, FRONT_Y + 2, dw, FRONT_H - 5, c("WOOD3"), rng, density=0.45)
        # 门板凹陷芯板
        px, py = dx + 6, FRONT_Y + 8
        pw, ph = dw - 12, FRONT_H - 17
        cv.rect(px, py, pw, ph, c("WOOD3"))
        cv.wood_grain(px, py, pw, ph, c("WOOD2"), rng, density=0.4)
        cv.hline(px - 1, py - 1, pw + 2, c("WOOD2"))
        cv.vline(px - 1, py - 1, ph + 2, c("WOOD2"))
        cv.hline(px - 1, py + ph, pw + 2, c("WOOD5"))
        cv.vline(px + pw, py - 1, ph + 2, c("WOOD5"))
        # 门缝
        cv.vline(dx - 1, FRONT_Y + 2, FRONT_H - 5, c("WOOD2"))
        cv.vline(dx + dw, FRONT_Y + 2, FRONT_H - 5, c("WOOD2"))
        cv.hline(dx, FRONT_Y + 2, dw, c("WOOD5"))
        # 圆拉手（GREY6）
        hx = dx + dw - 10 if i == 0 else dx + 9
        hy = FRONT_Y + FRONT_H // 2 - 2
        cv.disc(hx, hy, 4, c("GREY3"))
        cv.disc(hx, hy, 3, c("GREY6"))
        cv.set(hx - 1, hy - 1, c("GREY8"))
        cv.set(hx + 1, hy + 1, c("GREY4"))
        cv.set(hx, hy + 4, c("WOOD2"))
    # 中竖档
    cv.rect(stile_x, FRONT_Y, 6, FRONT_H, c("WOOD4"))
    cv.vline(stile_x, FRONT_Y, FRONT_H, c("WOOD5"))
    cv.vline(stile_x + 5, FRONT_Y, FRONT_H, c("WOOD2"))
    cv.wood_grain(stile_x, FRONT_Y, 6, FRONT_H, c("WOOD3"), rng, density=0.4)

    # ---- 下横档 + 4 条矮腿 ----------------------------------------------
    cv.rect(0, APRON_Y, W, 4, c("WOOD3"))
    cv.hline(0, APRON_Y, W, c("WOOD5"))
    cv.hline(0, APRON_Y + 3, W, c("WOOD1"))
    legs = (3, 66, 160, 227)
    for lx in legs:
        lw = 14
        cv.rect(lx, APRON_Y + 4, lw, H - (APRON_Y + 4), c("WOOD3"))
        cv.vline(lx, APRON_Y + 4, H - (APRON_Y + 4), c("WOOD4"))
        cv.vline(lx + lw - 1, APRON_Y + 4, H - (APRON_Y + 4), c("WOOD2"))
        cv.hline(lx, H - 1, lw, c("WOOD1"))
        cv.wood_grain(lx + 1, APRON_Y + 5, lw - 2, H - APRON_Y - 6, c("WOOD2"), rng, density=0.3)

    # ---- 描边（WOOD2）---------------------------------------------------
    cv.outline(c("WOOD2"), diag=True)
    cv.frame(0, 0, W, TOP_H, c("WOOD2"))
    cv.hline(0, 0, W, c("WOOD7"))
    cv.vline(0, FRONT_Y, APRON_Y - FRONT_Y + 4, c("WOOD2"))
    cv.vline(W - 1, FRONT_Y, APRON_Y - FRONT_Y + 4, c("WOOD2"))
    return cv


# ---------------------------------------------------------------------------
# 10. lace_cloth.png（252x22 白色蕾丝罩布）
# ---------------------------------------------------------------------------

def make_lace_cloth():
    W, H = 252, 22
    cv = Cv(W, H)
    rng = random.Random(88)

    TOPF = 8              # 柜面上的平铺部分
    DROP = 10             # 前沿垂下

    cv.rect(0, 0, W, TOPF + DROP, c("WHITE"))
    # 平铺面：轻微起伏（手工感）
    cv.dither(0, 0, W, TOPF, c("WHITE"), c("GREY8"), ratio=0.3)
    # 前沿折角阴影
    cv.hline(0, TOPF - 1, W, c("GREY7"))
    cv.hline(0, TOPF, W, c("GREY8"))
    cv.rect(0, TOPF + 1, W, DROP - 1, c("WHITE"))
    cv.dither(0, TOPF + 1, W, DROP - 1, c("WHITE"), c("GREY8"), ratio=0.22)
    # 垂布上的镂空孔洞 dither（菱形小花阵）
    for gy in range(TOPF + 2, TOPF + DROP - 1, 4):
        for gx in range(3, W - 3, 8):
            off = 4 if ((gy // 4) % 2) else 0
            x = gx + off
            cv.set(x, gy, c("GREY6"))          # 镂空孔（透出下面的木色 -> 用暗灰示意）
            cv.set(x + 1, gy, c("GREY7"))
            cv.set(x, gy + 1, c("GREY7"))
            cv.set(x + 1, gy + 1, c("GREY6"))
    # 两道织带纹
    cv.hline(0, TOPF + 3, W, c("GREY8"))
    for x in range(0, W, 3):
        cv.set(x, TOPF + 3, c("GREY7"))

    # ---- 下沿锯齿小三角（7 个，宽度略不等 = 手工感）--------------------
    edges = [0]
    widths = [34, 38, 35, 37, 33, 38, 37]
    for w in widths:
        edges.append(edges[-1] + w)
    ybase = TOPF + DROP
    for i in range(len(widths)):
        x0 = edges[i]
        x1 = min(W, edges[i + 1])
        tw = x1 - x0
        tip = 4 + (i % 2)                      # 齿高 4~5px
        for k in range(tip):
            shrink = int(round(k * (tw / 2.0 - 3) / tip))
            xa = x0 + shrink
            xb = x1 - shrink
            for x in range(xa, xb):
                cv.set(x, ybase + k, c("WHITE"))
            cv.set(xa, ybase + k, c("GREY7"))
            cv.set(xb - 1, ybase + k, c("GREY7"))
            if k == 1:                         # 每个齿里一个小孔
                cv.set((xa + xb) // 2, ybase + k, c("GREY6"))
        # 齿尖小珠
        mid = (x0 + x1) // 2
        cv.set(mid, ybase + tip, c("GREY8"))
        cv.set(mid - 1, ybase + tip - 1, c("GREY7"))
    # 两端不对称：右端多垂 1px、左端起翘
    cv.hline(0, TOPF + DROP - 1, 6, None)
    cv.rect(W - 5, TOPF + DROP, 4, 2, c("WHITE"))
    cv.set(1, TOPF + 1, None)
    # 描边（GREY7）
    cv.outline(c("GREY7"), diag=True)
    cv.hline(0, 0, W, c("GREY8"))
    return cv


# ---------------------------------------------------------------------------
# 11. tv_antenna.png（56x34 兔耳朵天线）
# ---------------------------------------------------------------------------

def make_tv_antenna():
    W, H = 56, 34
    cv = Cv(W, H)
    # 底座
    bx, by, bw, bh = 22, 27, 12, 6
    cv.rect(bx, by, bw, bh, c("GREY4"))
    cv.hline(bx, by, bw, c("GREY6"))
    cv.hline(bx, by + bh - 1, bw, c("GREY2"))
    cv.frame(bx - 1, by - 1, bw + 2, bh + 2, c("GREY2"))
    cv.rect(bx + 4, by - 2, 4, 3, c("GREY5"))     # 转轴
    cv.set(bx + 4, by - 2, c("GREY7"))

    # 两根斜杆（V 形）
    cv.line(bx + 4, by - 1, 3, 3, c("GREY6"))
    cv.line(bx + 5, by - 1, 4, 3, c("GREY4"))     # 下侧暗边
    cv.line(bx + 7, by - 1, 52, 4, c("GREY6"))
    cv.line(bx + 7, by, 52, 5, c("GREY4"))
    # 顶端小球
    for (px, py) in ((3, 3), (52, 4)):
        cv.disc(px, py, 2, c("GREY6"))
        cv.set(px - 1, py - 1, c("GREY8"))
        cv.set(px + 1, py + 1, c("GREY4"))
        cv.ring(px, py, 3, c("GREY3"))
    # 左杆上缠的一圈铝箔
    for k in range(5):
        x = 11 + k
        y = 11 - k
        cv.set(x, y, c("GREY8"))
        cv.set(x, y - 1, c("GREY8"))
        cv.set(x + 1, y, c("GREY7"))
    cv.set(13, 9, c("WHITE"))
    return cv


# ---------------------------------------------------------------------------
# 12. controller_1p / 2p（48x30 红白机手柄）
# ---------------------------------------------------------------------------

def _make_controller(top_col, bot_col, edge_col, mic=False, seed=1):
    W, H = 48, 30
    cv = Cv(W, H)
    BX, BY, BW, BH = 2, 6, 44, 21          # 机身
    SPLIT = BY + 9                          # 分模线

    cv.rect(BX, BY, BW, BH, c(top_col))
    cv.rect(BX, SPLIT, BW, BY + BH - SPLIT, c(bot_col))
    # 受光：上缘亮，下缘暗
    cv.hline(BX, BY, BW, c("WHITE" if top_col == "GREY7" else "RED4"))
    cv.hline(BX, BY + BH - 1, BW, c("GREY3" if bot_col == "GREY7" else "RED1"))
    cv.vline(BX, BY, BH, c("GREY8" if top_col == "GREY7" else "RED4"))
    cv.vline(BX + BW - 1, BY, BH, c("GREY5" if top_col == "GREY7" else "RED2"))
    # 分模线
    cv.hline(BX, SPLIT - 1, BW, c("GREY5" if top_col == "GREY7" else "RED2"))
    cv.hline(BX, SPLIT, BW, c("GREY8" if bot_col == "GREY7" else "RED4"))

    # 十字键（左）
    dcx, dcy = 11, BY + 9
    cv.rect(dcx - 5, dcy - 5, 11, 11, c("GREY4"))       # 底座
    cv.hline(dcx - 5, dcy - 5, 11, c("GREY5"))
    cv.hline(dcx - 5, dcy + 5, 11, c("GREY2"))
    cv.frame(dcx - 6, dcy - 6, 13, 13, c("GREY2"))
    cv.rect(dcx - 4, dcy - 1, 9, 3, c("INK"))           # 横
    cv.rect(dcx - 1, dcy - 4, 3, 9, c("INK"))           # 竖
    cv.set(dcx - 4, dcy - 1, c("GREY3"))
    cv.set(dcx - 1, dcy - 4, c("GREY3"))
    cv.set(dcx, dcy, c("GREY2"))

    # A/B 键（右，各 6x6 RED4 + GREY3 描边）
    for i, bx in enumerate((30, 38)):
        by = BY + 7
        cv.rect(bx, by, 6, 6, c("RED4"))
        cv.hline(bx, by, 6, c("RED5"))
        cv.hline(bx, by + 5, 6, c("RED2"))
        cv.set(bx, by, c("RED4"))
        cv.set(bx + 5, by + 5, c("RED1"))
        cv.frame(bx - 1, by - 1, 8, 8, c("GREY3"))
        cv.carve_corners(bx - 1, by - 1, 8, 8, [1], c("GREY4"))
        micro_text(cv, bx + 1, by + 8, 4, c("GREY5"), seed=seed + i, gap=1, dash=(1, 2))

    # SELECT / START（中间两个 GREY5 细长条）
    for i in range(2):
        sx = 18 + i * 7
        sy = BY + 13
        cv.rect(sx, sy, 5, 3, c("GREY5"))
        cv.hline(sx, sy, 5, c("GREY7"))
        cv.hline(sx, sy + 2, 5, c("GREY3"))
        cv.rect(sx - 1, sy - 2, 7, 2, c("GREY3" if bot_col == "GREY7" else "RED1"))
        cv.frame(sx - 1, sy - 1, 7, 5, c("GREY3"))

    if mic:
        # 2P 右上角麦克风孔
        for yy in range(BY + 2, BY + 6):
            for xx in range(37, 44):
                if (xx + yy) % 2 == 0:
                    cv.set(xx, yy, c("INK"))
        cv.frame(36, BY + 1, 9, 6, c("GREY3"))

    # 圆角 + 描边
    cv.carve_corners(BX, BY, BW, BH, ROUND_CUTS[2], None)
    cv.outline(c(edge_col), diag=True)

    # 左上角引出 2px INK 线缆，向左弯出画面
    for k in range(0, 14):
        x = 6 - k
        y = 5 - int(k * 0.32)
        cv.set(x, y, c("INK"))
        cv.set(x, y - 1, c("INK"))
        if k % 3 == 0:
            cv.set(x, y - 2, c("GREY4"))
    cv.rect(4, 3, 5, 4, c("GREY4"))       # 线缆护套
    cv.hline(4, 3, 5, c("GREY6"))
    cv.frame(3, 2, 7, 6, c("GREY2"))
    cv.ground_shadow(c("GREY5"), ratio=0.45)
    return cv


def make_controller_1p():
    return _make_controller("GREY7", "RED3", "GREY3", mic=False, seed=3)


def make_controller_2p():
    return _make_controller("RED3", "GREY7", "RED1", mic=True, seed=5)


# ---------------------------------------------------------------------------
# 13. cable.png（64x10 可平铺 AV/电源线）
# ---------------------------------------------------------------------------

def make_cable():
    W, H = 64, 10
    cv = Cv(W, H)
    for x in range(W):
        y = 4.5 + 2.4 * math.sin(2 * math.pi * x / float(W))
        yi = int(round(y))
        cv.set(x, yi, c("INK"))
        cv.set(x, yi + 1, c("INK"))
        cv.set(x, yi - 1, c("GREY4"))       # 1px 高光（上缘）
    return cv


# ---------------------------------------------------------------------------
# 14. sofa.png（130x68 90 年代花布三人沙发，中间坐垫右侧有 4px INK 缝隙）
# ---------------------------------------------------------------------------

def _floral(cv, x, y, w, h, base, mid, rng, seed=0):
    """花被面：底色 + dither + 小碎花。"""
    cv.rect(x, y, w, h, c(base))
    cv.dither(x, y, w, h, c(base), c(mid), ratio=0.38)
    # 规则排布的小碎花（每 9x7 一朵，交错），比随机撒点更像印花布
    r = random.Random(seed)
    for fy in range(y + 2, y + h - 2, 7):
        row = (fy - y) // 7
        for fx in range(x + 2 + (4 if row % 2 else 0), x + w - 2, 9):
            if not cv.opaque(fx, fy):
                continue
            cv.set(fx, fy, c("PUR4"))
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                if cv.opaque(fx + dx, fy + dy):
                    cv.set(fx + dx, fy + dy, c("PUR3"))
            if r.random() < 0.45:
                cv.set(fx, fy, c("YEL4"))


def make_sofa():
    W, H = 130, 68
    cv = Cv(W, H)
    rng = random.Random(404)

    # ---- 靠背 ------------------------------------------------------------
    bx, by, bw, bh = 15, 1, 100, 30
    _floral(cv, bx, by, bw, bh, "PUR2", "PUR3", rng, seed=1)
    cv.hline(bx, by, bw, c("PUR3"))                  # 顶面受光
    cv.hline(bx, by + 1, bw, c("PUR3"))
    cv.dither(bx, by + 2, bw, 3, c("PUR3"), c("PUR4"), ratio=0.3)
    cv.dither(bx + bw - 12, by, 12, bh, c("PUR2"), c("PUR1"), ratio=0.35)   # 右侧暗
    cv.carve_corners(bx, by, bw, bh, ROUND_CUTS[3], None)
    # 靠背三块靠垫（缝线 + 每块顶部圆角高光）
    for sx in (bx + 33, bx + 66):
        cv.vline(sx, by + 2, bh - 3, c("PUR1"))
        cv.vline(sx + 1, by + 2, bh - 3, c("PUR3"))
    for cx0 in (bx, bx + 34, bx + 67):
        cw = 32
        cv.hline(cx0 + 2, by + 2, cw - 4, c("PUR4"))
        cv.set(cx0 + 1, by + 3, c("PUR3"))
        cv.set(cx0 + cw - 2, by + 3, c("PUR1"))
    # 靠背下沿投在坐垫上的阴影
    cv.hline(bx, by + bh - 2, bw, c("PUR1"))
    cv.hline(bx, by + bh - 1, bw, c("PUR1"))
    cv.hline(bx + 2, by + bh, bw - 4, c("PUR1"))

    # ---- 坐垫（3 块）-----------------------------------------------------
    sy, sh = 30, 17
    seats = ((21, 29), (50, 29), (79, 30))
    for i, (sx, sw) in enumerate(seats):
        _floral(cv, sx, sy, sw, sh, "PUR2", "PUR3", rng, seed=10 + i)
        cv.hline(sx, sy, sw, c("PUR3"))              # 坐垫上面受光
        cv.hline(sx, sy + 1, sw, c("PUR3"))
        cv.hline(sx, sy + sh - 1, sw, c("PUR1"))     # 前沿暗
        cv.vline(sx, sy, sh, c("PUR3"))
        cv.vline(sx + sw - 1, sy, sh, c("PUR1"))
        cv.carve_corners(sx, sy, sw, sh, ROUND_CUTS[2], None)
    # 坐垫之间的缝（左边一道普通缝）
    cv.rect(48, sy, 2, sh, c("PUR1"))
    # ★ 玩法要点：中间坐垫右侧 4px INK 深缝
    cv.rect(75, sy - 3, 4, sh + 3, c("INK"))
    cv.vline(74, sy - 3, sh + 3, c("PUR1"))
    cv.vline(79, sy - 2, sh + 2, c("PUR1"))
    cv.hline(75, sy - 3, 4, c("GREY2"))
    cv.set(75, sy + sh - 1, c("GREY1"))

    # ---- 两侧扶手 --------------------------------------------------------
    for i, (ax, aw) in enumerate(((1, 20), (109, 20))):
        ay, ah = 10, 38
        _floral(cv, ax, ay, aw, ah, "PUR2", "PUR3", rng, seed=20 + i)
        # 扶手顶面（受光）
        cv.rect(ax, ay, aw, 4, c("PUR3"))
        cv.dither(ax, ay, aw, 3, c("PUR3"), c("PUR4"), ratio=0.34)
        cv.hline(ax, ay, aw, c("PUR3"))
        cv.hline(ax, ay + 4, aw, c("PUR1"))
        if i == 1:
            cv.dither(ax + aw - 8, ay, 8, ah, c("PUR2"), c("PUR1"), ratio=0.4)
        else:
            cv.vline(ax, ay, ah, c("PUR3"))
        cv.carve_corners(ax, ay, aw, ah, ROUND_CUTS[4], None)
        cv.vline(ax + aw - 1, ay + 5, ah - 5, c("PUR1"))
        # 扶手内侧的褶皱
        inner = ax + aw - 3 if i == 0 else ax + 2
        cv.vline(inner, ay + 6, ah - 8, c("PUR1"))
        cv.vline(inner + (1 if i == 0 else -1), ay + 7, ah - 10, c("PUR3"))

    # ---- 木质底座 + 矮腿 -------------------------------------------------
    base_y = 47
    cv.rect(2, base_y, W - 4, 9, c("WOOD3"))
    cv.hline(2, base_y, W - 4, c("WOOD4"))
    cv.hline(2, base_y + 1, W - 4, c("WOOD5"))
    cv.hline(2, base_y + 8, W - 4, c("WOOD1"))
    cv.wood_grain(2, base_y + 2, W - 4, 6, c("WOOD2"), rng, density=0.5)
    for lx in (4, 36, 90, 120):
        cv.rect(lx, base_y + 9, 7, 6, c("WOOD3"))
        cv.vline(lx, base_y + 9, 6, c("WOOD4"))
        cv.vline(lx + 6, base_y + 9, 6, c("WOOD1"))
        cv.hline(lx, base_y + 14, 7, c("WOOD1"))
    # 落地阴影
    cv.hline(4, base_y + 15, W - 8, c("GREY4"))
    for xx in range(6, W - 6):
        if (BAYER4[(base_y + 16) % 4][xx % 4] + 0.5) / 16.0 < 0.5:
            cv.set(xx, base_y + 16, c("GREY5"))

    cv.outline(c("PUR1"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 15. fish_tank.png（44x38 x2 金鱼缸，鱼尾摆动）
# ---------------------------------------------------------------------------

def make_fish_tank():
    W, H = 44, 38
    frames = []
    for fi in range(2):
        cv = Cv(W, H)
        # 小方凳
        st_x, st_y, st_w, st_h = 9, 29, 26, 6
        cv.rect(st_x, st_y, st_w, st_h, c("WOOD4"))
        cv.hline(st_x, st_y, st_w, c("WOOD6"))
        cv.hline(st_x, st_y + st_h - 1, st_w, c("WOOD2"))
        cv.rect(st_x + 2, st_y + st_h, 4, 3, c("WOOD3"))
        cv.rect(st_x + st_w - 6, st_y + st_h, 4, 3, c("WOOD3"))
        cv.frame(st_x - 1, st_y - 1, st_w + 2, st_h + 2, c("WOOD2"))

        # 玻璃鱼缸（圆球形）
        cx, cy, r = 22, 18, 13
        WATER = 12                              # 水面 y
        cv.disc(cx, cy, r, c("BLU5"))           # 玻璃
        cv.disc(cx, cy, r - 1, c("BLU4"))
        # 水下：BLU3 + dither
        for y in range(WATER, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if cv.get(x, y) == c("BLU4"):
                    cv.set(x, y, c("BLU3"))
        cv.dither(cx - r, WATER, 2 * r + 1, cy + r - WATER, c("BLU3"), c("BLU4"),
                  ratio=0.28, only_over=True)
        # 水面（一道亮线 + 折射）
        for x in range(cx - 12, cx + 13):
            if cv.opaque(x, WATER):
                cv.set(x, WATER, c("BLU5"))
                cv.set(x, WATER - 1, c("GREY8") if x % 3 else c("BLU5"))
        # 缸底彩色石子
        for (sx, col) in ((-9, "RED4"), (-6, "YEL3"), (-3, "GRN4"),
                          (0, "RED3"), (3, "BLU5"), (6, "YEL4"), (9, "GRN3")):
            cv.rect(cx + sx, cy + 9, 3, 2, c(col))
            cv.set(cx + sx, cy + 9, c("GREY8"))
        cv.hline(cx - 10, cy + 11, 21, c("BLU2"))
        # 一条金鱼（身体 + 尾巴摆动）
        fx, fy = cx - 2, cy + 2
        cv.rect(fx - 3, fy - 1, 6, 3, c("RED4"))
        cv.rect(fx - 2, fy - 2, 4, 5, c("RED4"))
        cv.hline(fx - 2, fy - 2, 4, c("RED5"))
        cv.hline(fx - 2, fy + 2, 4, c("RED3"))
        cv.set(fx - 4, fy, c("RED4"))
        cv.set(fx - 3, fy - 1, c("INK"))             # 眼
        cv.set(fx, fy - 3, c("RED5"))                # 背鳍
        cv.set(fx + 1, fy - 3, c("RED4"))
        tail = 1 if fi == 0 else -1
        for k in range(1, 5):
            yy = fy + tail * (k // 2)
            cv.set(fx + 2 + k, yy, c("RED4"))
            cv.set(fx + 2 + k, yy - tail, c("RED5"))
            if k > 2:
                cv.set(fx + 2 + k, yy + tail, c("RED3"))
        # 气泡
        cv.set(cx + 7, 16 if fi == 0 else 14, c("GREY8"))
        cv.set(cx + 9, 21 if fi == 0 else 19, c("BLU5"))
        # 水草
        for k in range(6):
            cv.set(cx - 10 + (k % 2), cy + 8 - k, c("GRN3"))
        # 玻璃 45° 高光
        for k in range(7):
            cv.set(cx - 9 + k, cy - 7 + k, c("GREY8"))
            if k % 2 == 0:
                cv.set(cx - 8 + k, cy - 7 + k, c("GREY8"))
        for k in range(4):
            cv.set(cx + 7 + k, cy - 4 + k, c("BLU5"))
        # 缸口（外翻的圆边）
        cv.ring(cx, cy, r, c("BLU5"))
        for x in range(cx - 11, cx + 12):
            cv.set(x, 9, c("BLU5"))
            cv.set(x, 10, c("BLU4") if x % 2 else c("GREY8"))
        cv.set(cx - 11, 10, c("BLU2")); cv.set(cx + 11, 10, c("BLU2"))
        cv.outline(c("BLU2"), diag=True)
        frames.append(cv)
    return sheet(frames)


# 16. thermos.png（22x44 老式铁皮暖水瓶）
# ---------------------------------------------------------------------------

def make_thermos():
    W, H = 22, 44
    cv = Cv(W, H)
    rng = random.Random(9)

    # 提手（GREY7 金属半环，先画，落在最后面）
    for a in range(14, 167, 3):
        rad = math.radians(a)
        hx = 10.5 + math.cos(rad) * 7.5
        hy = 11 - math.sin(rad) * 8.0
        cv.set(round(hx), round(hy), c("GREY7"))
        cv.set(round(hx), round(hy) + 1, c("GREY5"))
    cv.set(3, 11, c("GREY6")); cv.set(18, 11, c("GREY6"))

    # 木塞
    cv.rect(8, 5, 6, 5, c("WOOD5"))
    cv.hline(8, 5, 6, c("WOOD6"))
    cv.hline(9, 6, 4, c("WOOD6"))
    cv.hline(8, 9, 6, c("WOOD3"))
    cv.vline(13, 5, 5, c("WOOD4"))
    # 瓶口 / 颈（铁皮）
    cv.rect(7, 10, 9, 3, c("GREY6"))
    cv.hline(7, 10, 9, c("GREY8"))
    cv.hline(7, 12, 9, c("GREY4"))
    # 肩部（外扩）
    for i, (x0, wd) in enumerate(((6, 11), (5, 13), (4, 15))):
        cv.hline(x0, 13 + i, wd, c("GRN3"))
        cv.set(x0, 13 + i, c("GRN4"))
        cv.set(x0 + wd - 1, 13 + i, c("GRN2"))
    # 筒身
    cv.rect(3, 16, 16, 24, c("GRN3"))
    cv.dither(3, 16, 16, 24, c("GRN3"), c("GRN2"), ratio=0.25)
    cv.vline(4, 16, 24, c("GRN4"))                 # 左侧受光
    cv.vline(5, 16, 24, c("GRN4"))
    cv.vline(6, 17, 22, c("GRN3"))
    cv.vline(17, 16, 24, c("GRN1"))                # 右侧暗
    cv.vline(16, 16, 24, c("GRN2"))
    for y in range(17, 39, 3):                     # 竹编/铁皮竖纹
        for x in range(4, 18, 3):
            cv.set(x + (y % 2), y, c("GRN2"))
    cv.hline(3, 16, 16, c("GRN4"))
    # 两道箍
    for by in (20, 36):
        cv.hline(3, by, 16, c("GRN2"))
        cv.hline(3, by + 1, 16, c("GRN4"))
    # 红花图案（一朵大 + 一朵小）
    for (fx, fy, big) in ((9, 27, True), (15, 32, False)):
        cv.set(fx, fy, c("YEL3"))
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            cv.set(fx + dx, fy + dy, c("RED4"))
        if big:
            for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, 1), (-1, 1), (1, -1)):
                cv.set(fx + dx, fy + dy, c("RED3"))
            cv.set(fx - 1, fy - 1, c("RED5"))
        cv.set(fx + 2, fy + 2, c("GRN4"))
    cv.noise_over(3, 16, 16, 24, c("GRN4"), 0.04, rng)
    # 底圈
    cv.rect(3, 40, 16, 3, c("GREY6"))
    cv.hline(3, 40, 16, c("GREY8"))
    cv.hline(3, 42, 16, c("GREY4"))
    cv.set(3, 42, c("GREY3")); cv.set(18, 42, c("GREY3"))
    cv.outline(c("GRN1"), diag=True)
    return cv


# 17. shoebox.png（56x34 装卡带的旧鞋盒 + 斜靠的盒盖）
# ---------------------------------------------------------------------------

def make_shoebox():
    W, H = 56, 34
    cv = Cv(W, H)
    rng = random.Random(66)
    # 盒盖：一块有厚度的纸板，斜靠在盒子左侧
    for k in range(16):
        x = 1 + k
        y0 = 30 - int(round(k * 1.15))
        cv.vline(x, y0, 8, c("WOOD6"))           # 盖子正面
        cv.set(x, y0, c("WOOD7"))                # 上沿受光
        cv.set(x, y0 + 1, c("WOOD7"))
        cv.set(x, y0 + 6, c("WOOD5"))            # 盖板厚度
        cv.set(x, y0 + 7, c("WOOD4"))
    micro_text(cv, 4, 23, 9, c("WOOD4"), seed=12, gap=2, dash=(2, 3))

    # 盒身
    bx, by, bw, bh = 18, 10, 36, 22
    cv.rect(bx, by, bw, bh, c("WOOD6"))
    cv.noise_over(bx, by, bw, bh, c("WOOD5"), 0.10, rng)      # 纸板纤维（随机而非规则网格）
    cv.noise_over(bx, by, bw, bh, c("WOOD7"), 0.06, rng)
    cv.hline(bx, by, bw, c("WOOD7"))
    cv.hline(bx, by + bh - 1, bw, c("WOOD4"))
    cv.vline(bx, by, bh, c("WOOD7"))
    cv.vline(bx + bw - 1, by, bh, c("WOOD4"))
    cv.dither(bx + bw - 7, by, 7, bh, c("WOOD5"), c("WOOD6"), ratio=0.4)
    # 盒内（口沿）
    cv.rect(bx + 1, by, bw - 2, 3, c("WOOD4"))
    cv.hline(bx + 1, by + 2, bw - 2, c("WOOD3"))
    # 竖插的卡带（只露上沿）
    carts = (("GREY7", "GREY5"), ("GRN3", "GRN2"), ("BLU3", "BLU2"),
             ("RED3", "RED1"), ("YEL3", "YEL2"))
    for i, (col, dark) in enumerate(carts):
        cx0 = bx + 2 + i * 7
        top = by - 8 - (i % 2) * 2
        cv.rect(cx0, top, 5, by + 3 - top, c(col))
        cv.hline(cx0, top, 5, c("GREY8") if col == "GREY7" else c(col))
        cv.vline(cx0, top, by + 3 - top, c("GREY8") if col == "GREY7" else c(col))
        cv.vline(cx0 + 4, top, by + 3 - top, c(dark))
        cv.hline(cx0 + 1, top + 1, 3, c(dark))     # 提手凹槽
        cv.hline(cx0 + 1, top + 4, 3, c("GREY8") if col != "GREY7" else c("GREY5"))  # 贴纸
        cv.frame(cx0 - 1, top - 1, 7, by + 4 - top, c("GREY3"))
    # 马克笔手写涂鸦（连笔感：横线 + 竖钩）
    for i, (tx, ty, tw) in enumerate(((4, 9, 20), (4, 12, 15), (22, 16, 10))):
        col = c("INK") if i < 2 else c("BLU2")
        micro_text(cv, bx + tx, by + ty, tw, col, seed=4 + i * 2, gap=2, dash=(2, 4))
        for k in range(0, tw, 5):
            cv.set(bx + tx + k, by + ty + 1, col)
    cv.wood_grain(bx + 1, by + 17, bw - 2, 4, c("WOOD5"), rng, density=0.25)
    # 底部阴影
    cv.hline(bx + 1, by + bh, bw - 2, c("GREY4"))
    cv.outline(c("WOOD3"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 18. desk_small.png（62x46 小方桌 + 台灯底座 + 笔）
# ---------------------------------------------------------------------------

def make_desk_small():
    W, H = 62, 46
    cv = Cv(W, H)
    rng = random.Random(31)
    TOP_Y = 12
    # 桌面（顶面 + 前缘厚度）
    cv.rect(0, TOP_Y, W, 5, c("WOOD5"))
    cv.dither(0, TOP_Y, W, 4, c("WOOD5"), c("WOOD6"), ratio=0.45)
    cv.hline(0, TOP_Y, W, c("WOOD6"))
    cv.wood_grain(0, TOP_Y + 1, W, 3, c("WOOD4"), rng, density=0.6)
    cv.hline(0, TOP_Y + 4, W, c("WOOD3"))
    cv.rect(0, TOP_Y + 5, W, 2, c("WOOD4"))
    cv.hline(0, TOP_Y + 6, W, c("WOOD2"))
    # 抽屉
    cv.rect(4, TOP_Y + 7, W - 8, 10, c("WOOD4"))
    cv.hline(4, TOP_Y + 7, W - 8, c("WOOD5"))
    cv.hline(4, TOP_Y + 16, W - 8, c("WOOD2"))
    cv.wood_grain(4, TOP_Y + 8, W - 8, 8, c("WOOD3"), rng, density=0.4)
    cv.rect(W // 2 - 5, TOP_Y + 11, 10, 2, c("GREY6"))   # 抽屉拉手
    cv.hline(W // 2 - 5, TOP_Y + 11, 10, c("GREY8"))
    cv.hline(W // 2 - 5, TOP_Y + 12, 10, c("GREY4"))
    # 桌腿
    for lx in (2, W - 8):
        cv.rect(lx, TOP_Y + 17, 6, H - (TOP_Y + 17), c("WOOD4"))
        cv.vline(lx, TOP_Y + 17, H - (TOP_Y + 17), c("WOOD5"))
        cv.vline(lx + 5, TOP_Y + 17, H - (TOP_Y + 17), c("WOOD2"))
    cv.rect(8, H - 8, W - 16, 3, c("WOOD3"))      # 横撑
    cv.hline(8, H - 8, W - 16, c("WOOD4"))

    # 台灯底座（圆盘 + 短杆）
    lx, ly = 14, TOP_Y
    cv.rect(lx - 7, ly - 3, 15, 3, c("GREY5"))
    cv.hline(lx - 7, ly - 3, 15, c("GREY7"))
    cv.hline(lx - 6, ly - 1, 13, c("GREY3"))
    cv.rect(lx - 1, ly - 10, 3, 7, c("GREY6"))
    cv.vline(lx - 1, ly - 10, 7, c("GREY8"))
    cv.vline(lx + 1, ly - 10, 7, c("GREY4"))
    cv.rect(lx - 4, ly - 12, 9, 2, c("GREY5"))
    cv.hline(lx - 4, ly - 12, 9, c("GREY7"))
    # 一支笔（YEL3 斜放）
    for k in range(13):
        cv.set(34 + k, TOP_Y - 1 - (k // 6), c("YEL3"))
        cv.set(34 + k, TOP_Y - (k // 6), c("YEL2"))
    cv.set(47, TOP_Y - 3, c("WOOD6")); cv.set(48, TOP_Y - 3, c("INK"))
    cv.set(33, TOP_Y - 1, c("GREY6"))
    cv.outline(c("WOOD2"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 19. homework_book.png（42x30 x2 摊开的作业本 + 铅笔）
# ---------------------------------------------------------------------------

def make_homework_book():
    W, H = 42, 30
    frames = []
    for fi in range(2):
        cv = Cv(W, H)
        # 两页
        cv.rect(1, 5, 40, 22, c("WHITE"))
        cv.carve_corners(1, 5, 40, 22, ROUND_CUTS[2], None)
        cv.hline(2, 5, 38, c("GREY8"))
        cv.hline(2, 26, 38, c("GREY7"))
        # 书脊阴影
        cv.vline(20, 5, 22, c("GREY7"))
        cv.vline(21, 5, 22, c("GREY8"))
        # 田字格
        for gx in range(3, 40, 6):
            if gx in (21,):
                continue
            for gy in range(8, 25, 6):
                cv.frame(gx, gy, 6, 6, c("BLU5"))
                for k in range(1, 5):
                    if k % 2 == 0:
                        cv.set(gx + 3, gy + k, c("BLU5"))
                        cv.set(gx + k, gy + 3, c("BLU5"))
        if fi == 1:
            # 写了几行字（抽象笔画）
            r = random.Random(21)
            for gx in range(3, 40, 6):
                if gx > 33 and r.random() < 0.6:
                    continue
                for gy in (8, 14):
                    if r.random() < 0.22:
                        continue
                    cv.hline(gx + 1, gy + 2, 4, c("BLU2"))
                    cv.vline(gx + 3, gy + 1, 4, c("BLU2"))
                    if r.random() < 0.5:
                        cv.set(gx + 1, gy + 1, c("BLU2"))
                        cv.set(gx + 4, gy + 4, c("BLU2"))
                    else:
                        cv.hline(gx + 1, gy + 4, 4, c("BLU2"))
        # 铅笔
        for k in range(16):
            cv.set(24 + k, 2 + (k // 8), c("YEL3"))
            cv.set(24 + k, 3 + (k // 8), c("YEL2"))
        cv.set(23, 2, c("WOOD6")); cv.set(22, 2, c("INK"))
        cv.rect(38, 3, 3, 2, c("RED4"))
        cv.outline(c("GREY7"), diag=True)
        frames.append(cv)
    return sheet(frames)


# ---------------------------------------------------------------------------
# 20. calendar.png（34x46 墙上挂历）
# ---------------------------------------------------------------------------

def make_calendar():
    W, H = 34, 46
    cv = Cv(W, H)
    # 挂钉
    cv.set(17, 0, c("GREY4"))
    cv.rect(16, 1, 3, 2, c("GREY6"))
    cv.set(16, 1, c("GREY8"))
    cv.line(17, 3, 17, 5, c("GREY5"))
    # 年画（上半）
    px, py, pw, ph = 2, 5, 30, 24
    cv.rect(px, py, pw, ph, c("PUR2"))
    cv.vgrad(px, py, pw, ph, [c("PUR2"), c("PUR3"), c("YEL2")])
    # 抽象美人像
    cv.disc(px + 14, py + 10, 5, c("SKN3"))            # 脸
    cv.disc(px + 14, py + 8, 5, c("INK"))              # 头发
    cv.rect(px + 9, py + 8, 11, 4, c("INK"))
    cv.disc(px + 14, py + 11, 4, c("SKN3"))
    cv.set(px + 12, py + 11, c("INK")); cv.set(px + 16, py + 11, c("INK"))
    cv.set(px + 14, py + 14, c("RED3"))
    cv.rect(px + 9, py + 16, 11, 8, c("RED3"))         # 红衣
    cv.dither(px + 9, py + 16, 11, 8, c("RED3"), c("RED4"), ratio=0.35)
    cv.rect(px + 8, py + 18, 3, 6, c("RED2"))
    cv.rect(px + 20, py + 18, 3, 6, c("RED2"))
    # 背景花
    for (fx, fy) in ((5, 8), (25, 10), (4, 20), (26, 21)):
        cv.set(px + fx, py + fy, c("YEL4"))
        cv.set(px + fx - 1, py + fy, c("PUR4"))
        cv.set(px + fx + 1, py + fy, c("PUR4"))
        cv.set(px + fx, py + fy - 1, c("PUR4"))
    cv.frame(px, py, pw, ph, c("YEL3"))
    # 日历纸（下半）
    dx, dy, dw, dh = 2, 29, 30, 15
    cv.rect(dx, dy, dw, dh, c("WHITE"))
    cv.rect(dx, dy, dw, 4, c("RED3"))
    micro_text(cv, dx + 2, dy + 1, 12, c("WHITE"), seed=2, gap=2, dash=(1, 2))
    micro_text(cv, dx + 18, dy + 2, 10, c("YEL4"), seed=3, gap=2, dash=(1, 2))
    # 大号日期数字（点阵抽象）
    cv.rect(dx + 3, dy + 6, 7, 7, c("RED3"))
    cv.rect(dx + 5, dy + 8, 3, 3, c("WHITE"))
    for row in range(3):
        micro_text(cv, dx + 13, dy + 6 + row * 3, 15, c("INK"), seed=10 + row, gap=2, dash=(1, 2))
    cv.hline(dx, dy + dh - 1, dw, c("GREY7"))
    cv.frame(dx, dy, dw, dh, c("GREY7"))
    cv.outline(c("WOOD2"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 21. award.png（42x30 三好学生奖状，略歪 + 四角胶带）
# ---------------------------------------------------------------------------

def make_award():
    W, H = 42, 30
    base = Cv(W, H)
    # 纸
    base.rect(1, 3, 40, 24, c("YEL4"))
    base.dither(1, 3, 40, 24, c("YEL4"), c("YEL3"), ratio=0.18)
    base.hline(1, 3, 40, c("YEL4"))
    base.hline(1, 26, 40, c("YEL2"))
    # 红色边框花纹
    base.frame(3, 5, 36, 20, c("RED3"))
    base.frame(5, 7, 32, 16, c("RED2"))
    for x in range(5, 37, 3):
        base.set(x, 5, c("RED4"))
        base.set(x + 1, 24, c("RED4"))
    for y in range(6, 24, 3):
        base.set(3, y, c("RED4"))
        base.set(38, y + 1, c("RED4"))
    # 标题 + 正文抽象字纹
    micro_text(base, 12, 9, 18, c("RED2"), seed=1, gap=2, dash=(2, 3))
    micro_text(base, 8, 13, 26, c("INK"), seed=2, gap=2, dash=(1, 3))
    micro_text(base, 8, 15, 24, c("INK"), seed=3, gap=2, dash=(1, 3))
    micro_text(base, 8, 17, 20, c("INK"), seed=4, gap=2, dash=(1, 3))
    # 红章
    base.disc(31, 20, 3, c("RED3"))
    base.ring(31, 20, 3, c("RED4"))
    base.set(31, 20, c("RED4"))
    cv = base.shear_y(0.055, base_x=W // 2)      # 略微歪斜
    # 四角胶带（GREY8 用 dither 表现半透）
    for (tx, ty) in ((0, 1), (34, 3), (0, 22), (34, 24)):
        for yy in range(ty, ty + 5):
            for xx in range(tx, tx + 8):
                if (BAYER4[yy % 4][xx % 4] + 0.5) / 16.0 < 0.55:
                    cv.set(xx, yy, c("GREY8"))
    cv.outline(c("YEL1"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 22. lightbulb.png（18x26 x2 吊灯泡：熄 / 亮）
# ---------------------------------------------------------------------------

def make_lightbulb():
    W, H = 18, 26
    frames = []
    for fi in range(2):
        cv = Cv(W, H)
        # 电线
        for y in range(0, 9):
            cv.set(9 + (1 if y > 5 else 0), y, c("INK"))
        # 灯头（GREY6 螺纹）
        cv.rect(7, 9, 6, 6, c("GREY6"))
        cv.hline(7, 9, 6, c("GREY8"))
        cv.hline(7, 11, 6, c("GREY4"))
        cv.hline(7, 13, 6, c("GREY4"))
        cv.vline(12, 9, 6, c("GREY4"))
        cv.frame(6, 8, 8, 8, c("GREY3"))
        # 玻璃泡
        bulb = "GREY7" if fi == 0 else "YEL4"
        cv.disc(9, 19, 5, c(bulb))
        cv.rect(7, 15, 5, 3, c(bulb))
        if fi == 0:
            cv.dither(5, 15, 9, 9, c("GREY7"), c("GREY6"), ratio=0.3, only_over=True)
            cv.set(7, 17, c("GREY8"))
            cv.set(8, 16, c("GREY8"))
            cv.set(11, 22, c("GREY6"))
            cv.rect(8, 17, 3, 3, c("GREY6"))       # 钨丝
            cv.set(9, 18, c("GREY8"))
            cv.outline(c("GREY4"), diag=True)
        else:
            cv.dither(5, 15, 9, 9, c("YEL4"), c("WHITE"), ratio=0.35, only_over=True)
            cv.rect(8, 17, 3, 3, c("WHITE"))       # 亮起的钨丝
            cv.set(12, 22, c("YEL3"))
            # 光晕 dither
            for yy in range(11, 26):
                for xx in range(0, 18):
                    if cv.opaque(xx, yy):
                        continue
                    d = math.hypot(xx - 9, yy - 19)
                    if d < 8.5:
                        t = (BAYER4[yy % 4][xx % 4] + 0.5) / 16.0
                        if t < 0.55 * (1 - d / 8.5):
                            cv.set(xx, yy, c("YEL3"))
            cv.outline(c("YEL2"), diag=True, region=(4, 14, 11, 12))
        frames.append(cv)
    return sheet(frames)


# ---------------------------------------------------------------------------
# 23. clock_wall.png（28x28 圆形挂钟，指针 5 点半）
# ---------------------------------------------------------------------------

def make_clock_wall():
    W, H = 28, 28
    cv = Cv(W, H)
    cx, cy, r = 13, 14, 13
    cv.disc(cx, cy, r, c("WOOD5"))
    cv.disc(cx, cy, r - 1, c("WOOD4"))
    cv.disc(cx, cy, r - 3, c("WHITE"))
    # 外框受光
    for a in range(100, 240, 5):
        rad = math.radians(a)
        cv.set(round(cx + math.cos(rad) * (r - 1)), round(cy - math.sin(rad) * (r - 1)), c("WOOD6"))
    for a in range(-70, 60, 5):
        rad = math.radians(a)
        cv.set(round(cx + math.cos(rad) * (r - 1)), round(cy - math.sin(rad) * (r - 1)), c("WOOD3"))
    # 表盘内圈阴影
    for a in range(60, 250, 4):
        rad = math.radians(a)
        cv.set(round(cx + math.cos(rad) * (r - 4)), round(cy - math.sin(rad) * (r - 4)), c("GREY8"))
    # 刻度（12/3/6/9 长，其余点）
    for i in range(12):
        ang = math.radians(90 - i * 30)
        long = (i % 3 == 0)
        r0 = r - 5 if long else r - 4
        for k in range(r0, r - 3):
            cv.set(round(cx + math.cos(ang) * k), round(cy - math.sin(ang) * k), c("INK"))
    # 指针：时针 5.5h -> 165°(自 12 顺时针)；分针 30min -> 180°
    def hand(deg, length, col, thick=False):
        rad = math.radians(deg)
        dx = math.sin(rad)
        dy = -math.cos(rad)
        for k in range(1, length + 1):
            x = round(cx + dx * k)
            y = round(cy + dy * k)
            cv.set(x, y, col)
            if thick and k < length - 1:
                cv.set(x + 1, y, col)
    hand(165, 6, c("INK"), thick=True)
    hand(180, 9, c("INK"))
    cv.set(cx, cy, c("INK"))
    cv.set(cx - 1, cy - 1, c("GREY5"))
    micro_text(cv, cx - 4, cy - 6, 8, c("GREY6"), seed=1, gap=2, dash=(1, 2))
    cv.outline(c("WOOD2"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 24. poster.png（44x62 港台明星海报，四角卷边）
# ---------------------------------------------------------------------------

def make_poster():
    W, H = 44, 62
    cv = Cv(W, H)
    rng = random.Random(19)
    # 纸底 + 背景
    cv.rect(0, 0, W, H, c("GREY8"))
    cv.rect(2, 2, W - 4, H - 4, c("PUR2"))
    cv.vgrad(2, 2, W - 4, H - 4, [c("BLU2"), c("PUR2"), c("PUR3"), c("YEL2")])
    # 人像：头发 + 脸 + 身体
    cv.disc(22, 22, 11, c("INK"))                     # 大波浪头发
    cv.rect(11, 20, 23, 12, c("INK"))
    cv.disc(22, 24, 8, c("SKN3"))
    cv.dither(14, 26, 16, 8, c("SKN3"), c("SKN2"), ratio=0.3, only_over=True)
    # 五官
    cv.rect(18, 22, 2, 2, c("INK"))
    cv.rect(25, 22, 2, 2, c("INK"))
    cv.set(22, 26, c("SKN2"))
    cv.rect(20, 29, 5, 2, c("RED3"))
    cv.set(20, 29, c("RED4")); cv.set(24, 29, c("RED4"))
    # 头发高光
    for k in range(7):
        cv.set(15 + k, 14 + (k % 2), c("GREY4"))
    cv.set(29, 18, c("GREY4")); cv.set(30, 19, c("GREY4"))
    # 肩 / 衣服
    cv.rect(10, 34, 25, 24, c("PUR3"))
    cv.dither(10, 34, 25, 24, c("PUR3"), c("PUR2"), ratio=0.35)
    cv.hline(10, 34, 25, c("PUR4"))
    cv.vline(10, 34, 24, c("PUR4"))
    cv.rect(19, 34, 7, 8, c("SKN3"))                  # 脖颈 / 领口
    cv.dither(19, 36, 7, 6, c("SKN3"), c("SKN2"), ratio=0.4)
    cv.line(19, 34, 22, 41, c("PUR2"))
    cv.line(26, 34, 23, 41, c("PUR2"))
    # 底部一行抽象签名
    micro_text(cv, 8, 55, 26, c("YEL4"), seed=5, gap=2, dash=(2, 4))
    micro_text(cv, 12, 58, 18, c("YEL3"), seed=6, gap=2, dash=(1, 3))
    # 白边
    cv.frame(0, 0, W, H, c("GREY8"))
    cv.frame(1, 1, W - 2, H - 2, c("WHITE"))
    # 四角卷边（露出纸背 + 阴影）
    for (cxs, cys, sx, sy) in ((0, 0, 1, 1), (W - 1, 0, -1, 1), (0, H - 1, 1, -1), (W - 1, H - 1, -1, -1)):
        for k in range(5):
            for j in range(5 - k):
                x = cxs + sx * j
                y = cys + sy * k
                if j + k < 5:
                    cv.set(x, y, c("WOOD7") if (j + k) < 3 else c("GREY7"))
        cv.set(cxs + sx * 0, cys + sy * 0, c("WOOD6"))
    cv.outline(c("GREY5"), diag=True)
    return cv


# ---------------------------------------------------------------------------
# 25. slipper.png（22x12 一双塑料拖鞋，随意摆放）
# ---------------------------------------------------------------------------

SLIPPER_SOLE = (
    ".####.",
    "######",
    "######",
    "######",
    ".####.",
)


def make_slipper():
    W, H = 22, 12
    cv = Cv(W, H)

    def one(x0, y0, tilt):
        """一只塑料拖鞋：椭圆鞋底 + 人字带。tilt = 每列的 y 偏移斜率。"""
        for j, row in enumerate(SLIPPER_SOLE):
            for i, ch in enumerate(row):
                if ch == "#":
                    cv.set(x0 + i, y0 + j + int(round(i * tilt)), c("BLU3"))
        for i in range(6):
            ys = [y0 + j + int(round(i * tilt)) for j in range(5)
                  if SLIPPER_SOLE[j][i] == "#"]
            if ys:
                cv.set(x0 + i, ys[0], c("BLU4"))       # 鞋口受光
                cv.set(x0 + i, ys[-1], c("BLU2"))      # 鞋底暗边
        for i in (1, 2):                                # 人字带
            y = y0 + 1 + int(round(i * tilt))
            cv.set(x0 + i, y, c("BLU5"))
            cv.set(x0 + i, y + 1, c("BLU4"))
            cv.set(x0 + i, y + 2, c("BLU5"))
        cv.set(x0 + 4, y0 + 2 + int(round(4 * tilt)), c("BLU2"))   # 鞋窝

    one(1, 1, 0.55)        # 左脚：向右下歪
    one(13, 5, -0.45)      # 右脚：向右上歪，两只不平行
    cv.outline(c("BLU2"), diag=True)
    cv.ground_shadow(c("GREY5"), ratio=0.5)
    return cv


# 26. popsicle.png（12x24 老冰棍，包装纸撕开一半）
# ---------------------------------------------------------------------------

def make_popsicle():
    W, H = 12, 24
    cv = Cv(W, H)
    # 冰体
    cv.rect(2, 1, 8, 15, c("GREY8"))
    cv.carve_corners(2, 1, 8, 15, ROUND_CUTS[2], None)
    cv.vline(3, 2, 13, c("WHITE"))
    cv.hline(3, 2, 6, c("WHITE"))
    cv.vline(8, 2, 13, c("BLU5"))
    cv.dither(2, 9, 8, 7, c("GREY8"), c("BLU5"), ratio=0.3, only_over=True)
    cv.set(4, 5, c("WHITE")); cv.set(5, 4, c("WHITE"))
    # 木棍
    cv.rect(5, 16, 3, 7, c("WOOD6"))
    cv.vline(5, 16, 7, c("WOOD7"))
    cv.vline(7, 16, 7, c("WOOD4"))
    # 包装纸（下半截还套着，上沿撕成锯齿）
    tear = (10, 9, 11, 10, 12, 9, 11, 10)
    for i, ty in enumerate(tear):
        x = 2 + i
        for y in range(ty, 18):
            cv.set(x, y, c("WOOD7"))
        cv.set(x, ty, c("GREY8"))                # 撕口白边
    cv.hline(2, 13, 8, c("RED3"))                # 包装纸红条
    cv.hline(2, 14, 8, c("RED4"))
    cv.hline(2, 17, 8, c("WOOD6"))
    cv.vline(2, 9, 9, c("WOOD6"))
    cv.vline(9, 9, 9, c("WOOD5"))
    micro_text(cv, 3, 16, 6, c("WOOD5"), seed=2, gap=2, dash=(1, 2))
    cv.outline(c("GREY5"), diag=True)
    # 撕口处纸片翘起
    cv.set(1, 12, c("WOOD7")); cv.set(10, 13, c("WOOD6"))
    cv.ground_shadow(c("GREY5"), ratio=0.5)
    return cv


# ---------------------------------------------------------------------------
# 27. 主流程
# ---------------------------------------------------------------------------

# 文件名 -> (生成函数, 单帧尺寸, 帧数)
ASSETS = [
    ("bg_room.png",        make_bg_room,        (480, 270), 1),
    ("window.png",         make_window,         (84, 64),   1),
    ("door.png",           make_door,           (62, 140),  3),
    ("tv_cabinet.png",     make_tv_cabinet,     (244, 64),  1),
    ("lace_cloth.png",     make_lace_cloth,     (252, 22),  1),
    ("tv_crt.png",         make_tv_crt,         (176, 148), 1),
    ("tv_antenna.png",     make_tv_antenna,     (56, 34),   1),
    ("console.png",        make_console,        (84, 30),   1),
    ("controller_1p.png",  make_controller_1p,  (48, 30),   1),
    ("controller_2p.png",  make_controller_2p,  (48, 30),   1),
    ("cable.png",          make_cable,          (64, 10),   1),
    ("sofa.png",           make_sofa,           (130, 68),  1),
    ("fish_tank.png",      make_fish_tank,      (44, 38),   2),
    ("thermos.png",        make_thermos,        (22, 44),   1),
    ("shoebox.png",        make_shoebox,        (56, 34),   1),
    ("desk_small.png",     make_desk_small,     (62, 46),   1),
    ("homework_book.png",  make_homework_book,  (42, 30),   2),
    ("calendar.png",       make_calendar,       (34, 46),   1),
    ("award.png",          make_award,          (42, 30),   1),
    ("lightbulb.png",      make_lightbulb,      (18, 26),   2),
    ("clock_wall.png",     make_clock_wall,     (28, 28),   1),
    ("poster.png",         make_poster,         (44, 62),   1),
    ("slipper.png",        make_slipper,        (22, 12),   1),
    ("popsicle.png",       make_popsicle,       (12, 24),   1),
]

OUT_DIR = os.path.join("assets", "img", "room")


def check_tv_screen(path):
    """断言 tv_crt.png 的屏幕区（含 3px 圆角）透明度完全正确。"""
    img = Image.open(path).convert("RGBA")
    px = img.load()
    cuts = ROUND_CUTS[3]
    corner = set()
    for i, n in enumerate(cuts):
        for k in range(n):
            corner.add((SCREEN_X + k, SCREEN_Y + i))
            corner.add((SCREEN_X + SCREEN_W - 1 - k, SCREEN_Y + i))
            corner.add((SCREEN_X + k, SCREEN_Y + SCREEN_H - 1 - i))
            corner.add((SCREEN_X + SCREEN_W - 1 - k, SCREEN_Y + SCREEN_H - 1 - i))
    clear = 0
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            a = px[x, y][3]
            inside = (SCREEN_X <= x < SCREEN_X + SCREEN_W and
                      SCREEN_Y <= y < SCREEN_Y + SCREEN_H)
            if inside and (x, y) not in corner:
                assert a == 0, "tv_crt 屏幕区 (%d,%d) 不透明" % (x, y)
                clear += 1
            elif inside:
                assert a == 255, "tv_crt 圆角 (%d,%d) 必须不透明" % (x, y)
    expect = SCREEN_W * SCREEN_H - len(corner)
    assert clear == expect, "透明像素数 %d != %d" % (clear, expect)
    print("  [ok] tv_crt 透明屏幕区 rect = (x=%d, y=%d, w=%d, h=%d)，"
          "3px 圆角不透明，透明像素 %d 个"
          % (SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, clear))


def main():
    if not os.path.isdir("docs"):
        raise SystemExit("请在项目根目录运行：python3 tools/gen_room.py")
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    print("生成 A 组：客厅场景美术 -> %s" % OUT_DIR)
    for name, fn, size, frames in ASSETS:
        cv = fn()
        save(cv, name, OUT_DIR, size, frames)
    check_tv_screen(os.path.join(OUT_DIR, "tv_crt.png"))
    print("完成：%d 个文件，全部通过尺寸/调色板/alpha 二值化校验。" % len(ASSETS))


if __name__ == "__main__":
    main()
