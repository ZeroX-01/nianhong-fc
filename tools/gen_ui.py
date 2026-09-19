# -*- coding: utf-8 -*-
"""C3 UI 元件 + C5 标题 —— assets/img/ui/
可重复运行： python3 tools/gen_ui.py

9-slice 切边（上/下/左/右）：
  panel.png / panel_dark.png : 12 / 12 / 12 / 12   （中央 24×24 纯色可拉伸）
  btn.png                    : 0 / 0 / 6 / 6       （横向拉伸，端帽 6px）
  focus_ring.png             : 8 / 8 / 8 / 8       （仅四角 L 形）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import Canvas, P, bayer, checker, fake_text, rng_for, save, sheet  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "ui")


# ------------------------------------------------------------------ 工具
def mask_from_rows(rows, on="#"):
    return [[ch in on for ch in row] for row in rows]


def draw_mask(cv, x, y, mask, c_fill, c_edge=None, c_top=None):
    h = len(mask)
    w = len(mask[0])

    def m(i, j):
        return 0 <= i < w and 0 <= j < h and mask[j][i]

    for j in range(h):
        for i in range(w):
            if not m(i, j):
                continue
            edge = not (m(i - 1, j) and m(i + 1, j) and m(i, j - 1) and m(i, j + 1))
            c = c_fill
            if edge and c_edge:
                c = c_edge
            if c_top and not m(i, j - 1) and not edge:
                c = c_top
            cv.set(x + i, y + j, c)


def dilate(mask, r, w, h):
    out = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            for dy in range(-r, r + 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                row = out[yy]
                for dx in range(-r, r + 1):
                    xx = x + dx
                    if 0 <= xx < w:
                        row[xx] = True
    return out


# ------------------------------------------------------------------ panel（9-slice）
def make_panel(base, border, inner, noise, chamfer=3, size=48):
    """4 角为装饰固定区（12×12），边条沿拉伸轴恒定，中央 24×24 纯色"""
    cv = Canvas(size, size)
    n = size - 1
    cv.rect(0, 0, n, n, base)
    cv.frame(0, 0, n, n, border, 2)
    cv.frame(2, 2, n - 2, n - 2, inner)
    # 3px 折角：切掉四角并沿斜边补描边
    for (cx, cy, sx, sy) in ((0, 0, 1, 1), (n, 0, -1, 1), (0, n, 1, -1), (n, n, -1, -1)):
        for j in range(chamfer + 1):
            for i in range(chamfer + 1 - j):
                cv.set(cx + sx * i, cy + sy * j, None)
        # 斜边 2px 描边
        for k in range(chamfer + 1):
            i = chamfer - k
            cv.set(cx + sx * i, cy + sy * k, border)
            cv.set(cx + sx * (i + 1), cy + sy * k, border)
            cv.set(cx + sx * i, cy + sy * (k + 1), border)
        for k in range(chamfer):
            cv.set(cx + sx * (chamfer - k + 2), cy + sy * (k + 1), inner)
    # 四角装饰：内角小折线 + 极淡噪点（只在 12×12 角块内，保证拉伸不糊）
    rng = rng_for(hash(base) % 9999)
    for (ax, ay, sx, sy) in ((0, 0, 1, 1), (n, 0, -1, 1), (0, n, 1, -1), (n, n, -1, -1)):
        for k in range(4):
            cv.set(ax + sx * (5 + k), ay + sy * 4, inner)
            cv.set(ax + sx * 4, ay + sy * (5 + k), inner)
        for j in range(3, 12):
            for i in range(3, 12):
                x = ax + sx * i
                y = ay + sy * j
                if cv.alpha(x, y) == 0:
                    continue
                if cv.get(x, y)[:3] != P[base]:
                    continue
                if bayer(x, y, 0.09, 8):
                    cv.set(x, y, noise)
    return cv


def gen_panel():
    cv = make_panel("WOOD7", "WOOD2", "WOOD5", "WOOD6")
    return save(cv, os.path.join(OUT, "panel.png"), expect=(48, 48))


def gen_panel_dark():
    cv = make_panel("GREY2", "GREY5", "GREY7", "GREY3")
    return save(cv, os.path.join(OUT, "panel_dark.png"), expect=(48, 48))


# ------------------------------------------------------------------ btn（横向 9-slice）
def _btn_frame(base, top, bot, border, glow=None, shift=0, inset=False):
    cv = Canvas(52, 20)
    y0 = shift
    y1 = 19
    cv.rect(0, y0, 51, y1, base)
    cv.frame(0, y0, 51, y1, border, 2)
    if glow:
        cv.frame(0, y0, 51, y1, glow, 1)
    # 上下内缘（沿横向恒定，可横向拉伸；且必须落在 9-slice 的上/下切边内）
    if inset:
        cv.hline(2, 49, y0 + 1, bot)
        cv.hline(2, 49, y0 + 2, bot)
        cv.hline(2, 49, y1 - 2, "WOOD6")
    else:
        cv.hline(2, 49, y0 + 2, top)
        cv.hline(2, 49, y1 - 2, bot)
        cv.hline(2, 49, y1 - 3, bot)
    # 4px 切角
    n = 51
    for (cx, cy, sx, sy) in ((0, y0, 1, 1), (n, y0, -1, 1), (0, y1, 1, -1), (n, y1, -1, -1)):
        for j in range(4):
            for i in range(4 - j):
                cv.set(cx + sx * i, cy + sy * j, None)
        for k in range(4):
            i = 3 - k
            cv.set(cx + sx * i, cy + sy * k, glow if glow else border)
            cv.set(cx + sx * (i + 1), cy + sy * k, border)
    return cv


def gen_btn():
    f1 = _btn_frame("WOOD5", "WOOD6", "WOOD3", "WOOD2")
    f2 = _btn_frame("WOOD6", "WOOD7", "WOOD4", "WOOD2", glow="YEL4")
    f3 = _btn_frame("WOOD4", "WOOD5", "WOOD2", "WOOD2", shift=1, inset=True)
    return save(sheet([f1, f2, f3]), os.path.join(OUT, "btn.png"), expect=(156, 20))


# ------------------------------------------------------------------ arrow
ARROW = [
    "....##......",
    "....###.....",
    "....####....",
    "#########...",
    "##########..",
    "###########.",
    "##########..",
    "#########...",
    "....####....",
    "....###.....",
    "....##......",
]


def gen_arrow():
    frames = []
    for f in range(2):
        cv = Canvas(14, 14)
        m = mask_from_rows(ARROW)
        ox = 1 + f
        oy = 2
        # INK 描边
        dm = dilate(m, 1, len(m[0]), len(m))
        draw_mask(cv, ox - 1, oy - 1, dm, "INK")
        draw_mask(cv, ox, oy, m, "YEL4", c_edge="YEL3")
        # 1px 白高光
        cv.set(ox + 1, oy + 4, "WHITE")
        cv.set(ox + 2, oy + 4, "WHITE")
        frames.append(cv)
    return save(sheet(frames), os.path.join(OUT, "arrow.png"), expect=(28, 14))


# ------------------------------------------------------------------ heart
HEART = [
    "..##....##..",
    ".####..####.",
    ".##########.",
    "############",
    "############",
    ".##########.",
    "..########..",
    "...######...",
    "....####....",
    ".....##.....",
]


def gen_heart():
    m = mask_from_rows(HEART)
    f1 = Canvas(12, 12)
    draw_mask(f1, 0, 1, m, "RED4", c_edge="RED2")
    f1.set(2, 4, "WHITE")
    f1.set(3, 4, "WHITE")
    f1.set(2, 5, "WHITE")
    f1.set(4, 5, "RED5")
    f1.set(3, 6, "RED5")
    f2 = Canvas(12, 12)
    h = len(m)
    w = len(m[0])
    for j in range(h):
        for i in range(w):
            if not m[j][i]:
                continue
            nb = all(0 <= i + dx < w and 0 <= j + dy < h and m[j + dy][i + dx]
                     for (dx, dy) in ((-1, 0), (1, 0), (0, -1), (0, 1)))
            if not nb:
                f2.set(i, j + 1, "GREY4")
    return save(sheet([f1, f2]), os.path.join(OUT, "heart.png"), expect=(24, 12))


# ------------------------------------------------------------------ icons 12×12
def gen_icon_coin():
    cv = Canvas(12, 12)
    cv.disc(5.5, 5.5, 5.4, "YEL3")
    cv.ring(5.5, 5.5, 5.4, "INK", 1)
    # 上缘 1px 高光 / 下缘 1px 暗部（沿圆环）
    for (x, y) in ((4, 1), (5, 1), (6, 1), (2, 2), (3, 1), (1, 4), (1, 3), (2, 3)):
        if cv.alpha(x, y) > 0 and cv.get(x, y)[:3] != (0, 0, 0):
            cv.set(x, y, "YEL4")
    for (x, y) in ((4, 9), (5, 9), (6, 9), (7, 9), (8, 7), (9, 6), (9, 5), (3, 9)):
        if cv.alpha(x, y) > 0 and cv.get(x, y)[:3] != (0, 0, 0):
            cv.set(x, y, "YEL2")
    # 中央方孔（铜钱）
    cv.rect(4, 4, 7, 7, "INK")
    cv.rect(5, 5, 6, 6, "INK")
    return save(cv, os.path.join(OUT, "icon_coin.png"), expect=(12, 12))


def gen_icon_cart():
    cv = Canvas(12, 12)
    cv.rect(1, 1, 10, 11, "GREY7")
    cv.frame(1, 1, 10, 11, "INK")
    cv.hline(2, 9, 2, "GREY8")
    cv.rect(4, 1, 7, 2, "INK")           # 顶部提手凹槽
    cv.rect(3, 4, 8, 8, "GREY8")
    cv.rect(4, 5, 7, 7, "GRN3")
    cv.set(5, 6, "YEL3")
    cv.set(3, 10, "INK")
    cv.set(8, 10, "INK")
    return save(cv, os.path.join(OUT, "icon_cart.png"), expect=(12, 12))


def gen_icon_clock():
    cv = Canvas(12, 12)
    cv.disc(5.5, 5.5, 5.4, "WHITE")
    cv.ring(5.5, 5.5, 5.4, "INK", 1)
    cv.ring(5.5, 5.5, 4.4, "GREY7", 1)
    for (x, y) in ((5, 1), (5, 10), (1, 5), (10, 5), (6, 1), (6, 10), (1, 6), (10, 6)):
        cv.set(x, y, "GREY5")
    cv.vline(5, 3, 5, "INK")
    cv.hline(6, 8, 6, "INK")
    cv.set(5, 6, "INK")
    cv.set(6, 5, "RED4")
    return save(cv, os.path.join(OUT, "icon_clock.png"), expect=(12, 12))


def gen_icon_alert():
    cv = Canvas(12, 12)
    cv.tri([(5.5, 0), (0, 11), (11, 11)], "INK")
    cv.tri([(5.5, 2), (1.5, 10), (9.5, 10)], "RED4")
    cv.rect(5, 4, 6, 7, "WHITE")
    cv.rect(5, 8, 6, 9, "WHITE")
    cv.hline(1, 10, 11, "INK")
    cv.set(5, 3, "RED5")
    return save(cv, os.path.join(OUT, "icon_alert.png"), expect=(12, 12))


# ------------------------------------------------------------------ touch_dpad
def gen_touch_dpad():
    S = 104
    cv = Canvas(S, S)
    a0, a1 = 35, 68        # 十字臂范围
    mask = [[False] * S for _ in range(S)]
    for y in range(S):
        for x in range(S):
            in_h = a0 <= y <= a1
            in_v = a0 <= x <= a1
            if in_h or in_v:
                # 臂端圆角
                if in_h and not in_v:
                    if x < 3 and (y < a0 + 3 - x or y > a1 - 3 + x):
                        continue
                    if x > S - 4 and (y < a0 + 3 - (S - 1 - x) or y > a1 - 3 + (S - 1 - x)):
                        continue
                if in_v and not in_h:
                    if y < 3 and (x < a0 + 3 - y or x > a1 - 3 + y):
                        continue
                    if y > S - 4 and (x < a0 + 3 - (S - 1 - y) or x > a1 - 3 + (S - 1 - y)):
                        continue
                mask[y][x] = True
    # 半透明底（dither）
    for y in range(S):
        for x in range(S):
            if mask[y][x] and checker(x, y):
                cv.set(x, y, "GREY7")
    # 内侧凹角处的暗面（沿臂内缘 dither GREY5）
    for y in range(S):
        for x in range(S):
            if not mask[y][x]:
                continue
            d = min(abs(y - a0), abs(y - a1), abs(x - a0), abs(x - a1))
            near_edge = (a0 <= y <= a1 and a0 <= x <= a1)
            if not near_edge and d <= 2 and checker(x, y):
                cv.set(x, y, "GREY5")
    # 2px INK 描边（实心，保证边界清晰）
    dm = dilate(mask, 2, S, S)
    for y in range(S):
        for x in range(S):
            if dm[y][x] and not mask[y][x]:
                cv.set(x, y, "INK")
    # 四向三角
    def tri_at(cx, cy, d, size=11):
        pts = {
            "u": [(cx, cy - size), (cx - size, cy + 2), (cx + size, cy + 2)],
            "d": [(cx, cy + size), (cx - size, cy - 2), (cx + size, cy - 2)],
            "l": [(cx - size, cy), (cx + 2, cy - size), (cx + 2, cy + size)],
            "r": [(cx + size, cy), (cx - 2, cy - size), (cx - 2, cy + size)],
        }[d]
        cv.tri(pts, "GREY8")
        for i in range(3):
            cv.tri([(px, py) for (px, py) in pts], "GREY8")
        # 描边
        cv.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], "INK")
        cv.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], "INK")
        cv.line(pts[2][0], pts[2][1], pts[0][0], pts[0][1], "INK")

    tri_at(51, 16, "u")
    tri_at(51, 87, "d")
    tri_at(16, 51, "l")
    tri_at(87, 51, "r")
    # 中心圆形凹陷
    cv.disc(51, 51, 15, "GREY5")
    for y in range(34, 69):
        for x in range(34, 69):
            if (x - 51) ** 2 + (y - 51) ** 2 <= 15 * 15 and checker(x, y, 1):
                cv.set(x, y, "GREY6")
    cv.ring(51, 51, 15, "INK", 2)
    cv.ring(51, 51, 13, "GREY4", 1)
    for k in range(9):
        cv.set(45 + k, 45 - 0, "GREY4")
    cv.disc(51, 51, 3, "GREY4")
    return save(cv, os.path.join(OUT, "touch_dpad.png"), expect=(104, 104))


# ------------------------------------------------------------------ touch_btn
def gen_touch_btn():
    frames = []
    # 帧1：RED3 半透（dither）
    cv = Canvas(52, 52)
    for y in range(52):
        for x in range(52):
            if (x - 25.5) ** 2 + (y - 25.5) ** 2 <= 24 * 24 and checker(x, y):
                cv.set(x, y, "RED3")
    cv.ring(25.5, 25.5, 24.4, "INK", 2)
    cv.ring(25.5, 25.5, 22.4, "RED2", 1)
    # 中心留空（清掉中央供代码写字母）
    for y in range(52):
        for x in range(52):
            if (x - 25.5) ** 2 + (y - 25.5) ** 2 <= 15 * 15:
                cv.set(x, y, None)
    for y in range(52):
        for x in range(52):
            if (x - 25.5) ** 2 + (y - 25.5) ** 2 <= 15 * 15 and bayer(x, y, 0.25, 4):
                cv.set(x, y, "RED2")
    cv.ring(25.5, 25.5, 15.4, "RED1", 1)
    frames.append(cv)
    # 帧2：RED5 实心（按下）
    cv2 = Canvas(52, 52)
    cv2.disc(25.5, 25.5, 24.4, "RED5")
    cv2.ring(25.5, 25.5, 24.4, "INK", 2)
    cv2.ring(25.5, 25.5, 22.4, "RED4", 2)
    for y in range(52):
        for x in range(52):
            if (x - 25.5) ** 2 + (y - 25.5) ** 2 <= 15 * 15:
                cv2.set(x, y, "RED4")
    cv2.ring(25.5, 25.5, 15.4, "RED2", 1)
    for k in range(10):
        cv2.set(14 + k, 12 + (0 if k < 6 else 1), "RED5")
    frames.append(cv2)
    return save(sheet(frames), os.path.join(OUT, "touch_btn.png"), expect=(104, 52))


# ------------------------------------------------------------------ focus_ring
def gen_focus_ring():
    frames = []
    for f in range(2):
        cv = Canvas(24, 24)
        inset = f          # 呼吸：向内 1px
        L = 8 - 2 * f      # 折角臂长（收在 8px 切边内，保证 9-slice 拉伸区干净）
        n = 23
        for (cx, cy, sx, sy) in ((0, 0, 1, 1), (n, 0, -1, 1), (0, n, 1, -1), (n, n, -1, -1)):
            x0 = cx + sx * inset
            y0 = cy + sy * inset
            for k in range(L):
                cv.set(x0 + sx * k, y0, "YEL4")
                cv.set(x0 + sx * k, y0 + sy, "YEL4")
                cv.set(x0, y0 + sy * k, "YEL4")
                cv.set(x0 + sx, y0 + sy * k, "YEL4")
            # INK 外描边
            for k in range(L + 1):
                cv.set(x0 + sx * k, y0 - sy, "INK")
                cv.set(x0 - sx, y0 + sy * k, "INK")
            for k in range(L):
                cv.set(x0 + sx * k, y0 + sy * 2, "INK")
                cv.set(x0 + sx * 2, y0 + sy * k, "INK")
            cv.set(x0 - sx, y0 - sy, "INK")
        frames.append(cv)
    return save(sheet(frames), os.path.join(OUT, "focus_ring.png"), expect=(48, 24))


# ------------------------------------------------------------------ 标题：手工像素美术字
# 每个字在 34×42 的字格内用矩形/粗线搭笔画（r=矩形, l=粗线）
GLYPHS = {
    "小": [("r", 14, 4, 19, 38), ("r", 9, 33, 14, 38),
           ("l", 11, 13, 3, 30, 5), ("l", 22, 13, 31, 28, 5)],
    "霸": [  # 雨（去掉内横，改 4 点，减少糊成一团）
        ("r", 2, 0, 32, 3), ("r", 5, 4, 7, 16), ("r", 16, 6, 18, 16), ("r", 28, 4, 30, 16),
        ("r", 9, 7, 11, 9), ("r", 22, 7, 24, 9), ("r", 9, 12, 11, 14), ("r", 22, 12, 24, 14),
        # 革（拉开笔画间距，别糊成一团）
        ("r", 2, 18, 14, 20), ("r", 6, 18, 9, 41), ("r", 0, 24, 15, 26),
        ("r", 2, 29, 13, 31), ("r", 2, 31, 4, 36), ("r", 11, 31, 13, 36), ("r", 2, 35, 13, 37),
        ("r", 0, 39, 15, 41),
        # 月
        ("r", 18, 18, 33, 20), ("r", 18, 18, 20, 41), ("r", 31, 18, 33, 39),
        ("r", 18, 27, 33, 29), ("r", 18, 35, 31, 37), ("r", 21, 39, 31, 41),
    ],
    "王": [("r", 5, 5, 29, 10), ("r", 9, 20, 25, 24), ("r", 1, 33, 33, 38), ("r", 13, 5, 20, 38)],
    "的": [  # 白
        ("l", 8, 1, 4, 7, 3), ("r", 0, 8, 15, 11), ("r", 0, 8, 3, 39), ("r", 12, 8, 15, 39),
        ("r", 0, 21, 15, 24), ("r", 0, 36, 15, 39),
        # 勺
        ("l", 27, 1, 21, 13, 4), ("r", 19, 14, 33, 17), ("r", 30, 14, 33, 39),
        ("r", 21, 36, 33, 39), ("r", 23, 24, 28, 29),
    ],
    "夏": [("r", 2, 0, 32, 3),
           # 自（上部方框 + 2 道内横）
           ("r", 8, 6, 26, 9), ("r", 8, 6, 11, 26), ("r", 23, 6, 26, 26),
           ("r", 11, 13, 23, 15), ("r", 11, 19, 23, 21), ("r", 8, 24, 26, 26),
           # 夂：短横撇 + 长撇 + 捺（去掉横长条，别写成「真」）
           ("l", 6, 29, 15, 31, 3),
           ("l", 25, 28, 6, 41, 4), ("l", 13, 32, 30, 41, 4)],
    "天": [("r", 5, 4, 29, 9), ("r", 1, 16, 33, 21),
           ("l", 18, 21, 3, 40, 5), ("l", 18, 21, 32, 40, 5)],
}
TITLE = "那年的红白机"
LIFT = [5, 3, 1, -1, -3, -5]
GW, GH = 34, 42
GSTEP = 44
GX0 = 33
GY0 = 20


def _glyph_mask(name, gw=38, gh=40):
    m = [[False] * gw for _ in range(gh)]

    def put(x, y):
        if 0 <= x < gw and 0 <= y < gh:
            m[y][x] = True

    for prim in GLYPHS[name]:
        if prim[0] == "r":
            _, x0, y0, x1, y1 = prim
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    put(x, y)
        else:
            _, x0, y0, x1, y1, w = prim
            dx, dy = abs(x1 - x0), abs(y1 - y0)
            sx = 1 if x0 < x1 else -1
            sy = 1 if y0 < y1 else -1
            err = dx - dy
            x, y = x0, y0
            half = w // 2
            while True:
                for oy in range(-half, w - half):
                    for ox in range(-half, w - half):
                        put(x + ox, y + oy)
                if x == x1 and y == y1:
                    break
                e2 = 2 * err
                if e2 > -dy:
                    err -= dy
                    x += sx
                if e2 < dx:
                    err += dx
                    y += sy
    return m


def mini_cart(cv, x, y):
    """标题左侧装饰：一张卡带"""
    cv.rect(x, y, x + 21, y + 29, "GREY7")
    cv.frame(x, y, x + 21, y + 29, "INK")
    cv.hline(x + 1, x + 20, y + 1, "GREY8")
    cv.rect(x + 6, y, x + 15, y + 2, "INK")
    cv.rect(x + 3, y + 6, x + 18, y + 19, "GREY8")
    cv.rect(x + 4, y + 7, x + 17, y + 18, "RED3")
    cv.rect(x + 6, y + 10, x + 15, y + 15, "YEL3")
    cv.set(x + 8, y + 12, "INK")
    cv.set(x + 13, y + 12, "INK")
    cv.hline(x + 3, x + 18, y + 23, "GREY5")
    cv.set(x + 5, y + 26, "INK")
    cv.set(x + 16, y + 26, "INK")
    cv.hline(x, x + 21, y + 30, "GREY3")


def mini_pad(cv, x, y):
    """标题右侧装饰：一个手柄"""
    cv.rect(x, y, x + 29, y + 17, "GREY7")
    cv.rect(x, y + 9, x + 29, y + 17, "RED3")
    cv.frame(x, y, x + 29, y + 17, "INK")
    cv.hline(x + 1, x + 28, y + 1, "GREY8")
    # 十字键
    cv.rect(x + 4, y + 6, x + 10, y + 8, "INK")
    cv.rect(x + 6, y + 4, x + 8, y + 10, "INK")
    # A/B
    cv.disc(x + 21, y + 7, 2, "RED4")
    cv.disc(x + 26, y + 7, 2, "RED4")
    cv.ring(x + 21, y + 7, 2, "GREY3")
    cv.ring(x + 26, y + 7, 2, "GREY3")
    # select/start
    cv.rect(x + 13, y + 12, x + 17, y + 13, "GREY5")
    cv.rect(x + 19, y + 12, x + 23, y + 13, "GREY5")
    cv.hline(x, x + 29, y + 18, "GREY3")
    # 线
    cv.line(x + 2, y, x - 4, y - 6, "INK", 2)


def gen_title_logo():
    W, H = 320, 96
    cv = Canvas(W, H)
    gw, gh = GW, GH
    mask = [[False] * W for _ in range(H)]
    for i, ch in enumerate(TITLE):
        gm = _glyph_mask(ch, gw, gh)
        ox = GX0 + i * GSTEP
        oy = GY0 + LIFT[i]
        for y in range(gh):
            for x in range(gw):
                if gm[y][x] and 0 <= ox + x < W and 0 <= oy + y < H:
                    mask[oy + y][ox + x] = True

    sil = dilate(mask, 3, W, H)          # 3px 描边轮廓
    # 1) 右下 2px 投影
    for y in range(H):
        for x in range(W):
            if sil[y][x]:
                cv.set(x + 2, y + 2, "RED1")
    # 2) INK 描边
    for y in range(H):
        for x in range(W):
            if sil[y][x]:
                cv.set(x, y, "INK")
    # 3) 字身：红为主、笔画顶端 1~2px 黄高光、底端压暗，做出厚度
    for y in range(H):
        for x in range(W):
            if not mask[y][x]:
                continue
            up = 0
            while y - up - 1 >= 0 and mask[y - up - 1][x]:
                up += 1
                if up > 8:
                    break
            dn = 0
            while y + dn + 1 < H and mask[y + dn + 1][x]:
                dn += 1
                if dn > 8:
                    break
            th = up + dn + 1
            if up == 0:
                c = "YEL4"
            elif up == 1 and th >= 4:
                c = "YEL3"
            elif up == 2 and th >= 7:
                c = "YEL3"
            elif dn == 0 and th >= 3:
                c = "RED1"
            elif dn == 1 and th >= 5:
                c = "RED2"
            else:
                c = "RED3"
            # 左缘提亮 / 右缘压暗（横向厚度感）
            if c == "RED3":
                if x > 0 and not mask[y][x - 1]:
                    c = "RED4"
                elif x + 1 < W and not mask[y][x + 1]:
                    c = "RED2"
            cv.set(x, y, c)
    # 4) 副标题：1px 抽象小字纹（带 1px INK 阴影）
    rng = rng_for(1990)
    sub_y = 79
    n = 11
    cwid, gap = 8, 5
    total = n * cwid + (n - 1) * gap
    sx = (W - total) // 2
    tmp = Canvas(W, H)
    from pxlib import fake_glyph
    for i in range(n):
        fake_glyph(tmp, sx + i * (cwid + gap), sub_y, cwid, 9, "YEL4", rng, weight=1)
    for y in range(H):
        for x in range(W):
            if tmp.alpha(x, y) > 0:
                cv.set(x + 1, y + 1, "INK")
    for y in range(H):
        for x in range(W):
            if tmp.alpha(x, y) > 0:
                cv.set(x, y, "YEL4")
    # 5) 左右装饰
    mini_cart(cv, 2, 56)
    mini_pad(cv, 290, 66)
    # 6) 副标题两侧小横线
    cv.hline(30, sx - 8, sub_y + 4, "YEL2")
    cv.hline(sx + total + 8, 288, sub_y + 4, "YEL2")
    return save(cv, os.path.join(OUT, "title_logo.png"), expect=(320, 96))


def gen_title_sub():
    cv = Canvas(220, 20)
    # INK 半透底（dither 表现半透，保持 alpha 二值）
    for y in range(1, 19):
        for x in range(1, 219):
            if checker(x, y):
                cv.set(x, y, "INK")
    cv.frame(0, 0, 219, 19, "YEL4")
    # 四角内缩一点，避免死板
    for (cx, cy, sx, sy) in ((0, 0, 1, 1), (219, 0, -1, 1), (0, 19, 1, -1), (219, 19, -1, -1)):
        cv.set(cx, cy, None)
        cv.set(cx + sx, cy, "YEL4")
        cv.set(cx, cy + sy, "YEL4")
    return save(cv, os.path.join(OUT, "title_sub.png"), expect=(220, 20))


def main():
    os.makedirs(OUT, exist_ok=True)
    print("C3 UI 元件 / C5 标题 -> assets/img/ui/")
    gen_panel()
    gen_panel_dark()
    gen_btn()
    gen_arrow()
    gen_heart()
    gen_icon_coin()
    gen_icon_cart()
    gen_icon_clock()
    gen_icon_alert()
    gen_touch_dpad()
    gen_touch_btn()
    gen_focus_ring()
    gen_title_logo()
    gen_title_sub()


if __name__ == "__main__":
    main()
