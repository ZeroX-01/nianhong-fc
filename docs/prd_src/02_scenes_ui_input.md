> **与代码同步于：2026-09-19，save VER=3**
> 基准：仓库根目录。主 PRD 见 [`../PRD.md`](../PRD.md)。

# 技术交付文档：表现层（场景、UI 与输入系统）

## 1. 运行时架构与启动链路
项目基于 Phaser 3.60，采用 ES5/IIFE 风格，全局状态挂载于 `window.SB`。

*   **启动链路**：
    1.  **`index.html`**：静态脚本顺序加载。顺序为：常量 (`const.js`) -> 数据 (`assets.js`, `cartridges.js`, `lines.js`, `story.js`, `storyLines.js`) -> 核心 (`save.js`, `audio.js`, `input.js`, `text.js`, `ui.js`, `crt.js`) -> 玩法系统 (`timeSystem/economy/repair/parent/story`) -> 小游戏 -> 按键指引 (`keyguide.js`) -> 动画层 (`anim/repairAnim.js`, `anim/prologueArt.js`) -> 场景 -> 入口 (`main.js`)。**`story.js` 与 `storyLines.js` 必须在 `save.js` 之前**：存档的 `def()` 会引用剧情常量。
    2.  **`main.js`**：全局 `fatal` 错误处理；`load` 事件后执行 `SB.Audio.fetchManifest()`。随后初始化 `Phaser.Game` 配置，注册 **13 个场景**（含 `Prologue`）。
    3.  **常驻系统层 (`SysScene`)**：游戏 Ready 后由 `main.js` 手动开启，负责全屏/静音控制及后台静音处理。
    4.  **引导流**：`BootScene` (预热与加载) -> `TitleScene` (标题主菜单) -> `PrologueScene`（没看过序章时）-> `RoomScene` (客厅主场景)。

*   **画布与缩放**：
    - 逻辑分辨率：`480 × 270` (16:9)。
    - 游戏渲染区：`360 × 270` (4:3)，左右两侧各 60px 为模拟电视木框。
    - 像素模式：开启 `pixelArt: true` 与 `roundPixels: true`，CSS 使用 `image-rendering: pixelated` 确保 2004 年那台 14 寸彩电的像素硬边质感。

## 2. 输入系统 (SB.Input)
将键盘、实体手柄、触屏虚拟手柄统一抽象为一套 8 键红白机手柄状态（`SB.Input.p1 / p2`）。

### 2.1 键位映射表（默认层）
| 动作 | 键盘 (1P) | 键盘 (2P) | 实体手柄 (Gamepad) | 触屏 (TouchPad) |
| :--- | :--- | :--- | :--- | :--- |
| **方向 (Up/Down/Left/Right)** | 方向键 | 无（见 §2.2） | 十字键 / 左摇杆 (axes 阈值 0.45) | 左下虚拟 D-Pad |
| **A (确认/跳跃/射击)** | X / K / Space / A | H | Button A 或 B | 右下 A 圆键 |
| **B (取消/连打)** | Z / J / B | G | Button X 或 Y | 右下偏左 B 圆键 |
| **START (开机/暂停/关电视)** | Enter / NumpadEnter | - | Button 9 (Start) | 右上长条 START |
| **SELECT (系统菜单/切换焦点)** | ShiftLeft / ShiftRight | - | Button 8 (Select) | 右上长条 SEL（按需显示） |

### 2.2 两层临时覆盖（最容易忘的部分）
| 开关 | 谁打开 | 覆盖内容 | 后果 |
| :--- | :--- | :--- | :--- |
| `setTwoP(true)` | `PlayScene`（发小家双打），退场关闭 | `CODE_2P`：`WASD` 归 2P 方向 | 键盘 `A` 变成 2P 的左；1P 的 A 请按 `X` |
| `setMove1P(true)` | `PlayScene` 单人开局打开，暂停菜单关闭、继续再开，退场必关 | `CODE_1P_MOVE`：`WASD` 也是 1P 方向 | 键盘 `A` 变成 1P 的左；开火/确认还剩 X / Z / J / K / Space |

优先级：`twoP` > `move1P` > 默认表。切换时 `reclaim()` 会清掉这几个键的按下状态与两个 pad 的键盘位，否则会有一个键卡在旧主人身上（角色一直往一个方向跑）。**为什么要这一层**：真有人一坐下就按 WASD 想开坦克，而 A 原本是开火，于是坦克原地放炮——玩家只会得出「这游戏坏了」的结论。菜单、客厅、修卡台这些屏上写着「确认 A」的地方，这一层一律关闭。

