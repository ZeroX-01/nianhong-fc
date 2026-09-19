#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_audio.py —— 《那年的红白机》音频资源自动校验

检查项：
  ① 文件存在，且 .mp3 / .ogg 成对
  ② 实际时长 vs manifest 声明时长，偏差必须 < 0.15s
  ③ ffmpeg volumedetect：mean_volume 不为 -inf（非静音）、max_volume 不为 0.0dB（未削顶）
  ④ 标注可循环的文件：比较首尾各 0.05s 的 RMS 差异，并计算"循环接点跳变"
     （|x[0]-x[-1]| 与信号自身 99 分位相邻样本差的比值；> 3 视为可疑咔哒声）

用法：
    python3 tools/verify_audio.py            # 全量校验
    python3 tools/verify_audio.py cicada bgm # 只查 key 含子串的项
"""

import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'assets', 'audio')
MANIFEST = os.path.join(AUDIO, 'manifest.json')

DUR_TOL = 0.15          # 时长偏差红线
SEAM_RATIO_TOL = 3.0    # 循环接点跳变比值红线
EXTS = ('.mp3', '.ogg')


def run(cmd, binary=False):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = p.stdout if binary else p.stdout.decode('utf-8', 'ignore')
    return p.returncode, out, p.stderr.decode('utf-8', 'ignore')


def probe_duration(path):
    rc, out, err = run(['ffprobe', '-v', 'error', '-show_entries',
                        'format=duration', '-of', 'default=nw=1:nk=1', path])
    try:
        return float(out.strip())
    except Exception:
        return None


def volumedetect(path):
    rc, out, err = run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'volumedetect',
                        '-f', 'null', '-'])
    mean = mx = None
    m = re.search(r'mean_volume:\s*(-?[\d.]+|-inf) dB', err)
    if m:
        mean = float('-inf') if 'inf' in m.group(1) else float(m.group(1))
    m = re.search(r'max_volume:\s*(-?[\d.]+|-inf) dB', err)
    if m:
        mx = float('-inf') if 'inf' in m.group(1) else float(m.group(1))
    return mean, mx


def decode(path):
    """解码成 float32 mono numpy（用实际发布的文件，而不是中间 wav）"""
    rc, out, err = run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le',
                        '-ac', '1', '-ar', '44100', '-'], binary=True)
    if rc != 0:
        return None
    return np.frombuffer(out, dtype='<f4').astype(np.float64)


def seam_metrics(x, sr=44100, win=0.05):
    w = int(sr * win)
    if len(x) < 3 * w:
        w = max(16, len(x) // 3)
    head, tail = x[:w], x[-w:]
    rms = lambda v: float(np.sqrt(np.mean(v ** 2))) + 1e-12
    d = np.abs(np.diff(x))
    p99 = float(np.percentile(d, 99)) + 1e-9
    step = float(abs(x[0] - x[-1]))
    return dict(rms_head=rms(head), rms_tail=rms(tail),
                rms_diff_db=20 * np.log10(rms(tail) / rms(head)),
                step=step, p99_delta=p99, ratio=step / p99)


def check_entry(kind, ent):
    key, rel = ent['key'], ent['file']
    dur_decl = float(ent['duration'])
    loop = bool(ent.get('loop', False))
    res = dict(kind=kind, key=key, loop=loop, dur_decl=dur_decl,
               errs=[], warns=[], info={})
    paths = {}
    for ext in EXTS:
        p = os.path.join(AUDIO, rel + ext)
        paths[ext] = p
        if not os.path.exists(p):
            res['errs'].append('缺文件 %s' % (rel + ext))
        elif os.path.getsize(p) < 256:
            res['errs'].append('%s 体积异常(%dB)' % (ext, os.path.getsize(p)))
    if res['errs']:
        return res
    for ext in EXTS:
        d = probe_duration(paths[ext])
        mean, mx = volumedetect(paths[ext])
        res['info'][ext] = dict(dur=d, mean=mean, max=mx)
        if d is None:
            res['errs'].append('%s ffprobe 读不到时长' % ext)
            continue
        if abs(d - dur_decl) >= DUR_TOL:
            res['errs'].append('%s 时长偏差 %.3fs (%.3f vs %.3f)' %
                               (ext, abs(d - dur_decl), d, dur_decl))
        if mean is None or mean == float('-inf'):
            res['errs'].append('%s 静音 (mean_volume=-inf)' % ext)
        if mx is None or mx >= 0.0:
            res['errs'].append('%s 削顶 (max_volume=%s dB)' % (ext, mx))
    if loop:
        x = decode(paths['.ogg'])
        if x is None or len(x) < 100:
            res['errs'].append('ogg 解码失败，无法做循环点检查')
        else:
            res['seam'] = seam_metrics(x)
            if res['seam']['ratio'] > SEAM_RATIO_TOL:
                res['warns'].append('循环接点跳变比 %.2f > %.1f' %
                                    (res['seam']['ratio'], SEAM_RATIO_TOL))
    return res


def main(argv):
    filters = [a for a in argv if not a.startswith('-')]
    with open(MANIFEST, encoding='utf-8') as f:
        man = json.load(f)
    items = ([('sfx', e) for e in man['sfx']] + [('bgm', e) for e in man['bgm']])
    if filters:
        items = [(k, e) for k, e in items if any(f in e['key'] for f in filters)]

    with ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(lambda t: check_entry(*t), items))

    print('=' * 132)
    print('音频校验报告   manifest: %s' % MANIFEST)
    print('  条目：sfx %d / bgm %d   时长红线 <%.2fs   非静音 & 不削顶   循环接点跳变比 <%.1f'
          % (len(man['sfx']), len(man['bgm']), DUR_TOL, SEAM_RATIO_TOL))
    print('=' * 132)
    hdr = ('%-4s %-16s %8s %8s %8s %8s %8s %8s %8s %6s  %s' %
           ('类', 'key', '声明', 'mp3时长', 'ogg时长', 'mp3峰值', 'ogg峰值',
            'mp3均值', 'ogg均值', '循环', '循环点 / 问题'))
    print(hdr)
    print('-' * 132)
    n_err = n_warn = 0
    for r in results:
        i = r.get('info', {})
        g = lambda e, k: ('%.3f' % i[e][k]) if i.get(e, {}).get(k) is not None else '--'
        seam = ''
        if r.get('seam'):
            s = r['seam']
            seam = '首尾RMS %+.2fdB / 跳变比 %.2f' % (s['rms_diff_db'], s['ratio'])
        msg = seam
        if r['warns']:
            msg += '  [WARN] ' + '; '.join(r['warns'])
        if r['errs']:
            msg += '  [FAIL] ' + '; '.join(r['errs'])
        print('%-4s %-16s %8.3f %8s %8s %8s %8s %8s %8s %6s  %s' %
              (r['kind'], r['key'], r['dur_decl'],
               g('.mp3', 'dur'), g('.ogg', 'dur'),
               g('.mp3', 'max'), g('.ogg', 'max'),
               g('.mp3', 'mean'), g('.ogg', 'mean'),
               'Y' if r['loop'] else '-', msg))
        n_err += len(r['errs'])
        n_warn += len(r['warns'])
    print('-' * 132)

    # 相对音量协调性一览（按 ogg 峰值排序，看 UI 轻 / 爆炸重 是否成立）
    peaks = [(r['key'], r['info']['.ogg']['max']) for r in results
             if r['kind'] == 'sfx' and r.get('info', {}).get('.ogg', {}).get('max') is not None]
    peaks.sort(key=lambda t: t[1])
    if peaks:
        print('\n音效相对音量（ogg 峰值，从轻到重）：')
        line = []
        for k, v in peaks:
            line.append('%s %.1f' % (k, v))
        for i in range(0, len(line), 5):
            print('   ' + ' | '.join(line[i:i + 5]))
    bgm_peaks = [r['info']['.ogg']['max'] for r in results if r['kind'] == 'bgm'
                 and r.get('info', {}).get('.ogg', {}).get('max') is not None]
    if bgm_peaks and peaks:
        print('\nBGM 峰值区间 %.1f ~ %.1f dB；SFX 峰值区间 %.1f ~ %.1f dB'
              % (min(bgm_peaks), max(bgm_peaks), peaks[0][1], peaks[-1][1]))

    print('\n结论：%d 项检查，FAIL %d 处，WARN %d 处 -> %s'
          % (len(results), n_err, n_warn, 'PASS' if n_err == 0 else 'FAILED'))
    return 0 if n_err == 0 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
