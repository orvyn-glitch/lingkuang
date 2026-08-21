/** 世界沙盘 · 时间线视图（TS 版核心）——节点横排 + 平移缩放 + 时间指针 + 详情面板 */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import { getTimeline, setTimeCursor } from '../store/actions';
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
    <div class="tl-wrap" style="position:relative;width:100%;height:100%;overflow:hidden;cursor:crosshair;">
      <div class="tl-track" style="position:absolute;top:24px;left:0;right:0;bottom:0;"></div>
      <div class="tl-cursor" style="position:absolute;top:0;bottom:0;width:0;pointer-events:none;display:none;">
        <div style="position:absolute;top:26px;bottom:0;left:-1px;width:2px;background:var(--accent);opacity:.55;"></div>
        <div style="position:absolute;top:4px;left:-8px;width:16px;height:16px;border-radius:50%;background:var(--chrome);border:1px solid var(--accent);cursor:ew-resize;pointer-events:auto;"></div>
      </div>
    </div>`;

  const wrap = host.querySelector('.tl-wrap') as HTMLElement;
  const track = host.querySelector('.tl-track') as HTMLElement;
  const cursorEl = host.querySelector('.tl-cursor') as HTMLElement;
  const view: View = { panX: 0, panY: 0, spacing: 2 };

  /** 有效时间线 id：order 里存在才用，否则回退 timelines 第一个 key（兼容旧数据 order 与 key 不一致） */
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
  function yearX(t: number): number {
    return t * view.spacing + view.panX + 40;
  }

  function render() {
    const tl = timeline();
    if (!tl) {
      track.innerHTML = '<div style="padding:20px;font-size:var(--text-sm);color:var(--fg-2);">无时间线 · 待建</div>';
      return;
    }
    const nodes = tl.nodes;
    track.innerHTML =
      `<div style="position:absolute;left:0;right:0;top:0;height:40px;"></div>` +
      nodes
        .map((n) => {
          const x = yearX(n.year);
          return `<div class="tl-node" data-id="${n.id}" style="position:absolute;left:${x}px;top:8px;display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateX(-50%);">
            <div style="width:10px;height:10px;border-radius:50%;background:${n.type === 'event' ? 'var(--fg)' : 'var(--accent)'};"></div>
            <div style="font-size:10px;margin-top:4px;white-space:nowrap;color:var(--fg);">${n.title}</div>
          </div>`;
        })
        .join('');
    updateCursor();
  }

  function updateCursor() {
    const ws = currentWorld(store);
    const t = ws.timeCursor;
    if (t === null || t === undefined) {
      cursorEl.style.display = 'none';
      return;
    }
    cursorEl.style.display = '';
    cursorEl.style.left = yearX(t) + 'px';
  }

  /* 交互：拖拽空白=设指针；空格+拖拽=平移；Alt+滚轮=缩放 */
  let dragging = false;
  let spaceDown = false;
  let lastX = 0;
  let cursorDrag = false;

  wrap.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.tl-node')) return;
    if (spaceDown) {
      dragging = true;
      lastX = e.clientX;
      wrap.style.cursor = 'grabbing';
      return;
    }
    cursorDrag = true;
    const rect = wrap.getBoundingClientRect();
    setTimeCursor(store, (e.clientX - rect.left - view.panX - 40) / view.spacing);
    updateCursor();
  });
  window.addEventListener('pointermove', (e) => {
    if (dragging) {
      view.panX += e.clientX - lastX;
      lastX = e.clientX;
      render();
      return;
    }
    if (cursorDrag) {
      const rect = wrap.getBoundingClientRect();
      setTimeCursor(store, (e.clientX - rect.left - view.panX - 40) / view.spacing);
      updateCursor();
    }
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    cursorDrag = false;
    wrap.style.cursor = 'crosshair';
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceDown) spaceDown = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false;
  });
  window.addEventListener('blur', () => {
    spaceDown = false;
  });
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const tAt = (mx - view.panX - 40) / view.spacing;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      view.spacing = Math.min(40, Math.max(0.05, view.spacing * factor));
      view.panX = mx - 40 - tAt * view.spacing;
      render();
    },
    { passive: false }
  );

  /* 节点点击 → 详情面板 */
  track.addEventListener('click', (e) => {
    const nodeEl = (e.target as HTMLElement).closest('.tl-node') as HTMLElement | null;
    if (!nodeEl) return;
    const n = timeline()?.nodes.find((x) => x.id === nodeEl.dataset.id);
    if (n && onSelect) onSelect(n);
  });

  store.subscribe(() => render());
  render();
}
