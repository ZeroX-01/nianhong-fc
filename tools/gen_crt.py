# -*- coding: utf-8 -*-
"""C4 CRT 特效 —— assets/img/crt/
可重复运行： python3 tools/gen_crt.py

叠加顺序（供代码参考，自下而上）：
  游戏画面 -> aperture(平铺,a26) -> scanline(平铺,a70/28) -> vignette(a<=150/角255) -> glass(a<=55)
花屏/雪花/白闪为替换或临时叠加层。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import Canvas, P, bayer, rng_for, save, sheet  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "crt")
W, H = 360, 270


def q_dither(x, y, target, step):
    """把目标 alpha 量化成 step 的整数倍台阶，台阶之间用 bayer 抖动（不产生平滑渐变）"""
    if target <= 0:
        return 0
    lv = target / float(step)
    i = int(lv)
    f = lv - i
    a = step * (i + 1) if bayer(x, y, f, 4) else step * i
    return max(0, min(255, int(a)))


# ------------------------------------------------------------------ scanline
def gen_scanline():
    cv = Canvas(4, 4)
    cv.hline(0, 3, 0, "INK", 70)
    cv.hline(0, 3, 1, "INK", 28)
    return save(cv, os.path.join(OUT, "scanline.png"), allow_alpha=True, expect=(4, 4))


# ------------------------------------------------------------------ aperture
def gen_aperture():
    cv = Canvas(3, 3)
    # 荫罩栅格：三列 R/G/B（取调色板中最饱和的三原色 RED4/GRN4/BLU4），alpha=26
    for y in range(3):
        cv.set(0, y, "RED4", 26)
        cv.set(1, y, "GRN4", 26)
        cv.set(2, y, "BLU4", 26)
    return save(cv, os.path.join(OUT, "aperture.png"), allow_alpha=True, expect=(3, 3))


# ------------------------------------------------------------------ vignette
def gen_vignette():
    cv = Canvas(W, H)
    cx, cy = (W - 1) / 2.0, (H - 1) / 2.0
    R = 22            # CRT 圆角半径
    STEP = 15         # alpha 台阶（0,15,...,150 ... 255）
    p = 3.2
    for y in range(H):
        ny = abs(y - cy) / cy
        for x in range(W):
            nx = abs(x - cx) / cx
            r = (nx ** p + ny ** p) ** (1.0 / p)
            t = (r - 0.58) / 0.42
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            target = 150.0 * (t ** 1.7)
            # 圆角：四角圆外纯黑
            ccx = R if x < R else (W - 1 - R if x > W - 1 - R else x)
            ccy = R if y < R else (H - 1 - R if y > H - 1 - R else y)
            d = ((x - ccx) ** 2 + (y - ccy) ** 2) ** 0.5
            if d > R:
                cv.set(x, y, "INK", 255)
                continue
            if d > R - 9:
                ct = (d - (R - 9)) / 9.0
                target = max(target, 150.0 + 105.0 * ct)
            a = q_dither(x, y, target, STEP)
            if a > 0:
                cv.set(x, y, "INK", a)
    # 屏幕最外一圈：1px 深边（管子边缘遮挡）
    for x in range(W):
        for yy in (0, H - 1):
            if cv.alpha(x, yy) < 200:
                cv.set(x, yy, "INK", 200)
    for y in range(H):
        for xx in (0, W - 1):
            if cv.alpha(xx, y) < 200:
                cv.set(xx, y, "INK", 200)
    return save(cv, os.path.join(OUT, "vignette.png"), allow_alpha=True, expect=(W, H))


# ------------------------------------------------------------------ glass
def gen_glass():
    cv = Canvas(W, H)
    rng = rng_for(4040)
    # 1) 左上 -> 中部的宽斜光带（alpha<=40）
    for y in range(H):
        for x in range(W):
            u = (x * 0.62 + y * 0.78)          # 斜向坐标
            best = 0.0
            for (c0, half, peak) in ((78.0, 34.0, 40.0), (150.0, 12.0, 24.0)):
                d = abs(u - c0) / half
                if d < 1.0:
                    v = peak * (1.0 - d * d)
                    # 只保留左上到中部（沿光带方向衰减）
                    fade = 1.0 - max(0.0, (x + y) / 340.0 - 0.55)
                    fade = max(0.0, min(1.0, fade))
                    v *= fade
                    if v > best:
                        best = v
            a = q_dither(x, y, best, 8)
            if a > 0:
                cv.set(x, y, "WHITE", min(40, a))
    # 2) 上边缘弧形高光（alpha<=55）
    for x in range(W):
        base = 5.0 + 13.0 * (((x - (W - 1) / 2.0) / ((W - 1) / 2.0)) ** 2)
        for k in range(0, 7):
            y = int(round(base + k))
            t = 1.0 - k / 7.0
            a = q_dither(x, y, 55.0 * t, 11)
            if a > 0 and cv.alpha(x, y) < a:
                cv.set(x, y, "WHITE", min(55, a))
    # 3) 右下角灰尘 / 指纹污渍（GREY7, alpha<=30）
    for (bx, by, brx, bry) in ((296, 214, 30, 16), (318, 238, 18, 9), (272, 236, 12, 7)):
        for y in range(by - bry, by + bry + 1):
            for x in range(bx - brx, bx + brx + 1):
                if not (0 <= x < W and 0 <= y < H):
                    continue
                d = ((x - bx) / float(brx)) ** 2 + ((y - by) / float(bry)) ** 2
                if d <= 1.0:
                    a = q_dither(x, y, 30.0 * (1.0 - d) * (0.6 + 0.4 * rng.random()), 10)
                    if a > 0 and cv.alpha(x, y) == 0:
                        cv.set(x, y, "GREY7", min(30, a))
    # 指纹螺纹
    for k in range(4):
        rr = 5 + k * 4
        for a_ in range(0, 360, 6):
            import math
            x = int(round(300 + math.cos(math.radians(a_)) * rr * 1.5))
            y = int(round(216 + math.sin(math.radians(a_)) * rr))
            if 0 <= x < W and 0 <= y < H and bayer(x, y, 0.5, 4):
                cv.set(x, y, "GREY7", 30)
    return save(cv, os.path.join(OUT, "glass.png"), allow_alpha=True, expect=(W, H))


# ------------------------------------------------------------------ snow
def gen_snow():
    frames = []
    cols = ["INK", "GREY4", "GREY7", "WHITE"]
    for f in range(4):
        rng = rng_for(9000 + f * 137)
        cv = Canvas(W, H)
        for by in range(0, H, 2):
            for bx in range(0, W, 2):
                if rng.random() < 0.45:
                    c = cols[rng.randrange(4)]
                    cv.rect(bx, by, bx + 1, by + 1, c)
        frames.append(cv)
    return save(sheet(frames), os.path.join(OUT, "snow.png"), expect=(W * 4, H))


# ------------------------------------------------------------------ glitch（核心）
GCOLS = ["INK", "RED4", "GRN4", "BLU4", "YEL3", "PUR3", "WHITE"]
GIDX = {n: i for i, n in enumerate(GCOLS)}


def _row_template(rng, dark_bias=0.0):
    """一条带的行模板：以 8px 块为单位、带周期性重复的脏彩条（NES 花屏的关键是"重复的坏 tile"）"""
    period_blocks = rng.choice([1, 2, 2, 3, 4, 4, 6, 8])
    pat = []
    for _ in range(period_blocks):
        if rng.random() < 0.18 + dark_bias:
            pat.append(GIDX["INK"])
        else:
            pat.append(GIDX[rng.choice(["RED4", "GRN4", "BLU4", "YEL3", "PUR3", "WHITE",
                                        "RED4", "BLU4", "YEL3", "INK"])])
    row = []
    bi = 0
    while len(row) < W + 96:
        idx = pat[bi % period_blocks]
        bw = 8
        # 少量块被拉宽/压窄，制造不整齐
        if rng.random() < 0.12:
            bw = rng.choice([4, 12, 16])
        row.extend([idx] * bw)
        bi += 1
    return row


def _garbage_block(rng):
    """8×8 伪字符块（乱码）"""
    fg = GIDX[rng.choice(["WHITE", "YEL3", "GRN4", "BLU4", "RED4", "PUR3"])]
    bg = GIDX[rng.choice(["INK", "INK", "INK", "BLU4", "PUR3", "RED4"])]
    dens = 0.25 + rng.random() * 0.4
    blk = [[bg] * 8 for _ in range(8)]
    for y in range(1, 7):
        for x in range(1, 7):
            if rng.random() < dens:
                blk[y][x] = fg
    # 少量块画成"半个字符"的横竖笔画，更像字符 ROM 的碎片
    if rng.random() < 0.45:
        yy = rng.randrange(1, 7)
        for x in range(1, 7):
            blk[yy][x] = fg
    if rng.random() < 0.35:
        xx = rng.randrange(1, 7)
        for y in range(1, 7):
            blk[y][xx] = fg
    return blk


def _glitch_frame(seed):
    rng = rng_for(seed)
    grid = [[GIDX["INK"]] * W for _ in range(H)]
    # 本帧的"坏字符"池：同一批 tile 反复出现，才像 ROM/字符表被读错
    pool = [_garbage_block(rng) for _ in range(9)]
    y = 0
    prev_rows = None
    bands = []
    while y < H:
        modes = (["tile"] * 8) + (["solid"] * 3) + (["garbage"] * 4) + (["drop"] * 3) + (["smear"] * 2)
        mode = rng.choice(modes)
        if mode == "garbage":
            h = 8 * rng.randint(2, 3)
        else:
            h = rng.randint(4, 14)
        h = min(h, H - y)
        bands.append((y, h, mode))
        y += h

    for (by, bh, mode) in bands:
        if mode == "tile":
            tpl = _row_template(rng)
            off = rng.randrange(0, 96)
            jit_amp = rng.choice([0, 0, 1, 2, 4, 8])
            for j in range(bh):
                o = off + rng.randint(-jit_amp, jit_amp)
                o %= 96
                row = tpl[o:o + W]
                grid[by + j] = list(row)
            prev_rows = [list(grid[by + j]) for j in range(bh)]
        elif mode == "solid":
            pick = ["RED4", "GRN4", "BLU4", "YEL3", "PUR3", "INK", "INK"]
            if bh <= 5:
                pick.append("WHITE")     # 大块纯白会显得"干净"，只允许细条
            c = GIDX[rng.choice(pick)]
            c2 = GIDX[rng.choice(["INK", "WHITE", "RED4", "BLU4"])]
            for j in range(bh):
                grid[by + j] = [c] * W
            # 插入几块异色方块
            for _ in range(rng.randint(1, 5)):
                x0 = rng.randrange(0, W - 8)
                w = 8 * rng.randint(1, 5)
                for j in range(rng.randint(1, bh)):
                    for x in range(x0, min(W, x0 + w)):
                        grid[by + j][x] = c2
            prev_rows = [list(grid[by + j]) for j in range(bh)]
        elif mode == "garbage":
            # 底色：暗块或彩条
            base = _row_template(rng, dark_bias=0.5)
            off = rng.randrange(0, 96)
            for j in range(bh):
                grid[by + j] = list(base[off:off + W])
            # 乱码区（成块，不铺满）
            for _ in range(rng.randint(1, 3)):
                bx = 8 * rng.randrange(0, W // 8 - 4)
                bw = 8 * rng.randint(3, 16)
                for gy in range(0, bh - 7, 8):
                    for gx in range(bx, min(W - 7, bx + bw), 8):
                        blk = pool[rng.randrange(len(pool))] if rng.random() < 0.72 else _garbage_block(rng)
                        for j in range(8):
                            row = grid[by + gy + j]
                            for i in range(8):
                                row[gx + i] = blk[j][i]
            prev_rows = [list(grid[by + j]) for j in range(bh)]
        elif mode == "drop":
            for j in range(bh):
                grid[by + j] = [GIDX["INK"]] * W
            if rng.random() < 0.6:      # 失同步的一条亮线
                yy = by + rng.randrange(0, bh)
                c = GIDX[rng.choice(["WHITE", "GREY" if False else "YEL3"])]
                x0 = rng.randrange(0, W // 2)
                for x in range(x0, min(W, x0 + rng.randint(40, W))):
                    grid[yy][x] = c
            prev_rows = [list(grid[by + j]) for j in range(bh)]
        else:  # smear：重复上一条带的内容并整体偏移（竖向拖影）
            if prev_rows is None:
                prev_rows = [[GIDX["BLU4"]] * W]
            off = rng.randint(-40, 40)
            for j in range(bh):
                src = prev_rows[j % len(prev_rows)]
                grid[by + j] = [src[(x - off) % W] for x in range(W)]

    # ---- 2~3 条竖向撕裂线（右侧整块横移）
    for _ in range(rng.randint(2, 3)):
        tx = rng.randrange(40, W - 40)
        y0 = rng.randrange(0, H - 40)
        hh = rng.randint(30, 150)
        dx = rng.choice([-24, -16, -10, 10, 16, 24, 32])
        for yy in range(y0, min(H, y0 + hh)):
            row = grid[yy]
            tail = [row[(x - dx) % W] for x in range(tx, W)]
            row[tx:W] = tail
        lc = GIDX[rng.choice(["WHITE", "INK", "INK"])]
        lw = rng.randint(1, 2)
        for yy in range(y0, min(H, y0 + hh)):
            for k in range(lw):
                if tx + k < W:
                    grid[yy][tx + k] = lc
    # 一条贯穿全高的撕裂
    tx = rng.randrange(60, W - 60)
    for yy in range(H):
        grid[yy][tx] = GIDX["INK"]
        if yy % 3:
            grid[yy][min(W - 1, tx + 1)] = GIDX["WHITE"]

    # ---- 失同步细线（1px，宽度不等，像行同步丢失）
    for _ in range(rng.randint(5, 10)):
        yy = rng.randrange(0, H)
        x0 = rng.randrange(0, W - 30)
        ln = rng.randint(24, 200)
        c = GIDX[rng.choice(["WHITE", "INK", "INK", "YEL3"])]
        for x in range(x0, min(W, x0 + ln)):
            grid[yy][x] = c
    # ---- 成块的黑色断电区（制造节奏，避免整屏都满）
    for _ in range(rng.randint(2, 4)):
        bx = 8 * rng.randrange(0, W // 8 - 6)
        by2 = rng.randrange(0, H - 12)
        bw = 8 * rng.randint(4, 20)
        bh2 = rng.randint(6, 22)
        for yy in range(by2, min(H, by2 + bh2)):
            for x in range(bx, min(W, bx + bw)):
                grid[yy][x] = GIDX["INK"]

    # ---- 零散坏块 + 单行错位
    for _ in range(rng.randint(14, 26)):
        bx = 8 * rng.randrange(0, W // 8)
        by2 = rng.randrange(0, H - 8)
        bw = 8 * rng.randint(1, 3)
        bh2 = rng.randint(2, 8)
        c = GIDX[rng.choice(GCOLS)]
        for yy in range(by2, min(H, by2 + bh2)):
            for x in range(bx, min(W, bx + bw)):
                grid[yy][x] = c
    for _ in range(rng.randint(8, 16)):
        yy = rng.randrange(0, H)
        dx = rng.randint(-60, 60)
        grid[yy] = [grid[yy][(x - dx) % W] for x in range(W)]

    cv = Canvas(W, H)
    px = cv.px
    cols = [P[n] for n in GCOLS]
    for yy in range(H):
        row = grid[yy]
        for x in range(W):
            r, g, b = cols[row[x]]
            px[x, yy] = (r, g, b, 255)
    return cv


def gen_glitch():
    frames = [_glitch_frame(s) for s in (10007, 20011, 30013)]
    return save(sheet(frames), os.path.join(OUT, "glitch.png"), expect=(W * 3, H))


# ------------------------------------------------------------------ flash
def gen_flash():
    cv = Canvas(W, H)
    y0, bh = 115, 40
    for j in range(bh):
        t = j / float(bh - 1)
        # 中间实、上下用 dither 台阶淡出
        cover = 1.0 - abs(t - 0.5) * 2.0
        cover = cover ** 0.65
        for x in range(W):
            if cover >= 0.98 or bayer(x, y0 + j, cover, 4):
                cv.set(x, y0 + j, "WHITE")
    # 上下各一条极淡的余晖
    for j in (-2, -1, bh, bh + 1):
        for x in range(W):
            if bayer(x, y0 + j, 0.12, 4):
                cv.set(x, y0 + j, "GREY8")
    return save(cv, os.path.join(OUT, "flash.png"), expect=(W, H))


def main():
    os.makedirs(OUT, exist_ok=True)
    print("C4 CRT 特效 -> assets/img/crt/")
    gen_scanline()
    gen_aperture()
    gen_vignette()
    gen_glass()
    gen_snow()
    gen_glitch()
    gen_flash()


if __name__ == "__main__":
    main()
