# 灵框 LingKuang · 设计规格（DESIGN）

> **状态：demo/原型阶段。** 视觉未打磨（UI 总设计后置）。本文档记录每个功能的设计意图、数据模型、交互与关键决策——**为全量重构提供规格依据**（重构时按此实现，不再靠记忆）。
> 数据当前存 `%APPDATA%\lingkuang\worldbuilding.json`；测试后门 `LINGKUANG_TEST_DATA` 环境变量。

---

## 0. 总体架构（当前 demo）

- **单 HTML + 大 IIFE**（index.html + lingkuang.js ~5000 行），Electron 壳（main.js IPC 读写文件）
- 数据：`worldsets = { 世界观名: { timelines, order, docs, entityTypes?, entities?, timeCursor? } }`
- `timelines = { 时间线id: { id, name, absOffset, nodes[], loops[], storylines[] } }`
- `nodes = [{ id, title, year, precision, type: event/plot/year/loop-boundary, desc, tag, people[], places[], doc?, docId?, entityId? }]`
- 视图：lobby（大厅卡片，插件化 registerTool）/ timeline / editor / char（灵感触发器）
- 插件化：`window.LINGKUANG.registerTool({id, name, icon, desc, meta, el, onOpen})`，新工具放 `js/tool-*.js`（见 `js/README.md`）

## 0.1 重构注意（全量重构时）
- lingkuang.js 应拆模块：核心（数据/渲染）/ 工具（各 view）/ 实体 / 编辑器
- 数据层与视图解耦（当前面板直接改 n.doc 等，重构应走 store/action）
- 视觉与交互分离：UI 总设计统一改（BUGS.md 记录视觉待办）
- 时间精度：内部小数年份（nodeToTime），显示人类格式（partsFromTime 精确回算）
- **Electron 禁用原生 prompt/alert/confirm**（用自定义 modal）

---

## 1. 时间线（核心）

**目的**：世界观的时间轴——节点按年份横排，可多时间线/循环/剧情线。

**交互**：
- 拖拽空白 = 时间指针定位（默认工具）；**空格+拖拽 = 平移**；Alt+滚轮缩放；Alt+右键拖 = 快速缩放
- 右键节点 = 菜单（添加/删除/创建循环/创建剧情线）；点节点 = 详情面板
- 多时间线 tabs、并列模式（multiMode）、非线性序列模式（nonlinearMode 固定间距）

**关键决策**：
- 节点 id = 数组下标（removeSubtree 后全量重映射）
- 相机：panX 平移 + panXBase 烘焙进节点 left；track transform 平移
- 视口元素（时间指针/聚焦遮罩）用 `timeToX(t)+panX`（transform 定位，与画布同步）

## 2. 剧情线（storylines）

**目的**：主角线/女主线等**平行叙事线**——不是章节时间段，是可跨时间、有 gap 的线。

**数据**：`tl.storylines = [{ id, name, segments: [{start, end}] }]`，segment.end=null 表示**无限延续**（剧情还在写）；gap 期间节点不属于线。

**交互**：
- tl-manager「剧情」按钮：聚焦 ↔ 世界历史；下拉选剧情线
- 「画线」模式：刷选加段（吸附节点精确时刻）→ 可多段累积 → 橡皮擦（区间差集）→ ∞（无限延续）→ 命名创建
- 聚焦：只显示线内节点（年份落在任意 segment）；范围外遮罩（视觉待改）；标尺同步裁剪

**关键决策**：
- 数据演进：节点集合(nodeIds) → 单段(startYear/endYear) → 多段(segments)，迁移函数 migrateStorylines
- 吸附：`10/NODE_SPACING` 年（视口 10px）内对齐节点

## 3. 时间指针（timeCursor）

**目的**：全视图的"当前时间"——已发生/未发生分界，物化角色"此刻"状态的地基。

**数据**：`worldsets[world].timeCursor`（小数年份）。

**交互**：永远显示；**左键点/拖空白 = 定位指针**；手柄可拖；指针后节点 is-future 淡化。

**待修（BUGS）**：缓动与画布不同步（glide 时）；归 UI 总设计。

## 4. 实体系统（entityTypes/entities）

**目的**：角色/地点/物品等设定对象**独立于时间线**（吸取"角色塞节点面板"教训）；类型可自定义数据结构。

**数据**：
```js
ws.entityTypes = { role: { id, name, fields: [{key, type: text/longtext/number/boolean}] } }
ws.entities = { e1: { id, type, name, data: {字段:值}, desc } }
```
节点可 `entityId` 关联实体（未完成——下一步）。

**交互**：tl-manager「实体」→ 管理面板（类型增删字段 + 实体列表 + 表单）。

**关键决策**：
- 类型=模板，实体=实例（抽象函数式）
- 实体录入 = **#字段：值 文本模式**（parseEntityText 自动识别）

## 5. 节点本体 = 文稿（Obsidian 式）⭐ 当前方向