### 2.3 键位文案（一处也不写死）
- `SB.Input.src` 记录最近真正用过的输入方式：`key` / `touch` / `pad`，`LABEL`、`LABEL_2P`、`LABEL_WASD` 三张表照它取名字。
- `keyName(k, who, brief)`：`who=2` 给 2P 键名；`twoP || move1P` 时 1P 的 `a` 自动写成 `X`；`brief=false` 且开着 `move1P` 时，方向类键名会补成「方向键 或 WASD」。
- `tip(parts, who, brief)`：拼「动作 + 键名」，如 `tip([['a','确认'],['b','返回']])` → `确认 X/A　返回 Z/B`。
- `onLabels(fn)` 注册「键名变了」的回调（场景 shutdown 时退订），所以玩家中途插上手柄，屏幕上的提示会自己改口。

### 2.4 屏幕虚拟手柄 (SB.TouchPad)
- 触发条件 `wantTouch()`：触屏设备、或 `innerWidth < 720`、或设置里强制。
- 十字键画 104×104，**命中范围整块 136×136**，按手指相对轴心的方位算八向（某轴超过另一轴 0.41 倍即计入）；中心 5px 内不算方向。不抬手滑动即可改向。
- A / B 圆键命中半径 27（画出来是 24），斜排中心距 55.8——早先两个 64×64 方框在中间叠了 10px，按 A 的左边缘会按出 B。

### 2.5 Input.frame 与 UI 门控机制
*   **Input.frame**：一帧只真的重算一次（多个场景都会调 `update()`），避免 `just.*` 在别人读到之前被清掉。
*   **`hit` 插销**：按下与松开落在同一帧的「快按」，靠 `Pad.hit` 保证至少被读到一帧。
*   **因果与应用**：UI 组件（Dialog、Menu 等）构造时记录 `bornFrame = SB.Input.frame`，`poll()` 时若当前帧等于 `bornFrame` 则忽略所有输入。
    - **解决 Bug**：这解决了「按 A 键确认父级操作时，顺手触发了新开 UI 第一项」的经典输入穿透问题。

## 3. UI 组件 API 表
所有组件均挂载在 `SB.UI` 下，具备纹理缺失时的自动 Graphics 兜底。

| 组件名 | 方法签名与参数 | 回调与返回对象 | 注意事项 |
| :--- | :--- | :--- | :--- |
| **Panel (面板)** | `panel(scene, x, y, w, h, dark)` | 返回 Phaser.NineSlice 或 Graphics | UI 基础底板，`dark` 为深色模式 |
| **Button (按钮)** | `button(scene, x, y, w, label, onClick, opts)` | 返回包含 `bg, txt, zone` 的对象 | 支持九宫格拉伸与 `opts.sub` 副标题，内置 `ui_move/confirm` 音效 |
| **Corner (角标按钮)** | `corner(scene, label, onClick, opts)` | 返回可 `setVisible` 的按钮 | 右上角常驻小按钮（序章「跳过」、客厅「菜单」、小游戏「离开」都是它） |
| **Dialog (对话框)** | `dialog(scene, lines, opts)` | `onDone`: 播放完回调；返回 `next/close/isOpen` 控制器 | `lines` 支持数组，内置打字机效果，支持 `opts.speaker`，开框时自动收起 `Hint` |
| **Menu (菜单)** | `menu(scene, opts)` | `onPick(item, index)` / `onCancel`；返回 `close/refresh/isOpen/debug` | 支持 `disabled` 项、`width/y/rowH`；`SB.__menu` 挂载当前活跃菜单供测试调试 |
| **Toast (浮动提示)** | `toast(scene, text, ms)` | 返回 `destroy` | 自动淡出，常用于获取物品或简短状态提示 |
| **Hint (常驻提示)** | `hint(scene, text)` | 返回 `set/setTint/show/destroy` | 屏幕底部提示条，`text` 可传函数（键名变化时自己重算） |
| **HUD** | `hud(scene)` | 返回 `refresh` | 日期 / 时段 / AP / 钱的常驻条 |
| **Focus (焦点框)** | `focus(scene, opts)` | 返回 `at(x, y, w, h)` | 模拟选框，针对可交互 Spot 进行视觉定位 |
| **Fade / Go** | `fadeOut(scene, ms, cb)` / `fadeIn(scene, ms)` / `go(scene, key, data)` | - | `go()` 是场景切换的统一入口（带淡出） |
| **Interlude (过场)** | `interlude(scene, lines, onDone)` | 返回 `skip` | 黑底白字剧情转场，用于睡觉、结局、序章跳过摘要 |

