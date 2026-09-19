# 《那年的红白机》剧情系统落地施工图

> 依据：早期设计方案的**剧情部分**，以及 `src` 当前源码事实。
> 决策前提（用户已拍）：**只做叙事/剧情/文本/结构，不做方案里的动画演出**。
> 本文档的目标：另一个工程师照着它可以直接开工，不需要再回去翻别的东西。
> 编写日期：2026-09-17　　对应源码：`nianhong-fc`（v1 像素原版）

---

## 0. 三分钟速读

| 项目 | 结论 |
|-|-|
| 这轮做什么 | 序章（2026 现实层）、主线五章引导层、七条支线、L3 醒来与自由怀念模式、全部对话与旁白文本、触发条件、存档字段 |
| 这轮不做什么 | 修卡动作表现、被抓瞬间演出重制、任何新动画/粒子/镜头语言、画风与美术返工 |
| 新增源文件 | `src/data/story.js`、`src/data/storyLines.js`、`src/systems/story.js`、`src/scenes/PrologueScene.js`（共 4 个） |
| 改造源文件 | `src/core/save.js`、`src/systems/timeSystem.js`、`src/scenes/TitleScene.js`、`RoomScene.js`、`AlbumScene.js`、`MarketScene.js`、`FriendScene.js`、`ShelfScene.js`、`HomeworkScene.js`、`index.html`、`test-game.html`、`src/main.js` |
| 存档新增字段 | 15 个（1 个版本号提升 + 1 个新顶层对象 `story` 含 5 个子字段 + 7 个 `flags` + 2 个 `stats`） |
| 文案总量 | 约 250–300 条（含最小可玩集 110 条），合计 8000–11000 全角字 |
| 批次 | 4 批，第 1 批**完全不动存档结构** |
| 一行不改的东西 | `SB.Repair` 全部公式、`summerDayCount = 48`、12 张卡带映射、经济价格表、`SB.Parent.resolve()` 的 level/punish 判定、localStorage KEY |

---

## 1. 范围声明

**做**：叙事结构（三层框架落到现有场景）、序章可玩流程、主线五章的触发与结算、七条支线的挂载与状态机、结局分支与自由怀念模式、全部剧情文案（对话 / 旁白 / 回忆册条目）、剧情所需的存档字段与迁移。

**不做**（本轮明确砍掉，设计方案第七、八、九章的演出部分不进排期）：修卡的手上动作分解（哈气雾带、桌沿累计划痕、棉签变色、插卡「咔」的停顿）、被抓瞬间 4 秒 timeline 与去色层、妈妈走位帧扩展、CRT 余晖、新增音效与新背景美术的成品化。

**不做的这些东西怎么处理**：剧情需要新画面的地方（序章的办公室 / 雨夜 / 出租车内），一律用**纯色块 + 现有 `pix12` 点阵字 + 现有 `SB.UI` 组件**表达，即 `RoomScene.put()` 已有的「缺图就用同尺寸色块占位」策略。剧情逻辑里不允许出现任何「等美术到位才能跑通」的死路径。新音效同理：`SB.Audio.sfx()` 对缺失 key 是静默返回的，直接按目标 key 名调用，资源以后补。

---

## 2. 叙事总结构如何映射到现有流程

### 2.1 四层与现有场景的对应

| 层 | 内容 | 落在哪里 | 是否新增 |
|-|-|-|-|
| L0　2026 现实 | 加班的办公室 → 打车等车 → 上车 → 车上刷手机 | 新场景 `Prologue`，内部分段 | **新增 1 个场景** |
| L1　入梦 | 眨眼三次、色调迁移、雨刷变蝉鸣 | 同一个 `Prologue` 场景的最后两段 | 复用 |
| L2　2004 暑假 | 现有全部玩法 + 五章引导层 + 七条支线 | `Room` / `Market` / `Friend` / `Shelf` / `Homework` / `Play`，加 `SB.Story` 系统层 | 改造 |
| L3　醒来 | 出租车后座、「结束 / 继续怀念」二选一 | `AlbumScene` 的结局分支之后，不新增场景 | 改造 |

### 2.2 流程接缝（现有链路 → 新链路）

现有启动链（源码事实）：
`Boot` → `Title` → `Title.enter(isNew)` → `scene.start('Room', { from:'title', intro: !!isNew && !SB.Save.d.seenIntro })` → `Room.afterEnter()` 里 `introFlag` 为真则播 `SB.L.intro` 五句 → `dailyCheck()`。

新链路只在 `TitleScene.enter()` 里插一次分流：

```
Title.enter(isNew)
  ├─ 需要序章？（!SB.Save.d.flags.prologue && !SB.Save.d.__nostory）
  │    → scene.start('Prologue', { from:'title', isNew: !!isNew })
  │        Prologue 走完 / 被跳过 → flags.prologue = true → scene.start('Room', { from:'title', intro: ... })
  └─ 不需要 → 原样 scene.start('Room', ...)
```

**门禁必须放在 `TitleScene`，不能放在 `RoomScene.afterEnter()`。** 原因是全部 Playwright 套件（`flow_test` / `flow2_test` / `flow3_test` / `play_integration` / `keys_ui_test`）都是直接 `g.scene.start('Room' | 'Play', ...)` 绕过 Title 的；门禁放 Room 会让这些用例集体走进序章。同时按现有 `__nomom` 的惯例，加一个调试短路字段 `__nostory`（非持久化、不进 `def()`），供测试与调试台一键关掉剧情层。

**结局接缝**：现有 `RoomScene.sleep()` 判 `SB.Time.isLastDay()` → 播 `SB.L.ending.body` 的 interlude → `scene.start('Album', { from:'Room', ending:true })`；`AlbumScene` 在 `ending` 分支里写 `flags.finished = true`、`unlockAlbum('ending', ...)`、播 `endingLines()`。新增的 L3 醒来段接在 `endingLines()` 的 interlude 回调**之后**，仍在 `AlbumScene` 内部完成，然后才允许玩家翻册子。

**醒来 / 自由怀念如何回到沙盒**：二选一菜单
- 「结束（醒来）」→ `flags.awake = true`，回 `Title`；`Title` 菜单第一项文案改成「回到那个夏天」（读档行为不变，仍是 `enter()`）。
- 「继续怀念小时候」→ `flags.freeMode = true`，`SB.Save.d.day` **回退到 48（不再前进到 49）**，`slot` 置 3（傍晚），然后 `scene.start('Room', { from:'freemode' })`。回到的就是原来那个沙盒，只是 `SB.Time.isLastDay()` 的结局分支被短路（见 §8）。

---

## 3. 新增 / 改造场景清单

| scene key | 职责 | 从哪进 | 到哪出 | 复用的现成能力 | 工作量 |
|-|-|-|-|-|-|
| **`Prologue`**（新增） | L0+L1 全部内容，数据驱动的分段播放器 | `Title.enter()` | `Room`（`{from:'title', intro:...}`）；从回忆册进来时回 `Album` | `SB.UI.interlude`（黑底白字段落）、`SB.UI.dialog`（手机内容、司机台词）、`SB.UI.menu`（呼叫 / 刷手机的选择）、`SB.UI.fadeIn/fadeOut`、`SB.Text.add` + 色块（所有画面）、`SB.Audio.sfx/loop`（缺失静默） | **中**（无动画后从「大」降级） |
| `Title`（改） | 序章分流、菜单文案随 `flags.awake`/`freeMode` 变化、新增「重看序章」入口 | — | `Prologue` / `Room` / `Album` / `Settings` | 现有 `SB.UI.menu` | 小 |
| `Room`（改） | 章节起手与落幕的播放点、章节 HUD 一行、妈妈线阶段 1/3 的挂载、`from:'freemode'` 分支 | — | — | `say()`、`openMenu()`、`SB.UI.interlude`、`SB.UI.toast`、现有 `hud`/`hint` | **中** |
| `Album`（改） | L3 醒来段、二选一菜单、四个结局变体、固定条目「序章」入口 | — | `Title` / `Room`(freeMode) / `Prologue`(重看) | `SB.UI.interlude`、`SB.UI.menu`、现有条目列表 | **中** |
| `Market`（改） | 支线「假卡的真相」「电风扇」的对话挂载 | — | — | `laoMenu()` / `zhangMenu()` / `say()` | 小 |
| `Friend`（改） | 支线「借出去的那张」的三阶段对话 | — | — | `talkMenu()` / `borrow()` / `say()` | 小 |
| `Shelf`（改） | 妈妈线阶段 2（鞋盒底下的照片） | — | — | `act()` / `say()` | 小 |
| `Homework`（改） | 支线「最后三十二页」的三晚判定 | — | — | `finish()` | 小 |

### 3.1 序章的分段方案（明确：**一个场景，多段**）

不做 6 个 Phaser 场景，理由：每个场景都要各自注册、各自兜底纹理、各自处理 `shutdown`，而序章 12 镜里有 9 镜的画面就是「一张纯色底 + 两三行字 + 一个按键」，用 12 个场景是纯粹的重复劳动，也让「跳过」和「重看」要写两套。

做法：`PrologueScene` 是一个**分镜播放器**。分镜表放在 `src/data/story.js` 的 `prologue` 数组里，每个元素是一个 beat（镜），字段见 §4.3。场景 `create()` 里只做三件事：铺底层（色块 + 可选背景 key）、`playBeat(0)`、绑跳过键。`playBeat(i)` 按 beat 的 `kind` 分派到 `interlude` / `dialog` / `menu` / `wait` 四种播放器之一，播完 `i+1`，到尾就出场。

12 镜按方案原样保留编号，本轮的实现形态如下（S-xx 对应设计方案分镜号）：

