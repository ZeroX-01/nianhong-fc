# -*- coding: utf-8 -*-
"""《那年的红白机》像素美术公共库 —— C 组生产用。

- 严格 44 色调色板
- 无抗锯齿：所有绘制均为整像素矩形/逐像素判定
- 保存时统一 alpha 二值化（CRT 层例外，需要精确 alpha）
- 保存前断言：不存在调色板外颜色
"""
import os
import random

from PIL import Image

# ---------------------------------------------------------------- 调色板
_PAL_HEX = {
    # 黑白灰阶
    "INK": "#000000", "GREY1": "#14141c", "GREY2": "#24242f", "GREY3": "#383845",
    "GREY4": "#4f4f60", "GREY5": "#6d6d80", "GREY6": "#92929f", "GREY7": "#b8b8c2",
    "GREY8": "#dcdce2", "WHITE": "#ffffff",
    # 木头 / 家具 / 纸箱
    "WOOD1": "#2a1a10", "WOOD2": "#46291a", "WOOD3": "#63402a", "WOOD4": "#85583a",
    "WOOD5": "#a8764c", "WOOD6": "#c99a6a", "WOOD7": "#e6c49a",
    # 小旋风红
    "RED1": "#4a0c12", "RED2": "#7a161c", "RED3": "#ad2229", "RED4": "#d93a34",
    "RED5": "#f2705a",
    # 绿
    "GRN1": "#102c1c", "GRN2": "#1d5230", "GRN3": "#2f7d42", "GRN4": "#55ab52",
    "GRN5": "#8fd15c",
    # 蓝青
    "BLU1": "#0c1832", "BLU2": "#17346b", "BLU3": "#2a61ad", "BLU4": "#4a9bd1",
    "BLU5": "#93d4ea",
    # 黄橙
    "YEL1": "#5c3f0e", "YEL2": "#a87a18", "YEL3": "#e0b422", "YEL4": "#f5db6e",
    # 紫红
    "PUR1": "#32163f", "PUR2": "#6b2469", "PUR3": "#ad4287", "PUR4": "#e07db4",
    # 皮肤
    "SKN1": "#8f5a3c", "SKN2": "#c98a5f", "SKN3": "#e8be93", "SKN4": "#f7dcbe",
}


def _hex2rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


P = {k: _hex2rgb(v) for k, v in _PAL_HEX.items()}
PAL_SET = set(P.values())


def col(c):
    """名字或 RGB 元组 -> RGB 元组"""
    if isinstance(c, str):
        return P[c]
    if len(c) == 4:
        return c[:3]
    return tuple(c)


# ---------------------------------------------------------------- 抖动图案
BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]
BAYER8 = None


def _build_bayer8():
    """标准递归 Bayer 矩阵：B2n = [[4B, 4B+2], [4B+3, 4B+1]]"""
    global BAYER8
    b = [[0]]
    while len(b) < 8:
        n = len(b)
        nb = [[0] * (n * 2) for _ in range(n * 2)]
        for y in range(n):
            for x in range(n):
                v = b[y][x] * 4
                nb[y][x] = v
                nb[y][x + n] = v + 2
                nb[y + n][x] = v + 3
                nb[y + n][x + n] = v + 1
        b = nb
    BAYER8 = b


_build_bayer8()


def bayer(x, y, level, n=4):
    """level 0..1 -> bool（是否点亮）。有序抖动，无插值。"""
    m = BAYER4 if n == 4 else BAYER8
    size = n * n
    t = (m[y % n][x % n] + 0.5) / size
    return level > t


def checker(x, y, phase=0):
    return (x + y + phase) % 2 == 0


