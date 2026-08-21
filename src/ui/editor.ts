/** 编辑器模块——文稿编辑（节点/实体本体 = doc，Obsidian 式）：
 * 时间线 → 节点列表 → 点节点在下方编辑 doc（#字段：值 自动识别，失焦保存） */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import { saveNodeDoc } from '../store/actions';
import type { Timeline } from '../store/types';

export function renderEditor(store: Store, host: HTMLElement): void {
  host.style.overflow = 'hidden';
  host.innerHTML = `
    <div style="display:flex;height:100%;">
      <div style="width:280px;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface-2);">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border-soft);">
          <div style="font-size:15px;font-weight:600;color:var(--fg);">编辑器</div>
          <select id="ed-tl" style="margin-top:8px;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:5px 8px;font-size:var(--text-sm);outline:none;"></select>
        </div>
        <div id="ed-list" style="flex:1;overflow:auto;padding:6px 8px;"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
        <div id="ed-title" style="padding:8px 14px;border-bottom:1px solid var(--border-soft);font-size:var(--text-sm);color:var(--fg-2);">选择左侧节点开始编辑（自动保存）</div>
        <textarea id="ed-doc" placeholder="节点文稿（#字段：值 每行一个 + 正文）…" style="flex:1;width:100%;background:var(--surface);border:none;color:var(--fg);padding:12px 14px;font-size:var(--text-sm);outline:none;resize:none;font-family:var(--font-mono);line-height:1.7;"></textarea>
        <div id="ed-status" style="padding:4px 14px;border-top:1px solid var(--border-soft);font-size:var(--text-xs);color:var(--fg-2);"></div>
      </div>
    </div>`;

  const tlSel = host.querySelector('#ed-tl') as HTMLSelectElement;
  const list = host.querySelector('#ed-list') as HTMLElement;
  const docBox = host.querySelector('#ed-doc') as HTMLTextAreaElement;
  const titleEl = host.querySelector('#ed-title') as HTMLElement;
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
        titleEl.textContent = n?.title ?? '';
        status.textContent = '失焦自动保存';
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
