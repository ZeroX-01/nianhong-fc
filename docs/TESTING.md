> **与代码同步于：2026-09-19，save VER=3**
> 基准：仓库根目录。主 PRD 见 [`PRD.md`](PRD.md)，用例明细见 [`prd_src/04_test_cases.md`](prd_src/04_test_cases.md)。

# 《那年的红白机》测试手册

这份文档写给「改完代码不知道该跑什么」的人。它只记已经躺在 `tools/gametest/` 里、真的能跑出结果的东西；每个脚本的覆盖点都是照着脚本开头的注释和它实际的断言抄下来的，不写「测试功能」这种话。

全部结果都是 2026-09-19 这一轮实测，跑法与端口见 §2。

---

## 1. 测试哲学与分层

一条总原则：**只用玩家能用的操作**。按真键盘、点真鼠标、模拟真触屏，不去直接调场景里的私有方法。原因很直接——这个项目历史上绝大多数事故都是「逻辑其实是对的，但玩家点不动 / 看不见 / 按了没反应」，而这类问题只有真操作才能抓到。少数纯数值规则（砍价公式、修卡衰减、存档迁移）例外，它们在 `page.evaluate()` 里直接调 API，因为那些规则没有界面可点。

分五层，从外到内：

| 层 | 干什么 | 代表脚本 |
| :--- | :--- | :--- |
| **端到端流程** | 从标题一路走到通关，跨场景、跨天数，抓「链路断了」 | `flow_test`、`flow2_test`、`flow3_test`、`smoke_outer` |
| **场景 / 专题级** | 盯住一屏或一个机制，断言密度最高，是主力 | `prologue_test`、`keys_ui_test`、`gamekeys_test`、`move_input_test`、`rescue_test`、`staff_test`、`bugfix_title_room_test`、`repair_anim_test`、`settings_test` |
| **规则单测** | 不看画面，只跑公式与存档 | `systems_test`、`story_core_test`、`tank_unit`、`check_mario_map` |
| **截图回归** | 出图给人眼看，不做断言 | `prologue_shots`、`keys_ui_shots`、`gamekeys_shots`、`story_shots`、`shot_scene` |
| **部署后冒烟** | 打完包、上线之后验「打开链接能不能玩」 | `deployed_smoke` |

两条附带的底线，几乎每个脚本都在收：

- **零 JS 报错**。所有脚本都挂 `pageerror` + `console.error`，最后一条断言就是「整段没有报错」。这一条比任何功能断言都先失败。
- **不许出现死屏**。「屏幕上一个能点的都没有」是这个项目最严重的故障等级，`bugfix_title_room_test` 专门为它写了一个看门狗用例。

---

## 2. 环境准备

### 2.1 依赖

```bash
node -v                 # 实测 v22.23.2
node -e "require('playwright')"   # 不报错即可
```

Playwright 装的是 chromium 无头模式。视口固定 `960×540`，是逻辑分辨率 `480×270` 的整数两倍——**所以脚本里所有鼠标坐标都是逻辑坐标 ×2**。

### 2.2 起服务器

必须走 http，`file://` 下浏览器会拦音频和部分资源。服务器根目录是 ``：

```bash
cd nianhong-fc
python3 -m http.server 8131 &
node tools/gametest/prologue_test.js 8131
```

首屏那句「点击开机」是浏览器的音频解锁要求，脚本都会先 `page.mouse.click()` 点一下画面再往下走。

### 2.3 端口约定（**先读这一节，否则你会测到别人的站点**）

绝大多数脚本的端口是**写死在源码里的**，命令行传参根本不生效。这不是笔误，是历史遗留，但踩上去的后果很难看（见 §6.1）。照下表挑端口：

| 端口传参方式 | 脚本 |
| :--- | :--- |
| `argv[2]` 或 `PORT=`，**也可以直接传线上 URL** | `prologue_test`、`prologue_shots`、`bugfix_title_room_test`、`move_input_test` |
| `argv[2]` 或 `PORT=`，只认端口（不支持 URL） | `gamekeys_test`、`gamekeys_shots`、`repair_anim_test`（默认 **8110**） |
| 只认 `PORT=` 环境变量，`argv[2]` 是别的用途 | `story_core_test`、`story_shots`（`argv[2]` 是文件名 TAG） |
| **端口写死 8100，传参无效** | `systems_test`、`flow_test`、`flow2_test`、`flow3_test`、`settings_test`、`keys_ui_test`、`keys_ui_shots`、`play_integration`、`smoke_outer`、`shot_scene`、`dbg_play`、`dbg_replay` |
| **端口写死 8102** | `tank_test`、`tank_unit` |
| **端口写死 8103** | `feature_mario`、`play_mario` |
| **端口写死 8104** | `fight_test` |
| 只接线上 URL（必填） | `deployed_smoke` |
| 不需要服务器 | `check_mario_map`（纯 node 解析 `MarioGame.js` 的字符图） |

实用做法：**同时起 8100、8102、8103、8104 四个口**（都指向 ``），这样写死端口的那批脚本能直接跑；需要挑端口的用 8130 以上，避开别人的服务。

```bash
cd nianhong-fc
for p in 8100 8102 8103 8104 8131; do python3 -m http.server $p & done
```

开跑之前先确认端口是你自己的：

