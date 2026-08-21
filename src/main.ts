/** 灵框 · 入口（Vite） */
import createStore, { emptyData } from './store/store';
import { renderShell } from './ui/shell';
import './style.css';

/** 数据加载：window.api（Electron IPC）或内存空数据 */
async function loadData() {
  const api = (window as any).lingkuangAPI;
  if (api && api.loadData) {
    const res = await api.loadData();
    if (res && res.ok && res.data) return res.data;
  }
  return emptyData();
}

async function main() {
  const data = await loadData();
  const store = createStore(data);
  /* 自动落盘：任何 store 变化 → 防抖 400ms → IPC 写文件 */
  let saveTimer: number | undefined;
  store.subscribe(() => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const api = (window as any).lingkuangAPI;
      if (api && api.saveData) api.saveData(store.data);
    }, 400);
  });
  const host = document.getElementById('app')!;
  renderShell(store, host);
}

main();
