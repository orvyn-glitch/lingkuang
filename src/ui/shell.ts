/** 灵框 · 壳 UI（世界栏 + 工具栏 + 沙盘）——AE 风：圆角少、工具感强 */
import type { Store } from '../store/store';
import { listTools, openTool } from '../tools/registry';
import { registerAllTools } from '../tools/register';
import { mountTimeline } from './timeline';
import { renderNodeDetail } from './detail';
import { addTimeline } from '../store/actions';
import { currentWorld } from '../store/store';

export function renderShell(store: Store, host: HTMLElement): void {
  registerAllTools();

  host.innerHTML = `
    <div class="lk-app">
      <main class="lk-main">
        <nav class="lk-toolbar" id="lk-toolbar">
          <button class="lk-world-btn" id="lk-world-btn" title="切换世界观">世</button>
          <div class="lk-tool-btns" id="lk-tool-btns"></div>
        </nav>
        <section class="lk-sandbox" id="lk-sandbox">
          <div class="lk-pane lk-pane-timeline" id="lk-pane-timeline">
            <div class="lk-pane-head">世界沙盘 · 时间线 <span class="lk-ph">（功能迁移中）</span></div>
            <div class="lk-pane-body lk-placeholder">时间线视图</div>
          </div>
          <div class="lk-pane lk-pane-map" id="lk-pane-map">
            <div class="lk-pane-head">地图 <span class="lk-ph">（占位）</span></div>
            <div class="lk-pane-body lk-placeholder">地图视图 · Leaflet 重构</div>
          </div>
        </section>
        <aside class="lk-tool-host" id="lk-tool-host"></aside>
      </main>
    </div>`;

  renderWorldBtn(store);
  renderToolbar(store, host);
  renderTimelineTabs(store);
  const timelineBody = document.getElementById('lk-pane-timeline')?.querySelector('.lk-pane-body') as HTMLElement;
  mountTimeline(store, timelineBody, (node) => {
    const toolHost = document.getElementById('lk-tool-host');
    if (toolHost) renderNodeDetail(store, toolHost, node);
  });
  store.subscribe(() => {
    renderWorldBtn(store);
    renderTimelineTabs(store);
  });
}

/** 世界按钮（工具栏左上小方块）：显示当前世界缩写，点击弹出世界列表 */
function renderWorldBtn(store: Store): void {
  const btn = document.getElementById('lk-world-btn');
  if (!btn) return;
  const ws = currentWorld(store);
  const name = ws ? store.activeWorld : '无世界';
  btn.textContent = name.slice(0, 1);
  btn.title = `${name} · 点击切换世界观`;
  let menu = document.getElementById('lk-world-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'lk-world-menu';
    menu.className = 'lk-world-menu';
    document.body.appendChild(menu);
  }
  const names = Object.keys(store.data.worldsets);
  menu.innerHTML = names
    .map(
      (n) =>
        `<button class="lk-world-menu-item${n === store.activeWorld ? ' is-on' : ''}" data-w="${n}">${n}</button>`
    )
    .join('');
  menu.querySelectorAll('.lk-world-menu-item').forEach((el) => {
    el.addEventListener('click', () => {
      store.setActiveWorld((el as HTMLElement).dataset.w!);
      menu.style.display = 'none';
    });
  });
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  };
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('#lk-world-btn, #lk-world-menu')) {
      menu!.style.display = 'none';
    }
  });
}

/** 时间线 tabs（沙盘 pane-head）：切换时间线 + 新建 */
function renderTimelineTabs(store: Store): void {
  const head = document.getElementById('lk-pane-timeline')?.querySelector('.lk-pane-head');
  if (!head) return;
  const ws = currentWorld(store);
  const ids = ws.order ?? [];
  const tabsHtml = ids
    .map(
      (id) =>
        `<button class="lk-tl-tab${id === store.activeTimeline ? ' is-active' : ''}" data-tl="${id}">${ws.timelines[id]?.name ?? '?'}<span class="cnt">${ws.timelines[id]?.nodes.length ?? 0}</span></button>`
    )
    .join('');
  head.innerHTML =
    `<span class="lk-pane-title">世界沙盘 · 时间线</span><span class="lk-tl-tabs">${tabsHtml}<button class="lk-tl-tab is-new" id="lk-tl-new">＋</button></span>`;
  head.querySelectorAll('.lk-tl-tab[data-tl]').forEach((el) => {
    el.addEventListener('click', () => store.setActiveTimeline((el as HTMLElement).dataset.tl!));
  });
  const newBtn = head.querySelector('#lk-tl-new');
  if (newBtn) newBtn.addEventListener('click', () => addTimeline(store, '新时间线'));
}

function renderToolbar(store: Store, host: HTMLElement): void {
  const bar = document.getElementById('lk-tool-btns');
  const toolHost = document.getElementById('lk-tool-host');
  if (!bar || !toolHost) return;
  bar.innerHTML = listTools()
    .map(
      (t) =>
        `<button class="lk-tool-btn${t.placeholder ? ' is-ph' : ''}" data-tool="${t.id}" title="${t.name}${t.placeholder ? '（占位）' : ''}">${t.icon}<span>${t.name}</span></button>`
    )
    .join('');
  bar.querySelectorAll('.lk-tool-btn').forEach((el) => {
    el.addEventListener('click', () => {
      bar.querySelectorAll('.lk-tool-btn').forEach((b) => b.classList.remove('is-active'));
      el.classList.add('is-active');
      openTool((el as HTMLElement).dataset.tool!, toolHost);
    });
  });
}