```bash
curl -s http://localhost:8100/index.html | diff -q - index.html && echo "是本仓库"
```

---

## 3. 脚本清单总表

「最近结果」列全部是 2026-09-19 实测值。断言数是脚本自己打印的 `过 / 挂` 统计。

### 3.1 端到端流程

| 脚本 | 验证什么 | 怎么跑 | 最近结果 |
| :--- | :--- | :--- | :--- |
| `flow_test.js` | 纯鼠标 + 键盘走通主线：客厅 → 鞋盒 → 选卡插进主机 → 开电视（脏卡必花屏）→ 读故障提示 → 去修卡台对症处理 → 插回去 → 坐下来玩。**按当次随机抽到的故障选手法**（雪花插到底 / 花屏哈气 / 滚屏划桌 / 抖动拍电视），所以每次路径都不同 | 服务器 **8100**；`node tools/gametest/flow_test.js` | ✓ 全流程通（本轮修卡 1 轮、进入游戏、卡带 02） |
| `flow2_test.js` | 集市一口价买卡（卡到手 + 钱扣掉）、发小家借卡（记进存档、七天后要还、躺在鞋盒里）、妈妈进门被抓（预警 → 现行 level 2 → 罚写作业顶满 → 电视被关 → 状态归位）、**抢救那三下**（预警按 START 进抢救 → 三下都对准判定区 → 电视关 / 卡拔 / 塞沙发缝 / `rescueClean` → 清算 level 0、信任 +）、第 48 天结局与回忆册落盘 | 服务器 **8100**；`node tools/gametest/flow2_test.js` | **31 过 / 0 挂** |
| `flow3_test.js` | flow2 没覆盖的四件事：杂货摊（棉签进包、AV 线进 `owned`、一次性货不重复卖）、砍价砍到成交、发小家双打（`twoP` 一路传进小游戏内部）、写作业照真笔顺输入（4 个字 → 进度 48，每字 +12）、手机端触屏（Play 里 10 个热区、Homework 方向键命中范围 136×136、触屏真能写字） | 服务器 **8100**；`node tools/gametest/flow3_test.js` | **19 过 / 0 挂** |
| `smoke_outer.js` | 键盘走一圈外层所有屏：标题 → 客厅 → 鞋盒 → 插卡 → 开电视 → 修卡 → 集市 → 发小家 → 写作业 → 设置 → 回忆册，一路收 console error，每屏截一张图 | 服务器 **8100**；`node tools/gametest/smoke_outer.js` | 不打断言分数，看错误列表与图 |
| `play_integration.js` | 把 8 张代表卡在「电视里」真开一遍（contra / tank / mario / fight / multi / garble / null_cart / crash），只关心三件事：小游戏实例建起来没、画面里有没有东西、有没有报错 | 服务器 **8100**；`node tools/gametest/play_integration.js` | 8 张全部 `inst=true`，**0 错误** |

### 3.2 场景 / 专题级

