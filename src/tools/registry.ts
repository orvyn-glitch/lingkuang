/** 灵框 · 工具注册表（工具栏）——工具 = 操作类（灵感/联想/AI/导出…），世界栏放内容 */
export interface Tool {
  id: string;
  name: string;
  icon: string;                 // Lucide SVG（内联）
  desc?: string;
  placeholder?: boolean;        // true = 占位（功能未做）
  open?: (host: HTMLElement) => void;
}

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  tools.set(tool.id, tool);
}

export function listTools(): Tool[] {
  return [...tools.values()];
}

export function openTool(id: string, host: HTMLElement): void {
  const tool = tools.get(id);
  if (!tool) return;
  host.innerHTML = '';
  if (tool.open) tool.open(host);
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