| 镜 | 本轮实现形态 | 玩家操作 | 可跳过 |
|-|-|-|-|
| S-01 办公室远景 | `wait` beat：底色 `#12141c` 色块 + 三行旁白（`interlude` 风格）+ 一个「23:47」的 `SB.Text` | 无，自动推进 | ✔ |
| S-02 显示器「发布完成 100%」 | `menu` beat：一个单项菜单「关掉它」 | 选一次 | ✔ |
| S-03 屏幕黑掉 | `wait` beat：屏幕色块 alpha → 0，一句旁白 | 无 | ✔ |
| S-04 打车软件 | `menu` beat：「确认呼叫」 / 「再等等」（选后者多一句旁白，仍然呼叫） | 选一次 | ✔ |
| S-05 楼下等车 | `menu` beat（`keepOpen`）：刷手机 / 抬头看雨 / 来回走走，三项各有台词，**等待条走满 18 秒**才出现「车来了」项 | 3–5 次选择 | ✔ |
| S-06 车门关上 | `wait` beat | 无 | ✔ |
| S-07 司机拧收音机 | `wait` beat：四行扫台文本逐行打出，第三行是 8-bit 残片的描述 | 无 | ✔ |
| S-08 后座刷手机 | `menu` beat（`keepOpen`）：四条帖子标题，前三条点了各有一句，第四条进 S-09 | 4 次选择 | ✔ |
| S-09 帖子内页最高赞评论 | `dialog` beat：两条 | 点完 | ✔ |
| S-10 三次眨眼 | `wait` beat：三段旁白，节奏由 `delay` 控制 | 无 | ✖ |
| S-11 色调迁移 | `wait` beat：底色从冷蓝灰 tween 到暖色，`settings.scanline` 若为关则**不强开**（尊重玩家设置） | 无 | ✖ |
| S-12 接 2004 | 交棒：置 `flags.prologue = true`，`scene.start('Room', { intro:true })`，`SB.L.intro` 照常播 | 按 A | — |

**等待条不能加速**（S-05）：方案里 40–60 秒的原始设计在无演出支撑时会变成纯粹的空等，本轮定为 **18 秒**，并且这 18 秒里三个可选动作各有 2–3 条不重复的台词，玩家点完刚好差不多到时间。18 秒这个数字写成 `story.js` 里的常量 `PROLOGUE_WAIT_MS`，方便调。

**可跳过怎么做**：
- 跳过键：`SB.Input.p1.just.b`（键盘 Z/J、手柄 X/Y、触屏 B），以及右上角常驻 `SB.UI.corner(this, '跳过序章', ...)` 给鼠标 / 触屏玩家。
- 跳过点：任何 beat 的 `skippable !== false` 时都能按，S-10 / S-11 两镜不响应（只有 6 秒，且是情绪落点）。
- 跳过的效果：`flags.prologue = true`、`flags.prologueSkipped = true`，直接 `scene.start('Room', { from:'title', intro: true })`，`SB.L.intro` 照常播（否则玩家会一句背景都没有就落到客厅）。
- Title 上的提示写在**菜单项的 `sub` 字段**里（`{ label:'开始这个暑假', sub:'约 4 分钟序章' }`），**不要写进 `SB.UI.hint`** —— `keys_ui_test.js` 对 Title 的 hint 有「不能被截断」和「不能出现『返回』」两条断言，往里加字会直接挂。

**可重看怎么做**：
- `AlbumScene` 的条目列表里插一条**常驻**条目（不是 `unlockAlbum` 解锁的成就），id `prologue`，标题「2026 年 8 月 21 日，23:47」。实现方式：`this.entries = [固定条目].concat(SB.Save.d.album)`，只在 `flags.prologue` 为真时插入。
- 选中它按 A → `scene.start('Prologue', { from:'Album' })`；`Prologue` 在 `from === 'Album'` 时结束回 `Album`，且**不写任何存档字段**（重看不改状态）。

---

## 4. 剧情数据结构设计

### 4.1 三个新文件的分工，以及和 `lines.js` 怎么共存

`src/data/lines.js` **一行不改**。它现在是一个大对象 `SB.L`，按场景/系统分块（`intro` / `room` / `repair` / `mom` / `market` / `friend` / `homework` / `game` / `events` / `ending` / `ui`），并配一个 `SB.line(arr)` 从候选里随机取一句。剧情文案沿用同一套约定，但落在新文件里：

| 文件 | 内容 | 挂载点 | 为什么分开 |
|-|-|-|-|
| `src/data/storyLines.js` | 全部剧情文案：序章 12 镜的台词、五章的起手/落幕/目标提示、七条支线每阶段的台词、L3 与四个结局变体、妈妈四档台词的扩写 | 在自己的 IIFE 里执行 `SB.L.story = { ... }` | `lines.js` 已 230 行，剧情文案是它的 1.5 倍；分文件后 `SB.line()`、`SB.Text.wrap()`、对话框全部复用，`SB.L` 命名空间也不打架。**脚本顺序必须在 `lines.js` 之后**（否则 `SB.L` 还不存在） |
| `src/data/story.js` | 纯结构，不含长文本：章节表、支线表、序章分镜表、结局变体表、常量 | `SB.STORY = { chapters:[], quests:[], prologue:[], endings:[] }` | 结构和文案分开，改文案不碰逻辑，改条件不碰文案。命名沿用 `SB.CARTS` / `SB.GOODS` 的既有风格 |
| `src/systems/story.js` | 求值与推进：条件求值、每日结算、阶段推进、待播队列、回忆册解锁 | `SB.Story = { ... }` | 沿用 `SB.Time` / `SB.Parent` / `SB.Repair` 的系统层惯例；场景只调它的方法，不自己判条件 |

`index.html` / `test-game.html` 的脚本顺序（两个文件都要改）：
- `src/data/story.js`、`src/data/storyLines.js` 插在 `src/data/lines.js` 之后；
- `src/systems/story.js` 插在 `src/systems/parent.js` 之后（它要读 `SB.Time`、`SB.Save`）；
- `src/scenes/PrologueScene.js` 插在 `src/scenes/TitleScene.js` 之后；
- `src/main.js` 的 `cfg.scene` 数组里把 `SB.PrologueScene` 加在 `SB.TitleScene` 之后（`main.js` 有一段「场景列表里任何一个没定义都会静默炸掉整台机器」的自查，漏了会得到明确报错而不是白屏，别绕过它）。
- `tools/build_dist.sh` 整目录拷 `src`，**不需要改**。

### 4.2 章节条目（`SB.STORY.chapters` 每一项）

| 字段 | 类型 | 含义 |
|-|-|-|
| `id` | 字符串 | `'ch1'`…`'ch5'`，同时是 `flags` 里的键名和回忆册条目 id |
| `no` | 整数 | 章号 1–5，用于「第三章」这种显示 |
| `title` | 字符串 | 章节名，如「电视是家里最贵的东西」 |
| `dayFrom` / `dayTo` | 整数 | 章节的建议天数区间，**只用于显示**（日历上那行字），不参与判定 |
| `enter` | 条件对象 | 起手条件，满足时播 `SB.L.story.ch1.enter` 并把 `story.chapter` 推到本章 |
| `goal` | 条件对象 | 可选目标，满足时算章节完成 |
| `goalText` | 字符串键 | 指向 `SB.L.story.<id>.goal`，显示在 HUD / 回忆册的「眼下」一行 |
| `outro` | 字符串键 | 落幕文本键，指向 `SB.L.story.<id>.outro`（一个 3–5 条的数组，走 `SB.UI.interlude`） |
| `unlock` | 对象 | 章节完成时的副作用声明：`{ flag:'ch1', album:{ id, title, text } , grant:{...} }` |

**条件对象的形状**（`enter` / `goal` / 支线的 `cond` 共用同一个求值器 `SB.Story.test(cond)`）：一个扁平对象，所有键之间是「与」，`any` 数组里的元素之间是「或」。支持的键：

| 键 | 含义 | 举例 |
|-|-|-|
| `dayMin` / `dayMax` | `Save.d.day` 区间 | `dayMin: 15` |
| `slot` | 时段 key 或 key 数组，对应 `SB.SLOTS[i].key` | `slot: ['after','dusk']` |
| `stat` | `stats` 字段的下限，对象形式 | `stat: { repairs:3, blows:12 }` |
| `save` | 顶层数值字段下限（`caught` / `escaped` / `momTrust` / `money`） | `save: { caught:1 }` |
| `flag` | `flags` 里为真的键，或键数组 | `flag: 'ch1'` |
| `notFlag` | `flags` 里为假 | `notFlag: 'momOut'` |
| `quest` | 支线阶段下限，`{ id: stage }` | `quest: { momline:2 }` |
| `carts` | 卡带条件：`ownedMin` / `clearedMin` / `hasFake` / `hasId` | `carts: { ownedMin:10 }` |
| `any` | 子条件数组，任一命中即真 | `any: [{dayMin:27},{save:{caught:2}}]` |
| `scene` | 只在指定场景里可命中（挂载点约束） | `scene: 'Market'` |

求值器只读 `SB.Save.d`，无副作用，**必须是纯函数**——这是后面写单元测试的前提。

### 4.3 序章分镜（`SB.STORY.prologue` 每一项）

| 字段 | 类型 | 含义 |
|-|-|-|
| `id` | 字符串 | `'s01'`…`'s12'` |
| `kind` | 字符串 | `wait` / `dialog` / `menu` 三种播放形态 |
| `bg` | 字符串或数字 | 背景：纹理 key（缺失时自动退回色块）或直接一个 16 进制底色 |
| `lines` | 字符串键 | 指向 `SB.L.story.prologue.<id>` 的文本数组 |
| `options` | 数组 | 仅 `menu` 用：`[{ label, say, next, once }]`；`next` 缺省表示留在本镜 |
| `holdMs` | 整数 | 仅 `wait` 用：文本播完后再停多久 |
| `gateMs` | 整数 | 仅 `menu` 用：多少毫秒之后才出现「走下一步」那一项（S-05 的等待条） |
| `skippable` | 布尔 | 默认 true；S-10 / S-11 为 false |
| `sfx` / `loop` | 字符串 | 进镜时播的音效 / 环境音 key（缺失静默） |

