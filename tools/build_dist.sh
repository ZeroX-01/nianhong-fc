#!/usr/bin/env bash
# 打一个可部署的静态包到 dist/：只带真正要上线的东西。
# 为了压住部署平台的文件数上限，音频只保留 mp3（同时把加载器里的 ogg 候选去掉）。
set -euo pipefail
cd "$(dirname "$0")/.."

# 别在 dist/ 里 git init：打出来的包只是产物，版本历史留在主仓库里，
# 一旦 dist/ 自己成了仓库，部署就会换域名（v2 的包相反，它必须自带 dist/.git）。
rm -rf dist
mkdir -p dist
cp index.html README.md dist/
cp -r src vendor assets dist/

python3 - <<'PY'
import pathlib
p = pathlib.Path('dist/src/core/audio.js')
s = p.read_text()
old = "['assets/audio/' + item.file + '.ogg', 'assets/audio/' + item.file + '.mp3']"
new = "['assets/audio/' + item.file + '.mp3']"
assert old in s, '加载器里的音频候选格式变了，build 脚本要跟着改'
p.write_text(s.replace(old, new))
PY

find dist/assets/audio -name '*.ogg' -delete

echo "dist/ 打好了：$(find dist -type f | wc -l | tr -d ' ') 个文件，$(du -sh dist | cut -f1)"
