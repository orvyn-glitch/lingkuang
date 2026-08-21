/** 编辑器模块——文稿编辑（节点/实体本体 = doc，Obsidian 式）：
 * 时间线 → 节点列表 → 点节点在下方编辑 doc（#字段：值 自动识别，失焦保存） */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import { saveNodeDoc } from '../store/actions';
import type { Timeline } from '../store/types';

export function renderEditor(store: Store, host: HTMLElement): void {
  host.style.overflow = 'hidden';
  host.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="padding:10px 12px 0;">
        <div style="font-size:15px;font-weight:600;color:var(--fg);">编辑器</div>
        <select id="ed-tl" style="margin-top:8px;width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:5px 8px;font-size:var(--text-sm);outline:none;"></select>
      </div>
      <div id="ed-list" style="flex:1;overflow:auto;padding:6px 8px;"></div>
      <div style="border-top:1px solid var(--border);padding:8px 10px;">
        <textarea id="ed-doc" placeholder="节点文稿（#字段：值 每行一个 + 正文）…" style="width:100%;height:180px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:8px;font-size:var(--text-sm);outline:none;resize:vertical;font-family:var(--font-mono);"></textarea>
        <div id="ed-status" style="font-size:var(--text-xs);color:var(--fg-2);margin-top:4px;">选择左侧节点开始编辑（自动保存）</div>
      </div>
    </div>`;

  const tlSel = host.querySelector('#ed-tl') as HTMLSelectElement;
  const list = host.querySelector('#ed-list') as HTMLElement;
  const docBox = host.querySelector('#ed-doc') as HTMLTextAreaElement;
  const status = host.querySelector('#ed-status') as HTMLElement;
  let currentTlId = '';
  let currentNodeId = '';

  function timeline(): Timeline | undefined {
    const ws = currentWorld(store);
    const valid = (ws.order ?? []).find((id) => ws.timelines[id]);
    const id = (store.activeTimeline && ws.timelines[store.activeTimeline] ? store.activeTimeline : valid) || Object.keys(ws.timelines)[0];
    return id ? ws.timelines[id] : undefined;
  }

  function renderTlSelect() {
    const ws = currentWorld(store);
    const ids = (ws.order ?? []).filter((id) => ws.timelines[id]);
    tlSel.innerHTML = ids.map((id) => `<option value="${id}">${ws.timelines[id]?.name ?? '?'}</option>`).join('');
    const tl = timeline();
    if (tl) tlSel.value = tl.id;
  }

  function renderList() {
    const tl = timeline();
    if (!tl) { list.innerHTML = '<div style="font-size:var(--text-xs);color:var(--fg-2);padding:8px;">无时间线</div>'; return; }
    currentTlId = tl.id;
    const html = tl.nodes
      .map(
        (n) =>
          `<button class="ed-item${n.id === currentNodeId ? ' is-on' : ''}" data-id="${n.id}" style="display:block;width:100%;text-align:left;background:${n.id === currentNodeId ? 'rgba(158,194,98,.12)' : 'none'};border:none;color:var(--fg);font-size:var(--text-xs);padding:5px 8px;border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <span style="font-family:var(--font-mono);color:var(--accent);">${n.year}</span> · ${n.title}
          </button>`
      )
      .join('');
    list.innerHTML = html || '<div style="font-size:var(--text-xs);color:var(--fg-2);padding:8px;">（空时间线）</div>';
    list.querySelectorAll('.ed-item').forEach((el) => {
      el.addEventListener('click', () => {
        currentNodeId = (el as HTMLElement).dataset.id!;
        const n = tl.nodes.find((x) => x.id === currentNodeId);
        docBox.value = n?.doc ?? '';
        status.textContent = `编辑：${n?.title ?? ''}（失焦自动保存）`;
        docBox.focus();
        renderList();
      });
    });
  }

  /* 失焦保存 doc */
  docBox.addEventListener('blur', () => {
    if (!currentNodeId || !currentTlId) return;
    saveNodeDoc(store, currentTlId, currentNodeId, docBox.value);
    status.textContent = '已保存 ✓';
  });

  tlSel.addEventListener('change', () => {
    store.setActiveTimeline(tlSel.value);
    currentNodeId = '';
    docBox.value = '';
    renderList();
  });

  store.subscribe(() => {
    renderTlSelect();
    renderList();
  });
  renderTlSelect();
  renderList();
}
