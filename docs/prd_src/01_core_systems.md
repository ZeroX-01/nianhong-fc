> **与代码同步于：2026-09-19，save VER=3**
> 基准：仓库根目录。主 PRD 见 [`../PRD.md`](../PRD.md)。

# 《那年的红白机》核心与系统层技术文档

本章节整理自 `src` 下的核心层（Core）与系统层（Systems）源码，旨在清晰定义游戏的数据结构与逻辑公式。

## 1. 存档数据结构 (Save System)

存档通过 `localStorage` 存储，KEY 为 `nianhong_save_v1`（改名前是 `subor_summer_save_v1`，读不到新键时搬一次老键；新键一个字符都不能再改）。当前版本 `SB.Save.VER = 3`。系统具备版本平滑迁移策略：`load()` 只要读到带 `v` 字段的档就收（含 `v` 比当前更大的档），以默认值（`def()`）为基准递归合并（`merge()`），再按 `migrate(from)` 补语义。

**硬规矩**：数值与对象型状态一律不许塞进 `flags`。`flags` 的默认值是 `{}`，`merge()` 不会给它内部的键回填默认值，老档读出来是 `undefined`。剧情类状态集中在有显式默认值的 `story` 对象里。

### 1.1 主存档表
| 字段名 | 类型 | 含义 | 默认值 |
| :--- | :--- | :--- | :--- |
| `v` | Number | 存档版本号 | 3 |
| `day` | Number | 当前暑假第几天 (1-48) | 1 |
| `slot` | Number | 当前时段索引 (0-4) | 2 (下午) |
| `ap` | Number | 剩余行动精力 | 4 |
| `money` | Number | 持有现金 (元) | 3.5 |
| `inserted` | String | 当前插在卡槽的卡带 ID | `null` |
| `seated` | Boolean | 卡带是否插到底 | `false` |
| `fault` | String | 当前画面故障类型 (`SB.FAULT`) | `null` |
| `hidden` | String | 藏在沙发缝里的卡带 ID | `null` |
| `tvOn / bulbOn` | Boolean | 电视 / 电灯 开关状态 | `false` |
| `slotDirt` | Number | 主机卡槽积灰度 (0-100) | 22 |
| `pads` | Number | 手上有几个手柄 | 1 |
| `goods` | Object | 可堆叠消耗品计数（`swab` / `popsicle`） | `{swab:0, popsicle:0}` |
| `owned` | Object | 一次性物品（`avline` / `pad2` / `mag` / `fan` / `console2`） | `{}` |
| `homework` | Number | 今日作业完成度 (0-100) | 0 |
| `momTrust` | Number | 母亲信任度 (0-100) | 50 |
| `caught / escaped` | Number | 被抓 / 蒙过去的累计次数 | 0 |
| `padGone` | Number | 手柄被没收截止的日期 | 0 |
| `cartSeized` | String | 被没收的卡带 ID | `null` |
| `borrowedFrom` | String | 当前借来的卡带来自谁 | `null` |
| `seenIntro` | Boolean | 客厅开场文案播过没 | `false` |
| `story` | Object | 剧情状态（见 §1.3） | 见下 |
| `stats` | Object | 统计数据（`blows/rubs/reseats/slaps/repairs/boots/plays/buys/days`，抢救三档 `rescueClean/rescueClose/rescueFail`，运行时另加 `cleared`） | - |
| `flags` | Object | **只放布尔位**：`prologue`（序章看过没）、`prologueSkipped`、天热 `hot`、停电/暴雨 `blocked`、发小串门 `friendVisit`、课本摊开 `bookOpen`、妈出门 `momOut`、`examDone`、`momWarm`、`endingVariant` | `{prologue:false, prologueSkipped:false}` |
| `settings` | Object | `crt(0-2) / scanline / bgm / sfx / mic / shake` | `{1, true, 0.5, 0.8, false, true}` |
| `album` | Array | 解锁的「回忆」条目 | `[]` |

