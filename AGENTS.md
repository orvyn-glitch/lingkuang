# AGENTS.md — AI 编程助手约定

> 本文件供 AI 编程工具（Claude Code / Cursor / Codex 等）自动读取。
> **动手改代码前先读 `docs/ARCHITECTURE.md`（完整代码地图）。**

## 项目

灵框 LingKuang：阈限梦核世界观工作台（Electron）。时间线 / 随机角色生成 / 词义联想图 / Markdown 编辑器。

- 运行：`npm start`
- 打包：`npm run dist`（输出 dist/）
- 数据：`%APPDATA%\lingkuang\`（不写项目目录；词库 `lib:save` 例外）
- 语法检查：`ELECTRON_RUN_AS_NODE=1 && electron --check <file>`

## 文件职责

- `main.js`：Electron 主进程（IPC：数据/设置/词库/AI 联想与分类）
- `lingkuang.js`：渲染进程核心（~5000 行 IIFE，`var` + 事件委托）
- `js/`：**插件文件目录**——新工具写在 `js/tool-<id>.js`，用 `window.LINGKUANG.registerTool({id, name, icon, desc, meta, el, onOpen})` 注册（见 `js/README.md`）。**新工具不要往 lingkuang.js 加**（它只含核心 + 4 个内建工具注册）
- `index.html`：单文件 UI + 全部 CSS（设计令牌内联）；大厅卡片由插件注册表自动渲染（`#grid` 空容器）
- `data/worldbuilding.js`：种子世界观；`data/character_lib.json`：角色词库（萌百来源 CC BY-NC-SA，勿商用）

## 测试后门

- 环境变量 `LINGKUANG_TEST_DATA=<文件路径>` → 数据读写走该文件，不碰 `%APPDATA%\lingkuang\worldbuilding.json`（测试/调试损坏数据用）

## 风格约定

- 与现有代码保持一致：单文件 IIFE、`var`、事件委托；复用已有 helper（`escapeHtml`/`shuffle`/`visibleIds`…）
- **界面不用 emoji**；**文字/强调避免黄色系**（对比度低，文字用 `--fg`、强调用 `--accent`）
- 颜色只用 `index.html` 里 tokens 变量（暖灰底/荧光绿/深 chrome）
- **⭐ 需求协作规范（2026-08-22 用户明确）**：用户会讲「目的与实现」。**先抓住目的**（这个功能为什么存在、解决什么痛点），再谈实现细节。用户只讲实现/没讲清楚目的时，**主动提醒用户补充目的**，不猜着改。参考教训：联想图"聚焦"我从 visibleIds/focusChildId/expanded 反复改 N 版都错，因为没先理解目的是"多分支探索 + 视觉降噪（淡化非焦点，不折叠数据）"——一旦按目的设计立刻对了。

## ⚠️ 关键坑（改这些逻辑前必读 ARCHITECTURE §4）

1. **节点 id = 数组下标**：`removeSubtree` 删除后全量重映射 id（children/parent/edges/wordIndex/focusChildId/focusedId 同步重建）。别用 splice 后依赖旧 id。
2. **联想图 world 必须设尺寸**（renderGraph 里 2000×1200），否则节点堆原点、SVG 不可见。
3. **suppressClick**：拖动后 mouseup 置 suppressClick + setTimeout 清理；click 委托开头检查（防拖动误触）。
4. **startEyedrop 要关所有 modal**（loopModal + storyModal），否则面板遮舞台。
5. **updatePositions 新增元素要同步**（storybar 等需跟随缩放/平移，同 loop frame）。
6. **词义联想图状态机**：selected（选中支线永远保留）+ 父节点 focusChildId（子层收起）；`visibleIds` 三阶段规则。
7. **剧情范围**（storyRanges）：focus 模式裁剪范围外节点；范围损坏（节点缺失）→ 不裁剪。

## 文档

- `docs/ARCHITECTURE.md` — 代码地图（改代码前必读）
- `docs/BUGS.md` — 已知 bug（修完打勾 + commit 注明）
- `docs/ROADMAP.md` — 功能路线图（P1/P2）
- `docs/USER_GUIDE.md` — 用户操作手册
- `LICENSE` GPL-3.0；词库 CC BY-NC-SA（与代码分离）
