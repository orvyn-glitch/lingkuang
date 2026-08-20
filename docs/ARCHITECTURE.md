# 灵框 LingKuang · 代码地图（Architecture）

> 给开发者 / AI 编程助手的快速上手文档。先读这份，再动代码。

## 1. 项目是什么

阈限梦核风格的世界观创作工作台（Electron 单窗口应用）。核心功能：

- **世界观时间线**：横向节点图，多时间线并列、多条循环（轮回）、节点关联人物/地点
- **随机角色生成器**：词库随机组合角色，词条锁定、组合存档
- **词义联想图**：本地/API LLM 生成联想词，力导向节点图，选中支线保留
- **Markdown 编辑器**：双栏预览
- **MCP server**：供外部工具查询世界观数据

## 2. 文件结构

| 文件 | 职责 |
|---|---|
| `main.js` | Electron 主进程。IPC：`data:load/save`（世界观）、`settings:load/save`（设置）、`lib:load/save`（词库）、`ai:associate`（联想）、`ai:classify`（词分类）、`aiChat()`（双模式 LLM 调用） |
| `preload.js` | contextBridge 安全桥，暴露 `window.lingkuangAPI` |
| `index.html` | 单文件界面 + 全部 CSS（设计令牌内联在 `<style>`） |
| `lingkuang.js` | 渲染进程全部逻辑（~4300 行 IIFE）。**绝大部分功能在这里** |
| `mcp-server.js` | MCP 服务器（`query_timeline` / `query_node` / `search_world` / `query_loop`） |
| `data/worldbuilding.js` | 世界观种子数据（`window.__SEED_TIMELINES__`），首次运行/无用户数据时使用 |
| `data/character_lib.json` | 角色生成词库（58 分类 / ~4658 词条，**萌百来源 CC BY-NC-SA，勿商用**） |
| `design-system/` | 设计令牌与规范（`tokens.css` 是唯一权威颜色/字体源） |
| `build/` | 应用图标（打包资源） |

## 3. 数据模型

### 世界观（%APPDATA%\lingkuang\worldbuilding.json，经 IPC `data:load/save`）
```jsonc
{
  "worldsets": {                    // 世界观集合
    "示例世界观": {
      "timelines": {                // 时间线 id → 时间线
        "demo-world": {
          "id": "demo-world",
          "name": "示例世界·白石大陆",
          "absOffset": 0,           // 绝对纪元偏移（跨世界时间换算）
          "nodes": [                // 节点数组
            { "year": -800, "type": "event", "title": "上古之门开启",
              "desc": "...", "tag": "起源",
              "people": [], "places": [] }
            // type: event | plot | year | loop-boundary
          ],
          "loops": [                // 多条循环（v3 重构后）
            { "id": "l1", "name": "轮回", "startNodeId": 3, "endNodeId": 5, "count": 3 }
            // 边界节点 type='loop-boundary'，boundary: start|end|both
          ]
        }
      },
      "order": ["demo-world"],      // 时间线显示顺序
      "docs": {}                    // 编辑器文稿（Markdown）
    }
  },
  "active": "示例世界观"
}
```
- **旧格式兼容**：`{timelines, order}` 单切片 → 自动迁入「我的世界观」。
- **循环旧数据迁移**：`tl.loop`（单循环）→ `tl.loops` 数组；「周期循环」（styles/interval/count）→ 展开成平铺节点 + 循环绑定边界节点（`migrateLoops()`）。

### 设置（settings.json，含 AI 引擎配置）
```jsonc
{ "glide": 0.15, "sens": 1.0, "ruler": 1.0, "defPrecision": "day", "seqPitchDef": 96, "animMs": 480,
  "ai": { "mode": "ollama", "baseUrl": "http://localhost:11434", "model": "qwen2.5:7b", "apiKey": "" } }
```

### 角色生成词库（character_lib.json）
```jsonc
{ "发色": ["黑发", "金发", ...], "发型": [...], ... }   // 58 个分类 key
```
生成逻辑引用的分类见 `lingkuang.js` 的 `CHAR_GROUPS`（43 个 key）。

## 4. 关键机制（改代码前必读）

### 视图切换
- 侧边栏 `data-nav` 按钮 + 大厅卡片 `data-open-tool` → `showView(name)` 切换 `<main class="lobby view">` 的 `data-hidden`。
- `views` 对象注册：lobby / timeline / editor / char。

### 时间线渲染
- `renderTimeline()` 全量重建，`updatePositions()` 就地更新（循环重复段 `is-loop-repeat` 按 `_ghostOffset` 重定位）。
- 平移：`panX/panY`；缩放：`NODE_SPACING`（Alt+滚轮 / Alt+右键拖）。
- **坑**：`renderTimeline` 内 `focusTrackTop()` 会重置 panX——撤销/恢复时要 `keepPanX` 保存恢复。