### 1.2 卡带实例数据 (`carts[id]`)
| 字段名 | 类型 | 含义 |
| :--- | :--- | :--- |
| `owned` | Boolean | 是否拥有（借来的卡另看 `borrowed`） |
| `dirt` | Number | 金手指灰尘/氧化度 (0-100)，影响开机率 |
| `wear` | Number | 金手指物理磨损 (0-100)，**永久不可逆** |
| `fake` | Boolean | 是否为假卡（板子劣质，故障率更高） |
| `borrowed` | Number | 剩余借用天数 (0 为自有) |
| `dead` | Boolean | 是否已物理损坏（报废） |
| `cleared / best / plays` | - | 通关过没 / 最高分 / 玩过几次 |
| `knownTruth` | Boolean | 假卡是否已被玩家看穿 |

开局默认拥有 `02`（铁甲坦克1990）与 `05`（100万合1）。

### 1.3 剧情状态 (`story`)
| 字段名 | 含义 | 默认值 |
| :--- | :--- | :--- |
| `mood` | 心情 0–100，不是资源条，只做叙事晴雨表 + 结局判定 | 60 |
| `moodDay / quietDays / playsMark` | 「今天闷不闷」的按天结算游标 | 0 |
| `lent` | 客厅那台是同事寄放的 | `true` |
| `dueDay` | 开学（= 要还机）的天数 | 48 |
| `told` | 「这台是借的」跟玩家交代过没 | `false` |
| `ownConsole / ownDay / ownPrice` | 自己那台二手主机买到没 / 哪天 / 多少钱 | `false` / 0 |
| `ledger` | 账本：`{day, today, total, saved, src:{}, legacy}`，`today/src` 每天清零 | - |
| `ending` | 命中的结局变体 id | `null` |

### 1.4 版本迁移 (`migrate`)
| 迁移 | 补的语义 |
| :--- | :--- |
| `from < 2` | 补 `lent/dueDay`；`told=false` + `legacyNote=true`（客厅用一句短的补设定，不重播开场）；按 `owned.console2` 追认 `ownConsole`；把手上的钱记成 `ledger.total` 并标 `legacy`；心情按 `60 - caught*5 + (momTrust-50)*0.3` 估初值（钳在 5–95） |
| `from < 3` | 一律 `flags.prologue = true`：老档的夏天早就开始了，半路插四分钟 2026 年的加班夜等于打断进度，想看的从回忆册第一条重看 |

---

## 2. 常量与枚举 (Constants)

逻辑分辨率 `SB.W × SB.H = 480 × 270`；电视画面区 `SB.SCREEN = {x:60, y:0, w:360, h:270}`；客厅电视 `SB.TV = {x:150, y:32, w:176, h:148, screen:{168,48,140,104}}`。

### 2.1 SB.FAULT 故障类型
| 键名 | 现象名称 | 对症手法 | 视觉/提示要点 |
| :--- | :--- | :--- | :--- |
| `SNOW` | 没信号 | `reseat` (重插) | 屏幕纯雪花，通常是物理连接问题；没插到底必出这个 |
| `GLITCH` | 花屏 | `blow` (哈气) | 彩条乱码，金手指氧化导致 |
| `ROLL` | 滚屏偏色 | `rub` (划桌子) | 画面垂直滚动、发绿，需要摩擦金手指 |
| `SHAKE` | 抖动横条 | `slap` (拍电视) | 物理抖动，经典的「物理维修」 |
| `RAINBOW` | 彩虹纹 | `puff` (吹卡槽) | 画面糊一层彩虹色，卡槽灰尘所致 |

### 2.2 SB.SLOTS 时段表
| 时段 Key | 名称 | 起始时间 | 妈在家的基础概率 |
| :--- | :--- | :--- | :--- |
| `morning` | 上午 | 09:00 | 0.75 |
| `noon` | 中午 | 12:30 | 0.90 |
| `after` | 下午 | 15:00 | 0.35 |
| `dusk` | 傍晚 | 17:30 | 0.55 |
| `night` | 晚上 | 20:00 | 0.95 |
*注：周末（周六/日）妈妈在家概率额外 `+0.3`（上限 0.96）。日期由 `SB.Time.date()` 从 2004-07-15 起推算，`flags.momOut` 可强制她不在家。*

---

## 3. 修卡系统 (Repair System)

修卡是游戏的核心博弈，所有操作都具有「过犹不及」的真实模拟特性。

