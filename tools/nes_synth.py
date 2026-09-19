# -*- coding: utf-8 -*-
"""
nes_synth.py —— 《那年的红白机》音频合成内核（2A03 音源模拟）

设计原则（对应 docs/AUDIO_SPEC.md「必须模拟 NES 限制」）：
  1. 音高：所有振荡器频率先按 NES 11-bit 定时器量化（方波 f=CPU/(16*(t+1))，
     三角波 f=CPU/(32*(t+1))），因此会出现轻微走音——这是年代感的来源。
  2. 音量：所有包络按 4-bit（16 级）量化。
  3. 包络：按 NES 帧（1/60s ≈ 16.67ms）保持的台阶，绝不使用平滑指数曲线
     （指数只用来算台阶的目标值，输出仍是阶梯）。
  4. 音序：每个音符尾部留 1 帧（16ms）静音，模拟 NES 音序器的 key-off。
  5. 声部：Pulse1 + Pulse2 + Triangle + Noise，四个渲染器都是**单音**顺序渲染，
     结构上保证不会超过 2 方波 + 1 三角 + 1 噪声。
  6. 噪声：真的用 1-bit LFSR（15-bit 长序列 / 6-bit 周期噪声两种模式），
     并按 NES 的 16 档噪声周期做 sample-and-hold。

只依赖 numpy / scipy（scipy 仅用于时变滤波，生活环境音需要）。
"""

import os
import wave
import numpy as np

try:
    from scipy.signal import butter, sosfilt, sosfilt_zi
    HAVE_SCIPY = True
except Exception:  # pragma: no cover
    HAVE_SCIPY = False

SR = 44100                 # 采样率
CPU = 1789773.0            # NTSC 2A03 CPU 时钟
FRAME = 1.0 / 60.0         # NES 一帧
FRAME_N = int(round(FRAME * SR))   # 735 samples
GAP = 0.016                # 音符间静音 ~16ms（1 帧）

# ----------------------------------------------------------------------------
# 基础工具
# ----------------------------------------------------------------------------


def ns(sec):
    """秒 -> 采样数"""
    return int(round(sec * SR))


def t_axis(nn):
    return np.arange(nn, dtype=np.float64) / SR


NOTE_OFF = {'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4,
            'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9,
            'A#': 10, 'BB': 10, 'B': 11}


def note_freq(name):
    """'C5' / 'A#3' / 'Eb4' -> Hz；数字直接返回；'r'/'-'/None -> None"""
    if name is None:
        return None
    if isinstance(name, (int, float)):
        return float(name)
    s = str(name).strip()
    if s in ('r', 'R', '.', '-', ''):
        return None
    up = s.upper()
    i = 1
    if len(up) > 1 and up[1] in '#B' and not (up[1] == 'B' and up[0] == 'B' and len(up) == 2):
        i = 2
    key, octv = up[:i], up[i:]
    if key not in NOTE_OFF:
        raise ValueError('bad note %r' % name)
    midi = 12 * (int(octv) + 1) + NOTE_OFF[key]
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


# ---- NES 音高定时器量化 -----------------------------------------------------

def pulse_timer(f):
    if f is None or f <= 0:
        return None
    t = int(round(CPU / (16.0 * f) - 1.0))
    return max(8, min(2047, t))          # t<8 硬件静音


def tri_timer(f):
    if f is None or f <= 0:
        return None
    t = int(round(CPU / (32.0 * f) - 1.0))
    return max(2, min(2047, t))


def q_pulse(f):
    """把频率吸附到 NES 方波定时器能表达的频率"""
    t = pulse_timer(f)
    return None if t is None else CPU / (16.0 * (t + 1))


def q_tri(f):
    t = tri_timer(f)
    return None if t is None else CPU / (32.0 * (t + 1))


def q4(x):
    """4-bit（16 级）音量量化"""
    return np.round(np.clip(x, 0.0, 1.0) * 15.0) / 15.0


def q4s(v):
    return round(max(0.0, min(1.0, float(v))) * 15.0) / 15.0