## 4. 场景清单总表
| 场景 Key | 职责描述 | 入口 | 出口 |
| :--- | :--- | :--- | :--- |
| **Boot** | 资源预热、纹理兜底、音频解锁 | `main.js` 启动 | `Title` |
| **Title** | 标题画面、存档加载、序章门禁、进入回忆册/设置 | `Boot` / `Room` / `Album` | `Prologue` / `Room`, `Album`, `Settings` |
| **Prologue** | 2026 年那个晚上，12 镜序章 | `Title`（首次）/ `Album`（重看） | `Room`（交棒）/ `Album`（重看结束） |
| **Room** | 核心交互中心，管理妈妈行动与日常事件 | `Title` / `Prologue` / `Play` / `Market` 等 | `Shelf`, `Repair`, `Homework`, `Market`, `Friend`, `Play`, `Album`, `Settings` |
| **Repair** | 近景修卡带交互，哈气/划桌逻辑 | `Room` / `Shelf` | `Play` (插卡成功), `Room` (离开) |
| **Shelf** | 鞋盒，卡带收集展示与插卡选择 | `Room` | `Room` (插卡后), `Repair` (针对特定卡) |
| **Play** | 小游戏宿主，提供电视边框遮罩与花屏判定 | `Room` / `Repair` / `Friend` | `Room` (正常退出/花屏/被抓), `Friend` |
| **Market** | 集市摊位，卡带砍价与杂货购买、二手主机目标 | `Room` (消耗 1 AP) | `Room` (回家) |
| **Friend** | 发小家，双打与借卡交互 | `Room` (消耗 1 AP) | `Play` (双打), `Room` (离开) |
| **Homework** | 写作业，按笔顺输入机制 | `Room` (消耗 1 AP) | `Room` (完成或放弃) |
| **Settings** | 系统设置（显像管、扫描线、音量、震屏、麦克风、清档） | `Title` / `Room` | `Title` / `Room` (返回) |
| **Album** | 回忆册、序章重看入口、结局演出与统计数据 | `Title` / `Room` / `Room`(结局) | `Title` / `Room` / `Prologue` |
| **Sys** | 全局控制层（全屏、静音、切后台） | 自动常驻 | - |

## 5. 逐场景详述

### 5.1 PrologueScene (2026 年那个晚上)
*   **职责**：把 `SB.STORY.prologue` 的 12 镜演出来。画面在 `src/anim/prologueArt.js`（全部色块 + 点阵字现画，不加贴图），文案在 `SB.L.story.prologue`，本场景只管节奏、输入、交棒。
*   **版面**：日期条 `y 0–16`（左边年月日、右边时刻 + 地点）/ 画面 `y 16–194` / 旁白带 `y 196–252` / 底部 16px 归 `SB.UI.hint`；菜单固定摆右上（`x 208`，`y 46` 起，上面 20–40 留给「跳过」按钮）。
*   **节奏**：**不自动翻页**。一行打完停住等输入，右下角 `▼` 闪（620ms yoyo）；打字中 A 补完当前行，打完后 A 进下一行/下一镜。`SB.STORY.prologue` 里的 `holdMs` 是自动播放时代的遗留字段，本场景不读它。
*   **输入**：A / START / 点画面 = 推进；B / 右上角「跳过」= 结束序章；菜单打开时菜单吃方向键与 A，B 仍由本场景接（`cancelable:false`）。
*   **不可跳**：S-10（眨眼）与 S-11（色温迁移）`skippable:false`，按 B 给 toast「这一段跳不过去，6 秒就好。」最后一镜（`last`）不显示跳过按钮，B 等价于 A。
*   **等待条 (S-05)**：`gate` 镜，`SB.STORY.PRO_WAIT_MS = 18000`，条走满才在菜单里追加「车来了」，同时响一声自行车铃；期间三个选项（刷手机 / 抬头看雨 / 来回走走）各有 3 句轮换台词。
*   **收尾**：非重看时置 `flags.prologue`（跳过则加 `flags.prologueSkipped`）；跳过会先播三行摘要 `interlude`；`handOff()` 走 `Room {from:'title', intro}`，重看则回 `Album`。

