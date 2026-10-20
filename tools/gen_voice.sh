#!/usr/bin/env bash
# 生成《回家吃饭》样片的 TTS 占位语音。
#
# 这些不是真人录音，只是把语音通道跑通的占位：
#   mom_msg    妈妈的六秒语音（电话滤镜）
#   mom_door   门口「回来啦」（干声）
#   mom_dinner 上桌「吃饭了」（干声）
#   boss_call  老板电话（电话滤镜）
#
# 换真人录音时保持文件名不变，直接覆盖 assets/audio/voice/*.mp3，
# 代码（src/home/homeVoice.js）不用改。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets/audio/voice
mkdir -p "$OUT"

say -v Tingting -r 150 -o /tmp/hj_mom_msg.aiff "今天回来吃饭不？我炖了汤。"
say -v Tingting -r 155 -o /tmp/hj_mom_door.aiff "回来啦。"
say -v Tingting -r 155 -o /tmp/hj_mom_dinner.aiff "吃饭了。"
say -v "Eddy (中文（中国大陆）)" -r 165 -o /tmp/hj_boss_call.aiff "那个方案，客户又改了口径。你今晚能不能，再出一版？"

# 电话：300–3400Hz 带限 + 压缩，像听筒
ffmpeg -y -v error -i /tmp/hj_mom_msg.aiff \
  -af "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,volume=1.1" \
  -ac 1 -ar 44100 -b:a 64k "$OUT/mom_msg.mp3"
ffmpeg -y -v error -i /tmp/hj_boss_call.aiff \
  -af "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,volume=1.05" \
  -ac 1 -ar 44100 -b:a 64k "$OUT/boss_call.mp3"

# 面对面：干声，只做轻压缩
ffmpeg -y -v error -i /tmp/hj_mom_door.aiff \
  -af "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,volume=0.95" \
  -ac 1 -ar 44100 -b:a 64k "$OUT/mom_door.mp3"
ffmpeg -y -v error -i /tmp/hj_mom_dinner.aiff \
  -af "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,volume=0.95" \
  -ac 1 -ar 44100 -b:a 64k "$OUT/mom_dinner.mp3"

echo "voice placeholders -> $OUT"