### 4.4 支线条目（`SB.STORY.quests` 每一项）

| 字段 | 类型 | 含义 |
|-|-|-|
| `id` | 字符串 | 如 `'fakecart'` / `'lentcart'` / `'momline'`，也是 `story.quests` 的键 |
| `name` | 字符串 | 支线名，显示在回忆册与「眼下」提示里 |
| `optional` | 布尔 | 是否必做。本轮**全部为 true**（见 §7） |
| `scene` | 字符串 | 主挂载场景 key，供场景侧一句 `SB.Story.pending(this.scene.key)` 取出待播内容 |
| `stages` | 数组 | 每个阶段一项：`{ cond, lines, choices, grant, minGapDays }` |
| `stages[].cond` | 条件对象 | 同 §4.2 的形状 |
| `stages[].choices` | 数组 | 可选：`[{ label, grant, lines, setFlag }]`，用 `SB.UI.menu` 呈现 |
| `stages[].grant` | 对象 | 副作用声明：`{ money, goods:{swab:2}, owned:{fan:true}, momTrust:+5, flag:'x', album:{...} }` |
| `stages[].minGapDays` | 整数 | 与上一阶段之间至少隔几天（妈妈线靠它撑住节奏，默认 0） |
| `reward` | 对象 | 全线完成时的一次性奖励与回忆册条目 |

### 4.5 系统层 `SB.Story` 的对外接口（只列职责，不写实现）

| 方法 | 何时调用 | 做什么 |
|-|-|-|
| `SB.Story.test(cond)` | 内部 | 条件求值，纯函数 |
| `SB.Story.dailyTick()` | `SB.Time.sleep()` 末尾，`rollEvent()` **之后** | 章节起手/完成判定、支线阶段的天数门槛推进、把要播的东西塞进 `story.pending` |
| `SB.Story.enterScene(key)` | 每个相关场景 `create()` 之后（`Room` 在 `afterEnter()` 里） | 返回该场景此刻要播的剧情节点数组（已按 `story.seen` 去重），场景拿到就播 |
| `SB.Story.consume(nodeId)` | 场景播完一段后 | 写 `story.seen[nodeId] = true`，应用 `grant`，`SB.Save.save()` |
| `SB.Story.chapterNow()` | HUD / 日历 / 回忆册 | 返回当前章节对象（**纯读**，不写状态位，第 1 批就能用） |
| `SB.Story.questStage(id)` | 场景侧判分支 | 返回支线当前阶段数 |
| `SB.Story.endingVariant()` | `AlbumScene` 结局分支 | 按 §8.3 的顺序判定，返回变体 id |
| `SB.Story.grant(obj)` | 内部 | 统一施加副作用，所有钱/物/信任度的写入都走这里，方便日后做「剧情不许给数值奖励」的开关 |

**为什么章节结算挂在 `SB.Time.sleep()` 而不是新起一个 tick**：`sleep()` 已经是每天唯一的结算点（`day++`、重置 flags、借卡到期、发零花钱、`rollEvent()`）。注意两个既有事实：① `sleep()` 会重置 `flags.momOut/blocked/hot/friendVisit/bookOpen` —— **剧情 flag 一个都不能加进那个重置列表**；② `flags.dayRolled` 是 `RoomScene.dailyCheck()` 用来防重复抽事件的，剧情待播队列要用 `story.seen` 自己防重，不要复用 `dayRolled`。

---

## 5. 存档结构变更与迁移

### 5.1 现状（源码事实，务必先读懂再动手）

- KEY 是 `'nianhong_save_v1'`，写在 `save.js` 开头；老键 `'subor_summer_save_v1'` 留在 `OLD_KEY` 里只为搬一次老档。**KEY 不要再改**：改 KEY 等于所有老玩家的档凭空消失，除非像这次改名一样同时补上搬家逻辑。
- `load()` 现在的判定是 `if (d && d.v === 1)`，**只认 v === 1**；其他情况直接 `this.d = this.def()`，也就是**静默开新档**。所以只把 `def().v` 改成 2 而不改这个判定，等于把所有老档格式化掉。这是本节最大的坑。
- `merge(base, saved)` 已经做了递归回填：遍历 `base` 的键，saved 有就用 saved 的、没有就用 base 的默认值；末尾还会保留 saved 里多出来的键。**所以只要在 `def()` 里写上默认值，新字段在老档里就自动有值**，不需要为每个字段写迁移代码。
- `flags` 的默认值是 `{}`（空对象），意味着 merge 不会为 flags 内部的键回填任何默认值。数值型剧情状态（如 `momCare`）如果放进 flags，在老档里会是 `undefined`。**结论：布尔型可以放 flags（`!!undefined === false` 安全），数值型和对象型必须放到有显式默认值的地方。**

### 5.2 新增字段逐个列出

| 字段 | 类型 | 含义 | 默认值 | 批次 |
|-|-|-|-|-|
| `v` | 整数 | 存档版本号，`1` → `2` | `2` | 2 |
| `story` | 对象 | **新顶层对象**，剧情状态集中放这里（不塞 flags，避免 flags 变垃圾场） | 见下 4 行 | 2 |
| `story.chapter` | 整数 | 当前进行到第几章，0 = 还没起第一章 | `0` | 2 |
| `story.chapterDone` | 数组（字符串） | 已完成的章节 id，如 `['ch1','ch2']`；用数组而不是 5 个布尔位，回忆册排序方便 | `[]` | 2 |
| `story.quests` | 对象 | 支线状态表，键是支线 id，值是 `{ stage:整数, done:布尔, lastDay:整数 }` | `{}` | 2 |
| `story.seen` | 对象 | 已播过的剧情节点 id → true，防止重播 | `{}` | 2 |
| `story.pending` | 数组（字符串） | 待播节点 id 队列（跨场景传递，比如夜里结算出来的东西第二天在客厅播） | `[]` | 2 |
| `flags.prologue` | 布尔 | 序章看过（含跳过）。与现有 `seenIntro` **分工明确**：`prologue` 管 2026 那段，`seenIntro` 管 2004 那五句 | `false` | 3 |
| `flags.prologueSkipped` | 布尔 | 是跳过的而不是看完的，决定回忆册里那条条目的副标题文案 | `false` | 3 |
| `flags.freeMode` | 布尔 | 自由怀念模式。为真时 `isLastDay()` 的结局分支被短路 | `false` | 4 |
| `flags.awake` | 布尔 | 选过「结束（醒来）」，Title 菜单文案改成「回到那个夏天」 | `false` | 4 |
| `flags.momCare` | 整数 0–3 | 妈妈线阶段。**因为是数值型，必须在 `def()` 的 `flags` 里显式写 0**，否则老档是 undefined | `0` | 4 |
| `flags.momReconcile` | 布尔 | 和解达成，解锁结局变体 A | `false` | 4 |
| `flags.momSitIn` | 布尔 | 妈妈线阶段 3 那一局的一次性豁免：为真时 `RoomScene.armMom()` 直接 return（复用现有 `__nomom` 的短路写法，但这是持久字段，用完立刻清回 false） | `false` | 4 |
| `flags.endingVariant` | 字符串或 null | 命中的结局变体 id（`'A'`…`'D'` 或 `'default'`），供回忆册显示与二次进入 | `null` | 4 |
| `stats.blowsPerfect` | 整数 | 落在 0.55–0.85 最佳区间的哈气次数，供第三章「手艺」判定 | `0` | 2 |
| `stats.chapters` | 整数 | 完成的章节数，回忆册统计行用，避免每次去数数组 | `0` | 2 |

**说明三个不新增的字段**（设计方案里提到，但代码里已有等价物或不必要）：
- `stats.cleared`：不新增。通关数用 `SB.CARTS` 上 `carts[id].cleared` 现场计数，`AlbumScene.endingLines()` 里已经有一份现成写法。
- `owned.pad2`：**已存在**，是集市商品（`SB.GOODS` 里 8 元的「山寨 2P 手柄」）。支线「借出去的那张」选「你先玩」时直接置 `owned.pad2 = true` 并把 `pads` 加到 2 即可，不要新造字段。
- `owned.ownConsole`（攒钱买自己的机器）：本轮**不做**，标 P2。它牵动 `SB.GOODS` 价格表和结局变体 D 的条件，结局 D 先用「`money >= 30` 且 `stats.buys >= 5`」这个备用条件顶着。

### 5.3 迁移策略

`save.js` 里做四处修改：

1. 顶部加一个常量 `var VER = 2;`，`def()` 里 `v: VER`。
2. `load()` 的判定从 `d.v === 1` 放宽成 `d && typeof d.v === 'number' && d.v >= 1 && d.v <= VER`。**必须保留对 v === 1 的接受**（`systems_test.js` 第 32 行就写了一条 `{v:1, day:5, money:7}` 的档并断言 `day === 5`）。
3. 新增 `migrate(saved)`：在 `merge()` **之后**执行，按版本号补语义（不是补字段，字段由 merge 负责）：
   - `saved.v === 1` → 视为老玩家：`flags.prologue = true`、`flags.prologueSkipped = true`（不给老玩家硬塞一段序章）；然后按 §5.4 的策略处理章节追认；最后 `d.v = 2` 并 `save()` 一次（**落盘，避免每次开机都重跑迁移**）。
   - 未来的 v2 → v3 在同一个函数里继续往后串，写成 `if (from < 2) {...} if (from < 3) {...}` 的链式，不要写成 if/else。
