/** 灵感触发器——随机角色生成（词库 58 分类；照抄 legacy 生成/锁定/组数逻辑）+ 语义联想 */
import type { Store } from '../store/store';
import { loadSettings } from './settings';

interface Group { t: string; keys: string[]; n: number; }
type Lib = Record<string, string[]>;
type Combo = Record<string, Record<string, string>>;

const CHAR_GROUPS: Group[] = [
  { t: '外貌', keys: ['发色', '发型', '瞳色', '肤色'], n: 4 },
  { t: '身体特征', keys: ['角', '瞳', '耳', '尾', '翅', '其他身体特征'], n: 2 },
  { t: '服装', keys: ['上衣', '下装', '连体衣', '套装'], n: 2 },
  { t: '穿戴', keys: ['鞋', '袜', '眼镜'], n: 2 },
  { t: '饰品', keys: ['头饰', '颈饰', '臂饰', '腰饰', '手饰', '脚链', '肩饰', '面饰'], n: 2 },
  { t: '装备', keys: ['武器', '法器', '道具', '随身物'], n: 1 },
  { t: '内在', keys: ['表层性格', '深层性格'], n: 2 },
  { t: '身份', keys: ['气质', '职业', '种族'], n: 2 },
  { t: '背景', keys: ['背景经历', '秘密', '目标', '执念'], n: 1 },
  { t: '能力', keys: ['能力', '弱点'], n: 1 },
  { t: '关系/主题', keys: ['关系', '主题意象', '代表色'], n: 1 },
];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export async function renderInspire(_store: Store, host: HTMLElement): Promise<void> {
  let lib: Lib | null = null;
  let locks: Record<string, string> = {};
  const groupCounts: Record<number, string> = {};
  let activeCombo: Combo | null = null;

  try { locks = JSON.parse(localStorage.getItem('lingkuang-inspire-locks') || '{}'); } catch { locks = {}; }
  const saves: Combo[] = (() => { try { return JSON.parse(localStorage.getItem('lingkuang-inspire-saves') || '[]'); } catch { return []; } })();

  host.style.overflow = 'auto';
  host.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-soft);background:var(--surface-2);flex-wrap:wrap;">
        <span style="font-size:15px;font-weight:600;color:var(--fg);">灵感触发器</span>
        <span id="insp-status" style="font-size:var(--text-xs);color:var(--fg-2);">加载词库…</span>
        <span style="flex:1;"></span>
        <div id="insp-saves" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
        <button id="insp-save" style="background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 12px;font-size:var(--text-sm);cursor:pointer;">保存组合</button>
        <button id="insp-roll" style="background:var(--accent);color:var(--accent-on);border:none;border-radius:var(--radius-sm);padding:6px 14px;font-size:var(--text-sm);cursor:pointer;">重新生成</button>
      </div>
      <div id="insp-result" style="flex:1;overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;align-content:start;"></div>
    </div>`;

  const status = host.querySelector('#insp-status') as HTMLElement;
  const result = host.querySelector('#insp-result') as HTMLElement;
  const savesBox = host.querySelector('#insp-saves') as HTMLElement;

  function persistLocks() {
    localStorage.setItem('lingkuang-inspire-locks', JSON.stringify(locks));
  }
  function persistSaves() {
    localStorage.setItem('lingkuang-inspire-saves', JSON.stringify(saves));
  }
  function statusMsg(m: string) { status.textContent = m; }

  /* 抽一组：锁定 key 保留，其余洗牌补足 */
  function rollGroup(g: Group, count: number): Record<string, string> {
    const res: Record<string, string> = {};
    const locked = g.keys.filter((k) => locks[k] !== undefined);
    locked.forEach((k) => { res[k] = locks[k]; });
    const free = shuffle(g.keys.filter((k) => locks[k] === undefined && Array.isArray(lib![k]) && lib![k].length > 0));
    const need = Math.max(0, count - locked.length);
    free.slice(0, Math.min(need, free.length)).forEach((k) => {
      res[k] = lib![k][Math.floor(Math.random() * lib![k].length)];
    });
    return res;
  }
  function currentCount(g: Group, gi: number): number {
    const v = groupCounts[gi];
    if (v === 'rand') return 1 + Math.floor(Math.random() * Math.min(4, g.keys.length));
    const n = parseInt(v ?? '', 10);
    return isNaN(n) ? g.n : n;
  }
  function countOptions(g: Group, current?: string): string {
    const max = Math.min(4, g.keys.length);
    const cur = current || String(g.n);
    let o = `<option value="rand"${cur === 'rand' ? ' selected' : ''}>随机</option>`;
    for (let i = 1; i <= max; i++) o += `<option value="${i}"${cur === String(i) ? ' selected' : ''}>${i}</option>`;
    return o;
  }

  function renderChar(combo: Combo | null) {
    if (!lib) return;
    result.innerHTML = CHAR_GROUPS.map((g, gi) => {
      const picks = combo ? combo[g.t] || {} : rollGroup(g, currentCount(g, gi));
      const rows = Object.keys(picks).map((k) => {
        const locked = locks[k] !== undefined;
        return `<div class="insp-row${locked ? ' is-locked' : ''}" data-key="${k}" style="display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:var(--radius-sm);${locked ? 'background:rgba(158,194,98,.12);' : ''}">
          <span style="font-size:var(--text-xs);color:var(--fg-2);min-width:64px;">${k}</span>
          <span class="insp-val" style="flex:1;font-size:var(--text-sm);color:var(--fg);">${picks[k]}</span>
          <button class="insp-assoc" data-word="${picks[k]}" title="语义联想" style="background:none;border:none;color:var(--fg-2);cursor:pointer;font-size:12px;">⚡</button>
          <button class="insp-lock" data-key="${k}" title="${locked ? '解锁' : '锁定：下次随机保留'}" style="background:none;border:none;color:${locked ? 'var(--accent)' : 'var(--fg-2)'};cursor:pointer;font-size:13px;">⚿</button>
        </div>`;
      }).join('');
      return `<div class="insp-card" style="border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(58,58,52,.05);border-bottom:1px solid var(--border-soft);">
          <span style="font-size:var(--text-xs);font-weight:600;color:var(--fg);">${g.t}</span>
          <select class="insp-count" data-g="${gi}" style="margin-left:auto;background:none;border:1px solid var(--border-soft);border-radius:var(--radius-sm);color:var(--fg);font-size:10px;padding:1px 3px;">${countOptions(g, groupCounts[gi])}</select>
        </div>
        ${rows}</div>`;
    }).join('');
    bindEvents();
  }

  /* ── 语义联想（Ollama，设置里配引擎）── */
  async function runAssoc(word: string) {
    statusMsg(`联想「${word}」…`);
    let chains: string[][] = [];
    try {
      const cfg = loadSettings();
      const messages = [
        {
          role: 'user',
          content:
            '你是词义联想引擎。给定一个词，生成 3 条不同的发散联想链，每条链 5 个词。\n规则：\n1. 链式发散：后一个词由前一个词自然联想而来（例：锁链→手铐→囚牢→监狱→铁窗）\n2. 3 条链必须方向不同\n3. 词要具体、有画面感，2-4 字中文名词为主\n4. 输出格式：3 行，每行一条链，词用「-」连接，不要序号和解释\n\n输入词：\n' + word,
        },
      ];
      let text = '';
      if (cfg.aiMode === 'api') {
        if (!cfg.apiKey) { statusMsg('API 模式需在设置填 Key'); return; }
        const r = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
          body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, max_tokens: 600 }),
        });
        if (!r.ok) throw new Error('api ' + r.status);
        text = (await r.json()).choices[0].message.content;
      } else {
        const r = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, messages, stream: false, options: { temperature: 0.7, num_predict: 600 } }),
        });
        if (!r.ok) throw new Error('ollama ' + r.status);
        text = (await r.json()).message.content;
      }
      chains = text
        .split('\n')
        .map((l) => l.trim().replace(/^\d+[.．、]\s*/, '').split('-').map((s) => s.trim()).filter(Boolean))
        .filter((c) => c.length >= 2)
        .slice(0, 3);
    } catch (err) {
      statusMsg('联想失败：' + (err instanceof Error ? err.message : String(err)));
      return;
    }
    if (!chains.length) { statusMsg('联想无结果'); return; }
    statusMsg(`联想「${word}」完成`);
    const box = document.createElement('div');
    box.style.cssText = 'grid-column:1/-1;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);padding:10px 12px;';
    box.innerHTML = `
      <div style="font-size:var(--text-xs);font-weight:600;color:var(--fg);margin-bottom:6px;">联想：${word} <span style="color:var(--fg-2);font-weight:400;">（点击词条置入灵感）</span></div>
      ${chains.map((c) => `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:4px;">${c.map((w, i) => (i ? '<span style="color:var(--fg-2);font-size:10px;">→</span>' : '') + `<button class="assoc-word" data-w="${w}" style="background:rgba(158,194,98,.08);border:1px solid var(--border-soft);border-radius:var(--radius-pill);color:var(--fg);font-size:11px;padding:1px 8px;cursor:pointer;">${w}</button>`).join('')}</div>`).join('')}
      <button id="assoc-close" style="margin-top:4px;background:none;border:none;color:var(--fg-2);font-size:11px;cursor:pointer;">收起</button>`;
    result.insertBefore(box, result.firstChild);
    box.querySelectorAll('.assoc-word').forEach((el) => {
      el.addEventListener('click', () => {
        const w = (el as HTMLElement).dataset.w!;
        /* 置入灵感：在结果区加一个"候补词条"卡片 */
        statusMsg(`候补：${w}（可锁定或重新生成融入）`);
        (el as HTMLElement).style.background = 'var(--accent)';
        (el as HTMLElement).style.color = 'var(--accent-on)';
      });
    });
    box.querySelector('#assoc-close')?.addEventListener('click', () => box.remove());
  }

  function bindEvents() {
    result.querySelectorAll('.insp-assoc').forEach((el) => {
      el.addEventListener('click', async () => {
        const word = (el as HTMLElement).dataset.word!;
        await runAssoc(word);
      });
    });
    result.querySelectorAll('.insp-lock').forEach((el) => {
      el.addEventListener('click', () => {
        const k = (el as HTMLElement).dataset.key!;
        if (locks[k] !== undefined) delete locks[k];
        else {
          const row = (el as HTMLElement).closest('.insp-row');
          const val = row?.querySelector('.insp-val')?.textContent ?? '';
          locks[k] = val;
        }
        persistLocks();
        activeCombo = collectCombo();
        renderChar(activeCombo);
      });
    });
    result.querySelectorAll('.insp-count').forEach((el) => {
      el.addEventListener('change', () => {
        groupCounts[parseInt((el as HTMLElement).dataset.g!, 10)] = (el as HTMLSelectElement).value;
        activeCombo = collectCombo();
        renderChar(activeCombo);
      });
    });
  }

  function collectCombo(): Combo {
    const combo: Combo = {};
    result.querySelectorAll('.insp-card').forEach((card, gi) => {
      const g = CHAR_GROUPS[gi];
      const m: Record<string, string> = {};
      card.querySelectorAll('.insp-row').forEach((row) => {
        m[(row as HTMLElement).dataset.key!] = row.querySelector('.insp-val')?.textContent ?? '';
      });
      combo[g.t] = m;
    });
    return combo;
  }

  function renderSaves() {
    savesBox.innerHTML = saves.length
      ? saves.map((_c, i) => `<button data-si="${i}" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);font-size:10px;padding:2px 8px;cursor:pointer;">组合 ${i + 1} ✕</button>`).join('')      : '';
    savesBox.querySelectorAll('[data-si]').forEach((el) => {
      el.addEventListener('click', () => {
        const si = parseInt((el as HTMLElement).dataset.si!, 10);
        if ((el as HTMLElement).textContent?.includes('✕')) { saves.splice(si, 1); persistSaves(); renderSaves(); return; }
        activeCombo = saves[si];
        renderChar(activeCombo);
        statusMsg(`已加载组合 ${si + 1}`);
      });
    });
  }

  host.querySelector('#insp-roll')?.addEventListener('click', () => {
    activeCombo = null;
    renderChar(null);
    statusMsg('已重新生成');
  });
  host.querySelector('#insp-save')?.addEventListener('click', () => {
    if (!lib) return;
    saves.push(collectCombo());
    persistSaves();
    renderSaves();
    statusMsg(`已保存组合 ${saves.length}`);
  });

  /* 加载词库 */
  const api = (window as any).lingkuangAPI;
  try {
    const res = api?.loadCharLib ? await api.loadCharLib() : null;
    if (res?.ok && res.data) lib = res.data;
  } catch { /* fallthrough */ }
  if (!lib) {
    try {
      const r = await fetch('data/character_lib.json');
      if (r.ok) lib = await r.json();
    } catch { /* fallthrough */ }
  }
  if (!lib) { statusMsg('词库加载失败'); return; }
  statusMsg(`${Object.keys(lib).length} 分类 · ${Object.values(lib).reduce((a, v) => a + v.length, 0)} 词条`);
  renderSaves();
  renderChar(null);
}