# ----------------------------------------------------------------------------
# 波形（音高逐帧量化）
# ----------------------------------------------------------------------------

_TRI_TABLE = np.array([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
                       0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
                      dtype=np.float64)
_TRI_TABLE = (_TRI_TABLE / 15.0) * 2.0 - 1.0     # -1..1，32 级台阶


def _quantized_phase(freqs, nn, quant_fn):
    """把（可变）频率按帧分块吸附到 NES 定时器，再累积相位"""
    f = np.asarray(freqs, dtype=np.float64)
    if f.ndim == 0:
        f = np.full(nn, float(f))
    elif len(f) != nn:
        f = np.interp(np.linspace(0, 1, nn), np.linspace(0, 1, len(f)), f)
    qf = np.empty(nn)
    for a in range(0, nn, FRAME_N):
        b = min(a + FRAME_N, nn)
        tgt = float(np.mean(f[a:b]))
        qq = quant_fn(tgt)
        qf[a:b] = 0.0 if qq is None else qq
    return np.cumsum(qf) / SR, qf


def pulse(freqs, nn, duty=0.5, phase0=0.0):
    """NES 方波（12.5/25/50/75% 占空比），音高逐帧量化"""
    ph, _ = _quantized_phase(freqs, nn, q_pulse)
    ph = ph + phase0
    w = np.where((ph % 1.0) < duty, 1.0, -1.0)
    return w, float(ph[-1] if nn else phase0)


def triangle(freqs, nn, phase0=0.0):
    """NES 三角波：32 级 4-bit 台阶"""
    ph, _ = _quantized_phase(freqs, nn, q_tri)
    ph = ph + phase0
    idx = np.floor((ph % 1.0) * 32.0).astype(np.int64) & 31
    return _TRI_TABLE[idx], float(ph[-1] if nn else phase0)


def saw(freqs, nn, phase0=0.0, steps=16):
    ph, _ = _quantized_phase(freqs, nn, q_pulse)
    ph = ph + phase0
    w = (ph % 1.0)
    w = np.floor(w * steps) / (steps - 1) * 2.0 - 1.0
    return w, float(ph[-1] if nn else phase0)


# ---- 1-bit LFSR 噪声 -------------------------------------------------------

NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254,
                 380, 508, 762, 1016, 2034, 4068]

_LFSR_CACHE = {}


def _lfsr_seq(mode6=False):
    """预生成一整个 LFSR 周期（15-bit=32767，6-bit=93），缓存复用"""
    key = bool(mode6)
    if key in _LFSR_CACHE:
        return _LFSR_CACHE[key]
    n = 93 if mode6 else 32767
    out = np.empty(n, dtype=np.float64)
    reg = 1
    tap = 6 if mode6 else 1
    for i in range(n):
        out[i] = -1.0 if (reg & 1) else 1.0       # bit0 取反做输出
        fb = (reg & 1) ^ ((reg >> tap) & 1)
        reg = (reg >> 1) | (fb << 14)
    _LFSR_CACHE[key] = out
    return out


def noise(nn, rate_hz=None, rate_idx=None, mode6=False, seed=0):
    """
    NES 噪声：LFSR 输出以 rate_hz 速率 sample-and-hold 到 44.1k。
    rate_idx 用 NES 的 16 档噪声周期（0=最亮，15=最闷/最"有音高"）。
    """
    if rate_idx is not None:
        rate_hz = CPU / NOISE_PERIODS[int(rate_idx)] / 2.0
    if rate_hz is None:
        rate_hz = 223721.0
    seq = _lfsr_seq(mode6)
    idx = (np.floor(np.arange(nn, dtype=np.float64) * (rate_hz / SR)).astype(np.int64)
           + int(seed) * 977) % len(seq)
    return seq[idx]


