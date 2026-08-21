/** 新建节点表单（常驻工具）——标题 + 时间文本（支持 "312" / "312年7月"）+ 类型 */
import type { Store } from '../store/store';
import { addNode } from '../store/actions';

/** 时间文本解析（精简版，照抄 legacy parseTimeText）："312" / "312年7月" / "312年7月15日" */
export function parseTimeText(text: string): { year: number } | null {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = t.match(/^(-?\d+)(?:年)?(?:\s*(\d{1,2})月)?(?:\s*(\d{1,2})日)?$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = m[2] ? parseInt(m[2], 10) : undefined;
  const day = m[3] ? parseInt(m[3], 10) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || day > 31)) return null;
  /* 时间 = 小数年份（月/日折算，与旧数据一致） */
  let y = year;
  if (month) y += (month - 1) / 12;
  if (day) y += (day - 1) / 360;
  return { year: Math.round(y * 1000) / 1000 };
}

export function renderNodeForm(store: Store, host: HTMLElement, tlId: string, tlName: string): void {
  host.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
      <div style="font-size:15px;font-weight:600;color:var(--fg);">添加节点 · ${tlName}</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:var(--text-xs);color:var(--fg-2);">标题</label>
        <input id="nf-title" type="text" placeholder="节点标题" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 8px;font-size:var(--text-sm);outline:none;"/>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:var(--text-xs);color:var(--fg-2);">时间</label>
        <input id="nf-time" type="text" placeholder="312 或 312年7月 或 312年7月15日" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 8px;font-size:var(--text-sm);outline:none;"/>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:var(--text-xs);color:var(--fg-2);">类型</label>
        <select id="nf-type" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:6px 8px;font-size:var(--text-sm);outline:none;">
          <option value="event">事件</option>
          <option value="plot">角色</option>
          <option value="place">地点</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="nf-ok" style="flex:1;background:var(--accent);color:var(--accent-on);border:none;border-radius:var(--radius-sm);padding:7px;font-size:var(--text-sm);cursor:pointer;">确定</button>
        <button id="nf-cancel" style="flex:1;background:var(--surface-2);color:var(--fg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px;font-size:var(--text-sm);cursor:pointer;">取消</button>
      </div>
      <div id="nf-err" style="font-size:var(--text-xs);color:#c0392b;display:none;"></div>
    </div>`;

  const title = host.querySelector('#nf-title') as HTMLInputElement;
  const time = host.querySelector('#nf-time') as HTMLInputElement;
  const type = host.querySelector('#nf-type') as HTMLSelectElement;
  const err = host.querySelector('#nf-err') as HTMLElement;
  title.focus();

  function submit() {
    const t = title.value.trim();
    if (!t) { showErr('标题不能为空'); title.focus(); return; }
    const parsed = parseTimeText(time.value);
    if (time.value.trim() && !parsed) { showErr('时间格式：312 或 312年7月 或 312年7月15日'); return; }
    addNode(store, tlId, {
      title: t,
      type: type.value as 'event' | 'plot' | 'place',
      year: parsed?.year ?? 0,
      precision: 'year',
    });
    host.innerHTML = '';
  }
  function showErr(msg: string) {
    err.textContent = msg;
    err.style.display = '';
  }
  host.querySelector('#nf-ok')?.addEventListener('click', submit);
  host.querySelector('#nf-cancel')?.addEventListener('click', () => (host.innerHTML = ''));
  time.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}