| 脚本 | 验证什么 | 怎么跑 | 最近结果 |
| :--- | :--- | :--- | :--- |
| `prologue_test.js` | 序章（2026 那个晚上）全部六组：12 镜结构与年份口径、正着走到 2004、**手动翻页节奏**、跳过与两镜不可跳、老档迁移、回忆册重看、门禁只在标题。详见 §4 | `node tools/gametest/prologue_test.js 8131`（也能直接打线上 URL） | **63 过 / 0 败** |
| `story_core_test.js` | 这一版新主线的规则层：借来的机器（`lent` / `dueDay` = 暑假最后一天 / 剩余天数递减）、集市那台二手主机（45 上下浮动、同一天同价、换天变价、钱不够抱不走、买下扣钱 + 心情 +25 + 记进回忆册、一台只买一次）、零花钱账本（总计 / 今日 / 按来源分类 / 跨天清零规则 / 砍价省下的钱也记）、**挣钱引导**（首次进客厅 / 心愿单无流水 / 集市余额不足三处都讲明每天五毛与日常机会）、心情（0–100 上下不越界、五档词、不是资源、连着不玩会闷、和解只发生一次）、被抓原因分 `tv` / `cart` 两种并当场说明、作业本能降一档惩罚但救不了「电视还开着」、老档迁移八条、结局四变体互不相同 + 收尾文案分两版、五章按天推进 | 服务器 **8100**；`PORT=8100 node tools/gametest/story_core_test.js`（`argv` 无效） | **84 过 / 0 挂** |
| `keys_ui_test.js` | 三件「第一次上手会不会懵」的事：① 屏幕上写 A / B，键盘 A / B 就得真管用（老键位 X / Z 照旧、空格 = A、回车 = START、2P 的 G / H 随时认、双打时 1P 提示自动改口写 X）；② 七个非全屏场景右上角都有看得见点得到的返回按钮（位置 + 不和文字叠 + 点了真的回客厅），客厅那颗是「菜单」而不是「返回」，小游戏那屏的「离开」只开暂停菜单绝不一点就关电视；③ 卡带详情 / 回忆册右板正文再长也不压数值条、不越出面板边框（12 张卡 + 所有回忆条目挨个量）；另加八屏缺字检查与提示条不被行宽截断 | 服务器 **8100**；`node tools/gametest/keys_ui_test.js` | **73 过 / 0 挂** |
| `gamekeys_test.js` | 电视画面里的按键指引卡：① 时机（开机演出 / 卡带标题 / 关卡卡片 / READY 阶段一张都不许弹，四个真游戏各自「真能动了」那一刻才弹）；② 内容和 `src/games/*.js` 里真正读输入的那几行对得上，键名现算（切触屏就改口写 A / B / 十字键）；③ 3.5 秒自走、任意键立刻收；④ 收掉后那条常驻键位条不压 HUD / 血条 / Boss 血槽 / 杂志秘技行（`getBounds()` 挨个比 + 源码坐标兜底）；⑤ 暂停菜单能把卡再叫出来；⑥ 双打写两套键位、马里蘑老实说「轮流」；⑦ 死标题卡带不弹卡只留一句怎么退出；⑧ 按过 RESET 之后的行为 | 服务器 **8100**；`node tools/gametest/gamekeys_test.js [端口]` | **121 过 / 0 挂** |
| `move_input_test.js` | 「点上下左右坦克为什么不走」的三条真实原因：① 小游戏里 W / A / S / D 也是 1P 方向键（`CODE_1P_MOVE`，断言的是坦克坐标真的变了）；② 关卡开场那一秒半只认 A / B，画面上明写「按 X 开始」且照着按真能跳过；③ 触屏十字键从 34×38 放大成整块 136×136 按方位判方向，边缘也算数、相邻方向不误触，A / B 改圆形命中不再咬边。附带守住「菜单和别的场景里键盘 A 仍是确认」 | 服务器 **8100**；`node tools/gametest/move_input_test.js [端口或线上 URL]` | **45 过 / 0 挂** |
| `rescue_test.js` | 「听见动静之后那几秒」整段：第三级预警（钥匙插锁）自动进抢救、一二级按 START 手动进、抢救期间妈妈的秒表照跑（小游戏停着）、三下都按正中 → 电视关 / 卡拔 / 塞沙发缝 / 回客厅 / `rescueClean` / 信任涨、`miss` 罚 ~1100ms 且当前这步重来、`ok` 罚 ~450ms 且这步过、滑过一次只能算 `rescueClose`、压力越大命中区越宽光标越快、没收完被堵门记 `rescueFail`、本来没电视没卡不白送干净收场 | 服务器 **8100**；`node tools/gametest/rescue_test.js` | **37 过 / 0 挂** |
| `bugfix_title_room_test.js` | 两个死屏 / 误触 bug 的回归：**标题页**——主菜单自动端上来、走到「重新过一次暑假」弹确认、选「不了」主菜单必须回来且光标停在原处、提示条跟着切回、回来的菜单还是活的、鼠标路径同样走一遍、选「重新开始」真能开新档、以及强行关掉主菜单后半秒内必须自己回来的看门狗；**客厅**——13 个点击框两两不重叠且至少留 2px 缝、每个框中心 hover 命中的是它自己、小方桌与门各自开各自的菜单、TAB 走完一圈 13 个目标时底部提示 / 选中框 / 物件名三处说的是同一个东西 | `node tools/gametest/bugfix_title_room_test.js 8131`（支持 URL） | **37 过 / 0 挂** |
| `staff_test.js` | 标题屏那页藏起来的制作名单：秘技 ↑↑↓↓←→←→ 输到一半不许出现、输错一下从头数（且认「错的这一下正好是新序列第一下」）、八下输对名单出来且五行字都在（署名在里面）、名单开着时主菜单必须是 close 状态（否则底下的菜单偷键）、按任意键收回且主菜单原位回来、连开关三次都稳、整段零报错。脚本自己起服务器，还会先核对 `document.title` —— 端口被别的项目占着时起服务器是静默失败的 | `node tools/gametest/staff_test.js`（默认 8141，可传端口或 URL） | **15 过 / 0 挂** |
| `repair_anim_test.js` | 修卡台两个动作特写：哈气两口气（`push1 → hold → push2 → finish` 四拍都在、中间有「停一下看看干净没」的停顿、总时长 2 秒量级）、蓄力帧号随 `blowPower` 单调上去、划桌三拍（`prep → stroke1 → lift → stroke2 → finish`）、动画能跳过且**跳过之后数值照常结算**、连着来三次自动变短（2090 → 1499 → 796ms）、取景框 `[168,58–312,192]` 不压脏污条 / 磨损条 / 按钮列 / 右上返回 / 底部提示条、数值规则一行没变（哈太弱无效、太猛 +7 脏、同次修卡递减 -20 → -16、划 3 下 -27 磨损 0、划 5 下 -20 磨损 +10） | 服务器 **8110**（或传端口）；`node tools/gametest/repair_anim_test.js 8131` | **30 过 / 0 挂**（必须单独跑，见 §6.2） |
| `settings_test.js` | 机器背面那排旋钮：音量能调低且**立刻作用到正在放的 BGM**（0.225 → 0.045）、能拧到 0 不变负数、显像管档位左右到底都停住、扫描线开关、麦克风权限失败老实退回「长按代替」而不是白屏、B 能回标题、设置真的写进 localStorage | 服务器 **8100**；`node tools/gametest/settings_test.js` | **16 过 / 0 挂** |

### 3.3 规则单测