4. `d.v > VER`（玩家用新版本存了档又回退到老版本）：不要静默开新档，走「按当前版本尽力读」的路径 —— merge 会保证结构完整，多出来的键原样留着。这一条能救未来的自己一次。

### 5.4 章节追认（老档最需要拍板的那一处，见 §13 问题 6）

老档（`v === 1`）已经玩到第 30 天了，`story.chapter` 是 0。三种处理：

| 策略 | 做法 | 代价 |
|-|-|-|
| **A 静默追认**（推荐） | 按 `day` 把该起的章节全部标成已完成，`story.chapter` 设成 `day` 对应的那一章，**但不播任何落幕演出**，也不解锁那几条回忆册条目 | 老玩家看不到前几章的落幕（那是他们已经过完的日子），但从下一章开始正常 |
| B 不追认 | `story.chapter` 留 0，从下次 `sleep()` 起按条件正常判定 | 第 30 天的老玩家会在第 31 天早上突然收到「第一章 电视是家里最贵的东西」，穿越感很强 |
| C 提示新开档 | 读档时弹一次提示，让玩家自己选「继续老档（无剧情）/ 新开一档看剧情」 | 最诚实，但要多做一个存档槽或一个「剧情已关闭」的持久状态 |

### 5.5 老档回归必须专门测的点

| # | 场景 | 断言 |
|-|-|-|
| M-1 | 只有 `{v:1, day:5, money:7}` 的残档 | `day === 5`、`money === 7`、`carts['07']` 存在、`settings` 与 `stats` 齐全（现有 SY-02 用例，**必须继续绿**） |
| M-2 | 完整的 v1 档（玩到 day 30、有借来的卡、被抓 3 次、`padGone` 未到期） | 迁移后 `day/carts/borrowed/caught/padGone/momTrust/album` 全部原值；`d.v === 2`；`flags.prologue === true` |
| M-3 | 同上，连开两次游戏 | 第二次 `load()` 不再触发 migrate（`d.v` 已是 2），且不产生重复的回忆册条目 |
| M-4 | v1 档里 `flags` 有玩家遗留的键（如 `dayRolled: 12`） | merge 的「保留多余键」行为不变，`dayRolled` 还在 |
| M-5 | 坏 JSON / 隐私模式（`localStorage` 抛异常） | 仍然静默开新档，不白屏（现有 SY-02 第二条） |
| M-6 | `v: 3` 的未来档 | 不清档，能进游戏 |

---

## 6. 主线五章 → 触发点映射表

章节只做三件事：**日历上多一行章节名**、**章节目标作为可选待办**、**章节完成时一段可跳过的落幕文本 + 一条回忆册条目**。不完成任何目标，`sleep()` 照样换日，48 天照样走完，结局照样出。

| 章 | 章节名 | 触发条件（起手） | 完成条件（可选目标） | 发生在哪个场景 | 产出什么变化 |
|-|-|-|-|-|-|
| 一 | 电视是家里最贵的东西<br/>Day 1–5 | `dayMin:1`（新档即入） | `stat:{ boots:1, plays:1 }`：第一次真的把画面打出来并玩到 | 起手：`Room.afterEnter()`（`SB.L.intro` 之后）<br/>完成：`Room` 里 `sleep()` 结算后的次日进屋 | `flags.ch1`；`story.chapterDone += 'ch1'`；回忆册 `ch1`「偷来的快乐」；HUD 章节行更新 |
| 二 | 一块五能买什么<br/>Day 6–14 | `flag:'ch1'` 且 `dayMin:6` | `any:[ {stat:{buys:1}}, {save:{borrowedFrom:非空}} ]` | 起手：`Room`<br/>完成：`Market` 买成 / `Friend` 借成的当晚结算 | `flags.ch2`；回忆册 `ch2`；**老王的招呼语升一档**（`SB.L.story.ch2.laoIdle` 覆盖 `SB.L.market.laoIdle`，通过 `SB.Story.chapterNow()` 现场挑，不改 `lines.js`） |
| 三 | 哈两口气<br/>Day 15–26 | `dayMin:15` 且 `stat:{ repairs:3 }` | `stat:{ blows:12 }` 且修活一张 `rarity >= 3` 或 `fake` 的卡（`carts:{ hasFake:true }` 或 `clearedMin` 不适用，用专门的 `repairedHard` 记录位，见备注） | 起手：`Room`<br/>完成：`Repair` 成功开机后回 `Room` 时播 | `flags.ch3`；回忆册 `ch3`「手艺」；`stats.blowsPerfect` 开始计数（在 `RepairScene.endBlow()` 里按 `power` 区间 +1，**不改 `SB.Repair.blow` 的公式**，只在场景侧统计） |
| 四 | 大衣柜最上层<br/>Day 27–38 | `any:[ {dayMin:27}, {save:{caught:2}} ]`（故意用「或」：照顾第 8 天就被抓两次的玩家） | `any:[ {save:{caught:1}}, {save:{escaped:1}} ]`，且经历过一次 `padGone` 或 `cartSeized` 到期 | 起手：`Room`<br/>完成：`sleep()` 里 `padGone` 归零那一天的次日 | `flags.ch4`；回忆册 `ch4`「代价」；**妈妈线阶段 1 变为可触发**（`quests.momline` 的 stage-1 条件里带 `flag:'ch4'`） |
| 五 | 作业还有三十二页<br/>Day 39–48 | `dayMin:39` | `flag:'examDone'`（现有字段，由 `rollEvent()` 的 `exam` 事件置位）且累计写作业达标 | 起手：`Room`<br/>完成：`Homework.finish()` 或 `sleep()` 结算 | `flags.ch5`；回忆册 `ch5`「夏天要结束了」；**妈妈线阶段 3 变为可触发** |

**备注 1（第三章的「修活一张难卡」）**：现有存档没有「这张卡是修活的」这个信息。做法：在 `RepairScene` 成功开机（`SB.Repair.attempt` 返回无 fault）且该卡 `rarity >= 3 || fake` 时，往 `story.seen` 里写一个 `'ch3.hardfix'` 标记。不新增存档字段，`story.seen` 就是为这类一次性事实准备的。

**备注 2（起手与完成的播放时机）**：全部走「结算在 `sleep()`，播放在 `Room`」的两段式。`SB.Story.dailyTick()` 只往 `story.pending` 里塞 id，真正的 `SB.UI.interlude` 由 `RoomScene.afterEnter()` 在 `dailyCheck()` **之后**播（顺序：日常事件对话 → 章节起手/落幕 → `armMom()`）。这样避免了在 `sleep()` 的 interlude 回调里再嵌一层 interlude —— 现有 `sleep()` 已经是 `interlude → scene.start` 的结构，往里塞东西一定会打架。

**备注 3（章节名显示在哪）**：① `RoomScene` 挂历的 flavor 文案里加一行（现有 `flavor('calendar')` 已经在拼「暑假还剩 N 天」，同一处加「第三章 · 哈两口气」）；② 章节目标那一行用 `SB.UI.toast` 在起手当天提一次，不做常驻 HUD（`SB.UI.hud` 的两行已经排满，加东西会挤掉零花钱）；③ 回忆册的 `refresh()` 摘要行里加「第 N 章」。

---

## 7. 七条支线 → 挂载点映射表

| # | 支线 | id | 触发条件 | 挂载场景与角色 | 任务链（阶段） | 奖励 | 必做 | 与主线互不阻塞怎么保证 |
|-|-|-|-|-|-|-|-|-|
| 1 | 假卡的真相 | `fakecart` | `stat:{buys:1}` 且买到 `fake` 或 06 号《赤血要塞·汉化版》 | `Market` / **老王**（源码里叫「卖卡带的老王」，不是方案里的「老李」） | ① 次日回摊质问（走现有 `laoMenu` 新增一项）② 第三天他躲你（`say` 一条，菜单项灰掉）③ 第四天他塞你一张真卡或多找 2 块 | `goods.swab +2` 或 `money +2`；回忆册 1 条 | ✖ | 全部挂在 `laoMenu()` 的**新增菜单项**上，玩家不点就什么都不发生；不占 AP、不改库存算法 |
| 2 | 借出去的那张 | `lentcart` | `flags.friendVisit` 累计触发过 2 次（**注意**：`friendVisit` 每天被 `sleep()` 重置，必须自己在 `story.quests.lentcart.count` 里累计）且你拥有 02 号 | `Friend` / **发小** | ① 他借走 02 号说三天还 ② 第二次上门他说忘带 ③ 第三次你看见卡带在他床底，选「要回来」或「你先玩」 | 选「你先玩」→ `owned.pad2 = true`、`pads = 2`；回忆册 1 条 | ✖ | 借走期间 02 号的 `owned` **不动**，只置 `borrowed` 语义外的一个 `story` 标记，避免和现有借卡系统（`borrowed` 倒计时 + `sleep()` 里的到期归还）抢同一个字段 |
| 3 | 二楼的胖子 | `fatkid` | `dayMin:12` 且 `slot:['after','dusk']` | `Room` 门口菜单新增「上楼看看」（复用 `Friend` 场景换底色，`from:'stair'`） | ① 听见不一样的音效 ② 敲门，他要拿卡带换 ③ 换完发现他一个人在家的时间比你还长 | 借到一张 `rarity 4` 的卡玩两天（走现有 `borrowed = 2`）；回忆册 1 条 | ✖ | 只在门口菜单多一项，消耗 1 AP（和去集市同价），不改门口原有三项 |
| 4 | 电风扇 | `fan` | `flags.hot` **累计** 3 天（同上，`hot` 每天重置，累计数记在 `story.quests.fan.count`，在 `dailyTick()` 里累加） | `Market` / **张老板**（源码里叫「卖杂货的张老板」，不是「张姨」） | ① 热天开机失败率明显变高（现有 `failChance` 里 `flags.hot && !owned.fan → +12` 已经在跑，不改）② 攒钱买 `owned.fan`（现有商品，15 元）③ 买完当晚妈妈问钱哪来的，选撒谎或说实话 | 撒谎 → `momTrust -8`；说实话 → `momTrust +5` 且妈妈线阶段可提前一天 | ✖ | 商品本来就在 `SB.GOODS` 里，支线只是给它加了一段对话；不买也能过 |
| 5 | 表哥来了 | `cousin` | 随机事件 `cousin` 命中（`SB.L.events` 里已有这条，money `[0,0]`） | `Room` + `Play` | ① 来住三天，他玩得比你好 ② 你只能在旁边看（一段 `interlude`）③ 他走后你第一次自己过关 | 回忆册条目「他教我的那一下」 | ✖ | 完全挂在现有随机事件上，不改 `rollEvent()` 的权重与门槛；第 ③ 步的「过关」用现有 `carts[id].cleared` 判定 |
| 6 | 最后三十二页 | `homework32` | `dayMin:40` 且 `homework` 累计进度不足 | `Homework` / 妈妈 | ① 连续三晚写作业（`story.quests.homework32.count` 累计）② 第二晚她切了半个西瓜放桌角（无对话，只有一条旁白）③ 8 月 31 日之前写完 | `flags.examDone` 兜底置位；`momTrust +12`；回忆册 1 条 | ✖ | 只在 `HomeworkScene.finish()` 之后追加一次 `SB.Story.enterScene('Homework')`；不改笔顺算法与 `homework` 数值 |
| 7 | **妈妈线**（情绪主轴） | `momline` | 见 §7.1 | `Room` + `Shelf` | 见 §7.1 | `flags.momReconcile`，解锁结局变体 A | ✖（但**强烈建议本轮必做**） | 三阶段全部是「可以走过去，也可以回房间」的二选一；不选也不影响任何数值 |

