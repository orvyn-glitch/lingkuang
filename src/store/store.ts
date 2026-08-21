/** 灵框 · store（单一数据源 + 订阅通知）——数据层与视图解耦 */
import type { WorldData, Worldset } from './types';

export interface Store {
  data: WorldData;
  activeWorld: string;
  activeTimeline: string;
  subscribe(fn: (store: Store) => void): () => void;
  setActiveWorld(name: string): void;
  setActiveTimeline(id: string): void;
  update(fn: (data: WorldData) => void, opts?: { undo?: boolean }): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

function createStore(initial: WorldData): Store {
  let data: WorldData = initial;
  let activeWorld = Object.keys(initial.worldsets)[0] ?? '';
  let activeTimeline = '';
  const listeners = new Set<(s: Store) => void>();
  /* 撤销/重做：JSON 快照栈（上限 100） */
  const undoStack: WorldData[] = [];
  const redoStack: WorldData[] = [];
  const clone = (d: WorldData): WorldData => JSON.parse(JSON.stringify(d)) as WorldData;

  const store: Store = {
    get data() { return data; },
    get activeWorld() { return activeWorld; },
    get activeTimeline() { return activeTimeline; },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setActiveWorld(name) {
      if (!data.worldsets[name]) return;
      activeWorld = name;
      const ws = data.worldsets[name];
      activeTimeline = (ws.order ?? []).find((id) => ws.timelines[id]) || Object.keys(ws.timelines)[0] || '';
      listeners.forEach((fn) => fn(store));
    },
    setActiveTimeline(id) {
      const ws = data.worldsets[activeWorld];
      if (!ws || !ws.timelines[id]) return;
      activeTimeline = id;
      listeners.forEach((fn) => fn(store));
    },
    update(fn, opts) {
      if (opts?.undo !== false) {
        undoStack.push(clone(data));
        if (undoStack.length > 100) undoStack.shift();
        redoStack.length = 0;
      }
      fn(data);
      listeners.forEach((l) => l(store));
    },
    undo() {
      if (!undoStack.length) return;
      redoStack.push(clone(data));
      data = undoStack.pop()!;
      listeners.forEach((l) => l(store));
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(clone(data));
      data = redoStack.pop()!;
      listeners.forEach((l) => l(store));
    },
    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },
  };
  return store;
}

export function currentWorld(store: Store): Worldset {
  return store.data.worldsets[store.activeWorld] ?? { name: '', timelines: {}, order: [], docs: {} };
}

/** 空数据（首次启动） */
export function emptyData(): WorldData {
  return {
    worldsets: {
      新世界: { name: '新世界', timelines: {}, order: [], docs: {} },
    },
  };
}

export default createStore;