| 脚本 | 验证什么 | 怎么跑 | 最近结果 |
| :--- | :--- | :--- | :--- |
| `systems_test.js` | 看不见的规则：新档（2004-07-15 第 1 天、￥3.5、自带坦克 + 100万合1）、缺字段老档能补齐、坏 JSON 不卡死直接开新档、精力与时段推进、睡觉进第二天并合上作业本、随机事件真会触发、暑假 48 天、集市每天有货与浮动价、砍价拒绝 / 接受两条、钱不够买不了、假卡概率、脏卡花屏概率 0.53 对干净卡 0.06、修卡三条数值规则、对症才管用（雪花插拔 / 抖动拍电视）、妈妈 armed / level 2 / 藏干净 level 0、摊开本子不等于写作业、手柄没收会到期归还、借来的卡到期还掉且不留在主机里、回忆册不重复记、音频清单（sfx 58 / bgm 11）与贴图无缺、12 张卡带在册、四个真游戏都注册 | 服务器 **8100**；`node tools/gametest/systems_test.js` | **44 过 / 0 挂** |
| `tank_unit.js` | 坦克机制直接操纵对象验证：四种道具（星 / 命 / 冻结 / 铲子）、老鹰被击中立刻结束、护盾挡子弹与无盾掉命复活、4 张关卡布局各不相同（工厂 / 河道 / 冰原 / 要塞，砖钢草水冰数量都不同）、最后一关触发 `clearGame` | 服务器 **8102**；`node tools/gametest/tank_unit.js` | 5 项全过，`TankGame` 运行时错误 0 |
| `tank_test.js` | 坦克真机试玩：`solo` 打 30 秒 + 秘技过关 + 换 skin、`twoP` 双打、`multi` 从《100 万合 1》目录进坦克。脚本里对 `test-game.html` 缺 `window.SB` 等三处**已知环境差异**做运行时打补丁并单独归类为 `foreign` | 服务器 **8102**；`node tools/gametest/tank_test.js solo\|twoP\|multi` | 出图 + 错误分类清单 |
| `fight_test.js` | 拳霸打一场 30–60 秒至少打完一回合，收集 console error 与 `window.__errors` 必须为空，关键时刻自动截图（开场 / 命中 / 防御 / 必杀 / KO / 回合结束），并打印内部状态验证血条真在掉、AI 真在动 | 服务器 **8104**；`node tools/gametest/fight_test.js [twoP]` | 出图 + 日志 |
| `feature_mario.js` | 马里蘑逐项验收，不靠 AI 碰运气而是把角色摆到指定位置：顶砖出蘑菇 → 吃了变大 → 踩龟成壳 → 踢壳连撞 → 钻管进金币房 → 抓旗杆过关 → 第二关 `stage=2` → 通关 `clearGame`，每项截图 + 断言 | 服务器 **8103**；`node tools/gametest/feature_mario.js` | 15 张 `feat_*.png` + 断言清单 |
| `play_mario.js` | 马里蘑自动试玩（会看路：前方有坑 / 墙 / 敌人自动起跳），收 error 并在关键时刻截图。支持 `--mag`（杂志秘技 + 无限跳）、`--warp`（专门去钻管 / 到旗杆）、`--game=` / `--cart=` / `--sec=` | 服务器 **8103**；`node tools/gametest/play_mario.js [选项]` | 出图 + 错误列表 |
| `check_mario_map.js` | 关卡字符图静态校验：每段必须 17 行、行长不超过段宽，并把拼好的整张图导出成文本供肉眼确认地形 | **不用服务器**；`node tools/gametest/check_mario_map.js` | 校验结果 + `map_dump.txt` |

### 3.4 截图回归（不做断言，出图给人眼看）

| 脚本 | 出什么图 | 怎么跑 |
| :--- | :--- | :--- |
| `prologue_shots.js` | 序章 12 镜逐镜存档图（s05 额外拍「等车中」和「车来了」两张），落 `tools/gametest/prologue/shots/` | `node tools/gametest/prologue_shots.js 8131` |
| `keys_ui_shots.js` | 卡带详情面板（普通卡 / 描述最长的卡）、Room、Play，文件名带 `before_` / `after_` 前缀便于改版对比 | 服务器 **8100**；`node tools/gametest/keys_ui_shots.js before\|after` |
| `gamekeys_shots.js` | 每张卡两张：按键卡完全亮起来的样子、卡收掉后常驻条的样子。会等淡入补间真的走完（alpha 到 1）才按快门 | `node tools/gametest/gamekeys_shots.js [端口]` |
| `story_shots.js` | 这一版剧情线四张定妆照：挂历章节 + 还机倒计时、心愿单 / 账本、集市那台二手主机 | `PORT=8100 node tools/gametest/story_shots.js v1` |
| `shot_scene.js` | 单屏检查器：把某一屏调出来、清掉对话框、截一张干净图，并列出这一屏实际存在的贴图 key（抓「图画了但被遮住 / 根本没画」） | 服务器 **8100**；`node tools/gametest/shot_scene.js Room [后缀]` |

### 3.5 部署后冒烟与排障

