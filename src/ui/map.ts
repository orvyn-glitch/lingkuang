/** 地图模块——手绘矢量地图（区域 + 标记），存 ws.maps[]；基础版照抄 legacy 平滑 */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import type { MapData } from '../store/types';

type Mode = 'region' | 'marker' | 'move';

/** Catmull-Rom 平滑 → SVG path（闭合区域） */
function smoothClosedPath(pts: [number, number][]): string {
  if (pts.length < 3) return pts.map(([x, y]) => `M${x},${y}`).join(' ');
  const p = pts.map((pt) => ({ x: pt[0], y: pt[1] }));
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < p.length; i++) {
    const p0 = p[(i - 1 + p.length) % p.length];
    const p1 = p[i];
    const p2 = p[(i + 1) % p.length];
    const p3 = p[(i + 2) % p.length];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d + ' Z';
}

export function renderMap(store: Store, host: HTMLElement): void {
  const ws = currentWorld(store);
  if (!ws.maps || !ws.maps.length) {
    ws.maps = [{ id: 'm' + Date.now(), name: '默认地图', width: 900, height: 500, regions: [], markers: [], paths: [] }];
  }
  const map: MapData = ws.maps[0];
  let mode: Mode = 'move';
  let drawing: [number, number][] = [];

  host.style.overflow = 'hidden';
  host.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border-soft);background:var(--surface-2);align-items:center;">
        <span style="font-size:var(--text-xs);font-weight:600;color:var(--fg);">地图 · ${map.name}</span>
        <span style="flex:1;"></span>
        <button data-mode="region" class="map-mode" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);font-size:11px;padding:3px 10px;cursor:pointer;">区域</button>
        <button data-mode="marker" class="map-mode" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);font-size:11px;padding:3px 10px;cursor:pointer;">标记</button>
        <button data-mode="move" class="map-mode" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);font-size:11px;padding:3px 10px;cursor:pointer;">移动</button>
        <button id="map-clear" style="background:none;border:1px solid #c0392b;color:#c0392b;border-radius:var(--radius-sm);font-size:11px;padding:3px 10px;cursor:pointer;">清空标记</button>
        <span id="map-hint" style="font-size:var(--text-xs);color:var(--fg-2);">拖拽画区域（松开闭合）</span>
      </div>
      <div style="flex:1;position:relative;overflow:hidden;">
        <svg id="map-svg" width="${map.width}" height="${map.height}" style="position:absolute;left:0;top:0;background:var(--surface-2);touch-action:none;"></svg>
      </div>
    </div>`;

  const svg = host.querySelector('#map-svg') as unknown as SVGSVGElement;
  const hint = host.querySelector('#map-hint') as HTMLElement;
  let labelSeq = 1;

  function setMode(m: Mode) {
    mode = m;
    drawing = [];
    host.querySelectorAll('.map-mode').forEach((b) => (b as HTMLElement).style.background = 'none');
    const btn = host.querySelector(`.map-mode[data-mode="${m}"]`) as HTMLElement;
    if (btn) btn.style.background = 'rgba(158,194,98,.2)';
    hint.textContent = m === 'region' ? '拖拽画区域（松开闭合）' : m === 'marker' ? '点击放置标记' : '拖拽平移';
  }
  host.querySelectorAll('.map-mode').forEach((b) =>
    (b as HTMLElement).addEventListener('click', () => setMode((b as HTMLElement).dataset.mode as Mode))
  );
  host.querySelector('#map-clear')?.addEventListener('click', () => {
    map.markers = [];
    renderSvg();
  });
  setMode('move');

  function renderSvg() {
    const regions = map.regions
      .map(
        (r) =>
          `<path d="${r.path}" fill="${r.fill}" stroke="rgba(58,58,52,.5)" stroke-width="1" style="cursor:pointer;" title="${r.name}"/>`
      )
      .join('');
    const markers = map.markers
      .map(
        (m) =>
          `<g transform="translate(${m.x},${m.y})" style="cursor:pointer;">
            <circle r="6" fill="var(--accent)" stroke="var(--accent-on)" stroke-width="1"/>
            <text y="-10" text-anchor="middle" style="font-size:10px;fill:var(--fg);">${m.label}</text>
          </g>`
      )
      .join('');
    const drawingPath = drawing.length > 1 ? `<path d="${smoothClosedPath(drawing)}" fill="rgba(158,194,98,.15)" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 2"/>` : '';
    svg.innerHTML = regions + markers + drawingPath;
  }

  let panning = false, panX = 0, panY = 0, panSX = 0, panSY = 0;
  svg.addEventListener('pointerdown', (e) => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (mode === 'region') {
      drawing = [[x, y]];
      renderSvg();
    } else if (mode === 'marker') {
      map.markers.push({ id: 'mk' + Date.now(), x, y, label: `M${labelSeq++}` });
      renderSvg();
      save();
    } else {
      panning = true;
      panSX = e.clientX; panSY = e.clientY;
      const r2 = svg.getBoundingClientRect();
      panX = r2.left; panY = r2.top;
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (mode === 'region' && drawing.length) {
      const rect = svg.getBoundingClientRect();
      drawing.push([e.clientX - rect.left, e.clientY - rect.top]);
      renderSvg();
    } else if (panning) {
      svg.style.left = panX + (e.clientX - panSX) + 'px';
      svg.style.top = panY + (e.clientY - panSY) + 'px';
    }
  });
  window.addEventListener('pointerup', () => {
    if (mode === 'region' && drawing.length >= 3) {
      const fill = `rgba(${158 + Math.floor(Math.random() * 60)},${150 + Math.floor(Math.random() * 50)},${98},0.25)`;
      map.regions.push({
        id: 'rg' + Date.now(),
        name: `区域 ${map.regions.length + 1}`,
        points: drawing,
        path: smoothClosedPath(drawing),
        fill,
      });
      save();
    }
    drawing = [];
    panning = false;
    renderSvg();
  });

  function save() {
    store.update((d) => {
      const ws2 = d.worldsets[store.activeWorld];
      if (ws2 && ws2.maps) ws2.maps[0] = map;
    });
  }

  store.subscribe(() => renderSvg());
  renderSvg();
}
