/* 灵框 v3 · Electron 主进程
 * 职责：创建窗口 + 提供 user-data 文件读写（IPC）。
 * 渲染进程通过 preload 暴露的 window.lingkuangAPI 调用，数据落盘到
 * user-data/worldbuilding.json —— 世界观数据真正物理存储。
 */
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

/* proper app identity → userData goes to %APPDATA%\lingkuang, not Electron。
   setName 在 Electron 偶发时序 bug（Cannot read properties of undefined (reading 'setName')），
   用显式 setPath 兜底保证 userData 路径正确。 */
try { app.setName('lingkuang'); } catch (e) { /* 偶发时序 bug，setPath 保证路径 */ }
try { app.setPath('userData', path.join(app.getPath('appData'), 'lingkuang')); } catch (e) {}

/* remove the application menu entirely — Alt must NOT summon a menu bar */
Menu.setApplicationMenu(null);

/* 数据文件路径。测试后门：LINGKUANG_TEST_DATA 环境变量指向测试数据文件时，
   读写都走它（不碰 %APPDATA% 真实数据）——用于测试新功能/调试损坏数据。 */
const DATA_FILE = () => process.env.LINGKUANG_TEST_DATA
  ? process.env.LINGKUANG_TEST_DATA
  : path.join(app.getPath('userData'), 'worldbuilding.json');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#c5c2ba',
    title: '灵框 LingKuang v3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile('index.html');
  }
  /* F12 toggles DevTools — handy for dragging/eyeballing element positions
     (menu bar was removed, so the default accelerator is gone) */
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
}

/* ── IPC: read the worldbuilding data file ─────────────────── */
ipcMain.handle('data:load', () => {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    /* file missing = first run: return nothing, front-end falls back to seed */
    return { ok: false, error: e.code || String(e) };
  }
});

/* ── IPC: write the worldbuilding data file ────────────────── */
ipcMain.handle('data:save', (e, payload) => {
  try {
    const dir = path.dirname(DATA_FILE());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE(), JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/* ── IPC: read the character lib (bundled resource, project dir) ─ */
const LIB_FILE = () => path.join(__dirname, 'data', 'character_lib.json');
ipcMain.handle('lib:load', () => {
  try {
    const raw = fs.readFileSync(LIB_FILE(), 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.code || String(e) };
  }
});

/* ── IPC: read the user settings file ──────────────────────── */
ipcMain.handle('settings:load', () => {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.code || String(e) };
  }
});

/* ── IPC: write the user settings file ─────────────────────── */
ipcMain.handle('settings:save', (e, payload) => {
  try {
    const dir = path.dirname(SETTINGS_FILE());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/* ── AI 引擎：本地 Ollama / OpenAI 兼容 API 双模式 ────────── */
const AI_DEFAULTS = { mode: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b', apiKey: '' };

/* 从 settings.json 读 AI 配置，env 变量可兜底覆盖：
   LINGKUANG_AI_MODE=ollama|api  LINGKUANG_AI_BASE_URL  LINGKUANG_AI_MODEL  LINGKUANG_AI_API_KEY */
function aiConfig() {
  const cfg = Object.assign({}, AI_DEFAULTS);
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8');
    const s = JSON.parse(raw);
    if (s && s.ai) Object.assign(cfg, s.ai);
  } catch (e) { /* first run: defaults */ }
  if (process.env.LINGKUANG_AI_MODE) cfg.mode = process.env.LINGKUANG_AI_MODE;
  if (process.env.LINGKUANG_AI_BASE_URL) cfg.baseUrl = process.env.LINGKUANG_AI_BASE_URL;
  if (process.env.LINGKUANG_AI_MODEL) cfg.model = process.env.LINGKUANG_AI_MODEL;
  if (process.env.LINGKUANG_AI_API_KEY) cfg.apiKey = process.env.LINGKUANG_AI_API_KEY;
  return cfg;
}

/* 统一聊天调用：按 mode 分发到本地 Ollama 或 OpenAI 兼容端点 */
async function aiChat(messages, temperature, numPredict) {
  const cfg = aiConfig();
  if (cfg.mode === 'api') {
    if (!cfg.apiKey) throw new Error('API 模式需要配置 API Key（设置 → 联想引擎）');
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, messages, temperature, max_tokens: numPredict, stream: false })
    });
    if (!resp.ok) throw new Error('api http ' + resp.status);
    const data = await resp.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }
  /* 本地 Ollama */
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/chat';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, messages, stream: false, options: { temperature, num_predict: numPredict } })
  });
  if (!resp.ok) throw new Error('ollama http ' + resp.status);
  const data = await resp.json();
  return (data.message && data.message.content) || '';
}