| 脚本 | 验证什么 | 怎么跑 | 最近结果 |
| :--- | :--- | :--- | :--- |
| `deployed_smoke.js` | 线上「打开链接能不能玩」：`SB` 起来没、进到标题 / 客厅、音频加载数（部署包为压文件数**只带 mp3**，重点看有没有全丢）、贴图数、能不能真的进游戏、有无 4xx/5xx、有无 JS 报错 | `node tools/gametest/deployed_smoke.js https://…` | **7 过 / 0 挂**（音频 69、贴图 129、404 零条、JS 错误零条） |
| `dbg_play.js` | 定点排查「客厅菜单选『坐下来玩』进不去 Play」：给 `enterGame` / `UI.go` / `Play.create` 打点看各自有没有被调到 | 服务器 **8100** | 排障用，无分数 |
| `dbg_replay.js` | 抓「同一屏第二次进去就黑屏」：连开两次坦克，把开机链路每一步打点 | 服务器 **8100** | 排障用，无分数 |

### 3.6 发布前扫描（纯 Python，不用浏览器）

| 脚本 | 验证什么 | 怎么跑 | 最近结果 |
| :--- | :--- | :--- | :--- |
| `tools/check_font.py` | 字库体检：`src/**/*.js` 里所有字符串字面量的非 ASCII 字符，是不是都在 `pix12.xml` / `pix16.xml` 里有字形。**位图字体缺字是静默失败**——画面上只是少一个字，控制台不报错，Playwright 也抓不到。缺字就跑 `python3 tools/gen_font.py`（字符集会跟着源码重新长一遍） | `python3 tools/check_font.py` | 通过（字库 3972 字 = GB2312 一级 3755 + 源码补 14） |
| `tools/check_words.py` | 文字规避：上屏文案里不许有真实商标、真实作品名、厂商名和内部信息（比对一律转小写，有个全大写的品牌词曾经从词表底下溜过去过一次）。命中字符串字面量 = 失败；命中注释 = 提醒。必须留原文的地方（读老存档键）在那一行写 `check-words: allow` 豁免 | `python3 tools/check_words.py` | 通过 |

---

## 4. 序章专项：63 条断言怎么分组

`prologue_test.js` 是目前断言最密的一份，因为序章是新玩家进游戏看到的第一样东西，出问题的代价最大：卡在某一镜、跳不掉、跳完不知道自己为什么在 2004 年、老玩家一开机被硬塞四分钟加班夜——每一条在玩家眼里都是「这游戏坏了」。

脚本按玩家会走的六条路各走一遍，共 **63 条**：

### 4.1 结构（16 条）

纯读数据，不动画面。12 镜的 `id / kind / art` 齐全、每镜画法都在 `SB.PROLOGUE_PAINT` 里、每镜都有文案、菜单选项与「车来了」的文案都对得上；`skippable === false` 的**恰好是 `s10,s11` 两镜**；`dream` 标记**恰好从 `s11` 起**；`last` **恰好是 `s12`**；现实层写 `2026`、梦里写 `2004`、有具体时间 `23:47`；跳过摘要恰好三行且把 2026 和 2004 都说清；回忆册第一页文案在；等车 18 秒且**只有 s05 有 gate**；最后一条兜底：**整段序章文案里不许再串进 `1994`** 这种旧年份。

### 4.2 正着看（22 条）

从标题开新档，一镜一镜按到底。细分四小块：

- **入口（7 条）**：新档标题第一项是「开始这个暑假」；按下去进的是 `Prologue` 而不是 `Room`；从 `s01` 开始；顶上一直挂着 2026；右上写着 `23:47　公司　18 层`；右上角有「跳过」；底部提示写了怎么跳。
- **节奏（5 条，本轮新增）**：读完一行**停住 6 秒不点，镜号和旁白内容都不变**（证明不自动翻页）；`waitTap` 标记为 true；右下角 `▼` 可见；此时提示条写的是「继续」。这一组是「读完再点」这次改动的护栏。
- **等车（3 条）**：车没到时菜单里**没有**「车来了」；把 18 秒拨到头后菜单里**多出**「车来了」；能点它上车。
- **走到底与交棒（7 条）**：一路按能走到 `s12`；那时日期条已换成 2004；`awaitLast` 为真（**最后一镜不自动掉进客厅**）；提示写「继续」；**12 镜一个都没被跳过去**；再按一下进客厅；存档记「看过」且不记「跳着看的」。

### 4.3 跳过（8 条）

单独跳到 `s10` 眨眼镜：右上角**不给**跳过按钮、按 B 序章**不会**被跳掉、屏幕上给了话说清为什么（toast「这一段跳不过去，6 秒就好。」）、提示条也不写「跳过」。再从第一镜就按 B：先补三行摘要而**不是**直接黑到客厅、摘要读完进客厅、落盘记「看过 + 跳着看的」。

### 4.4 老档迁移（4 条）

造一个 `v: 2`、玩到第 20 天、￥12.5、有卡带、**并且根本没有 `flags` 字段**的档读进来：版本升到 3；天数 / 钱 / 卡带一样没丢；`flags.prologue` 一律记成 `true` 而 `prologueSkipped` 为 `false`（不许半路给老玩家插四分钟）；老玩家点「继续那个夏天」直接回客厅。

### 4.5 回忆册重看（10 条）

册子第一页是常驻的「那个晚上」（`replay === 'prologue'`）、标题对、选中时提示写「重看」；按 A 真的重看起来、`from === 'album'` 是重看模式、走完**回到册子而不是掉进客厅**、**重看不动存档**（重看时跳过也不会记成「跳着看的」）。另有三条鼠标路径：点第二行选中第二行、点回第一行选中第一行（守一条老账——循环里共用变量会导致点哪行都选中最后一行）、用鼠标点第一页也能重看。