# ---------------------------------------------------------------- 画布
class Canvas(object):
    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.img.load()
        if bg is not None:
            self.rect(0, 0, w - 1, h - 1, bg)

    # ---- 基础
    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, c, a=255):
        x = int(x); y = int(y)
        if not self.inb(x, y):
            return
        if c is None or a <= 0:
            self.px[x, y] = (0, 0, 0, 0)
            return
        r, g, b = col(c)
        self.px[x, y] = (r, g, b, int(a))

    def get(self, x, y):
        x = int(x); y = int(y)
        if not self.inb(x, y):
            return (0, 0, 0, 0)
        return self.px[x, y]

    def alpha(self, x, y):
        return self.get(x, y)[3]

    def clear(self, x0, y0, x1, y1):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, None)

    # ---- 图元（坐标包含端点）
    def rect(self, x0, y0, x1, y1, c, a=255):
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, c, a)

    def frame(self, x0, y0, x1, y1, c, t=1, a=255):
        for i in range(t):
            self.hline(x0 + i, x1 - i, y0 + i, c, a)
            self.hline(x0 + i, x1 - i, y1 - i, c, a)
            self.vline(x0 + i, y0 + i, y1 - i, c, a)
            self.vline(x1 - i, y0 + i, y1 - i, c, a)

    def hline(self, x0, x1, y, c, a=255):
        if x1 < x0:
            x0, x1 = x1, x0
        for x in range(int(x0), int(x1) + 1):
            self.set(x, y, c, a)

    def vline(self, x, y0, y1, c, a=255):
        if y1 < y0:
            y0, y1 = y1, y0
        for y in range(int(y0), int(y1) + 1):
            self.set(x, y, c, a)

    def line(self, x0, y0, x1, y1, c, w=1, a=255):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        half = w // 2
        while True:
            for oy in range(-half, w - half):
                for ox in range(-half, w - half):
                    self.set(x0 + ox, y0 + oy, c, a)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def disc(self, cx, cy, r, c, a=255):
        r2 = r * r
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    self.set(x, y, c, a)

    def ring(self, cx, cy, r, c, t=1, a=255):
        ro2 = r * r
        ri2 = (r - t) * (r - t)
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                d = (x - cx) ** 2 + (y - cy) ** 2
                if ri2 < d <= ro2:
                    self.set(x, y, c, a)

    def ellipse(self, cx, cy, rx, ry, c, a=255):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if rx <= 0 or ry <= 0:
                    continue
                if ((x - cx) / float(rx)) ** 2 + ((y - cy) / float(ry)) ** 2 <= 1.0:
                    self.set(x, y, c, a)

    def tri(self, pts, c, a=255):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        (x1, y1), (x2, y2), (x3, y3) = pts
        den = float((y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3))
        if den == 0:
            return
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / den
                l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / den
                l3 = 1 - l1 - l2
                if l1 >= -0.001 and l2 >= -0.001 and l3 >= -0.001:
                    self.set(x, y, c, a)

    # ---- dither 填充
    def dither_rect(self, x0, y0, x1, y1, c1, c2, level=0.5, n=4):
        """c1/c2 两色有序抖动。level 为 c2 的占比。"""
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, c2 if bayer(x, y, level, n) else c1)

    def speckle(self, x0, y0, x1, y1, c, prob, rng, only_over=None):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                if rng.random() < prob:
                    if only_over is not None and self.get(x, y)[:3] not in only_over:
                        continue
                    self.set(x, y, c)

    # ---- 组合
    def paste(self, other, x, y):
        src = other.img if isinstance(other, Canvas) else other
        self.img.alpha_composite(src, (int(x), int(y)))
        self.px = self.img.load()

    def blit_opaque(self, other, x, y):
        """只拷贝不透明像素（保留源 alpha 值，不做混合）"""
        src = other.img if isinstance(other, Canvas) else other
        sp = src.load()
        for j in range(src.size[1]):
            for i in range(src.size[0]):
                p = sp[i, j]
                if p[3] > 0:
                    tx, ty = int(x) + i, int(y) + j
                    if self.inb(tx, ty):
                        self.px[tx, ty] = p


