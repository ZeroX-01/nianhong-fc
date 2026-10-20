# -*- coding: utf-8 -*-
"""《回家吃饭》样片背景 —— assets/home/

可重复运行： python3 tools/gen_home.py

六张 480×270：
  bg_office.png    2026 年 9 月，公司会议室
  bg_bus.png       末班车车内
  bg_station.png   县汽车站（预留）
  bg_living.png    老房子客厅（衣柜顶有纸箱）
  bg_kitchen.png   老房子厨房
  bg_table.png     饭桌（四菜一汤，爸爸的空位）

风格：和正片同一套 44 色调色板、无抗锯齿、整像素。
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import Canvas, P, bayer, checker, fake_text, rng_for, save  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "home")
W, H = 480, 270


def new(bg):
    return Canvas(W, H, bg)


def ceiling_light(cv, x, y, w, color="YEL4"):
    cv.rect(x, y, x + w, y + 3, color)
    cv.hline(x + 2, x + w - 2, y + 4, "YEL3")


def glow(cv, x0, y0, x1, y1, color, level=0.15):
    """稀疏的点状光晕。不要用 dither_rect：那会把整块区域铺成两种颜色。"""
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            if bayer(x, y, level, 4):
                cv.set(x, y, color)


# ------------------------------------------------------------------ 办公室
def bg_office():
    cv = new("GREY2")
    # 天花板 / 地板
    cv.rect(0, 0, W, 18, "GREY1")
    cv.rect(0, 190, W, H, "GREY1")
    cv.rect(0, 188, W, 190, "GREY3")
    # 顶灯：只剩头顶这一排
    for x in (40, 160, 280, 400):
        ceiling_light(cv, x, 6, 52)
        glow(cv, x - 10, 10, x + 62, 44, "YEL1", 0.16)
    # 右窗：夜里的写字楼
    cv.rect(298, 28, 458, 124, "BLU1")
    cv.frame(298, 28, 458, 124, "GREY3", 3)
    cv.vline(377, 31, 121, "GREY3", 3)
    cv.hline(301, 455, 78, "GREY3", 3)
    rng = rng_for(2026)
    for i in range(46):
        x = 302 + rng.randrange(0, 152)
        y = 32 + rng.randrange(0, 88)
        c = "YEL3" if i % 4 == 0 else ("BLU4" if i % 3 == 0 else "GREY2")
        cv.rect(x, y, x + rng.choice([2, 3, 4]), y + 2, c)
    # 白板
    cv.rect(28, 30, 214, 132, "GREY7")
    cv.frame(28, 30, 214, 132, "GREY4", 2)
    fake_text(cv, 38, 40, 120, 10, "GREY4", rng, gap=3)
    fake_text(cv, 38, 58, 150, 8, "GREY3", rng, gap=3)
    fake_text(cv, 38, 74, 90, 8, "GREY3", rng, gap=3)
    cv.hline(38, 120, 50, "GREY5")
    # 会议桌
    cv.rect(24, 176, 456, 218, "WOOD2")
    cv.rect(24, 176, 456, 180, "WOOD3")
    cv.rect(24, 218, 456, 222, "GREY1")
    cv.rect(40, 222, 52, 250, "GREY1")
    cv.rect(428, 222, 440, 250, "GREY1")
    # 桌上的笔记本
    cv.rect(286, 164, 376, 176, "GREY4")
    cv.rect(292, 154, 370, 164, "GREY1")
    cv.rect(296, 157, 366, 162, "BLU2")
    # 手机：屏幕亮着
    cv.rect(252, 170, 264, 178, "GREY1")
    cv.rect(254, 171, 262, 176, "BLU4")
    # 椅子
    cv.rect(70, 190, 118, 198, "GREY1")
    cv.rect(74, 198, 82, 240, "GREY1")
    cv.rect(106, 198, 114, 240, "GREY1")
    cv.rect(190, 196, 238, 204, "GREY1")
    cv.rect(194, 204, 202, 244, "GREY1")
    cv.rect(226, 204, 234, 244, "GREY1")
    # 地上一点反光
    cv.hline(30, 450, 246, "GREY2")
    return cv


# ------------------------------------------------------------------ 末班车
def bg_bus():
    cv = new("GREY1")
    # 车顶
    cv.rect(0, 0, W, 22, "GREY1")
    cv.rect(0, 22, W, 26, "GREY2")
    for x in (60, 230, 400):
        ceiling_light(cv, x, 4, 44)
    # 车窗
    cv.rect(22, 32, 330, 186, "BLU1")
    cv.frame(22, 32, 330, 186, "GREY1", 4)
    cv.vline(176, 36, 182, "GREY1", 4)
    cv.hline(26, 326, 108, "GREY1", 3)
    rng = rng_for(2004)
    # 窗外的城市灯
    for i in range(60):
        x = 26 + rng.randrange(0, 300)
        y = 36 + rng.randrange(0, 140)
        c = "YEL3" if i % 3 == 0 else ("BLU4" if i % 3 == 1 else "WOOD6")
        cv.rect(x, y, x + rng.choice([2, 3, 5]), y + rng.choice([1, 2]), c)
    # 雨痕
    for i in range(22):
        x = 30 + rng.randrange(0, 290)
        y = 38 + rng.randrange(0, 120)
        cv.line(x, y, x - 1, y + 6 + rng.randrange(0, 10), "BLU2", 1)
    # 窗框上的路线牌
    cv.rect(40, 42, 120, 54, "GREY2")
    fake_text(cv, 46, 45, 64, 6, "YEL4", rng, gap=2)
    # 座椅
    cv.rect(0, 196, W, H, "WOOD1")
    cv.rect(18, 190, 150, 220, "RED2")
    cv.rect(22, 186, 146, 194, "RED3")
    cv.rect(166, 192, 300, 222, "RED2")
    cv.rect(170, 188, 296, 196, "RED3")
    cv.rect(316, 190, 456, 220, "RED2")
    cv.rect(320, 186, 452, 194, "RED3")
    # 扶手 / 吊环
    cv.vline(12, 60, 210, "YEL2", 3)
    cv.vline(338, 56, 210, "YEL2", 3)
    for y in (72, 100):
        cv.hline(12, 338, y, "YEL2", 1)
        cv.ring(70, y + 10, 5, "GREY5")
        cv.ring(160, y + 10, 5, "GREY5")
        cv.ring(250, y + 10, 5, "GREY5")
    # 地板
    cv.hline(0, W, 246, "GREY2")
    return cv


# ------------------------------------------------------------------ 车站
def bg_station():
    cv = new("BLU1")
    # 夜空 / 远处楼
    cv.rect(0, 0, W, 150, "BLU1")
    for i, (x, w, h) in enumerate(((20, 70, 60), (100, 90, 90), (200, 60, 50), (270, 110, 74), (390, 70, 100))):
        cv.rect(x, 150 - h, x + w, 150, "GREY2")
        for j in range(4):
            for k in range(3):
                if (i + j + k) % 3 == 0:
                    cv.rect(x + 8 + j * 16, 150 - h + 8 + k * 16, x + 12 + j * 16, 150 - h + 11 + k * 16, "YEL3")
    # 月亮
    cv.disc(408, 42, 15, "YEL4")
    cv.disc(402, 38, 13, "BLU1")
    # 车站房子
    cv.rect(28, 132, 300, 196, "GREY3")
    cv.rect(28, 126, 300, 132, "GREY4")
    cv.rect(40, 140, 120, 176, "BLU2")
    cv.frame(40, 140, 120, 176, "GREY2", 2)
    cv.rect(140, 146, 180, 196, "WOOD3")
    cv.rect(146, 146, 174, 196, "BLU1")
    cv.rect(210, 140, 286, 176, "BLU2")
    cv.frame(210, 140, 286, 176, "GREY2", 2)
    rng = rng_for(2026)
    fake_text(cv, 54, 116, 120, 8, "YEL4", rng, gap=2)
    # 路灯
    cv.vline(340, 80, 220, "GREY3", 3)
    cv.hline(340, 366, 80, "GREY3", 3)
    cv.rect(356, 78, 382, 84, "GREY2")
    cv.disc(369, 86, 6, "YEL4")
    glow(cv, 350, 90, 390, 140, "YEL1", 0.18)
    # 树
    cv.rect(352, 176, 360, 230, "WOOD2")
    cv.disc(356, 160, 30, "GRN1")
    cv.disc(340, 172, 22, "GRN2")
    cv.disc(374, 170, 20, "GRN2")
    # 地面：雨后
    cv.rect(0, 198, W, H, "GREY2")
    cv.hline(0, W, 200, "GREY3")
    for i in range(24):
        x = 10 + i * 20
        cv.vline(x, 210 + (i % 5) * 6, 216 + (i % 5) * 6, "YEL2", 1)
        cv.vline(x + 4, 222 + (i % 4) * 5, 226 + (i % 4) * 5, "BLU3", 1)
    # 共享单车
    for x in (300, 322):
        cv.ring(x, 216, 6, "GREY5")
        cv.ring(x + 18, 216, 6, "GREY5")
        cv.line(x, 216, x + 9, 204, "YEL3", 2)
        cv.line(x + 9, 204, x + 18, 216, "YEL3", 2)
    # 长椅
    cv.rect(80, 206, 140, 212, "WOOD3")
    cv.rect(84, 212, 90, 226, "WOOD2")
    cv.rect(130, 212, 136, 226, "WOOD2")
    return cv


# ------------------------------------------------------------------ 客厅
def _room(name):
    return os.path.join(ROOT, "assets", "img", "room", name)


def _paste(cv, name, x, y, frame_w=None, frame=0):
    im = Image.open(_room(name)).convert("RGBA")
    if frame_w:
        im = im.crop((frame * frame_w, 0, (frame + 1) * frame_w, im.height))
    cv.img.alpha_composite(im, (x, y))


def _digit(cv, x, y, d, color):
    # 3x5 的极简数字，挂历上只用得到 2/0/6/5
    F = {
        "0": ["111", "101", "101", "101", "111"],
        "2": ["111", "001", "111", "100", "111"],
        "5": ["111", "100", "111", "001", "111"],
        "6": ["111", "100", "111", "101", "111"],
    }
    rows = F.get(d, ["000", "000", "000", "000", "000"])
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "1":
                cv.set(x + i, y + j, color)


def bg_living():
    """2026 年的客厅：同一间屋子，家具没换，只多了纸箱、药瓶和一本新挂历。"""
    cv = Canvas(W, H)
    cv.img = Image.open(_room("bg_room.png")).convert("RGBA")
    cv.px = cv.img.load()

    # 墙上的东西
    _paste(cv, "window.png", 24, 36)
    _paste(cv, "poster.png", 56, 120)
    _paste(cv, "award.png", 330, 52)
    _paste(cv, "clock_wall.png", 338, 10)
    _paste(cv, "door.png", 398, 92, frame_w=62, frame=0)
    _paste(cv, "lightbulb.png", 96, 0, frame_w=18, frame=1)

    # 家具
    _paste(cv, "sofa.png", 8, 164)
    _paste(cv, "tv_cabinet.png", 118, 176)
    _paste(cv, "lace_cloth.png", 114, 170)
    _paste(cv, "desk_small.png", 392, 216)
    _paste(cv, "fish_tank.png", 356, 186, frame_w=44, frame=0)
    _paste(cv, "thermos.png", 352, 196)
    _paste(cv, "shoebox.png", 78, 236)
    _paste(cv, "slipper.png", 300, 250)

    # 电视屏幕：tv_crt.png 的屏幕窗是透明的，先铺一层暗屏，再盖外壳
    cv.rect(168, 48, 308, 152, "BLU1")
    cv.frame(168, 48, 308, 152, "GREY2", 1)
    cv.dither_rect(172, 52, 304, 148, "BLU2", "BLU1", 0.16)
    cv.line(176, 56, 222, 56, "BLU4", 1)
    _paste(cv, "tv_crt.png", 150, 32)
    _paste(cv, "tv_antenna.png", 212, 0)

    # 2026 的挂历：盖掉 2004 那本，9 月 25 日画个红圈
    cv.rect(120, 44, 153, 90, "GREY8")
    cv.frame(120, 44, 153, 90, "GREY5", 1)
    cv.rect(121, 45, 152, 53, "RED3")
    for i, ch in enumerate("2026"):
        _digit(cv, 123 + i * 6, 56, ch, "INK")
    for gy in range(64, 88, 5):
        for gx in range(124, 151, 6):
            cv.set(gx, gy, "GREY5")
    cv.ring(140, 76, 5, "RED4")
    cv.rect(120, 90, 153, 92, "WOOD2")

    # 电视柜旁边的纸箱：小旋风装在里面
    cv.rect(292, 214, 344, 244, "WOOD5")
    cv.frame(292, 214, 344, 244, "WOOD3", 1)
    cv.rect(292, 214, 344, 219, "WOOD4")
    cv.hline(294, 342, 216, "YEL2")
    cv.rect(300, 220, 336, 225, "GREY6")
    cv.rect(306, 221, 330, 223, "GREY5")
    cv.rect(300, 225, 336, 226, "GREY4")
    for x in (298, 338):
        cv.vline(x, 219, 244, "WOOD4", 1)

    # 小方桌上的药瓶和一杯水
    cv.rect(400, 202, 410, 216, "GREY8")
    cv.rect(400, 202, 410, 205, "RED3")
    cv.rect(402, 208, 408, 211, "GREY5")
    cv.rect(416, 208, 426, 216, "BLU5")
    cv.frame(416, 208, 426, 216, "GREY6", 1)

    # 晚上，屋里压暗一点，但灯是亮的。
    # 注意不能用 dither_rect：它会用两种颜色铺满整个区域，把屋子盖掉。
    for y in range(H):
        for x in range(W):
            if bayer(x, y, 0.14, 4):
                cv.set(x, y, "GREY1")
    return cv


# ------------------------------------------------------------------ 厨房
def bg_kitchen():
    cv = new("GREY3")
    # 瓷砖墙
    cv.rect(0, 0, W, 190, "GREY7")
    for y in range(0, 190, 16):
        for x in range(0, W, 16):
            if (x // 16 + y // 16) % 2 == 0:
                cv.rect(x, y, x + 15, y + 15, "GREY6")
        cv.hline(0, W, y, "GREY5")
    for x in range(0, W, 16):
        cv.vline(x, 0, 190, "GREY5")
    # 窗
    cv.rect(28, 34, 132, 122, "BLU1")
    cv.frame(28, 34, 132, 122, "WOOD2", 4)
    cv.vline(80, 38, 118, "WOOD2", 4)
    cv.disc(110, 58, 12, "YEL4")
    cv.disc(104, 54, 10, "BLU1")
    # 抽油烟机
    cv.rect(168, 58, 300, 78, "GREY3")
    cv.rect(174, 78, 294, 88, "GREY4")
    cv.rect(220, 38, 248, 58, "GREY4")
    cv.rect(214, 34, 254, 38, "GREY5")
    # 灶台
    cv.rect(150, 148, 396, 202, "GREY4")
    cv.rect(150, 144, 396, 150, "GREY5")
    cv.rect(166, 152, 260, 196, "GREY3")
    cv.disc(198, 168, 10, "GREY5")
    cv.disc(198, 168, 6, "GREY2")
    cv.disc(238, 168, 10, "GREY5")
    cv.disc(238, 168, 6, "GREY2")
    # 锅
    cv.disc(218, 150, 22, "GREY5")
    cv.disc(218, 148, 18, "GREY6")
    cv.disc(218, 146, 15, "GREY8")
    cv.dither_rect(206, 128, 230, 146, "GREY8", "GREY7", 0.35)
    # 冰箱
    cv.rect(404, 54, 468, 210, "GREY7")
    cv.frame(404, 54, 468, 210, "GREY5", 2)
    cv.hline(406, 466, 122, "GREY5")
    cv.rect(410, 62, 430, 74, "YEL4")
    cv.rect(436, 66, 460, 78, "GREY8")
    fake_text(cv, 438, 68, 18, 6, "GREY4", rng_for(77), gap=1)
    cv.rect(410, 132, 426, 144, "GREY8")
    fake_text(cv, 412, 134, 12, 5, "GREY4", rng_for(78), gap=1)
    cv.rect(456, 128, 460, 160, "GREY5")
    # 墙面挂件
    cv.vline(360, 96, 140, "GREY5", 1)
    cv.rect(350, 100, 358, 116, "GREY6")
    cv.rect(362, 104, 370, 120, "GREY6")
    cv.vline(380, 96, 140, "GREY5", 1)
    cv.rect(376, 106, 386, 112, "GREY6")
    # 地面
    cv.rect(0, 202, W, H, "WOOD3")
    cv.hline(0, W, 202, "WOOD2")
    # 顶灯
    cv.disc(240, 18, 11, "YEL4")
    glow(cv, 200, 22, 280, 80, "YEL1", 0.12)
    return cv


# ------------------------------------------------------------------ 饭桌
def bg_table():
    """饭桌：还是那间客厅，桌子拉到镜头前；菜要露在对话框上方。"""
    room = bg_living()
    cv = Canvas(W, H)
    cv.img = room.img.copy()
    cv.px = cv.img.load()

    # 桌子：木边 + 桌布（桌面上移，别被底部对话框盖住）
    cv.rect(0, 112, W, 122, "WOOD2")
    cv.rect(0, 118, W, H, "GREY8")
    cv.hline(0, W, 118, "GREY7")
    cv.hline(0, W, 126, "GREY7")
    for x in range(0, W, 24):
        cv.vline(x, 126, H, "GREY7")
    for y in range(126, H, 24):
        cv.hline(0, W, y, "GREY7")

    # 四菜一汤
    dishes = [
        (96, 152, "GRN4", "GRN3", "青菜"),
        (176, 144, "WOOD5", "WOOD4", "卤牛肉"),
        (300, 152, "RED3", "RED2", "盐水鸭"),
        (380, 144, "WOOD6", "WOOD5", "鱼"),
    ]
    for i, (x, y, c1, c2, _name) in enumerate(dishes):
        cv.ellipse(x, y, 31, 19, "GREY8")
        cv.ellipse(x, y, 26, 15, "GREY7")
        cv.ellipse(x, y, 20, 11, c1)
        cv.ellipse(x - 7 + i * 3, y - 2, 9, 5, c2)
        cv.ellipse(x + 8, y + 4, 6, 3, c2)
        cv.ellipse(x - 3, y - 6, 4, 2, "GREY8")

    # 汤：砂锅 + 一点热气
    cv.ellipse(238, 168, 27, 16, "GREY8")
    cv.ellipse(238, 166, 22, 12, "WOOD6")
    cv.ellipse(238, 165, 17, 8, "WOOD7")
    cv.dither_rect(224, 146, 252, 164, "GREY8", "GREY7", 0.28)

    # 碗筷
    for x in (110, 340):
        cv.ellipse(x, 188, 14, 8, "GREY8")
        cv.ellipse(x, 186, 11, 6, "GREY6")
        cv.line(x - 26, 182, x - 12, 174, "WOOD4", 2)
        cv.line(x + 12, 174, x + 26, 182, "WOOD4", 2)

    # 月饼
    cv.ellipse(270, 194, 22, 12, "GREY8")
    for i in range(3):
        cv.ellipse(258 + i * 12, 192, 8, 6, "WOOD5")
        cv.ellipse(258 + i * 12, 191, 6, 4, "YEL3")

    # 茶壶
    cv.ellipse(420, 188, 16, 11, "GREY7")
    cv.ellipse(420, 185, 13, 8, "GREY8")
    cv.line(436, 186, 448, 180, "GREY6", 2)
    cv.ring(420, 180, 5, "GREY6")
    return cv


def main():
    os.makedirs(OUT, exist_ok=True)
    print("home backgrounds -> assets/home/")
    for name, fn in (
        ("bg_office.png", bg_office),
        ("bg_bus.png", bg_bus),
        ("bg_station.png", bg_station),
        ("bg_living.png", bg_living),
        ("bg_kitchen.png", bg_kitchen),
        ("bg_table.png", bg_table),
    ):
        img = fn()
        save(img, os.path.join(OUT, name), expect=(W, H))
        print("  [ok] " + name)


if __name__ == "__main__":
    main()