### 4.6 门禁与收尾（3 条）

直接 `scene.start('Room')` 还是客厅、**不许被序章拦**（全部老用例都靠这条活着，所以门禁只放在 `TitleScene`，一旦挪进 `RoomScene.afterEnter()` 老用例会集体走进序章）；`__nostory` 能一键短路门禁；最后整个过程零 JS 报错。

---

## 5. 回归矩阵：改了什么该跑什么

左边是你动过的东西，右边**从上到下按顺序跑**。带 ★ 的是这一格里最不该省的。

| 改动范围 | 该跑 |
| :--- | :--- |
| `src/core/save.js`、任何存档字段或 `migrate()` | ★`systems_test`、★`story_core_test`（老档八条）、★`prologue_test`（§4.4 老档一组）、`flow2_test`（结局落盘）、`settings_test`（设置落盘） |
| 序章：`PrologueScene.js`、`src/anim/prologueArt.js`、`SB.STORY.prologue`、`SB.L.story.prologue` | ★`prologue_test`、`prologue_shots`（出图看画面）、`bugfix_title_room_test`（标题门禁那一段）、`keys_ui_test`（缺字检查） |
| `src/core/input.js` | ★`move_input_test`、★`keys_ui_test`、`gamekeys_test`（键名现算）、`flow3_test`（触屏那一段） |
| `src/core/keyguide.js` 或任何小游戏的操作方式 | ★`gamekeys_test`、`gamekeys_shots`。**改了玩法就必须回来改键位表**，表是照着 `src/games/*.js` 抄的 |
| `src/systems/repair.js`、`RepairScene.js`、`src/anim/repairAnim.js` | ★`repair_anim_test`（单独跑）、★`systems_test`（数值三条）、`flow_test`（对症流程） |
| `src/games/*.js` | ★`play_integration`（先确认 12 张都还能进）、再跑对应单测：坦克 `tank_unit` + `tank_test`、马里蘑 `check_mario_map` + `feature_mario` + `play_mario`、拳霸 `fight_test`；最后 `gamekeys_test` |
| `RoomScene.js`、`src/core/ui.js`、`TitleScene.js` | ★`bugfix_title_room_test`（点击框 + 死屏看门狗）、★`staff_test`（藏起来的名单）、★`keys_ui_test`、`flow_test`、`flow2_test` |
| `MarketScene.js`、`src/systems/economy.js` | ★`systems_test`、★`story_core_test`（二手主机 + 账本）、`flow2_test`、`flow3_test` |
| `src/systems/story.js`、结局、账本、章节 | ★`story_core_test`、`flow2_test`（第 48 天结局） |
| `src/systems/parent.js` | ★`systems_test`、★`story_core_test`（被抓原因 + 作业本降档）、★`rescue_test`（罚时是直接推 `Parent.t`，改了秒表就会连带变）、`flow2_test`（被抓 / 抢救两条路） |
| `src/systems/rescue.js`、`PlayScene` 的抢救层、判定手感数字 | ★`rescue_test`、★`flow2_test`（抢救那一段）、`keys_ui_test`（`SB.L.rescue` 的缺字）、`gamekeys_test`（抢救开始会清掉键位卡） |
| `SettingsScene.js`、`src/core/audio.js`、`crt.js` | ★`settings_test`、`systems_test`（音频清单） |
| 只改文案 `lines.js` / `storyLines.js` | ★`python3 tools/check_font.py`（缺字检查——新字没进字库就是一个空洞）、★`python3 tools/check_words.py`（商标词 / 真实作品名 / 内部信息）、`keys_ui_test`、`prologue_test`（§4.1 年份口径）、`story_core_test` |
| 改了上屏的名字（卡带名、品牌、杂志名） | ★`python3 tools/check_words.py`、★`python3 tools/check_font.py`、`gamekeys_test`（卡带名写在用例表里）、`systems_test`（卡带在册） |
| 资源生成脚本 `tools/gen_*.py` | ★`systems_test`（贴图 / 音频清单无缺）、`shot_scene`（出图看） |
| 打包 / 上线 | `bash tools/build_dist.sh` → 部署 → ★`deployed_smoke <线上地址>` |

**上线前全量**（顺序跑，别并行，约十几分钟）：

```bash
cd nianhong-fc
for p in 8100 8102 8103 8104; do python3 -m http.server $p & done
node --check src/core/*.js src/data/*.js src/systems/*.js src/scenes/*.js src/games/*.js src/anim/*.js src/main.js
python3 tools/check_font.py
python3 tools/check_words.py
node tools/gametest/systems_test.js
PORT=8100 node tools/gametest/story_core_test.js
node tools/gametest/prologue_test.js 8100
node tools/gametest/keys_ui_test.js
node tools/gametest/gamekeys_test.js
node tools/gametest/move_input_test.js
node tools/gametest/rescue_test.js
node tools/gametest/bugfix_title_room_test.js 8100
node tools/gametest/repair_anim_test.js 8100
node tools/gametest/settings_test.js
node tools/gametest/flow_test.js
node tools/gametest/flow2_test.js
node tools/gametest/flow3_test.js
node tools/gametest/play_integration.js
```

---

## 6. 已知坑

### 6.1 端口被别的项目占用，你会测到别的站点（最常踩）

