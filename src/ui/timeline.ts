/** 世界沙盘 · 时间线视图（TS 版，批量迁移 legacy 核心）
 * 节点横排 + 标尺刻度 + 平移缩放 + 时间指针 + 节点拖动改时间 + fit 视图
 */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import { getTimeline, setTimeCursor, saveNodeDoc } from '../store/actions';
import type { Timeline, TimelineNode } from '../store/types';

interface View {
  panX: number;
  panY: number;
  spacing: number;      // px/年
}

export function mountTimeline(
  store: Store,
  host: HTMLElement,
  onSelect?: (node: TimelineNode) => void
): void {
  host.innerHTML = `
    <div class="tl-wrap" style="position:relative;width:100%;height:100%;overflow:hidden;cursor:default;">
      <div class="tl-scale" style="position:absolute;top:0;left:0;right:0;height:26px;border-bottom:1px solid var(--border-soft);background:var(--surface-2);overflow:hidden;"></div>
      <div class="tl-track" style="position:absolute;top:26px;left:0;right:0;bottom:0;cursor:crosshair;"></div>
      <div class="tl-cursor" style="position:absolute;top:0;bottom:0;width:0;pointer-events:none;display:none;z-index:5;">
        <div style="position:absolute;top:30px;bottom:0;left:-1px;width:2px;background:var(--accent);opacity:.55;"></div>
        <div class="tl-cursor-handle" style="position:absolute;top:4px;left:-9px;width:18px;height:18px;border-radius:50%;background:var(--chrome);border:1px solid var(--accent);cursor:ew-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>
        <div class="tl-cursor-time" style="position:absolute;top:24px;left:6px;font-family:var(--font-mono);font-size:9px;color:var(--accent);background:rgba(15,15,17,.8);padding:1px 5px;border-radius:3px;white-space:nowrap;"></div>
      </div>
    </div>`;

  const wrap = host.querySelector('.tl-wrap') as HTMLElement;
  const scaleEl = host.querySelector('.tl-scale') as HTMLElement;
  const track = host.querySelector('.tl-track') as HTMLElement;
  const cursorEl = host.querySelector('.tl-cursor') as HTMLElement;
  const cursorTimeEl = cursorEl.querySelector('.tl-cursor-time') as HTMLElement;
  const view: View = { panX: 0, panY: 0, spacing: 2 };

  /* ── 坐标换算（照抄 legacy）── */
  function timeToX(t: number): number { return t * view.spacing + view.panX + 40; }
  function xToTime(x: number): number { return (x - 40 - view.panX) / view.spacing; }

  /* ── 有效时间线 id（兼容旧数据 order 与 key 不一致）── */
  function activeTimelineId(): string | undefined {
    const ws = currentWorld(store);
    const valid = (ws.order ?? []).find((id) => ws.timelines[id]);
    if (store.activeTimeline && ws.timelines[store.activeTimeline]) return store.activeTimeline;
    return valid || Object.keys(ws.timelines)[0];
  }
  function timeline(): Timeline | undefined {
    const id = activeTimelineId();
    return id ? getTimeline(store, id) : undefined;
  }

  /* ── 标尺刻度（照抄 legacy niceStep/buildScale）── */
  function niceStep(raw: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function fmtScale(t: number): string {
    if (t < 0) return `公元前 ${-t} 年`;
    return `${t} 年`;
  }
  function renderScale() {
    const raw = 100 / view.spacing;               // 100px 容器的年跨度
    const step = niceStep(raw);
    const t0 = Math.floor(xToTime(0) / step) * step;
    const t1 = Math.ceil(xToTime(wrap.clientWidth) / step) * step;
    let html = '';
    for (let t = t0; t <= t1; t += step) {
      const x = timeToX(t);
      html += `<div style="position:absolute;left:${x}px;top:0;height:100%;border-left:1px solid var(--border-soft);">
        <span style="position:absolute;top:3px;left:4px;font-family:var(--font-mono);font-size:9px;color:var(--fg-2);white-space:nowrap;">${fmtScale(Math.round(t * 100) / 100)}</span></div>`;
    }
    scaleEl.innerHTML = html;
  }

  /* ── 渲染节点 ── */
  let selectedId: string | null = null;
  function render() {
    const tl = timeline();
    if (!tl) {
      track.innerHTML = '<div style="padding:20px;font-size:var(--text-sm);color:var(--fg-2);">无时间线 · 待建</div>';
      scaleEl.innerHTML = '';
      return;
    }
    const nodes = tl.nodes;
    track.innerHTML = nodes
      .map((n) => {
        const x = timeToX(n.year);
        const sel = n.id === selectedId;
        return `<div class="tl-node${sel ? ' is-sel' : ''}" data-id="${n.id}" style="position:absolute;left:${x}px;top:12px;display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateX(-50%);${sel ? 'z-index:3;' : ''}">
          <div style="width:10px;height:10px;border-radius:50%;background:${n.type === 'event' ? 'var(--fg)' : 'var(--accent)'};${sel ? 'outline:2px solid var(--accent);outline-offset:2px;' : ''}"></div>
          <div style="font-size:10px;margin-top:4px;white-space:nowrap;color:var(--fg);">${n.title}</div>
        </div>`;
      })
      .join('');
    renderScale();
    updateCursor();
  }

  /* ── 时间指针 ── */
  function updateCursor() {
    const ws = currentWorld(store);
    const t = ws.timeCursor;
    if (t === null || t === undefined) { cursorEl.style.display = 'none'; return; }
    cursorEl.style.display = '';
    cursorEl.style.left = timeToX(t) + 'px';
    cursorTimeEl.textContent = fmtScale(Math.round(t * 100) / 100);
    /* 未发生节点淡化 */
    track.querySelectorAll('.tl-node').forEach((el) => {
      const n = (el as HTMLElement).dataset.id;
      const node = timeline()?.nodes.find((x) => x.id === n);
      if (node) (el as HTMLElement).style.opacity = node.year > t ? '0.4' : '';
    });
  }

  /* ── fit 视图（缩放适配全部节点）── */
  function fitAll() {
    const tl = timeline();
    if (!tl || !tl.nodes.length) { view.panX = 0; view.spacing = 2; return; }
    const years = tl.nodes.map((n) => n.year);
    const lo = Math.min(...years), hi = Math.max(...years);
    const span = Math.max(1, hi - lo);
    view.spacing = Math.min(40, Math.max(0.05, (wrap.clientWidth - 120) / span));
    view.panX = 40 - lo * view.spacing;
    render();
  }

  /* ── 交互状态 ── */
  let spaceDown = false;
  let dragging = false;        // 空格平移
  let lastX = 0;
  let cursorDrag = false;      // 空白拖动指针
  let nodeDragId: string | null = null;
  let nodeDragMoved = false;

  wrap.addEventListener('pointerdown', (e) => {
    const nodeEl = (e.target as HTMLElement).closest('.tl-node') as HTMLElement | null;
    if (nodeEl) {
      /* 节点：点击选中 / 拖动改时间 */
      nodeDragId = nodeEl.dataset.id;
      nodeDragMoved = false;
      lastX = e.clientX;
      return;
    }
    if (spaceDown) {
      dragging = true;
      lastX = e.clientX;
      wrap.style.cursor = 'grabbing';
      return;
    }
    cursorDrag = true;
    const rect = wrap.getBoundingClientRect();
    setTimeCursor(store, xToTime(e.clientX - rect.left));
  });
  window.addEventListener('pointermove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (nodeDragId) {
      if (Math.abs(e.clientX - lastX) > 2) nodeDragMoved = true;
      if (nodeDragMoved) {
        const tl = timeline();
        const n = tl?.nodes.find((x) => x.id === nodeDragId);
        if (n) {
          n.year = Math.round(xToTime(mx) * 10) / 10;
          render();
          saveNodeDoc(store, tl!.id, n.id, n.doc ?? '');   // 触发持久化
        }
      }
      return;
    }
    if (dragging) {
      view.panX += e.clientX - lastX;
      lastX = e.clientX;
      render();
      return;
    }
    if (cursorDrag) {
      setTimeCursor(store, xToTime(mx));
    }
  });
  window.addEventListener('pointerup', (e) => {
    const wasNodeClick = nodeDragId && !nodeDragMoved;
    if (wasNodeClick) {
      const n = timeline()?.nodes.find((x) => x.id === nodeDragId);
      if (n) {
        selectedId = n.id;
        render();
        if (onSelect) onSelect(n);
      }
    }
    nodeDragId = null;
    nodeDragMoved = false;
    dragging = false;
    cursorDrag = false;
    wrap.style.cursor = 'default';
    if (cursorDrag) { /* 已在 pointerup 前松开 */ }
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !spaceDown) spaceDown = true; });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  window.addEventListener('blur', () => { spaceDown = false; });

  /* Ctrl+滚轮缩放（以鼠标为中心，照抄 legacy）；双击空白 fit */
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const tAt = xToTime(mx);
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      view.spacing = Math.min(40, Math.max(0.05, view.spacing * factor));
      view.panX = mx - 40 - tAt * view.spacing;
      render();
    },
    { passive: false }
  );
  wrap.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).closest('.tl-node')) return;
    fitAll();
  });

  /* 指针手柄拖动 */
  const handle = cursorEl.querySelector('.tl-cursor-handle') as HTMLElement;
  let handleDrag = false;
  handle.addEventListener('pointerdown', (e) => {
    if (!cursorEl.style.display) return;
    handleDrag = true;
    e.stopPropagation();
  });
  window.addEventListener('pointermove', (e) => {
    if (!handleDrag) return;
    const rect = wrap.getBoundingClientRect();
    setTimeCursor(store, xToTime(e.clientX - rect.left));
  });
  window.addEventListener('pointerup', () => { handleDrag = false; });

  store.subscribe(() => render());
  render();
  requestAnimationFrame(() => fitAll());
}
