#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D 组小游戏美术自查图生成器（只读资源，不改资源）。

输出 5 张预览图（QA 用，不进入游戏，因此不受 44 色板约束）：
  tools/preview_contra.png   —— 魂斗萝：模拟关卡 + 全部帧条
  tools/preview_tank.png     —— 铁甲坦克：模拟战场 + 全部帧条
  tools/preview_mario.png    —— 马里蘑：模拟关卡 + 全部帧条
  tools/preview_fight.png    —— 格斗：模拟对战 + 全部帧条
  tools/preview_tiles.png    —— 三套 tiles 4×4 平铺 + 三张背景左右接缝拼接

用法： python3 tools/preview_games.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG = os.path.join(ROOT, 'assets', 'img', 'games')

def _font(size):
    for path in ('/usr/share/fonts/truetype/SimHei.ttf',
                 '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
                 '/usr/share/fonts/truetype/source-han-sans/SourceHanSansSC-VF.ttf'):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


PAPER = (44, 46, 58)
PANEL = (70, 74, 92)
TXT = (236, 238, 244)
DIM = (168, 176, 196)


# ---------------------------------------------------------------- 基础工具
def load(game, name):
    return Image.open(os.path.join(IMG, game, name)).convert('RGBA')


def cut(img, fw, fh):
    """横向 sheet 切帧。"""
    n = img.width // fw
    return [img.crop((i * fw, 0, i * fw + fw, fh)) for i in range(n)]