### 3.1 核心公式
- **开机失败率 (`failChance`)**：
  ```js
  risk = dirt * 0.85 + slotDirt * 0.35 + wear * 0.75;
  if (owned.avline) risk -= 14;     // 换线减风险
  if (flags.hot && !owned.fan) risk += 12; // 主机过热加风险
  if (fake) risk += 18;             // 假卡劣势
  return clamp(risk / 160, 0.02, 0.95);
  ```
  卡带 `dead` 时直接返回 1。
- **故障抽取权重 (`rollFault`)**：
  未插好必出 `SNOW`；其他权重：
  - `GLITCH`: `10 + dirt * 0.7`
  - `ROLL`: `6 + dirt * 0.32`
  - `RAINBOW`: `3 + slotDirt * 0.75`
  - `SHAKE`: `4 + wear * 0.55 + (avline ? 0 : 9)`
  - `SNOW`: `5 + wear * 0.3`
- **每次开机的代价 (`attempt`)**：`stats.boots++`，卡带 `dirt + 0.6`，卡槽 `slotDirt + 0.4`。插拔本身就是消耗。

### 3.2 维修行为详情
- **哈气 (`blow`)**：
  - **力度区间**：`power < 0.3` (无效)；`power > 0.92` (变糟，`dirt + 7`)；`0.55-0.85` (最佳，系数 1，其余 0.55)。
  - **基础清洁量**：`dirt -= round(20 × eff × fatigue)`。
  - **递减效应**：同一次修卡反复哈气，`fatigue = max(0.35, 1 - (次-1) * 0.22)`（模拟水汽积累）。
- **擦拭 (`rub`)**：按同一次修卡内的累计划数分档。
  - 累计 `strokes <= 3`：`dirt -9` / stroke，`wear` 无增。
  - 累计 `4-5`：`dirt -4` / stroke，`wear +2` / stroke。
  - 累计 `> 5`：效果极差且剧烈磨损，`dirt -1` / stroke，`wear +7` / stroke。
  - `wear >= 72` 返回 `warn`（文案警告快磨废了）；`wear >= 100` 置 `dead`。
- **重插 (`reseat`)**：`dirt -3`、`wear +0.8`，并把「插到底」这件事重新做一次。
- **拍电视 (`slap`)**：同一次修卡内第 3 次起返回 `ok:false` 且带 `scold`（妈在厨房喊「别拍电视！」）。
- **吹卡槽 (`puff`)**：前两次 `slotDirt -18`，后续仅 `-5`。
- **棉签 (`swab`)**：消耗品，单次 `dirt -48`，无副作用，最强维修手段；没有棉签时直接返回失败。

### 3.3 视觉与描述分档
- 金手指（吃 `dirt`）：`<28` / `<64` / 其余 → 帧 0 / 1 / 2。
- 划痕（吃 `wear`）：`<12` / `<40` / `<72` / 其余 → 帧 0 / 1 / 2 / 3。
- `describe()` 给玩家看的两句：脏度四档（干净 / 有点发黄 / 氧化得厉害 / 几乎发黑）× 磨损四档（品相很好 / 有几道划痕 / 磨损明显 / 快磨废了）。

---

## 4. 时间与事件系统 (Time System)

### 4.1 推进规则
- **起点**：`START = new Date(2004, 6, 15)`，暑假 `summerDayCount = 48`（7/15–8/31）。
- **精力消费**：`spend(n)` 消耗 AP，当 AP 落到整数时（如 4->3），时段 `slot` 自动 +1。花 AP 的只有三件事：去集市、去发小家、写作业，各 1 AP。
- **换日 (`sleep`)**：`day++`、`slot=0`、`ap=4`、`homework=0`、关电视、重置 `momOut/blocked/hot/friendVisit/bookOpen` 这五个日常 flag；借来的卡带 `borrowed--`（归零且非自有则从卡槽/沙发缝里清走）；`padGone` 到期解除；发 0.5 元零花钱（走 `SB.Story.earn(0.5,'allowance')` 记账）；调 `SB.Story.dailyTick()`；最后 `rollEvent()`。
- **剧情状态一个都不许加进 `sleep()` 的重置列表**——它们要跨天累计，要按天结算的走 `dailyTick()`。

