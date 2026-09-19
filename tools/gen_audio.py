#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_audio.py —— 《那年的红白机》全部音频程序化合成（可重复运行，一次生成全部）

用法：
    python3 tools/gen_audio.py              # 生成全部（58 SFX + 11 BGM）
    python3 tools/gen_audio.py ui_ boot      # 只生成 key 含指定前缀/子串的项（调参用）
    python3 tools/gen_audio.py --wav-only    # 只出 wav，不转码

流程：numpy 合成 -> tools/_tmp_audio/*.wav -> ffmpeg -> assets/audio/{sfx,bgm}/*.mp3|.ogg
     -> assets/audio/manifest.json

所有 NES 限制（4-bit 音量台阶、11-bit 定时器音高量化、台阶包络、16ms 音符间隙、
2 方波+1 三角+1 噪声）由 tools/nes_synth.py 统一保证。
"""

import json
import os
import subprocess
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nes_synth as N
from nes_synth import (SR, ns, t_axis, note_freq, pulse, triangle, saw, noise,
                       noise_sweep, white, env_bp, env_decay, env_note, stair,
                       q4, q4s, lp, hp, bp, add, echo_tail, wrap_fold,
                       xfade_loop, dc_block, fade_edges, peak_norm, write_wav,
                       parse_seq, render_pulse, render_tri, render_drums,
                       mix_stereo, beats, GAP)
from audio_reg import SFX, BGM, sfx, bgm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, 'tools', '_tmp_audio')
OUT_SFX = os.path.join(ROOT, 'assets', 'audio', 'sfx')
OUT_BGM = os.path.join(ROOT, 'assets', 'audio', 'bgm')
MANIFEST = os.path.join(ROOT, 'assets', 'audio', 'manifest.json')


# ============================================================================
# 通用小零件
# ============================================================================

def click(dur=0.02, fc=2600.0, Q=1.2, rate_idx=3, seed=1, decay=0.35):
    """塑料/机械"咔"点：短噪声 + 带通"""
    nn = ns(dur)
    x = bp(noise(nn, rate_idx=rate_idx, seed=seed), fc, Q=Q)
    return fade_edges(x * env_decay(nn, 1.0, decay), 0.0004, 0.001)


def thump(dur=0.12, f0=80.0, f1=55.0, decay=0.55, seed=2, noise_amt=0.35):
    """低频冲击（三角波 + 一点噪声），脚步/关门/爆炸的"咚" """
    nn = ns(dur)
    ff = np.linspace(f0, f1, nn)
    w, _ = triangle(ff, nn)
    e = env_decay(nn, 1.0, decay)
    y = w * e
    if noise_amt > 0:
        nz = lp(noise(nn, rate_idx=12, seed=seed), np.linspace(400, 120, nn))
        y = y + nz * e * noise_amt
    # 1.2ms 淡入：避免三角波从 +1 起振造成的"咔"（循环素材尤其重要）
    return fade_edges(y, 0.0012, 0.002)


def ping(dur=0.25, f=2093.0, decay=0.72, duty=0.5, vib=None):
    """明亮的"叮"（方波点 + 台阶衰减）"""
    nn = ns(dur)
    ff = np.full(nn, f)
    if vib:
        hz, cents = vib
        ff = ff * 2.0 ** (cents * np.sin(2 * np.pi * hz * t_axis(nn)) / 1200.0)
    w, _ = pulse(ff, nn, duty)
    return w * env_decay(nn, 1.0, decay)


def tri_ping(dur=0.35, f=2637.0, decay=0.86, vib=None):
    nn = ns(dur)
    ff = np.full(nn, f)
    if vib:
        hz, cents = vib
        ff = ff * 2.0 ** (cents * np.sin(2 * np.pi * hz * t_axis(nn)) / 1200.0)
    w, _ = triangle(ff, nn)
    return w * env_decay(nn, 1.0, decay)


def notes_line(total, seq, bpm=120, duty=0.5, preset='pluck', vol=0.9,
               gap=GAP, vib=None):
    """给音效用的小段旋律（沿用音序器 -> 自带 16ms 间隙 + 台阶包络）"""
    ev = parse_seq(seq, bpm)
    return render_pulse(ev, ns(total), duty=duty, vol=vol, preset=preset,
                        gap=gap, vib=vib)


def glide(nn, f0, f1, curve=1.0):
    x = np.linspace(0.0, 1.0, nn) ** curve
    return f0 * (f1 / f0) ** x


def rnd(seed):
    return np.random.default_rng(seed)


# ============================================================================
# 一、音效  ——  严格按 docs/AUDIO_SPEC.md 表格顺序
# ============================================================================

# ---- UI ---------------------------------------------------------------------

@sfx('ui_move', 0.06, peak=-14.0, vol=0.5)
def _ui_move():
    # C6 -> E6，12.5% 占空比，22ms + 16ms 静音 + 22ms
    return notes_line(0.06, [('C6', 1), ('E6', 1)], bpm=1579, duty=0.125,
                      preset='stab', vol=0.85, gap=0.016)


@sfx('ui_confirm', 0.14, peak=-12.0, vol=0.6)
def _ui_confirm():
    return notes_line(0.14, [('C6', 1), ('G6', 1), ('C7', 1.6)], bpm=1276,
                      duty=0.25, preset='pluck', vol=0.9, gap=0.016)


@sfx('ui_cancel', 0.12, peak=-14.0, vol=0.5)
def _ui_cancel():
    return notes_line(0.12, [('G5', 1), ('C5', 1.2)], bpm=1150, duty=0.25,
                      preset='pluck', vol=0.85, gap=0.016)


@sfx('ui_error', 0.2, peak=-11.0, vol=0.6)
def _ui_error():
    # A3 低方波 + 8Hz 频率抖动
    nn = ns(0.2)
    ff = note_freq('A3') * 2.0 ** (140.0 * np.sign(np.sin(2 * np.pi * 8 * t_axis(nn))) / 1200.0)
    w, _ = pulse(ff, nn, 0.5)
    e = env_bp(nn, [(0, 1.0), (0.15, 0.85), (0.19, 0.3), (0.2, 0.0)])
    return w * e


# ---- 电视机 -----------------------------------------------------------------

@sfx('tv_power_on', 1.1, peak=-4.5, vol=0.85)
def _tv_power_on():
    """CRT 通电：啵 -> 行频啸叫 + 嗤—— -> 末尾轻叮"""
    T = 1.1
    nn = ns(T)
    out = np.zeros(nn)

    # (1) 0~0.05s 一声"啵"：宽噪声爆 + 低频冲击（消磁线圈的那一下）
    bn = ns(0.05)
    pop = noise(bn, rate_idx=2, seed=31) * env_decay(bn, 1.0, 0.25)
    add(out, pop, 0.0, 0.75)
    # 低频冲击单独给足能量（不然只剩"嗤"，没有"啵"）
    add(out, thump(0.1, 135, 52, decay=0.4, seed=32, noise_amt=0.25), 0.0, 1.35)
    add(out, thump(0.16, 60, 42, decay=0.6, seed=33, noise_amt=0.0), 0.0, 0.75)

    # (2) 行频啸叫：15.7kHz 太尖且 mp3 会吃掉 -> 用 7860Hz 方波近似（其奇次谐波正好落在 15.7k 附近）
    wn = ns(1.05)
    whine_f = 7860.0 * (1.0 + 0.0035 * np.sin(2 * np.pi * 0.9 * t_axis(wn)))
    whine_f = whine_f * np.interp(np.linspace(0, 1, wn), [0, 0.08, 1.0], [0.972, 1.0, 1.0])
    w, _ = pulse(whine_f, wn, 0.125)
    wenv = env_bp(wn, [(0, 0.0), (0.03, 0.9), (0.12, 0.62), (0.5, 0.5),
                       (1.0, 0.42), (1.05, 0.34)])
    add(out, w * wenv, 0.05, 0.085)          # 音量很小，只作"存在感"

    # 叠一点真正的 15.7kHz 弱正弦（能过 mp3 的部分算彩蛋，不要抢能量）
    add(out, np.sin(2 * np.pi * 15700 * t_axis(wn)) * wenv, 0.05, 0.006)

    # (3) 0.05~0.65s 白噪声"嗤——"渐弱（静电吸尘的感觉）
    hn = ns(0.62)
    hiss = noise(hn, rate_idx=0, seed=37)
    hiss = hp(hiss, 900.0)
    henv = env_bp(hn, [(0, 0.95), (0.06, 0.8), (0.25, 0.42), (0.45, 0.18),
                       (0.6, 0.05), (0.62, 0.0)])
    add(out, hiss * henv, 0.05, 0.42)

    # (4) 0.9s 一声轻"叮"（显像管稳定）
    add(out, ping(0.2, 2093.0, decay=0.62, duty=0.5), 0.9, 0.3)
    add(out, tri_ping(0.18, 3136.0, decay=0.5), 0.9, 0.18)
    return out


@sfx('tv_power_off', 0.7, peak=-5.0, vol=0.8)
def _tv_power_off():
    nn = ns(0.7)
    out = np.zeros(nn)
    # 白噪声急速衰减
    an = ns(0.3)
    nz = hp(noise(an, rate_idx=1, seed=41), 700.0)
    add(out, nz * env_decay(an, 1.0, 0.55), 0.0, 0.6)
    # 下行滑音 1200 -> 80（屏幕塌缩成一条线）
    gn = ns(0.5)
    w, _ = pulse(glide(gn, 1200.0, 80.0, curve=0.62), gn, 0.25)
    add(out, w * env_bp(gn, [(0, 0.85), (0.2, 0.6), (0.4, 0.3), (0.5, 0.0)]), 0.02, 0.75)
    # 结尾"嗒"：塌缩成一点
    add(out, click(0.05, 3200, Q=1.4, rate_idx=2, seed=43, decay=0.28), 0.52, 0.8)
    add(out, thump(0.12, 90, 50, decay=0.35, seed=44, noise_amt=0.15), 0.52, 0.5)
    return out


@sfx('tv_static', 2.0, peak=-19.0, vol=0.35, loop=True)
def _tv_static():
    """无信号雪花：明亮白噪声 + 轻微起伏，可无缝循环"""
    T = 2.0
    nn = ns(T) + ns(0.06)
    tt = t_axis(nn)
    nz = noise(nn, rate_idx=0, seed=53)
    nz = hp(nz, 1100.0)
    nz = nz + 0.35 * noise(nn, rate_idx=3, seed=59)
    # 起伏用在 2.0s 内整数个周期的调制（循环后依然连续）
    m = (1.0 + 0.12 * np.sin(2 * np.pi * 1.5 * tt)
         + 0.07 * np.sin(2 * np.pi * 7.0 * tt + 1.1)
         + 0.05 * np.sin(2 * np.pi * 0.5 * tt + 0.4))
    y = nz * q4(0.72 * m)
    # 偶尔的"滚道"横条：一条缓慢扫过的带通亮线（周期 1.0s -> 2 次/循环）
    band_f = 2600.0 + 1800.0 * np.sin(2 * np.pi * 1.0 * tt)
    y = y + 0.25 * bp(nz, band_f, Q=2.2)
    return xfade_loop(y, ns(T), fade=0.05)


@sfx('tv_hum', 3.0, peak=-22.0, vol=0.3, loop=True)
def _tv_hum():
    """CRT 底噪嗡嗡：50Hz + 100Hz 三角波，极轻，可无缝循环"""
    T = 3.0
    nn = ns(T) + ns(0.05)
    tt = t_axis(nn)
    a, _ = triangle(np.full(nn, 50.0), nn)
    b, _ = triangle(np.full(nn, 100.0), nn)
    c, _ = triangle(np.full(nn, 150.0), nn)
    m = q4(0.85 + 0.1 * np.sin(2 * np.pi * (1.0 / 3.0) * tt))   # 1 周期/循环
    y = (0.85 * a + 0.4 * b + 0.12 * c) * m
    y = y + 0.05 * lp(noise(nn, rate_idx=6, seed=61), 1800.0)
    return xfade_loop(y, ns(T), fade=0.05)


@sfx('tv_degauss', 0.5, peak=-4.0, vol=0.85)
def _tv_degauss():
    """拍电视：咚 + 噪声抖动 + 画面稳定的嗡回落"""
    nn = ns(0.5)
    out = np.zeros(nn)
    add(out, thump(0.18, 80.0, 62.0, decay=0.5, seed=71, noise_amt=0.3), 0.0, 1.0)
    # 噪声抖动（画面乱跳）
    jn = ns(0.16)
    jz = bp(noise(jn, rate_idx=4, seed=73), 1500.0, Q=1.0)
    jm = q4(0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 26.0 * t_axis(jn))))
    add(out, jz * jm * env_decay(jn, 1.0, 0.62), 0.02, 0.45)
    # 嗡回落：120 -> 80Hz，带幅度抖动
    hn = ns(0.32)
    w, _ = triangle(glide(hn, 130.0, 80.0, 0.8), hn)
    hm = q4(np.interp(np.linspace(0, 1, hn), [0, 0.3, 1], [0.8, 0.55, 0.0])
            * (0.85 + 0.15 * np.sin(2 * np.pi * 9 * t_axis(hn))))
    add(out, w * hm, 0.16, 0.55)
    return out


# ---- 卡带 -------------------------------------------------------------------

@sfx('cart_insert', 0.22, peak=-7.0, vol=0.8)
def _cart_insert():
    nn = ns(0.22)
    out = np.zeros(nn)
    # 0~0.1s 塑料摩擦（推入卡槽）
    fn = ns(0.1)
    fz = bp(noise(fn, rate_idx=3, seed=81), np.linspace(1800, 2600, fn), Q=1.6)
    fe = q4(np.interp(np.linspace(0, 1, fn), [0, 0.2, 0.75, 1.0], [0.25, 0.6, 0.55, 0.35]))
    add(out, fz * fe, 0.0, 0.5)
    # 0.11s "咔哒"（到底卡住）
    add(out, click(0.06, 2400, Q=1.1, rate_idx=2, seed=83, decay=0.3), 0.11, 1.0)
    add(out, ping(0.05, 3520.0, decay=0.25, duty=0.125), 0.115, 0.35)
    add(out, thump(0.08, 130, 80, decay=0.35, seed=84, noise_amt=0.1), 0.11, 0.3)
    return out


@sfx('cart_remove', 0.2, peak=-7.5, vol=0.75)
def _cart_remove():
    nn = ns(0.2)
    out = np.zeros(nn)
    add(out, click(0.05, 2600, Q=1.2, rate_idx=2, seed=91, decay=0.3), 0.0, 1.0)
    add(out, ping(0.04, 3136.0, decay=0.22, duty=0.125), 0.004, 0.3)
    fn = ns(0.15)
    fz = bp(noise(fn, rate_idx=3, seed=93), np.linspace(2500, 1500, fn), Q=1.6)
    fe = q4(np.interp(np.linspace(0, 1, fn), [0, 0.15, 0.6, 1.0], [0.55, 0.5, 0.25, 0.0]))
    add(out, fz * fe, 0.05, 0.55)
    return out


@sfx('cart_blow', 0.9, peak=-6.0, vol=0.9)
def _cart_blow():
    """
    对着卡带哈气："呼——"
    带通白噪声，中心频率 700 -> 1400 -> 800Hz；音量钟形包络；尾部气流断续。
    """
    T = 0.9
    nn = ns(T)
    x = np.linspace(0.0, 1.0, nn)
    nz = white(nn, seed=1990) * 0.7 + noise(nn, rate_idx=0, seed=101) * 0.3
    # 中心频率：缓慢升到 1400 再回落
    fc = np.interp(x, [0.0, 0.12, 0.42, 0.62, 0.85, 1.0],
                   [620.0, 760.0, 1180.0, 1400.0, 950.0, 780.0])
    body = bp(nz, fc, Q=1.5, order=2)
    body = body + 0.45 * bp(nz, fc * 2.1, Q=1.1, order=2)      # 一点齿音
    body = body + 0.30 * lp(nz, 300.0)                          # 胸腔气流
    # 钟形包络（台阶化 + 4bit）
    bell = np.sin(np.pi * np.clip(x / 0.96, 0, 1)) ** 1.25
    bell = np.interp(x, [0, 0.06, 1.0], [0.0, 1.0, 1.0]) * bell
    # 尾部气流断续（气快用完了）
    flut = 1.0 - 0.42 * np.clip((x - 0.62) / 0.38, 0, 1) * (
        0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 17.0 * t_axis(nn))))
    # 逐帧保持 + 4-bit 量化 -> 台阶包络
    env = stair(nn, (bell * flut)[::N.FRAME_N])
    y = body * env
    return fade_edges(y, 0.006, 0.02)


@sfx('cart_rub', 0.55, peak=-6.0, vol=0.9)
def _cart_rub():
    """卡带在桌面上划两下：粗糙低频噪声"沙——沙" + 木头共鸣"""
    T = 0.55
    nn = ns(T)
    out = np.zeros(nn)
    for i, (t0, dirup) in enumerate([(0.0, True), (0.28, False)]):
        sn = ns(0.25)
        x = np.linspace(0, 1, sn)
        nz = white(sn, seed=2000 + i) * 0.6 + noise(sn, rate_idx=5, seed=111 + i) * 0.4
        # 划的方向感：来回一趟，频率跟着走
        f0, f1 = (900.0, 1750.0) if dirup else (1650.0, 820.0)
        fc = np.interp(x, [0, 0.5, 1.0], [f0, (f0 + f1) / 2 * 1.15, f1])
        rough = bp(nz, fc, Q=0.9, order=2)
        rough = rough + 0.75 * lp(nz, np.linspace(600, 380, sn))     # 低频"沙"
        # 摩擦颗粒（手抖 + 桌面纹理）
        grain = q4(0.78 + 0.22 * np.sin(2 * np.pi * (38 + 9 * i) * t_axis(sn)))
        env = q4(np.interp(x, [0, 0.08, 0.35, 0.7, 0.95, 1.0],
                           [0.0, 0.85, 1.0, 0.9, 0.45, 0.0]) * (1.0 if i == 0 else 0.92))
        stroke = rough * env * grain
        # 木头共鸣 200Hz 三角波
        w, _ = triangle(np.full(sn, 200.0 if i == 0 else 196.0), sn)
        stroke = stroke + w * env * 0.22
        add(out, stroke, t0, 1.0)
    return fade_edges(out, 0.004, 0.012)


@sfx('cart_tap', 0.1, peak=-7.0, vol=0.75)
def _cart_tap():
    """卡带磕两下 / 吹卡槽灰：短促干脆的塑料"嗒" """
    nn = ns(0.1)
    out = np.zeros(nn)
    for i, t0 in enumerate([0.0, 0.05]):
        add(out, click(0.03, 2900 - 300 * i, Q=1.3, rate_idx=2, seed=121 + i,
                       decay=0.24), t0, 1.0 - 0.18 * i)
        add(out, ping(0.028, 1760.0 if i == 0 else 1568.0, decay=0.2, duty=0.125),
            t0, 0.3)
    return out


@sfx('cart_dirty_fail', 0.6, peak=-4.0, vol=0.9)
def _cart_dirty_fail():
    """修卡失败：花屏音爆——噪声 + 无规律跳变方波音高"""
    T = 0.6
    nn = ns(T)
    out = np.zeros(nn)
    g = rnd(4242)
    # 方波音高每 30ms 随机跳一次（NES 音序器错乱的样子）
    stepn = ns(0.03)
    freqs = np.zeros(nn)
    vols = np.zeros(nn)
    for a in range(0, nn, stepn):
        b = min(a + stepn, nn)
        freqs[a:b] = float(g.choice([196, 262, 330, 415, 523, 698, 880, 1245, 1568]))
        vols[a:b] = q4s(g.uniform(0.35, 1.0))
    w, _ = pulse(freqs, nn, 0.5)
    decay = np.interp(np.linspace(0, 1, nn), [0, 0.6, 1.0], [1.0, 0.7, 0.0])
    add(out, w * vols * decay, 0.0, 0.55)
    # 噪声爆
    nz = noise(nn, rate_idx=3, seed=131)
    nzm = np.zeros(nn)
    for a in range(0, nn, ns(0.045)):
        b = min(a + ns(0.045), nn)
        nzm[a:b] = q4s(g.uniform(0.15, 0.9))
    add(out, nz * nzm * decay, 0.0, 0.5)
    add(out, thump(0.1, 110, 60, decay=0.4, seed=133), 0.0, 0.4)
    return fade_edges(out, 0.002, 0.01)


# ---- 主机 -------------------------------------------------------------------

@sfx('console_power', 0.15, peak=-7.0, vol=0.8)
def _console_power():
    """电源滑动开关："嗒——啪" """
    nn = ns(0.15)
    out = np.zeros(nn)
    add(out, click(0.035, 1900, Q=1.0, rate_idx=4, seed=141, decay=0.26), 0.0, 0.7)
    add(out, click(0.05, 3100, Q=1.5, rate_idx=1, seed=143, decay=0.22), 0.075, 1.0)
    add(out, ping(0.035, 2637.0, decay=0.2, duty=0.125), 0.078, 0.28)
    add(out, thump(0.07, 120, 70, decay=0.3, seed=144, noise_amt=0.1), 0.075, 0.25)
    return out


@sfx('console_reset', 0.1, peak=-8.0, vol=0.7)
def _console_reset():
    nn = ns(0.1)
    out = np.zeros(nn)
    add(out, click(0.045, 2200, Q=1.1, rate_idx=3, seed=151, decay=0.24), 0.0, 1.0)
    add(out, ping(0.03, 1975.0, decay=0.2, duty=0.25), 0.002, 0.3)
    return out


@sfx('boot_jingle', 1.4, peak=-3.5, vol=0.9)
def _boot_jingle():
    """
    卡带成功启动：三角波贝斯垫底 + 两个方波奏五声音阶上行 C5-D5-E5-G5-C6，
    末音加颤音持续。明亮、有仪式感。
    """
    T = 1.4
    nn = ns(T)
    BPM = 150.0                      # 1 拍 = 0.4s
    # 主旋律（方波1，25% 占空比更亮）
    lead = [('C5', 0.5), ('D5', 0.5), ('E5', 0.5), ('G5', 0.5), ('C6', 1.5)]
    ev = parse_seq(lead, BPM)
    p1 = render_pulse(ev, nn, duty=0.25, vol=0.8, preset='lead',
                      vib=(6.5, 45), vib_delay=0.12)
    # 和声（方波2，五声音阶内的平行六度，50% 圆润）
    harm = [('E4', 0.5), ('G4', 0.5), ('A4', 0.5), ('C5', 0.5), ('E5', 1.5)]
    p2 = render_pulse(parse_seq(harm, BPM), nn, duty=0.5, vol=0.5, preset='organ')
    # 贝斯（三角波）
    bass = [('C3', 1.0), ('G2', 0.5), ('C3', 1.5)]
    tri = render_tri(parse_seq(bass, BPM), nn, vol=0.9, preset='bass')
    # 一声轻噪声"喀"（继电器/卡带接通）
    noi = np.zeros(nn)
    add(noi, click(0.03, 3000, Q=1.4, rate_idx=1, seed=161, decay=0.25), 0.0, 0.45)
    return p1 * 0.62 + p2 * 0.34 + tri * 0.42 + noi * 0.3


@sfx('glitch_burst', 0.4, peak=-3.5, vol=0.85)
def _glitch_burst():
    T = 0.4
    nn = ns(T)
    out = np.zeros(nn)
    g = rnd(777)
    stepn = ns(0.022)
    freqs = np.zeros(nn)
    vols = np.zeros(nn)
    for a in range(0, nn, stepn):
        b = min(a + stepn, nn)
        freqs[a:b] = float(g.choice([233, 311, 466, 622, 831, 1109, 1480, 1976, 2637]))
        vols[a:b] = q4s(g.uniform(0.2, 1.0))
    w, _ = pulse(freqs, nn, float(g.choice([0.125, 0.25, 0.5])))
    add(out, w * vols, 0.0, 0.6)
    nz = noise_sweep(nn, np.repeat(g.uniform(2000, 90000, 20), nn // 20 + 1)[:nn], seed=3)
    nm = np.zeros(nn)
    for a in range(0, nn, ns(0.03)):
        b = min(a + ns(0.03), nn)
        nm[a:b] = q4s(g.uniform(0.1, 1.0))
    add(out, nz * nm, 0.0, 0.55)
    return fade_edges(out, 0.001, 0.008)


# ---- 钱 / 买卖 --------------------------------------------------------------

@sfx('coin_get', 0.18, peak=-7.0, vol=0.75)
def _coin_get():
    """经典金币音：B5 短 -> E6 持续"""
    nn = ns(0.18)
    p = notes_line(0.18, [('B5', 1), ('E6', 3.2)], bpm=1400, duty=0.25,
                   preset='lead', vol=0.9)
    t = render_tri(parse_seq([('r', 1), ('E5', 3.2)], 1400), nn, vol=0.5)
    return p * 0.85 + t * 0.25


@sfx('money_get', 0.5, peak=-5.5, vol=0.8)
def _money_get():
    """零花钱：金币音 + 4 音上行琶音（五声）"""
    nn = ns(0.5)
    out = np.zeros(nn)
    add(out, _coin_get() * 0.9, 0.0)
    seq = [('r', 1), ('E6', 1), ('G6', 1), ('A6', 1), ('C7', 2.4)]
    add(out, notes_line(0.5, seq, bpm=430, duty=0.125, preset='pluck', vol=0.75), 0.0, 0.8)
    add(out, render_tri(parse_seq([('r', 1), ('C4', 1), ('E4', 1), ('G4', 1), ('C5', 2.4)], 430),
                        nn, vol=0.6, preset='pluck'), 0.0, 0.3)
    return out


@sfx('buy_success', 0.7, peak=-4.5, vol=0.85)
def _buy_success():
    """买到卡带：明亮 5 音上行 + 三角波和声"""
    nn = ns(0.7)
    BPM = 480.0
    lead = [('C5', 1), ('D5', 1), ('E5', 1), ('G5', 1), ('C6', 2.6)]
    p1 = render_pulse(parse_seq(lead, BPM), nn, duty=0.25, vol=0.85, preset='lead',
                      vib=(7, 35), vib_delay=0.1)
    harm = [('E4', 1), ('G4', 1), ('A4', 1), ('C5', 1), ('E5', 2.6)]
    p2 = render_pulse(parse_seq(harm, BPM), nn, duty=0.5, vol=0.45, preset='organ')
    tri = render_tri(parse_seq([('C3', 2), ('G3', 1), ('C3', 3.6)], BPM), nn, vol=0.85)
    return p1 * 0.6 + p2 * 0.3 + tri * 0.4


@sfx('buy_fail', 0.4, peak=-7.0, vol=0.75)
def _buy_fail():
    """钱不够：两声低方波下行 + 噪声呲"""
    nn = ns(0.4)
    out = np.zeros(nn)
    add(out, notes_line(0.4, [('E3', 1), ('C3', 2)], bpm=340, duty=0.5,
                        preset='organ', vol=0.9), 0.0, 0.8)
    hn = ns(0.16)
    hz = bp(noise(hn, rate_idx=3, seed=171), 2200.0, Q=1.1)
    add(out, hz * env_decay(hn, 1.0, 0.55), 0.22, 0.35)
    return out


@sfx('haggle_ok', 0.3, peak=-6.5, vol=0.75)
def _haggle_ok():
    nn = ns(0.3)
    out = np.zeros(nn)
    add(out, notes_line(0.3, [('G5', 1), ('C6', 1.4)], bpm=700, duty=0.25,
                        preset='pluck', vol=0.85), 0.0, 0.8)
    add(out, tri_ping(0.16, 2637.0, decay=0.6), 0.14, 0.5)
    return out


@sfx('haggle_no', 0.35, peak=-7.0, vol=0.7)
def _haggle_no():
    return notes_line(0.35, [('G5', 1), ('E5', 1), ('C5', 1.6)], bpm=620,
                      duty=0.25, preset='pluck', vol=0.85)


# ---- 家 / 妈妈 --------------------------------------------------------------

@sfx('footstep_stair', 1.6, peak=-6.0, vol=0.9)
def _footstep_stair():
    """
    楼道脚步：6 下由远及近 —— 音量递增、间隔递减、混响尾巴（多次衰减副本）。
    """
    T = 1.6
    nn = ns(T)
    out = np.zeros(nn)
    # 间隔逐渐变短：0.36 0.31 0.27 0.23 0.19
    onsets = [0.02]
    for gapv in (0.36, 0.31, 0.27, 0.23, 0.19):
        onsets.append(onsets[-1] + gapv)
    vols = [0.16, 0.24, 0.36, 0.52, 0.74, 1.0]
    for i, (t0, v) in enumerate(zip(onsets, vols)):
        sn = ns(0.16)
        # 鞋底冲击：低频噪声 + 200Hz 三角波
        nz = lp(noise(sn, rate_idx=8 - i // 2, seed=181 + i), np.linspace(1500 + 600 * i, 300, sn))
        ne = env_decay(sn, 1.0, 0.42 - 0.02 * i)
        step = nz * ne * (0.7 + 0.1 * i)
        w, _ = triangle(glide(sn, 205.0, 150.0, 0.8), sn)
        step = step + w * env_decay(sn, 1.0, 0.5) * 0.85
        # 楼道混响：多次衰减副本（近的脚步混响更明显）
        rev = 0.22 + 0.1 * i
        step = echo_tail(step, [(0.075, 0.34 * rev / 0.3), (0.155, 0.16 * rev / 0.3),
                                (0.245, 0.07 * rev / 0.3)], lp_fc=1400.0)
        add(out, step * q4s(v), t0, 1.0)
    return fade_edges(out, 0.003, 0.03)


@sfx('door_key', 0.8, peak=-7.5, vol=0.8)
def _door_key():
    """钥匙插锁：金属细碎摩擦 ×N + 锁芯"咔嗒" """
    nn = ns(0.8)
    out = np.zeros(nn)
    g = rnd(555)
    for i, t0 in enumerate([0.0, 0.075, 0.15, 0.24, 0.33]):
        sn = ns(float(g.uniform(0.035, 0.06)))
        x = hp(noise(sn, rate_idx=1, seed=191 + i), 4200.0)
        x = x + 0.5 * bp(noise(sn, rate_idx=2, seed=201 + i), float(g.uniform(5200, 7600)), Q=3.0)
        add(out, x * env_decay(sn, 1.0, 0.34) * float(g.uniform(0.55, 1.0)), t0, 0.5)
    # 锁芯转动：低一点的金属摩擦 + 咔嗒
    tn = ns(0.18)
    tz = bp(noise(tn, rate_idx=4, seed=211), np.linspace(1400, 900, tn), Q=1.4)
    add(out, tz * env_bp(tn, [(0, 0.5), (0.06, 0.8), (0.14, 0.5), (0.18, 0.0)]), 0.44, 0.6)
    add(out, click(0.055, 1800, Q=1.0, rate_idx=3, seed=213, decay=0.28), 0.6, 1.0)
    add(out, ping(0.05, 1245.0, decay=0.3, duty=0.125), 0.6, 0.3)
    add(out, thump(0.12, 100, 62, decay=0.4, seed=215, noise_amt=0.12), 0.6, 0.35)
    return out


@sfx('door_open', 0.9, peak=-6.0, vol=0.85)
def _door_open():
    """木门吱呀：窄带噪声滑音（上行又下行）+ 末尾门碰墙"咚" """
    nn = ns(0.9)
    out = np.zeros(nn)
    sn = ns(0.72)
    x = np.linspace(0, 1, sn)
    nz = white(sn, seed=3131) * 0.6 + noise(sn, rate_idx=2, seed=221) * 0.4
    fc = np.interp(x, [0, 0.25, 0.5, 0.72, 1.0], [430.0, 700.0, 980.0, 760.0, 520.0])
    creak = bp(nz, fc, Q=11.0, order=2) * 3.2
    creak = creak + 0.6 * bp(nz, fc * 2.0, Q=9.0, order=2) * 2.2
    # 木头一顿一顿的摩擦（stick-slip）
    jit = q4(0.62 + 0.38 * np.abs(np.sin(2 * np.pi * 14.0 * t_axis(sn) ** 1.25)))
    env = q4(np.interp(x, [0, 0.05, 0.3, 0.6, 0.85, 1.0], [0.0, 0.7, 1.0, 0.85, 0.5, 0.15]))
    add(out, creak * env * jit, 0.0, 0.55)
    # 门碰墙
    add(out, thump(0.2, 78.0, 52.0, decay=0.55, seed=223, noise_amt=0.45), 0.72, 1.0)
    add(out, click(0.05, 900, Q=0.9, rate_idx=6, seed=225, decay=0.3), 0.72, 0.5)
    return fade_edges(out, 0.004, 0.02)


@sfx('door_close', 0.35, peak=-4.5, vol=0.9)
def _door_close():
    nn = ns(0.35)
    out = np.zeros(nn)
    add(out, thump(0.22, 72.0, 48.0, decay=0.55, seed=231, noise_amt=0.5), 0.0, 1.0)
    add(out, click(0.06, 700, Q=0.8, rate_idx=7, seed=233, decay=0.3), 0.0, 0.55)
    # 门框余震
    rn = ns(0.24)
    w, _ = triangle(glide(rn, 145.0, 132.0, 1.0), rn)
    add(out, w * env_decay(rn, 1.0, 0.62), 0.03, 0.3)
    return fade_edges(out, 0.001, 0.02)


@sfx('heartbeat', 1.0, peak=-6.0, vol=0.8, loop=True)
def _heartbeat():
    """紧张心跳（咚-咚），可无缝循环"""
    T = 1.0
    nn = ns(T) + ns(0.35)
    out = np.zeros(nn)
    for t0, v, f0 in [(0.0, 1.0, 58.0), (0.28, 0.72, 52.0)]:
        add(out, thump(0.26, f0, f0 * 0.78, decay=0.55, seed=241, noise_amt=0.12), t0, v)
        # 一点"胸腔"包裹（同样淡入，保证循环点无台阶）
        add(out, fade_edges(lp(noise(ns(0.1), rate_idx=13, seed=243), 160.0)
                            * env_decay(ns(0.1), 1.0, 0.4), 0.0015, 0.003), t0, 0.5 * v)
    return wrap_fold(out, ns(T))


@sfx('mom_angry', 0.8, peak=-4.0, vol=0.9)
def _mom_angry():
    """妈妈发怒：锅铲敲击 ×2 + 下行滑音（完了）"""
    nn = ns(0.8)
    out = np.zeros(nn)
    for i, t0 in enumerate([0.0, 0.18]):
        cn = ns(0.2)
        mz = hp(noise(cn, rate_idx=1, seed=251 + i), 3600.0)
        add(out, mz * env_decay(cn, 1.0, 0.4), t0, 0.6 - 0.1 * i)
        # 金属感：两个高方波点（不同时，符合单声部）
        add(out, ping(0.14, 2489.0 if i == 0 else 2093.0, decay=0.55, duty=0.5), t0, 0.5)
        add(out, tri_ping(0.16, 3729.0 if i == 0 else 3136.0, decay=0.6), t0, 0.3)
    gn = ns(0.42)
    w, _ = pulse(glide(gn, 800.0, 190.0, 0.75), gn, 0.25)
    add(out, w * env_bp(gn, [(0, 0.85), (0.2, 0.6), (0.38, 0.25), (0.42, 0.0)]), 0.36, 0.7)
    return out


@sfx('caught_sting', 1.3, peak=-3.0, vol=0.95)
def _caught_sting():
    """被抓到：三音下行（大二度不协和）+ 噪声重音 + 低沉长音"""
    nn = ns(1.3)
    BPM = 200.0
    lead = [('D5', 1), ('B4', 1), ('G4', 1), ('D3', 3.4)]
    p1 = render_pulse(parse_seq(lead, BPM), nn, duty=0.5, vol=0.85, preset='organ')
    # 大二度不协和：方波2 比方波1 高一个大二度
    diss = [('E5', 1), ('C#5', 1), ('A4', 1), ('r', 3.4)]
    p2 = render_pulse(parse_seq(diss, BPM), nn, duty=0.5, vol=0.6, preset='organ')
    tri = render_tri(parse_seq([('r', 3), ('D2', 3.4)], BPM), nn, vol=0.95, preset='organ')
    noi = np.zeros(nn)
    for i, t0 in enumerate([0.0, 0.3, 0.6]):
        cn = ns(0.18)
        add(noi, bp(noise(cn, rate_idx=3, seed=261 + i), 1600.0, Q=0.9)
            * env_decay(cn, 1.0, 0.45), t0, 0.9 - 0.15 * i)
    return p1 * 0.5 + p2 * 0.3 + tri * 0.45 + noi * 0.4


@sfx('hide_success', 0.5, peak=-8.0, vol=0.7)
def _hide_success():
    """藏卡带成功：轻柔上行两音 + 一声放松的"呼" """
    nn = ns(0.5)
    out = np.zeros(nn)
    add(out, notes_line(0.5, [('E5', 1), ('A5', 2.4)], bpm=420, duty=0.5,
                        preset='soft', vol=0.7), 0.0, 0.75)
    # 松一口气
    bn = ns(0.3)
    x = np.linspace(0, 1, bn)
    bz = bp(white(bn, seed=4444), np.interp(x, [0, 0.4, 1], [900.0, 700.0, 500.0]), Q=1.3)
    add(out, bz * q4(np.sin(np.pi * x) ** 1.3) * 1.4, 0.2, 0.55)
    return out


@sfx('pencil_write', 0.7, peak=-11.0, vol=0.55, loop=True)
def _pencil_write():
    """写作业：高频细碎噪声断续摩擦，5–6 笔，可无缝循环"""
    T = 0.7
    nn = ns(T) + ns(0.12)
    out = np.zeros(nn)
    g = rnd(9001)
    # 6 笔，节奏略不均匀；最后一笔跨过循环点由 wrap_fold 折回开头
    onsets = [0.03, 0.145, 0.27, 0.38, 0.5, 0.635]
    for i, t0 in enumerate(onsets):
        sn = ns(float(g.uniform(0.05, 0.085)))
        x = hp(white(sn, seed=5000 + i), float(g.uniform(3800, 5200)))
        x = x + 0.6 * bp(noise(sn, rate_idx=1, seed=271 + i), float(g.uniform(6000, 9000)), Q=2.0)
        env = q4(np.interp(np.linspace(0, 1, sn), [0, 0.15, 0.6, 1.0],
                           [0.2, 1.0, 0.7, 0.0]))
        add(out, x * env * float(g.uniform(0.6, 1.0)), t0, 1.0)
    return wrap_fold(out, ns(T))


@sfx('cicada', 4.0, peak=-15.0, vol=0.3, loop=True)
def _cicada():
    """
    夏日蝉鸣：高频噪声 + ~20Hz 振幅调制的"知——知——"，三只蝉不同步叠加，
    可无缝循环（所有调制频率在 4.0s 内都是整数个周期）。
    """
    T = 4.0
    nn = ns(T) + ns(0.06)
    tt = t_axis(nn)
    out = np.zeros(nn)
    # (蝉鸣带中心频率, AM 频率(整数周期/4s), 宏包络频率, 相位, 增益)
    cicadas = [(4600.0, 20.0, 0.25, 0.0, 1.0),
               (5900.0, 23.0, 0.5, 1.9, 0.62),
               (3700.0, 17.5, 0.25, 3.4, 0.45)]
    for i, (fc, am, macro, phi, gain) in enumerate(cicadas):
        nz = white(nn, seed=6100 + i)
        band = bp(nz, fc * (1.0 + 0.02 * np.sin(2 * np.pi * macro * tt + phi)),
                  Q=2.4, order=2) * 3.0
        band = band + 0.5 * bp(nz, fc * 1.55, Q=3.0, order=2) * 3.0
        # "知知知"：偏尖的 AM（半波整流 + 提升）
        m = np.sin(2 * np.pi * am * tt + phi)
        am_env = np.clip(m, 0, 1) ** 0.55 * 0.85 + 0.15
        # 宏观：一阵一阵（周期 1/macro 秒，整数个周期落在 4s 内）
        mac = 0.5 + 0.5 * np.sin(2 * np.pi * macro * tt + phi * 0.7)
        mac = np.clip(mac * 1.35 - 0.2, 0, 1) ** 0.8
        env = q4(am_env * mac * gain)
        out += band * env
    return xfade_loop(out, ns(T), fade=0.05)


@sfx('fan_hum', 2.5, peak=-17.0, vol=0.35, loop=True)
def _fan_hum():
    """落地风扇：低频噪声 + 摆头造成的缓慢音量起伏，可无缝循环"""
    T = 2.5
    nn = ns(T) + ns(0.06)
    tt = t_axis(nn)
    nz = lp(white(nn, seed=7100), 520.0) * 2.4
    nz = nz + 0.5 * bp(white(nn, seed=7101), 780.0, Q=1.2) * 2.0
    # 扇叶周期性"呼呼"（12Hz = 30 周期/2.5s）+ 摆头（0.4Hz = 1 周期/2.5s）
    blade = 0.86 + 0.14 * np.sin(2 * np.pi * 12.0 * tt)
    sway = 0.62 + 0.38 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.4 * tt - 1.2))
    y = nz * q4(blade * sway)
    # 马达低频
    w, _ = triangle(np.full(nn, 60.0), nn)
    y = y + w * q4(0.28 * sway)
    return xfade_loop(y, ns(T), fade=0.05)


# ---- 生活场景 ---------------------------------------------------------------

@sfx('fish_bubble', 0.3, peak=-10.0, vol=0.6)
def _fish_bubble():
    """鱼缸气泡：4 个短促上行的点音"""
    nn = ns(0.3)
    out = np.zeros(nn)
    for i, (t0, f0, f1) in enumerate([(0.0, 380, 820), (0.075, 430, 960),
                                      (0.15, 350, 760), (0.225, 470, 1050)]):
        bn = ns(0.05)
        w, _ = triangle(glide(bn, f0, f1, 0.7), bn)
        e = env_bp(bn, [(0, 0.35), (0.012, 1.0), (0.04, 0.5), (0.05, 0.0)])
        add(out, w * e, t0, 0.9 - 0.1 * i)
        add(out, click(0.02, 2400, Q=2.0, rate_idx=1, seed=281 + i, decay=0.2), t0, 0.12)
    return out


@sfx('popsicle_eat', 0.4, peak=-7.0, vol=0.75)
def _popsicle_eat():
    """吃冰棍：清脆咔嚓咬冰 + 短促噪声"""
    nn = ns(0.4)
    out = np.zeros(nn)
    g = rnd(1357)
    # 咬下去的脆裂（多个颗粒）
    for i in range(5):
        t0 = 0.0 + i * 0.022 + float(g.uniform(0, 0.008))
        sn = ns(0.035)
        x = bp(noise(sn, rate_idx=1, seed=291 + i), float(g.uniform(2600, 5200)), Q=1.6)
        add(out, x * env_decay(sn, 1.0, 0.3) * float(g.uniform(0.5, 1.0)), t0, 0.9)
    # 冰碴碎裂尾巴
    tn = ns(0.24)
    tz = hp(noise(tn, rate_idx=2, seed=301), 3000.0)
    tm = q4(np.interp(np.linspace(0, 1, tn), [0, 0.1, 0.5, 1.0], [0.6, 0.35, 0.15, 0.0]))
    add(out, tz * tm, 0.12, 0.45)
    return out


@sfx('bike_bell', 0.6, peak=-6.0, vol=0.8)
def _bike_bell():
    """自行车铃：铃——铃，高频三角波 + 快速颤音 + 长衰减"""
    nn = ns(0.6)
    out = np.zeros(nn)
    for i, (t0, f) in enumerate([(0.0, 2637.0), (0.22, 2794.0)]):
        add(out, tri_ping(0.38, f, decay=0.9, vib=(34.0, 55.0)), t0, 1.0 - 0.15 * i)
        add(out, ping(0.3, f * 1.5, decay=0.87, duty=0.125, vib=(34.0, 55.0)), t0, 0.22)
        add(out, click(0.02, 5200, Q=2.0, rate_idx=0, seed=311 + i, decay=0.2), t0, 0.3)
    return fade_edges(out, 0.001, 0.02)


@sfx('market_crowd', 4.0, peak=-21.0, vol=0.3, loop=True)
def _market_crowd():
    """市井人声底噪：多层低频噪声缓慢起伏，很轻，可无缝循环"""
    T = 4.0
    nn = ns(T) + ns(0.06)
    tt = t_axis(nn)
    out = np.zeros(nn)
    for i, (fc, mod, phi, g) in enumerate([(420.0, 0.25, 0.0, 1.0),
                                           (680.0, 0.5, 2.1, 0.7),
                                           (250.0, 0.75, 4.0, 0.8),
                                           (1100.0, 0.5, 1.0, 0.35)]):
        nz = bp(white(nn, seed=8100 + i), fc, Q=1.1, order=2) * 2.6
        m = q4(g * (0.5 + 0.5 * np.sin(2 * np.pi * mod * tt + phi)) * 0.8 + 0.12 * g)
        out += nz * m
    # 远处几声"人语"（带通噪声的元音包络），周期落在 4s 内
    for i, (t0, fc) in enumerate([(0.35, 620.0), (1.55, 780.0), (2.4, 520.0), (3.3, 700.0)]):
        vn = ns(0.28)
        x = np.linspace(0, 1, vn)
        v = bp(white(vn, seed=8200 + i), fc * np.interp(x, [0, 0.5, 1], [0.85, 1.15, 0.9]),
               Q=5.0, order=2) * 3.0
        add(out, v * q4(np.sin(np.pi * x) ** 1.4) * 0.55, t0, 1.0)
    return xfade_loop(out, ns(T), fade=0.05)


# ---- 小游戏：通用 -----------------------------------------------------------

@sfx('jump', 0.2, peak=-8.0, vol=0.7)
def _jump():
    nn = ns(0.2)
    w, _ = pulse(glide(nn, 220.0, 880.0, 0.55), nn, 0.125)
    e = env_bp(nn, [(0, 0.9), (0.1, 0.75), (0.17, 0.4), (0.2, 0.0)])
    return w * e


@sfx('shoot', 0.09, peak=-9.0, vol=0.6)
def _shoot():
    nn = ns(0.09)
    out = np.zeros(nn)
    hn = ns(0.03)
    add(out, hp(noise(hn, rate_idx=1, seed=321), 4000.0) * env_decay(hn, 1.0, 0.3), 0.0, 0.7)
    gn = ns(0.07)
    w, _ = pulse(glide(gn, 2000.0, 700.0, 0.8), gn, 0.25)
    add(out, w * env_decay(gn, 1.0, 0.42), 0.0, 0.8)
    return out


@sfx('explosion_s', 0.35, peak=-2.5, vol=0.9)
def _explosion_s():
    nn = ns(0.35)
    out = np.zeros(nn)
    nz = noise_sweep(nn, glide(nn, 120000.0, 8000.0, 1.0), seed=5)
    nz = lp(nz, glide(nn, 6000.0, 700.0, 0.9))
    add(out, nz * env_decay(nn, 1.0, 0.62) * 1.6, 0.0, 0.75)
    gn = ns(0.3)
    w, _ = pulse(glide(gn, 420.0, 70.0, 0.7), gn, 0.5)
    add(out, w * env_decay(gn, 1.0, 0.55), 0.0, 0.5)
    add(out, thump(0.2, 95, 45, decay=0.55, seed=331, noise_amt=0.3), 0.0, 0.7)
    return fade_edges(out, 0.0005, 0.015)


@sfx('explosion_l', 0.7, peak=-1.5, vol=1.0)
def _explosion_l():
    nn = ns(0.7)
    out = np.zeros(nn)
    nz = noise_sweep(nn, glide(nn, 150000.0, 4000.0, 1.0), seed=7)
    nz = lp(nz, glide(nn, 7000.0, 350.0, 0.85))
    add(out, nz * env_decay(nn, 1.0, 0.8) * 1.8, 0.0, 0.8)
    nz2 = lp(noise(nn, rate_idx=12, seed=341), 260.0)
    add(out, nz2 * env_decay(nn, 1.0, 0.86) * 2.4, 0.0, 0.5)
    gn = ns(0.6)
    w, _ = pulse(glide(gn, 330.0, 45.0, 0.65), gn, 0.5)
    add(out, w * env_decay(gn, 1.0, 0.75), 0.0, 0.45)
    add(out, thump(0.4, 70, 38, decay=0.78, seed=343, noise_amt=0.25), 0.0, 0.9)
    return fade_edges(out, 0.0005, 0.02)


@sfx('hit', 0.12, peak=-5.0, vol=0.8)
def _hit():
    nn = ns(0.12)
    out = np.zeros(nn)
    hn = ns(0.05)
    add(out, bp(noise(hn, rate_idx=3, seed=351), 1800.0, Q=0.9)
        * env_decay(hn, 1.0, 0.35), 0.0, 0.9)
    add(out, ping(0.09, 622.0, decay=0.4, duty=0.5), 0.0, 0.6)
    add(out, thump(0.08, 140, 90, decay=0.35, seed=353, noise_amt=0.1), 0.0, 0.4)
    return out


@sfx('powerup', 0.6, peak=-5.0, vol=0.8)
def _powerup():
    """拾取强化：快速 8 音上行琶音（五声）"""
    seq = [('C5', 1), ('D5', 1), ('E5', 1), ('G5', 1),
           ('A5', 1), ('C6', 1), ('D6', 1), ('E6', 1.4)]
    nn = ns(0.6)
    p1 = notes_line(0.6, seq, bpm=760, duty=0.125, preset='pluck', vol=0.85)
    p2 = render_pulse(parse_seq([('r', 1), ('C5', 1), ('D5', 1), ('E5', 1),
                                 ('G5', 1), ('A5', 1), ('C6', 1), ('D6', 1.4)], 760),
                      nn, duty=0.25, vol=0.4, preset='pluck')
    return p1 * 0.8 + p2 * 0.35


@sfx('player_die', 1.2, peak=-3.5, vol=0.9)
def _player_die():
    """玩家死亡：下行半音阶滑音 + 三角波长音收尾"""
    nn = ns(1.2)
    out = np.zeros(nn)
    # 半音阶下行（每 55ms 一个半音，台阶式，很 NES）
    stepn = ns(0.055)
    total = ns(0.72)
    freqs = np.zeros(total)
    base = note_freq('A5')
    k = 0
    for a in range(0, total, stepn):
        b = min(a + stepn, total)
        freqs[a:b] = base * 2.0 ** (-k / 12.0)
        k += 1
    w, _ = pulse(freqs, total, 0.25)
    e = env_bp(total, [(0, 0.9), (0.3, 0.8), (0.6, 0.55), (0.72, 0.35)])
    add(out, w * e, 0.0, 0.7)
    # 噪声"呲"
    add(out, hp(noise(ns(0.2), rate_idx=2, seed=361), 2500.0)
        * env_decay(ns(0.2), 1.0, 0.5), 0.0, 0.25)
    # 三角波长音收尾
    tn = ns(0.46)
    tw, _ = triangle(np.full(tn, note_freq('A2')), tn)
    add(out, tw * env_bp(tn, [(0, 0.95), (0.25, 0.8), (0.42, 0.4), (0.46, 0.0)]), 0.74, 0.85)
    return out


@sfx('stage_clear', 2.2, peak=-3.5, vol=0.9)
def _stage_clear():
    """过关：欢快 8 音上行主题 + 三角波和声 + 结尾长音"""
    T, BPM = 2.2, 200.0
    nn = ns(T)
    lead = [('G4', 0.5), ('C5', 0.5), ('E5', 0.5), ('D5', 0.5),
            ('E5', 0.5), ('G5', 0.5), ('A5', 0.5), ('C6', 3.5)]
    p1 = render_pulse(parse_seq(lead, BPM), nn, duty=0.5, vol=0.8, preset='lead',
                      vib=(6.0, 40), vib_delay=0.3)
    harm = [('E4', 0.5), ('G4', 0.5), ('C5', 0.5), ('A4', 0.5),
            ('C5', 0.5), ('E5', 0.5), ('G5', 0.5), ('E5', 3.5)]
    p2 = render_pulse(parse_seq(harm, BPM), nn, duty=0.25, vol=0.45, preset='organ')
    tri = render_tri(parse_seq([('C3', 2), ('G3', 1), ('A3', 1), ('C3', 3.5)], BPM),
                     nn, vol=0.9, preset='bass')
    noi = render_drums(['H.H.H.H.', 'H.H.S.C.'], nn, BPM * 2, vol=0.5, step=0.25)
    return p1 * 0.55 + p2 * 0.28 + tri * 0.42 + noi * 0.22


@sfx('extra_life', 0.9, peak=-4.5, vol=0.85)
def _extra_life():
    """加命：明亮 6 音上行"""
    T, BPM = 0.9, 420.0
    nn = ns(T)
    lead = [('C5', 1), ('E5', 1), ('G5', 1), ('A5', 1), ('C6', 1), ('E6', 1.3)]
    p1 = render_pulse(parse_seq(lead, BPM), nn, duty=0.25, vol=0.85, preset='pluck')
    p2 = render_pulse(parse_seq([('r', 1), ('C5', 1), ('E5', 1), ('G5', 1),
                                 ('A5', 1), ('C6', 1.3)], BPM),
                      nn, duty=0.5, vol=0.45, preset='pluck')
    tri = render_tri(parse_seq([('C3', 3), ('G3', 3.3)], BPM), nn, vol=0.8)
    return p1 * 0.7 + p2 * 0.3 + tri * 0.3


# ---- 坦克 -------------------------------------------------------------------

@sfx('tank_move', 1.0, peak=-13.0, vol=0.5, loop=True)
def _tank_move():
    """坦克履带：低频周期噪声脉冲，可无缝循环（8 个脉冲/秒）"""
    T = 1.0
    nn = ns(T) + ns(0.1)
    out = np.zeros(nn)
    for i in range(8):
        t0 = i * (T / 8.0)
        sn = ns(0.09)
        # 周期噪声（mode6）= NES 的"金属味"噪声
        x = noise(sn, rate_idx=12 if i % 2 == 0 else 13, mode6=True, seed=371 + i)
        x = lp(x, 900.0)
        e = env_decay(sn, 1.0, 0.45)
        add(out, fade_edges(x * e, 0.001, 0.002) * (1.0 if i % 2 == 0 else 0.72), t0, 1.0)
    # 冲击部分先折回（尾巴 0.1s 折到开头），再叠加"只覆盖循环长度"的发动机低频。
    # 发动机取 47Hz —— NES 三角波定时器(t+1=1190) 下 ≈47.0000Hz，1.0s 内正好整数
    # 个周期，循环点相位完全对齐（不会有"嗒"）。
    out = wrap_fold(out, ns(T))
    tt = t_axis(ns(T))
    w, _ = triangle(np.full(ns(T), 47.0), ns(T))
    out = out + w * q4(0.32 + 0.08 * np.sin(2 * np.pi * 4.0 * tt))
    return out


@sfx('tank_fire', 0.15, peak=-3.0, vol=0.9)
def _tank_fire():
    nn = ns(0.15)
    out = np.zeros(nn)
    add(out, bp(noise(nn, rate_idx=5, seed=381), np.linspace(1400, 500, nn), Q=0.8)
        * env_decay(nn, 1.0, 0.45) * 1.5, 0.0, 0.8)
    add(out, thump(0.13, 85, 50, decay=0.4, seed=383, noise_amt=0.3), 0.0, 0.9)
    return fade_edges(out, 0.0005, 0.01)


@sfx('brick_break', 0.2, peak=-6.0, vol=0.8)
def _brick_break():
    """砖墙被打碎：多个短促噪声颗粒"""
    nn = ns(0.2)
    out = np.zeros(nn)
    g = rnd(2468)
    for i in range(6):
        t0 = float(g.uniform(0, 0.11))
        sn = ns(0.05)
        x = bp(noise(sn, rate_idx=int(g.integers(1, 5)), seed=391 + i),
               float(g.uniform(1800, 4200)), Q=1.5)
        add(out, x * env_decay(sn, 1.0, 0.3) * float(g.uniform(0.5, 1.0)), t0, 0.8)
    add(out, thump(0.1, 160, 100, decay=0.35, seed=401, noise_amt=0.2), 0.0, 0.35)
    return out


@sfx('steel_hit', 0.18, peak=-7.0, vol=0.7)
def _steel_hit():
    """打到钢墙：金属叮"""
    nn = ns(0.18)
    out = np.zeros(nn)
    add(out, ping(0.16, 3136.0, decay=0.68, duty=0.5), 0.0, 0.7)
    add(out, tri_ping(0.15, 4186.0, decay=0.6), 0.0, 0.45)
    add(out, hp(noise(ns(0.04), rate_idx=0, seed=411), 5000.0)
        * env_decay(ns(0.04), 1.0, 0.3), 0.0, 0.5)
    return out


@sfx('base_destroyed', 1.8, peak=-1.5, vol=1.0)
def _base_destroyed():
    """老家被毁：大爆炸 + 下行长滑音 + 低频轰鸣"""
    nn = ns(1.8)
    out = np.zeros(nn)
    add(out, _explosion_l() * 1.0, 0.0, 0.9)
    # 下行长滑音
    gn = ns(1.3)
    w, _ = pulse(glide(gn, 400.0, 40.0, 0.6), gn, 0.5)
    add(out, w * env_bp(gn, [(0, 0.8), (0.4, 0.6), (0.9, 0.35), (1.3, 0.0)]), 0.15, 0.5)
    # 低频轰鸣（三角波 + 抖动）
    rn = ns(1.5)
    tt = t_axis(rn)
    rw, _ = triangle(45.0 * (1.0 + 0.06 * np.sin(2 * np.pi * 5.5 * tt)), rn)
    add(out, rw * env_decay(rn, 1.0, 0.94), 0.2, 0.8)
    # 碎片
    g = rnd(8642)
    for i in range(9):
        t0 = float(g.uniform(0.25, 1.4))
        sn = ns(0.07)
        add(out, bp(noise(sn, rate_idx=int(g.integers(1, 6)), seed=421 + i),
                    float(g.uniform(900, 3600)), Q=1.4)
            * env_decay(sn, 1.0, 0.35) * float(g.uniform(0.2, 0.6)), t0, 0.5)
    return fade_edges(out, 0.0005, 0.03)


# ---- 格斗 -------------------------------------------------------------------

@sfx('punch', 0.13, peak=-4.0, vol=0.85)
def _punch():
    nn = ns(0.13)
    out = np.zeros(nn)
    add(out, bp(noise(nn, rate_idx=6, seed=431), np.linspace(1500, 700, nn), Q=0.9)
        * env_decay(nn, 1.0, 0.38) * 1.4, 0.0, 0.85)
    add(out, thump(0.11, 175, 110, decay=0.35, seed=433, noise_amt=0.15), 0.0, 0.7)
    return fade_edges(out, 0.0004, 0.008)


@sfx('kick', 0.16, peak=-3.5, vol=0.9)
def _kick():
    nn = ns(0.16)
    out = np.zeros(nn)
    add(out, lp(noise(nn, rate_idx=8, seed=441), np.linspace(900, 320, nn))
        * env_decay(nn, 1.0, 0.45) * 1.6, 0.0, 0.85)
    add(out, thump(0.14, 110, 65, decay=0.42, seed=443, noise_amt=0.2), 0.0, 0.9)
    return fade_edges(out, 0.0004, 0.01)


@sfx('block', 0.12, peak=-8.0, vol=0.7)
def _block():
    nn = ns(0.12)
    out = np.zeros(nn)
    add(out, ping(0.1, 2637.0, decay=0.5, duty=0.5), 0.0, 0.65)
    add(out, tri_ping(0.11, 3520.0, decay=0.55), 0.0, 0.4)
    add(out, hp(noise(ns(0.03), rate_idx=1, seed=451), 4500.0)
        * env_decay(ns(0.03), 1.0, 0.28), 0.0, 0.45)
    return out


@sfx('ko', 1.6, peak=-2.0, vol=1.0)
def _ko():
    """KO：戏剧性下行 + 噪声重击 + 长低音"""
    nn = ns(1.6)
    out = np.zeros(nn)
    # 下行（羽调式五声下行，有点武侠味）
    BPM = 150.0
    lead = [('A5', 0.5), ('G5', 0.5), ('E5', 0.5), ('D5', 0.5), ('A4', 1.0)]
    add(out, render_pulse(parse_seq(lead, BPM), nn, duty=0.5, vol=0.85, preset='organ'),
        0.0, 0.55)
    # 两下重击
    for i, t0 in enumerate([0.0, 0.4]):
        add(out, lp(noise(ns(0.25), rate_idx=7, seed=461 + i), 1400.0)
            * env_decay(ns(0.25), 1.0, 0.55) * 1.5, t0, 0.55 - 0.1 * i)
        add(out, thump(0.24, 95, 55, decay=0.5, seed=463 + i, noise_amt=0.2), t0, 0.8)
    # 长低音
    tn = ns(0.72)
    tw, _ = triangle(np.full(tn, note_freq('A2')), tn)
    add(out, tw * env_bp(tn, [(0, 0.95), (0.4, 0.75), (0.68, 0.35), (0.72, 0.0)]), 0.86, 0.9)
    add(out, render_pulse(parse_seq([('A3', 2.0)], BPM), ns(0.9), duty=0.5, vol=0.5,
                          preset='organ'), 0.86, 0.35)
    return fade_edges(out, 0.0005, 0.02)


# ============================================================================
# 三、渲染 / 转码 / manifest
# ============================================================================

import bgm_defs   # noqa: E402  （导入即注册 11 首 BGM）


def finish_sfx(x, dur, peak_db, loop):
    """统一后处理：去直流 -> 严格对齐时长 -> 边缘处理 -> 峰值归一"""
    x = np.asarray(x, dtype=np.float64)
    x = dc_block(x)
    n = ns(dur)
    if len(x) < n:
        x = np.concatenate([x, np.zeros(n - len(x))])
    else:
        x = x[:n]
    if loop:
        # 循环素材：绝不做首尾淡入淡出（会破坏循环点），循环干净由 builder 内
        # 的 wrap_fold / xfade_loop 保证
        pass
    else:
        x = fade_edges(x, 0.0004, 0.004)
    x = peak_norm(x, peak_db)
    return x


def finish_bgm(st, dur, peak_db=-6.0, loop=True):
    st = np.asarray(st, dtype=np.float64)
    if st.ndim == 1:
        st = np.vstack([st, st])
    n = ns(dur)
    if st.shape[1] < n:
        st = np.hstack([st, np.zeros((2, n - st.shape[1]))])
    else:
        st = st[:, :n]
    st = st - st.mean(axis=1, keepdims=True)
    if not loop:
        for c in range(2):
            st[c] = fade_edges(st[c], 0.001, 0.02)
    p = float(np.max(np.abs(st)))
    if p > 1e-9:
        st = st * (10.0 ** (peak_db / 20.0)) / p
    return st


def encode(wav_path, out_dir, key):
    """转成 mp3(128kbps) 与 ogg(q4)，同名两份"""
    os.makedirs(out_dir, exist_ok=True)
    mp3 = os.path.join(out_dir, key + '.mp3')
    ogg = os.path.join(out_dir, key + '.ogg')
    cmds = [
        ['ffmpeg', '-y', '-v', 'error', '-i', wav_path, '-c:a', 'libmp3lame',
         '-b:a', '128k', '-ar', '44100', mp3],
        ['ffmpeg', '-y', '-v', 'error', '-i', wav_path, '-c:a', 'libvorbis',
         '-q:a', '4', '-ar', '44100', ogg],
    ]
    procs = [subprocess.Popen(c, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
             for c in cmds]
    for p, c in zip(procs, cmds):
        out, err = p.communicate()
        if p.returncode != 0:
            raise RuntimeError('ffmpeg failed: %s\n%s' % (' '.join(c), err.decode()))
    return mp3, ogg


def loop_seam_report(x, dur, win=0.05):
    """循环点自检：首尾 0.05s 的 RMS 与"跨接点"波形差"""
    a = np.asarray(x, dtype=np.float64)
    if a.ndim > 1:
        a = a.mean(axis=0)
    w = ns(win)
    head, tail = a[:w], a[-w:]
    rms = lambda v: float(np.sqrt(np.mean(v ** 2))) + 1e-12
    # 跨接点跳变：把尾巴接到头部，看拼接处的样本差
    jump = float(abs(a[-1] - a[0]))
    return dict(rms_head=rms(head), rms_tail=rms(tail),
                rms_db_diff=20 * np.log10(rms(tail) / rms(head)), sample_jump=jump)


def main(argv):
    filters = [a for a in argv if not a.startswith('-')]
    wav_only = '--wav-only' in argv
    want_score = '--score' in argv
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(OUT_SFX, exist_ok=True)
    os.makedirs(OUT_BGM, exist_ok=True)

    def wanted(k):
        return (not filters) or any(f in k for f in filters)

    print('=' * 100)
    print('《那年的红白机》音频合成  ——  SFX %d 条 / BGM %d 首' % (len(SFX), len(BGM)))
    print('=' * 100)
    man = {'sfx': [], 'bgm': []}
    seams = []

    # ---- SFX -------------------------------------------------------------
    print('\n[音效]  %-18s %7s %7s %8s %6s  %s' %
          ('key', '时长', '峰值', 'RMS', '循环', '说明'))
    for key, sp in SFX.items():
        if not wanted(key):
            continue
        x = finish_sfx(sp['fn'](), sp['dur'], sp['peak'], sp['loop'])
        wav = write_wav(os.path.join(TMP, key + '.wav'), x)
        if not wav_only:
            encode(wav, OUT_SFX, key)
        pk = 20 * np.log10(max(1e-12, float(np.max(np.abs(x)))))
        rms = 20 * np.log10(max(1e-12, float(np.sqrt(np.mean(x ** 2)))))
        extra = ''
        if sp['loop']:
            s = loop_seam_report(x, sp['dur'])
            seams.append((key, s))
            extra = '首尾RMS差 %+.2fdB  接点跳变 %.4f' % (s['rms_db_diff'], s['sample_jump'])
        print('        %-18s %6.3fs %6.1fdB %7.1fdB %6s  %s' %
              (key, sp['dur'], pk, rms, 'Y' if sp['loop'] else '-', extra))
        man['sfx'].append(dict([('key', key), ('file', 'sfx/' + key),
                                ('duration', round(sp['dur'], 3)),
                                ('volume', sp['vol'])] +
                               ([('loop', True)] if sp['loop'] else [])))

    # ---- BGM -------------------------------------------------------------
    print('\n[BGM]   %-14s %7s %7s %7s %8s  %s' %
          ('key', '时长', 'BPM', '峰值', 'RMS', '循环点'))
    for key, sp in BGM.items():
        if not wanted(key):
            continue
        st = finish_bgm(sp['fn'](), sp['dur'], -6.0, sp['loop'])
        bgm_defs.SCORES[key] = dict(bgm_defs.LAST_SCORE)
        wav = write_wav(os.path.join(TMP, key + '.wav'), st)
        if not wav_only:
            encode(wav, OUT_BGM, key)
        pk = 20 * np.log10(max(1e-12, float(np.max(np.abs(st)))))
        rms = 20 * np.log10(max(1e-12, float(np.sqrt(np.mean(st ** 2)))))
        extra = '-'
        if sp['loop']:
            s = loop_seam_report(st, sp['dur'])
            seams.append((key, s))
            extra = '首尾RMS差 %+.2fdB  接点跳变 %.4f' % (s['rms_db_diff'], s['sample_jump'])
        print('        %-14s %6.2fs %7.1f %6.1fdB %7.1fdB  %s' %
              (key, sp['dur'], sp['bpm'], pk, rms, extra))
        man['bgm'].append(dict([('key', key), ('file', 'bgm/' + key),
                                ('duration', round(sp['dur'], 3)),
                                ('loop', bool(sp['loop'])),
                                ('volume', sp['vol'])]))

    # ---- manifest --------------------------------------------------------
    if not filters:
        os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
        with open(MANIFEST, 'w', encoding='utf-8') as f:
            json.dump(man, f, ensure_ascii=False, indent=2)
        print('\n-> %s  (sfx %d, bgm %d)' % (MANIFEST, len(man['sfx']), len(man['bgm'])))
    else:
        print('\n(过滤模式，未重写 manifest.json)')

    if want_score:
        for k in ('bgm_room', 'bgm_contra'):
            if k in bgm_defs.SCORES:
                print('\n' + '=' * 100)
                print('乐谱：%s   调式=%s' % (k, BGM[k]['key_sig']))
                print('=' * 100)
                print(bgm_defs.format_score(bgm_defs.SCORES[k]))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