大多数脚本端口写死（§2.3），传参根本不生效。历史事故：在 **8101** 上跑，那个口上其实是另一个应用，于是断言全挂，查了半天代码——**代码一行问题都没有**。

三条自保规则：

1. 起服务器前先看端口：`ss -ltnp | grep 81`。
2. 跑之前对一下服务器身份：`curl -s http://localhost:8100/index.html | diff -q - index.html`。
3. 断言大面积失败、且失败得「不合逻辑」（比如连「12 张卡带都在册」都挂）时，**先怀疑端口，再怀疑代码**。

顺带一提：写死 8100 的脚本在一个「恰好也起在 8100、恰好也是本项目」的服务器上会正常通过——这次核对时就遇到了这种情况，所以第 2 条不能省。

### 6.2 `repair_anim_test` 时间敏感，必须单独跑

哈气力度 `blowPower` 是按**真实按住时长**算的，脚本按住 760ms 期望落在「合适」区间。和别的 Playwright 套件并行时机器被拖慢，同样的 760ms 会冲过 0.92 的阈值变成「哈过头」，于是脏污从 70 **涨到 77**，`跳过之后照样结算：脏污 70 → 77` 当场失败。

这次实测复现过一次：并行跑 **29 过 / 1 挂**，单独跑 **30 过 / 0 挂**。所以它不进并行批次；看到这一条失败时先单独重跑一次再下结论。

### 6.3 截图脚本要先把打字机停掉

序章的旁白是逐字打的，等渐显跑完再按快门，拍到的可能是半行字甚至下一镜的画面。`prologue_shots.js` 的做法是 `playBeat(i)` → 等 1.4 秒 → **调 `clearLineTimers()` 把打字机停掉** → 再等 2.4 秒 → 按快门，并在最后核对「拍到的 `beat.id + artName` 是不是我想要的那一镜」，不是就打一行 `! 拍到的其实是 …`。自己写截图脚本照这个套路来。

### 6.4 调试标记：用它们短路剧情门禁

这些都是**存档字段**，所以必须在 `Save.reset()` / `Save.def()` **之后**再设，否则会被冲掉：

| 标记 | 作用 | 出处 |
| :--- | :--- | :--- |
| `__nostory` | 一键短路序章门禁，标题直接进客厅（不落盘） | `TitleScene.js`：`needPro = !s.flags.prologue && !s.__nostory` |
| `__nomom` | 妈妈完全不回来，专心测别的 | `RoomScene.js`、`PlayScene.js` |
| `seenIntro` | 跳过客厅那七句开场 | `SB.L.intro` 的播放条件 |
| `__momHome` | 直接指定妈妈此刻在不在家 | `timeSystem.js` |

`test-game.html` 那一路小游戏脚本走的是另一套：URL 上带 `?game=tank&cart=02&nomom=1` 直接进单个小游戏，不初始化完整的 `window.SB`（所以 `tank_test.js` 里有那三处运行时补丁）。

### 6.5 「测试挂了」有可能是真 bug，只在快机器上现形（2026-09-19 实例）

改抢救那一版时回归 `move_input_test`，四个方向里三个挂：坦克 `x 32 → 32`，试了三次一动不动，但 `dir` 在变——**转头了，不往前走**。先用 `git show HEAD:...` 把 `PlayScene.js` 换回改动前的版本再跑，一样挂（8 项），这才排除「是我刚写的抢救层弄坏的」。

真凶在 `TankGame.moveTank`：玩家坦克 `speed = 58 px/s`，逐像素推进靠 `t.acc` 攒够 1 个像素才走一步。60fps 下每帧只攒 `58 × 0.0167 ≈ 0.97` —— 永远差一点点；而攒不够时函数和「撞墙」一样返回 `0`，外层 `if (moved === 0) t.acc = 0;` 每帧把它清干净。**帧率越高越走不动**，运气好某帧 `dt` 大一点才挪 1px。修法是把「攒不够」和「撞墙」分开：攒不够返回 `-1`（别清 `acc`），撞墙才返回 `0`。

三条教训：

1. **回归挂了先做 A/B**：把改动的文件换回 `HEAD` 版本再跑一遍，两分钟就能分清「我弄坏的」和「本来就坏的」。
2. 写这类 per-frame 累加器时，`0` 不要同时表示「没到时候」和「被挡住」——调用方一定会把两者当一件事处理。
3. 帧率相关的 bug 在慢机器 / 满负载的 CI 上会「自愈」（`dt` 一大就过了），所以**别用「上次跑过了」证明它没问题**。这条用例 2026-09-17 那轮就是 45 过 0 挂。

### 6.6 `gamekeys_test` 的 RESET 那一段是概率性的

按 RESET 本来就有 `failChance × 0.5` 的概率把画面按花（`PlayScene.hitReset`），花屏时不该有按键卡。脚本因此自带重试：最多重开 6 局，只要有一局按出了卡片就算过，并在结论里写「中途花屏 N 次」。机器忙的时候卡片动画播不完也会被当成花屏，所以等卡片的超时给到 12 秒。**看到这一段挂，先重跑一次再查代码。**

### 6.7 别的零碎