### 4.2 随机事件表 (`rollEvent`)
每天睡觉后 68% 概率触发随机事件（32% 什么也不发生）：
| ID | 文案要点 | 效果 | 门槛 |
| :--- | :--- | :--- | :--- |
| `trash` | 收废品（瓶子纸箱） | `money +0.5~1.5` | - |
| `bottle` | 退酒瓶 | `money +0.8~2.0` | - |
| `errand` | 帮小卖部搬汽水 | `money +1.0~2.5` | - |
| `books` | 卖旧课本和废报纸 | `money +1.5~3.0` | - |
| `soy` | 打酱油零钱 | `money +0.2~0.6` | - |
| `find` | 沙发缝里摸到一张纸币 | `money +0.5~2.0` | - |
| `rain` | 暴雨拔插头 | `flags.blocked = true` (禁玩) | - |
| `blackout` | 停电 | `flags.blocked = true` (禁玩) | Day 4+ |
| `hot` | 天热 | `flags.hot = true` | - |
| `friend_come` | 发小串门 | `flags.friendVisit = true` | Day 3+ |
| `exam` | 考得不错 | `money +5~15` | Day 6+ & 仅一次 |
| `cousin` | 表哥来教秘技 | 纯文案（`money [0,0]`） | - |

所有进账都经 `SB.Story.earn(v, ev.id)`，账本才看得见钱是哪儿来的。

---

## 5. 经济系统 (Economy System)

### 5.1 价格与库存
- **卡带浮动算法**：基于 `day` 与 `cart.id` 的确定性哈希 `(day*73 + id*149) % 100`，同一天进出集市价格不变。
  - `swing`：基准价 ±17% 波动。
  - `rarity`：每比 2 级高 1 级，额外加价 4%。下限 ￥2。
- **杂货价格 (`priceOfGood`)**：一口价的东西（棉签、冰棍、AV 线、杂志、风扇、2P 手柄）价格表写死；只有标了 `vary` 的大件——那台二手小旋风主机（`console2`，基准 ￥45）——按 `(day*97+41)%100` 做 ±9% 浮动，大致 41–49。
- **今日摊货 (`stockToday`)**：按 `(day*31 + id*17) % 10` 与稀有度门槛筛选（rarity≥4 需 ≥7，==3 需 ≥5，其余 ≥2），已拥有的不再上架；不足 2 张时补足到 2 张，不让玩家白跑一趟。
- **假卡逻辑**：成交时基于 `cart.fakeChance` 判定。假卡外观更脏（`dirt + 20`，钳在 30–99），且可能包含空游戏或 Bug 游戏（数据层 `game: null/crash`）。成交同时把 `dirt` 重掷为 `startDirt + rnd(-8,12)`、`wear` 掷为 `rnd(0, startDirt/8)`。

### 5.2 砍价逻辑 (Haggle)
- **底价**：`ask × (0.72 + (rarity-1)×0.035 + rnd(0,0.06))`，稀有卡让得少。
- **耐心**：初始为 3。
- **判定**：
  - `Offer >= Floor`：直接成交。
  - `Offer >= Floor * 0.93`：摊主反要中间价，耐心 -1。
  - `Offer < Floor * 0.93`：拒绝，耐心 -2。
  - 耐心为 0 时谈崩，今日不可再买。
- **战果记账**：`noteHaggle(ask, deal)` 把差价交给 `SB.Story.saveUp()` 记进 `ledger.saved`——它不加钱，只是让「会砍价」这件事有个去处。

### 5.3 成交后的副作用
- 买卡：`owned=true`、`stats.buys++`、心情 `buyCart +6`（由场景侧调用）。
- 买杂货：`once` 类记进 `owned[id]`，可堆叠类 `goods[id]++`。
- 买 `console2` 时额外触发 `SB.Story.gotConsole(price)`——它不只是件商品，是这个夏天的目标。

---

## 6. 家长系统 (Parent System)

模拟妈妈回家查岗的紧张感。

### 6.1 状态机与参数
- **状态流转**：`idle` -> `armed` (启动) -> `w1` (预警1) -> `w2` (预警2) -> `w3` (临门一脚) -> `arrive` (清算)。
- **时长控制 (`eta`)**：
  - 妈在厨房 (`kitchen`)：26~52 秒；妈出门 (`out`)：52~116 秒。
  - **警觉修正**：`paranoia = 1 - min(0.3, caught * 0.06)`，被抓次数越多，时间缩短越明显。