**「必做」这一列全为否是刻意的**：现有玩法是沙盒，48 天里玩家可能一次集市都不去。任何一条支线成为主线前置，就会出现「卡住进不下去」的死局。所以所有支线只影响**回忆册条目与结局变体**，不影响任何解锁与推进。

### 7.1 妈妈线三阶段

| 阶段 | 场景 | 触发条件 | 内容要点 | 置位 |
|-|-|-|-|-|
| 1 | `Room`，没开灯的客厅 | `save:{caught:1}` 之后任一 `slot:'night'`，`notFlag:'momOut'`，且 `flag:'ch4'`（第四章起手之后） | 客厅没开灯，她坐在沙发上，桌上是没吃完的饭。可以过去坐下（**不弹对话框，只有一条旁白**），也可以回房间。坐下 → 静 4 秒 → 她说一句「明天你想吃什么。」 | `flags.momCare = 1`；`momTrust +6`；`minGapDays` 起算 |
| 2 | `Shelf`，翻鞋盒时 | `dayMin:30`、`flags.momCare >= 1`、距阶段 1 至少 4 天（`minGapDays: 4`） | 卡带底下压着一张她年轻时的照片，背面铅笔写着一个日期。选择：放回去（什么都不发生）/ 拿去问她（她只说「哦，早了。」） | `flags.momCare = 2` |
| 3 | `Room`，她坐下来看你玩 | `dayMin:44`、`flags.momCare >= 2`、`save:{momTrust:70}`、`flag:'ch5'` | 傍晚她自己把小旋风插上，坐在你旁边。**这一局 `SB.Parent` 不 arm**：没有预警条、没有心跳、没有清算。玩完她说「行了，去洗手，吃饭。」 | `flags.momReconcile = true`；`momTrust +20`；回忆册条目 |

**阶段 3 的实现要点（唯一一处需要碰妈妈系统的地方）**：`RoomScene.armMom()` 现在的判定是 `if (SB.Save.d.__nomom) return;`。在它前面加一条 `if (SB.Save.d.flags.momSitIn) return;`，并在这一局的 `Play` 退出回 `Room` 时把 `momSitIn` 清回 false。**`SB.Parent.resolve()` / `arm()` / `update()` 一行不改**。同时 `PlayScene.create()` 里那段 `if (!this.atFriend && !SB.Save.d.__nomom)` 的 arm 判定也要加上同一个 flag —— 漏了这处，玩家进了游戏她还是会来，整段情绪废掉。

---

## 8. 结局与自由怀念模式

### 8.1 现有结局链路（一行不改的部分）

`RoomScene.doorMenu()` → 「睡觉」→ `sleep()` → `SB.Time.isLastDay()`（`day >= 48`）为真 → `SB.UI.interlude(SB.L.ending.body)` → `scene.start('Album', { from:'Room', ending:true })` → `AlbumScene.create()` 的 `ending` 分支：`bgm_ending`、`flags.finished = true`、`unlockAlbum('ending', '8 月 31 日', ...)`、`SB.UI.interlude(this.endingLines())` → 回调里翻开册子。

### 8.2 新结构怎么衔接

在 `AlbumScene` 的 `endingLines()` interlude **回调里**插入 L3，然后才 `self.busy = false` 放开册子：

1. **L3-a 回迁**（3 秒）：一个全屏色块从暖色 tween 到冷蓝灰，一条旁白。无动画预算，就是一次 `tweens.add` 改 `fillColor` 与 `alpha`。
2. **L3-b 出租车后座**（`SB.UI.interlude` 三条）：窗外是小区门口，司机说「到了。」计价器停在那里。
3. **L3-c 结局变体**（§8.3，`SB.UI.interlude` 3–5 条）。
4. **L3-d 二选一**（`SB.UI.menu`，`cancelable: false`）：`结束（醒来）` / `继续怀念小时候`。

**二选一菜单的两个硬约束**：① 必须 `cancelable: false`（现有 `menu` 支持），否则玩家按 B 取消会卡在一个没有出口的结局屏上 —— `TitleScene` 的注释里已经写过这个坑；② 「没有默认高亮项」这个设计在现有 `menu` 组件里做不到（`cur` 初始为 0 且必然有光标），**降级为：两项顺序随机**（每次进结局屏随机决定谁在上面）。这个降级要写进文案评审的备注里。

| 选项 | 存档结果 | 之后的行为 |
|-|-|-|
| 结束（醒来） | `flags.awake = true`、`flags.finished` 保留、`flags.endingVariant` 已写入 | 回 `Title`。菜单第一项文案由「继续那个夏天」变成「回到那个夏天」（`hasSave` 分支里按 `flags.awake` 挑字符串）。读档进去还是 8 月 31 日那天，`isLastDay()` 为真，再睡一次会**再走一遍结局屏** —— 这是可接受的（等于重看结局），但要在 `AlbumScene` 里用 `story.seen['ending.l3']` 跳过 L3-a/b，直接给二选一 |
| 继续怀念小时候 | `flags.freeMode = true`、`day` 保持 48（不进 49）、`slot = 3`、`ap = 4`、`tvOn = false` | `scene.start('Room', { from:'freemode' })`，播一条旁白。`Title` 菜单新增一项「醒过来」（选它 → 直接进 `Album` 的 L3-d 二选一） |

### 8.3 四个结局变体（`SB.Story.endingVariant()`，自上而下命中即停）

| 变体 | 标题 | 条件（全部读现有字段，第 1 批就能做） | 最后一段的内容要点 |
|-|-|-|-|
| A | 打了个电话 | `flags.momReconcile === true` | 站在楼下雨里拨了一个号码，响四声。「妈，我到家了。」**唯一一个玩家说出话的结局** |
| B | 大衣柜最上层 | `caught >= 5` 且 `!flags.momReconcile` | 现有四句原文 + 一句「你后来再也没打开过那个大衣柜。」 |
| C | 十二张 | `carts` 里 `owned` 计数 `>= 10` | 手机里装了 12 个 rom，图标排一屏，一个也没点开 |
| D | 攒够了 | `money >= 30` 且 `stats.buys >= 5`（`owned.ownConsole` 本轮不做，见 §5.2） | 那台机器你 2026 年花 380 在二手网站买到了，拆开过一次没再动 |
| 默认 | 你还记得怎么哈那两口气 | 以上都不命中 | 现有四句原文，上楼，开门，黑屏 |

变体只替换 L3-c 这一段，**`endingLines()` 里那几句按数据现编的统计文案（卡带数、哈气数、被抓数）原样保留** —— 那是这个结局最有分量的部分。

### 8.4 自由怀念模式的规则

| 规则 | 实现落点 | 备注 |
|-|-|-|
| 时间不再终结 | `SB.Time.isLastDay()` 里加 `if (SB.Save.d.flags.freeMode) return false;` | 一行。`day` 继续 `+1` |
| 日历不再倒数 | `RoomScene.flavor('calendar')` 与 `SB.Time.dateStr()`：`freeMode` 且 `day > 48` 时显示「八月三十几日」而不是真实日期 | `dateStr()` 现在是 `new Date(2004,6,15) + day - 1`，day 到 49 会变成 9 月 1 日，必须拦一下 |
| 她还会来，但不再没收 | 在 `SB.Parent.resolve()` **返回之后**（不是之前）由调用方把 `padGone` 与 `cartSeized` 的写入回滚 | 位置很关键：放在 resolve 之前会让 `res.punish` 分支连台词一起消失，妈妈就变成布景了 |
| 卡带全开 | `SB.Economy.stockToday()` 里 `freeMode` 时忽略 rarity 门槛（`need` 一律给 0），价格算法不变 | 现有 `h >= need` 的确定性哈希不动 |
| 回忆册照常 | `unlockAlbum` 不变 | 漏掉的条目可以补 |
| 一行常驻小字 | `RoomScene` 里一个固定 `SB.Text`：「这一天不会结束」 | 提醒玩家现在是梦，不是通关奖励 |