# ---------------------------------------------------------------- 抽象字纹
def fake_glyph(cv, x, y, w, h, c, rng, weight=1):
    """一个抽象汉字纹：偏旁 + 主体，结构随机（横/竖/框/撇捺/点），看起来像字而不是井字格"""
    t = weight

    def H(x0, x1, yy):
        for k in range(t):
            cv.hline(x0, x1, yy + k, c)

    def V(xx, y0, y1):
        for k in range(t):
            cv.vline(xx + k, y0, y1, c)

    def D(x0, y0, x1, y1):
        cv.line(x0, y0, x1, y1, c, t)

    x1 = x + w - 1
    y1 = y + h - 1
    layout = rng.choice(["lr", "lr", "tb", "whole", "whole", "encl"])

    def part(px0, px1, py0, py1, kind=None):
        pw = px1 - px0
        ph = py1 - py0
        if pw < 2 or ph < 2:
            return
        kind = kind or rng.choice(["bars", "bars", "box", "cross", "dots", "man", "roof"])
        if kind == "bars":
            n = rng.randint(2, 3) if ph >= 6 else 2
            for i in range(n):
                yy = py0 + int(round(i * ph / float(max(1, n - 1))))
                H(px0 + rng.randint(0, 1), px1 - rng.randint(0, 1), min(yy, py1 - t + 1))
            V(px0 + pw // 2, py0, py1)
        elif kind == "box":
            H(px0, px1, py0)
            H(px0, px1, py1 - t + 1)
            V(px0, py0, py1)
            V(px1 - t + 1, py0, py1)
            if ph >= 7:
                H(px0, px1, py0 + ph // 2)
        elif kind == "cross":
            H(px0, px1, py0 + max(1, ph // 3))
            V(px0 + pw // 2, py0, py1)
            if ph >= 7 and rng.random() < 0.6:
                D(px0 + pw // 2, py0 + ph // 2, px0, py1)
                D(px0 + pw // 2, py0 + ph // 2, px1, py1)
        elif kind == "dots":
            for i in range(3):
                yy = py0 + i * max(2, ph // 3)
                if yy <= py1:
                    H(px0, px0 + max(1, pw // 2), yy)
            V(px1 - t + 1, py0, py1)
        elif kind == "man":
            D(px0 + pw // 2, py0, px0, py1)
            D(px0 + pw // 2, py0, px1, py1)
            if rng.random() < 0.6:
                H(px0 + 1, px1 - 1, py0 + max(1, ph // 3))
        else:  # roof
            H(px0, px1, py0)
            D(px0 + pw // 2, py0 + 1, px0, py1)
            D(px0 + pw // 2, py0 + 1, px1, py1)
            if ph >= 7:
                H(px0 + 1, px1 - 1, py0 + ph // 2)

    if layout == "lr":
        cut = x + max(2, int(w * rng.choice([0.34, 0.4, 0.45])))
        part(x, cut - 2, y, y1, rng.choice(["dots", "bars", "cross"]))
        part(cut, x1, y, y1)
    elif layout == "tb":
        cut = y + max(2, int(h * rng.choice([0.34, 0.42])))
        part(x, x1, y, cut - 2, rng.choice(["roof", "bars"]))
        part(x, x1, cut, y1)
    elif layout == "encl":
        H(x, x1, y)
        V(x, y, y1)
        V(x1 - t + 1, y, y1)
        if rng.random() < 0.5:
            H(x, x1, y1 - t + 1)
        part(x + 2 + t, x1 - 2 - t, y + 2 + t, y1 - 2 - t, rng.choice(["bars", "cross", "man"]))
    else:
        part(x, x1, y, y1)


def fake_text(cv, x, y, w, h, c, rng, gap=2, weight=1, chars=None):
    """一行抽象字纹，返回实际宽度"""
    cw = h
    n = chars if chars else max(1, (w + gap) // (cw + gap))
    for i in range(n):
        fake_glyph(cv, x + i * (cw + gap), y, cw, h, c, rng, weight)
    return n * (cw + gap) - gap


# ---------------------------------------------------------------- 输出
def binarize_alpha(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 128:
                px[x, y] = (r, g, b, 255)
            else:
                px[x, y] = (0, 0, 0, 0)
    return img


def assert_palette(img, name="", allow_alpha=False):
    px = img.load()
    w, h = img.size
    bad = {}
    alphas = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            alphas.add(a)
            if (r, g, b) not in PAL_SET:
                bad[(r, g, b)] = bad.get((r, g, b), 0) + 1
    if bad:
        top = sorted(bad.items(), key=lambda kv: -kv[1])[:6]
        raise AssertionError("%s 存在板外颜色: %s" % (name, ["#%02x%02x%02x x%d" % (c[0], c[1], c[2], n) for c, n in top]))
    if not allow_alpha:
        extra = alphas - {255}
        if extra:
            raise AssertionError("%s 存在半透明像素 alpha=%s" % (name, sorted(extra)))
    return sorted(alphas)


def save(img, path, allow_alpha=False, expect=None):
    if isinstance(img, Canvas):
        img = img.img
    if not allow_alpha:
        binarize_alpha(img)
    name = os.path.basename(path)
    if expect is not None and tuple(img.size) != tuple(expect):
        raise AssertionError("%s 尺寸错误 %s != %s" % (name, img.size, expect))
    alphas = assert_palette(img, name, allow_alpha)
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    img.save(path)
    extra = ""
    if allow_alpha and len(alphas) <= 8:
        extra = "  alpha=%s" % (alphas,)
    print("  [ok] %-18s %3dx%-3d%s" % (name, img.size[0], img.size[1], extra))
    return img


def sheet(frames):
    """横向拼 sprite sheet"""
    w = frames[0].img.size[0] if isinstance(frames[0], Canvas) else frames[0].size[0]
    h = frames[0].img.size[1] if isinstance(frames[0], Canvas) else frames[0].size[1]
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        src = f.img if isinstance(f, Canvas) else f
        assert src.size == (w, h), "帧尺寸不一致"
        out.paste(src, (i * w, 0))
    return out


def scale(img, k):
    if isinstance(img, Canvas):
        img = img.img
    return img.resize((img.size[0] * k, img.size[1] * k), Image.NEAREST)


def rng_for(seed):
    return random.Random(seed)
