/** 设置模块——AI 引擎（本地 Ollama / OpenAI 兼容 API）+ 偏好项；存 localStorage */
import type { Store } from '../store/store';

interface Settings {
  aiMode: 'ollama' | 'api';
  baseUrl: string;
  apiKey: string;
  model: string;
  glide: number;      // 平移惯性（0-1）
  sensitivity: number; // 平移敏感度
  rulerDensity: number; // 标尺密度
}

const DEFAULTS: Settings = {
  aiMode: 'ollama',
  baseUrl: 'http://localhost:11434',
  apiKey: '',
  model: 'qwen2.5:7b',
  glide: 0.55,
  sensitivity: 1,
  rulerDensity: 1,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lingkuang-settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings(s: Settings) {
  localStorage.setItem('lingkuang-settings', JSON.stringify(s));
}

export function renderSettings(_store: Store, host: HTMLElement): void {
  const s = loadSettings();
  host.style.overflow = 'auto';
  host.innerHTML = `
    <div style="max-width:520px;margin:0 auto;padding:20px 16px;display:flex;flex-direction:column;gap:14px;">
      <div style="font-size:17px;font-weight:600;color:var(--fg);">设置</div>
      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:var(--text-sm);font-weight:600;color:var(--fg);">联想引擎</div>
        <div style="display:flex;gap:8px;">
          <label style="font-size:var(--text-xs);color:var(--fg-2);display:flex;align-items:center;gap:4px;"><input type="radio" name="aiMode" value="ollama"${s.aiMode === 'ollama' ? ' checked' : ''}/>本地 Ollama（免费 · 需自部署）</label>
          <label style="font-size:var(--text-xs);color:var(--fg-2);display:flex;align-items:center;gap:4px;"><input type="radio" name="aiMode" value="api"${s.aiMode === 'api' ? ' checked' : ''}/>OpenAI 兼容 API（按量付费）</label>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:var(--text-xs);color:var(--fg-2);">Base URL</label>
          <input id="set-baseurl" type="text" value="${s.baseUrl}" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:5px 8px;font-size:var(--text-sm);outline:none;"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:var(--text-xs);color:var(--fg-2);">API Key（本地模式可留空）</label>
          <input id="set-apikey" type="password" value="${s.apiKey}" placeholder="sk-..." style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:5px 8px;font-size:var(--text-sm);outline:none;"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:var(--text-xs);color:var(--fg-2);">模型</label>
          <input id="set-model" type="text" value="${s.model}" placeholder="qwen2.5:7b / gpt-4o-mini" style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--fg);padding:5px 8px;font-size:var(--text-sm);outline:none;"/>
        </div>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:var(--text-sm);font-weight:600;color:var(--fg);">画布偏好</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:var(--text-xs);color:var(--fg-2);width:90px;">平移惯性</span>
          <input id="set-glide" type="range" min="0" max="1" step="0.05" value="${s.glide}" style="flex:1;"/>
          <span id="set-glide-v" style="font-size:var(--text-xs);color:var(--fg-2);width:30px;text-align:right;">${s.glide}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:var(--text-xs);color:var(--fg-2);width:90px;">平移敏感度</span>
          <input id="set-sens" type="range" min="0.2" max="3" step="0.1" value="${s.sensitivity}" style="flex:1;"/>
          <span id="set-sens-v" style="font-size:var(--text-xs);color:var(--fg-2);width:30px;text-align:right;">${s.sensitivity}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:var(--text-xs);color:var(--fg-2);width:90px;">标尺密度</span>
          <input id="set-ruler" type="range" min="0.5" max="2" step="0.1" value="${s.rulerDensity}" style="flex:1;"/>
          <span id="set-ruler-v" style="font-size:var(--text-xs);color:var(--fg-2);width:30px;text-align:right;">${s.rulerDensity}</span>
        </div>
      </div>
      <div style="font-size:var(--text-xs);color:var(--fg-2);">⚠️ 灵框本体免费开源。AI 联想为可选能力——本地部署（自付电费）或第三方 API（费用由提供商收取），均与灵框无关。</div>
      <button id="set-save" style="background:var(--accent);color:var(--accent-on);border:none;border-radius:var(--radius-sm);padding:8px;font-size:var(--text-sm);cursor:pointer;">保存设置</button>
      <div id="set-msg" style="font-size:var(--text-xs);color:var(--accent);"></div>
    </div>`;

  const msg = host.querySelector('#set-msg') as HTMLElement;
  const bind = (id: string, fn: (v: string) => void) => {
    const el = host.querySelector(id) as HTMLInputElement;
    el.addEventListener('input', () => fn(el.value));
    el.addEventListener('change', () => fn(el.value));
    return el;
  };
  bind('#set-baseurl', (v) => (s.baseUrl = v));
  bind('#set-apikey', (v) => (s.apiKey = v));
  bind('#set-model', (v) => (s.model = v));
  bind('#set-glide', (v) => { s.glide = parseFloat(v); (host.querySelector('#set-glide-v') as HTMLElement).textContent = v; });
  bind('#set-sens', (v) => { s.sensitivity = parseFloat(v); (host.querySelector('#set-sens-v') as HTMLElement).textContent = v; });
  bind('#set-ruler', (v) => { s.rulerDensity = parseFloat(v); (host.querySelector('#set-ruler-v') as HTMLElement).textContent = v; });
  host.querySelectorAll('input[name="aiMode"]').forEach((el) => {
    (el as HTMLInputElement).addEventListener('change', () => {
      s.aiMode = (el as HTMLInputElement).value as Settings['aiMode'];
    });
  });
  host.querySelector('#set-save')?.addEventListener('click', () => {
    saveSettings(s);
    msg.textContent = '已保存 ✓';
    setTimeout(() => (msg.textContent = ''), 1500);
  });
}
