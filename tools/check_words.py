#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文字规避扫描：上屏的字里不能有真实商标、真实作品名和内部信息。

这个游戏要作为独立作品公开发布，所以画面上出现的每一个名字都得是自己编的：
主机叫「小旋风」，卡带叫《魂斗萝》《铁甲坦克1990》《超级马里蘑》《拳霸98加强变态版》，
杂志叫《电子游戏时代》。玩法可以致敬，名字不能照搬。

分两级：
  - 字符串字面量里命中 = 失败（这些字会上屏）
  - 注释里命中 = 提醒（不上屏，但源码是公开的，能换就换）

用法：
    python3 tools/check_words.py         # 退出码 0 = 通过，1 = 上屏文案里有雷
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "src")
STR_RE = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"")

# 真实商标 / 真实作品名 / 厂商名：画面上一个都不能有
# 比对时一律转小写，所以这里只写一种写法就够了（早先 'SUBOR' 全大写从词表底下溜过去过一次）
BRANDS = [
    "小霸王", "Subor",
    "任天堂", "Nintendo", "Famicom", "红白机FC", "世嘉", "Sega",
    "魂斗罗", "马里奥", "超级玛丽", "玛丽兄弟",
    "拳皇", "KOF", "街头霸王", "街霸",
    "坦克大战", "Battle City",
    "俄罗斯方块", "Tetris",
    "赤色要塞", "Jackal",
    "影子传说", "雪人兄弟", "Snow Bros",
    "热血足球", "热血系列",
    "电子游戏软件", "游戏机实用技术",
    "Konami", "科乐美", "Namco", "南梦宫", "SNK", "Taito", "Capcom", "卡普空",
]

# 内部信息：公开发布前绝不能残留。
# 刻意写得长一点、带分隔符 —— 早先塞了个裸的 "ppe" 进来，把 slipper / wrapped / tapped
# 全扫成了命中，噪音一大就没人看报告了。
INTERNAL = [
    # 公开版只拦通用的内网痕迹，不列任何公司名
    ".ppe.", ".boe.", "psm=", "127.0.0.1:", "localhost:8", "内网", "内部文档",
]

# 行尾写 `check-words: allow` 的那一行豁免：读老存档键这种「必须留着原文」的地方用。
ALLOW = "check-words: allow"


def scan():
    hits_str, hits_cmt = [], []
    words = BRANDS + INTERNAL
    for cur, _dirs, files in os.walk(SRC_DIR):
        for fn in sorted(files):
            if not fn.endswith(".js"):
                continue
            path = os.path.join(cur, fn)
            rel = os.path.relpath(path, ROOT)
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            for i, line in enumerate(lines, 1):
                if ALLOW in line:
                    continue
                in_str = " ".join((m.group(1) or m.group(2) or "") for m in STR_RE.finditer(line))
                low_str, low_line = in_str.lower(), line.lower()
                for w in words:
                    lw = w.lower()
                    if lw in low_str:
                        hits_str.append((rel, i, w, line.strip()[:90]))
                    elif lw in low_line:
                        hits_cmt.append((rel, i, w, line.strip()[:90]))
    return hits_str, hits_cmt


def main():
    hits_str, hits_cmt = scan()
    for rel, i, w, txt in hits_cmt:
        print("提醒（注释，不上屏） %s:%d 「%s」 %s" % (rel, i, w, txt))
    if not hits_str:
        print("文字规避扫描通过：上屏文案里没有商标词、真实作品名和内部信息。")
        return 0
    print("\n上屏文案里有雷 %d 处：" % len(hits_str))
    for rel, i, w, txt in hits_str:
        print("  %s:%d 「%s」 %s" % (rel, i, w, txt))
    return 1


if __name__ == "__main__":
    sys.exit(main())
