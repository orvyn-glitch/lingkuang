/** 节点详情面板（TS 版）——文稿本体渲染：字段卡片 + 正文；逻辑照抄 legacy showDetail/parseDoc */
import type { Store } from '../store/store';
import { currentWorld } from '../store/store';
import type { TimelineNode } from '../store/types';

interface ParsedDoc {
  fields: { k: string; v: string }[];
  body: string;
  timeText: string | null;
}

export function parseDoc(doc: string | undefined): ParsedDoc {
  const fields: { k: string; v: string }[] = [];
  const bodyLines: string[] = [];
  let timeText: string | null = null;
  String(doc || '')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^#\s*([^：:]+)[：:]\s*(.*)$/);
      if (m && m[1].trim()) {
        if (m[1].trim() === '时间') timeText = m[2].trim();
        fields.push({ k: m[1].trim(), v: m[2].trim() });
      } else bodyLines.push(line);
    });
  return { fields, body: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), timeText };
}

export function fmtNodeTime(n: TimelineNode): string {
  const y = Math.round(n.year * 100) / 100;
  if (n.precision === 'year') return `${y}年`;
  const m = n.month ? `${n.month}月` : '';
  const d = n.day ? `${n.day}日` : '';
  const h = n.hour !== undefined ? `${n.hour}时` : '';
  const mi = n.minute !== undefined ? `${n.minute}分` : '';
  return `${y}年${m}${d}${h}${mi}`;
}

export function renderNodeDetail(store: Store, host: HTMLElement, node: TimelineNode): void {
  const { fields, body } = parseDoc(node.doc);
  const timeText = fields.find((f) => f.k === '时间')?.v ?? fmtNodeTime(node);

  host.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:15px;font-weight:600;color:var(--fg);">${node.title}</span>
        <span style="font-size:var(--text-xs);color:var(--fg-2);font-family:var(--font-mono);">${timeText}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--fg-2);">${node.type} · 详情（编辑后续接）</div>
      <div id="d-fields" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div style="font-size:var(--text-sm);color:var(--fg);line-height:1.6;white-space:pre-wrap;">${escapeHtml(body || '(空正文)')}</div>
    </div>`;

  const fieldsBox = host.querySelector('#d-fields') as HTMLElement;
  fields.forEach((f) => {
    fieldsBox.appendChild(makeFieldCard(f.k, f.v));
  });
}

function makeFieldCard(k: string, v: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);overflow:hidden;';
  const head = document.createElement('div');
  head.style.cssText =
    'padding:2px 8px;font-size:10px;color:var(--accent);font-weight:600;font-family:var(--font-mono);border-bottom:1px solid var(--border-soft);background:rgba(158,194,98,0.08);';
  head.textContent = k;
  const val = document.createElement('div');
  val.style.cssText = 'padding:5px 8px;font-size:var(--text-sm);color:var(--fg);min-height:20px;outline:none;';
  val.textContent = v;
  card.appendChild(head);
  card.appendChild(val);
  return card;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
