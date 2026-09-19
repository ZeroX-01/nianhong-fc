#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audio_plot.py —— 重点音频的"听觉替代"检查

为 8 个重点音频画 波形图 + 频谱图 -> tools/audio_check.png，
并打印客观特征（包络峰值位置、冲击次数、振幅调制频率、各频段能量占比），
用于替代人耳判断是否符合 spec 描述。

用法：python3 tools/audio_plot.py
"""

import os
import subprocess
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'assets', 'audio')
OUT = os.path.join(ROOT, 'tools', 'audio_check.png')
SR = 44100

# (相对路径, 标题, 只取前 N 秒(0=全部), spec 期望)
TARGETS = [
    ('sfx/tv_power_on', 'tv_power_on  CRT通电', 0,
     '开头0.05s"啵"爆 + 7.8k行频啸叫(细横线) + 0.6s噪声嗤渐弱 + 0.9s轻叮'),
    ('sfx/cart_blow', 'cart_blow  对卡带哈气', 0,
     '钟形气流包络；能量集中中频 700-1400Hz 带通并缓慢上下扫；尾部断续'),
    ('sfx/cart_rub', 'cart_rub  卡带划桌面', 0,
     '两个往复"沙沙"(各0.25s) + 200Hz木头共鸣，低中频为主'),
    ('sfx/boot_jingle', 'boot_jingle  开机叮咚', 0,
     '五声上行 C5-D5-E5-G5-C6 五级台阶 + 三角波贝斯垫底，末音颤音持续'),
    ('sfx/footstep_stair', 'footstep_stair  楼道脚步', 0,
     '6下冲击，振幅递增、间隔递减，带混响尾巴'),
    ('sfx/cicada', 'cicada  夏日蝉鸣(4s循环)', 0,
     '明显振幅调制(~17-23Hz) + 能量集中 3.5-9kHz 高频'),
    ('bgm/bgm_room', 'bgm_room  客厅(前8s)', 8.0,
     '稀疏留白：大段低电平；主旋律单音 + 三角波贝斯，几乎无打击乐'),
    ('bgm/bgm_tense', 'bgm_tense  妈妈快回来(前8s)', 8.0,
     '密集十六分固定低音 + 打击乐，电平持续偏高、逐段推进'),
]


def decode(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le',
                        '-ac', '1', '-ar', str(SR), '-'],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return np.frombuffer(p.stdout, dtype='<f4').astype(np.float64)


def envelope(x, win=int(0.005 * SR)):
    n = len(x) // win
    e = np.abs(x[:n * win]).reshape(n, win).max(axis=1)
    return e, win


def onsets(x, thr_ratio=0.22):
    """粗略冲击检测：包络上升沿"""
    e, win = envelope(x, int(0.004 * SR))
    thr = e.max() * thr_ratio
    out = []
    prev = 0.0
    for i, v in enumerate(e):
        if v > thr and v > prev * 1.6 and (not out or i - out[-1][0] > 8):
            out.append((i, v))
        prev = max(prev * 0.85, v)
    return [(i * 0.004, v) for i, v in out]


def am_rate(x):
    """用包络自相关估计振幅调制频率"""
    e, win = envelope(x, int(0.002 * SR))
    e = e - e.mean()
    if np.allclose(e, 0):
        return None
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    ac /= ac[0] + 1e-12
    lo, hi = int(1 / 40.0 / 0.002), int(1 / 8.0 / 0.002)     # 8~40Hz
    seg = ac[lo:hi]
    if len(seg) == 0:
        return None
    k = int(np.argmax(seg)) + lo
    return 1.0 / (k * 0.002)


def bands(x):
    # 分帧平均功率谱：整段加一个 Hanning 会把 0s 处的瞬态（如通电"啵"）窗成 0
    n = 2048
    hop = n // 2
    win = np.hanning(n)
    if len(x) < n:
        x = np.pad(x, (0, n - len(x)))
    X = np.zeros(n // 2 + 1)
    cnt = 0
    for i in range(0, len(x) - n + 1, hop):
        X += np.abs(np.fft.rfft(x[i:i + n] * win)) ** 2
        cnt += 1
    X /= max(cnt, 1)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    edges = [0, 200, 800, 2000, 6000, 16000, SR / 2]
    tot = X.sum() + 1e-20
    return [(edges[i], edges[i + 1],
             100.0 * X[(f >= edges[i]) & (f < edges[i + 1])].sum() / tot)
            for i in range(len(edges) - 1)]


def main():
    fig, axes = plt.subplots(len(TARGETS), 2, figsize=(19, 3.0 * len(TARGETS)))
    print('=' * 118)
    print('重点音频客观特征检查（替代人耳）')
    print('=' * 118)
    for r, (rel, title, cut, expect) in enumerate(TARGETS):
        path = os.path.join(AUDIO, rel + '.ogg')
        x = decode(path)
        if cut:
            x = x[:int(cut * SR)]
        t = np.arange(len(x)) / SR
        pk = 20 * np.log10(max(1e-12, np.abs(x).max()))
        rms = 20 * np.log10(max(1e-12, np.sqrt((x ** 2).mean())))

        ax = axes[r][0]
        ax.plot(t, x, lw=0.35, color='#1b6ca8')
        e, win = envelope(x)
        ax.plot(np.arange(len(e)) * win / SR, e, lw=1.0, color='#e8590c')
        ax.plot(np.arange(len(e)) * win / SR, -e, lw=1.0, color='#e8590c')
        ax.set_xlim(0, t[-1])
        ax.set_ylim(-1.02 * max(0.05, np.abs(x).max()), 1.02 * max(0.05, np.abs(x).max()))
        ax.set_title('%s   波形  peak %.1fdB / rms %.1fdB' % (title, pk, rms), fontsize=10)
        ax.set_xlabel('t (s)', fontsize=8)
        ax.grid(alpha=0.25)

        ax = axes[r][1]
        ax.specgram(x, NFFT=1024, Fs=SR, noverlap=768, scale='dB',
                    cmap='magma', vmin=-160, vmax=-40)
        ax.set_ylim(0, 16000)
        ax.set_yticks([0, 2000, 4000, 8000, 12000, 16000])
        ax.set_yticklabels(['0', '2k', '4k', '8k', '12k', '16k'], fontsize=8)
        ax.set_title('%s   频谱' % title, fontsize=10)
        ax.set_xlabel('t (s)', fontsize=8)

        # ---- 文本特征 ----
        e5, w5 = envelope(x, int(0.005 * SR))
        pk_pos = float(np.argmax(e5) * 0.005)
        bd = bands(x)
        ons = onsets(x)
        am = am_rate(x)
        print('\n%-18s  时长%.2fs  峰值%.1fdB  RMS%.1fdB  包络峰值位置 %.2fs'
              % (rel.split('/')[-1], len(x) / SR, pk, rms, pk_pos))
        print('  期望：%s' % expect)
        print('  频段能量占比：' + '  '.join('%s-%sHz %.1f%%' %
              (int(a), int(b), p) for a, b, p in bd))
        print('  检出冲击 %d 个：%s' % (len(ons),
              ', '.join('%.2fs(%.2f)' % (tt, vv) for tt, vv in ons[:10])))
        print('  包络自相关主调制频率：%s' % ('%.1f Hz' % am if am else 'n/a'))

    fig.suptitle('《那年的红白机》重点音频波形/频谱自查   audio_check.png', fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.985))
    fig.savefig(OUT, dpi=90)
    print('\n-> %s' % OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
