#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
客厅合成自查：把 assets/img/room/ 的 sprite 按 ART_MANIFEST 的「摆放坐标」贴到
bg_room.png 上，合成 480x270 效果图，再 NEAREST 放大 3 倍存为 tools/preview_room.png。

附带产出（细节自查用）：
  tools/zoom_tv.png       tv_crt.png 放大 6 倍
  tools/zoom_console.png  console.png 放大 6 倍
  tools/zoom_pair.png     两个核心资源并排放大 6 倍

用法： cd <项目根> && python3 tools/preview_room.py
"""

import os
from PIL import Image

ROOM = os.path.join("assets", "img", "room")
OUT = "tools"
SCALE = 3
ZOOM = 6

# (文件名, x, y)  —— 顺序即 z-order（后画的在上）
# 坐标严格取自 docs/ART_MANIFEST.md A 组表格；manifest 未给坐标的用 * 标注（合理臆定）
LAYOUT = [
    # 墙上物件（会被家具/电视遮挡）
    ("window.png",        24,  36),
    ("door.png",         398,  92),
    ("poster.png",        56, 120),
    ("calendar.png",     120,  44),
    ("award.png",        330,  52),
    ("clock_wall.png",   176,  20),
    # 家具
    ("sofa.png",           8, 164),
    ("tv_cabinet.png",   118, 176),
    ("lace_cloth.png",   114, 170),
    # 电视 + 主机
    ("tv_crt.png",       150,  32),
    ("tv_antenna.png",   212,   0),
    ("lightbulb.png",    240,   0),
    ("console.png",      250, 196),
    # 桌 / 缸 / 瓶
    ("fish_tank.png",    356, 148),
    ("desk_small.png",   392, 216),
    ("thermos.png",      352, 196),
    ("homework_book.png", 398, 214),   # * manifest 无坐标：摊在小方桌上
    # 地面小物
    ("shoebox.png",       78, 236),
    ("slipper.png",      300, 250),
    ("cable.png",        188, 232),    # * manifest 无坐标：沿地面平铺两段
    ("cable.png",        252, 232),    # *
    ("popsicle.png",     140, 246),    # * manifest 无坐标：丢在地上
    ("controller_1p.png", 150, 238),
    ("controller_2p.png", 206, 244),
]

# tv_crt 的透明屏幕区（游戏运行时由下层游戏画面透出）
SCREEN = (150 + 18, 32 + 16, 140, 104)

FRAME_W = {                      # 多帧资源的单帧宽（取第 1 帧）
    "door.png": 62,
    "fish_tank.png": 44,
    "homework_book.png": 42,
    "lightbulb.png": 18,
}


def first_frame(img, name):
    w = FRAME_W.get(name)
    if w and img.size[0] > w:
        return img.crop((0, 0, w, img.size[1]))
    return img


def crt_placeholder(base):
    """在电视透明屏幕区下层画一个假的游戏画面，用来验证透明窗是否严丝合缝。"""
    x, y, w, h = SCREEN
    px = base.load()
    for j in range(h):
        for i in range(w):
            col = (23, 52, 107, 255) if (j % 4) else (12, 24, 50, 255)      # BLU2 / BLU1
            if 20 < i < 120 and 30 < j < 74 and ((i + j) // 6) % 2 == 0:
                col = (47, 125, 66, 255)                                    # GRN3 色块
            px[x + i, y + j] = col


# manifest 坐标存在 3 处遮挡/浮空冲突，这里给出建议修正后的摆位（另存一张对照图）
LAYOUT_FIX = [
    ("clock_wall.png",   338,  10),   # 原 (176,20)：会被 tv_crt 遮掉 3/4
    ("lightbulb.png",     96,   0),   # 原 (240,0)：与 tv_antenna 重叠打结
    ("fish_tank.png",    356, 186),   # 原 (356,148)：方凳被蕾丝布盖住，看着像悬空
]


def compose(layout_override=None):
    base = Image.open(os.path.join(ROOM, "bg_room.png")).convert("RGBA")
    assert base.size == (480, 270), base.size
    crt_placeholder(base)
    override = dict((n, (x, y)) for n, x, y in (layout_override or []))
    used = set()
    for name, x, y in LAYOUT:
        if name in override and name not in used:
            x, y = override[name]
            used.add(name)
        img = first_frame(Image.open(os.path.join(ROOM, name)).convert("RGBA"), name)
        base.alpha_composite(img, (x, y))
    return base


def main():
    if not os.path.isdir(ROOM):
        raise SystemExit("找不到 %s，请先运行 python3 tools/gen_room.py" % ROOM)
    base = Image.open(os.path.join(ROOM, "bg_room.png")).convert("RGBA")
    assert base.size == (480, 270), base.size
    crt_placeholder(base)

    for name, x, y in LAYOUT:
        img = Image.open(os.path.join(ROOM, name)).convert("RGBA")
        img = first_frame(img, name)
        base.alpha_composite(img, (x, y))
        print("  贴入 %-20s @ (%3d,%3d)  %dx%d" % (name, x, y, img.size[0], img.size[1]))

    out = base.resize((480 * SCALE, 270 * SCALE), Image.NEAREST)
    p = os.path.join(OUT, "preview_room.png")
    out.save(p)
    print("合成图 -> %s (%dx%d)" % (p, out.size[0], out.size[1]))

    # 修正摆位对照图（挂钟/灯泡/鱼缸）
    fixed = compose(LAYOUT_FIX).resize((480 * SCALE, 270 * SCALE), Image.NEAREST)
    pf = os.path.join(OUT, "preview_room_fixed.png")
    fixed.save(pf)
    print("修正摆位对照图 -> %s" % pf)

    # 核心资源 6 倍放大自查
    zooms = []
    for name in ("tv_crt.png", "console.png"):
        img = Image.open(os.path.join(ROOM, name)).convert("RGBA")
        # 透明处铺深灰棋盘，方便看清透明区与描边
        bg = Image.new("RGBA", img.size, (60, 60, 72, 255))
        for j in range(img.size[1]):
            for i in range(img.size[0]):
                if ((i // 4) + (j // 4)) % 2 == 0:
                    bg.putpixel((i, j), (38, 38, 46, 255))
        bg.alpha_composite(img)
        z = bg.resize((img.size[0] * ZOOM, img.size[1] * ZOOM), Image.NEAREST)
        zp = os.path.join(OUT, "zoom_%s.png" % name.replace("_crt", "").replace(".png", ""))
        z.save(zp)
        zooms.append(z)
        print("放大图 -> %s (%dx%d)" % (zp, z.size[0], z.size[1]))
    pair = Image.new("RGBA", (max(z.size[0] for z in zooms),
                              sum(z.size[1] for z in zooms) + 12), (24, 24, 30, 255))
    yy = 0
    for z in zooms:
        pair.alpha_composite(z, (0, yy))
        yy += z.size[1] + 12
    pair.save(os.path.join(OUT, "zoom_pair.png"))
    print("放大对照 -> tools/zoom_pair.png")


if __name__ == "__main__":
    main()
