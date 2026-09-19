# 那年的红白机 — 内部 API 参考

> 与代码同步于：2026-09-21，save VER=4，Phaser 3.60

本手册只收录**代码里真实存在**的公开函数与属性，按模块（文件）分节，顺序与 `index.html` 的加载顺序一致。
架构、场景流转、加载顺序与"改代码前必读的坑"见 [ARCHITECTURE.md](ARCHITECTURE.md)。

阅读约定：

- 一切都挂在 `window.SB` 上，示例里的 `SB` 即全局命名空间。
- 参数写成 `name?` 表示可省略；`opts` 里只列**代码真正读取过**的键。
- 名字带前导 `_` 的（如 `SB.Audio._fade`）是内部实现，本手册标注但不建议外部调用。
- 场景类只列场景键名与 `init(data)` 的进场参数契约；场景内部方法数量大且会随布局调整，不作为稳定 API。
- 表格里的"返回"若为空即返回 `undefined`。

---

## 目录

- [顶层常量与工具（`src/core/const.js`）](#顶层常量与工具)
- [`SB.Save`](#sbsave)
- [`SB.Audio` / `SB.Mic`](#sbaudio--sbmic)
- [`SB.Input` / `SB.TouchPad`](#sbinput--sbtouchpad)
- [`SB.Text`](#sbtext)
- [`SB.UI`](#sbui)
- [`SB.CRT`](#sbcrt)
- [`SB.KeyGuide`](#sbkeyguide)
- [`SB.Time`](#sbtime)
- [`SB.Econ`](#sbecon)
- [`SB.Repair`](#sbrepair)
- [`SB.Parent`](#sbparent)
- [`SB.Rescue`](#sbrescue)
- [`SB.Story`](#sbstory)
- [`SB.Chore`](#sbchore)
- [`SB.GameBase` / `SB.extendGame` / `SB.Games`](#sbgamebase--sbextendgame--sbgames)
- [`SB.RepairAnim`](#sbrepairanim)
- [`SB.PayAnim`](#sbpayanim)
- [`SB.PROLOGUE_PAINT`](#sbprologue_paint)
- [数据表](#数据表)
- [场景](#场景)
- [运行期全局标记](#运行期全局标记)

---

## 顶层常量与工具

`src/core/const.js`

| 名称 | 类型 | 说明 |
|---|---|---|
| `SB.W` / `SB.H` | number | `480` / `270`。逻辑分辨率。 |
| `SB.SCREEN` | `{x,y,w,h}` | `{60, 0, 360, 270}`。小游戏画面区（4:3），左右各 60px 木框。 |
| `SB.TV` | `{x,y,w,h,screen:{x,y,w,h}}` | 客厅那台电视的外壳与屏幕内区。 |
| `SB.ROOM` | object | 客厅所有物件的摆放坐标，含 `sofaGap`（藏卡带的沙发缝，带 `w/h`）与 `consoleSlot`（主机顶面卡槽）。 |
| `SB.D` | object | 渲染层级：`BG=0` `WALL_ITEM=10` `TV_SCREEN=20` `TV_SCREEN_FX=24` `TV_BODY=30` `FURNITURE=40` `PROP=50` `CHAR=60` `FRONT_PROP=70` `FOCUS=80` `CRT=100` `HUD=120` `DIALOG=140` `TOUCH=160` `OVERLAY=180` `FADE=200` `TOP=220`。 |
| `SB.C` | object | 调色板，与 [PALETTE.md](PALETTE.md) 一致：`INK` `GREY1..8` `WHITE` `WOOD1..7` `RED1..5` `GRN1..5` `BLU1..5` `YEL1..4` `PUR1..4` `SKN1..4`。 |
| `SB.CART_TINT` | object | 卡带 id（`'01'..'12'`）→ 壳体染色。 |
| `SB.FAULT` | object | 五种画面故障：`SNOW` `GLITCH` `ROLL` `SHAKE` `RAINBOW`，每项 `{key, name, fix, hint}`；`fix` 取值 `reseat` / `blow` / `rub` / `slap` / `puff`。 |
| `SB.SLOTS` | array | 一天 5 个时段：`{key, name, time, momHome}`，依次为 `morning/noon/after/dusk/night`。 |

| 函数 | 返回 | 说明 |
|---|---|---|
| `SB.clamp(v, a, b)` | number | 夹取到 `[a, b]`。 |
| `SB.rnd(a, b)` | number | `[a, b)` 随机浮点。 |
| `SB.rndInt(a, b)` | number | `[a, b]` 随机整数（含两端）。 |
| `SB.pick(arr)` | any | 数组里随机一个。 |
| `SB.chance(p)` | boolean | `Math.random() < p`。 |
| `SB.money(v)` | string | 格式化金额，例 `SB.money(3.5) === '￥3.5'`。 |

---

## `SB.Save`

`src/core/save.js`。存档只有 localStorage 一处，键 `nianhong_save_v1`（改名前是 `subor_summer_save_v1`，第一次读档时自动搬过来，老键不删）；两个键都是文件内私有常量，不导出。

| 属性 | 说明 |
|---|---|
| `SB.Save.VER` | `3`。当前存档版本。 |
| `SB.Save.d` | 当前存档对象。`load()`/`reset()` 之前为 `null`。**全工程都直接读写它**，改完记得 `SB.Save.save()`。 |

| 方法 | 返回 | 说明 |
|---|---|---|
| `def()` | object | 造一份全新存档（含按 `SB.CARTS` 生成的 `carts` 表；开局白送 `'02'` 坦克与 `'05'` 合 1 卡）。 |
| `load()` | object | 读盘 → `merge(def(), 存档)` → `migrate(原版本)`。读不到/解析失败/隐私模式 → 直接开新档。 |
| `migrate(from)` | object | 版本迁移，只补"语义"。见 [ARCHITECTURE.md §7](ARCHITECTURE.md#7-存档与迁移)。 |
| `merge(base, saved)` | object | 递归以 `base` 为骨架合并；存档里多出来的键原样保留。 |
| `save()` | — | 写 localStorage，失败静默。 |
| `reset()` | object | 覆盖成新档并落盘。 |
| `exists()` | boolean | localStorage 里有没有档。 |
| `wipe()` | — | 删档。 |
| `cart(id)` | object \| undefined | `d.carts[id]`。 |
| `ownedCarts()` | array | 已拥有（含借来的）卡带的**定义**数组（元素来自 `SB.CARTS`）。 |
| `playableOwned()` | array | 已拥有且 `game` 字段非空的卡带定义数组。 |
| `has(goodId)` | boolean | 一次性物品有没有买过（`!!d.owned[goodId]`）。 |
| `addMoney(v)` | — | 加减钱（保留一位小数，不允许为负），内部自己 `save()`。 |
| `unlockAlbum(id, title, text)` | boolean | 解锁回忆册条目，同 `id` 只成功一次；成功时记下 `day` 并落盘。 |

### 存档字段（`SB.Save.d`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `v` | `3` | 存档版本。 |
| `day` | `1` | 第几天（暑假共 48 天）。 |
| `slot` | `2` | 当前时段下标（对应 `SB.SLOTS`，开局是下午）。 |
| `ap` | `4` | 今天剩余精力。 |
| `money` | `3.5` | 兜里的钱。 |
| `carts` | 按 `SB.CARTS` 生成 | 每张卡带 `{owned, dirt, wear, fake, borrowed, dead, cleared, best, plays, knownTruth}`。 |
| `inserted` | `null` | 卡槽里的卡带 id。 |
| `seated` | `false` | 是否插到底。 |
| `fault` | `null` | 当前画面故障（`SB.FAULT` 的键名字符串）。 |
| `hidden` | `null` | 藏在沙发缝里的卡带 id。 |
| `tvOn` / `bulbOn` | `false` | 电视 / 灯泡开着没。 |
| `slotDirt` | `22` | 主机卡槽里的灰 0–100。 |
| `pads` | `1` | 手柄数量。 |
| `goods` | `{swab:0, popsicle:0}` | 可堆叠物品计数。 |
| `owned` | `{}` | 一次性物品：`avline` `pad2` `mag` `fan` `console2`。 |
| `padGone` | `0` | 手柄被没收到第几天（0 = 没被没收）。 |
| `cartSeized` | `null` | 被没收的卡带 id。 |
| `homework` | `0` | 今天的作业完成度 0–100。 |
| `momTrust` | `50` | 妈妈的信任度 0–100。 |
| `caught` / `escaped` | `0` | 被抓 / 蒙过去的次数。 |
| `borrowedFrom` | `null` | 卡带借自谁。 |
| `seenIntro` | `false` | 客厅开场那段看过没。 |
| `story` | 见下 | 剧情状态集中地。 |
| `chores` | `{day:0, done:{}, slots:{}, owed:0, owedSrc:''}` | 主动干活的记录，见 [`SB.Chore`](#sbchore)。`done`/`slots` 按 id 记今天干过几回、在哪几个时段干的，跨天由 `SB.Chore.state()` 懒清零；**`owed` 不跨天清** —— 妈不在家时干的活，钱一定要到手。 |
| `flags` | `{prologue:false, prologueSkipped:false}` | **只放布尔位**。运行中还会出现 `momOut` `blocked` `hot` `friendVisit` `bookOpen` `examDone` `momWarm` 等。 |
| `stats` | `{blows, rubs, reseats, slaps, repairs, boots, plays, buys, days, rescueClean, rescueClose, rescueFail}` | 统计；`cleared`、`playMs` 由 `PlayScene` 运行时追加。`rescue*` 三个由 `SB.Rescue.settle()` 记。 |
| `settings` | `{crt:1, scanline:true, bgm:0.5, sfx:0.8, mic:false, shake:true}` | 设置。`SB.Input.wantTouch()` 另会读可选的 `touchPad`（`'on'`/`'off'`）。 |
| `album` | `[]` | 回忆册条目 `{id, title, text, day}`。 |

`d.story` 字段：`mood`（心情 0–100，默认 60）、`moodDay`、`quietDays`、`playsMark`、`lent`（客厅那台是借的，默认 `true`）、`dueDay`（默认 48）、`told`、`ownConsole`、`ownDay`、`ledger`（`{day, today, total, saved, src, legacy}`）、`ending`。迁移过来的老档还会有 `legacyNote`；买到主机后追加 `ownPrice`。

```js
SB.Save.load();
SB.Save.d.money += 1;      // 也可以用 SB.Save.addMoney(1)
SB.Save.save();
```

---

## `SB.Audio` / `SB.Mic`

`src/core/audio.js`。音源全部登记在 `assets/audio/manifest.json`；**任何缺失都静默降级成空操作**。

| 属性 | 说明 |
|---|---|
| `game` | `Phaser.Game`，由 `init()` 注入。 |
| `manifest` | `fetchManifest()` 拿到的 JSON（`{sfx:[], bgm:[]}`），失败为 `null`。 |
| `ready` | `init()` 之后为 `true`。 |
| `curBgm` / `curBgmKey` / `curBgmMeta` | 当前 BGM 的 Sound 对象 / key / manifest 条目。 |
| `loops` | `{key: Sound}` 正在播的环境循环音。 |
| `missing` | 播放时发现缓存里没有的 key 集合。 |

| 方法 | 返回 | 说明 |
|---|---|---|
| `fetchManifest()` | Promise | 拉 `SB.ASSETS.audioManifest`；**失败也 resolve**（`manifest = null`）。`main.js` 在建 `Phaser.Game` 之前调它。 |
| `queue(loader)` | number | 把 manifest 里的 `sfx`+`bgm` 排进 Phaser loader，每条同时挂 `.ogg` 和 `.mp3` 两个候选；返回排入条数。 |
| `init(game)` | this | 记下 game、置 `ready`、应用一次音量。 |
| `meta(key)` | object \| null | manifest 里那一条。 |
| `exists(key)` | boolean | 音频缓存里有没有。 |
| `vol()` | — | 按 `d.settings.bgm` / `d.settings.sfx` 重算当前 BGM 与所有 loop 的音量（设置页改完音量就调它）。 |
| `sfx(key, opts?)` | Sound \| null | 播一次。`opts`：`volume`、`rate`、`detune`。 |
| `loop(key, volume?)` | Sound \| null | 播环境循环音（同 key 重复调用返回已有的那个）。默认音量 0.35。 |
| `stopLoop(key)` | — | 停并销毁某条循环音。 |
| `stopAllLoops()` | — | 全停。 |
| `bgm(key, fade?)` | — | 换 BGM（同 key 且在播则什么都不做）。`fade === false` 时硬切，否则旧的 420ms 淡出、新的 600ms 淡入。 |
| `stopBgm()` | — | 等价于 `bgm(null, true)`。 |
| `locked()` | boolean | 浏览器音频还锁着没（`BootScene` 靠它决定要不要显示"点击开机"）。 |
| `_liveScene()` | Scene \| null | 内部：找一个还活着的场景来挂 tween。 |
| `_fade(snd, from, to, ms, onDone?)` | — | 内部：**tween 一个中间量再 `setVolume`**，不直接 tween Sound 对象——声音销毁后 Web Audio 节点为空，直接 tween 会报错。 |

`SB.Mic`（麦克风哈气，默认关闭，需在设置里授权）：

| 成员 | 说明 |
|---|---|
| `on` / `level` / `failed` | 是否开着 / 最近一次读数 0–1 / 授权或环境失败过。 |
| `enable()` | 返回 `Promise<boolean>`；申请麦克风并建 AnalyserNode。失败 resolve `false` 并置 `failed`。 |
| `disable()` | 停轨、关 AudioContext、清状态。 |
| `read()` | 返回 0–1 的"吹气强度"：低频均值高 **且** 低频占比高才算（说话/音乐会有更多高频结构）。 |

```js
SB.Audio.sfx('cart_insert');
SB.Audio.bgm('bgm_room');
SB.Audio.loop('fan_hum', 0.22);
scene.events.once('shutdown', function () { SB.Audio.stopLoop('fan_hum'); });
```

---

## `SB.Input` / `SB.TouchPad`

`src/core/input.js`。三路输入（键盘 `kb` / 实体手柄 `gp` / 屏幕手柄 `tc`）或运算成两个 Pad。

| 属性 | 说明 |
|---|---|
| `game` | `Phaser.Game`。 |
| `frame` | 真正重算过的帧号。UI 用 `bornFrame === SB.Input.frame` 躲开"把它打开的那一下按键"。 |
| `p1` / `p2` | Pad 对象，见下。 |
| `isTouch` | 有没有出现过触摸事件。 |
| `lastPointerAt` | 最近一次指针事件的时间戳。 |
| `src` | 最近真正用过的输入方式：`'key'` / `'touch'` / `'pad'`。 |
| `twoP` / `move1P` | 两层键位覆盖的开关状态。 |
| `CODE` / `CODE_2P` / `CODE_1P_MOVE` | 键码 → `'1a'` 这类"玩家号+键位"的映射表。 |
| `LABEL` / `LABEL_2P` / `LABEL_WASD` | 键位显示名表（按 `src` 分三套）。 |
| `PREVENT` | 需要掐掉浏览器默认行为的键码。 |

Pad（`p1` / `p2`）：

| 成员 | 说明 |
|---|---|
| `name` | `'1P'` / `'2P'`。 |
| `left` `right` `up` `down` `a` `b` `start` `select` | 当前是否按住（三路或运算的结果）。 |
| `just` | `{键位: 这一帧刚按下}`。 |
| `h` / `v` | 水平/垂直方向 `-1|0|1`（同时按住时右/下优先）。 |
| `kb` / `gp` / `tc` | 三路各自的原始状态。 |
| `hit` | 单帧插销：按下与松开落在同一帧也保证被读到一帧。 |
| `anyJust()` | 这一帧有没有任何键刚被按下。 |
| `merge()` | 由 `SB.Input.update()` 调用，合并三路并算出 `just`/`h`/`v`。 |

| 方法 | 返回 | 说明 |
|---|---|---|
| `init(game)` | — | 挂 window 级键盘/指针监听（**不用 Phaser 的 KeyboardPlugin**：那是每场景一份，场景一睡就丢状态）。`BootScene.create()` 调。 |
| `update()` | — | 每帧重算。**一帧只真的算一次**（多个场景都会调它，重算会把 `just.*` 提前清掉）。每个场景的 `update()` 第一行都应调它。 |
| `mapCode(code)` | string \| null | 键码 → `'1a'` / `'2left'`，按当前 `twoP` / `move1P` 选表。 |
| `reclaim(codes)` | — | 这几个键刚换了主人：清按下状态，避免"一个键卡在旧归属上"。 |
| `setTwoP(on)` | this | 双人同屏：WASD 交给 2P。**退场必须关。** |
| `setMove1P(on)` | this | 单人小游戏里 WASD 也是 1P 方向键（A 让给"往左"）。**暂停菜单打开时要关，退场必须关。** |
| `setSrc(s)` | this | 手动切换输入方式并广播 label 变更。 |
| `onLabels(fn)` | function | 注册"键位名字变了"的回调，**返回退订函数**（场景 `shutdown` 时调用）。 |
| `notifyLabels()` | — | 广播一次。 |
| `keyName(k, who?, brief?)` | string | 单键显示名。`k` ∈ `a b start select dir ud lr up down left right`；`who === 2` 给 2P 的名字；`brief` 时不带"或 WASD"那半截。 |
| `tip(parts, who?, brief?)` | string | 拼"动作 + 键名"提示行；`parts` 里的纯字符串原样输出。 |
| `anyOf(o)` | boolean | 这一路有没有任何键按住。 |
| `readGamepad(pad, out)` | — | 读一只实体手柄到 `out`（摇杆阈值 ±0.45；手柄 A/B 都当 A，X/Y 都当 B）。 |
| `clearTouch()` | — | 清掉两个 Pad 的触屏位与插销。 |
| `wantTouch()` | boolean | 该不该显示屏幕手柄：`settings.touchPad` 强制优先，否则触屏设备或窗口宽度 < 720。 |

`SB.TouchPad`：`new SB.TouchPad(scene, opts?)`

- `opts.player`：`2` 时驱动 `p2`（默认 `p1`）。
- `opts.start`：`false` 时不画 START 条。
- `opts.select`：真值时多画一条 SEL。
- 实例：`dpadHit`（`{cx, cy, half}`，十字键的实际命中方块，测试拿它对着边缘点）、`container`、`parts`；方法 `build()` `fallbackDpad(x, y)` `btn(x, y, key, label)` `bar(x, y, key, label)` `destroy()`。
- 十字键**画出来的十字和命中范围故意不一样**：命中是一整块 136×136 的方形，按手指相对轴心的方位算八向，不抬手也能从"上"滑到"右上"。

```js
if (SB.Input.p1.just.a) this.act();
this.hint.set(function () { return SB.Input.tip([['ud', '选'], ['a', '确认'], ['b', '返回']]); });
this.pad = SB.Input.wantTouch() ? new SB.TouchPad(this, { start: false }) : null;
```

---

## `SB.Text`

`src/core/text.js`。中文点阵字体，字号只有 **12** 和 **16** 两档（`pix12`/`pix16`）；字体缺失时退化成系统等宽字，游戏照跑。半角（ASCII 0x20–0x7e）算半宽，其余算全宽。

| 方法 | 返回 | 说明 |
|---|---|---|
| `ok(scene, size?)` | boolean | 这一档点阵字体在不在。 |
| `metric(size?)` | `{font, line, full, half}` | 12 → `{pix12, 14, 12, 6}`，16 → `{pix16, 18, 16, 8}`；其它值回落到 12。 |
| `width(str, size?)` | number | 像素宽（多行取最长那行）。 |
| `lines(str)` | number | 行数。 |
| `height(str, size?)` | number | 像素高。 |
| `wrap(str, maxW, size?)` | string | 按像素宽折行，返回带 `\n` 的字符串。 |
| `add(scene, x, y, str, size?, tint?)` | Phaser 文本对象 | 建文字（坐标会取整）。**优先用它，不要直接 `scene.add.text()`。** |
| `addWrapped(scene, x, y, str, maxW, size?, tint?)` | 同上 | `wrap` + `add`。 |
| `clamp(str, maxW, size?, maxLines?)` | string | 折行并限制行数，超出砍掉、末尾补 `…`（还会避免省略号紧跟在 `，、；：` 后面）。 |
| `typewriter(scene, obj, full, speed?, onDone?)` | `{done, skip(), destroy(), ev}` | 打字机。`speed` 是每字毫秒（默认 32）。`skip()` 立刻补完并触发 `onDone`；`destroy()` 只摘定时器。 |

---

## `SB.UI`

`src/core/ui.js`。全部组件在纹理缺失时用 `Graphics` 兜底。

| 方法 | 返回 | 说明 |
|---|---|---|
| `openMenus(scene)` | number | 这一屏还开着几个由 `menu()` 建的菜单。 |
| `idle(scene)` | boolean | 菜单、对话框、过场三者全空 = 玩家点什么都没反应。死屏兜底的判据。 |
| `panel(scene, x, y, w, h, dark?)` | 显示对象 | 九宫格面板（`panel` / `panel_dark`）。 |
| `button(scene, x, y, w, label, onClick, opts?)` | 见下 | 木纹按钮。`opts`：`sub`（右侧小字）、`tint`、`subTint`。 |
| `corner(scene, label, onClick, opts?)` | 同 `button` | 右上角常驻按钮。`opts`：`width`、`x`、`y`、`tint`、`depth`（默认 `SB.D.HUD + 4`）。 |
| `dialog(scene, lines, opts?)` | `{next(), close(), isOpen()}` | 底部对话框。`lines` 可为字符串或数组（数组元素本身也可以是数组，会走 `SB.line()` 随机取一句）。 |
| `menu(scene, opts)` | 见下 | 竖排菜单。 |
| `toast(scene, text, ms?)` | — | 顶部浮动提示。 |
| `hint(scene, text?)` | 见下 | 底部常驻单行提示条。`text` 可以是**函数**——输入方式一变会自动重算。 |
| `hud(scene)` | `{refresh(), show(v), destroy()}` | 顶部状态栏：日期、时段、精力、钱、卡带收集数。 |
| `focus(scene, opts?)` | `{at(x,y,w,h,name?), hide(), destroy()}` | 可交互物的高亮框。`opts`：`dim`（框外压暗的 alpha）、`label`（真值时显示名字牌）。 |
| `fadeOut(scene, ms?, cb?)` | rect | 淡出到黑（默认 300ms）。 |
| `fadeIn(scene, ms?)` | rect | 从黑淡入（默认 320ms），完成后自毁。 |
| `go(scene, key, data?)` | — | **标准换场**：淡出 260ms → `scene.scene.start(key, data)`。用 `scene.__going` 上锁并在 `shutdown` 解锁。 |
| `interlude(scene, lines, onDone?)` | `{skip()}` | 黑底白字过场，一行一按（A/START/点击）。 |

`button()` / `corner()` 返回：`{bg, txt, sub, zone, rect, setDepth(d), destroy(), setLabel(s), setSub(s), setVisible(v)}`。`rect` 是 `{x,y,w,h}`，自动化测试与布局自查要读它。

`dialog(opts)` 支持的键：`speaker`（说话人，可空）、`tall`（更高的框）、`dim`（`false` 时不压暗背景）、`dark`（深色皮）、`speed`（打字速度，默认 26）、`onDone`。
行为：A / START / B 或点击 → 没打完先补完，打完了翻下一行，最后一行关框并触发 `onDone`；开框那一帧的按键不算。场景 `shutdown` 时只清状态、**不触发 `onDone`**。

`menu(opts)` 支持的键：

| 键 | 说明 |
|---|---|
| `items` | `[{label, sub?, subTint?, disabled?, value?}]`。`disabled` 行会被光标跳过。 |
| `title` | 有标题时多 22px 标题区。 |
| `x` `y` `width` `rowH` `depth` | 默认居中、`width` 260、`rowH` 20、`depth` `SB.D.DIALOG`。 |
| `dim` | `false` 时几乎不压暗背景。 |
| `dark` | 默认深色皮，传 `false` 用木纹皮。 |
| `cur` | 开出来时光标停在第几项。 |
| `cancelable` | `false` 时 B / 点背景都不关（标题菜单靠它防死屏）。 |
| `keepOpen` | 选中后不自动关闭。 |
| `onPick(item, index, ctx)` | 选中回调。**`ctx.reopen(i?)` 用同一份 opts 把这个菜单原样端回来**，是子菜单退回父菜单的唯一正确方式（重复调用返回同一个实例）。 |
| `onCancel()` | 取消回调。 |

返回 `{close(), refresh(), isOpen(), setSub(i, s), debug()}`；`debug()` 给自动化测试用，返回 `{cur, labels, dis}`。菜单开着时会临时把 `scene.hint` 借去写"选/确认/返回"，关闭时原样还回。

`hint()` 返回 `{set(s), refresh(), setTint(c), text(), full(), raw(), visible(), show(v), destroy()}`。`text()` 是这一刻真显示出来的那行，`full()` 是本该显示的全文——**两者不一致说明提示被这行的宽度截掉了，应当当成 bug 改文案**。

```js
SB.UI.go(this, 'Shelf', { from: 'Room' });
SB.UI.dialog(this, SB.L.room.tvOff, { onDone: function () { self.busy = false; } });
this.focus = SB.UI.focus(this, { dim: 0.25, label: true });
this.focus.at(sp.x, sp.y, sp.w, sp.h, sp.label);
```

---

## `SB.CRT`

`src/core/crt.js`。同一套代码同时服务客厅里那台 140×104 的小屏幕和全屏 360×270 的游戏画面。

| 方法 | 返回 | 说明 |
|---|---|---|
| `SB.CRT.create(scene, rect, opts?)` | CRT 实例 | `rect` 是 `{x,y,w,h}`。`opts.depth`（默认 `SB.D.CRT`）、`opts.darkDepth`（把屏幕黑底单独压到画面之下，全屏玩游戏时必须给，否则黑底会糊住小游戏）。 |
| `SB.CRT.bezel(scene, depth?)` | Graphics | 全屏 4:3 画面区左右两侧的电视木框与喇叭孔（默认 `SB.D.CRT + 20`）。 |

CRT 实例：

| 成员 | 说明 |
|---|---|
| `on` | 开机状态标记（由使用者维护）。 |
| `fault` | 当前故障。 |
| `add(obj, dz?)` | 把一个对象纳入 CRT 的层管理。 |
| `build()` | 建全部特效层（构造时已调用）。 |
| `applyIntensity()` | 按 `d.settings.crt`（强度）与 `d.settings.scanline`（开关）重算各层 alpha。 |
| `powerOff(cb?)` | 关机：白条塌缩 + 全黑 + `tv_power_off`。 |
| `powerOn(cb?)` | 开机：一声"啵"，白线展开 + 白光横扫。 |
| `setFault(fault)` | `null` / `'SNOW'` / `'GLITCH'` / `'ROLL'` / `'SHAKE'` / `'RAINBOW'`。同时管雪花噪音循环与滚屏偏色。 |
| `setContentVisible(v)` | 屏幕黑底是否让画面透出来。 |
| `update(dt)` | 每帧推进（雪花换帧、滚屏、抖动、扫描线漂移）。 |
| `setVisible(v)` | 整套特效显隐。 |
| `destroy()` | 销毁并停掉 `tv_static`。 |

---

## `SB.KeyGuide`

`src/core/keyguide.js`。电视画面里的按键卡（3.5 秒自动淡掉）与画面角上的常驻键位条。
**两条硬规矩**：键名一个都不写死（全部现算 `SB.Input.keyName/tip`）；表里每一条都照着 `src/games/*.js` 真正读输入的那几行抄出来，改玩法就回来改表。

| 成员 | 说明 |
|---|---|
| `SHOW_MS` | `3500`，按键卡自己站台的时间。 |
| `spec(mode)` | 某个玩法的键位表或 `null`。`TABLE` 里有 `contra` `tank` `mario` `fight` `multi` `stub` 六种。 |
| `modeOf(game)` | 用 `instanceof SB.Games[...]` 认出玩法名（不看 `opts.mode`——合 1 目录里跑起来的坦克，`mode` 还写着 `multi`）。识别顺序含 `garble`/`crash` 两种套壳层。 |
| `state(game)` | `{mode, game, ready}`。`game` 是**最里层**那个（套壳卡带会 `inner` 嵌套）；`ready` 表示"真的能动了"——开机演出、卡带标题、关卡卡片、开场 READY 都不算。 |
| `stripText(mode, who?)` | 常驻键位条那一行文字（走 `brief` 写法）。 |
| `attach(scene)` | 返回 Guide 实例，由场景自己驱动。 |

Guide 实例（`PlayScene.guide`）：`reset()`（新的一局，含 RESET 和再来一局）、`update(dt)`（每帧）、`holding()` / `hasCard()`、`showCard(mode?)`（暂停菜单里的"看按键说明"）、`hideCard(now?)`、`buildCard(mode)`、`rowsOf(spec, twoP)`、`buildStrip()`、`stripRect()`、`stripLine()`、`cardText()`、`relabel()`、`clear()`、`killCard()`、`killStrip()`、`destroy()`。

---

## `SB.Time`

`src/systems/timeSystem.js`。梦境主线从 **2004-07-15** 起（`START`，与 `SB.STORY.DREAM_SLUG` 是同一天，改一个必须改另一个）。

| 方法 / 属性 | 返回 | 说明 |
|---|---|---|
| `date()` | Date | 当前日期（`START + day - 1`）。 |
| `dateStr()` | string | 例 `'7月15日 周四'`。 |
| `slot()` | object | 当前时段（`SB.SLOTS` 里那一项）。 |
| `isWeekend()` | boolean | 周六日。 |
| `summerDayCount` | `48` | 暑假天数（7/15 – 8/31）。 |
| `isLastDay()` | boolean | `day >= 48`。 |
| `momHome()` | boolean | 妈妈此刻在不在家。按时段的 `momHome` 概率抽一次并缓存在 `d.__momHome`；`flags.momOut` 为真则一定不在。 |
| `nextSlot()` | — | 推进时段（不消耗精力），清掉 `__momHome` 缓存并落盘。 |
| `spend(n?)` | boolean | 消耗精力（默认 1）。不够时返回 `false` 且什么都不改。扣完后精力恰为整数、且还没到最后一个时段时，顺带 `nextSlot()`（所以半点精力的行为不推时段）。 |
| `sleep()` | 事件 \| null | 睡觉进第二天：重置日状态、结算借卡/手柄没收到期、发 0.5 零花钱（走 `SB.Story.earn`）、`SB.Story.dailyTick()`，最后 `rollEvent()`。 |
| `rollEvent()` | 事件 \| null | 抽一个日常事件（32% 什么都不发生）。有进账的事件会记账并把金额写在 `ev.__gain`。 |

> `sleep()` 里那段"重置日状态"的名单（`ap` `slot` `homework` `tvOn` 以及若干 `flags`）**不许加剧情/心情/账本字段**——它们要跨天累计。按天结算的东西写进 `SB.Story.dailyTick()`。

---

## `SB.Econ`

`src/systems/economy.js`。**注意对象名是 `Econ`，不是 `Economy`。**

| 方法 | 返回 | 说明 |
|---|---|---|
| `priceOf(cart)` | number | 今天这张卡的标价：以 `cart.price` 为轴按日期做**确定性**浮动（±17%），稀有度还会加价。同一天进出集市价格不变。 |
| `stockToday()` | array | 今天摊上摆出来的卡带定义（已拥有的不上架；稀有卡更少出现；至少两张，不让玩家白跑）。 |
| `newHaggle(cart)` | object | 开一次砍价：`{cart, ask, floor, patience: 3, offers: [], done: false, deal: 0}`。 |
| `offer(h, v)` | `{ok, msg, counter?, angry?}` | 出价 `v`。≥ `floor` 成交；≥ `floor*0.93` 摊主要一个中间价并掉 1 耐心；再低掉 2 耐心；耐心归零则谈崩（`angry`）。 |
| `priceOfGood(good)` | number | 杂货今天的价钱。一口价商品原样返回 `good.price`；**只有标了 `vary` 的（`console2`）按日期浮动 ±9%**。菜单显示与结算都必须走它。 |
| `buyCart(cart, price)` | `{ok, fake?}` / `{ok:false, why:'poor'}` | 成交：扣钱、置 `owned`、抽初始 `dirt`/`wear`、按 `fakeChance` 抽是不是假卡。 |
| `noteHaggle(ask, deal)` | number | 把砍下来的差价记进账本（`SB.Story.saveUp`）。**不加钱**，只是让"会砍价"有个去处。 |
| `buyGood(good, price?)` | `{ok, price}` / `{ok:false, why:'poor'\|'had'}` | 买杂货。`price` 省略时自己算。`once` 商品写 `d.owned`，可堆叠写 `d.goods`。买到 `SB.STORY.CONSOLE_ID` 时会通知 `SB.Story.gotConsole()`。 |

---

## `SB.Repair`

`src/systems/repair.js`。每张卡两个数值：`dirt` 0–100（金手指氧化，可降可升）、`wear` 0–100（磨损，**永久只涨**，满 100 卡带 `dead`）；加上主机 `slotDirt` 共同决定开机失败率与故障类型。设计上刻意让"过犹不及"成立。

| 方法 | 返回 | 说明 |
|---|---|---|
| `failChance(cartId)` | number | 开机失败概率，夹在 `[0.02, 0.95]`。`owned.avline` 降风险，`flags.hot` 且没 `fan` 加风险，假卡加风险，`dead` 直接 1。 |
| `rollFault(cartId, seatedWell)` | string | 抽故障类型。没插到底一定 `SNOW`；否则按 `dirt`/`slotDirt`/`wear` 加权抽——**故障现象能倒推该做什么**。 |
| `attempt(cartId, seatedWell)` | `{ok, fault, dead?}` | 尝试开机。会 `stats.boots++` 并让 `dirt`/`slotDirt` 各涨一点（插拔本身有代价）。 |
| `isRightFix(fault, action)` | boolean | 这次操作对不对症（比对 `SB.FAULT[fault].fix`）。 |
| `blow(cartId, power, session)` | `{msg, ok, dirtDelta?, worse?}` | 哈气。`power < 0.3` 太轻无效；`> 0.92` 哈太久反而更湿（`dirt +7`）；最佳区间 0.55–0.85；同一次修卡里反复哈效果递减。 |
| `rub(cartId, strokes, session)` | `{msg, ok, dirtDelta, wearDelta, dead, warn}` | 桌上划。累计 ≤3 下最有效；4–5 下开始磨；6 下起几乎只掉磨损。`wear` 满 100 → `dead`。 |
| `reseat(cartId, session)` | `{msg, ok, seat}` | 重新插到底。 |
| `slap(session)` | `{msg, ok, scold}` | 拍电视。同一次拍到第 3 下会招来画外音（`scold`）。 |
| `puff(session)` | `{msg, ok, slotDelta}` | 吹卡槽。前两口 -18，之后 -5。 |
| `swab(cartId)` | `{msg, ok, dirtDelta?}` | 用棉签（消耗 `goods.swab`）：`dirt -48`。没棉签返回 `ok: false`。 |
| `fingerFrame(cartId)` | 0–2 | 金手指的三档视觉状态。 |
| `scratchFrame(cartId)` | 0–3 | 磨损的四档视觉状态。 |
| `describe(cartId)` | string | 给玩家看的一句状态描述。 |

`session` 是"一次修卡回合"的临时计数对象（`{blows, rubs, reseats, slaps, puffs}`），由场景持有（`RoomScene.session` / `RepairScene.session`），成功开机后清空。

---

## `SB.Parent`

`src/systems/parent.js`。你在玩的每一秒它都在后台数秒，依次给三级信号：① 楼下自行车铃 ② 楼道拖鞋声 ③ 钥匙插锁孔。

| 成员 | 说明 |
|---|---|
| `ev` | `Phaser.Events.EventEmitter`。事件：`armed(mode)`、`warn(level, mode)`、`arrive(result)`。 |
| `state` | `'idle' \| 'armed' \| 'w1' \| 'w2' \| 'w3' \| 'arrive'`。 |
| `t` / `eta` | 已过毫秒 / 本轮总时长。 |
| `mode` | `'out'`（妈出门了，52–116 秒）/ `'kitchen'`（妈在厨房，26–52 秒）。被抓次数越多，时间越短（最多缩 30%）。 |
| `lastResult` | 最近一次 `resolve()` 的结果。 |
| `init()` | 建 EventEmitter（幂等），返回 this。 |
| `arm(mode?)` | 上弦并抽 `eta`。 |
| `disarm()` | 停表并停掉心跳循环音。 |
| `remain()` | 剩余比例 0..1。 |
| `update(dt)` | 推进；到 55% / 82% / 95.5% 依次发三级警告，到 100% 发 `arrive` 并附上 `resolve()` 的结果。 |
| `resolve()` | 门开了，清算并返回结果对象（见下）。 |

`resolve()` 返回 `{tvOn, cartIn, hidden, homework, level, why, punish, lines}`：

- **硬条件只有两条**：电视关了没（`level = 2`，`why = 'tv'`）、卡带拔了没（`level = 1`，`why = 'cart'`）；都过关就是 `level = 0`（`escaped++`、信任度上涨）。
- 作业本能减轻一档惩罚，但救不了"电视开着被现行"。真写了（`homework >= 60`）和只把本子摊开装样子（`flags.bookOpen`）是两件不同的事。
- 惩罚随累计被抓次数升级：`'homework'` → `'pad'`（没收手柄一天）→ `'cart'`（没收一张卡带）。
- 无论结果如何，最后都会 `tvOn = false`、`__momHome = true`、`flags.momOut = false` 并落盘。

`SB.Parent.actions`（玩家的应急操作，供场景调用，都返回 boolean）：

| 方法 | 说明 |
|---|---|
| `tvOff()` | 关电视。 |
| `pullCart()` | 拔卡带。 |
| `hideCart(id?)` | 藏进沙发缝（会先从卡槽里拔出来）。 |
| `openBook()` | 只把本子摊开——骗过一眼，骗不过翻页。`homework >= 60` 或已摊开时返回 `false`。 |

---

## `SB.Rescue`

`src/systems/rescue.js`。「听见动静之后那几秒」的判定规则。**纯规则层，一个 Phaser 对象都不碰**——画面、判定条、按键提示全在 `PlayScene`（`buildRescueLayer` / `drawRescue` / `judgeRescue`）。

固定三步，顺序写死（现实里就这个顺序：电视还开着就去拔卡，屏幕会炸一片雪花，动静比什么都大）：

| # | `key` | 界面上写 | 真正干的事 | 需要满足 |
|---|---|---|---|---|
| 1 | `tv` | 关电视 | `SB.Parent.actions.tvOff()` | `d.tvOn` |
| 2 | `cart` | 拔卡带 | `SB.Parent.actions.pullCart()` | `d.inserted` |
| 3 | `hide` | 塞沙发缝 | `SB.Parent.actions.hideCart(id)` | 没藏过 且 手上有卡 |

> 三步是按「当前世界状态」筛出来的：电视本来就关着，这一步就不进队列。所以 `steps.length` 可能是 0–3，`start()` 在没事可收拾时返回 `false`（调用方该走 `emergency()` 兜底）。

| 成员 | 说明 |
|---|---|
| `live` | 是否正在收拾。 |
| `steps` / `i` | 本轮要做的步骤数组 / 当前第几步。 |
| `cursor` / `center` / `half` / `phalf` / `speed` / `dir` | 判定条状态：光标位置、命中区中心、命中半宽、「正好」半宽、每秒扫过的进度、方向。都是 0..1 的进度值。 |
| `perfect` / `okc` / `miss` | 三档判定各按出了几次。 |
| `cartId` | 进来时插在机器里的卡带 id（拔下来之后还得知道往沙发缝里塞哪张）。 |
| `auto` | 是不是第三级预警自动开的。 |
| `lastJudge` | `{type, step, label}`，`type ∈ perfect \| ok \| miss`。 |
| `leftMs()` | 妈妈还有多少毫秒到门口（`SB.Parent.eta - t`）。 |
| `press()` | 压力值 0..1：剩 9 秒以上算不慌，门把手在转就是 1。 |
| `start(auto)` | 开始收拾，返回 boolean（没事可收拾 = `false`）。 |
| `stop()` | 中断（被堵门、退场）。 |
| `cur()` | 当前这一步。 |
| `roll()` | 抽下一次的判定参数。**目标不钉在正中间**，钉住了玩家就在背节拍。 |
| `update(dt)` | 推光标，撞到两头折回来。 |
| `hit()` | 按下去判一次，见下。 |
| `finished()` | 三件事都过了没。 |
| `grade()` | `clean` / `close` / `fail`。 |
| `settle()` | 记账并落盘，返回 `grade()`。 |

判定与罚时（数字都在 `rescue.js` 顶部，改之前先想清楚这是"手忙脚乱"而不是"音游"）：

| 判定 | 条件 | 后果 |
|---|---|---|
| `perfect` | 偏差 ≤ `phalf`（`half × 0.34`） | 不罚，这一步过 |
| `ok` | 偏差 ≤ `half` | `SB.Parent.t += 450`，这一步过 |
| `miss` | 再往外 | `SB.Parent.t += 1100`，**这一步重来**，重新 `roll()` |

- 罚时直接推 `SB.Parent.t`（妈妈的秒表），不是扣自己的计时器——所以"手滑"是真的把门推近了一点。
- 压力越大：`half = 0.085 + 0.080p`（命中区变宽），`speed = 0.80 + 1.30p`（光标变快）。**被逼到墙角时难度要降、紧张感要升**，这是刻意的。
- `grade()` 只看世界的真实状态（`tvOn` / `inserted` / `hidden`），不看自己记的账：本来就关着的电视自动算过，不用在别处补特例。`clean` 要求一次没滑**且**卡真的塞进了沙发缝。
- `settle()`：`clean` → `stats.rescueClean++`、`momTrust +3`、`story.mood +3`、解锁回忆「三下」；`close` → `stats.rescueClose++`；`fail` → `stats.rescueFail++`。难看的收场不额外罚——罚已经在刚才那几秒里罚过了。

---

## `SB.Story`

`src/systems/story.js`。这一层**只算和记，不画任何东西**，全部状态落在 `SB.Save.d.story`。

| 方法 | 返回 | 说明 |
|---|---|---|
| `state()` | object | `d.story`（缺失时兜一个空壳，不让整台机器炸）。 |
| `mood()` | 0–100 | 心情。不是资源条，不消耗、不阻塞，只做叙事晴雨表与结局判定。 |
| `moodBand()` | object | 命中的分档（`SB.STORY.moodBands` 里那一项，含 `word`/`tint`）。 |
| `moodWord()` | string | 心情那一个词——**全场只以这种形式呈现**。 |
| `addMood(v, why?)` | 0–100 | 加减心情。`v` 可以直接传 `SB.STORY.moodDelta` 的键名（如 `addMood('cleared')`），也可以传数字。 |
| `earn(v, src)` | number | 记一笔进账（内部调 `SB.Save.addMoney`）。`src` 对应 `SB.STORY.ledgerNames` 的键，认不出来记成 `other`。 |
| `saveUp(v)` | number | 记一笔"砍价省下的钱"（不加钱）。 |
| `todayRows()` | `[{name, v}]` | 今天的进账明细，按金额降序。 |
| `todayTotal()` | number | 今天进账合计。 |
| `consoleGood()` | object \| null | 目标商品（`SB.GOODS_BY_ID[SB.STORY.CONSOLE_ID]`）。 |
| `goalPrice()` | number | 目标主机今天的价钱（走 `SB.Econ.priceOfGood`）。 |
| `ownConsole()` | boolean | 自己那台买到了没。 |
| `goalGap()` | number | 离目标还差多少钱（买到了就是 0）。 |
| `gotConsole(price)` | boolean | 买下来了：记日期与成交价、加心情、解锁回忆册 `own_console`。重复调用返回 `false`。 |
| `lent()` | boolean | 客厅那台是借的。 |
| `dueDay()` | number | 要还回去的那一天。 |
| `dueLeft()` | number | 还剩几天。 |
| `told()` / `markTold()` | boolean / — | "这台是借的"跟玩家交代过没 / 标记已交代。 |
| `needLateNote()` | boolean | 老档专用：需要用一句短的把设定补上（而不是重播一段开场）。 |
| `chapterNow()` | object | 当前章节（`SB.STORY.chapters` 里那一项）。纯读，不写状态。 |
| `chapterLine()` | string | 例 `'第三章 · 哈两口气'`。 |
| `dailyTick()` | `{quiet, warm}` | 按天结算：闷不闷（连着 `QUIET_DAYS` 天只写作业不玩）、和妈妈和解（被抓过且 `momTrust >= WARM_TRUST`，一次性，解锁 `mom_warm`）。挂在 `SB.Time.sleep()` 里、`rollEvent()` **之前**。 |
| `endingBody()` | array | 结局正文（买到 / 没买到两套）。 |
| `endingVariant()` | string | 命中的结局变体 id：`own_warm` / `own_cold` / `lost_warm` / `lost_cold` / `default`。三个轴：买到没有 × 妈妈关系 × 心情。 |
| `endingVariantLines()` | array | 变体文案，并把 id 写进 `story.ending` 与 `flags.endingVariant`。 |
| `endingTail()` | array | 结尾。 |
| `wishItems()` | array | 心愿单：直接拿 `SB.UI.menu` 的 items 当纸片用（信息行全 `disabled`，最后一行才是按钮）。 |

---

## `SB.Chore`

`src/systems/chore.js`。主动干活的规矩和账。**这一层不画任何东西**：场景问它「小方桌上该列哪几项、哪几项现在不行、为什么」，它答；干完了来报一声，它记账、结算、决定这笔钱当场给还是先挂着。数据表在 `src/data/chores.js`（`SB.CHORES` / `SB.PAYERS` / `SB.PAY_BY_SRC` / `SB.PAY_DENOM`）。

| 成员 | 说明 |
|---|---|
| `state()` | 今天的记录 `{day, done, slots, owed, owedSrc}`。**顺手做跨天懒清零**：发现 `chores.day` 不是今天就地清 `done`/`slots`，`owed` 故意不动。所有别的方法都从这里进。 |
| `all()` / `byId(id)` | 家务表 / 按 id 取一项。 |
| `doneToday(id)` | 今天这样活干过几回。 |
| `slotCount(id, slot)` | 这个时段干过几回（`dish` 的 `perSlot` 靠它）。 |
| `inSlot(id)` | 现在这个时段有没有这样活。 |
| `check(id)` | 能不能干：`{ok, code, why}`。`code` ∈ `ok` / `slot`（不是这个时段）/ `slotDone`（这顿干过了）/ `max`（今天到顶）/ `ap`（没劲了）。`why` 是给玩家看的一句话。 |
| `items()` | 菜单行 `[{label, sub, value, subTint, __code, __why}]`。**干不了的活不置 `disabled`** —— 灰行光标跳不过去，玩家就读不到原因。 |
| `availCount()` | 这会儿有几样能干（小方桌副标题用）。 |
| `doChore(id)` | 干活。返回 `{ok, pay, payer, src, paid, owed, sawIt, why}`。`paid=true` 表示当场给（钱**不在这一层进兜**，等收钱特写的 `onDone`）；`owed=true` 表示妈不在家、钱记进 `chores.owed` 且不涨信任。内部在 `SB.Time.spend()` **之前**就取好 `slotAt` 与 `home`，否则推进时段会把「一顿一次」和「妈在不在家」都算错。 |
| `owed()` / `owedSrc()` | 挂着多少钱、是干什么挣的。 |
| `takeOwed()` | 交出挂账并清零，`{pay, src, payer}`；没有就 `null`。只能成功一次。 |
| `payerOf(src)` | 账本来源 → 付款方对象（`SB.PAYERS` 的一项）。查不到返回 `null`（`allowance` / `find` 就是没人给）。 |
| `breakdown(v)` | 把金额拆成面额数组（2 / 1 / 0.5 / 0.2 / 0.1），最多 8 件，拆出来加回去一分不差。数钱那一下用它。 |

---

## `SB.GameBase` / `SB.extendGame` / `SB.Games`

`src/games/GameBase.js`。构造：`new Ctor(host, opts)`，其中 `host` 是 `PlayScene`，`opts` 由宿主给出 `{cartId, twoP, atFriend, mode}`。

实例属性：`host` / `scene`（都是 `PlayScene`）、`opts`、`W`=360、`H`=270、`pad`（=`SB.Input.p1`）、`pad2`、`world`（会被游戏自己滚动的世界层）、`ui`（永远固定的 HUD 层）、`score`、`hiscore`、`lives`=3、`stage`=1、`over`、`cleared`、`paused`、`t`。

| 方法 | 说明 |
|---|---|
| `create()` / `update(dt)` / `destroy()` | **子类要覆盖的三个生命周期**。基类 `destroy()` 销毁 `world`/`ui`。 |
| `spr(x, y, key, frame?, toUi?)` | 加 sprite；`toUi` 为真挂到 UI 层，否则世界层。 |
| `img(x, y, key, frame?, toUi?)` | 加 image。 |
| `tile(x, y, w, h, key, toUi?)` | 加 tileSprite。 |
| `rect(x, y, w, h, color, alpha?, toUi?)` | 加矩形。 |
| `gfx(toUi?)` | 加 Graphics。 |
| `txt(x, y, str, size?, tint?, toUi?)` | 加文字（走 `SB.Text`）。 |
| `group(toUi?)` | 加容器。 |
| `anim(key, texture, frames, rate, repeat)` | 注册一条帧动画。 |
| `has(key)` | 纹理在不在。 |
| `frames(key)` | 这张图有几帧。 |
| `p(n?)` | `n === 2` 取 `pad2`，否则 `pad`。 |
| `down(k, n?)` / `just(k, n?)` | 某键按住 / 这一帧刚按下。 |
| `hit(a, b)` | 两个矩形是否相交。 |
| `boxOf(sprite, shrinkX?, shrinkY?)` | 取 sprite 的碰撞盒（可内缩）。 |
| `sfx(k, o?)` / `bgm(k)` | 转发 `SB.Audio`。 |
| `shake(ms, amt)` / `flashScreen(color, ms)` | 转发宿主的 `shakeScreen` / `flashScreen`。 |
| `addScore(v)` | 加分并维护 `hiscore`。 |
| `gameOver(delay?)` | 认输（默认 1800ms 后由宿主重开一局）。 |
| `clearGame()` | 通关（宿主会记回忆册、加心情、2.6 秒后退场）。 |
| `hasMag()` | 买了《电子游戏时代》没——决定要不要显示秘技提示。 |
| `clamp` `rnd` `rndInt` `pick` `chance` | 直接挂在原型上的顶层小工具。 |

`SB.extendGame(ctor)`：让 `ctor` 继承 `GameBase.prototype` 并修好 `constructor`，返回 `ctor`。

`SB.Games`（构造器注册表，`PlayScene` 按卡带的 `game` 字段取用，取不到回落 `SB.Games.stub`）：

| key | 来源文件 | 说明 |
|---|---|---|
| `contra` | ContraGame.js | 横版跑打。 |
| `tank` | TankGame.js | 铁甲坦克，支持同屏双打。 |
| `mario` | MarioGame.js | 平台跳跃。 |
| `fight` | FightGame.js | 格斗，支持同屏双打。 |
| `stub` | StubGame.js | 只有标题画面的空卡。 |
| `null` | StubGame.js | 同 `stub`（卡带 `game: null` 时用）。 |
| `multi` | StubGame.js | 100 万合 1 的假目录，前 3 项能进（同一个坦克换配色）。 |
| `garble` | StubGame.js | "汉化版"乱码演出，里面再套一个真游戏。 |
| `crash` | StubGame.js | 玩到第二关死机成一屏彩条。 |

> 卡带 `07` 的数据写着 `game: 'blocks'`，但**没有 `SB.Games.blocks`**，实际会跑 `stub`。

---

## `SB.RepairAnim`

`src/anim/repairAnim.js`。修卡台哈气/划桌的动作特写，**纯表现层**：它不认识脏污磨损，也从不调用 `SB.Repair`。帧表与 `tools/gen_repair_anim.py` 的 `BLOW`/`RUB` 一一对应。

| 成员 | 说明 |
|---|---|
| `FW` / `FH` | `140` / `116`，单帧尺寸。 |
| `MS` | `{blow: [...16], rub: [...13]}`，每帧挂多少毫秒。 |
| `PHASES` | 拍子表：`blow` = `prep/charge/push1/hold/push2/finish`，`rub` = `prep/stroke1/lift/stroke2/finish`，每项 `{name, from, to}` 是闭区间帧号。 |
| `TEX` | `{blow: 'repair_blow', rub: 'repair_rub'}`。 |
| `preload(scene)` | 场景自己 preload 这两张图——**刻意不进 `SB.ASSETS`，也不改 `BootScene`**。 |
| `ready(scene)` | 两张图都在不在。 |
| `timeline(kind, names, speed?)` | 按拍子名拼时间轴 `[{f, ms, phase}]`。 |
| `totalMs(tl)` | 时间轴总时长。 |
| `phaseOf(kind, name)` | 取某一拍。 |
| `duration(kind, names, speed?)` | 这段拍子在这个倍速下要多久。 |
| `plan(kind, seen)` | 看第 `seen` 遍（0 起）该用什么倍速、保留哪些拍子：`{speed, names, ms}`。越看越短（1 → 1.5 → 2.2 倍速），但"两下/两口气"永远都在。 |
| `Player` | 播放器构造器：`new SB.RepairAnim.Player(scene, opts)`。 |

`Player` 实例方法：`build()` `bounds()` `show(kind)` `hide()` `setFrame(f)` `startCharge(kind, opts)` `setCharge(v)` `run(kind, names, opts)` `enter(i)` `isPlaying()` `isRunning()` `update(dt)` `skip()` `finish()` `cancel()` `destroy()`。

> 数值结算不在这一层。`RepairScene` 用 `pendingFix` + `flushFix()` 保证动画播完、被跳过、或中途离场都不会丢那一下。

---

## `SB.PayAnim`

`src/anim/payAnim.js`。收钱的全屏特写，**纯表现层**：它不认识家务规则，也不碰账本。做法与 `SB.RepairAnim` 一致 —— **不切 Scene**，用全屏叠层演出，看着像独立画面。帧表与 `tools/gen_pay_anim.py` 一一对应。

| 成员 | 说明 |
|---|---|
| `FW` / `FH` | `200` / `140`，付款方单帧尺寸。 |
| `HW` / `HH` | `80` / `56`，前景收钱手单帧尺寸。 |
| `BOX` / `HAND` | 取景框左上角 `{x:140, y:34}`（480 宽居中）/ 手在框内的位置 `{x:100, y:78}`。 |
| `MS` | `[700, 520, 460, 620, 560]`，按帧号挂毫秒，三个付款方共用。 |
| `PHASES` | `greet` / `reach` / `out` / `give` / `let`，每项 `{name, from, to}` 是闭区间帧号。 |
| `TEX` | `{pay_mom, pay_laohan, pay_shop, pay_hand}` → 图片路径。 |
| `preload(scene)` | 场景自己 preload 这四张图 —— 和 `RepairAnim` 一样**刻意不进 `SB.ASSETS`**。 |
| `ready(scene)` | 图在不在。 |
| `timeline(names, speed?)` / `totalMs(tl)` / `phaseOf(name)` / `duration(names, speed?)` | 同 `RepairAnim` 的同名方法。 |
| `plan(seen)` | 看第 `seen` 遍（0 起）该用什么倍速、保留哪些拍子：`{speed, names}`。`0` → 完整五拍 ×1（2860ms）；`1` → 五拍 ×1.45（1973ms）；`≥2` → 只剩 `out/give/let` ×2（820ms）。 |
| `seenToday()` / `resetSeen()` | 今天看过几遍（**只存在内存里**，刷新重算）。 |
| `play(scene, opts)` | 放一屏。`opts = {payer, src, amount, owed, onDone}`，返回 `Show` 实例。 |
| `Show` | 演出构造器，一般不直接用。实例上可读 `stage`（`act`/`count`/`tail`/`over`）、`counted`、`got`、`items`、`closed`、`payerId`。 |

`play()` 的 **`onDone(amount)` 就是记账边界**，它一定被调用且**只调用一次** —— 按 B 跳过、数到一半、甚至场景被强行 `scene.stop()`（内部挂了 `scene.events.once('shutdown')` 兜底）都要把全额交出去。真正 `earn()` 的是调用方：主动干活在 `onDone` 里记账，日常事件的钱 `SB.Time.rollEvent()` 已经记过，所以那一屏**只演出、不记账**。

演出期间 `SB.__interludeOpen++`，客厅的一切交互全锁住；`prefers-reduced-motion` 下走静态快版。`onDone` 是异步回来的，所以调用方刷画面前要先确认这一屏还在台上（`RoomScene.alive()`）。

---

## `SB.PROLOGUE_PAINT`

`src/anim/prologueArt.js`。序章每一镜"画什么"，键名对应 `SB.STORY.prologue[i].art`：

`office`、`monitor`、`blackscreen`、`phone_call`、`street`、`taxi(sc, silent?)`、`radio`、`feed`、`post`、`blink`、`warm`。

每个画法只干一件事：往传进来的场景 `sc` 上加对象，加完就不管了；生命周期由 `PrologueScene` 用 `own()` / `spin()` / `tick()` 统一收，换镜时一起清掉。所以这些函数**依赖 `PrologueScene` 提供的辅助方法**（`fill` `rect` `txt` `own` `spin` `tick` `hum` `quiet` `sfx`），不能拿去别的场景直接用。

全部用色块和点阵字现画，不加一张新图。

---

## 数据表

### `SB.ASSETS`（`src/data/assets.js`）

`imgBase`（`'assets/img/'`）、`fontBase`（`'assets/font/'`）、`audioManifest`（`'assets/audio/manifest.json'`）、`images`（`[{key, path}]`）、`sheets`（`[{key, path, w, h, n}]`）、`fonts`（`[{key, png, xml}]`，即 `pix12`/`pix16`）。
文件末尾会为 `01..12` 批量追加 `cart_XX` 与 `cart_label_XX` 两组图。

### `SB.CARTS` / `SB.CART_BY_ID`（`src/data/cartridges.js`）

12 张卡带，每张：`id`（`'01'..'12'`）、`name`、`game`（玩法 key 或 `null`）、`price`、`rarity`、`shell`、`label`、`back`、`desc`、`pitch`（摊主吹的）、`truth`（真相）、`startDirt`、`fakeChance`。

`game` 字段实际取值：`01 contra`、`02 tank`、`03 mario`、`04 fight`、`05 multi`、`06 garble`、`07 blocks`（**无对应实现**）、`08`–`11` `null`、`12 crash`。

### `SB.GOODS` / `SB.GOODS_BY_ID`

`swab`（棉签，`stack`）、`avline`（AV 线，`once`）、`pad2`（2P 手柄，`once`）、`mag`（《电子游戏时代》，`once`）、`popsicle`（老冰棍，`stack`）、`fan`（小台扇，`once`）、`console2`（二手主机，`once` + **`vary`**）。字段：`id` `name` `price` `desc` `pitch` 及 `stack` / `once` / `vary`。

### `SB.MULTI_MENU`

100 万合 1 的假目录 10 项：`{n, name, ok, skin?}`，前 3 项 `ok: true`（同一个坦克换 3 种配色）。

### `SB.STORY`（`src/data/story.js`，只放表和常量）

`CONSOLE_ID`（`'console2'`）、`CONSOLE_PRICE`（45）、`chapters`（5 章，`{id, no, title, from, to}`，纯显示不阻塞）、`moodBands`、`moodDelta`、`QUIET_DAYS`（3）、`WARM_TRUST`（78）、`ledgerNames`、`endings`、序章常量 `PRO_SLUG`（`'2026 年 7 月 3 日'`）/`PRO_CLOCK`（`'23:47'`）/`PRO_PLACE`/`DREAM_SLUG`（`'2004 年 7 月 15 日'`）/`PRO_WAIT_MS`（18000）、`prologue`（12 个分镜）。

分镜字段：`id`、`kind`（`wait` / `menu` / `dialog`）、`art`、`lines`（`SB.L.story.prologue` 的键）、`place`、`dream`、`last`、`skippable`（`s10`/`s11` 为 `false`）、`options`（`{label, say, next?, once?}`）、`keepOpen`、`gate` / `gateLabel` / `gateSay`、`who`，以及**已不参与节奏的遗留字段 `holdMs`**。

### `SB.L` / `SB.line`（`src/data/lines.js` + `src/data/storyLines.js`）

`SB.L` 是文案树：`intro` `tutorial` `room` `repair` `mom` `market` `friend` `homework` `game` `events` `ending` `ui`，`storyLines.js` 再挂上 `SB.L.story`（`lent` `lentLate` `lentReturn` `ledger` `goal` `busted` `book` `momClue` `mood` `endBody` `endVariant` `endTail` `prologue`）。

`SB.line(arr)`：`arr` 是字符串就原样返回，是数组就随机取一句，`null` 返回 `''`。**几乎所有台词都该经过它**，这样同一处对话每次说法略有不同。

---

## 场景

场景类挂在 `SB.XxxScene`，注册在 `src/main.js`。下表是键名与 `init(data)` 的进场参数契约（详见 [ARCHITECTURE.md §5](ARCHITECTURE.md#5-场景流转)）：

| 键 | 类 | `data` 字段 |
|---|---|---|
| `Boot` | `SB.BootScene` | — |
| `Title` | `SB.TitleScene` | （会收到 `{wiped:true}` / `{from:'album'\|'settings'\|'ending'}`，但不读） |
| `Prologue` | `SB.PrologueScene` | `from`（`'title'` / `'album'`；`'album'` = 重看，不写存档）、`intro`、`albumFrom` |
| `Room` | `SB.RoomScene` | `from`（`'title'` `'wake'` `'busted'` `'panic'` `'fault'` `'play'` `'repair'` `'shelf'` `'market'` `'friend'` `'homework'` `'album'` `'settings'`）、`intro`、`result`（被抓清算结果） |
| `Shelf` | `SB.ShelfScene` | `from`、`pick`（真值 = 选中即插入） |
| `Repair` | `SB.RepairScene` | `cartId`（省略则用 `d.inserted`）、`from` |
| `Play` | `SB.PlayScene` | `cartId`、`gameKey`（省略则用卡带的 `game`）、`friend`、`twoP`、`fromMulti` |
| `Market` | `SB.MarketScene` | `from` |
| `Friend` | `SB.FriendScene` | `from`（`'play'` / `'clear'` / `'fault'` 视为打完一局回来，不再扣精力） |
| `Homework` | `SB.HomeworkScene` | `from` |
| `Settings` | `SB.SettingsScene` | `from`（`'Room'` 时返回客厅，否则回标题） |
| `Album` | `SB.AlbumScene` | `from`、`ending`（真值 = 先播结局再列册子） |
| `Sys` | `SB.SysScene` | — |

`PlayScene` 是唯一被小游戏当作 host 调用的场景，它对 `GameBase` 暴露：

| 成员 | 说明 |
|---|---|
| `gameRoot` | 小游戏挂载容器（已按 `SB.SCREEN` 做几何遮罩）。 |
| `onGameOver(game, delay)` | 画 GAME OVER、记分，`delay` 后重开一局。 |
| `onCleared(game)` | 画"通关了！"、记分、写 `carts[id].cleared`、加心情，2.6 秒后退场。 |
| `recordScore(game)` | 刷新这张卡的 `best`。 |
| `shakeScreen(ms, amt?)` | 震屏（`amt` 默认 2，内部换算成 Phaser 的强度）。 |
| `flashScreen(color?, ms?)` | 白闪（默认 `SB.C.WHITE`、80ms）。 |

`SysScene`（常驻）：`toggleFullscreen()`（F）、`toggleMute()`（M）、`toast(msg)`；窗口 `BLUR` 静音、`FOCUS` 恢复。

---

## 运行期全局标记

| 名称 | 谁写 | 说明 |
|---|---|---|
| `SB.version` | `index.html` | `'1.0.0'`。 |
| `SB.game` / `SB.started` | `main.js` | `Phaser.Game` 实例 / 已启动标记（`started` 之后不再把 window error 抛到脸上）。 |
| `SB.MISSING` | `BootScene` | `{资源key: true}`，加载失败清单；缺图会用色块兜底。 |
| `SB.__dialogOpen` | `SB.UI.dialog` | 当前打开的对话框计数。 |
| `SB.__interludeOpen` | `SB.UI.interlude`、`SB.PayAnim` | 当前播放的过场计数。收钱特写也占一格 —— 它不是 `interlude`，但要的是同一种「别人都别动」。 |
| `SB.__menu` | `SB.UI.menu` | 最近建出来的菜单 api（关闭时清空）。 |
| `scene.__uiMenus` | `SB.UI.menu` | 这一屏所有菜单的 api 列表，`SB.UI.openMenus()` 读它。 |
| `scene.__going` | `SB.UI.go` | 换场锁，`shutdown` 时解开。 |
| `d.__nostory` | 测试/调试 | 跳过 `TitleScene` 的序章门禁。 |
| `d.__nomom` | 测试/调试 | 关掉妈妈的秒表（`RoomScene` / `PlayScene` 都读它）。 |
| `d.__momHome` | `SB.Time` / `SB.Parent` | 本时段"妈在不在家"的抽样缓存，换时段/睡觉时清空。 |
| `d.__friendP1` | `FriendScene` | 上次谁拿的 1P，**会落盘**。 |
| `scene.__paySpy` | 测试 | `chore_pay_test` 把 `SB.PayAnim.play` 包一层，把 `Show` 实例挂到场景上好读内部状态。正式代码不写它。 |

> 这些 `__` 字段都不在 `SB.Save.def()` 里，但 `merge()` 会保留存档里多出来的键，所以一旦写进去就会留在档里。正式流程请勿使用。

---

## 已知的名不副实之处

写文档时逐个核对代码发现的、容易让人找错地方的点：

1. **`SB.Economy` 不存在**，经济系统是 `SB.Econ`。
2. **卡带 `07` 的 `game: 'blocks'` 没有实现**，会落到 `SB.Games.stub`。
3. **`d.fixedPending`**（`RepairScene` 写两次）**没有任何地方读**，也不在 `def()` 里。
4. **`flags` 里混进了非布尔值**：`flags.dayRolled`（数字，`RoomScene`）、`flags.endingVariant`（字符串，`SB.Story`）。`save.js` 的注释明确要求 `flags` 只放布尔位，新字段别照抄。
5. **`SB.STORY.prologue[*].holdMs`** 是自动播放时代的遗留字段，当前节奏完全不读它。
6. **`SB.TouchPad` 不读 `opts.twoP`**（`PlayScene` 传了 `{twoP: false}`，实际被忽略）；2P 只能用键盘，虚拟手柄只有一副。
7. **`SB.KeyGuide` 的 `TABLE` 只有 6 种玩法**（`contra/tank/mario/fight/multi/stub`），`garble` 与 `crash` 只出现在 `READY` 与识别顺序里——它们是套壳层，指引会一路跟到最里面那个真游戏。