def noise_sweep(nn, rate_hz_arr, mode6=False, seed=0):
    """噪声"音高"随时间变化（用于花屏/滑音噪声）"""
    r = np.asarray(rate_hz_arr, dtype=np.float64)
    if r.ndim == 0:
        r = np.full(nn, float(r))
    elif len(r) != nn:
        r = np.interp(np.linspace(0, 1, nn), np.linspace(0, 1, len(r)), r)
    seq = _lfsr_seq(mode6)
    pos = np.cumsum(r) / SR
    idx = (np.floor(pos).astype(np.int64) + int(seed) * 977) % len(seq)
    return seq[idx]


_RNG = np.random.default_rng(19900801)


def white(nn, seed=None):
    rng = _RNG if seed is None else np.random.default_rng(seed)
    return rng.uniform(-1.0, 1.0, nn)


# ----------------------------------------------------------------------------
# 台阶包络（NES 帧保持 + 4-bit 量化）
# ----------------------------------------------------------------------------

def stair(nn, levels, frame_n=FRAME_N, quant=True):
    """把逐帧电平列表展开成阶梯包络"""
    lv = np.asarray(levels, dtype=np.float64)
    if quant:
        lv = q4(lv)
    out = np.repeat(lv, frame_n)
    if len(out) < nn:
        out = np.concatenate([out, np.zeros(nn - len(out))])
    return out[:nn]


def env_bp(nn, points, frame_n=FRAME_N, quant=True):
    """
    分段线性断点 -> 逐帧阶梯（NES 风格）。
    points: [(t_sec, level), ...]
    """
    nf = int(np.ceil(nn / frame_n)) + 1
    ft = (np.arange(nf) * frame_n) / SR
    ts = np.array([p[0] for p in points], dtype=np.float64)
    ls = np.array([p[1] for p in points], dtype=np.float64)
    lv = np.interp(ft, ts, ls)
    return stair(nn, lv, frame_n, quant)


def env_decay(nn, peak=1.0, per_frame=0.85, floor=0.0, frame_n=FRAME_N, quant=True):
    """按帧衰减的阶梯包络（NES 硬件包络的味道）"""
    nf = int(np.ceil(nn / frame_n)) + 1
    lv = peak * (per_frame ** np.arange(nf))
    lv = np.where(lv < floor, 0.0, lv)
    return stair(nn, lv, frame_n, quant)


def env_note(nn, preset='pluck', peak=1.0, frame_n=FRAME_N):
    """乐器包络预设，全部是台阶"""
    nf = max(1, int(np.ceil(nn / frame_n)))
    lv = np.zeros(nf)
    if preset == 'organ':          # 平顶（方波和声/贝斯）
        lv[:] = peak
        if nf >= 2:
            lv[-1] = peak * 0.5
    elif preset == 'lead':         # 起音强、掉到持续位
        for i in range(nf):
            lv[i] = peak if i < 2 else max(peak * 0.72, peak * (0.9 ** (i - 1)))
        if nf >= 2:
            lv[-1] = lv[-1] * 0.4
    elif preset == 'pluck':        # 拨奏
        for i in range(nf):
            lv[i] = peak if i < 1 else max(peak * 0.5, peak * (0.86 ** i))
        if nf >= 3:
            lv[-2] = lv[-2] * 0.6
            lv[-1] = lv[-1] * 0.25
    elif preset == 'stab':         # 短促断奏
        for i in range(nf):
            lv[i] = peak * (0.62 ** i)
    elif preset == 'bass':
        for i in range(nf):
            lv[i] = peak if i < 2 else max(peak * 0.62, peak * (0.93 ** i))
        if nf >= 2:
            lv[-1] = lv[-1] * 0.35
    elif preset == 'soft':         # 慵懒：慢起音
        for i in range(nf):
            lv[i] = min(peak, peak * (0.35 + 0.33 * i))
            if i > 3:
                lv[i] = max(peak * 0.55, peak * (0.955 ** (i - 3)))
        if nf >= 3:
            lv[-2] *= 0.55
            lv[-1] *= 0.2
    else:
        lv[:] = peak
    return stair(nn, lv, frame_n, True)


# ----------------------------------------------------------------------------
# 滤波（生活环境音的芯片化模仿需要）
# ----------------------------------------------------------------------------