### 5.2 TitleScene (标题)
*   副标题：`2004 年，一台不属于你的游戏机`。
*   菜单：有档时「继续那个夏天」；「重新过一次暑假 / 开始这个暑假」；「回忆册」（看过序章时 `sub` 显示「含序章」）；「设置」。
*   **序章门禁**：开始或继续时算 `needPro = !s.flags.prologue && !s.__nostory`，需要就 `Prologue`，否则 `Room`；`intro = !!isNew && !s.seenIntro`。

### 5.3 RoomScene (客厅)
*   **职责**：游戏的核心循环场景。首次进入播 `SB.L.intro`，随后补讲「这台是借的」（`SB.L.story.lent` + `markTold()`）；老档只用 `lentLate` 一句补设定，不重播开场。
*   **13 个交互热区**（逻辑坐标 x, y, w, h，来自 `SB.ROOM` + `buildSpots()`）：
    | 物件 | 坐标与尺寸 | 描述 |
    | :--- | :--- | :--- |
    | **电视机 (tv)** | (160, 42, 156, 128) | 开/关电视、拍一巴掌、把卡带拿出来弄一下、坐下来玩 |
    | **小旋风主机 (console)** | (250, 190, 84, 36) | 插/拔/插到底/RESET/吹卡槽/翻过来看底下那块胶布 |
    | **装卡带的鞋盒 (shoebox)** | (78, 236, 56, 34) | 进入 `ShelfScene` |
    | **沙发 (sofa)** | (48, 188, 60, 40) | 藏卡带 / 摸出来 / 坐一会儿 |
    | **小方桌 (desk)** | (390, 213, 66, 49) | 写作业（进 `HomeworkScene`）/ 把作业本摊开 |
    | **门 (door)** | (398, 92, 62, 118) | 去集市 / 去发小家 / 睡觉 |
    | **窗户 (window)** | (24, 36, 84, 64) | 氛围描述 |
    | **灯 (bulb)** | (96, 0, 18, 26) | 物理开关灯，影响滤镜 Alpha |
    | **金鱼缸 (fish)** | (374, 182, 22, 28) | 鱼儿游动帧动画交互 |
    | **挂历 (calendar)** | (120, 44, 34, 46) | 暑假剩余天数 + 章节 + 还机剩余天数 |
    | **暖水瓶 (thermos)** | (350, 196, 22, 46) | 氛围描述（挡在鱼缸左边，框按看得见的部分切） |
    | **奖状 (award)** | (330, 52, 42, 30) | 氛围描述 |
    | **挂钟 (clock)** | (338, 10, 28, 28) | 氛围描述 |
    **点击框的硬规矩**：两两互不重叠且至少留 2px 缝；谁挡在前面重叠那块就归谁；门只留上半截（92..209），下面是桌面和摊开的作业本。改完必须跑 `tools/gametest/bugfix_title_room_test.js`，它会把 13 个框两两算一遍重叠与间距。
*   **系统菜单**：`SELECT` 或右上角「菜单」按钮打开 —— 心愿单（`sub` 显示还差多少）、回忆册、设置、回标题画面、继续。
*   **关键机制**：
    - **`armMom()`**：电视一开就给妈妈上弦（在家 = `kitchen`，不在家 = `out`），同时 toast 一句线索。
    - **`sleep()`**：最后一天走结局（`endingBody()` → `Album {ending:true}`），否则 `SB.Time.sleep()` 后重进 `Room {from:'wake'}`。
    - 出门前电视还开着会被拦住。

### 5.4 RepairScene (修卡)
*   **职责**：精细化卡带维护。左侧留给脏污/磨损两根条（x≤112），右侧是按钮列（x≥340），中间是动作特写取景框。
*   **右侧控制按钮表**（`bx=340, by=40, gap=24, w=128`）：
    | 序 | 按钮 | 副标题 | 动作 |
    | :--- | :--- | :--- | :--- |
    | 1 | 哈气 | 按住 `keyName('a')` | 长按 A / 长按卡带 → `beginBlow`/`endBlow` |
    | 2 | 在桌上划 | 左右推 | 按住 `←→` 来回推，或鼠标在卡带上左右划 → `strokeOnce` |
    | 3 | 吹卡槽 | - | `doPuff` |
    | 4 | 用棉签擦 | 剩 N 支 | `doSwab` |
    | 5 | 插回去，开电视 | - | `insertAndBoot`（也可按 START） |
    | 6 | 先放着 | - | `leave` |
