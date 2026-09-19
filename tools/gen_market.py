# -*- coding: utf-8 -*-
"""C1 集市 + C2 发小家 —— assets/img/market/
可重复运行： python3 tools/gen_market.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import Canvas, bayer, checker, fake_text, fake_glyph, rng_for, save  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "market")


# ------------------------------------------------------------------ 通用
def vgrad(cv, x0, y0, x1, y1, colors):
    """竖向 dither 渐变（只在给定色之间做棋盘抖动，不插值新色）"""
    n = len(colors) - 1
    span = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        t = (y - y0) / float(span) * n
        i = min(n - 1, int(t))
        f = t - i
        for x in range(x0, x1 + 1):
            cv.set(x, y, colors[i + 1] if bayer(x, y, f) else colors[i])


def tiles_wall(cv, x0, y0, x1, y1, rng):
    """白瓷砖立面：GREY8 砖 + GREY6 灰缝 + 旧化污渍"""
    tw, th = 12, 8
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            gx = (x - x0) % tw
            gy = (y - y0) % th
            if gx == 0 or gy == 0:
                c = "GREY6"
            elif gy == 1 or gx == 1:
                c = "WHITE"
            else:
                c = "GREY8"
            cv.set(x, y, c)
    # 整体旧化：往下越脏
    for y in range(y0, y1 + 1):
        lv = (y - y0) / float(max(1, y1 - y0))
        for x in range(x0, x1 + 1):
            if cv.get(x, y)[:3] == (0, 0, 0):
                continue
            if bayer(x, y, 0.10 + 0.30 * lv, 8):
                cv.set(x, y, "GREY7")
    # 竖向水痕
    for _ in range(9):
        sx = rng.randint(x0, x1)
        top = rng.randint(y0, max(y0, y1 - 30))
        h = rng.randint(14, 46)
        w = rng.randint(2, 5)
        for y in range(top, min(y1, top + h) + 1):
            for x in range(sx, min(x1, sx + w)):
                if bayer(x, y, 0.55, 4):
                    cv.set(x, y, "GREY6" if rng.random() < 0.7 else "WOOD6")
    # 霉斑
    for _ in range(16):
        sx = rng.randint(x0, x1 - 6)
        sy = rng.randint(y0, y1 - 4)
        for y in range(sy, sy + rng.randint(2, 5)):
            for x in range(sx, sx + rng.randint(3, 8)):
                if bayer(x, y, 0.5, 4):
                    cv.set(x, y, "GREY5")
    # 流锈：铁件（窗台/招牌钉）往下淌的锈黄，越往下越淡
    for _ in range(11):
        sx = rng.randint(x0 + 2, x1 - 3)
        top = rng.randint(y0, max(y0, y1 - 24))
        h = rng.randint(16, 40)
        for i in range(h):
            y = top + i
            if y > y1:
                break
            t = i / float(h)
            w = 2 if t < 0.5 else 1
            for x in range(sx, min(x1, sx + w) + 1):
                if bayer(x, y, 0.85 - 0.55 * t, 4):
                    cv.set(x, y, "WOOD4" if t < 0.45 else "WOOD5")


def cart_mini(cv, x, y, w, h, shell, dark, label, lean=0, rng=None):
    """摊位上斜插的小卡带（只露上部）"""
    for j in range(h):
        off = int(round(lean * (h - 1 - j) / float(max(1, h - 1))))
        x0 = x + off
        x1 = x + w - 1 + off
        for i in range(x0, x1 + 1):
            edge = (i == x0 or i == x1 or j == 0)
            cv.set(i, y + j, dark if edge else shell)
        # 上缘高光
        if j == 1:
            cv.hline(x0 + 1, x1 - 1, y + j, shell)
        # 顶部提手凹槽
        if j in (2, 3):
            cv.hline(x0 + 3, x1 - 3, y + j, dark)
    # 贴纸（小块 + 白边 + 抽象图纹），略贴歪 1px
    ly0 = y + 7
    ly1 = y + h - 5
    off = int(round(lean * (h - 1 - (ly0 - y)) / float(max(1, h - 1))))
    lx0 = x + 2 + off
    lx1 = x + w - 3 + off
    cv.rect(lx0, ly0, lx1, ly1, "GREY8")
    cv.rect(lx0 + 1, ly0 + 1, lx1, ly1 - 1, label)
    cv.set(lx1, ly0, "GREY8")
    if rng:
        for _ in range(4):
            mx = rng.randint(lx0 + 2, lx1 - 1)
            my = rng.randint(ly0 + 2, ly1 - 2)
            cv.set(mx, my, dark)
            if rng.random() < 0.5:
                cv.set(mx + 1, my, dark)
    # 螺丝孔
    cv.set(x + 3 + off, y + h - 2, dark)
    cv.set(x + w - 4 + off, y + h - 2, dark)
    if rng and rng.random() < 0.5:
        cv.set(x + w - 3, y + h - 5, "GREY5")


def carton(cv, x0, y0, x1, y1, rng, text=True):
    """纸箱（正面 + 右侧面）"""
    cv.rect(x0, y0, x1, y1, "WOOD6")
    side = min(4, (x1 - x0) // 4)
    cv.rect(x1 - side, y0, x1, y1, "WOOD5")
    cv.frame(x0, y0, x1, y1, "WOOD4")
    cv.hline(x0 + 1, x1 - 1, y0 + 1, "WOOD7")
    # 箱盖折线
    my = y0 + (y1 - y0) // 3
    cv.hline(x0 + 1, x1 - side - 1, my, "WOOD5")
    cv.vline(x0 + (x1 - x0) // 2, y0 + 1, my - 1, "WOOD5")
    if text and (x1 - x0) > 14:
        fake_text(cv, x0 + 3, my + 3, x1 - x0 - 6, 5, "WOOD3", rng, gap=2)
    # 胶带
    cv.hline(x0, x1 - side, y1 - 3, "WOOD7")


# ------------------------------------------------------------------ bg_market
def gen_bg_market():
    rng = rng_for(19900707)
    cv = Canvas(480, 270)

    # ---- 天空（仅左上一小块）
    vgrad(cv, 0, 0, 100, 40, ["BLU4", "BLU5", "YEL4", "YEL3"])
    # 远处小楼剪影
    for x in range(0, 101):
        top = 26 + (2 if 20 <= x < 46 else 0) + (-4 if 60 <= x < 84 else 0)
        for y in range(top, 41):
            cv.set(x, y, "GREY5" if bayer(x, y, 0.35) else "GREY6")

    # ---- 左侧矮楼（annex）
    cv.rect(0, 41, 100, 160, "GREY7")
    tiles_wall(cv, 0, 46, 100, 160, rng)
    cv.rect(0, 41, 100, 45, "GREY7")           # 女儿墙
    cv.hline(0, 100, 41, "GREY8")
    cv.hline(0, 100, 45, "GREY5")
    cv.vline(100, 41, 160, "GREY4")

    # ---- 主立面
    tiles_wall(cv, 101, 0, 479, 160, rng)
    cv.hline(101, 479, 0, "GREY6")

    # ---- 巨型手写招牌
    sx0, sy0, sx1, sy1 = 112, 14, 452, 66
    cv.rect(sx0, sy0, sx1, sy1, "RED3")
    cv.frame(sx0, sy0, sx1, sy1, "INK")
    cv.frame(sx0 + 1, sy0 + 1, sx1 - 1, sy1 - 1, "WOOD2", 2)
    # 招牌内部老化
    for y in range(sy0 + 3, sy1 - 2):
        for x in range(sx0 + 3, sx1 - 2):
            if bayer(x, y, 0.12, 8):
                cv.set(x, y, "RED2")
    # 白色抽象字纹：11 字（"电子游戏机 卡带 批发零售"）
    tr = rng_for(4242)
    ch, gap = 24, 5
    n = 11
    total = n * ch + (n - 1) * gap
    tx = sx0 + (sx1 - sx0 + 1 - total) // 2
    ty = sy0 + 13
    for i in range(n):
        if i in (5, 8):   # 词间空档画一个小圆点分隔
            cv.disc(tx + i * (ch + gap) + ch // 2, ty + ch // 2, 3, "YEL4")
            continue
        fake_glyph(cv, tx + i * (ch + gap), ty, ch, ch, "WHITE", tr, weight=2)
    # 招牌上沿的射灯 + 支架
    for bx in (150, 260, 400):
        cv.rect(bx, sy0 - 6, bx + 9, sy0 - 1, "GREY5")
        cv.rect(bx + 1, sy0 - 5, bx + 8, sy0 - 4, "GREY7")
        cv.vline(bx + 4, sy0 - 8, sy0 - 7, "GREY4")
    # 招牌掉漆
    for _ in range(30):
        px_ = rng.randint(sx0 + 3, sx1 - 4)
        py_ = rng.randint(sy0 + 3, sy1 - 4)
        cv.rect(px_, py_, px_ + rng.randint(0, 2), py_ + rng.randint(0, 1), "RED2")

    # ---- 立面窗户 + 空调
    for wx in (118, 176, 234):
        cv.rect(wx, 78, wx + 34, 106, "GREY4")
        cv.frame(wx, 78, wx + 34, 106, "GREY6", 2)
        cv.rect(wx + 2, 80, wx + 32, 104, "GREY3")
        cv.vline(wx + 17, 80, 104, "GREY6")
        cv.hline(wx + 2, wx + 32, 92, "GREY6")
        # 玻璃 45° 反光
        for k in range(0, 14):
            cv.set(wx + 4 + k, 90 - k, "GREY6")
            cv.set(wx + 5 + k, 90 - k, "GREY5")
        # 防盗网 dither
        for y in range(80, 105, 3):
            for x in range(wx + 2, wx + 33):
                if x % 3 == 0:
                    cv.set(x, y, "GREY5")
    # 空调外机
    cv.rect(300, 76, 334, 100, "GREY7")
    cv.frame(300, 76, 334, 100, "GREY4")
    cv.hline(301, 333, 77, "GREY8")
    for y in range(80, 97, 2):
        cv.hline(303, 331, y, "GREY6")
    cv.rect(316, 84, 320, 92, "GREY5")
    cv.rect(334, 100, 336, 118, "GREY5")       # 排水管
    # 空调支架
    cv.line(300, 100, 296, 108, "GREY4", 1)
    cv.line(334, 100, 338, 108, "GREY4", 1)

    # ---- 竖幅（右侧）
    cv.rect(456, 70, 474, 152, "RED3")
    cv.frame(456, 70, 474, 152, "WOOD2")
    br = rng_for(77)
    for i in range(5):
        fake_glyph(cv, 459, 76 + i * 15, 13, 13, "YEL4", br, weight=1)
    cv.hline(456, 474, 152, "WOOD2")
    for x in range(457, 474, 4):
        cv.vline(x, 153, 155, "RED2")

    # ---- 中间：半开卷帘门（店面）
    dx0, dx1 = 122, 296
    cv.rect(dx0 - 4, 110, dx1 + 4, 162, "GREY5")            # 门洞外框
    cv.frame(dx0 - 4, 110, dx1 + 4, 162, "GREY3")
    cv.rect(dx0, 110, dx1, 162, "GREY1")                    # 店内黑暗
    # 店内：货架 + 卡带堆 + 一台亮着的电视
    for shx in (dx0 + 8, dx0 + 60, dx0 + 118):
        cv.rect(shx, 132, shx + 40, 160, "GREY2")
        for y in range(136, 160, 6):
            cv.hline(shx + 1, shx + 39, y, "GREY3")
        for i in range(6):
            bx = shx + 3 + i * 6
            cv.rect(bx, 138, bx + 4, 143, "GREY3" if i % 2 else "GREY4")
    cv.rect(dx0 + 66, 118, dx0 + 90, 136, "GREY3")          # 店内电视
    cv.rect(dx0 + 69, 121, dx0 + 87, 133, "BLU2")
    for y in range(121, 134, 2):
        cv.hline(dx0 + 69, dx0 + 87, y, "BLU3")
    # 卷帘（上半，半开）
    cv.rect(dx0, 110, dx1, 128, "GREY6")
    for y in range(110, 129):
        c = "GREY7" if (y - 110) % 3 == 0 else ("GREY5" if (y - 110) % 3 == 1 else "GREY6")
        cv.hline(dx0, dx1, y, c)
    cv.hline(dx0, dx1, 128, "GREY3")
    cv.hline(dx0, dx1, 129, "GREY2")
    # 卷帘上的旧涂鸦 + 锈迹
    for _ in range(40):
        x = rng.randint(dx0, dx1)
        y = rng.randint(110, 127)
        cv.rect(x, y, x + rng.randint(0, 2), y, "WOOD5")
    # 导轨
    cv.rect(dx0 - 4, 110, dx0 - 1, 162, "GREY4")
    cv.rect(dx1 + 1, 110, dx1 + 4, 162, "GREY4")
    cv.vline(dx0 - 3, 110, 162, "GREY6")
    cv.vline(dx1 + 3, 110, 162, "GREY6")
    # 门楣小灯箱
    cv.rect(dx0 + 30, 100, dx0 + 120, 108, "WOOD7")
    cv.frame(dx0 + 30, 100, dx0 + 120, 108, "WOOD3")
    fake_text(cv, dx0 + 34, 102, 82, 5, "RED3", rng_for(9), gap=3)

    # ---- 右侧：全关的卷帘门
    rx0, rx1 = 340, 440
    cv.rect(rx0 - 3, 112, rx1 + 3, 162, "GREY4")
    cv.rect(rx0, 112, rx1, 162, "GREY6")
    for y in range(112, 163):
        if (y - 112) % 4 == 0:
            cv.hline(rx0, rx1, y, "GREY7")
        elif (y - 112) % 4 == 2:
            cv.hline(rx0, rx1, y, "GREY5")
    cv.frame(rx0 - 3, 112, rx1 + 3, 162, "GREY3")
    # 锈斑 + 涂鸦 + 挂锁
    for _ in range(60):
        x = rng.randint(rx0, rx1)
        y = rng.randint(112, 160)
        cv.rect(x, y, x + rng.randint(0, 3), y + rng.randint(0, 1), "WOOD5" if rng.random() < 0.6 else "WOOD4")
    gr = rng_for(31)
    fake_text(cv, rx0 + 14, 126, 70, 9, "RED3", gr, gap=4)
    cv.rect(rx0 + 46, 154, rx0 + 54, 160, "GREY7")
    cv.rect(rx0 + 48, 156, rx0 + 52, 158, "INK")
    # 贴在墙上的小海报（小旋风）
    cv.rect(306, 122, 332, 150, "WOOD7")
    cv.frame(306, 122, 332, 150, "WOOD3")
    cv.rect(308, 124, 330, 134, "RED3")
    fake_text(cv, 309, 126, 20, 6, "YEL4", rng_for(5), gap=2)
    cv.rect(310, 137, 328, 148, "GREY7")
    cv.rect(313, 139, 325, 146, "GREY3")

    # ---- 台阶 / 路缘
    cv.rect(0, 160, 479, 165, "GREY7")
    cv.hline(0, 479, 160, "GREY8")
    cv.hline(0, 479, 165, "GREY4")
    for x in range(0, 480, 26):
        cv.vline(x, 161, 164, "GREY6")
    cv.rect(110, 166, 310, 170, "GREY6")
    cv.hline(110, 310, 166, "GREY7")
    cv.hline(110, 310, 170, "GREY4")

    # ---- 水泥路面
    for y in range(166, 270):
        lv = (y - 166) / 104.0
        for x in range(480):
            if 110 <= x <= 310 and y <= 170:
                continue
            base = "GREY5" if bayer(x, y, 0.45 + 0.2 * lv, 8) else "GREY6"
            cv.set(x, y, base)
    # 路面伸缩缝（近大远小，克制，别做成地砖）
    seams = [186, 224]
    for sy in seams:
        cv.hline(0, 479, sy, "GREY4")
        cv.hline(0, 479, sy + 1, "GREY6")
    for i, sy in enumerate([166] + seams):
        y1 = seams[i] if i < len(seams) else 269
        step = 150 + i * 30
        for x in range(70 + i * 40, 480, step):
            cv.vline(x, sy, y1, "GREY4")
    # 裂缝
    for seed in (3, 8, 15):
        r2 = rng_for(seed)
        x = r2.randint(20, 440)
        y = r2.randint(180, 250)
        for _ in range(r2.randint(24, 48)):
            cv.set(x, y, "GREY4")
            cv.set(x, y + 1, "GREY5")
            x += r2.choice([1, 1, 2, 0, 1])
            y += r2.choice([-1, 0, 0, 1])
    # 水渍（浅、扁、带亮边，别做成地上的坑）
    for cxx, cyy, rr in ((84, 226, 22), (338, 250, 26), (238, 262, 15)):
        for y in range(cyy - rr // 3 - 1, cyy + rr // 3 + 2):
            for x in range(cxx - rr, cxx + rr + 1):
                e = ((x - cxx) / float(rr)) ** 2 + ((y - cyy) / (rr / 3.0)) ** 2
                if e <= 1.0:
                    if bayer(x, y, 0.42, 8):
                        cv.set(x, y, "GREY5")
                    elif bayer(x + 2, y, 0.14, 8):
                        cv.set(x, y, "GREY7")   # 反光
                elif e <= 1.35 and bayer(x, y, 0.2, 8):
                    cv.set(x, y, "GREY5")       # 洇开的湿边
    # 井盖
    cv.disc(410, 214, 13, "GREY4")
    cv.ring(410, 214, 13, "GREY3", 2)
    for y in range(202, 227):
        for x in range(398, 423):
            if (x - 410) ** 2 + (y - 214) ** 2 <= 110 and (x + y) % 3 == 0:
                cv.set(x, y, "GREY5")
    # 零碎垃圾
    for _ in range(70):
        x = rng.randint(0, 479)
        y = rng.randint(172, 269)
        cv.set(x, y, rng.choice(["GREY4", "GREY7", "WOOD5"]))

    # ---- 电线杆（前景）+ 乱线
    def pole(px_, top, bottom, w):
        cv.rect(px_, top, px_ + w, bottom, "GREY6")
        cv.vline(px_, top, bottom, "GREY7")
        cv.vline(px_ + w, top, bottom, "GREY4")
        for y in range(top, bottom, 7):
            cv.hline(px_, px_ + w, y, "GREY5")

    pole(58, 0, 200, 6)
    # 横担 + 绝缘子
    cv.rect(44, 22, 78, 24, "GREY4")
    for ix in (46, 60, 74):
        cv.rect(ix, 18, ix + 3, 21, "GREY7")
    cv.rect(48, 34, 74, 36, "GREY4")
    # 变压器箱
    cv.rect(64, 44, 80, 62, "GREY5")
    cv.frame(64, 44, 80, 62, "GREY3")
    for y in range(46, 61, 3):
        cv.hline(65, 79, y, "GREY6")
    pole(444, 6, 178, 4)
    cv.rect(436, 26, 458, 28, "GREY4")
    # 电线：下垂弧线，横七竖八
    def wire(x0, y0, x1, y1, sag, c="INK"):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            t = (x - x0) / float(max(1, x1 - x0))
            y = y0 + (y1 - y0) * t + sag * (4 * t * (1 - t))
            cv.set(x, int(round(y)), c)

    wire(0, 12, 61, 24, 6)
    wire(64, 24, 447, 28, 22)
    wire(64, 20, 447, 30, 10)
    wire(64, 36, 447, 40, 30)
    wire(0, 30, 61, 36, 8)
    wire(448, 28, 479, 18, 5)
    wire(64, 26, 300, 96, 14)
    wire(64, 52, 240, 104, 10)
    # 缠成一团的乱线（几个线圈，不要一坨黑）
    for (lx, ly, lrx, lry) in ((68, 68, 9, 5), (72, 74, 7, 4), (66, 78, 10, 4), (74, 66, 5, 3)):
        for a_ in range(0, 360, 8):
            import math
            x = int(round(lx + math.cos(math.radians(a_)) * lrx))
            y = int(round(ly + math.sin(math.radians(a_)) * lry))
            cv.set(x, y, "INK")
    cv.line(64, 62, 68, 68, "INK")
    cv.line(76, 70, 74, 94, "INK")     # 线头收进杆上的小广告后面，不留悬空孤点
    cv.line(66, 82, 58, 96, "INK")
    # 杆上贴的小广告
    cv.rect(60, 92, 76, 108, "WOOD7")
    fake_text(cv, 61, 96, 14, 5, "INK", rng_for(2), gap=2)
    cv.rect(58, 128, 74, 140, "GREY8")
    fake_text(cv, 59, 131, 14, 5, "RED3", rng_for(6), gap=2)
    # 杆底阴影
    for x in range(50, 72):
        for y in range(196, 204):
            if bayer(x, y, 0.5):
                cv.set(x, y, "GREY4")

    return save(cv, os.path.join(OUT, "bg_market.png"), expect=(480, 270))


# ------------------------------------------------------------------ stall
def gen_stall():
    rng = rng_for(1234)
    cv = Canvas(156, 74)

    shells = [("GREY7", "GREY5", "GRN3"), ("GRN3", "GRN1", "YEL3"), ("RED3", "RED1", "BLU4"),
              ("BLU3", "BLU1", "RED4"), ("YEL3", "YEL1", "GRN4"), ("GREY5", "GREY3", "PUR3"),
              ("PUR3", "PUR1", "YEL4"), ("WOOD6", "WOOD3", "BLU3")]
    # 斜插的一排卡带（只露上 2/3）
    for i, (shell, dark, label) in enumerate(shells):
        x = 8 + i * 17
        cart_mini(cv, x, 4, 15, 28, shell, dark, label, lean=2, rng=rng)

    # 摊面木板
    cv.rect(0, 30, 155, 33, "WOOD5")           # 台面受光
    cv.rect(0, 34, 155, 41, "WOOD4")           # 前立面
    cv.hline(0, 155, 30, "WOOD6")
    cv.hline(0, 155, 41, "WOOD2")
    cv.hline(0, 155, 42, "WOOD1")
    cv.vline(0, 30, 42, "WOOD2")
    cv.vline(155, 30, 42, "WOOD2")
    # 木纹
    for _ in range(30):
        y = rng.randint(35, 40)
        x = rng.randint(2, 140)
        cv.hline(x, x + rng.randint(4, 14), y, "WOOD3")
    for _ in range(10):
        x = rng.randint(2, 150)
        cv.hline(x, x + rng.randint(6, 20), 31 + rng.randint(0, 2), "WOOD6")
    # 板缝
    cv.vline(52, 30, 41, "WOOD2")
    cv.vline(104, 30, 41, "WOOD2")

    # 支架：两个 X 形木架
    for bx in (18, 118):
        cv.line(bx, 43, bx + 20, 72, "WOOD3", 2)
        cv.line(bx + 20, 43, bx, 72, "WOOD3", 2)
        cv.rect(bx - 2, 70, bx + 22, 72, "WOOD2")
    cv.rect(20, 56, 136, 58, "WOOD3")          # 横撑
    cv.hline(20, 136, 56, "WOOD4")

    # 纸板价目牌（挂在摊前，略歪）
    cv.vline(62, 42, 45, "GREY4")
    cv.vline(92, 42, 44, "GREY4")
    sx0, sy0, sx1, sy1 = 58, 45, 98, 65
    for j in range(sy1 - sy0 + 1):
        off = 1 if j > 10 else 0
        cv.hline(sx0 + off, sx1 + off, sy0 + j, "WOOD6")
    cv.frame(sx0, sy0, sx1, sy1, "WOOD3")
    tr = rng_for(88)
    fake_text(cv, sx0 + 3, sy0 + 3, 34, 6, "INK", tr, gap=2)
    # RED3 数字纹
    for i in range(3):
        nx = sx0 + 5 + i * 11
        cv.rect(nx, sy0 + 12, nx + 6, sy0 + 13, "RED3")
        cv.rect(nx, sy0 + 16, nx + 6, sy0 + 17, "RED3")
        cv.vline(nx + (6 if i % 2 else 0), sy0 + 12, sy0 + 17, "RED3")
        cv.rect(nx, sy0 + 14, nx + 6, sy0 + 15, "RED3" if i == 1 else "WOOD6")

    # 摊下两个纸箱
    carton(cv, 2, 50, 34, 72, rng)
    carton(cv, 112, 54, 150, 72, rng)
    # 箱里露出的卡带
    for i, c in enumerate(["GREY7", "GRN3", "BLU3"]):
        cv.rect(116 + i * 10, 50, 123 + i * 10, 55, c)
        cv.frame(116 + i * 10, 50, 123 + i * 10, 55, "GREY3")

    # 摊腿接地投影（棋盘抖动 = 半透明感）
    for bx in (18, 118):
        for x in range(bx - 4, bx + 27):
            if 0 <= x <= 155 and bayer(x, 73, 0.55, 4):
                cv.set(x, 73, "GREY4")
    for x in range(2, 152):
        if bayer(x, 73, 0.18, 4):
            cv.set(x, 73, "GREY5")

    return save(cv, os.path.join(OUT, "stall.png"), expect=(156, 74))


# ------------------------------------------------------------------ umbrella
def gen_umbrella():
    """破旧遮阳伞：正面圆顶（透镜形轮廓）+ 放射 6 格 + 扇贝下沿 + 一格破洞露天"""
    import math
    cv = Canvas(100, 54)
    AX, AY = 50, 2          # 顶点
    NW = 6

    def t_of(x):
        return (x - AX) / 48.0

    def top_of(x):
        t = max(-1.0, min(1.0, t_of(x)))
        return AY + 22.0 * (1.0 - math.sqrt(max(0.0, 1.0 - t * t)))

    def bot_of(x):
        t = t_of(x)
        k = (x - 2) / (96.0 / NW)
        f = k - int(k)
        dip = 3.5 * (1.0 - (2.0 * f - 1.0) ** 2)        # 每格中间下垂（扇贝）
        return 36.0 - 10.0 * (t * t) + dip

    def wedge_of(x, y):
        ang = math.degrees(math.atan2(max(0.4, y - AY), (x - AX)))   # 0=右, 180=左
        k = int((180.0 - ang) / 180.0 * NW)
        return max(0, min(NW - 1, k))

    for x in range(2, 98):
        ty = int(round(top_of(x)))
        by = int(round(bot_of(x)))
        if by < ty:
            continue
        for y in range(ty, by + 1):
            k = wedge_of(x, y)
            red = (k % 2 == 0)
            outer = k in (0, NW - 1)         # 两侧格背光，压暗一档
            if red:
                c = "RED2" if outer else "RED3"
            else:
                c = "GREY7" if outer else "GREY8"
            cv.set(x, y, c)
            # 布料褶皱：仅在下沿附近做少量 dither
            if by - y <= 4 and bayer(x, y, 0.28, 4):
                cv.set(x, y, ("RED1" if outer else "RED2") if red else ("GREY5" if outer else "GREY7"))
        # 上缘受光 1px
        red0 = (wedge_of(x, ty + 1) % 2 == 0)
        cv.set(x, ty, "RED4" if red0 else "WHITE")
        # 下沿暗边 2px（布料垂坠）
        redb = (wedge_of(x, by) % 2 == 0)
        cv.set(x, by, "RED1" if redb else "GREY5")
        if by - 1 > ty:
            cv.set(x, by - 1, "RED2" if redb else "GREY7")
    # 伞骨：沿放射方向的分界线
    for i in range(NW + 1):
        ang = math.radians(180.0 - i * (180.0 / NW))
        for r in range(3, 60):
            x = int(round(AX + math.cos(ang) * r))
            y = int(round(AY + math.sin(ang) * r * 0.62))
            if not (0 <= x < 100 and 0 <= y < 54):
                break
            if cv.alpha(x, y) == 0:
                continue
            cv.set(x, y, "GREY4")
    # 顶帽
    cv.rect(48, 0, 51, 4, "GREY5")
    cv.set(49, 0, "GREY7")
    cv.set(50, 4, "GREY3")
    # 破洞（右侧一格，露天）：不规则撕口，不要圆形
    hr = rng_for(9)
    hcx, hcy = 74, 24
    def hole_lim(th):
        return 0.70 + 0.30 * math.sin(3.0 * th + 0.7) + 0.12 * math.sin(7.0 * th + 2.1)

    for y in range(hcy - 9, hcy + 10):
        for x in range(hcx - 11, hcx + 12):
            if cv.alpha(x, y) == 0:
                continue
            dx = (x - hcx) / 7.5
            dy = (y - hcy) / 4.8
            rr = math.hypot(dx, dy)
            if rr < 0.05:
                cv.set(x, y, None)
                continue
            lim = hole_lim(math.atan2(dy, dx))
            if rr <= lim or (rr <= lim + 0.12 and hr.random() < 0.45):
                cv.set(x, y, None)
    # 撕口毛边：只在洞的下缘/左缘留几撮布头，避免描出一圈灰环
    for x in range(hcx - 12, hcx + 13):
        for y in range(hcy - 10, hcy + 11):
            if cv.alpha(x, y) == 0:
                continue
            below_hole = cv.alpha(x, y - 1) == 0 and y > int(round(top_of(x))) + 2
            side_hole = (cv.alpha(x - 1, y) == 0 or cv.alpha(x + 1, y) == 0)
            if below_hole and hr.random() < 0.75:
                red = (wedge_of(x, y) % 2 == 0)
                cv.set(x, y, "RED1" if red else "GREY5")
            elif side_hole and hr.random() < 0.35:
                red = (wedge_of(x, y) % 2 == 0)
                cv.set(x, y, "RED1" if red else "GREY6")
    # 一根折断外露的伞骨 + 一处撕下垂布
    cv.line(90, 28, 97, 24, "GREY4")
    cv.line(97, 24, 98, 31, "GREY4")
    cv.set(97, 24, "GREY6")
    cv.rect(20, 30, 23, 37, "RED3")
    cv.set(20, 37, "RED1")
    cv.set(23, 36, "RED1")
    # 伞杆（只画伞面以下，避免压在伞面上）
    cv.vline(49, 36, 53, "GREY6")
    cv.vline(50, 36, 53, "GREY4")
    for y in range(40, 54, 5):
        cv.set(49, y, "GREY7")
    cv.rect(46, 44, 53, 46, "GREY5")          # 滑块
    cv.frame(46, 44, 53, 46, "GREY3")
    cv.set(47, 45, "GREY7")
    return save(cv, os.path.join(OUT, "umbrella.png"), expect=(100, 54))


# ------------------------------------------------------------------ bicycle
def gen_bicycle():
    cv = Canvas(56, 38)
    rng = rng_for(2828)

    def wheel(cx, cy, r):
        cv.ring(cx, cy, r, "INK", 2)
        cv.ring(cx, cy, r - 2, "GREY6", 1)
        cv.ring(cx, cy, r - 3, "GREY4", 1)
        for a in range(0, 360, 30):
            import math
            dx = math.cos(math.radians(a))
            dy = math.sin(math.radians(a))
            for t in range(2, r - 3):
                x = int(round(cx + dx * t))
                y = int(round(cy + dy * t))
                if (x + y) % 2 == 0:
                    cv.set(x, y, "GREY5")
        cv.rect(cx - 1, cy - 1, cx + 1, cy + 1, "GREY7")

    wheel(11, 26, 10)
    wheel(44, 26, 10)
    # 车架（二八大杠：粗直管）
    cv.line(11, 26, 27, 12, "INK", 2)          # 后上叉
    cv.line(11, 26, 30, 28, "INK", 2)          # 后下叉
    cv.line(30, 28, 27, 12, "INK", 2)          # 座管
    cv.line(27, 12, 43, 11, "INK", 2)          # 上管
    cv.line(30, 28, 43, 11, "INK", 2)          # 下管
    cv.line(43, 11, 44, 25, "INK", 2)          # 前叉
    cv.set(28, 13, "GREY6")
    cv.set(34, 12, "GREY6")
    cv.set(37, 20, "GREY6")
    # 车把（立管 + 横把 + 两端胶把，结构画清楚）
    cv.vline(43, 5, 11, "INK")
    cv.vline(44, 6, 11, "GREY4")
    cv.hline(35, 51, 5, "INK")
    cv.hline(36, 50, 6, "GREY5")
    cv.set(34, 6, "INK")
    cv.set(52, 6, "INK")
    cv.rect(32, 5, 35, 6, "GREY3")
    cv.rect(51, 5, 54, 6, "GREY3")
    cv.set(33, 5, "GREY5")
    cv.set(53, 5, "GREY5")
    # 车座
    cv.rect(23, 9, 31, 11, "WOOD5")
    cv.hline(23, 31, 9, "WOOD6")
    cv.hline(24, 31, 11, "WOOD2")
    cv.set(22, 10, "WOOD4")
    # 脚踏 / 牙盘
    cv.disc(30, 28, 3, "GREY5")
    cv.set(30, 28, "GREY7")
    cv.line(30, 28, 33, 32, "GREY4")
    cv.rect(33, 32, 36, 33, "GREY6")
    cv.line(11, 26, 30, 28, "GREY4")           # 链条
    # 后座（货架）+ 绑着的纸箱
    cv.rect(2, 14, 22, 15, "GREY5")
    cv.line(4, 15, 9, 22, "GREY5")
    cv.line(20, 15, 13, 22, "GREY5")
    carton(cv, 3, 3, 21, 14, rng, text=False)
    cv.vline(8, 3, 14, "INK")                  # 捆绳
    cv.vline(16, 3, 14, "INK")
    cv.hline(3, 21, 7, "INK")
    # 车铃 + 挡泥板
    cv.disc(40, 11, 2, "GREY7")
    for x in range(3, 20):
        import math
        y = int(round(26 - math.sqrt(max(0, 12 * 12 - (x - 11) ** 2))))
        cv.set(x, y, "GREY6")
    for x in range(36, 53):
        import math
        y = int(round(26 - math.sqrt(max(0, 12 * 12 - (x - 44) ** 2))))
        cv.set(x, y, "GREY6")
    # 地面阴影（车轮下加重，抖动过渡）
    for x in range(2, 54):
        if bayer(x, 37, 0.35, 4):
            cv.set(x, 37, "GREY5")
    for cxw in (11, 44):
        for x in range(cxw - 8, cxw + 9):
            if 0 <= x < 56 and bayer(x, 37, 0.75, 4):
                cv.set(x, 37, "GREY4")
    return save(cv, os.path.join(OUT, "bicycle.png"), expect=(56, 38))


# ------------------------------------------------------------------ crate
def gen_crate():
    rng = rng_for(777)
    cv = Canvas(42, 32)
    # 1) 箱内暗部
    cv.rect(4, 8, 37, 16, "WOOD2")
    # 2) 箱内露出的卡带与泡沫
    for i, (c, d) in enumerate((("GREY7", "GREY5"), ("GRN3", "GRN1"), ("BLU3", "BLU1"), ("RED3", "RED1"))):
        x = 9 + i * 6
        top = 5 + (i % 2) * 2
        cv.rect(x, top, x + 4, 15, c)
        cv.frame(x, top, x + 4, 15, d)
        cv.hline(x + 1, x + 3, top + 2, "GREY8")
    for x in range(5, 37):
        for y in range(11, 16):
            if bayer(x, y, 0.3) and cv.get(x, y)[:3] == (70, 41, 26):
                cv.set(x, y, "GREY8")
    # 3) 敞开的两片箱盖（向外翻的梯形）
    def flap(quad, face, edge):
        cv.tri([quad[0], quad[1], quad[2]], face)
        cv.tri([quad[0], quad[2], quad[3]], face)
        for i in range(4):
            a = quad[i]
            b = quad[(i + 1) % 4]
            cv.line(a[0], a[1], b[0], b[1], edge)

    flap([(3, 15), (18, 15), (14, 5), (0, 8)], "WOOD5", "WOOD3")
    flap([(21, 15), (38, 15), (41, 7), (25, 4)], "WOOD6", "WOOD3")
    # 盖面折痕
    cv.line(2, 12, 13, 8, "WOOD4")
    cv.line(24, 11, 39, 9, "WOOD5")
    # 4) 箱体
    cv.rect(2, 15, 39, 30, "WOOD6")
    cv.rect(34, 15, 39, 30, "WOOD5")
    cv.frame(2, 15, 39, 30, "WOOD4")
    cv.hline(3, 38, 16, "WOOD7")
    cv.vline(33, 16, 29, "WOOD4")
    # 抽象字纹
    fake_text(cv, 5, 19, 22, 5, "WOOD3", rng, gap=2)
    fake_text(cv, 5, 26, 13, 4, "WOOD3", rng, gap=2)
    # 易碎三角图标
    cv.tri([(28, 19), (23, 28), (33, 28)], "WOOD3")
    cv.tri([(28, 21), (25, 27), (31, 27)], "WOOD6")
    cv.vline(28, 22, 25, "WOOD3")
    cv.set(28, 26, "WOOD3")
    # 磨损
    for _ in range(18):
        x = rng.randint(3, 38)
        y = rng.randint(17, 29)
        cv.set(x, y, "WOOD5")
    cv.hline(3, 39, 31, "WOOD2")
    # 接地投影（棋盘抖动，读作半透明）
    for x in range(0, 42):
        if bayer(x, 31, 0.5, 4):
            cv.set(x, 31, "GREY4")
    return save(cv, os.path.join(OUT, "crate.png"), expect=(42, 32))


# ------------------------------------------------------------------ bg_friend
def poster(cv, x0, y0, w, h, rng, kind):
    x1, y1 = x0 + w - 1, y0 + h - 1
    if kind == "star":
        cv.rect(x0, y0, x1, y1, "PUR2")
        cv.frame(x0, y0, x1, y1, "PUR1")
        # 抽象人像
        cv.rect(x0 + 3, y0 + 3, x1 - 3, y1 - 8, "PUR3")
        cx = (x0 + x1) // 2
        cv.disc(cx, y0 + h // 3, max(3, w // 6), "SKN3")
        cv.rect(cx - w // 6, y0 + h // 3 - w // 6 - 1, cx + w // 6, y0 + h // 3 - w // 8, "INK")
        cv.rect(cx - w // 5, y0 + h // 3 + w // 6, cx + w // 5, y1 - 6, "PUR4")
        fake_text(cv, x0 + 3, y1 - 5, w - 6, 4, "YEL4", rng, gap=2)
    elif kind == "award":
        cv.rect(x0, y0, x1, y1, "YEL4")
        cv.frame(x0, y0, x1, y1, "RED3", 2)
        for x in range(x0 + 2, x1 - 1, 3):
            cv.set(x, y0 + 2, "RED4")
            cv.set(x, y1 - 2, "RED4")
        fake_text(cv, x0 + 5, y0 + 5, w - 10, 5, "INK", rng, gap=2)
        fake_text(cv, x0 + 5, y0 + 13, w - 14, 4, "INK", rng, gap=2)
        cv.disc(x1 - 7, y1 - 6, 3, "RED3")
    else:  # calendar / print
        cv.rect(x0, y0, x1, y1, "GREY8")
        cv.frame(x0, y0, x1, y1, "GREY5")
        cv.rect(x0 + 2, y0 + 2, x1 - 2, y0 + h // 2, "YEL3")
        cv.disc(x0 + w // 3, y0 + h // 3, max(2, w // 8), "RED4")
        for y in range(y0 + h // 2 + 2, y1 - 1, 3):
            for x in range(x0 + 3, x1 - 2, 4):
                cv.set(x, y, "INK" if (x + y) % 3 else "RED3")
    # 四角胶带
    for (tx, ty) in ((x0, y0), (x1 - 2, y0), (x0, y1 - 2), (x1 - 2, y1 - 2)):
        cv.rect(tx, ty, tx + 2, ty + 2, "GREY8")


def gen_bg_friend():
    rng = rng_for(880808)
    cv = Canvas(480, 270)
    # ---- 墙（暖、旧）
    for y in range(0, 200):
        lv = y / 200.0
        for x in range(480):
            c = "WOOD7" if bayer(x, y, 0.55 - 0.25 * lv, 8) else "WOOD6"
            cv.set(x, y, c)
    # 天花板边线 + 斜阳光斑
    cv.hline(0, 479, 0, "WOOD5")
    cv.hline(0, 479, 1, "WOOD7")
    for y in range(4, 120):
        for x in range(150, 330):
            if bayer(x, y, 0.22, 8) and (x + y) % 3:
                cv.set(x, y, "WOOD7")
    # 墙面污渍 / 钉孔
    for _ in range(90):
        x = rng.randint(0, 479)
        y = rng.randint(4, 196)
        cv.rect(x, y, x + rng.randint(0, 2), y + rng.randint(0, 1), "WOOD5")
    # 踢脚线
    cv.rect(0, 193, 479, 199, "WOOD3")
    cv.hline(0, 479, 193, "WOOD4")
    cv.hline(0, 479, 199, "WOOD1")
    # 墙根返潮：墙皮剥落 + 掉下来的碎屑
    for (px, pw) in ((26, 30), (96, 18), (208, 24), (318, 14), (410, 22)):
        for y in range(186, 200):
            for x in range(px, px + pw):
                t = (y - 186) / 14.0
                if bayer(x, y, 0.25 + 0.6 * t, 8):
                    cv.set(x, y, "GREY7" if bayer(x, y, 0.45, 4) else "WOOD5")
        for _ in range(pw // 3):
            cx = rng.randint(px - 2, px + pw + 2)
            cy = rng.randint(200, 206)
            cv.set(cx, cy, "GREY7")
            if rng.random() < 0.5:
                cv.set(cx + 1, cy, "WOOD5")

    # ---- 木地板（近处板宽变大）
    y = 200
    rows = [(200, 208), (209, 218), (219, 230), (231, 245), (246, 262), (263, 269)]
    for i, (ya, yb) in enumerate(rows):
        for yy in range(ya, yb + 1):
            for x in range(480):
                c = "WOOD5" if bayer(x, yy, 0.5, 8) else "WOOD4"
                cv.set(x, yy, c)
        cv.hline(0, 479, ya, "WOOD3")
        cv.hline(0, 479, min(yb, 269), "WOOD2")
        for yy in range(ya + 1, yb):
            if (yy - ya) % 3 == 1:
                for x in range(0, 480, 2):
                    cv.set(x, yy, "WOOD6")
        step = 52 + i * 12
        for x in range((i * 17) % step, 480, step):
            cv.vline(x, ya, yb, "WOOD3")
    # 地板反光
    for x in range(60, 240):
        for yy in range(202, 236):
            if bayer(x, yy, 0.12, 8):
                cv.set(x, yy, "WOOD6")

    # ---- 墙上贴满海报和奖状
    poster(cv, 18, 22, 52, 74, rng, "star")
    poster(cv, 78, 34, 44, 62, rng, "star")
    poster(cv, 132, 16, 60, 46, rng, "award")
    poster(cv, 200, 26, 46, 60, rng, "print")
    poster(cv, 254, 18, 56, 42, rng, "award")
    poster(cv, 140, 74, 48, 56, rng, "star")
    poster(cv, 200, 96, 54, 40, rng, "award")
    poster(cv, 262, 70, 40, 58, rng, "print")
    poster(cv, 316, 14, 44, 40, rng, "star")
    # 一张歪的
    for dx in range(0, 46):
        pass

    # ---- 右侧大衣柜
    wx0, wy0, wx1, wy1 = 336, 30, 474, 214
    cv.rect(wx0, wy0, wx1, wy1, "WOOD3")
    cv.frame(wx0, wy0, wx1, wy1, "WOOD1")
    cv.rect(wx0, wy0, wx1, wy0 + 6, "WOOD4")          # 顶檐
    cv.hline(wx0, wx1, wy0, "WOOD5")
    cv.hline(wx0, wx1, wy0 + 6, "WOOD1")
    # 两扇门
    mid = (wx0 + wx1) // 2
    cv.vline(mid, wy0 + 7, wy1 - 8, "WOOD1")
    cv.vline(mid + 1, wy0 + 7, wy1 - 8, "WOOD2")
    for (ax, bx) in ((wx0 + 5, mid - 4), (mid + 6, wx1 - 5)):
        cv.frame(ax, wy0 + 12, bx, wy1 - 14, "WOOD2")
        cv.frame(ax + 1, wy0 + 13, bx - 1, wy1 - 15, "WOOD4")
    # 左门镜子
    mx0, my0, mx1, my1 = wx0 + 12, wy0 + 20, mid - 11, wy1 - 22
    cv.rect(mx0, my0, mx1, my1, "GREY7")
    cv.frame(mx0, my0, mx1, my1, "WOOD2", 2)
    for y in range(my0 + 2, my1 - 1):
        for x in range(mx0 + 2, mx1 - 1):
            cv.set(x, y, "GREY8" if bayer(x, y, 0.22, 8) else "GREY7")
    # 镜中映出的房间：上半段暖墙 + 一张模糊红海报 + 下半段地板，横向干净分界
    mfloor = my1 - 26
    for y in range(mfloor, my1 - 1):
        for x in range(mx0 + 2, mx1 - 1):
            cv.set(x, y, "WOOD5" if bayer(x, y, 0.5, 8) else "WOOD4")
    cv.hline(mx0 + 2, mx1 - 2, mfloor, "WOOD3")
    for y in range(my0 + 3, mfloor):
        for x in range(mx0 + 2, mx1 - 1):
            if bayer(x, y, 0.30, 8):
                cv.set(x, y, "WOOD6")
    for y in range(my0 + 12, my0 + 34):
        for x in range(mx0 + 8, mx0 + 30):
            if bayer(x, y, 0.6, 8):
                cv.set(x, y, "RED2")
    # 镜面高光：3 条 45° 斜光带（上宽下窄），像玻璃反射而不是雪花
    for k, (ox, wd) in enumerate(((-16, 3), (10, 2), (30, 1))):
        for t in range(0, 150):
            x = mx0 + 6 + ox + t
            y = my0 + 4 + t
            if not (mx0 + 2 <= x <= mx1 - 2 and my0 + 2 <= y <= my1 - 2):
                continue
            for w in range(wd):
                if mx0 + 2 <= x + w <= mx1 - 2:
                    cv.set(x + w, y, "WHITE")
            if mx0 + 2 <= x + wd <= mx1 - 2 and bayer(x, y, 0.5, 4):
                cv.set(x + wd, y, "GREY8")
    # 拉手
    cv.rect(mid - 8, (wy0 + wy1) // 2 - 6, mid - 6, (wy0 + wy1) // 2 + 6, "GREY6")
    cv.rect(mid + 8, (wy0 + wy1) // 2 - 6, mid + 10, (wy0 + wy1) // 2 + 6, "GREY6")
    cv.vline(mid - 8, (wy0 + wy1) // 2 - 6, (wy0 + wy1) // 2 + 6, "GREY8")
    cv.vline(mid + 8, (wy0 + wy1) // 2 - 6, (wy0 + wy1) // 2 + 6, "GREY8")
    # 木纹
    for _ in range(120):
        x = rng.randint(wx0 + 2, wx1 - 2)
        y = rng.randint(wy0 + 8, wy1 - 2)
        cv.hline(x, x + rng.randint(4, 16), y, "WOOD2")
    # 柜顶堆的杂物：行李箱 + 纸箱 + 一叠书
    cv.rect(352, 14, 396, 30, "WOOD5")
    cv.frame(352, 14, 396, 30, "WOOD2")
    cv.hline(353, 395, 15, "WOOD6")
    cv.rect(370, 10, 380, 14, "WOOD4")
    carton(cv, 404, 8, 440, 30, rng)
    for i, c in enumerate(["BLU3", "RED3", "GRN3"]):
        cv.rect(446, 24 - i * 4, 470, 27 - i * 4, c)
        cv.frame(446, 24 - i * 4, 470, 27 - i * 4, "INK")
    # 柜脚阴影
    for x in range(wx0 - 6, wx1 + 1):
        for y in range(wy1 + 1, wy1 + 8):
            if bayer(x, y, 0.55, 4):
                cv.set(x, y, "WOOD2")

    # ---- 左侧 14 寸小电视（78×66）放在方凳上
    tx0, ty0 = 40, 126
    tx1, ty1 = tx0 + 77, ty0 + 65
    cv.rect(tx0, ty0, tx1, ty1, "WOOD6")
    cv.frame(tx0, ty0, tx1, ty1, "GREY3")
    cv.hline(tx0 + 1, tx1 - 1, ty0 + 1, "WOOD7")
    cv.hline(tx0 + 1, tx1 - 1, ty1 - 1, "WOOD5")
    # 旧化 dither
    for y in range(ty0 + 2, ty1 - 1):
        for x in range(tx0 + 1, tx1):
            if bayer(x, y, 0.2, 8):
                cv.set(x, y, "GREY7")
    # 屏幕（深色，圆角）
    sx0, sy0, sx1, sy1 = tx0 + 6, ty0 + 6, tx0 + 57, ty0 + 45
    cv.rect(sx0, sy0, sx1, sy1, "GREY2")
    cv.frame(sx0 - 1, sy0 - 1, sx1 + 1, sy1 + 1, "GREY3")
    for (cx, cy) in ((sx0, sy0), (sx1, sy0), (sx0, sy1), (sx1, sy1)):
        for i in range(3):
            for j in range(3 - i):
                if i + j < 3:
                    cv.set(cx + (i if cx == sx0 else -i), cy + (j if cy == sy0 else -j), "WOOD6")
    # 屏幕里微弱的画面 + 45° 玻璃高光
    for y in range(sy0 + 2, sy1 - 1):
        for x in range(sx0 + 2, sx1 - 1):
            if bayer(x, y, 0.18, 8):
                cv.set(x, y, "BLU1")
    for k in range(0, 40):
        x = sx0 + 4 + k
        y = sy1 - 6 - k
        if sx0 + 1 <= x <= sx1 - 1 and sy0 + 1 <= y <= sy1 - 1:
            cv.set(x, y, "GREY8")
            cv.set(x + 1, y, "GREY7")
    # 右侧控制面板
    cv.rect(tx0 + 60, ty0 + 6, tx1 - 3, ty0 + 45, "WOOD5")
    cv.frame(tx0 + 60, ty0 + 6, tx1 - 3, ty0 + 45, "WOOD3")
    cv.disc(tx0 + 68, ty0 + 14, 5, "GREY5")
    cv.ring(tx0 + 68, ty0 + 14, 5, "GREY3")
    cv.vline(tx0 + 68, ty0 + 10, ty0 + 13, "GREY8")
    cv.disc(tx0 + 68, ty0 + 28, 4, "GREY5")
    cv.ring(tx0 + 68, ty0 + 28, 4, "GREY3")
    cv.hline(tx0 + 68, tx0 + 71, ty0 + 28, "GREY8")
    cv.rect(tx0 + 64, ty0 + 36, tx0 + 73, ty0 + 40, "GREY6")
    cv.set(tx0 + 68, ty0 + 43, "RED4")
    cv.set(tx0 + 69, ty0 + 43, "RED4")
    # 下沿：喇叭孔 + 铭牌
    for y in range(ty1 - 14, ty1 - 4):
        for x in range(tx0 + 8, tx0 + 40):
            if (x + y) % 2 == 0:
                cv.set(x, y, "WOOD4")
    cv.rect(tx0 + 46, ty1 - 12, tx0 + 70, ty1 - 6, "GREY6")
    fake_text(cv, tx0 + 48, ty1 - 11, 20, 4, "GREY3", rng, gap=2)
    # 天线
    cv.line(tx0 + 20, ty0, tx0 + 6, ty0 - 22, "GREY6")
    cv.line(tx0 + 24, ty0, tx0 + 44, ty0 - 18, "GREY6")
    cv.disc(tx0 + 6, ty0 - 23, 1, "GREY7")
    cv.disc(tx0 + 44, ty0 - 19, 1, "GREY7")
    # 方凳
    stx0, sty0, stx1, sty1 = 32, 192, 130, 214
    cv.rect(stx0, sty0, stx1, sty0 + 5, "WOOD5")
    cv.hline(stx0, stx1, sty0, "WOOD6")
    cv.hline(stx0, stx1, sty0 + 5, "WOOD2")
    cv.rect(stx0 + 4, sty0 + 6, stx0 + 10, sty1, "WOOD4")
    cv.rect(stx1 - 10, sty0 + 6, stx1 - 4, sty1, "WOOD4")
    cv.rect(stx0 + 10, sty1 - 10, stx1 - 10, sty1 - 8, "WOOD3")
    cv.frame(stx0, sty0, stx1, sty0 + 5, "WOOD2")
    for x in range(stx0 - 4, stx1 + 5):
        for y in range(sty1 + 1, sty1 + 6):
            if bayer(x, y, 0.5, 4):
                cv.set(x, y, "WOOD2")

    # ---- 落地风扇
    fcx, fcy, fr = 268, 118, 30
    cv.disc(fcx, fcy, fr, "GREY5")
    cv.disc(fcx, fcy, fr - 2, "GREY3")
    # 扇罩同心圆 dither
    for y in range(fcy - fr, fcy + fr + 1):
        for x in range(fcx - fr, fcx + fr + 1):
            d2 = (x - fcx) ** 2 + (y - fcy) ** 2
            if d2 > (fr - 2) ** 2:
                continue
            d = int(round(d2 ** 0.5))
            if d % 4 in (0, 1):
                cv.set(x, y, "GREY6")
            elif bayer(x, y, 0.3, 4):
                cv.set(x, y, "GREY4")
    # 扇叶
    for k, a in enumerate((20, 140, 260)):
        import math
        for t in range(4, fr - 6):
            aa = math.radians(a + t * 1.6)
            x = int(round(fcx + math.cos(aa) * t))
            y = int(round(fcy + math.sin(aa) * t))
            for oy in range(-2, 3):
                for ox in range(-2, 3):
                    if (x + ox - fcx) ** 2 + (y + oy - fcy) ** 2 <= (fr - 5) ** 2:
                        if bayer(x + ox, y + oy, 0.5, 4):
                            cv.set(x + ox, y + oy, "GREY6")
    cv.disc(fcx, fcy, 6, "GREY6")
    cv.ring(fcx, fcy, 6, "GREY3")
    cv.disc(fcx - 2, fcy - 2, 2, "GREY8")
    cv.ring(fcx, fcy, fr, "GREY3", 2)
    # 支杆 + 底座
    cv.rect(fcx - 2, fcy + fr - 2, fcx + 2, 206, "GREY6")
    cv.vline(fcx - 2, fcy + fr, 206, "GREY7")
    cv.vline(fcx + 2, fcy + fr, 206, "GREY4")
    cv.rect(fcx - 12, 200, fcx + 12, 206, "GREY5")     # 调速盒
    cv.frame(fcx - 12, 200, fcx + 12, 206, "GREY3")
    for i in range(3):
        cv.rect(fcx - 8 + i * 6, 202, fcx - 6 + i * 6, 204, "GREY7")
    cv.ellipse(fcx, 212, 22, 5, "GREY5")
    cv.ellipse(fcx, 211, 22, 4, "GREY6")
    cv.ellipse(fcx, 210, 14, 3, "GREY7")
    # 电线：绕到墙上的插座，不穿过衣柜
    cv.line(fcx + 10, 212, 300, 216, "INK")
    cv.line(300, 216, 318, 210, "INK")
    cv.vline(318, 196, 210, "INK")
    cv.rect(313, 186, 323, 196, "GREY8")
    cv.frame(313, 186, 323, 196, "GREY5")
    cv.set(316, 190, "INK")
    cv.set(320, 190, "INK")

    # ---- 地上散落的卡带 / 拖鞋 / 杂物
    for (x, y, c, d) in ((150, 240, "GREY7", "GREY5"), (172, 252, "GRN3", "GRN1"),
                         (196, 236, "RED3", "RED1"), (120, 258, "BLU3", "BLU1"),
                         (300, 244, "YEL3", "YEL1"), (330, 258, "PUR3", "PUR1"),
                         (216, 262, "WOOD6", "WOOD3")):
        cv.rect(x, y, x + 15, y + 9, c)
        cv.frame(x, y, x + 15, y + 9, d)
        cv.rect(x + 3, y + 2, x + 12, y + 6, "GREY8")
        cv.rect(x + 4, y + 3, x + 11, y + 5, d)
        for xx in range(x - 1, x + 17):
            cv.set(xx, y + 10, "WOOD2" if (xx + y) % 2 == 0 else cv.get(xx, y + 10)[:3])
    # 拖鞋（不平行）
    for (sx, sy, dxx) in ((92, 246, 0), (108, 254, 1)):
        cv.ellipse(sx + 6, sy + 3, 7, 3, "BLU3")
        cv.ellipse(sx + 6, sy + 3, 5, 2, "BLU4")
        cv.line(sx + 2 + dxx, sy + 2, sx + 9 + dxx, sy + 4, "BLU2")
        cv.ellipse(sx + 6, sy + 4, 7, 3, "BLU1")
        cv.ellipse(sx + 6, sy + 3, 6, 2, "BLU3")
    # 汽水瓶 + 冰棍纸
    cv.rect(232, 226, 238, 244, "GRN3")
    cv.rect(233, 222, 237, 226, "GRN2")
    cv.rect(233, 220, 237, 222, "RED4")
    cv.rect(233, 232, 237, 240, "GRN5")
    for _ in range(30):
        x = rng.randint(140, 330)
        y = rng.randint(226, 268)
        cv.set(x, y, rng.choice(["WOOD3", "WOOD6", "GREY7"]))
    # 吊灯泡（闷热感）
    cv.vline(190, 0, 26, "INK")
    cv.rect(187, 26, 193, 32, "GREY6")
    cv.disc(190, 38, 7, "YEL4")
    cv.ring(190, 38, 7, "YEL3")
    for y in range(18, 64):
        for x in range(166, 216):
            d2 = (x - 190) ** 2 + (y - 38) ** 2
            if d2 > 24 * 24 or cv.get(x, y)[:3] in ((245, 219, 110), (224, 180, 34)):
                continue
            t = d2 ** 0.5 / 24.0
            if bayer(x, y, 0.55 - 0.5 * t, 8):
                cv.set(x, y, "YEL3" if t < 0.55 else "WOOD7")
    return save(cv, os.path.join(OUT, "bg_friend.png"), expect=(480, 270))


def main():
    os.makedirs(OUT, exist_ok=True)
    print("C1 集市 / C2 发小家 -> assets/img/market/")
    gen_bg_market()
    gen_stall()
    gen_umbrella()
    gen_bicycle()
    gen_crate()
    gen_bg_friend()


if __name__ == "__main__":
    main()
