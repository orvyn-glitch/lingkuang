/* ─────────────────────────────────────────────────────────────
 * 灵框 · 插件文件规范（Plugin File Convention）
 *
 * 新工具 = 一个独立 JS 文件（js/tool-<id>.js），通过
 *   window.LINGKUANG.registerTool({...}) 注册：
 *
 *   window.LINGKUANG.registerTool({
 *     id: 'mytool',               // 唯一 id（不能与现有工具冲突）
 *     name: '工具名',             // 大厅卡片标题
 *     icon: '🛠',                 // 卡片图标（文字/符号）
 *     desc: '一句话描述',         // 卡片描述
 *     meta: ['标签1', '标签2'],   // 卡片底部标签
 *     el: document.getElementById('view-mytool'),  // 工具视图容器（必须）
 *     onOpen: function () { ... } // 可选：打开时触发（挂载/初始化）
 *   });
 *
 * 步骤：
 *   1. index.html 加视图容器 <main class="lobby view" id="view-mytool" data-hidden="1">
 *   2. index.html 在 lingkuang.js 之后加 <script src="js/tool-mytool.js"></script>
 *   3. 插件文件里 registerTool 注册（lingkuang.js 加载后执行）
 *
 * 注意：
 *   - 插件文件在 lingkuang.js 之后加载（依赖 window.LINGKUANG）
 *   - 视图容器的显隐由 showView 管理（data-hidden="0/1"）
 *   - 工具内功能解耦：插件内部可以再拆子模块，通过 onOpen 挂载
 * ───────────────────────────────────────────────────────────── */