---

## 9. 文案工作量估算与风格要点

### 9.1 数量与分布

| 板块 | 条数 | 说明 |
|-|-|-|
| 序章 12 镜 | 60–70 | 含 S-05 三个动作各 3 条、S-08 四条帖子各 1–2 条；最小 6 镜版约 30 条 |
| 主线五章 | 45–50 | 每章：起手 2 + 落幕 4 + 目标提示 2 + 回忆册 1；老王招呼语升档 4 |
| 支线 1–6 | 75–85 | 每条 3 阶段 × 每阶段 3–5 条 + 回忆册 1 |
| 妈妈线 | 25–30 | 三阶段各 6–9 条 + 选择分支 + 回忆册 1 |
| L3 醒来 + 四变体 + 自由模式 | 35–40 | L3-a/b 6 条、四变体各 4–6 条、二选一后的过渡 6 条、自由模式提示 4 条 |
| 妈妈四档台词扩写 | 12–15 | 现有 `SB.L.mom.caught` 只有 3 句、不分档；扩成按 `caught` 取 0 / 1 / 2–3 / >=4 四档，第四档只有旁白没有引号台词 |
| 系统与提示 | 15–20 | 章节名、目标 toast、跳过提示、回忆册标题与正文 |
| **合计** | **约 265–305 条** | 约 8000–11000 全角字；批次 1+2 的最小可玩集约 **110 条** |

### 9.2 两条硬性技术约束（写文案前必须知道）

1. **点阵字库只有 GB2312 一级汉字（3755 字）**。`tools/gen_font.py` 的 `build_charset()` 是 ASCII + 中文标点 + 一批符号 + `gb2312_level1()`，**二级汉字不在字库里，画出来是空白**。生僻字一律不许用（例：「踱步」的「踱」、「瓤」这类）。`keys_ui_test.js` 里的 `window.__missing(sceneKey)` 只能查「此刻显示在场景里的文字」，覆盖不到剧情文本的绝大部分 —— 所以本轮**必须新增一个静态缺字检查脚本**（见 §11）。
2. **对话框容量**：`SB.UI.dialog` 的面板宽 448、高 62，正文可用宽度 424px，12px 点阵下一行约 35 个全角字，最多 3 行（带 `speaker` 时只剩 2 行）。`SB.UI.interlude` 的可用宽度是 400px（约 33 字/行），纵向居中无硬限制但建议 ≤ 5 行。**单条文案控制在 60 个全角字以内**，超了要么被截断要么顶到框外。

### 9.3 风格要点（延续现有写法，不另起风格）

- **克制，不解释情绪**。现有正例：「你敲了敲缸壁。鱼慌了一下，又继续转圈。」——只写动作，不写「你有点无聊」。妈妈线阶段 1 的 4 秒静默、被抓第四档的「她不说话」，都是同一个手法。
- **具体的名词代替形容词**。现有正例：「暖水瓶。铁皮上的红花掉了漆，木塞子塞不严了，一直在冒白气。」——2004 年的质感靠物件清单堆出来，不靠「怀旧」这个词。序章写 2026 也照这个来：「发布完成 100%」「耗时 6 小时 12 分」「预计等待 14 分钟 · 前面还有 3 人」。
- **大人的话是短句，且不解释**。现有正例：「「这次考得还行。」你妈从围裙口袋里掏出几张纸币。」——引号里越短越像真人。妈妈四档台词的核心变化是**从提问变成不提问，最后不说话**，不是「越骂越狠」。
- **两个免费的回声点必须保留**（成本几乎为零，是整个叙事最值钱的两处）：① 序章 S-09 的最高赞评论「我妈把它收在大衣柜最上面，后来搬家搬没了。」是现有结局文案「你妈把小旋风收进了大衣柜的最上层」的镜像；② `flags.awake` 之后 Title 第一项从「继续那个夏天」变成「回到那个夏天」。

---

## 10. 实施顺序与批次

### 批次 1 · 只读剧情层（**不动存档结构**，最快看到效果）

- **做什么**：新建 `src/data/story.js` + `src/data/storyLines.js` + `src/systems/story.js`（只实现 `test()` / `chapterNow()` / `endingVariant()` 三个**纯读**函数）。章节名接到挂历 flavor 与回忆册摘要行；四个结局变体接到 `AlbumScene.endingLines()`（条件全部只读 `caught` / `momTrust` / `carts` / `money` / `stats.buys`）；老王与张老板的招呼语按 `day` 与 `stats` 分档（纯读）。
- **产出的可玩变化**：翻挂历能看到「第三章 · 哈两口气」和章节目标；打到结局会拿到四种不同的结尾之一；集市摊主会随着你玩到中后期换话。
- **工作量**：小（1–2 天）。存档零改动，`save.js` 一行不碰。
- **风险**：低。唯一要注意的是新文案的缺字与截断 —— 所以静态缺字脚本要在这一批就建好。

### 批次 2 · 存档 v2 + 主线五章引导层

- **做什么**：`save.js` 升 `VER = 2` + 放宽 `load()` 判定 + `migrate()`；`def()` 里加 `story` 对象与 §5.2 的 flags/stats 默认值；`SB.Story.dailyTick()` 接到 `SB.Time.sleep()` 末尾；`RoomScene.afterEnter()` 里接待播队列；五章的起手与落幕演出（`SB.UI.interlude`）与五条回忆册条目；`stats.blowsPerfect` 在 `RepairScene` 侧统计。
- **产出的可玩变化**：48 天有了章节节奏，每章完成有一段落幕文本和一条回忆册条目；老档能无损升级。
- **工作量**：中（3–4 天，其中一天专门给老档回归）。
- **风险**：**最高的一批**。`load()` 判定漏改会格式化所有老档；落幕演出的播放点如果塞进 `sleep()` 的 interlude 回调里会和现有 interlude 打架；`dayRolled` 与 `story.seen` 混用会导致重播。

### 批次 3 · 序章 `PrologueScene`

- **做什么**：新场景 + 12 镜数据 + 跳过 + 回忆册常驻重看条目 + `TitleScene.enter()` 分流 + `main.js` / `index.html` / `test-game.html` 注册。
- **产出的可玩变化**：新玩家从 2026 的加班夜开始，走完约 4 分钟进 2004；老玩家和跳过的玩家一切不变。
- **工作量**：中（3 天，其中文案 1 天）。
- **风险**：中。新场景漏注册会白屏（`main.js` 的自查会给出明确报错）；`seenIntro` 与 `flags.prologue` 双字段容易出现「序章跳过了但 `SB.L.intro` 又放一遍」或「两段都没播」；Title 的 hint 断言容易被新文案撞挂。

### 批次 4 · L3 醒来 + 自由怀念 + 妈妈线 + 2–3 条支线

- **做什么**：`AlbumScene` 的 L3 四段与二选一；`isLastDay()` 短路、`dateStr()` 的 day > 48 处理、`stockToday()` 全开、惩罚回滚；`Title` 的「醒过来」与「回到那个夏天」；妈妈线三阶段（含 `momSitIn` 在 `RoomScene.armMom()` 与 `PlayScene.create()` 两处的豁免）；按 §13 问题 5 的结论挑 2–3 条支线做完整任务链。
- **产出的可玩变化**：结局有了落点和出口，「还想再待一会儿」有了正式模式；妈妈线走通能拿到结局 A。
- **工作量**：中偏大（4–5 天）。
- **风险**：中。`freeMode` 下 `day` 无限增长的显示问题；惩罚回滚的位置放错会让妈妈变布景；`momSitIn` 只改一处会让和解那一局仍然出现预警条。

---

## 11. 测试策略

### 11.1 现有套件会被打破的地方（逐个给结论）

| 套件 | 会不会被打破 | 为什么 / 要怎么改 |
|-|-|-|
| `systems_test.js` | **会**（第 32 行） | 它写 `{v:1, day:5, money:7}` 并断言 `day === 5`。批次 2 之后这条会走 migrate 路径，断言应仍然通过；**必须补断言** `d.v === 2 && d.flags.prologue === true && d.day === 5`。同时新增「v:3 未来档不清档」「连续两次 load 不重复迁移」两条 |
| `flow_test.js` | 不会 | 直接 `scene.start('Room', {from:'test'})`，绕过 Title 门禁。**保险起见在 harness 里补一行 `S.Save.d.__nostory = true`** |
| `flow2_test.js` | **会**（结局用例，第 293 行起） | 它把 `day` 推到 48、`slot = 4`，走门口菜单睡觉，然后断言 `flags.finished` 与 `album`。批次 4 之后 `Album` 里多了 L3 的三段 interlude 与一个不可取消的菜单，脚本会在菜单前超时。改法：在断言 `finished` 之前多点几次 A 走完 L3，然后断言二选一菜单出现（`SB.__menu.debug().labels` 含「醒来」与「继续怀念」），再选「结束（醒来）」并断言回到 `Title` |
| `flow3_test.js` | 基本不会 | 集市砍价 / 双打 / 写作业三条，都不经过剧情门禁。批次 4 的自由模式会改 `stockToday()`，但 `freeMode` 默认为 false，砍价用例不受影响。补 `__nostory = true` |
| `settings_test.js` | 不会 | 它是按 label 正则 `/设置/` 找菜单项的，Title 菜单加项也不会错位。**这是好设计，新用例也照这个写，不要用固定 index** |
| `keys_ui_test.js` | **会**（两处） | ① Title 的 hint 有 `shown === full`（不许截断）和 `!/返回/` 两条断言 → 序章提示只能放菜单 `sub`，不能放 hint；② 缺字巡检的场景列表要**加上 `Prologue`**，否则新场景的字没人查 |
| `play_integration.js` | 不会 | 直接 `scene.start('Play')`。补 `__nostory = true` |
| `deployed_smoke.js` | 需要小改 | 它断言 `/Title|Room|Boot/` 之一 —— 新增 `Prologue` 后线上冒烟可能落在序章。把正则加上 `Prologue` |