*   **特殊机制**：
    - **动作特写**：`src/anim/repairAnim.js` 的四拍（准备/发力/停顿/收尾）画中画；特写没演完时点按钮先当「跳过」，但 `pendingFix` 一定会结算——跳过动画不能丢掉那一下的数值。
    - **麦克风哈气**：若开启 `settings.mic`，`blowPower` 由 `SB.Mic.read()` 实时驱动，拿不到权限退回长按。
    - **鼠标/手指左右划**：位移超 14px 且方向翻转记一下 `strokeOnce`。
    - **插拔概率**：`s.seated = SB.chance(0.62)` 模拟没插到底的物理随机性。

### 5.5 PlayScene (电视机内)
*   **职责**：封装小游戏运行环境（`SB.SCREEN` 360×270），并同时跑妈妈的秒表。
*   **开机演出**：标题卡上写 `1994  XUANFENG`——虚构品牌「小旋风」的机器年份，与叙事年份（2004）无关。
*   **输入层**：进场 `setTwoP(twoP)`；单人时 `setMove1P(true)`，暂停时关、继续时再开、退场必关。
*   **START 的三义**：有妈妈预警（`warnLevel >= 1`）时 START = 开始收拾 `startRescue(false)`；已经在收拾（`rescueOn`）时 START/A/B = 判一下；其余时候打开暂停菜单（含「看按键说明」）。触屏那颗红键同步改叫「收拾」。
*   **抢救三下**（`startRescue` / `judgeRescue` / `finishRescue`，规则见 `SB.Rescue`）：关电视 → 拔卡带 → 塞沙发缝，每步一根判定条。`perfect` 不罚；`ok` 给妈妈的秒表推 ~450ms；`miss` 推 ~1100ms 且当前这步重来。压力越大判定区越宽、光标越快。第三级预警（钥匙插锁）自动进入。抢救期间小游戏暂停、妈妈秒表照跑、暂停菜单与「离开」都封掉。收完（`grade()` = `clean`/`close`）走 `exit('rescue')` 回客厅，客厅按等级给一句回收文案。
*   **中途花屏**：每 6 秒判一次，概率 `dirt*0.00055 + wear*0.00035`，天热 ×1.6；触发后 2.4 秒退回客厅并带上 `fault`。
*   **RESET 键**：`R` 键，重启小游戏，但按下时有 `failChance × 0.5` 的概率直接把画面按花。
*   **时段推进**：一局玩超 45 秒且不在发小家，离场时 `SB.Time.nextSlot()`。
*   **通关 / 被抓**：`onCleared()` 记 `stats.cleared`、卡上记 `cleared`、心情 +12（重复通关 +4）；`onBusted()` 转场回客厅演清算。
*   **按键指引**：`SB.KeyGuide.attach(this)`，见 §7。

### 5.6 其他场景概略
*   **ShelfScene**：12 格卡带，显示已拥有/借来/插着/藏着/坏掉；右侧详情有名称、壳色、描述、背面信息、借卡剩余天数、脏与磨两条、玩过次数/最高分/通关。
*   **HomeworkScene**：笔顺输入（上下左右序列判定），`mind` 走神值随时间增长，按键 `wake()` 恢复；写完一个字 `homework += 12`，进场消耗 1 AP，100% 解锁回忆 `homework_done`。
*   **MarketScene**：进场 1 AP。老王卖卡（`haggle` 砍价、假卡不当场揭穿），张老板卖杂货（一口价）；提示条常驻「二手主机还差多少」。二手主机走单独的 `consoleTalk()` 流程——买不起也能点进去听他吆喝、看清差额，比一行灰字更能让人想再去捡两个瓶子。
*   **FriendScene**：进场 1 AP。他家的卡 `01/04/08/11`，真支持同屏双打的是 `tank` 与 `fight`；借卡成功率 `clamp(0.85 - (rarity-2)*0.18 + (plays>6?0.1:0), 0.2, 0.95)`，借到 7 天。双人键位：1P 方向键 + `X`(A)/`Z`(B)，2P `WASD` + `H`(A)/`G`(B)。
*   **AlbumScene**：条目来自 `Save.d.album`；`flags.prologue` 为真时第一页 unshift 常驻条目「那个晚上」（A 或二次点击重看序章）。`ending:true` 时先播结局（正文 → 变体 → 尾声）再显示册子，并解锁「8 月 31 日」条目。统计含开机、修卡、哈气、划桌、拍电视、被抓、逃掉、买卡、信任、心情。
*   **SettingsScene**：`defs` 依次为 显像管特效（0 关 / 1 正常 / 2 很脏的老电视）、扫描线、音乐音量、音效音量、拍电视时震屏、用麦克风哈气、清空存档、返回。
*   **SysScene**：全局监听（`keydown-F` 全屏等），负责切后台静音。

