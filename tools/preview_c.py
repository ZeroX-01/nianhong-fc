# -*- coding: utf-8 -*-
"""C 组自查预览：python3 tools/preview_c.py
生成 tools/preview_market.png / preview_ui.png / preview_crt.png / preview_title.png
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import Canvas, bayer, scale  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
TOOLS = os.path.join(ROOT, "tools")


def load(*parts):
    return Image.open(os.path.join(IMG, *parts)).convert("RGBA")


def frame_of(sheet_img, idx, n):
    w = sheet_img.size[0] // n
    return sheet_img.crop((idx * w, 0, (idx + 1) * w, sheet_img.size[1]))


def nine_slice(src, tw, th, l, r, t, b):
    """9-slice 拉伸（NEAREST，边条只沿单轴拉伸，中央双轴拉伸）"""
    sw, sh = src.size
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cw_s, ch_s = sw - l - r, sh - t - b
    cw_t, ch_t = tw - l - r, th - t - b
    assert cw_t > 0 and ch_t > 0

    def part(x0, y0, x1, y1):
        return src.crop((x0, y0, x1, y1))

    def rs(im, w, h):
        return im.resize((max(1, w), max(1, h)), Image.NEAREST)

    # 角
    out.paste(part(0, 0, l, t), (0, 0))
    out.paste(part(sw - r, 0, sw, t), (tw - r, 0))
    out.paste(part(0, sh - b, l, sh), (0, th - b))
    out.paste(part(sw - r, sh - b, sw, sh), (tw - r, th - b))
    # 边
    out.paste(rs(part(l, 0, sw - r, t), cw_t, t), (l, 0))
    out.paste(rs(part(l, sh - b, sw - r, sh), cw_t, b), (l, th - b))
    out.paste(rs(part(0, t, l, sh - b), l, ch_t), (0, t))
    out.paste(rs(part(sw - r, t, sw, sh - b), r, ch_t), (tw - r, t))
    # 中
    out.paste(rs(part(l, t, sw - r, sh - b), cw_t, ch_t), (l, t))
    return out


# ------------------------------------------------------------------ 1. 集市
def preview_market():
    bg = load("market", "bg_market.png").copy()
    for name, (x, y) in (("stall.png", (150, 172)), ("umbrella.png", (140, 120)),
                         ("bicycle.png", (360, 200)), ("crate.png", (60, 216))):
        bg.alpha_composite(load("market", name), (x, y))
    out = os.path.join(TOOLS, "preview_market.png")
    scale(bg, 3).save(out)
    print("  ->", out)
    # 发小家单独一张
    scale(load("market", "bg_friend.png"), 2).save(os.path.join(TOOLS, "preview_friend.png"))
    print("  ->", os.path.join(TOOLS, "preview_friend.png"))


# ------------------------------------------------------------------ 2. UI
def preview_ui():
    W, H = 480, 310
    cv = Canvas(W, H)
    for y in range(H):
        for x in range(W):
            cv.set(x, y, "GREY2" if bayer(x, y, 0.35, 8) else "GREY1")
    base = cv.img

    # 9-slice 拉伸后的 panel（260×90）与原图对照
    base.alpha_composite(nine_slice(load("ui", "panel.png"), 260, 90, 12, 12, 12, 12), (10, 10))
    base.alpha_composite(load("ui", "panel.png"), (284, 10))
    base.alpha_composite(nine_slice(load("ui", "panel_dark.png"), 200, 60, 12, 12, 12, 12), (10, 110))
    base.alpha_composite(load("ui", "panel_dark.png"), (284, 62))
    # 极端拉伸测试（检查糊边）
    base.alpha_composite(nine_slice(load("ui", "panel.png"), 140, 34, 12, 12, 12, 12), (340, 10))
    base.alpha_composite(nine_slice(load("ui", "panel_dark.png"), 140, 30, 12, 12, 12, 12), (340, 50))

    btn = load("ui", "btn.png")
    for i in range(3):
        base.alpha_composite(nine_slice(frame_of(btn, i, 3), 96, 20, 6, 6, 0, 0), (222, 112 + i * 24))
        base.alpha_composite(frame_of(btn, i, 3), (330, 112 + i * 24))
        base.alpha_composite(nine_slice(frame_of(btn, i, 3), 148, 20, 6, 6, 0, 0), (10, 182 + i * 24))

    # icons / heart / arrow / focus_ring
    x, y = 176, 186
    for name, n in (("heart.png", 2), ("arrow.png", 2), ("focus_ring.png", 2)):
        s = load("ui", name)
        for i in range(n):
            f = frame_of(s, i, n)
            base.alpha_composite(f, (x, y))
            x += f.size[0] + 6
        x += 8
    x, y = 176, 214
    for name in ("icon_coin.png", "icon_cart.png", "icon_clock.png", "icon_alert.png"):
        f = load("ui", name)
        base.alpha_composite(f, (x, y))
        x += f.size[0] + 8

    base.alpha_composite(load("ui", "touch_dpad.png"), (10, 260 - 104 + 44))
    tb = load("ui", "touch_btn.png")
    base.alpha_composite(frame_of(tb, 0, 2), (126, 246))
    base.alpha_composite(frame_of(tb, 1, 2), (184, 246))
    # focus_ring 拉伸包住一个 icon
    base.alpha_composite(nine_slice(frame_of(load("ui", "focus_ring.png"), 0, 2), 40, 28, 8, 8, 8, 8), (250, 208))
    base.alpha_composite(load("ui", "icon_cart.png"), (264, 216))
    base.alpha_composite(load("ui", "title_sub.png"), (250, 252))
    base.alpha_composite(load("ui", "title_sub.png"), (250, 280))

    out = os.path.join(TOOLS, "preview_ui.png")
    scale(base, 3).save(out)
    print("  ->", out)


# ------------------------------------------------------------------ 3. CRT
def fake_screen():
    """假游戏画面：彩色方格 + 几行白色横线"""
    cv = Canvas(360, 270)
    cols = ["RED3", "GRN3", "BLU3", "YEL3", "PUR3", "WOOD5", "GREY5", "GRN4", "BLU4", "RED4"]
    cell = 30
    for by in range(0, 270, cell):
        for bx in range(0, 360, cell):
            c = cols[((bx // cell) + (by // cell) * 3) % len(cols)]
            cv.rect(bx, by, bx + cell - 1, by + cell - 1, c)
            cv.frame(bx, by, bx + cell - 1, by + cell - 1, "GREY2")
    for y in (40, 80, 132, 190, 240):
        cv.hline(6, 353, y, "WHITE")
        cv.hline(6, 353, y + 1, "WHITE")
    for x in (60, 180, 300):
        cv.vline(x, 10, 260, "GREY8")
    return cv.img


def tile_over(base, tile, alpha_scale=1.0):
    tw, th = tile.size
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    for y in range(0, base.size[1], th):
        for x in range(0, base.size[0], tw):
            layer.paste(tile, (x, y))
    base.alpha_composite(layer)
    return base


def preview_crt():
    scr = fake_screen()
    scan = load("crt", "scanline.png")
    aper = load("crt", "aperture.png")
    vig = load("crt", "vignette.png")
    glass = load("crt", "glass.png")
    glitch = frame_of(load("crt", "glitch.png"), 0, 3)

    a = scr.copy()

    b = scr.copy()
    tile_over(b, aper)
    tile_over(b, scan)
    b.alpha_composite(vig)
    b.alpha_composite(glass)

    c = glitch.copy()
    tile_over(c, scan)
    c.alpha_composite(vig)

    gap = 8
    W = 360 * 3 + gap * 4
    H = 270 + gap * 2 + 12
    out = Image.new("RGBA", (W, H), (20, 20, 28, 255))
    for i, im in enumerate((a, b, c)):
        out.alpha_composite(im, (gap + i * (360 + gap), gap))
        # 标号条
        for k in range(i + 1):
            for yy in range(6):
                for xx in range(6):
                    out.putpixel((gap + i * (360 + gap) + k * 9 + xx, gap + 270 + 3 + yy), (255, 255, 255, 255))
    p = os.path.join(TOOLS, "preview_crt.png")
    scale(out, 2).save(p)
    print("  ->", p)

    # 花屏 3 帧 + 雪花 + flash 单独看
    gl = load("crt", "glitch.png")
    scale(gl, 1).save(os.path.join(TOOLS, "preview_glitch3.png"))
    print("  ->", os.path.join(TOOLS, "preview_glitch3.png"))


# ------------------------------------------------------------------ 4. 标题 4x
def preview_title():
    logo = load("ui", "title_logo.png")
    bg = Image.new("RGBA", logo.size, (20, 20, 28, 255))
    bg.alpha_composite(logo)
    p = os.path.join(TOOLS, "preview_title.png")
    scale(bg, 4).save(p)
    print("  ->", p)


def main():
    print("C 组预览：")
    preview_market()
    preview_ui()
    preview_crt()
    preview_title()


if __name__ == "__main__":
    main()