### 11.2 新增用例

| 脚本 | 覆盖什么 | 关键断言 |
|-|-|-|
| `tools/gametest/migrate_test.js`（**最重要**） | 老档迁移 | §5.5 的 M-1 ~ M-6 六条全部落地 |
| `tools/gametest/prologue_test.js` | 序章可跳过与重看 | ① 新档从 Title 选「开始这个暑假」落到 `Prologue`；② 按 B 能跳到 `Room` 且 `flags.prologue === true`、`flags.prologueSkipped === true`、`SB.L.intro` 仍然播了；③ 再开一次不进 `Prologue`；④ `v:1` 老档读档后不进 `Prologue`；⑤ S-10 / S-11 两镜按 B 无效；⑥ 从 `Album` 的常驻条目重看，结束回 `Album` 且**存档字段一个都没变**（进出各拍一次 `JSON.stringify(Save.d)` 比对） |
| `tools/gametest/story_test.js` | 章节与支线状态机 | ① 直接把 `day` 推到 5 / 14 / 26 / 38 / 48 各跑一次 `SB.Time.sleep()`，断言 `flags.ch1..ch5` 依次置位且**每个只置一次**（连跑两天不重复解锁回忆册）；② 第四章的「或」条件：`day = 8` + `caught = 2` 时也能起手；③ 支线阶段的 `minGapDays` 生效（同一天不能连推两阶段）；④ 妈妈线阶段 3：构造 `momCare=2`/`day=44`/`momTrust=70`，进 `Play` 后断言 `SB.Parent.state === 'idle'`，退出后 `flags.momReconcile === true` 且 `flags.momSitIn === false` |
| `tools/gametest/ending_test.js` | 四变体 + 自由模式 | ① 四种存档各命中对应变体（断言 `flags.endingVariant`）；② 选「继续怀念」后 `flags.freeMode === true`、`day` 仍是 48、第 49 天 `sleep()` **不进 `Album`**；③ 自由模式下被抓后 `padGone === 0` 且 `res.lines` 仍非空（惩罚回滚位置对不对，就靠这一条）；④ 选「结束（醒来）」后回 `Title` 且第一项文案是「回到那个夏天」 |
| `tools/lint_lines.py`（新增，非 Playwright） | 文案静态检查 | 扫 `src/data/lines.js` + `storyLines.js` + `story.js` 里的全部中文字符串，对着 `assets/font/pix12.xml` 的 char 表查缺字；同时按 `SB.Text` 的度量算宽度，报出「超过 35 全角字」和「超过 3 行」的条目。**这个脚本必须在批次 1 就建好**，否则 300 条文案写完再查会返工 |

### 11.3 回归节奏

每批交付前跑：`systems_test` → `flow_test` → `flow2_test` → `flow3_test` → `settings_test` → `keys_ui_test` → `play_integration`，加上本批新增的脚本与 `lint_lines.py`。批次 2 额外要求：用一份**真实玩过的 v1 存档**（不是构造的）跑一次 `migrate_test`。

---

## 12. 风险清单（按严重程度排）

| # | 风险 | 影响 | 缓解办法 |
|-|-|-|-|
| 1 | **存档迁移炸档**：`load()` 只认 `d.v === 1`，把 `def().v` 改成 2 而忘了放宽判定，所有老档静默变新档 | 灾难级。玩家整个夏天的进度凭空消失，且没有任何报错 | ① 判定放宽 + `migrate()` 链式写法（§5.3）；② `migrate_test.js` 六条用例，其中一条用真实老档；③ 批次 2 单独一轮回归，不和其他批次合并发布；④ 迁移成功后立刻 `save()` 落盘，避免反复迁移 |
| 2 | **剧情把沙盒自由度锁死**：章节变成关卡，玩家因为没完成第二章而进不到第三章 | 严重。毁掉这个游戏唯一的核心体验 | ① 所有章节目标都是**可选**，`sleep()` 的换日不看任何剧情条件；② 所有支线 `optional: true`，只影响回忆册与结局变体；③ 剧情副作用统一走 `SB.Story.grant()`，方便一键关掉；④ 保留 `__nostory` 调试短路 |
| 3 | **序章拖长，玩家进不到核心玩法**：12 镜、40–60 秒等待条，第一次玩的人在 2026 里耗光耐心 | 严重。新玩家流失全在开局 | ① 等待条从 40–60 秒砍到 18 秒且期间有内容可点；② 第一次就能跳（跳过键 + 右上角常驻按钮 + 菜单 `sub` 里的时长提示）；③ 只有 S-10/S-11 两镜（共 6 秒）不可跳；④ 批次 3 上线前做一次真人计时，全程超过 5 分钟就砍镜 |
| 4 | **文案量过大导致烂尾**：265–305 条写到一半没劲了，游戏里一半章节有落幕一半没有 | 严重。半成品比没有更糟 | ① 批次 1 只需 40 条就能出效果（章节名 + 结局变体 + 摊主分档）；② 每批的文案是**自包含**的，缺后面的批次不影响前面；③ `story.js` 结构与 `storyLines.js` 文案分离，允许「结构先占位、文案后填」，缺文案时 `SB.line()` 返回空串而不是崩溃 —— 但要在 `lint_lines.py` 里把空串报成告警 |
| 5 | **`momSitIn` 只改一处**：`RoomScene.armMom()` 加了豁免但 `PlayScene.create()` 没加 | 中。妈妈线阶段 3 的和解那一局仍然出现预警条与心跳，整段情绪彻底废掉 | `story_test.js` 里那条「进 `Play` 后断言 `SB.Parent.state === 'idle'`」就是专门抓它的 |
| 6 | **自由模式的惩罚回滚位置放错**（放在 `resolve()` 之前而不是之后） | 中。妈妈进门后什么都不说，从一个角色退化成布景 | `ending_test.js` 的「`padGone === 0` 但 `res.lines` 非空」双断言 |
| 7 | **`freeMode` 下 `day` 无限增长**：`dateStr()` 会把第 49 天算成 9 月 1 日、第 60 天算成 9 月 12 日 | 中。玩家看到「9 月 12 日」，梦立刻破了 | `dateStr()` 与挂历 flavor 在 `freeMode && day > 48` 时改走固定文案；`ending_test` 里把 `day` 推到 70 截一张图人工看 |
| 8 | **点阵字库缺字**：GB2312 一级之外的字画出来是空白 | 中。玩家看到句子中间开个洞 | `lint_lines.py` 在批次 1 就建好，进 CI 前必跑；`keys_ui_test` 的缺字巡检列表加 `Prologue` |
| 9 | **文案超出对话框**：单条超过 3 行被截断，或超过一行的 hint 被砍掉 | 低到中 | `lint_lines.py` 的宽度检查；hint 一律只放一句短的 |
| 10 | **`flags` 变垃圾场**：七八个剧情 flag 和 `dayRolled` / `hot` / `blocked` 混在一起，某天有人往 `sleep()` 的重置列表里手一抖多加一个 | 低但难查 | 数值与对象型状态全部放独立的 `story` 对象；`flags` 里只放布尔；在 `timeSystem.sleep()` 的重置段上方加一行注释写明「剧情 flag 不进这里」 |
| 11 | **v1 / v2 双版本分叉**：剧情只做在一边，另一边越来越落后 | 低但持续放血 | 见 §13 问题 1。技术上有利条件：v2 的 `src/core/save.js`、`systems/*`、`data/*` 与 v1 **完全一致**（`diff -rq` 只在 `const.js` / `text.js` / `ui.js` / `main.js` 与各场景上有差异），所以新增的 4 个文件可以**原文照搬**，只有 `PrologueScene` 里的 `SB.Text.add` 需要换成 v2 的 `SB.Text.ui`。**注意两版共用同一个 localStorage KEY**，同源部署时存档会互相覆盖 —— 这是一个已经存在的坑，做双版本前要先解决 |

---

## 13. 必须由你拍板的开放问题

### 问题 1：剧情先做在 v1 还是 v2，还是双版本同步？

- **A 只做 v1（`nianhong-fc`）**：代价是 v2 换皮版暂时没剧情，两版差距拉大；好处是所有测试套件都在 v1 目录下最全，迭代最快。
- **B 只做 v2**：代价是 v1 作为「像素原版」冻结在无剧情状态，而 v2 的 DOM 外壳（`src/v2/layer.js` / `shell.js`）会让序章的自由排版多花时间。
- **C 双版本同步**：代价是每个批次都要做两遍验收，工作量约 1.4 倍（不是 2 倍，因为数据文件可原文照搬）。
- **我的推荐：A，但从第一天就按「可移植」写。** 具体是：4 个新文件里不出现任何 v1/v2 专有的绘制调用，画面统一走 `SB.UI.*` 与 `SB.Text.add`；等 v1 的剧情全部验收通过，再一次性移植到 v2（预估 1–2 天，主要是 `PrologueScene` 的文本层换成 `SB.Text.ui`）。理由：双版本同步会让每个批次的验收成本翻倍，而剧情在设计上要反复改文案与节奏，改两遍最容易出现两版不一致的暗坑。**另外提醒：v1 和 v2 现在共用同一个 localStorage KEY，如果两版会部署在同一个域名下，这件事得先修。**

### 问题 2：序章做成「必看一次、之后可跳过」还是「开局就能跳」？