- **预警时间点**：`w1`: 55%（厨房 = 鱼缸气泡 / 出门 = 楼下自行车铃）；`w2`: 82%（楼道脚步 + `heartbeat` 循环音）；`w3`: 95.5%（钥匙插锁）。
- **上弦线索**：`RoomScene.armMom()` 在上弦时给一句 toast（抽油烟机还在响 / 她拿布袋子下楼了），把「妈妈随机出现」变成「妈妈有迹可循」。

### 6.2 清算逻辑 (`resolve`)
门开时的硬条件只有两条：电视关了没、卡带拔了没。
- `tvOn` → `level 2`，`why='tv'`；否则 `inserted` → `level 1`，`why='cart'`；都干净则 `level 0`。
- **作业的两种**：`homework >= 60` 算真写（`hwReal`），只 `flags.bookOpen` 算装样子（`hwFake`，她会顺手翻两页发现还是三天前那一页）。
- **逃脱奖励**：`escaped++`，`momTrust +8 / +4 / +2`（真写 / 假摊 / 啥也没干），心情 `+5 / +3`。
- **被抓判定**：`caught++`，`momTrust` 扣 16（level 2）或 8（level 1），心情 -14 / -8，并当场用 `SB.L.story.busted.tv/.cart` 说明白漏了哪一步。
- **惩罚梯度** (`n = caught - (写了作业?1:0)`)：
  - `level 1` 或 `n <= 1`：罚写大字（`homework` 强行 100）。
  - `n == 2`：没收手柄（`padGone = day + 1`）。
  - `n >= 3`：没收卡带（`cartSeized` 取当前/藏着/第一张拥有的卡，`owned` 转 `false`）。
- 清算后一律 `tvOn=false`、`__momHome=true`：妈回来了，本时段结束。

### 6.3 玩家的应急操作 (`Parent.actions`)
`tvOff()` 关电视、`pullCart()` 拔卡、`hideCart(id)` 藏进沙发缝（会先从卡槽拔出来）、`openBook()` 把作业本摊开——最后这个只能让她少问两句，骗不过翻页。前三个现在基本不由玩家直接触发，而是由抢救段（§6.4）一步一步调用。

### 6.4 抢救那三下 (`src/systems/rescue.js`)
`SB.Rescue` 是纯规则层，不认识 Phaser：它只管三步走到哪、光标在哪、这一下算几档、最后算什么等级。界面、音效和输入路由都在 `PlayScene`。

- **三步定义**：`STEPS = [tv 关电视, cart 拔卡带, hide 塞沙发缝]`，每步一根左右扫的判定条，判中就调对应的 `Parent.actions`。
- **进入**：`start(auto)`。`auto=false` 是一、二级预警时玩家按 START；`auto=true` 是三级预警（钥匙插锁）自动进。
- **压力**：`press()` 由 `leftMs()`（妈妈剩余时间）算出 0~1。压力越大 **判定区越宽、光标越快**——手更忙，但不是更不可能。
- **判定**：`hit()` 返回 `perfect` / `ok` / `miss`。`perfect` 不罚；`ok` 进下一步并 `SB.Parent.t += 450`；`miss` 这一步重来并 `SB.Parent.t += 1100`。惩罚一律折成时间，不弹失败提示。
- **结算**：`finished()` 判完没完，`grade()` 给 `clean` / `close` / `bare`，`settle()` 把对应的 `stats.rescueClean / rescueClose / rescueFail` 记上。
- **期间的全局约束**（在 `PlayScene` 里实现）：小游戏不再 `update`、妈妈秒表照跑、A/B/START 全部被判定吃掉、暂停菜单和右上角「离开」封掉。

---

## 7. 剧情系统 (Story System)

`src/systems/story.js` 只做两件事：**算和记**。它不画任何东西，也不认识任何场景；场景问它「现在心情是哪个词」「离目标还差多少」，它答；谁挣了钱、谁被抓了、谁通关了，来这里报一声，它记。全部状态落在 `SB.Save.d.story`。