const ASSOC_PROMPT = `你是词义联想引擎。给定一个词，生成 5 个与其直接相关的联想词（一级联想，不嵌套链条）。
规则：
1. 每个词都直接由输入词联想而来，词之间互相独立
2. 联想方向多样（物品/场景/人物/意象/象征等不同角度）
3. 词要具体、有画面感，2-4 字中文名词为主，不要抽象形容词
4. 输出格式：每行一个词，不要序号、不要解释

输入词：
`;

ipcMain.handle('ai:associate', async (e, word) => {
  if (!word || typeof word !== 'string') return { ok: false, error: 'empty word' };
  try {
    const text = await aiChat([{ role: 'user', content: ASSOC_PROMPT + word }], 0.7, 300);
    const words = text.split('\n')
      .map(line => line.trim().replace(/^\d+[.．、]\s*/, ''))
      .filter(w => w && w.length >= 2)
      .slice(0, 5);
    return words.length ? { ok: true, words } : { ok: false, error: 'no words parsed' };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/* ── IPC: write character lib（暂存词导出）────────────── */
ipcMain.handle('lib:save', (e, data) => {
  try {
    const dir = path.dirname(LIB_FILE());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LIB_FILE(), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/* ── IPC: batch classify words via local Ollama（暂存词分类）── */
const CLASSIFY_PROMPT = `你是角色设定词库管理员。词库分类如下（分类名：示例）：
发色：黑发｜发型：双马尾｜瞳色：蓝瞳｜肤色：白皮肤｜角：恶魔角｜瞳：三白眼｜耳：兽耳｜尾：猫尾｜翅：羽翼｜其他身体特征：伤疤、獠牙、鳞片｜上衣：衬衫｜下装：短裙｜连体衣：连衣裙｜套装：水手服｜鞋：靴子｜袜：过膝袜｜内衣：文胸｜特殊服装：女仆装、婚纱｜武器：剑、枪｜法器：法杖｜道具：钥匙、怀表、门锁、路灯｜随身物：扇子、钱包｜坐骑：马、龙｜头饰：发箍、王冠｜面饰：面纱｜颈饰：项链｜肩饰：披肩｜臂饰：臂环｜手饰：戒指｜腰饰：腰带｜腿饰：腿环｜脚链：脚铃｜背部装饰：披风｜发饰：发夹｜眼镜：圆框眼镜｜表层性格：开朗、冷淡｜深层性格：腹黑｜癖好：收集癖｜恐惧：恐高｜执念：复仇｜气质：高贵、神秘｜职业：剑士、医生｜种族：人类、精灵｜身份地位：王子、流浪者｜背景经历：孤儿｜秘密：隐藏身份｜目标：征服世界｜能力：飞行、读心｜弱点：怕火｜关系：师徒、宿敌｜主题意象：月亮、锁链、囚牢、铁窗、庭院｜代表色：红色、金色｜名字含义：寓意光明｜服装：哥特风、和风｜食物：苹果｜气味：花香｜体型：娇小｜萌属性：傲娇、天然呆

请把下列每个词条归类到其中最合适的 1 个分类。严格规则：
1. 只能从上面分类名里选，禁止发明新分类
2. 词条以某分类名结尾时优先归该类（四角裤→下装）
3. 抽象/意象类词（囚牢、铁窗、庭院、月光这类有画面感但不是实体物品的）归「主题意象」
4. 「其他身体特征」只放身体部位相关词条（伤疤、獠牙、鳞片、触手），普通物品严禁放进去
5. 输出格式：每行一个「词条: 分类」，词条原文照抄，不要序号、不要解释

词条：
`;

ipcMain.handle('ai:classify', async (e, words) => {
  if (!Array.isArray(words) || !words.length) return { ok: false, error: 'empty words' };
  const list = words.slice(0, 60);
  try {
    const text = await aiChat([{ role: 'user', content: CLASSIFY_PROMPT + list.join('\n') }], 0.1, 2000);
    const validCats = CLASSIFY_PROMPT.match(/[\u4e00-\u9fff]+(?=：)/g) || [];
    const map = {};
    text.split('\n').forEach(line => {
      const m = line.trim().match(/^(.+?)[:：]\s*(.+)$/);
      if (!m) return;
      const w = m[1].trim().replace(/^\d+[.．、]\s*/, '');
      const c = m[2].trim();
      if (words.includes(w) && validCats.includes(c)) map[w] = c;
    });
    return { ok: true, map };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/* 单实例：第二次启动时关掉旧窗口，重新开一个（避免多窗口叠加） */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    BrowserWindow.getAllWindows().forEach(function (w) { w.destroy(); });
    createWindow();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