def _blockwise(x, fc_arr, order, btype, Q=None, block=512):
    if not HAVE_SCIPY:
        return x
    nn = len(x)
    fc = np.asarray(fc_arr, dtype=np.float64)
    if fc.ndim == 0:
        fc = np.full(nn, float(fc))
    elif len(fc) != nn:
        fc = np.interp(np.linspace(0, 1, nn), np.linspace(0, 1, len(fc)), fc)
    out = np.empty(nn)
    zi = None
    nyq = SR / 2.0
    for a in range(0, nn, block):
        b = min(a + block, nn)
        f0 = float(np.mean(fc[a:b]))
        if btype == 'band':
            bw = f0 / max(0.3, Q)
            lo = max(20.0, f0 - bw / 2)
            hi = min(nyq * 0.985, f0 + bw / 2)
            if hi <= lo * 1.02:
                hi = min(nyq * 0.985, lo * 1.05)
            sos = butter(order, [lo / nyq, hi / nyq], btype='bandpass', output='sos')
        else:
            f0 = min(max(f0, 15.0), nyq * 0.985)
            sos = butter(order, f0 / nyq, btype=btype, output='sos')
        if zi is None:
            zi = sosfilt_zi(sos) * 0.0     # 从零状态起振：滤波器起始不产生台阶
        chunk, zi = sosfilt(sos, x[a:b], zi=zi)
        out[a:b] = chunk
    return out


def lp(x, fc, order=2, block=512):
    return _blockwise(x, fc, order, 'low', block=block)


def hp(x, fc, order=2, block=512):
    return _blockwise(x, fc, order, 'high', block=block)


def bp(x, fc, Q=3.0, order=2, block=256):
    return _blockwise(x, fc, order, 'band', Q=Q, block=block)


# ----------------------------------------------------------------------------
# 混音 / 循环 / 输出
# ----------------------------------------------------------------------------

def add(dst, src, at_sec=0.0, gain=1.0):
    """把 src 叠加到 dst 的 at_sec 位置（越界自动裁剪）"""
    i = ns(at_sec)
    if i >= len(dst):
        return dst
    if i < 0:
        src = src[-i:]
        i = 0
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n] * gain
    return dst


def echo_tail(x, delays_gains, lp_fc=None):
    """用多次衰减副本模拟混响（楼道/房间）"""
    extra = ns(max(d for d, _ in delays_gains)) + 1
    out = np.concatenate([x, np.zeros(extra)])
    for d, g in delays_gains:
        cp = x * g
        if lp_fc:
            cp = lp(cp, lp_fc)
        add(out, cp, d)
    return out


def wrap_fold(buf, loop_n):
    """
    无缝循环的核心手段：渲染 loop_n + 尾巴，再把超出部分折回开头。
    结果在数学上就是"无限循环渲染"的一个周期 —— 循环点零跳变。
    """
    out = np.array(buf[:loop_n], dtype=np.float64)
    tail = buf[loop_n:]
    if len(tail):
        k = min(len(tail), loop_n)
        out[:k] += tail[:k]
        if len(tail) > loop_n:        # 极长尾巴再折一轮
            rest = tail[loop_n:]
            out[:min(len(rest), loop_n)] += rest[:loop_n]
    return out


def xfade_loop(x, loop_n, fade=0.05):
    """
    噪声床类素材（随机信号无法靠 wrap_fold 对齐）用尾部交叉淡接到头部：
    需要 len(x) >= loop_n + fade。
    """
    fn = ns(fade)
    assert len(x) >= loop_n + fn, 'xfade_loop needs extra tail'
    out = np.array(x[:loop_n], dtype=np.float64)
    w = np.linspace(0.0, 1.0, fn)                # 等增益（功率）交叉淡接
    a = np.cos(w * np.pi / 2) ** 1.0
    b = np.sin(w * np.pi / 2) ** 1.0
    out[:fn] = out[:fn] * b + x[loop_n:loop_n + fn] * a
    return out


def dc_block(x):
    return x - float(np.mean(x))


