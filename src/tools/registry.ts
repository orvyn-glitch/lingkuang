/** 灵框 · 工具注册表（工具栏）——模块 = 大视图（灵感/编辑器/AI…） */
import type { Store } from '../store/store';
export interface Tool {
  id: string;
  name: string;
  icon: string;                 // Lucide SVG（内联）
  desc?: string;
  placeholder?: boolean;        // true = 占位（功能未做）
  open?: (host: HTMLElement, store?: Store) => void;
}

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  tools.set(tool.id, tool);
}

export function listTools(): Tool[] {
  return [...tools.values()];
}

export function openTool(id: string, host: HTMLElement, store?: Store): void {
  const tool = tools.get(id);
  if (!tool) return;
  host.innerHTML = '';
  if (tool.open) tool.open(host, store);
  else renderPlaceholder(host, tool);
}
function renderPlaceholder(host: HTMLElement, tool: Tool): void {
  host.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--fg-2);">
      <div style="font-size:28px;opacity:.5;">${tool.icon}</div>
      <div style="font-size:var(--text-sm);">${tool.name}</div>
      <div style="font-size:var(--text-xs);opacity:.6;">占位 · 功能开发中</div>
    </div>`;
}
