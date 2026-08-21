/** 灵框 · 壳 UI（世界栏 + 工具栏 + 沙盘）——AE 风：圆角少、工具感强 */
import type { Store } from '../store/store';
import { listTools, openTool } from '../tools/registry';
import { registerAllTools } from '../tools/register';
import { mountTimeline } from './timeline';
import { renderNodeDetail } from './detail';

export function renderShell(store: Store, host: HTMLElement): void {
  registerAllTools();

  host.innerHTML = `
    <div class="lk-app">
      <header class="lk-worldbar">
        <div class="lk-worldbar-tabs" id="lk-world-tabs"></div>
      </header>
      <main class="lk-main">
        <nav class="lk-toolbar" id="lk-toolbar"></nav>
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

  renderWorldTabs(store);
  renderToolbar(store, host);
  const timelineBody = document.getElementById('lk-pane-timeline')?.querySelector('.lk-pane-body') as HTMLElement;
  mountTimeline(store, timelineBody, (node) => {
    const toolHost = document.getElementById('lk-tool-host');
    if (toolHost) renderNodeDetail(store, toolHost, node);
  });
  store.subscribe(() => renderWorldTabs(store));
}

function renderWorldTabs(store: Store): void {
  const tabs = document.getElementById('lk-world-tabs');
  if (!tabs) return;
  const worlds = Object.keys(store.data.worldsets);
  tabs.innerHTML = worlds
    .map(
      (w) =>
        `<button class="lk-world-tab${w === store.activeWorld ? ' is-active' : ''}" data-world="${w}">${w}</button>`
    )
    .join('');
  tabs.querySelectorAll('.lk-world-tab').forEach((el) => {
    el.addEventListener('click', () => store.setActiveWorld((el as HTMLElement).dataset.world!));
  });
}

function renderToolbar(store: Store, host: HTMLElement): void {
  const bar = document.getElementById('lk-toolbar');
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