def fade_edges(x, fin=0.004, fout=0.006):
    n1, n2 = ns(fin), ns(fout)
    y = np.array(x, dtype=np.float64)
    if n1 > 0 and n1 < len(y):
        y[:n1] *= np.linspace(0, 1, n1)
    if n2 > 0 and n2 < len(y):
        y[-n2:] *= np.linspace(1, 0, n2)
    return y


def peak_norm(x, dbfs=-3.0):
    p = float(np.max(np.abs(x))) if len(x) else 0.0
    if p < 1e-9:
        return x
    return x * (10.0 ** (dbfs / 20.0)) / p


def soft_clip(x, thr=0.985):
    return np.tanh(x / thr) * thr


def write_wav(path, x, sr=SR):
    """写 16-bit wav；x 为 mono(1D) 或 stereo(2, N)"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = np.asarray(x, dtype=np.float64)
    if a.ndim == 1:
        data = a[None, :]
    else:
        data = a
    data = np.clip(data, -1.0, 1.0)
    ilv = (data.T * 32767.0).astype('<i2').tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(data.shape[0])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(ilv)
    return path


# ----------------------------------------------------------------------------
# 音序器（4 声部，全部单音顺序渲染 = 结构上遵守 NES 声部限制）
# ----------------------------------------------------------------------------

def beats(bpm):
    return 60.0 / bpm


def parse_seq(tokens, bpm, start_beat=0.0):
    """
    tokens: [(note, dur_beats), ...] 或 [(note, dur_beats, vol), ...]
    note: 'C5' / 'r'(休止) / '~'(延长前一音，做连音)
    返回 [(t_start, dur_sec, freq, vol, tie_next)]
    """
    sb = beats(bpm)
    out = []
    bt = start_beat
    for tk in tokens:
        note, dur = tk[0], tk[1]
        vol = tk[2] if len(tk) > 2 else 1.0
        if note == '~' and out:
            out[-1] = (out[-1][0], out[-1][1] + dur * sb, out[-1][2], out[-1][3])
        else:
            f = note_freq(note)
            out.append((bt * sb, dur * sb, f, vol))
        bt += dur
    return out


def render_pulse(events, total_n, duty=0.5, vol=0.75, preset='lead',
                 gap=GAP, vib=None, vib_delay=0.0, detune=0.0, phase_reset=True):
    """
    单个方波声部（单音）。vib=(hz, depth_cents)
    """
    buf = np.zeros(total_n)
    ph = 0.0
    for (t0, dur, f, v) in events:
        if f is None:
            continue
        nn = ns(max(0.02, dur - gap))
        if nn <= 0:
            continue
        ff = np.full(nn, f * (1.0 + detune / 1200.0 * np.log(2) * 0 + detune * 0.0005787))
        if vib:
            hz, cents = vib
            tt = t_axis(nn)
            m = np.clip((tt - vib_delay) / 0.06, 0, 1)
            ff = ff * (2.0 ** (cents * m * np.sin(2 * np.pi * hz * tt) / 1200.0))
        w, ph = pulse(ff, nn, duty, ph if not phase_reset else 0.0)
        e = env_note(nn, preset, q4s(vol * v))
        add(buf, fade_edges(w * e, 0.0004, 0.0015), t0)
    return buf


def render_tri(events, total_n, vol=0.85, preset='bass', gap=GAP):
    buf = np.zeros(total_n)
    ph = 0.0
    for (t0, dur, f, v) in events:
        if f is None:
            continue
        nn = ns(max(0.02, dur - gap))
        if nn <= 0:
            continue
        w, ph = triangle(np.full(nn, f), nn, 0.0)
        e = env_note(nn, preset, q4s(vol * v))
        add(buf, fade_edges(w * e, 0.0006, 0.002), t0)
    return buf


# ---- 打击乐（噪声声部，单音；后一个音自然截断前一个） ----------------------

def drum(kind, vol=1.0):
    """噪声声部打击乐。加 0.8ms 淡入淡出，避免噪声整幅起振造成的额外"咔"。"""
    return fade_edges(_drum_raw(kind, vol), 0.0008, 0.002)


def _drum_raw(kind, vol=1.0):
    if kind in ('K', 'k'):        # kick：低档噪声 + 低通，短促
        nn = ns(0.085)
        x = noise(nn, rate_idx=13, seed=3)
        x = lp(x, np.linspace(320, 90, nn), order=2)
        e = env_decay(nn, 1.0, 0.42)
        return x * e * 3.0 * vol
    if kind in ('S',):            # snare
        nn = ns(0.11)
        x = 0.75 * noise(nn, rate_idx=4, seed=7) + 0.35 * noise(nn, rate_idx=9, seed=11)
        x = bp(x, 1900, Q=1.1)
        e = env_decay(nn, 1.0, 0.5)
        return x * e * 2.4 * vol
    if kind in ('s',):            # ghost snare
        return drum('S', 0.45 * vol)
    if kind in ('H',):            # hat
        nn = ns(0.045)
        x = noise(nn, rate_idx=1, seed=5)
        x = hp(x, 5200)
        e = env_decay(nn, 1.0, 0.35)
        return x * e * 1.5 * vol
    if kind in ('h',):
        return drum('H', 0.45 * vol)
    if kind in ('C',):            # crash / 镲
        nn = ns(0.34)
        x = noise(nn, rate_idx=0, seed=13)
        x = hp(x, 3800)
        e = env_decay(nn, 1.0, 0.82)
        return x * e * 1.5 * vol
    if kind in ('T',):            # tom / 军鼓滚奏用
        nn = ns(0.09)
        x = noise(nn, rate_idx=11, seed=17)
        x = bp(x, 420, Q=1.6)
        e = env_decay(nn, 1.0, 0.5)
        return x * e * 3.0 * vol
    if kind in ('t',):
        return drum('T', 0.5 * vol)
    raise ValueError(kind)


def render_drums(pattern_bars, total_n, bpm, vol=0.8, step=0.25, accents=None):
    """
    pattern_bars: 每小节一个字符串，每字符 = step 拍（默认 16 分音符）
      K kick / S snare / s 轻军鼓 / H hat / h 轻 hat / C 镲 / T tom / t 轻 tom / '.' 空
    噪声声部单音：后一次触发截断前一次（与硬件一致）。
    """
    buf = np.zeros(total_n)
    sb = beats(bpm)
    hits = []
    bt = 0.0
    for bi, bar in enumerate(pattern_bars):
        for si, ch in enumerate(bar):
            if ch not in '.-| ':
                hits.append(((bt + si * step) * sb, ch))
        bt += len(bar) * step
    for i, (t0, ch) in enumerate(hits):
        v = vol if accents is None else vol * accents(i, t0)
        x = drum(ch, 1.0)
        if i + 1 < len(hits):
            room = ns(hits[i + 1][0] - t0)
            if room > 4 and len(x) > room:
                x = fade_edges(x[:room], 0.0005, 0.002)
        add(buf, x * q4s(min(1.0, v)), t0)
    return buf


def mix_stereo(chans, pans=None, gains=None):
    """
    chans: {'p1':arr,'p2':arr,'tri':arr,'noi':arr}
    轻微立体声扩展：方波左右微展开，三角/噪声居中。
    """
    pans = pans or {'p1': -0.22, 'p2': 0.24, 'tri': 0.0, 'noi': 0.06}
    gains = gains or {}
    n = max(len(v) for v in chans.values())
    L = np.zeros(n)
    R = np.zeros(n)
    for k, v in chans.items():
        p = pans.get(k, 0.0)
        g = gains.get(k, 1.0)
        gl = np.cos((p + 1) * np.pi / 4) * np.sqrt(2) / 1.0
        gr = np.sin((p + 1) * np.pi / 4) * np.sqrt(2) / 1.0
        add(L, v, 0.0, g * gl * 0.707)
        add(R, v, 0.0, g * gr * 0.707)
    return np.vstack([L, R])