### 7.1 心情
- `mood()` / `moodBand()` / `moodWord()`：分档表 `SB.STORY.moodBands`——`≥85` 美得很、`≥68` 挺得劲、`≥45` 不咸不淡、`≥25` 有点闷、其余「一点劲都没有」。
- `addMood(why)` 走 `SB.STORY.moodDelta`：`caught -14`、`caughtCart -8`、`escape +3`、`cleared +12`、`buyCart +6`、`dead -10`、`quiet -8`、`momWarm +22`、`ownConsole +25`。也允许直接传数字（家长系统的「真写了作业」按 +5、重复通关按 +4 就是这么传的）。
- 心情不消耗、不阻塞任何操作，全场只以一个词露面，最后进结局判定。

### 7.2 账本
- `earn(v, src)`：记进 `ledger.today / total / src[src]` 再加钱（`src` 不在 `SB.STORY.ledgerNames` 里的归 `other`）。
- `saveUp(v)`：砍价省下的差价，只记不加钱。
- `todayRows()` / `todayTotal()`：心愿单照着念，按金额从大到小，最多显示 3 条。

### 7.3 目标与借来的那台
- `goalPrice()` 读 `console2` 当天浮动价，`goalGap()` 给差额，`gotConsole(price)` 置 `ownConsole` + 心情 +25 + 解锁回忆「自己的那一台」。
- `dueLeft()` = 还机剩余天数（`dueDay - day`）；`told()/markTold()/needLateNote()` 管「这台是借的」这句话讲过没（老档用 `lentLate` 一句补上，不重播开场）。

### 7.4 章节与每日结算
- `chapterNow()/chapterLine()` 纯读天数区间，不写任何状态：ch1 (1–5) 这台机器不是你的 / ch2 (6–15) 一块五能买什么 / ch3 (16–27) 哈两口气 / ch4 (28–38) 大衣柜最上层 / ch5 (39–99) 开学前还回去。
- `dailyTick()`（挂在 `SB.Time.sleep()` 里、`rollEvent()` 之前，让事件带来的心情归今天）：
  - 今天 `stats.plays` 没涨 → `quietDays++`；累计到 `QUIET_DAYS = 3` 则心情 `quiet -8` 并复位。
  - 被抓过（`caught > 0`）且 `momTrust >= WARM_TRUST = 78` → 一次性触发和解：`flags.momWarm`、心情 +22、解锁回忆「她自己把电视打开了」。

### 7.5 结局
- `endingBody()`：客厅最后一晚的正文，按 `ownConsole` 二选一（买到了看别人那台被搬走，没买到看柜子上空了一块）。
- `endingVariant()`：三个轴（买到没有 × 妈妈关系 × 心情），自上而下命中即停 → `own_warm` / `own_cold` / `lost_warm` / `lost_cold` / `default`，命中结果写进 `story.ending` 与 `flags.endingVariant`。
- `endingTail()`：两句「后来」，按买到没有分版。

### 7.6 心愿单
`wishItems()` 直接拿 `SB.UI.menu` 当纸片用（信息行 `disabled`，最后一行才是按钮）：今天进账 → 来源明细（≤3 条）→ 兜里一共 → 砍价省下（>0 才显示）→ 二手主机价格与差额 → 柜子上那台还剩几天 → 心情 → 章节 → 「知道了」。

---

## 8. 模块间依赖关系

- **Save (核心存储)**：所有系统通过 `SB.Save.d` 读写状态，是系统的唯一数据源。
- **Repair -> Save**：高频更新 `dirt`、`wear`、`stats`。
- **TimeSystem -> Save / Story / Economy / Parent**：控制全局步进；换日时调 `Story.dailyTick()` 与 `Story.earn()`；为经济提供随机种子（`day`）；决定家长系统的在家概率。
- **Parent -> Save / Story / Audio**：监控玩家的即时操作（`tvOff` 等），在 `resolve()` 时修改信任度、惩罚状态与心情。
- **Economy -> Save / Story / Data**：从静态表读取基准，向存档写入购买结果，并把砍价战果和「买到主机」这件事交给剧情层。
- **Story -> Save / Data**：只读 `SB.STORY`（表与常量）与 `SB.L.story`（文案），只写 `Save.d.story` 与回忆册；不认识任何场景。

---
*文档编制日期：2026-09-17*
*基于源码版本：nianhong-fc v1（save VER=3）*