- **A 必看一次**：第一次进游戏强制走完约 4 分钟，之后（含重开新档）都能跳。代价是给第一次玩的人立了一道 4 分钟的门槛，而这个游戏的「好玩」全在 2004 层。
- **B 开局就能跳**：任何时候都能按 B 跳过。代价是大量玩家会直接跳掉整个现实层，「想家」这个主题的定价基础没了，后面结局的回声点全部落空。
- **C 折中**：不可跳的部分只保留 S-10/S-11 那 6 秒眨眼与色调迁移，其余全程可跳；同时在跳过后**给一条 3 行的摘要旁白**（「你在出租车上睡着了。」），保证跳过的人也知道自己为什么在 2004 年。
- **我的推荐：C。** 理由：A 的门槛在一个「个人游戏、朋友之间传播」的场景里代价太高（第一次点开就要看 4 分钟没有交互的东西，很多人会关掉）；B 会让整个序章的投入白费。C 的实现成本只比 B 多 3 条文案。

### 问题 3：序章的操作强度——纯点击推进对话，还是要有轻交互？

- **A 纯点击**：全部 12 镜都是 `interlude` / `dialog`，玩家只按 A。代价是 4 分钟没有任何决策，体感像看片头。
- **B 轻交互**：S-02（关电脑）、S-04（确认呼叫）、S-05（等车时刷手机/看雨/走走）、S-08（划手机点帖子）四镜用 `SB.UI.menu`，其余纯点击。代价是多写约 15 条文案，多 0.5 天工。
- **我的推荐：B。** 理由：这四个交互全部能用现有的 `SB.UI.menu`（含 `keepOpen` 模式）实现，不需要新组件也不需要动画；而「你自己动手关掉那台电脑」和「系统告诉你你关了电脑」在情绪上完全是两件事。这 0.5 天是整个序章性价比最高的投入。

### 问题 4：主线是否强制推进（到第 X 天必须触发），还是纯玩家触发？

- **A 强制推进**：到第 6 / 15 / 27 / 39 天，不管玩家做了什么，章节都起手。好处是每个玩家都能走完五章，叙事完整。代价是可能出现「第三章讲你成了修卡老手，但玩家其实一次都没修过卡」的错位。
- **B 纯玩家触发**：全部靠行为条件（修过 3 次卡才起第三章）。好处是章节永远贴合玩家实际经历。代价是佛系玩家可能 48 天只看到两章，剧情等于没做。
- **C 混合（方案原设计）**：起手用「天数 **或** 行为」的或条件（第四章就是 `day >= 27` 或 `caught >= 2`），完成目标纯靠行为、且完成与否都不阻塞。
- **我的推荐：C。** 理由：起手保证叙事节奏不断线，完成保证不说假话——玩家没修过卡就不会拿到「手艺」那条回忆册。这也是 §6 那张表已经按此设计的原因。**唯一需要你确认的是错位的容忍度**：C 之下确实会出现「第三章起手了，但玩家还没怎么修过卡」，我的处理是**起手文案写成疑问句而不是陈述句**（不说「你已经是老手了」，而说「你开始琢磨那两口气到底该哈多久」）。

### 问题 5：七条支线这轮全做，还是先做 2–3 条？

- **A 七条全做**：约 100 条文案 + 5 个场景的挂载点，比批次 4 多出 3–4 天。风险是最后两条会赶工。
- **B 先做 3 条**：妈妈线（`momline`）+ 假卡的真相（`fakecart`）+ 借出去的那张（`lentcart`）。理由：妈妈线是唯一通向结局 A 的线、是整个 v2 的情绪主轴，不做等于没做；`fakecart` 挂在集市，是玩家一定会去的地方，且它给的「大人也会不好意思」是这个游戏少见的成人视角；`lentcart` 挂在发小家，奖励（2P 手柄）能实际改变玩法。剩下四条（二楼的胖子、电风扇、表哥来了、最后三十二页）留到下一轮。
- **C 先做 2 条**：只做妈妈线 + 假卡的真相。
- **我的推荐：B。** 理由：三条覆盖了三个不同场景（家 / 集市 / 发小家）和三种不同情绪，玩家的感受是「这个世界到处都有事」；只做 2 条会让集市之外的地方显得空。**「二楼的胖子」建议明确砍到下一轮**——它是七条里唯一需要新挂载点（门口菜单加一项 + `Friend` 场景换色复用）的，性价比最低。

### 问题 6：老存档怎么处理——自动迁移进新剧情结构，还是提示「新剧情需要新开一档」？

- **A 自动迁移 + 静默追认章节**：老档按 `day` 把该起的章节标成已完成，不播落幕、不解锁那几条回忆册，从下一章开始正常。代价是老玩家永远看不到前几章的落幕文本（但那些日子他们本来也过完了）。
- **B 自动迁移 + 不追认**：老档 `story.chapter` 从 0 开始判定，第 30 天的玩家会在第 31 天收到第一章起手。代价是穿越感很强。
- **C 提示新开一档**：读档时告诉玩家「新剧情从头玩才完整」，让他自己选。最诚实，但要多做一套「老档不启用剧情」的持久状态，且大多数玩家会选继续老档，等于剧情对他们不存在。
- **我的推荐：A。** 理由：这是个人游戏，玩家很可能只有一档、而且是玩到一半的；让他丢档或者看着穿越剧情都不好。A 唯一的缺点（看不到前几章落幕）可以用一条一次性提示补偿：「这个夏天你已经过了 30 天了。前面那几章就当你自己记着。」

### 问题 7：「继续怀念小时候」模式的边界——无限自由玩，还是有个软收尾？

- **A 无限自由**：`day` 一直涨，永远不结束，日历只显示「八月三十几日」。好处是完全贴合「不让这一天结束」的设计意图。代价是这个模式没有任何出口感，玩家不知道该什么时候停，且 `day` 涨到 200 时所有基于 `day` 的确定性哈希（集市价格）行为都没验证过。
- **B 软收尾**：自由模式再玩 N 天（建议 12 天）后，某个晚上给一段「你在沙发上睡着了，梦里雨还在下」的旁白，并把「醒过来」这一项**提到 Title 菜单第一位**，但不强制。好处是给了一个自然的告别时机。代价是多 6 条文案与一个计数器（可以复用 `day - 48`，不用新字段）。
- **我的推荐：B。** 理由：「怀念」这件事需要一个结束的动作才成立，无限循环会把它变成「无尽模式」，主题反而散了。而且 B 顺手解决了 A 的技术隐患——`day` 实际上不会涨到很大。**要你确认的是那个 N**：我建议 12 天（差不多是一次完整的收集补漏），你也可以定 7 或 20。

### 问题 8：章节与支线完成，允许给数值奖励（钱 / 物品 / 信任度）吗？

- **A 只给情绪与回忆册**：章节完成只有落幕文本 + 回忆册条目，一分钱不给。好处是剧情层和数值系统彻底解耦，永远不会破坏现有经济平衡（价格表、48 天总收入约束）。代价是部分玩家觉得「做了半天没奖励」。
- **B 给小额奖励**：如 §7 表格里写的 `goods.swab +2`、`owned.pad2`、`momTrust ±`。代价是要重新估一遍 48 天的总收入曲线——现有设计里每天固定 0.5 元、随机事件 0.2–15 元，多给几件东西可能让后期的钱变得不值钱。
- **我的推荐：B，但设一条硬上限：整轮剧情给出的现金总额不超过 8 元，物品只给 `swab` 与 `pad2` 两种，`momTrust` 单次不超过 ±12。** 理由：完全不给会让支线显得像纯文本；但价格表和 `failChance` 是这个游戏最不该动的东西。所有奖励统一走 `SB.Story.grant()` 施加，方便你哪天改主意时一行关掉。

---

## 附录 A：设计方案与源码的事实校正

写代码时以这一列为准，设计方案里的旧名字不要照抄。

| 设计方案里的写法 | 源码事实 | 处理 |
|-|-|-|
| 摊主「老李」 | `MarketScene` 的 spot 是 `{ id:'lao', label:'卖卡带的老王' }`，文案键是 `SB.L.market.laoIdle` | 统一叫**老王** |
| 「张姨杂货摊」 | spot 是 `{ id:'zhang', label:'卖杂货的张老板' }` | 统一叫**张老板** |
| `owned.pad2` 作为支线奖励「他把 2P 手柄给你」 | `pad2` 已经是 `SB.GOODS` 里 8 元的商品「山寨 2P 手柄」；手柄数量另有 `Save.d.pads` | 支线置 `owned.pad2 = true` 且 `pads = 2`，不新建字段 |
| `stats.cleared` | `stats` 里没有这个键；通关信息在 `carts[id].cleared` | 现场计数，不新增字段 |
| `flags.hot` 累计 3 天 | `flags.hot` 每天被 `SB.Time.sleep()` 重置为 false | 累计数记在 `story.quests.fan.count`，在 `dailyTick()` 里累加 |
| `flags.friendVisit` 触发过 2 次 | 同上，每天被重置 | 累计数记在 `story.quests.lentcart.count` |
| `owned.ownConsole`（自己的一台小旋风，60 元） | 源码里没有这个物品，`SB.GOODS` 也没有 | 本轮不做；结局 D 用 `money >= 30 && stats.buys >= 5` 顶替 |
| 「菜单没有默认高亮项」 | `SB.UI.menu` 的 `cur` 初始必为 0 且必然渲染光标 | 降级为**两项顺序随机** |
| 「`settings.scanline` 打开」（序章 S-11） | `scanline` 是玩家在设置里自己调的持久选项 | 序章**不强改玩家设置**，只做底色 tween |
| 章节完成判定放在 `sleep()` 里、演出也在那里 | `sleep()` 已经是 `interlude → scene.start('Room')` 的结构 | 结算在 `sleep()`，**播放在 `Room.afterEnter()`**，中间靠 `story.pending` 传递 |
