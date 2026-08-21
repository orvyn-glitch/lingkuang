/** 灵感触发器——随机角色生成（词库 58 分类；照抄 legacy 生成/锁定/组数逻辑） */
import type { Store } from '../store/store';

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
    <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:15px;font-weight:600;color:var(--fg);">灵感触发器</span>
        <span id="insp-status" style="font-size:var(--text-xs);color:var(--fg-2);">加载词库…</span>
      </div>
      <div id="insp-result" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div style="display:flex;gap:8px;position:sticky;bottom:0;background:var(--surface);padding:6px 0;">
        <button id="insp-roll" style="flex:1;background:var(--accent);color:var(--accent-on);border:none;border-radius:var(--radius-sm);padding:8px;font-size:var(--text-sm);cursor:pointer;">重新生成</button>
        <button id="insp-save" style="flex:1;background:var(--surface-2);color:var(--fg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;font-size:var(--text-sm);cursor:pointer;">保存组合</button>
      </div>
      <div id="insp-saves" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
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

  function bindEvents() {
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