**目的**：**节点/实体的内容本体是 Markdown 文稿，面板只是自动生成的视图**——编辑文稿即编辑一切，结构化字段从文本派生。

**数据**：`n.doc`（Markdown 文本）。解析 `parseDoc`：
- `#字段：值` 行 → 结构化字段（面板高亮显示）
- 其余 → 正文

**交互**：面板「文稿」区（字段高亮 + 正文）+「✎ 编辑文稿」（面板内 textarea，失焦保存刷新）。

**下一步（demo 待做）**：
- 实体套用 e.doc
- 编辑器编辑节点本体（编辑器 ↔ 文稿）
- `[[节点标题]]` 链接跳转（文稿→节点）

**重构注意**：这是核心架构——单一事实源（文稿）+ 派生视图（面板/字段/时间线识别）。全量重构以此为准。

## 6. 编辑器（Markdown 双栏 → TipTap WYSIWYG）

**目的**：文稿编辑（docs 对象存每篇）。

**现状**：双栏（ed-input + ed-preview mdRender）、防抖保存、文件列表。
**升级计划（2026-08-21 确认）**：**引入 TipTap WYSIWYG 编辑器**（参考 NoteGen `codexu/note-gen`，GPL-3.0 与灵框兼容可抄）——输入 `**粗体**` 就地渲染成格式，光标点进去显示原文（所见即所得）。需引入 npm 依赖 + 构建链（esbuild），全量重构时一起做。
**联动**：`[[节点]]` 链接跳转（待做）；富媒体（图片/音乐，待做）。

### 6.1 文件管理侧栏（VS Code 式，待做）
- 左侧文件树（explorer）：世界观（文件夹）→ 时间线（子文件夹）→ 节点（.md 文件）；实体实例/普通笔记也在树里
- 点击文件 → 打开对应内容（节点文稿在编辑器打开 / 跳时间线选中）
- 与"本体=文稿"契合：一切皆为文件，树浏览全部

### 6.2 编辑器顶部滚轮条（Cover Flow 式，后期）
- 编辑器顶部一排小节点：**中间最大最亮、两边渐小渐透明**（Cover Flow）
- 点击快速切换（节点/文稿间跳转）
- 用户明确：后期需求，先把基础功能做好

### 6.3 实体时间切片（实体=文件夹，后期）
- 每个实例（实体）是文件夹，内含**同一实体不同时间的状态切片**（如 灰烬铁匠/312年/400年/612年）
- 切片定义方式待用户补充（选了"其他"未展开）
- 与时间指针物化（§3）同源：切片 = 某时间点的实体状态

### 6.4 地图工具已知问题（2026-08-21 记需求，待修/待做）
- **吸附没对准**：吸附点被 Catmull-Rom 平滑拉偏（曲线不精确过采样点）→ 需硬锚点（吸附点分段平滑，曲线强制通过）
- **切刀线跑外**：直线切分时交点/闭合异常，切出的线跑到区域外 → 需修正多边形切割（可能 dedup 顺序/交点归属问题）
- **切刀要手绘路径**：当前切刀是直线（两点），用户需要**手绘任意路径**切割（沿手绘线切开区域）——几何：手绘路径与区域多边形求交切分（比直线复杂）
- 待后续统一修/做

### 6.5 地图显示模式（后期）
- 等高线（同海拔连线）/ 魔力浓度（渐变色图）——区域可设数值（海拔/浓度），按图层渲染
- 粗糙化滤镜（AE 式可叠加效果：抖动/噪点，`region.filter` 数据口已留）
- 每个实例（实体）是文件夹，内含**同一实体不同时间的状态切片**（如 灰烬铁匠/312年/400年/612年）
- 切片定义方式待用户补充（选了"其他"未展开）
- 与时间指针物化（§3）同源：切片 = 某时间点的实体状态

## 7. 灵感触发器（原随机角色生成器）

**目的**：AI 出素材、你出决定——随机组合词条触发角色灵感（不是成品生成器）。

**数据**：`data/character_lib.json`（58 分类 ~4669 词条，萌百来源 CC BY-NC-SA）。

**交互**：随机生成（词条数可选）→ 锁定 ⚿（下次保留）→ 组合存档 → 联想图（点词展开，AI 双模式 Ollama/API）。

## 8. 词义联想图

**目的**：点词发散成树（力导向），单线聚焦，暂存新词扩充词库。

**关键坑（ARCHITECTURE.md §4）**：id=下标、world 尺寸、suppressClick、dataset.word undefined（用 data-id 查）。

---

## 重构清单（全量重构时逐条对照）
- [ ] lingkuang.js 拆模块（core/tools/entity/editor）
- [ ] 数据层与视图解耦（store/action 或类似）
- [ ] 视觉总设计（BUGS.md 所有 UI 待办）
- [ ] 实体 e.doc 套用文稿本体
- [ ] 编辑器 ↔ 文稿（节点本体在编辑器编辑）
- [ ] [[节点]] 链接跳转
- [ ] 时间指针缓动同步
- [ ] 聚焦遮罩（位置/透明度）