def big(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def put(dst, src, x, y):
    dst.alpha_composite(src.convert('RGBA'), (int(x), int(y)))


F13 = None
F15 = None


def text(dst, x, y, s, col=TXT, big_=False):
    global F13, F15
    if F13 is None:
        F13, F15 = _font(13), _font(15)
    ImageDraw.Draw(dst).text((x, y), s, fill=col, font=F15 if big_ else F13)


def tile_row(dst, tile, x0, y, n):
    for i in range(n):
        put(dst, tile, x0 + i * tile.width, y)


def tile_area(dst, tile, x0, y0, w, h):
    for y in range(y0, y0 + h, tile.height):
        for x in range(x0, x0 + w, tile.width):
            put(dst, tile, x, y)


# ---------------------------------------------------------------- 帧条排版
class Board:
    """自上而下堆叠的预览画板。"""

    def __init__(self, w, title):
        self.w = w
        self.rows = []          # (kind, payload)
        self.title = title

    def scene(self, img, k=2, caption=''):
        self.rows.append(('scene', (img, k, caption)))

    def strip(self, name, frames, k=3, note=''):
        self.rows.append(('strip', (name, frames, k, note)))

    def render(self, path):
        # 预估高度
        h = 30
        for kind, p in self.rows:
            if kind == 'scene':
                h += p[0].height * p[1] + 26
            else:
                h += p[1][0].height * p[2] + 24
        out = Image.new('RGBA', (self.w, h), PAPER)
        text(out, 12, 7, self.title, TXT, True)
        y = 26
        for kind, p in self.rows:
            if kind == 'scene':
                img, k, cap = p
                text(out, 12, y, cap, DIM)
                y += 14
                sc = big(img, k)
                frame = Image.new('RGBA', (sc.width + 2, sc.height + 2), (0, 0, 0, 255))
                put(frame, sc, 1, 1)
                put(out, frame, 12, y)
                y += frame.height + 10
            else:
                name, frames, k, note = p
                text(out, 12, y, f'{name}  {len(frames)}帧 {frames[0].width}x'
                                 f'{frames[0].height}  {note}', DIM)
                y += 12
                fw, fh = frames[0].width * k, frames[0].height * k
                bar = Image.new('RGBA', (len(frames) * (fw + 4) + 4, fh + 4), PANEL)
                for i, f in enumerate(frames):
                    x = 4 + i * (fw + 4)
                    put(bar, big(f, k), x, 2)
                    ImageDraw.Draw(bar).line(
                        [(x - 2, 0), (x - 2, bar.height)], fill=(30, 32, 40, 255))
                put(out, bar, 12, y)
                y += bar.height + 10
        out.crop((0, 0, self.w, min(y + 4, out.height))).save(path)
        print(f'  ok {os.path.relpath(path, ROOT)}  {self.w}x{y + 4}')


# ---------------------------------------------------------------- D1 魂斗萝
def preview_contra():
    g = 'contra'
    hero = cut(load(g, 'hero.png'), 20, 26)
    sol = cut(load(g, 'enemy_soldier.png'), 18, 24)
    tur = cut(load(g, 'enemy_turret.png'), 24, 24)
    boss = cut(load(g, 'boss_wall.png'), 96, 88)
    bul = cut(load(g, 'bullet.png'), 6, 6)
    ebul = cut(load(g, 'bullet_enemy.png'), 6, 6)
    pw = cut(load(g, 'powerup.png'), 14, 14)
    ti = cut(load(g, 'tiles.png'), 16, 16)
    exp = cut(load(g, 'explosion.png'), 24, 24)

    sc = load(g, 'bg_jungle.png').copy()
    GY = 224                                    # 地面顶边
    tile_row(sc, ti[0], 0, GY, 23)              # 丛林地面顶
    tile_area(sc, ti[1], 0, GY + 16, 368, 32)   # 地面内部
    tile_row(sc, ti[2], 96, GY - 64, 4)         # 桥面平台
    tile_row(sc, ti[4], 208, GY - 48, 3)        # 可站立平台
    put(sc, ti[7], 176, GY - 16)                # 尖刺
    put(sc, boss[0], 248, GY - 88)              # BOSS 墙
    put(sc, hero[0], 24, GY - 26)               # 站立持枪
    put(sc, hero[2], 64, GY - 26)               # 跑
    put(sc, hero[3], 104, GY - 64 - 26)         # 跳跃（站桥上）
    put(sc, hero[4], 140, GY - 12)              # 卧倒
    put(sc, sol[0], 200, GY - 48 - 24)          # 平台上的敌兵
    put(sc, sol[2], 232, GY - 24)
    put(sc, tur[1], 176, GY - 40)
    put(sc, pw[0], 88, GY - 84)
    put(sc, bul[0], 46, GY - 18)
    put(sc, bul[1], 56, GY - 18)
    put(sc, ebul[0], 190, GY - 30)
    put(sc, exp[1], 150, GY - 96)
    put(sc, exp[3], 300, GY - 120)

    b = Board(760, 'PREVIEW D1 / contra  (mock scene 360x270 @2x)')
    b.scene(sc, 2, '模拟关卡：bg_jungle + tiles 地形 + 主角/敌兵/炮台/BOSS/子弹/道具/爆炸')
    b.strip('hero.png', hero, 3, '帧序 站/跑A/跑B/跳/卧/上射/中弹/死亡；除跳跃外脚底贴 26 行末行')
    b.strip('enemy_soldier.png', sol, 3, '走A/走B/射击/死亡')
    b.strip('enemy_turret.png', tur, 3, '开火 3 帧')
    b.strip('bullet.png', bul, 4, '闪烁 2 帧')
    b.strip('bullet_enemy.png', ebul, 4, '敌弹 2 帧')
    b.strip('powerup.png', pw, 3, 'M/S/L/R')
    b.strip('tiles.png', ti, 3, '地面顶/地面内/桥面/铁桥/平台/水A/水B/尖刺')
    b.strip('explosion.png', exp, 2, '5 帧')
    b.strip('boss_wall.png', boss, 1, '核心脉动 3 帧')
    b.render(os.path.join(HERE, 'preview_contra.png'))


# ---------------------------------------------------------------- D2 坦克
def preview_tank():
    g = 'tank'
    pl = cut(load(g, 'tank_player.png'), 16, 16)
    ea = cut(load(g, 'tank_enemy_a.png'), 16, 16)
    eb = cut(load(g, 'tank_enemy_b.png'), 16, 16)
    ec = cut(load(g, 'tank_enemy_c.png'), 16, 16)
    bul = cut(load(g, 'bullet.png'), 6, 6)
    ti = cut(load(g, 'tiles.png'), 16, 16)
    base = cut(load(g, 'base.png'), 32, 32)
    exp = cut(load(g, 'explosion.png'), 32, 32)
    it = cut(load(g, 'item.png'), 16, 16)
    sp = cut(load(g, 'spawn.png'), 16, 16)

    sc = Image.new('RGBA', (360, 270), (0, 0, 0, 255))
    tile_area(sc, ti[5], 0, 0, 360, 270)                 # 空地
    for x in range(32, 340, 64):                         # 砖墙立柱
        tile_area(sc, ti[0], x, 48, 32, 64)
    tile_area(sc, ti[1], 160, 144, 32, 32)               # 钢墙
    tile_area(sc, ti[3], 240, 144, 48, 32)               # 水面
    tile_area(sc, ti[4], 48, 144, 48, 32)                # 冰面
    tile_area(sc, ti[2], 96, 208, 64, 32)                # 草丛
    put(sc, base[0], 164, 232)                           # 老家
    tile_area(sc, ti[0], 148, 216, 16, 48)
    tile_area(sc, ti[0], 196, 216, 16, 48)
    tile_row(sc, ti[0], 148, 216, 4)
    put(sc, pl[0], 164, 208)                             # 玩家（上）
    put(sc, pl[2], 200, 208)                             # 玩家（右）
    put(sc, ea[4], 32, 16)                               # 敌 A 下
    put(sc, eb[4], 120, 16)
    put(sc, ec[6], 296, 96)                              # 敌 C 左
    put(sc, ea[2], 296, 16)
    put(sc, bul[0], 169, 196)
    put(sc, bul[2], 220, 213)
    put(sc, it[0], 264, 64)
    put(sc, it[4], 288, 208)
    put(sc, sp[1], 216, 16)
    put(sc, exp[2], 56, 96)

    b = Board(760, 'PREVIEW D2 / tank  (mock battlefield 360x270 @2x)')
    b.scene(sc, 2, '模拟战场：空地/砖墙/钢墙/水/冰/草丛 + 老家 + 四种坦克 + 炮弹/道具/出生点/爆炸')
    for nm, fr in (('tank_player.png', pl), ('tank_enemy_a.png', ea),
                   ('tank_enemy_b.png', eb), ('tank_enemy_c.png', ec)):
        b.strip(nm, fr, 4, '帧序：上A 上B 右A 右B 下A 下B 左A 左B')
    b.strip('bullet.png', bul, 5, '上/右/下/左')
    b.strip('tiles.png', ti, 3, '砖墙/钢墙/草丛/水/冰/空地')
    b.strip('base.png', base, 2, '完好/被摧毁')
    b.strip('item.png', it, 3, '星/头盔/手雷/铁锹/坦克/计时器')
    b.strip('spawn.png', sp, 3, '闪烁星芒 4 帧')
    b.strip('explosion.png', exp, 2, '5 帧')
    b.render(os.path.join(HERE, 'preview_tank.png'))


# ---------------------------------------------------------------- D3 马里蘑
def preview_mario():
    g = 'mario'
    hero = cut(load(g, 'hero.png'), 16, 24)
    hbig = cut(load(g, 'hero_big.png'), 16, 32)
    mush = cut(load(g, 'enemy_mush.png'), 16, 16)
    shell = cut(load(g, 'enemy_shell.png'), 16, 18)
    ti = cut(load(g, 'tiles.png'), 16, 16)
    it = cut(load(g, 'item.png'), 16, 16)
    coin = cut(load(g, 'coin_spin.png'), 16, 16)
    cloud = load(g, 'cloud.png')
    bush = load(g, 'bush.png')
    castle = load(g, 'castle.png')
    flag = cut(load(g, 'flag.png'), 14, 14)

    sc = load(g, 'bg_sky.png').copy()
    GY = 224
    tile_row(sc, ti[0], 0, GY, 23)
    tile_area(sc, ti[1], 0, GY + 16, 368, 32)
    put(sc, cloud, 40, 32)
    put(sc, cloud, 232, 20)
    put(sc, bush, 96, GY - 20)
    put(sc, castle, 264, GY - 80)
    put(sc, flag[1], 303, GY - 92)          # 旗杆对齐城堡中央塔顶
    for i, t in enumerate((ti[4], ti[2], ti[4], ti[5])):     # 砖 / ? / 砖 / 硬砖
        put(sc, t, 96 + i * 16, GY - 64)
    put(sc, ti[3], 160, GY - 64)                             # 敲空砖
    put(sc, ti[6], 208, GY - 32)                             # 管道口
    put(sc, ti[7], 224, GY - 32)
    put(sc, ti[8], 208, GY - 16)
    put(sc, ti[9], 224, GY - 16)
    put(sc, hero[0], 24, GY - 24)
    put(sc, hero[2], 56, GY - 24)
    put(sc, hbig[4], 120, GY - 32 - 40)                      # 大马里蘑跳跃
    put(sc, hbig[0], 176, GY - 32)
    put(sc, mush[0], 88, GY - 16)
    put(sc, shell[0], 152, GY - 18)
    put(sc, coin[1], 112, GY - 96)
    put(sc, it[0], 136, GY - 96)

    b = Board(760, 'PREVIEW D3 / mario  (mock scene 360x270 @2x)')
    b.scene(sc, 2, '模拟关卡：bg_sky + 地面/砖块/管道 + 小马里蘑/大马里蘑/怪/金币/城堡/旗')
    b.strip('hero.png', hero, 4, '站/跑A/跑B/跑C/跳/刹车/死亡（脚底对齐 24 行末行）')
    b.strip('hero_big.png', hbig, 4, '同帧序，16x32')
    b.strip('enemy_mush.png', mush, 4, '走A/走B/踩扁')
    b.strip('enemy_shell.png', shell, 4, '走A/走B/缩壳/壳滑行')
    b.strip('tiles.png', ti, 3, '地面砖/土/?砖/敲空/普通砖/硬砖/管口左右/管身左右')
    b.strip('item.png', it, 3, '蘑菇/花/金币/星')
    b.strip('coin_spin.png', coin, 3, '旋转 4 帧')
    b.strip('flag.png', flag, 3, '飘动 2 帧')
    b.strip('cloud / bush / castle', [cloud, bush, castle], 1, '单帧装饰')
    b.render(os.path.join(HERE, 'preview_mario.png'))


# ---------------------------------------------------------------- D4 格斗
def preview_fight():
    g = 'fight'
    p1 = cut(load(g, 'p1.png'), 40, 54)
    p2 = cut(load(g, 'p2.png'), 40, 54)
    spark = cut(load(g, 'hit_spark.png'), 24, 24)
    bar = load(g, 'hud_bar.png')
    por = cut(load(g, 'hud_portrait.png'), 28, 28)

    sc = load(g, 'bg_stage.png').copy()
    FY = 270 - 40                                  # 擂台地面顶
    GY = FY + 22                                   # 角色脚底
    put(sc, p1[0], 96, GY - 54)
    put(sc, p2[0], 216, GY - 54)
    put(sc, p1[4], 40, GY - 54)                    # 直拳
    put(sc, p2[9], 288, GY - 54)                   # 倒地
    put(sc, spark[1], 148, GY - 44)
    put(sc, por[0], 6, 6)
    put(sc, por[1], 326, 6)
    put(sc, bar, 38, 12)
    put(sc, bar.transpose(Image.FLIP_LEFT_RIGHT), 182, 12)

    b = Board(760, 'PREVIEW D4 / fight  (mock versus 360x270 @2x)')
    b.scene(sc, 2, '模拟对战：bg_stage + p1/p2 + HUD 血条与头像 + 命中特效')
    b.strip('p1.png', p1, 2, '站/前/后/蹲防/直拳/勾拳/踢/跳/被击/倒地')
    b.strip('p2.png', p2, 2, '同帧序，镜像面朝左')
    b.strip('hit_spark.png', spark, 3, '4 帧')
    b.strip('hud_portrait.png', por, 3, '1P / 2P')
    b.strip('hud_bar.png', [bar], 2, '血条框')
    b.render(os.path.join(HERE, 'preview_fight.png'))


# ---------------------------------------------------------------- tiles / 背景接缝
def preview_tiles():
    sets = [('contra/tiles.png', 8), ('tank/tiles.png', 6), ('mario/tiles.png', 10)]
    K = 3
    N = 4                                           # 每个 tile 4x4 平铺
    cell = 16 * N * K
    rows = []
    for rel, n in sets:
        img = Image.open(os.path.join(IMG, rel)).convert('RGBA')
        tiles = cut(img, 16, 16)
        band = Image.new('RGBA', (n * (cell + 8), cell), PANEL)
        for i, t in enumerate(tiles):
            blk = Image.new('RGBA', (16 * N, 16 * N), (0, 0, 0, 255))
            tile_area(blk, t, 0, 0, 16 * N, 16 * N)
            put(band, big(blk, K), i * (cell + 8), 0)
        rows.append((rel, band))

    seams = []
    for rel, w in (('contra/bg_jungle.png', 360), ('mario/bg_sky.png', 360),
                   ('fight/bg_stage.png', 360)):
        img = Image.open(os.path.join(IMG, rel)).convert('RGBA')
        wide = Image.new('RGBA', (img.width * 2, img.height))
        put(wide, img, 0, 0)
        put(wide, img, img.width, 0)
        crop = wide.crop((img.width - 90, 0, img.width + 90, img.height))
        ImageDraw.Draw(crop).line([(90, 0), (90, crop.height)], fill=(255, 0, 255, 255))
        seams.append((rel, crop))

    W = max(max(b.width for _, b in rows) + 24,
            len(seams) * (180 * 2 + 12) + 24)
    H = 30 + sum(b.height + 26 for _, b in rows) + 20 + seams[0][1].height * 2 + 30
    out = Image.new('RGBA', (W, H), PAPER)
    text(out, 12, 8, 'PREVIEW / tiles 4x4 无缝平铺 + 背景横向接缝（品红线 = 接缝位置）')
    y = 28
    for rel, band in rows:
        text(out, 12, y, rel, DIM)
        y += 14
        put(out, band, 12, y)
        y += band.height + 12
    y += 6
    text(out, 12, y, '背景左右接缝：同一张图横向拼两遍，取接缝两侧各 90px（@2x）', DIM)
    y += 16
    x = 12
    for rel, crop in seams:
        sc = big(crop, 2)
        put(out, sc, x, y)
        text(out, x + 4, y + sc.height - 16, rel)
        x += sc.width + 12
    out.save(os.path.join(HERE, 'preview_tiles.png'))
    print(f'  ok tools/preview_tiles.png  {W}x{H}')


def main():
    os.chdir(ROOT)
    print('== D 组自查图 ==')
    preview_contra()
    preview_tank()
    preview_mario()
    preview_fight()
    preview_tiles()


if __name__ == '__main__':
    main()