- **坐标 ×2**。逻辑 480×270，视口 960×540，鼠标坐标一律 ×2。`prologue_test` / `bugfix_title_room_test` 用的是更稳的写法：先读 canvas 的 `getBoundingClientRect()` 再按 `box.w / 480` 算 scale。
- **音频要先点一下**。所有脚本开头都有一次「点击开机」，少了它音频加载相关断言会挂。
- **同一帧 `stop` 又 `start` 同一个场景会出事**：旧的 `shutdown` 会把新建的东西一起清掉。要重进同一屏用 `scene.restart()`，别用 `stop` + `start`。
- **`flow_test` 每次路径都不一样**（随机故障），不要拿它的日志做逐行 diff，只看最后那句「✓ 全流程通」和修卡轮数。
- **存档键是 `nianhong_save_v1`**（改名前是 `subor_summer_save_v1`，`load()` 读不到新键时会搬一次老键），结构版本走 `v` 字段（当前 VER=3）。用例里往 localStorage 手写存档要用新键；用例之间要 `Save.wipe()` 或 `Save.reset()`，否则上一条用例的状态会漏过来。
- **无头环境永远拿不到麦克风权限**——这不是坑，`settings_test` 就是靠这一点验证「要不到权限要老实退回长按，而不是白屏」。
- **`dist/` 只带 mp3**，`ogg` 在打包时删掉、加载器里的候选也被改掉，所以只有 `deployed_smoke` 会盯音频数量；本地跑的脚本用的是完整资源。
- **`test-game.html` 不是完整游戏**，它没初始化完整的 `window.SB`，只供单个小游戏调试。

---

## 7. 怎么加一条新用例

### 7.1 先决定抄哪个脚本

| 你要测的东西 | 抄这个 | 为什么 |
| :--- | :--- | :--- |
| 一条数值规则 / 存档行为，没有界面 | `systems_test.js` 或 `story_core_test.js` | 整个测试跑在一次 `page.evaluate()` 里，`R.push()` 攒结果最后一起打印，不用管截图和异步等待，加一条就是加两行 |
| 玩家在某一屏的真实操作 | `bugfix_title_room_test.js` | 端口参数、`shot()`、`key()`、`clickGame()`、坐标换算全套都现成，而且它是少数支持直接打线上 URL 的 |
| 序章某一镜 | `prologue_test.js` | 有 `startPro()` / `goBeat(n)` / `pickMenu(名字)` / `drainInterlude()` 四个现成的辅助函数 |
| 一个小游戏的机制 | `tank_unit.js` | 直接操纵游戏对象，不用人手打 |

### 7.2 两种断言写法

**外层 node 版**（大多数脚本，能立刻看到 PASS/FAIL 并计数）：

```js
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); }
                       else { fail++; console.log('  FAIL ' + m); } };
// 收尾：退出码必须反映结果，CI 才拦得住
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' 过 / ' + fail + ' 败');
process.exit(fail ? 1 : 0);
```

**页面内版**（`systems_test` / `story_core_test`，规则类）：

```js
const out = await page.evaluate(() => {
  const R = [];
  const ok = (name, cond, extra) =>
    R.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  const fresh = () => { S.Save.reset(); S.Save.d.__nomom = true; S.Save.d.seenIntro = true; return S.Save.d; };
  // …断言…
  return R;
});
```

**断言文案照现有风格写**：说人话、把实测值带上（`'哈气力度合适能擦掉灰  dirt=' + c.dirt`）。失败时那行字本身就该告诉你哪儿坏了，不要写「断言 3 失败」。

### 7.3 现成的调试钩子

| 钩子 | 给你什么 |
| :--- | :--- |
| `SB.__menu` | 当前菜单实例；`SB.__menu.isOpen()` |
| `menu.debug()` | `{ cur, labels, dis }`——光标位置、所有选项文字、哪几项是灰的。**按名字找选项，别猜行号** |
| `SB.__dialogOpen` | 对话框开着的计数（>0 就是开着） |
| `SB.__interludeOpen` | 过场三行摘要开着的计数 |
| `scene.hint.full()` | 底部提示条的完整文字，用来断言「提示写的是『继续』还是『一次打完』」 |
| `SB.UI.corner(...)` 返回值的 `.txt.visible` | 右上角那颗按钮到底可见不可见 |
| `SB.game.scene.getScenes(true).map(s => s.scene.key)` | 现在活着的场景，判断「跳转到底成没成」 |

### 7.4 起某一屏的模板

同一帧 `stop` + `start` 同一个场景会被旧 `shutdown` 清掉，所以统一写成「先停别人、已在这屏就 restart」：

```js
await page.evaluate(() => {
  const S = window.SB;
  S.Save.reset();
  S.Save.d.__nomom = true;      // 必须在 reset 之后
  S.Save.d.seenIntro = true;
  S.Save.save();
  const g = S.game, t = g.scene.getScene('Room');
  g.scene.getScenes(true).forEach(s => {
    if (s.scene.key !== 'Sys' && s.scene.key !== 'Room') s.scene.stop();
  });
  if (t && t.scene.isActive()) t.scene.restart({ from: 'title' });
  else g.scene.start('Room', { from: 'title' });
});
await sleep(2200);
```

### 7.5 加完之后

1. 单独跑通新脚本 / 新用例。
2. 按 §5 回归矩阵把同格的老脚本跑一遍，确认没顺手弄坏别人。
3. 把断言数写进本文档 §3 的表格里——**表里的数字是给下一个人当基线用的，别留旧值**。