### 角色生成器（view-char）
- 状态：`charLib`（词库）、`locks`（词条锁定：key→值，下次随机保留）、`groupCounts`（每组词条数）、`staged`（暂存词，localStorage `lingkuang-char-staged`）、`charWords`（词库词集合，命中检测）。
- 存档：localStorage `lingkuang-char-saves`。

### 词义联想图（重点，逻辑最复杂）
数据源：`assocGraph = { nodes, edges, wordIndex }`。
节点字段：`{ id, word, isRoot, parent, children[], expanded, selected, focusChildId, x, y, vx, vy }`。

**状态机（单线聚焦 + 选择性保留）**：
- `selected`：点过的词（选中支线），永远可见（`visibleIds` 第一段）。
- 父节点的 `focusChildId`：子层显示模式——`null`=全显示，`childId`=只显示该子（兄弟收起）。
- `visibleIds()` 规则：
  1. `selected` 节点自身永远可见（子层仍受其 focusChildId 限制）
  2. 根可见
  3. 每个 `expanded` 节点的子层可见（受 focusChildId 限制）
- `onNodeClick(id)`：点焦点=刷新（`refreshNode`→`removeSubtree(id, true)` 只删未选中子树）；点子词=选中+收起兄弟；点父=恢复或刷新。

**力导向**：`forceStep(nodes, vis, edges, temp, damp, dragGroup)`——
- 斥力 900/d²（全可见节点对）+ 引力（边弹簧，理想长 140）
- `dragGroup` 非空时：组内外斥力/引力断开，组内力学继续，被拖节点位置由鼠标控制
- `startSim()`：rAF 循环，前 90 帧 temp=1 收敛，之后 temp=0.22 低温漂移（=浮动感）

**⚠️ 关键坑：节点 id 必须 = 数组下标！**
`removeSubtree` 删除节点后**全量重映射 id**（`idMap`），同步重建 `children/parent/edges/wordIndex/focusChildId/focusedId`。**不要用 splice 删除后还依赖旧 id**（会全部错乱）。力导向/画线用 `nodeById` 映射查找。

**无限画布**：`assocPanX/Y/Zoom` + `.assoc__world` transform（拖拽平移 + Alt+滚轮缩放）。**world 必须有尺寸**（renderGraph 里设 2000×1200），否则节点全堆原点、SVG 不可见。

**事件**：`suppressClick` 机制——拖动节点后 mouseup 置 `suppressClick=true` + `setTimeout(0)` 清理，click 委托开头检查（防拖动误触节点点击）。

### AI 引擎（main.js）
- `aiConfig()`：settings.json 的 `ai` 字段 + env 兜底（`LINGKUANG_AI_MODE/BASE_URL/MODEL/API_KEY`）。
- `aiChat(messages, temperature, numPredict)`：`mode='ollama'` → `/api/chat`；`mode='api'` → OpenAI 兼容 `/chat/completions`（Bearer key + max_tokens）。
- `ai:associate`（联想：5 个一级联想词）、`ai:classify`（词库分类，58 类 few-shot）。

## 5. 风格提醒（保持可读性与一致性）

改代码时注意与现有风格保持一致，目的是可读性和界面统一：

- **视觉**：阈限梦核。颜色优先用 `tokens.css` 变量（暖灰米底 `--bg`、冷荧光绿 `--accent`、深色 `--chrome`），别引入新的裸色值。
- **界面文字**：现有界面不用 emoji、文字/强调避免黄色系（黄与乳黄背景对比度低、辨识度差）——新增 UI 尽量沿用（文字用 `--fg`，强调用 `--accent`；图形类可保留品牌黄 `--accent-2`）。
- **代码风格**：与现状一致——单文件 IIFE、`var`、事件委托；新增逻辑尽量复用已有 helper（`escapeHtml`、`shuffle`、`visibleIds` 等）。
- **用户数据**：一律存 `%APPDATA%\lingkuang\`，不写项目目录（词库 `lib:save` 例外——随应用分发的资源）。

## 6. 打包 / 运行

```bash
npm install          # 装依赖（electron + electron-builder）
npm start            # 开发运行
npm run dist         # 打包 Windows 安装版 + 便携版（输出 dist/）
```
- `package.json` 的 `build` 字段：nsis + portable，图标 `build/icon.png`。
- 打包产物在 `dist/`（已 gitignore）。
- 沙盒测试：`dist/lingkuang-sandbox.wsb`（Windows Sandbox 映射 dist）。
- 数据目录 `%APPDATA%\lingkuang\`，本地测试可删除该目录恢复种子状态。

## 7. 其他

- **MCP**：`mcp-server.js` 用 `@modelcontextprotocol/sdk`，数据源 `%APPDATA%\lingkuang\worldbuilding.json`。
- **词库版权**：`character_lib.json` 基于萌百（CC BY-NC-SA 非商业），与代码 MIT 分离（README 已声明）。
