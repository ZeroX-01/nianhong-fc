# -*- coding: utf-8 -*-
"""
audio_reg.py —— 音频资源注册表（被 gen_audio.py 与 bgm_defs.py 共享）

SFX / BGM 两个有序字典，登记顺序 = docs/AUDIO_SPEC.md 表格顺序。
"""

SFX = {}
BGM = {}


def sfx(key, dur, peak=-8.0, vol=0.7, loop=False):
    """
    注册一条音效。
      dur  : spec 规定时长（秒），最终文件严格对齐
      peak : 目标峰值 dBFS —— 用于协调各类音效的相对音量
             （UI ~-13 / 环境床 ~-20 / 物件 ~-7 / 爆炸 ~-1.5）
      vol  : manifest 里给游戏代码的建议播放音量
      loop : 是否需要无缝循环
    """
    def deco(fn):
        if key in SFX:
            raise KeyError('duplicated sfx key: %s' % key)
        SFX[key] = dict(key=key, dur=float(dur), peak=peak, vol=vol,
                        loop=loop, fn=fn)
        return fn
    return deco


def bgm(key, dur, bpm_spec, bpm_real, vol=0.42, loop=True, key_sig=''):
    def deco(fn):
        if key in BGM:
            raise KeyError('duplicated bgm key: %s' % key)
        BGM[key] = dict(key=key, dur=float(dur), bpm_spec=bpm_spec,
                        bpm=bpm_real, vol=vol, loop=loop, fn=fn,
                        key_sig=key_sig)
        return fn
    return deco