## 6. 音频、文字、CRT 模块 API

### 6.1 音频 (SB.Audio)
*   `sfx(key, opts)`：播放音效。音量计算：`(meta.vol * opts.vol) * s.sfx`。
*   `bgm(key, fade)`：播放背景音乐。`fade` 为 true 时执行 600ms 淡入淡出。
*   `loop(key, vol)` / `stopLoop(key)`：环境音与循环音（`cicada`、`fan_hum`、`heartbeat`）。

### 6.2 文字 (SB.Text)
*   基于 BitmapFont。`add(scene, x, y, str, size, tint)`：优先使用位图字体，缺失则退化为 `ui-monospace`。
*   `wrap(str, maxW, size)`：核心排版引擎，支持中英文混排及避头尾法则；`clamp()` 限行数、`addWrapped()` 直接落地。
*   `typewriter(scene, obj, full, speed, onDone)`：返回带 `skip()` 与 `done` 的控制器（序章与对话框的打字机就是它）。
*   **字库约束**：只用 GB2312 一级汉字——点阵字库里没有二级字，画出来是空白。

### 6.3 显像管 (SB.CRT)
*   `create(scene, rect, opts)` 造一台；`setFault(fault)` 设置视觉故障，支持 `SNOW`, `GLITCH`, `ROLL`, `SHAKE`, `RAINBOW`。
*   `powerOn(cb)` / `powerOff(cb)`：模拟电视开关时的扫描线坍缩动画。
*   `bezel(scene, depth)`：绘制逻辑分辨率两侧的木纹边框、散热孔及电源灯。

## 7. 按键指引 (SB.KeyGuide)
解决一件事：卡带标题一过、游戏真的能动了，第一次玩的人不知道该按什么。

*   小游戏「真正可操作」的那一刻，在电视画面正中盖一张半透明按键卡，3.5 秒自己淡掉（淡入 140ms / 淡出 200ms），按任意键或点一下画面立刻收掉——它绝不拦着人玩。
*   卡收掉后，画面角上留一条很淡的常驻键位条，落点一张卡一张卡挑过：不压 HUD、不压血条、不压 Boss 血槽、不压杂志秘技那几行。
*   暂停菜单里有「看按键说明」，随时能把那张卡再叫出来。
*   **两条硬规矩**：键名一个都不写死，全部现算 `SB.Input.keyName() / tip()`；表里每一条都是照着 `src/games/*.js` 里真正读输入的那几行抄出来的，改了玩法就回来改这张表。

## 8. 场景流转关系
1.  **Boot** --(自动解锁)--> **Title**
2.  **Title** --(开始/继续 且 `!flags.prologue`)--> **Prologue** --> **Room**
3.  **Title** --(开始/继续 且已看过序章)--> **Room**
4.  **Title** --(菜单选项)--> **Album** / **Settings**
5.  **Album** --(第一条「那个晚上」)--> **Prologue** --(重看结束)--> **Album**
6.  **Room** --(点鞋盒)--> **Shelf**
7.  **Room** --(点主机/电视菜单「弄一下」)--> **Repair**
8.  **Room** --(点小方桌-写作业)--> **Homework**
9.  **Room** --(点门-去集市)--> **Market**
10. **Room** --(点门-去发小家)--> **Friend**
11. **Room** --(电视菜单-坐下来玩)--> **Play**
12. **Room** --(SELECT 系统菜单)--> **Album / Settings / Title**
13. **Room** --(点门-睡觉)--> **Room**`{from:'wake'}`；第 48 天则 --> **Album**`{ending:true}` --> **Title**
14. **Shelf** --(插卡/修复)--> **Room / Repair**
15. **Repair** --(插回去开电视且成功)--> **Play**；--(先放着)--> **Room**
16. **Play** --(收拾完/紧急关电视/退出)--> **Room**
17. **Play** --(中途花屏)--> **Room** (携带 `fault`)
18. **Play** --(被抓)--> **Room** (携带 `busted`)
19. **Play** --(发小家双打结束)--> **Friend**
20. **Market / Friend / Homework** --(回家/写完)--> **Room**
21. **Settings / Album** --(返回)--> **Title / Room**
