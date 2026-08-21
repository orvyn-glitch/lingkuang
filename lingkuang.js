
(function () {
  /* ── clock ─────────────────────────────────────────────── */
  var clock = document.getElementById('clock');
  function tick() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  tick(); setInterval(tick, 1000);

  /* ── view switching ────────────────────────────────────── */
  var views = {
    lobby: document.getElementById('view-lobby'),
    timeline: document.getElementById('view-timeline'),
    editor: document.getElementById('view-editor'),
    char: document.getElementById('view-char')
  };
  var navItems = document.querySelectorAll('.seam__item');

  /* ── 插件化：工具注册表 + 大厅卡片自动渲染 ────────────────
     新工具 = registerTool({ id, name, icon, desc, meta:[], el })
     大厅卡片自动生成；el 为工具的视图容器（可选，无则点击只切 nav） */
  var tools = {};
  var toolViews = {};
  function registerTool(tool) {
    if (!tool || !tool.id) return;
    tools[tool.id] = tool;
    if (tool.el) toolViews[tool.id] = tool.el;
    renderLobbyCards();
  }
  function renderLobbyCards() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.keys(tools).forEach(function (id) {
      var t = tools[id];
      var card = document.createElement('article');
      card.className = 'niche';
      card.innerHTML = '<div class="niche__cell">' + (t.icon || '·') + '</div>'
        + '<div class="niche__title">' + (t.name || id) + '</div>'
        + (t.desc ? '<p class="niche__desc">' + t.desc + '</p>' : '')
        + (t.meta ? '<div class="niche__meta"><span>' + t.meta.join('</span><span>') + '</span></div>' : '');
      card.addEventListener('click', function () {
        if (t.onOpen) t.onOpen();
        if (t.el || views[t.id]) showView(id);   /* 无视图的工具（纯装饰）不切视图 */
      });
      grid.appendChild(card);
    });
  }
  /* 暴露给外部插件文件（js/tool-*.js 通过 window.LINGKUANG.registerTool 注册） */
  window.LINGKUANG = window.LINGKUANG || {};
  window.LINGKUANG.registerTool = registerTool;
  window.LINGKUANG.showView = function (name) { showView(name); };

  function showView(name) {
    navItems.forEach(function (it) {
      if (it.dataset.nav === name) it.classList.add('is-active');
      else it.classList.remove('is-active');
    });
    Object.keys(views).forEach(function (k) {
      views[k].setAttribute('data-hidden', k === name ? '0' : '1');
    });
    Object.keys(toolViews).forEach(function (k) {
      if (toolViews[k] && toolViews[k].setAttribute) toolViews[k].setAttribute('data-hidden', k === name ? '0' : '1');
    });
    /* opening the timeline from elsewhere → fit the whole range */
    if (name === 'timeline' && stage && stageReady) {
      NODE_SPACING = fitSpacing();
      renderTimeline(false);
      applyModeView();
      applyPan();
    }
  }
  /* ── 内建工具注册（作为插件；灵感触发器/时间线/编辑器是现有视图）── */
  registerTool({ id: 'timeline', name: '世界观时间线', icon: '🌍',
    desc: '那些时间的边角。节点会记住你把它放在哪里，以及你当时的心情。',
    meta: ['时间线', '拖拽平移 · Alt 缩放'], el: views.timeline });
  registerTool({ id: 'editor', name: '文本编辑器', icon: '📝',
    desc: '一张没有人看过的纸。写下的字会在你离开很久后，仍然有温度。',
    meta: ['编辑器', 'Markdown 双栏'], el: views.editor });
  registerTool({ id: 'char', name: '灵感触发器', icon: '骰',
    desc: '从词库的角落里抽一张脸。发色、身世、执念——都由骰子替你决定。',
    meta: ['随机角色 · 58 分类', '4669 词条'], el: views.char });
  registerTool({ id: 'system', name: '系统工具', icon: '⚙️',
    desc: '机器的低语。灯光开关、风扇转速、还有那些嗡嗡作响的东西。',
    meta: ['系统 · 通道正常', '嗡嗡声 · 低'] });
  navItems.forEach(function (it) {
    it.addEventListener('click', function () { showView(it.dataset.nav); });
  });

  /* 大厅卡片由 registerTool 渲染并绑定点击（见插件化框架）——
     这里只保留 grid 引用给搜索过滤用 */
  var grid = document.getElementById('grid');
  var search = document.querySelector('.search input');
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    Array.prototype.forEach.call(grid.children, function (c) {
      var txt = c.textContent.toLowerCase();
      c.style.display = txt.indexOf(q) !== -1 ? '' : 'none';
    });
  });

  /* ── timeline data + Obsidian-style horizontal render ───── */
  var stage = document.getElementById('tl-stage');
  var track = document.getElementById('tl-track');
  var cursorEl = document.getElementById('tl-cursor');
  var nodesEl = document.getElementById('tl-nodes');
  var scaleEl = document.getElementById('tl-scale');
  var emptyEl = document.getElementById('tl-empty');
  var managerEl = document.getElementById('tl-tabs');
  var detailEl = document.getElementById('tl-detail');

  /* each timeline is stored as { id, name, nodes: [] }; data keyed by id */
  /* seed data now lives in data/worldbuilding.js (window.__SEED_TIMELINES__)
     so code and world data stay separate for open-sourcing. */
  var timelines = window.__SEED_TIMELINES__ || {};
  var order = ['wiselight', 'phantom', 'ouroboros', 'newline'];
  var activeId = 'wiselight';
  var activeNodeId = null;
  /* ── 多条循环：tl.loops 数组（每条循环独立 id/name/时间段/样式）── */
  function loopsOf(tl) { return (tl && Array.isArray(tl.loops)) ? tl.loops : []; }
  function loopById(tl, id) {
    var ls = loopsOf(tl);
    for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i];
    return null;
  }
  /* node → 所属循环（用 _loopId 定位） */
  function nodeLoop(tl, n) { return (n && n._loopId !== undefined) ? loopById(tl, n._loopId) : null; }
  function findNodeById(tl, id) {
    var ns = (tl && Array.isArray(tl.nodes)) ? tl.nodes : [];
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return ns[i];
    return null;
  }
  /* 循环的时间范围 = [startNode, endNode] 的 absYear 区间 */
  function loopRange(tl, L) {
    var startN = findNodeById(tl, L.startNodeId);
    var endN = findNodeById(tl, L.endNodeId);
    if (!startN || !endN) return null;
    return { lo: absYearOf(startN, tl), hi: absYearOf(endN, tl) };
  }
  /* 旧数据迁移：单 tl.loop → tl.loops 数组；旧「周期循环」（styles/interval/count）
     → 展开成平铺节点 + 循环绑定起始/结束节点（边界节点 type=loop-boundary） */
  function migrateLoops() {
    Object.keys(timelines).forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;
      if (tl.loop && !tl.loops) {
        tl.loops = [tl.loop];
        delete tl.loop;
      }
      if (!Array.isArray(tl.loops)) tl.loops = [];
      if (!Array.isArray(tl.nodes)) tl.nodes = [];
      /* 给无 id 的节点补 id（循环边界引用需要唯一 id） */
      tl.nodes.forEach(function (n, ni) {
        if (!n.id) n.id = 'n_' + ni + '_' + Math.random().toString(36).slice(2, 8);
      });
      var newLoops = [];
      tl.loops.forEach(function (L, li) {
        if (L.startNodeId !== undefined) { newLoops.push(L); return; }  /* 已是新结构 */
        var span = L.interval || 592, cnt = L.count || 3;
        var baseLocal = L.baseYear !== undefined ? L.baseYear : 0;
        var startId = null, endId = null;
        for (var c = 0; c < cnt; c++) {
          var style = (L.styles && L.styles[c % L.styles.length]) || { nodes: [] };
          (style.nodes || []).forEach(function (n) {
            var node = JSON.parse(JSON.stringify(n));
            node.id = 'n_' + li + '_' + c + '_' + Math.random().toString(36).slice(2, 8);
            node.year = baseLocal + c * span + toNumber(n.year);
            if (node.type !== 'plot') node.type = 'event';
            tl.nodes.push(node);
            if (!startId) startId = node.id;
            endId = node.id;
          });
        }
        if (startId && endId) {
          tl.nodes.forEach(function (n) {
            if (n.id === startId) { n.type = 'loop-boundary'; n.boundary = (startId === endId) ? 'both' : 'start'; }
            else if (n.id === endId) { n.type = 'loop-boundary'; n.boundary = 'end'; }
          });
          newLoops.push({ id: L.id || ('lp' + li), name: L.name || '循环', startNodeId: startId, endNodeId: endId, count: L.count || 1 });
        }
      });
      tl.loops = newLoops;
    });
  }
  migrateLoops();   /* seed 数据也迁移一次 */
  /* 剧情线迁移：兼容旧数据——旧 nodeIds 集合 → 年份区间（取 min/max）；
     旧章节式 storyRanges（startNodeId/endNodeId）→ 年份区间。
     timelines 是对象映射 {id: tl}，须用 Object.keys 遍历。 */
  function migrateStorylines() {
    Object.keys(timelines).forEach(function (tlId) {
      var tl = timelines[tlId];
      if (!tl || typeof tl !== 'object') return;
      var migrateOne = function (sr, i) {
        var lo = Infinity, hi = -Infinity;
        /* 旧 nodeIds 集合：取节点年份 min/max */
        if (Array.isArray(sr.nodeIds)) {
          sr.nodeIds.forEach(function (nid) {
            var n = findNodeById(tl, nid);
            if (n) {
              var y = absYearOf(n, tl);
              if (y < lo) lo = y;
              if (y > hi) hi = y;
            }
          });
        }
        /* 旧章节式起终节点 */
        if (!isFinite(lo) && sr.startNodeId && sr.endNodeId) {
          var s = findNodeById(tl, sr.startNodeId), e = findNodeById(tl, sr.endNodeId);
          if (s && e) {
            var sy = absYearOf(s, tl), ey = absYearOf(e, tl);
            lo = Math.min(sy, ey); hi = Math.max(sy, ey);
          }
        }
        if (!isFinite(lo)) { lo = sr.startYear !== undefined ? sr.startYear : 0; hi = sr.endYear !== undefined ? sr.endYear : lo; }
        return { id: sr.id || ('sl_' + Date.now() + '_' + i), name: sr.name || ('剧情线 ' + (i + 1)),
          segments: [{ start: Math.min(lo, hi), end: Math.max(lo, hi) }] };
      };
      if (Array.isArray(tl.storyRanges) && !Array.isArray(tl.storylines)) {
        tl.storylines = tl.storyRanges.map(migrateOne);
      }
      if (Array.isArray(tl.storylines)) {
        /* 已有 storylines 但仍是旧单段结构（startYear/endYear 或 nodeIds）→ 转 segments */
        tl.storylines = tl.storylines.map(function (sr, i) {
          if (Array.isArray(sr.segments)) return sr;
          return migrateOne(sr, i);
        });
      }
      if (!Array.isArray(tl.storylines)) tl.storylines = [];
    });
  }
  migrateStorylines();   /* seed 数据也迁移一次 */
  /* worldset container — each named world keeps its own slice */
  var worldsets = { '示例世界观': { timelines: timelines, order: order, docs: {} } };
  var activeWorldset = '示例世界观';

  /* ── persistence: the worldbuilding data lives in localStorage so edits
       survive a refresh. Initial data above is only the seed/first-run. */
  var LS_KEY = 'lingkuang-timelines-v1';
  /* ── persistence ───────────────────────────────────────────
     Electron: user-data/worldbuilding.json via lingkuangAPI (file).
     Browser:  localStorage fallback. Both store {timelines, order}. */
  var LS_KEY = 'lingkuang-timelines-v1';
  var api = (typeof window !== 'undefined' && window.lingkuangAPI) ? window.lingkuangAPI : null;
  /* undo stack — the CORRECT pattern: saveTimelines() is called AFTER a
     mutation, so we push the PREVIOUS saved state (the state before this
     edit). `lastSaved` holds it; on save we push lastSaved (if different)
     and update lastSaved to the new current state. */
  var undoStack = [];
  var undoRedoStack = [];   /* redo stack */
  var undoing = false;      /* suppress snapshotting while restoring */
  var lastSaved = JSON.stringify({ timelines: timelines, order: order });
  function pushUndo() {
    if (undoing) return;
    var cur = JSON.stringify({ timelines: timelines, order: order });
    if (cur === lastSaved) return;   /* no actual change — skip */
    undoStack.push(lastSaved);       /* pre-edit state */
    if (undoStack.length > 30) undoStack.shift();
    undoRedoStack.length = 0;        /* new edit invalidates redo */
    lastSaved = cur;
  }
  function undoTimeline() {
    if (!undoStack.length) return;
    undoRedoStack.push(lastSaved);
    var snap = JSON.parse(undoStack.pop());
    undoing = true;
    timelines = snap.timelines;
    order = snap.order;
    lastSaved = JSON.stringify({ timelines: timelines, order: order });
    /* renderTimeline 内 focusTrackTop 会重置 panX=0，须 keepPanX 恢复视角，否则撤销后飞回原点 */
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    syncNodeY();
    applyPan();
    if (typeof renderEditor === 'function') renderEditor();
    saveTimelines();   /* persist the undo (undoing=true → no re-push) */
    undoing = false;
  }
  function redoTimeline() {
    if (!undoRedoStack.length) return;
    undoStack.push(lastSaved);
    var snap = JSON.parse(undoRedoStack.pop());
    undoing = true;
    timelines = snap.timelines;
    order = snap.order;
    lastSaved = JSON.stringify({ timelines: timelines, order: order });
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    syncNodeY();
    applyPan();
    if (typeof renderEditor === 'function') renderEditor();
    saveTimelines();   /* persist the redo (undoing=true → no re-push) */
    undoing = false;
  }
  /* save persists AND snapshots: pushUndo captures the pre-edit state */
  function saveTimelines() {
    pushUndo();
    /* worldset container: each named world is its own data slice */
    var ws = worldsets[activeWorldset];
    if (!ws) { worldsets[activeWorldset] = ws = { timelines: timelines, order: order, docs: docs }; }
    ws.timelines = timelines; ws.order = order; ws.docs = docs;
    var payload = { worldsets: worldsets, active: activeWorldset };
    if (api) {
      api.saveData(payload).then(function (r) { if (!r.ok) console.warn('save failed', r.error); });
      return;
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) { /* storage full / private mode — edits stay in-memory */ }
  }
  /* load a data payload (file or localStorage) into the active worldset */
  function applyLoaded(data) {
    var wss = data.worldsets;
    var act = data.active;
    if (wss && typeof wss === 'object') {
      /* worldset container: switch to the saved active set, but keep any
         built-in sets (e.g. 示例世界观) that the file doesn't override */
      var merged = {};
      Object.keys(worldsets).forEach(function (k) { merged[k] = worldsets[k]; });
      Object.keys(wss).forEach(function (k) { merged[k] = wss[k]; });
      worldsets = merged;
      if (!worldsets[act]) act = Object.keys(worldsets)[0];
      activeWorldset = act;
    } else if (data && data.timelines) {
      /* legacy single-slice format → migrate into '我的世界观' */
      worldsets = { '我的世界观': { timelines: data.timelines, order: data.order || order, docs: data.docs || {} } };
      activeWorldset = '我的世界观';
    } else {
      return false;
    }
    var ws = worldsets[activeWorldset] || {};
    timelines = ws.timelines || {};
    migrateLoops();   /* upgrade legacy tl.loop → tl.loops on load */
    migrateStorylines();   /* 旧章节式 storyRanges → 剧情线（对象映射遍历） */
    if (typeof loadTimeCursor === 'function') loadTimeCursor();   /* 加载当前世界观的指针 */
    order = Array.isArray(ws.order) && ws.order.length ? ws.order : Object.keys(timelines);
    docs = ws.docs || docs;
    if (typeof refreshWorldsetBtn === 'function') refreshWorldsetBtn();
    return true;
  }
  function loadTimelines() {
    if (api) {
      /* Electron: ask main process for the file (async) */
      api.loadData().then(function (r) {
        if (r.ok && r.data && applyLoaded(r.data)) {
          /* reset undo baseline to the loaded file state — must happen
             even if the stage isn't ready yet, else the first undo
             restores the seed instead of the user's file */
          if (typeof lastSaved !== 'undefined') {
            lastSaved = JSON.stringify({ timelines: timelines, order: order });
            undoStack.length = 0;
            undoRedoStack.length = 0;
          }
          /* if a UI was already rendered with seed data, refresh it */
          if (typeof renderTimeline === 'function' && stageReady) applyLoadedData();
        }
      });
      return;
    }
    var raw;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      if (applyLoaded(data)) {
        if (typeof lastSaved !== 'undefined') {
          lastSaved = JSON.stringify({ timelines: timelines, order: order });
          undoStack.length = 0;
          undoRedoStack.length = 0;
        }
      }
    } catch (e) { /* corrupted — keep the seed data */ }
  }
  loadTimelines();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toNumber(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return 0;
    return n;
  }

  function fmtYear(y) {
    if (y < 0) return '公元前 ' + (-y) + ' 年';
    if (y === 0) return '公元 0 年';
    return '公元 ' + y + ' 年';
  }

  /* node time precision: year (+ month + day) — converts to a fractional
     absolute year for canvas positioning. month/day are 1-based. */
  function nodeToTime(n) {
    var y = toNumber(n.year);
    if (n.precision === 'year' || !n.precision) return y;
    var m = n.month ? Math.max(1, Math.min(12, toNumber(n.month))) : 1;
    if (n.precision === 'month') return y + (m - 1) / 12;
    var d = n.day ? Math.max(1, Math.min(31, toNumber(n.day))) : 1;
    var t = y + (m - 1) / 12 + (d - 1) / 360;
    if (n.precision === 'day') return t;
    /* 1 year = 360 days = 8640 hours = 518400 minutes (same scale as day) */
    var h = n.hour !== undefined ? Math.max(0, Math.min(23, toNumber(n.hour))) : 0;
    t += h / 8640;
    if (n.precision === 'hour') return t;
    var mi = n.minute !== undefined ? Math.max(0, Math.min(59, toNumber(n.minute))) : 0;
    return t + mi / 518400;
  }
  /* friendly date label for a node (respects its precision) */
  function fmtNodeTime(n) {
    var y = toNumber(n.year);
    var base = fmtYear(y);
    if (n.precision === 'month') {
      var m = n.month ? toNumber(n.month) : 1;
      return base + ' ' + m + '月';
    }
    if (n.precision === 'day') {
      var mo = n.month ? toNumber(n.month) : 1;
      var da = n.day ? toNumber(n.day) : 1;
      return base + ' ' + mo + '月' + da + '日';
    }
    if (n.precision === 'hour') {
      var mh = n.month ? toNumber(n.month) : 1;
      var dh = n.day ? toNumber(n.day) : 1;
      var hh = n.hour !== undefined ? toNumber(n.hour) : 0;
      return base + ' ' + mh + '月' + dh + '日' + hh + '时';
    }
    if (n.precision === 'minute') {
      var mm = n.month ? toNumber(n.month) : 1;
      var dm = n.day ? toNumber(n.day) : 1;
      var hm = n.hour !== undefined ? toNumber(n.hour) : 0;
      var mim = n.minute !== undefined ? toNumber(n.minute) : 0;
      return base + ' ' + mm + '月' + dm + '日' + hm + '时' + mim + '分';
    }
    return base;
  }

  function fmtCenturyText(y) {
    if (y < 0) return '公元前 ' + Math.ceil(-y / 100) * 100 + ' 年';
    if (y === 0) return '公元 0 年';
    var c = Math.ceil(y / 100);
    var base = (c - 1) * 100;
    return '公元 ' + base + ' 年';
  }

  /* layout geometry */
  var NODE_SPACING = 190;   /* px per unit on the time axis */
  var PAD_X = 120;          /* breathing room left/right of first/last node */
  var TIME_MIN = 0;         /* display window left edge */
  var TIME_MAX = 1900;      /* display window right edge */

  function timeToX(t) {
    return PAD_X + (t - TIME_MIN) * NODE_SPACING;
  }

  /* absolute epoch: node.absYear wins, else timeline absOffset + local year.
     Multi mode aligns lanes on this value; single mode keeps local years. */
  function absYearOf(n, tl) {
    if (n.absYear !== undefined && n.absYear !== null) return n.absYear;
    /* precise time (month/day) becomes a fractional offset within the year */
    return (tl.absOffset || 0) + nodeToTime(n);
  }
  function localYearOf(n) { return toNumber(n.year); }

  function xToTime(x) {
    return (x - PAD_X) / NODE_SPACING + TIME_MIN;
  }

  function widthFor(tl) {
    if (!tl.nodes.length) return 0;
    var lo = Infinity, hi = -Infinity;
    tl.nodes.forEach(function (n) { var t = toNumber(n.year); if (t < lo) lo = t; if (t > hi) hi = t; });
    return timeToX(hi) + PAD_X;
  }

  function renderTimelineTabs() {
    managerEl.innerHTML = '';
    order.forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;   /* stale order entry — skip */
      var tab = document.createElement('div');
      tab.className = 'tl__tab' + (id === activeId ? ' is-active' : '');
      tab.setAttribute('data-tl', id);
      var del = document.createElement('button');
      del.className = 'tl__tab-del';
      del.title = '删除时间线';
      del.textContent = '×';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        delTimeline(id);
      });
      var nameSpan = document.createElement('span');
      nameSpan.className = 'tl__tab-name';
      nameSpan.textContent = tl.name;
      tab.appendChild(nameSpan);
      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = '· ' + tl.nodes.length;
      tab.appendChild(count);
      tab.appendChild(del);
      tab.addEventListener('click', function () { selectTimeline(id); });
      managerEl.appendChild(tab);
    });
  }
  function selectTimeline(id) {
    if (id === activeId) return;
    activeId = id;
    closeDetail();
    panY = 0;
    /* 切换时间线：重置剧情范围聚焦（默认聚焦第一个范围），并刷新范围下拉 */
    storyMode = 'focus';
    activeStoryRangeId = null;
    if (typeof fillStorySelect === 'function') fillStorySelect();
    /* update tab highlight without rebuilding (unified canvas keeps DOM) */
    var tabs = managerEl.querySelectorAll('.tl__tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tl') === id);
    }
    /* fade through the switch: the new world's overview can sit far from
       the old camera (different time scales), so a camera glide would fly
       across empty space. Fade out → snap → fade in is the clean cut. */
    stage.classList.add('is-fading');
    setTimeout(function () {
      fitAllView(true);          /* instant overview while hidden */
      stage.classList.remove('is-fading');
    }, 190);
  }

  function focusTrackTop() {
    panX = 0;
    panY = 0;
    try { track.style.transform = 'translate(0px,0px)'; } catch (e) {}
  }

  var multiMode = false;       /* side-by-side all timelines (aligned) */
var nonlinearMode = false;   /* event-sequence view: nodes at FIXED pitch */
var seqPitch = 96;           /* px between consecutive events (nonlinear) */

  /* ── 时间指针：默认工具，永远显示——按下画布即定位到鼠标位置（可拖动实时更新）── */
  var timeCursor = 0;                 /* 当前世界观的时间指针（小数年份） */
  var timeCursorEl = document.getElementById('tl-time-cursor');
  var cursorScrub = null;            /* 指针拖动标记（左键默认工具） */
  var spaceDown = false;             /* 空格=平移画布（默认左键是指针） */
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !(e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]'))) {
      spaceDown = true;
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') spaceDown = false;
  });
  /* 窗口失焦/离开时清空格状态（否则 keyup 丢失，spaceDown 卡 true → 指针分支被跳过） */
  window.addEventListener('blur', function () { spaceDown = false; });
  function loadTimeCursor() {
    var ws = worldsets[activeWorldset];
    if (ws && isFinite(ws.timeCursor)) { timeCursor = ws.timeCursor; return; }
    /* 默认：当前时间线中间 */
    var tl = timelines[activeId];
    var lo = Infinity, hi = -Infinity;
    (tl && Array.isArray(tl.nodes) ? tl.nodes : []).forEach(function (n) {
      var y = absYearOf(n, tl);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    });
    timeCursor = isFinite(lo) ? (lo + hi) / 2 : 0;
  }
  function saveTimeCursor() {
    var ws = worldsets[activeWorldset];
    if (!ws) { worldsets[activeWorldset] = ws = { timelines: timelines, order: order, docs: docs }; }
    ws.timeCursor = timeCursor;
    saveTimelines();
  }
  /* 指针视口位置（随 pan 跟随；用 transform 与画布同走合成器，避免 left 布局滞后） */
  function updateTimeCursorPos() {
    if (!timeCursorEl) return;
    timeCursorEl.style.display = '';
    var x = timeToX(timeCursor) + panX;
    timeCursorEl.style.transform = 'translateX(' + x + 'px)';
    var tEl = timeCursorEl.querySelector('.tl__time-cursor-time');
    if (tEl) tEl.textContent = fmtScale(Math.round(timeCursor * 100) / 100);
  }
  /* 节点"已发生/未发生"视觉：指针之后 is-future 淡化 */
  function applyTimeCursorState() {
    var tl = timelines[activeId];
    if (!tl) return;
    nodesEl.querySelectorAll('.tl__n').forEach(function (el) {
      if (!el._node) return;
      var isFuture = absYearOf(el._node, tl) > timeCursor;
      el.classList.toggle('is-future', isFuture);
    });
  }
  /* 拖动手柄改指针时间（window 级监听，不依赖 pointer capture——鼠标移出也实时更新） */
  var cursorDragging = false;
  if (timeCursorEl) {
    var handleEl = timeCursorEl.querySelector('.tl__time-cursor-handle');
    if (handleEl) {
      handleEl.addEventListener('pointerdown', function (e) {
        cursorDragging = true;
        e.stopPropagation();
        e.preventDefault();
      });
      window.addEventListener('pointermove', function (e) {
        if (!cursorDragging) return;
        var rect = stage.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        timeCursor = xToTime(mx - panX);
        updateTimeCursorPos();
        applyTimeCursorState();
      });
      window.addEventListener('pointerup', function () {
        if (!cursorDragging) return;
        cursorDragging = false;
        saveTimeCursor();
      });
    }
  }

  /* ── 剧情线（主角线/女主线等平行叙事线）：多段时间段（segments），gap 期间与线无关 ──
     segment = { start, end }（小数年份，精确时间）；旧单段 {startYear,endYear} 自动迁移 */
  var storyMode = 'focus';        /* 'focus' 只看剧情 / 'full' 显示世界历史 */
  var activeStoryRangeId = null;  /* 当前聚焦的剧情线 id */
  function storyRangesOf(tl) { return (tl && Array.isArray(tl.storylines)) ? tl.storylines : []; }
  function findStoryRange(tl, id) {
    var rs = storyRangesOf(tl);
    for (var i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  }
  function storySegments(sr) {
    if (!sr) return [];
    if (Array.isArray(sr.segments)) return sr.segments;
    /* 旧单段结构 → 包装成一段 */
    if (isFinite(sr.startYear) && isFinite(sr.endYear)) {
      return [{ start: Math.min(sr.startYear, sr.endYear), end: Math.max(sr.startYear, sr.endYear) }];
    }
    return [];
  }
  /* 剧情线总范围 [lo, hi]（范围条/标尺用）：首段起点 ~ 末段终点；
     end=null（无限延续）→ hi 取时间线最大节点年份 */
  function storyRangeSpan(tl, sr) {
    var segs = storySegments(sr);
    if (!segs.length) return null;
    var lo = Infinity, hi = -Infinity;
    segs.forEach(function (s) {
      if (s.start < lo) lo = s.start;
      var e = (s.end === null || s.end === undefined) ? timelineMaxYear(tl) : s.end;
      if (e > hi) hi = e;
    });
    return isFinite(lo) ? { lo: lo, hi: hi } : null;
  }
  function timelineMaxYear(tl) {
    var mx = -Infinity;
    (tl && Array.isArray(tl.nodes) ? tl.nodes : []).forEach(function (n) {
      var y = absYearOf(n, tl);
      if (y > mx) mx = y;
    });
    return isFinite(mx) ? mx : 0;
  }
  /* 节点是否落在剧情线任意一段内（gap 内节点不属于线；end=null 段从 start 延续到尽头） */
  function nodeInRange(tl, sr, n) {
    var segs = storySegments(sr);
    if (!segs.length) return true;   /* 线损坏 → 不裁剪（保守） */
    var y = absYearOf(n, tl);
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var inSeg = (s.end === null || s.end === undefined) ? (y >= s.start) : (y >= s.start && y <= s.end);
      if (inSeg) return true;
    }
    return false;
  }
  /* 当前聚焦的范围（无则 null） */
  function activeStoryRange() {
    var tl = timelines[activeId];
    if (storyMode !== 'focus' || !tl) return null;
    return findStoryRange(tl, activeStoryRangeId);
  }

  /* number of nodes on the ACTIVE timeline — the sequence layout fits the
     visible world only (single mode), not every hidden lane's nodes */
  function seqNodeCount() {
    return nodesEl.querySelectorAll('.tl__n[data-tl="' + activeId + '"]').length;
  }

  function renderTimeline(playWake) {
    var list = order.slice();   /* unified canvas: ALL timelines always exist */
    var allNodes = [];
    if (typeof fillStorySelect === 'function') fillStorySelect();   /* 同步剧情范围下拉（含默认聚焦） */
    var focusRange = activeStoryRange();   /* 聚焦模式下的当前剧情范围 */
    list.forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;   /* stale order entry — skip */
      if (Array.isArray(tl.nodes)) {
        tl.nodes.forEach(function (n) {
          /* 聚焦剧情范围：只保留当前时间线的范围内节点（世界历史裁剪） */
          if (focusRange && id === activeId && !nodeInRange(tl, focusRange, n)) return;
          if (focusRange && id !== activeId) return;   /* 聚焦时只看当前时间线 */
          allNodes.push({ id: id, n: n });
        });
      }
    });
    renderTimelineTabs();
    if (detailEl.classList.contains('is-loop')) {
      /* 循环设置模式：软关闭——只清节点引用，保持面板（拖动数值不刷新面板） */
      openNodeEl = null;
    } else {
      closeDetail();
    }

    nodesEl.innerHTML = '';
    scaleEl.innerHTML = '';

    /* width + fit spacing cover every visible timeline so lanes align */
    var lo = Infinity, hi = -Infinity;
    allNodes.forEach(function (p) {
      var t = absYearOf(p.n, timelines[p.id]);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    });
    var W = isFinite(lo) ? timeToX(hi) + PAD_X : 0;
    track.style.width = Math.max(W, stage.clientWidth) + 'px';
    /* roomy vertical extent: lanes + fan-out labels above/below each axis */    var H = multiMode
      ? (LANE_PAD + list.length * LANE_H + LANE_PAD)
      : (LANE_PAD + LANE_H + LANE_PAD);
    track.style.height = Math.max(H, stage.clientHeight) + 'px';
    refreshPanBounds();
    focusTrackTop();
    if (typeof applyTimeCursorState === 'function') applyTimeCursorState();   /* 时间指针：已发生/未发生视觉 */
    if (typeof updateTimeCursorPos === 'function') updateTimeCursorPos();

    var hasNodes = allNodes.length > 0;
    emptyEl.style.display = hasNodes ? 'none' : 'grid';

    /* one lane per timeline in multi mode (all share the same time axis) */
    list.forEach(function (id, li) {
      var tl = timelines[id];
      if (!tl) return;   /* stale order entry — skip, don't crash */
      var lane = document.createElement('div');
      lane.className = 'tl__lane';
      lane.setAttribute('data-tl', id);
      if (multiMode) {
        lane.style.top = (li * LANE_H + LANE_PAD) + 'px';
      } else {
        /* single mode: center the lane vertically in the stage */
        lane.style.top = Math.max(0, (stage.clientHeight - 150) / 2) + 'px';
      }
      var lab = document.createElement('div');
      lab.className = 'tl__lane-label';
      lab.textContent = tl.name;
      lane.appendChild(lab);
      var laneAxis = document.createElement('div');
      laneAxis.className = 'tl__axis';
      lane.appendChild(laneAxis);
      nodesEl.appendChild(lane);

      var laneTop = multiMode ? (li * LANE_H + LANE_PAD) : Math.max(0, (stage.clientHeight - 150) / 2);
      /* 渲染所有节点（普通事件 + 循环边界），边界节点带 is-boundary 形态 */
      var nodes = tl.nodes.slice().sort(function (a, b) { return absYearOf(a, tl) - absYearOf(b, tl); });
      nodes.forEach(function (n, i) {
        lane.appendChild(makeNodeEl(n, tl, i, laneTop));
      });
      /* 渲染循环框（每个循环一个，从 startNode 到 endNode） */
      loopsOf(tl).forEach(function (L) {
        renderLoopFrame(lane, tl, L);
        renderLoopNodes(lane, tl, L);
      });
      /* 渲染剧情范围条（AE 工作区式：当前时间线的所有范围；聚焦的加亮） */
      if (id === activeId) {
        storyRangesOf(tl).forEach(function (sr) {
          renderStoryBar(lane, tl, sr);
        });
      }
    });

    /* auto-split labels up/down so nearby names never overlap */
    layoutNames();
    /* grow lanes so labels never cross the world dividers (multi mode) */
    fitLaneHeights(); syncNodeY();

    /* wake only when switching timelines (selectTimeline); NOT on single↔
       multi mode switches — those rebuild the same nodes */
    if (playWake) {
      Array.prototype.forEach.call(nodesEl.querySelectorAll('.tl__n:not(.is-loop-repeat)'), function (el) {
        el.classList.add('is-waking');
        el.addEventListener('animationend', function h() {
          el.classList.remove('is-waking');
          el.removeEventListener('animationend', h);
        });
      });
    }

    /* ── century scale ────────────────────────────────── */
    buildScale();
    scaleEl.style.display = 'block';   /* shared bottom ruler always on */
  }

  var LANE_H = 170;    /* vertical pitch between lanes in multi mode */
  var LANE_PAD = 80;   /* first lane offset from the stage top */

  /* build one node element (shared by normal + loop lanes) */
  function makeNodeEl(n, tl, i, laneTop) {
    var x = timeToX(absYearOf(n, tl)) + panXBase;   /* 含 panXBase，与 updatePositions 一致，避免 transition 弹动 */
    var el = document.createElement('div');
    var bc = '';
    if (n.type === 'loop-boundary') bc = ' is-boundary boundary-' + (n.boundary || 'start');
    el.className = 'tl__n' + bc;
    el.style.left = x + 'px';
    el.style.animationDelay = (80 + (i % 20) * 40) + 'ms';
    el.setAttribute('data-id', n.id || '');
    el.setAttribute('data-tl', tl.id);
    el._node = n;
    el._y = (laneTop || 0) + 75;   /* axis line: lane top + half lane height */
    var cap = document.createElement('div'); cap.className = 'cap';
    var leader = document.createElement('div'); leader.className = 'leader';
    var nameEl = document.createElement('div'); nameEl.className = 'name'; nameEl.textContent = n.title;
    var tip = document.createElement('div'); tip.className = 'tip';
    var tipYr = document.createElement('div'); tipYr.className = 'tip__yr';
    tipYr.textContent = fmtNodeTime(n);
    tip.appendChild(tipYr);
    el.appendChild(leader); el.appendChild(cap); el.appendChild(nameEl); el.appendChild(tip);
    return el;
  }

  /* 渲染单个循环框：从 startNode 到 endNode 的节点范围 */
  function renderLoopFrame(lane, tl, L) {
    var startN = findNodeById(tl, L.startNodeId);
    var endN = findNodeById(tl, L.endNodeId);
    if (!startN || !endN) return;
    var lo = absYearOf(startN, tl);
    var hi = absYearOf(endN, tl);
    var span = hi - lo;
    var cnt = L.count || 1;
    for (var c = 0; c < cnt; c++) {
      var frame = document.createElement('div');
      frame.className = 'tl__loop';
      frame.setAttribute('data-loop-id', L.id);
      frame.setAttribute('data-loop-idx', c);
      frame.setAttribute('data-tl', tl.id);
      var clo = lo + c * span, chi = hi + c * span;
      frame.style.left = (timeToX(clo) + panXBase) + 'px';
      frame.style.width = Math.max(timeToX(chi) - timeToX(clo), 0) + 'px';
      frame.style.zIndex = 1;
      var badge = document.createElement('div');
      badge.className = 'tl__loop-badge';
      badge.textContent = (cnt > 1) ? ((L.name || '循环') + ' ' + (c + 1)) : (L.name || '循环');
      frame.appendChild(badge);
      frame.addEventListener('click', function (ev) {
        if (eyedropTarget) return;   /* 吸管模式：不打开面板，交给 stage 吸管处理 */
        ev.stopPropagation();
        if (activeLoop === this) { closeLoopSettings(); return; }
        nodesEl.querySelectorAll('.tl__loop.is-active').forEach(function (x) { x.classList.remove('is-active'); });
        this.classList.add('is-active');
        openLoopSettings(tl, L, this);
      });
      lane.appendChild(frame);
    }
  }

  /* 渲染剧情范围条（AE 工作区式：顶部色带 + 范围名；聚焦的加亮） */
  function renderStoryBar(lane, tl, sr) {
    if (nonlinearMode) return;   /* 非线性序列视图不画范围条（坐标语义不同） */
    var segs = storySegments(sr);
    if (!segs.length) return;
    var el = document.createElement('div');
    el.className = 'tl__storybar' + (activeStoryRangeId === sr.id ? ' is-active' : '');
    el.setAttribute('data-tl', tl.id);
    el.setAttribute('data-story', sr.id);
    /* 多段：容器覆盖全程，内部按 segments 渲染色块（gap 断开） */
    var sp = storyRangeSpan(tl, sr);
    el.style.left = (timeToX(sp.lo) + panXBase) + 'px';
    el.style.width = Math.max(20, timeToX(sp.hi) - timeToX(sp.lo)) + 'px';
    segs.forEach(function (s) {
      var seg = document.createElement('div');
      var isOpen = (s.end === null || s.end === undefined);
      seg.className = 'tl__storybar-seg' + (isOpen ? ' is-open' : '');
      seg.style.left = (timeToX(s.start) - timeToX(sp.lo)) + 'px';
      var segEnd = isOpen ? sp.hi : s.end;
      seg.style.width = Math.max(3, timeToX(segEnd) - timeToX(s.start)) + 'px';
      el.appendChild(seg);
    });
    var label = document.createElement('div');
    label.className = 'storybar-label';
    label.textContent = sr.name || '剧情线';
    el.appendChild(label);
    lane.appendChild(el);
  }

  /* ── 剧情范围：控件 + 创建面板（AE 工作区式）────────── */
  var storyBtn = document.getElementById('tl-story-btn');
  var storySelect = document.getElementById('tl-story-select');
  var storyModal = document.getElementById('story-modal');
  /* 画线模式的待选节点（累积刷选） */

  function fillStorySelect() {
    var tl = timelines[activeId];
    var rs = tl ? storyRangesOf(tl) : [];
    storySelect.innerHTML = '';
    if (!rs.length) {
      storySelect.style.display = 'none';
      storyBtn.classList.remove('is-on');
      storyBtn.textContent = '剧情';
      return;
    }
    var optFull = document.createElement('option');
    optFull.value = '__full__';
    optFull.textContent = '世界历史';
    storySelect.appendChild(optFull);
    rs.forEach(function (sr) {
      var o = document.createElement('option');
      o.value = sr.id;
      o.textContent = (sr.name || '剧情范围');
      storySelect.appendChild(o);
    });
    storySelect.style.display = '';
    /* 默认聚焦第一个范围（无聚焦时） */
    if (!activeStoryRangeId || !findStoryRange(tl, activeStoryRangeId)) {
      activeStoryRangeId = rs[0].id;
    }
    storySelect.value = activeStoryRangeId;
    storyBtn.classList.toggle('is-on', storyMode === 'focus');
    storyBtn.textContent = storyMode === 'focus' ? '剧情' : '历史';
  }
  storyBtn.addEventListener('click', function () {
    var tl = timelines[activeId];
    if (!tl || !storyRangesOf(tl).length) return;
    storyMode = storyMode === 'focus' ? 'full' : 'focus';
    /* renderTimeline 内 focusTrackTop 会重置视角 → keepPan 恢复，避免乱飞 */
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    fillStorySelect();
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions(); applyModeView(); applyPan();
  });
  storySelect.addEventListener('change', function () {
    var v = storySelect.value;
    if (v === '__full__') storyMode = 'full';
    else {
      storyMode = 'focus';
      activeStoryRangeId = v;
    }
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    fillStorySelect();
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions(); applyModeView(); applyPan();
  });

  /* 小数年份 → 人类时间部件（年/精度/月/日/时/分）。
     精度判定用"精确回算"法：从粗到细尝试各精度，取第一个 nodeToTime 回算误差归零的
     （浮点下余数判断不可靠，回算验证才准）。与 nodeToTime 互逆。 */
  function partsFromTime(t) {
    if (!isFinite(t)) return { year: '', precision: 'year', month: '', day: '', hour: '', minute: '' };
    var y = Math.floor(t + 1e-9);
    var frac = t - y;
    if (frac === 0) return { year: y, precision: 'year', month: '', day: '', hour: '', minute: '' };
    var m = Math.floor(frac * 12) + 1;
    if (m < 1) m = 1; if (m > 12) m = 12;
    if (Math.abs(nodeToTime({ year: y, precision: 'month', month: m }) - t) < 1e-9) {
      return { year: y, precision: 'month', month: m, day: '', hour: '', minute: '' };
    }
    var d = Math.round((frac * 12 - (m - 1)) * 30) + 1;
    if (d < 1) d = 1; if (d > 30) d = 30;
    if (Math.abs(nodeToTime({ year: y, precision: 'day', month: m, day: d }) - t) < 1e-9) {
      return { year: y, precision: 'day', month: m, day: d, hour: '', minute: '' };
    }
    var h = Math.round(((frac * 12 - (m - 1)) * 30 - (d - 1)) * 24);
    if (h < 0) h = 0; if (h > 23) h = 23;
    if (Math.abs(nodeToTime({ year: y, precision: 'hour', month: m, day: d, hour: h }) - t) < 1e-9) {
      return { year: y, precision: 'hour', month: m, day: d, hour: h, minute: '' };
    }
    var mi = Math.round((((frac * 12 - (m - 1)) * 30 - (d - 1)) * 24 - h) * 60);
    if (mi < 0) mi = 0; if (mi > 59) mi = 59;
    return { year: y, precision: 'minute', month: m, day: d, hour: h, minute: mi };
  }
  /* 段显示格式化（小数 → "312年7月 ~ 400年"） */
  function fmtSeg(s) {
    var a = partsFromTime(s.start);
    var b = partsFromTime(s.end);
    var fmt = function (p) {
      var s2 = '' + p.year;
      if (p.precision === 'month') s2 += '年' + p.month + '月';
      else if (p.precision === 'day') s2 += '年' + p.month + '月' + p.day + '日';
      else if (p.precision === 'hour') s2 += '年' + p.month + '月' + p.day + '日' + p.hour + '时';
      else if (p.precision === 'minute') s2 += '年' + p.month + '月' + p.day + '日' + p.hour + '时' + p.minute + '分';
      return s2;
    };
    return fmt(a) + ' ~ ' + fmt(b);
  }

  function openStoryRangeModal() {
    var tl = timelines[activeId];
    if (!tl) return;
    document.getElementById('story-modal-title').textContent = '剧情线 · ' + tl.name;
    document.getElementById('story-modal-name').value = '';
    renderSegList();
    storyModal.style.display = 'flex';
    document.getElementById('story-modal-name').focus();
  }
  function renderSegList() {
    var list = document.getElementById('story-seg-list');
    list.innerHTML = '';
    pendingSegments.forEach(function (s, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-sm);color:var(--fg);';
      var txt = document.createElement('span');
      txt.style.flex = '1';
      txt.textContent = fmtSeg(s) + (s.end === null ? ' ∞' : '');
      var openBtn = document.createElement('button');
      openBtn.className = 'tl__eyedrop' + (s.end === null ? ' is-on' : '');
      openBtn.textContent = '∞';
      openBtn.title = '无限延续（剧情还在写，该段至今）';
      openBtn.style.cssText = 'width:26px;height:22px;font-size:12px;flex:0 0 auto;' + (s.end === null ? 'color:var(--accent);border-color:var(--accent);' : '');
      openBtn.addEventListener('click', function () {
        if (pendingSegments[i].end === null || pendingSegments[i].end === undefined) {
          pendingSegments[i].end = (pendingSegments[i]._closedEnd !== undefined) ? pendingSegments[i]._closedEnd : pendingSegments[i].start + 1;
        } else {
          pendingSegments[i]._closedEnd = pendingSegments[i].end;
          pendingSegments[i].end = null;
        }
        renderSegList();
        applySegHighlights();
        renderSegMarks();
      });
      var del = document.createElement('button');
      del.className = 'tl__eyedrop';
      del.textContent = '×';
      del.title = '删除该段';
      del.style.cssText = 'width:22px;height:22px;font-size:12px;flex:0 0 auto;';
      del.addEventListener('click', function () {
        pendingSegments.splice(i, 1);
        renderSegList();
        applySegHighlights();
        renderSegMarks();
        updateLineCount();
      });
      row.appendChild(txt);
      row.appendChild(openBtn);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  /* 画线模式：刷选累积多段 → 命名 → 创建剧情线（gap 期间与线无关）── */
  var lineMode = false;            /* 画线模式开关 */
  var eraserMode = false;          /* 橡皮擦：擦除已选段（形成 gap） */
  var pendingSegments = [];        /* 本次累积的时间段 [{start,end}, ...]，end=null 表示无限延续 */
  var brushDrag = null;            /* { startVx, startT, curT } or null */
  var brushSel = null;             /* 选区高亮 div（stage 内，视口坐标） */
  var lineBar = document.getElementById('tl-line-bar');
  var lineCount = document.getElementById('tl-line-count');
  var brushBtn = document.getElementById('tl-brush-btn');
  var eraserBtn = document.getElementById('tl-eraser-btn');
  /* 区间差集：从段集合中擦除 [e0,e1]（把段缩短/分裂，形成 gap） */
  function eraseRange(segs, e0, e1) {
    var out = [];
    segs.forEach(function (s) {
      var s1 = (s.end === null || s.end === undefined) ? Infinity : s.end;
      if (e1 < s.start || e0 > s1) { out.push(s); return; }          /* 不相交 → 保留 */
      if (e0 <= s.start && e1 >= s1) return;                          /* 完全覆盖 → 删 */
      if (e0 > s.start) out.push({ start: s.start, end: e0 });       /* 左段保留 */
      if (e1 < s1) out.push({ start: e1, end: s.end });              /* 右段保留（保留 null 属性） */
    });
    return out;
  }
  function lineBarShow() { if (lineBar) lineBar.style.display = 'flex'; }
  function lineBarHide() { if (lineBar) lineBar.style.display = 'none'; }
  function updateLineCount() {
    if (lineCount) lineCount.textContent = '已选 ' + pendingSegments.length + ' 段';
  }
  function exitLineMode() {
    lineMode = false;
    brushMode = false;
    eraserMode = false;
    brushDrag = null;
    clearBrushSel();
    pendingSegments = [];
    clearSegHighlights();
    clearSegMarks();
    lineBarHide();
    if (brushBtn) brushBtn.classList.remove('is-on');
    if (eraserBtn) eraserBtn.classList.remove('is-on');
  }
  function clearSegMarks() {
    var marks = document.getElementById('tl-seg-marks');
    if (marks) marks.innerHTML = '';
  }
  if (brushBtn) {
    brushBtn.addEventListener('click', function () {
      lineMode = !lineMode;
      brushMode = lineMode;   /* 画线模式内拖拽 = 刷选/擦除 */
      brushBtn.classList.toggle('is-on', lineMode);
      if (lineMode) { pendingSegments = []; lineBarShow(); updateLineCount(); }
      else exitLineMode();
    });
  }
  if (eraserBtn) {
    eraserBtn.addEventListener('click', function () {
      if (!lineMode) return;
      eraserMode = !eraserMode;
      brushMode = eraserMode ? true : lineMode;   /* 橡皮擦下拖拽 = 擦除 */
      eraserBtn.classList.toggle('is-on', eraserMode);
      brushDrag = null;
    });
  }
  function clearBrushSel() {
    if (brushSel && brushSel.parentNode) brushSel.parentNode.removeChild(brushSel);
    brushSel = null;
  }
  /* 已选段持久色带（track 内，随 pan 自动跟随；end=null 渲染为开放 ∞） */
  function renderSegMarks() {
    var marks = document.getElementById('tl-seg-marks');
    if (!marks) return;
    marks.innerHTML = '';
    if (!pendingSegments.length) return;
    var trackW = parseFloat(track.style.width) || stage.clientWidth;
    pendingSegments.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'tl__seg-mark' + (s.end === null || s.end === undefined ? ' is-open' : '');
      el.style.left = (timeToX(s.start) + panXBase) + 'px';
      var w = (s.end === null || s.end === undefined)
        ? Math.max(12, trackW - (timeToX(s.start) + panXBase))
        : Math.max(3, timeToX(s.end) - timeToX(s.start));
      el.style.width = w + 'px';
      marks.appendChild(el);
    });
  }
  /* 已选段的视觉高亮：把段内节点元素标记 is-inline（gap 内不标） */
  function applySegHighlights() {
    clearSegHighlights();
    if (!pendingSegments.length) return;
    var tl = timelines[activeId];
    if (!tl) return;
    nodesEl.querySelectorAll('.tl__n').forEach(function (el) {
      if (!el._node) return;
      var y = absYearOf(el._node, tl);
      for (var i = 0; i < pendingSegments.length; i++) {
        var s = pendingSegments[i];
        var inSeg = (s.end === null || s.end === undefined) ? (y >= s.start) : (y >= s.start && y <= s.end);
        if (inSeg) { el.classList.add('is-inline'); break; }
      }
    });
  }
  function clearSegHighlights() {
    nodesEl.querySelectorAll('.tl__n.is-inline').forEach(function (el) { el.classList.remove('is-inline'); });
  }
  /* 视口 x → 年份（节点显示 x = timeToX(t) + panX，反推 t） */
  function brushYearFromVx(vx) { return xToTime(vx - panX); }
  /* 吸附：年份靠近节点（视口 ~10px 内）→ 对齐节点年份（可选辅助，不强制绑定） */
  function snapToNodeYear(tl, y) {
    if (!tl || !Array.isArray(tl.nodes) || !tl.nodes.length) return y;
    var snapDist = Math.max(1, 10 / NODE_SPACING);   /* 视口 10px 对应的年数：fit 视图 ~20 年，放大视图更精确 */
    var best = null, bestD = Infinity;
    tl.nodes.forEach(function (n) {
      var ny = absYearOf(n, tl);
      var d = Math.abs(ny - y);
      if (d < bestD) { bestD = d; best = ny; }
    });
    return (best !== null && bestD <= snapDist) ? best : y;
  }
  /* 刷选/擦除结束：吸附起止 → 刷选累积一段 或 擦除一段（差集） */
  function finishBrush() {
    if (!brushDrag) return;
    var t0 = brushDrag.startT, t1 = brushDrag.curT;
    var tl = timelines[activeId];
    clearBrushSel();
    brushDrag = null;
    if (!lineMode || !tl) return;
    var loT = Math.min(t0, t1), hiT = Math.max(t0, t1);
    if (Math.abs(hiT - loT) < 1e-9) return;   /* 零宽忽略 */
    if (eraserMode) {
      /* 橡皮擦：从已选段中擦除该区间（缩短/分裂 → 形成 gap） */
      pendingSegments = eraseRange(pendingSegments, loT, hiT);
    } else {
      loT = snapToNodeYear(tl, loT);
      hiT = snapToNodeYear(tl, hiT);
      pendingSegments.push({ start: loT, end: hiT });
    }
    applySegHighlights();
    renderSegMarks();
    updateLineCount();
  }
  /* 完成：弹命名面板（段列表可编辑） */
  function finishLine() {
    if (!pendingSegments.length) { exitLineMode(); return; }
    openStoryRangeModal();
  }
  var lineDoneBtn = document.getElementById('tl-line-done');
  var lineCancelBtn = document.getElementById('tl-line-cancel');
  if (lineDoneBtn) lineDoneBtn.addEventListener('click', finishLine);
  if (lineCancelBtn) lineCancelBtn.addEventListener('click', exitLineMode);
  /* Esc 取消 / Enter 完成画线 */
  document.addEventListener('keydown', function (e) {
    if (!lineMode) return;
    if (e.key === 'Escape') { e.preventDefault(); exitLineMode(); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); finishLine(); }
  });
  function confirmStoryRange() {
    var tl = timelines[activeId];
    var errEl = document.getElementById('story-modal-error');
    if (!pendingSegments.length) {
      errEl.textContent = '请先刷选至少一个时间段';
      errEl.style.display = '';
      return;
    }
    var name = document.getElementById('story-modal-name').value.trim() || ('剧情线 ' + (storyRangesOf(tl).length + 1));
    if (!Array.isArray(tl.storylines)) tl.storylines = [];
    tl.storylines.push({ id: 'sl_' + Date.now(), name: name, segments: pendingSegments.map(function (s) { return { start: s.start, end: s.end }; }) });
    saveTimelines();
    storyModal.style.display = 'none';
    exitLineMode();
    /* 创建后自动聚焦新剧情线 */
    activeStoryRangeId = tl.storylines[tl.storylines.length - 1].id;
    storyMode = 'focus';
    fillStorySelect();
    renderTimeline(false);
    applyModeView(); applyPan();
  }
  document.getElementById('story-modal-cancel').addEventListener('click', function () {
    storyModal.style.display = 'none';
    exitLineMode();
  });
  document.getElementById('story-modal-ok').addEventListener('click', confirmStoryRange);

  /* 循环重复段（count > 1）的"幽灵节点"：半透明虚线提示这些节点在上一次轮回也发生了 */  /* 渲染循环重复段（count>1）的节点：与第一段内容完全同步的实节点。
     用 is-loop-repeat 标记 + _ghostOffset 记录偏移年数，缩放/编辑时据此重定位 */
  function renderLoopNodes(lane, tl, L) {
    var startN = findNodeById(tl, L.startNodeId);
    var endN = findNodeById(tl, L.endNodeId);
    if (!startN || !endN) return;
    var cnt = L.count || 1;
    if (cnt <= 1) return;
    var lo = absYearOf(startN, tl);
    var hi = absYearOf(endN, tl);
    var span = hi - lo;
    var inner = [];
    (tl.nodes || []).forEach(function (n) {
      if (n.type === 'loop-boundary') return;   /* 边界节点是循环锚点，不重复 */
      var y = absYearOf(n, tl);
      if (y >= lo && y <= hi) inner.push(n);
    });
    var laneTop = multiMode ? 0 : Math.max(0, (stage.clientHeight - 150) / 2);
    for (var c = 1; c < cnt; c++) {
      inner.forEach(function (n, i) {
        var rep = makeNodeEl(n, tl, i, laneTop);
        rep.classList.add('is-loop-repeat');
        rep.setAttribute('data-loop-id', L.id);
        rep._ghostOffset = c * span;   /* 偏移年数，缩放/编辑时据此重定位 */
        var y = absYearOf(n, tl) + c * span;
        rep.style.left = (timeToX(y) + panXBase) + 'px';
        lane.appendChild(rep);
      });
    }
  }

  /* loop settings render into the right-side info panel (not a popup) */
  function openLoopSettings(tl, loop, frame) {
    var L = loop;
    activeLoop = frame || null;

    /* hide node-detail content via class; loop section is the only body */
    detailEl.classList.add('is-loop');

    var loopBox = document.getElementById('d-loop');
    loopBox.style.display = '';
    document.getElementById('d-loop-title').textContent = '循环设置';
    var nameIn = document.getElementById('d-loop-name');
    nameIn.value = L.name || '';
    var countIn = document.getElementById('d-loop-count');
    countIn.value = L.count || 1;
    var startN = findNodeById(tl, L.startNodeId);
    var endN = findNodeById(tl, L.endNodeId);
    var sTitle = document.getElementById('d-loop-start-title');
    var sYear = document.getElementById('d-loop-start-year');
    var eTitle = document.getElementById('d-loop-end-title');
    var eYear = document.getElementById('d-loop-end-year');
    sTitle.value = startN ? startN.title : '';
    sYear.value = startN ? startN.year : '';
    eTitle.value = endN ? endN.title : '';
    eYear.value = endN ? endN.year : '';
    /* 就地更新（不 renderTimeline，避免弹动）：标题/名称直接改 DOM，年份用 updatePositions 重定位 */
    function relayout() {
      updatePositions();
      applyModeView();
      applyPan();
    }
    function setNodeTitle(node, title) {
      node.title = title;
      nodesEl.querySelectorAll('.tl__n').forEach(function (el) {
        if (el._node === node) {
          var nm = el.querySelector('.name');
          if (nm) nm.textContent = title;
        }
      });
      saveTimelines();
    }
    function setNodeYear(node, year) {
      /* 锁住：起始节点不能超过结束节点，结束节点不能低于起始节点 */
      if (node === startN && endN) year = Math.min(year, toNumber(endN.year));
      if (node === endN && startN) year = Math.max(year, toNumber(startN.year));
      node.year = year;
      if (node.absYear !== undefined && node.absYear !== null) node.absYear = (tl.absOffset || 0) + year;
      if (node === startN) sYear.value = year;
      if (node === endN) eYear.value = year;
      saveTimelines();
      relayout();
    }
    nameIn.onchange = function () {
      L.name = nameIn.value.trim() || '循环';
      nodesEl.querySelectorAll('.tl__loop[data-loop-id="' + L.id + '"] .tl__loop-badge').forEach(function (b) {
        b.textContent = L.name;
      });
      saveTimelines();
    };
    countIn.onchange = function () {
      L.count = Math.max(1, parseInt(countIn.value, 10) || 1);
      saveTimelines();
      var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
      renderTimeline(false);
      panX = keepPanX; panY = keepPanY;
      NODE_SPACING = keepSpacing;
      updatePositions();
      applyModeView();
      applyPan();
    };
    sTitle.onchange = function () { setNodeTitle(startN, sTitle.value.trim() || '循环节点'); };
    sYear.oninput = function () { setNodeYear(startN, parseFloat(sYear.value) || 0); };
    sYear.onchange = sYear.oninput;
    eTitle.onchange = function () { setNodeTitle(endN, eTitle.value.trim() || '循环节点'); };
    eYear.oninput = function () { setNodeYear(endN, parseFloat(eYear.value) || 0); };
    eYear.onchange = eYear.oninput;
    /* 删除此循环（顺带删除其边界节点） */
    document.getElementById('d-loop-delete').onclick = function () {
      var idx = tl.loops.indexOf(loop);
      if (idx >= 0) tl.loops.splice(idx, 1);
      /* 只删"创建循环时新建"的边界节点（type=loop-boundary）；
         吸管吸取的已有节点保持原 type，删除循环后保留 */
      [startN, endN].forEach(function (bn) {
        if (bn && bn.type === 'loop-boundary') {
          var bi = tl.nodes.indexOf(bn);
          if (bi >= 0) tl.nodes.splice(bi, 1);
        }
      });
      saveTimelines();
      /* renderTimeline 内部 focusTrackTop 会重置 panX=0，须 keepPanX 恢复视角；
         closeLoopSettings 放最后（对齐 deleteNode），避免 closeDetail 提前 pan 干扰 */
      var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
      renderTimeline(false);
      panX = keepPanX; panY = keepPanY;
      NODE_SPACING = keepSpacing;
      updatePositions();
      applyModeView();
      applyPan();
      closeLoopSettings();
    };
    /* 轮回跳转（count > 1 时显示）：上一/下一按钮跳到相邻循环框。
       每次点击从「当前高亮的循环框」起跳，可连续点 */
    (function () {
      var cnt = L.count || 1;
      var prevBtn = document.getElementById('d-loop-prev');
      var nextBtn = document.getElementById('d-loop-next');
      prevBtn.style.display = nextBtn.style.display = cnt > 1 ? '' : 'none';
      function jumpTo(target) {
        var targetFrame = nodesEl.querySelector('.tl__loop[data-loop-id="' + L.id + '"][data-loop-idx="' + target + '"]');
        if (targetFrame) {
          var fx = parseFloat(targetFrame.style.left);
          panX = -(fx - panXBase - stage.clientWidth / 2);
          applyPan();
          nodesEl.querySelectorAll('.tl__loop.is-active').forEach(function (f) { f.classList.remove('is-active'); });
          targetFrame.classList.add('is-active');
        }
      }
      function curIdx() {
        var curFrame = nodesEl.querySelector('.tl__loop.is-active[data-loop-id="' + L.id + '"]');
        return curFrame ? parseInt(curFrame.getAttribute('data-loop-idx'), 10) || 0 : 0;
      }
      prevBtn.onclick = function () { jumpTo((curIdx() - 1 + cnt) % cnt); };
      nextBtn.onclick = function () { jumpTo((curIdx() + 1) % cnt); };
    })();

    detailEl.classList.add('is-open');
    detailEl.setAttribute('aria-hidden', 'false');
    preOpenPanX = panX;
  }

  /* close the loop settings panel (toggle off / blank-click) */
  function closeLoopSettings() {
    activeLoop = null;
    nodesEl.querySelectorAll('.tl__loop.is-active').forEach(function (x) {
      x.classList.remove('is-active');
    });
    closeDetail();   /* shared teardown: hide d-loop, restore node view, pan back */
  }

  /* 节点实际渲染屏幕 x（含 transition 中间态，用于指示器/吸管等 hit-test） */
  function nodeRealX(el) {
    return parseFloat(getComputedStyle(el).left) + panX - panXBase;
  }
  /* map-style ruler: pick a "nice" step so ticks stay ~90-140px apart,
     precision follows the zoom depth (coarse when zoomed out, fine when in) */
  function niceStep(raw) {
    if (!(raw > 0)) raw = 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var s = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
    return s * mag;
  }
  function fmtScale(t) {
    if (t < 0) return 'BC ' + (-t);
    if (t === 0) return '0';
    return '' + t;
  }
  /* ── ruler bands ──────────────────────────────────────────
     Five zoom bands, each showing ONLY its own unit so labels
     never overlap:
       · YEAR band (default / zoomed out):  whole years  → 1832
       · MONTH band (zoomed in):            months      → 7月
       · DAY band:                          days        → 15日
       · HOUR band:                         hours       → 14时
       · MINUTE band (max zoom):            minutes     → 35分
     step is always derived so ticks stay ≥ targetPx apart. */
  var targetPx = 110;                 /* desired gap between ticks */
  function buildScale() {
    if (nonlinearMode) {
      /* metro-map ruler: one tick per event at its sequence x, labelled
         with the node's year — no uniform time spacing. Ticks are REUSED
         (keyed by node) so they transition along with the nodes. */
      var els = nodesEl.querySelectorAll('.tl__n');
      var poolMap = {};
      var pool = scaleEl.children;
      for (var p = 0; p < pool.length; p++) poolMap[pool[p].getAttribute('data-k')] = pool[p];
      var used = {};
      var shown = {};
      for (var ni = 0; ni < els.length; ni++) {
        var eln = els[ni];
        var tid = eln.getAttribute('data-tl');
        if (multiMode && tid !== activeId) continue;   /* current world only */
        var x = parseFloat(eln.style.left) + panX - panXBase;   /* left bakes panXBase */
        if (x < -40 || x > stage.clientWidth + 40) continue;
        var xkey = x.toFixed(1);
        if (shown[xkey]) continue;   /* overlapping events → one label */
        shown[xkey] = true;
        var disp = eln._node;
        var key = disp.title + '|' + toNumber(disp.year);
        var tick = poolMap[key];
        if (!tick) {
          tick = document.createElement('div');
          tick.className = 'tick';
          tick.setAttribute('data-k', key);
          scaleEl.appendChild(tick);
        }
        tick.style.left = x + 'px';
        tick.textContent = fmtScale(toNumber(disp.year));
        used[key] = true;
      }
      for (var q = pool.length - 1; q >= 0; q--) {
        if (!used[pool[q].getAttribute('data-k')]) pool[q].remove();
      }
      return;
    }
    var pxPerYear = NODE_SPACING;
    var stepYears = niceStep(targetPx / pxPerYear);
    var step, fmtTick;
    if (stepYears >= 1) {
      /* YEAR band — whole years only */
      step = stepYears;
      fmtTick = fmtScale;
    } else if (stepYears * 12 >= 1) {
      /* MONTH band — step in months, label = 月 only */
      step = niceStep(targetPx / pxPerYear * 12) / 12;   /* months → years */
      fmtTick = fmtMonth;
    } else if (stepYears * 360 >= 1) {
      /* DAY band — step in days, label = 日 only */
      step = niceStep(targetPx / pxPerYear * 360) / 360; /* days → years */
      fmtTick = fmtDay;
    } else if (stepYears * 8640 >= 1) {
      /* HOUR band — step in hours, label = 时 only */
      step = niceStep(targetPx / pxPerYear * 8640) / 8640; /* hours → years */
      fmtTick = fmtHour;
    } else {
      /* MINUTE band — step in minutes, label = 分 only */
      step = niceStep(targetPx / pxPerYear * 518400) / 518400; /* min → years */
      fmtTick = fmtMinute;
    }
    var t0 = xToTime(-panX);            /* time at viewport left edge */
    var t1 = xToTime(-panX + stage.clientWidth);
    var start = Math.ceil(t0 / step) * step;
    /* reuse existing ticks (keyed by their time) so left updates glide
       smoothly instead of rebuilding every frame */
    var pool = scaleEl.children;
    var poolMap = {};
    for (var p = 0; p < pool.length; p++) {
      poolMap[pool[p].getAttribute('data-t')] = pool[p];
    }
    var i = 0;
    var used = {};
    for (var t = start; t <= t1 + step; t += step) {
      var x = timeToX(t) + panX;   /* ruler sits in the viewport, not the track */
      if (x < -40 || x > stage.clientWidth + 40) continue;
      var tick = poolMap[t];
      if (!tick) {
        tick = document.createElement('div');
        tick.className = 'tick';
        tick.setAttribute('data-t', t);
        scaleEl.appendChild(tick);
      }
      tick.classList.toggle('is-major', i % 5 === 0);
      tick.style.left = x + 'px';
      var disp = t;
      if (!multiMode) {
        /* single mode shows the CURRENT world's local calendar */
        var cur = timelines[activeId];
        if (cur) disp = t - (cur.absOffset || 0);
      }
      tick.textContent = fmtTick(disp);
      used[t] = true;
      i++;
    }
    /* drop ticks that left the viewport */
    for (var q = pool.length - 1; q >= 0; q--) {
      if (!used[pool[q].getAttribute('data-t')]) {
        pool[q].remove();
      }
    }
  }

  /* month band: only the month is shown (year omitted — the ruler
     is already scoped to a band, so just 7月 / 3月 etc.) */
  function fmtMonth(t) {
    var ay = Math.abs(t);
    var yr = Math.floor(ay + 1e-9);
    var mo = Math.floor((ay - yr) * 12 + 1e-6) + 1;
    if (mo > 12) { mo = 1; }
    return mo + '月';
  }
  /* day band: only the day is shown (15日 / 3日 etc.) */
  function fmtDay(t) {
    var ay = Math.abs(t);
    var yr = Math.floor(ay + 1e-9);
    var frac = ay - yr;
    if (frac < 1e-9) return fmtScale(t);   /* whole years — don't say 1日 */
    var days = Math.round(frac * 360);
    if (days >= 360) { days = 0; }
    var da = days % 30 + 1;
    return da + '日';
  }
  /* hour band: only the hour is shown (14时 / 6时 etc.) */
  function fmtHour(t) {
    var ay = Math.abs(t);
    var yr = Math.floor(ay + 1e-9);
    var frac = ay - yr;
    if (frac < 1e-9) return fmtScale(t);
    var hrs = Math.round(frac * 8640) % 24;
    return hrs + '时';
  }
  /* minute band: only the minute is shown (35分 / 5分 etc.) */
  function fmtMinute(t) {
    var ay = Math.abs(t);
    var yr = Math.floor(ay + 1e-9);
    var frac = ay - yr;
    if (frac < 1e-9) return fmtScale(t);
    var mins = Math.round(frac * 518400) % 60;
    return mins + '分';
  }

  /* ── node detail + horizontal scroll ─────────────────── */
  var openNodeEl = null;
  var activeLoop = null;       /* currently open loop frame (for toggle) */
  var scrolled = false;
  var preOpenPanX = null;      /* where the view was before the detail opened */

  function toggleNode(n, el) {
    if (openNodeEl === el) { closeDetail(); return; }
    openNodeEl = el;
    preOpenPanX = panX;        /* remember so closeDetail can return here */
    nodesEl.querySelectorAll('.tl__n.is-featured').forEach(function (x) {
      x.classList.remove('is-featured');
    });
    el.classList.add('is-featured');
    showDetail(n, el);
    snapToNode(el);
  }

  /* bring the node to ~1/4 of the stage's width, with the 640ms dream ease */
  function snapToNode(el) {
    var x = parseFloat(el.style.left);   /* track 坐标，已含 panXBase */
    var viewport = stage.clientWidth;
    panX = viewport * 0.25 - x + panXBase;   /* 节点屏幕位置落在视野 1/4 处 */
    applyPan();
    scrolled = true;
  }

  function showDetail(n, el) {
    var tags = document.getElementById('d-tags');
    var time = document.getElementById('d-time');
    var title = document.getElementById('d-title');
    var desc = document.getElementById('d-desc');
    var people = document.getElementById('d-people');
    var places = document.getElementById('d-places');
    var foot = document.getElementById('d-foot');
    /* a clicked node switches back from loop-settings to node detail */
    detailEl.classList.remove('is-loop');
    var loopBox = document.getElementById('d-loop');
    if (loopBox) loopBox.style.display = 'none';

    tags.innerHTML = '';
    (n.tag ? [n.tag] : []).forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'tl__tag';
      chip.style.color = '#8a723a';
      chip.style.background = 'rgba(223,192,115,0.18)';
      chip.textContent = t;
      tags.appendChild(chip);
    });
    if (n.type === 'year') {
      var c = document.createElement('span');
      c.className = 'tl__tag';
      c.style.color = 'var(--meta)';
      c.textContent = '年代';
      tags.appendChild(c);
    }

    time.textContent = fmtNodeTime(n);
    if (multiMode) {
      /* multi mode: also show the absolute epoch alongside the local year */
      var tlAbs = timelines[el.getAttribute('data-tl')];
      if (tlAbs) {
        var absY = (tlAbs.absOffset || 0) + nodeToTime(n);
        time.textContent = fmtNodeTime(n) + ' · 绝对 ' + fmtScale(absY);
      }
    }
    /* 时间设置（年份 + 精度，拖动/输入实时移动节点） */
    var yearInput = document.getElementById('d-year');
    var precSel = document.getElementById('d-precision');
    yearInput.value = n.year;
    precSel.value = n.precision || 'year';
    /* 根据精度显示月/日/时/分输入框 */
    var mIn = document.getElementById('d-month');
    var dIn = document.getElementById('d-day');
    var hIn = document.getElementById('d-hour');
    var miIn = document.getElementById('d-minute');
    function updateTimeFields() {
      var p = n.precision || 'year';
      mIn.style.display = (p !== 'year') ? '' : 'none';
      dIn.style.display = (p === 'day' || p === 'hour' || p === 'minute') ? '' : 'none';
      hIn.style.display = (p === 'hour' || p === 'minute') ? '' : 'none';
      miIn.style.display = (p === 'minute') ? '' : 'none';
      mIn.value = n.month || '';
      dIn.value = n.day || '';
      hIn.value = n.hour || '';
      miIn.value = n.minute || '';
    }
    updateTimeFields();
    function commitTimeFields() {
      var p = n.precision || 'year';
      if (p === 'month' || p === 'day' || p === 'hour' || p === 'minute') n.month = parseInt(mIn.value, 10) || undefined;
      if (p === 'day' || p === 'hour' || p === 'minute') n.day = parseInt(dIn.value, 10) || undefined;
      if (p === 'hour' || p === 'minute') n.hour = parseInt(hIn.value, 10) || undefined;
      if (p === 'minute') n.minute = parseInt(miIn.value, 10) || undefined;
    }
    [mIn, dIn, hIn, miIn].forEach(function (inp) {
      inp.addEventListener('change', function () { commitTimeFields(); saveTimelines(); time.textContent = fmtNodeTime(n); });
    });
    /* 直接更新节点位置（不重建 DOM，面板保持打开，不弹） */
    function moveNodeToYear(v) {
      var tl = timelines[el.getAttribute('data-tl')];
      if (!tl) return;
      n.year = v;
      if (n.absYear !== undefined && n.absYear !== null) n.absYear = (tl.absOffset || 0) + v;
      if (nonlinearMode) {
        updatePositions();   /* 非线性：年份改变影响序列排序，整体重排（含重复段） */
      } else {
        /* 同步所有段：普通节点 + 循环重复段（is-loop-repeat 带 _ghostOffset 偏移） */
        nodesEl.querySelectorAll('.tl__n').forEach(function (e) {
          if (e._node === n) {
            var off = e._ghostOffset || 0;
            e.style.left = (timeToX(absYearOf(n, tl) + off) + panXBase) + 'px';
          }
        });
      }
      buildScale();
      saveTimelines();
    }
    yearInput.oninput = function () {
      var v = parseFloat(yearInput.value);
      if (isNaN(v)) return;
      moveNodeToYear(v);
      time.textContent = fmtNodeTime(n);
    };
    precSel.onchange = function () {
      n.precision = precSel.value;
      updateTimeFields();
      saveTimelines();
      /* 精度改影响定位 + 显示，重建一次（面板收回可接受） */
      var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
      renderTimeline(false);
      panX = keepPanX; panY = keepPanY;
      NODE_SPACING = keepSpacing;
      updatePositions();
      applyModeView();
      applyPan();
      var newEl = null;
      nodesEl.querySelectorAll('.tl__n').forEach(function (e) {
        if (e._node && e._node.title === n.title && toNumber(e._node.year) === toNumber(n.year)) {
          newEl = e;
        }
      });
      if (newEl) {
        openNodeEl = newEl;
        newEl.classList.add('is-featured');
        showDetail(newEl._node, newEl);
      }
    };
    /* title & desc are inline-editable (contenteditable) — edits sync back
       to the node, the timeline label, the loop template, and localStorage */
    title.contentEditable = 'true';
    title.title = '点击编辑标题';
    title.textContent = n.title;
    desc.contentEditable = 'true';
    desc.title = '点击编辑描述（支持换行）';
    desc.textContent = n.desc || '那天的事，你只记得这些。';

    /* save edits on blur */
    title.onblur = function () {
      var newTitle = title.textContent.trim();
      if (!newTitle) { title.textContent = n.title; return; }
      if (newTitle !== n.title) {
        n.title = newTitle;
        syncNodeText(n, el, 'title');
        saveTimelines();
      }
    };
    desc.onblur = function () {
      var newDesc = desc.textContent.trim();
      if (newDesc !== (n.desc || '')) {
        n.desc = newDesc;
        syncNodeText(n, el, 'desc');
        saveTimelines();
      }
    };
    /* Enter in title commits (blur); Enter in desc inserts newline */
    title.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };

    people.innerHTML = '';
    places.innerHTML = '';
    renderChips(people, (n.people || []).map(function (p) { return { role: '人物', value: p }; }), function (v) { removeLinked(n, 'people', v, el); });
    renderChips(places, (n.places || []).map(function (p) { return { role: '地点', value: p }; }), function (v) { removeLinked(n, 'places', v, el); });
    addLinkedInput(people, n, 'people', '人物', el);
    addLinkedInput(places, n, 'places', '地点', el);
    foot.textContent = n.type === 'year' ? '年代锚点' : (n.type === 'plot' ? '剧情 / 人物节点' : '世界事件节点');

    /* delete this node (loop clones remove from their style template so
       every synchronized cycle loses it too) */
    var delBtn = document.createElement('button');
    delBtn.className = 'tl__del';
    delBtn.textContent = '删除节点';
    delBtn.addEventListener('click', function () { deleteNode(n, el); });
    foot.appendChild(delBtn);

    /* sync the type switch with the node's current type */
    var typeBtns = document.querySelectorAll('#d-type button');
    for (var b = 0; b < typeBtns.length; b++) {
      typeBtns[b].classList.toggle('is-on', typeBtns[b].getAttribute('data-type') === (n.type === 'plot' ? 'plot' : 'event'));
    }

    detailEl.classList.add('is-open');
    detailEl.setAttribute('aria-hidden', 'false');
  }

  /* delete a node (loop clones remove from their style template too);
     shared by the detail panel's button and the context menu */
  function deleteNode(n, el) {
    var tlId = el.getAttribute('data-tl');
    var tl = timelines[tlId];
    if (!tl) return;
    var idx = tl.nodes.indexOf(n);
    if (idx >= 0) tl.nodes.splice(idx, 1);
    saveTimelines();   /* node removed from its timeline */
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    applyPan();
    closeDetail();
  }

  /* sync an edited node's title/desc to the timeline label AND the loop
     style template (so every synchronized cycle reflects the change) */
  function syncNodeText(n, el, field) {
    /* 同步所有段：普通节点 + 循环重复段（is-loop-repeat）都显示同一标题 */
    if (field === 'title') {
      nodesEl.querySelectorAll('.tl__n').forEach(function (e) {
        if (e._node === n) {
          var nm = e.querySelector('.name');
          if (nm) nm.textContent = n.title;
        }
      });
    }
    layoutNames();   /* re-split labels if a title grew/shrunk */
  }

  /* switching the type in the info panel re-fans the labels */
  document.querySelectorAll('#d-type button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!openNodeEl) return;
      var n = openNodeEl._node;
      n.type = btn.getAttribute('data-type');
      var btns = document.querySelectorAll('#d-type button');
      for (var b = 0; b < btns.length; b++) {
        btns[b].classList.toggle('is-on', btns[b] === btn);
      }
      foot.textContent = n.type === 'plot' ? '剧情 / 人物节点' : '世界事件节点';
      saveTimelines();   /* node type changed */
      layoutNames();
    });
  });

  function renderChips(box, list, onRemove) {
    if (!list.length) {
      var none = document.createElement('div');
      none.className = 'tl__chip';
      none.style.color = 'var(--meta)';
      none.textContent = '— 尚无记录 —';
      box.appendChild(none);
      return;
    }
    list.forEach(function (item) {
      var c = document.createElement('div');
      c.className = 'tl__chip';
      var role = document.createElement('span');
      role.className = 'role';
      role.textContent = item.role;
      c.appendChild(role);
      c.appendChild(document.createTextNode(item.value));
      if (onRemove) {
        var x = document.createElement('button');
        x.className = 'tl__chip-del';
        x.textContent = '×';
        x.title = '移除';
        x.addEventListener('click', function () { onRemove(item.value); });
        c.appendChild(x);
      }
      box.appendChild(c);
    });
  }
  /* remove a linked person/place from the node (and loop template) */
  function removeLinked(n, key, value, el) {
    var arr = n[key] || [];
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    syncLoopField(n, el, key, arr);
    saveTimelines();
    if (openNodeEl === el) showDetail(n, el);   /* re-render the panel */
  }
  /* inline add box under the chips — Enter commits */
  function addLinkedInput(box, n, key, label, el) {
    var wrap = document.createElement('div');
    wrap.className = 'tl__linked-add';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '添加' + label + '…';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = input.value.trim();
        if (!v) return;
        n[key] = n[key] || [];
        if (n[key].indexOf(v) === -1) n[key].push(v);
        input.value = '';
        syncLoopField(n, el, key, n[key]);
        saveTimelines();
        if (openNodeEl === el) showDetail(n, el);
      }
    });
    wrap.appendChild(input);
    box.appendChild(wrap);
  }
  /* 新模型：节点平铺，人物/地点直接改节点即可，无需同步到循环模板 */
  function syncLoopField(n, el, key, arr) {
    /* no-op */
  }

  function closeDetail() {
    openNodeEl = null;
    activeLoop = null;
    detailEl.classList.remove('is-open');
    detailEl.setAttribute('aria-hidden', 'true');
    nodesEl.querySelectorAll('.tl__n.is-featured').forEach(function (x) {
      x.classList.remove('is-featured');
    });
    nodesEl.querySelectorAll('.tl__loop.is-active').forEach(function (x) {
      x.classList.remove('is-active');
    });
    /* restore node-detail sections, hide the loop settings block */
    detailEl.classList.remove('is-loop');
    var loopBox = document.getElementById('d-loop');
    if (loopBox) loopBox.style.display = 'none';
    /* return to where the view was BEFORE the node was opened, not the
       timeline start; MUST sync panX too, else the next zoom/pan applies a
       stale panX and the view jumps away */
    if (preOpenPanX !== null) {
      panX = preOpenPanX;
      preOpenPanX = null;
    }
    /* 无历史位置时保持当前视图，不飞回起点 */
    applyPan();
    scrolled = false;
  }

  document.getElementById('d-close').addEventListener('click', closeDetail);

  /* empty timelines can never open a detail */

  /* ── timeline CRUD ───────────────────────────────────── */
  function clearTimeline(tlId) {
    var targetId = tlId || ctxTlId || activeId;   /* multi: the lane clicked */
    var name = (timelines[targetId] || {}).name || targetId;
    confirmInApp('要抹去「' + name + '」的全部节点吗？', '清空时间线').then(function (ok) {
      if (!ok) return;
      timelines[targetId].nodes = [];
      if (Array.isArray(timelines[targetId].loops)) {
        /* remove the loops entirely — an empty cycle with no styles should
           leave no frames behind (user: "节点清空了，但循环框还在") */
        delete timelines[targetId].loops;
      }
      renderTimeline();
      saveTimelines();
    });
  }

  /* switch between time-linear and event-sequence (nonlinear) layout */
  function toggleNonlinear() {
    nonlinearMode = !nonlinearMode;
    if (nonlinearMode && multiMode) {
      /* sequence (observe nodes) and parallel (align world times) are
         mutually exclusive — turning one on forces the other off */
      multiMode = false;
      if (multiBtn) multiBtn.classList.remove('is-on');
      if (stage) stage.classList.remove('is-multi');
      if (tabsBox) tabsBox.classList.add('is-ready');
    }
    syncNonlinearUI();
    /* 不重建：直接重新定位，节点靠 CSS transition 缓动到新位置 */
    NODE_SPACING = fitSpacing();
    zoomDepth = 0;
    if (nonlinearMode) {
      var nSeq = seqNodeCount();
      seqPitch = Math.max(32, Math.min(300, (stage.clientWidth - 2 * PAD_X) / Math.max(1, nSeq)));
      panX = stage.clientWidth / 2 - (PAD_X + (nSeq / 2) * seqPitch);
    } else {
      var loT = Infinity, hiT = -Infinity;
      (multiMode ? order.slice() : [activeId]).forEach(function (id) {
        var tl = timelines[id];
        if (!tl) return;
        loopsOf(tl).forEach(function (L) {
          var r = loopRange(tl, L);
          if (r) {
            hiT = Math.max(hiT, r.hi);
            loT = Math.min(loT, r.lo);
          }
        });
        if (Array.isArray(tl.nodes)) tl.nodes.forEach(function (n) {
          var t = absYearOf(n, tl);
          if (t < loT) loT = t;
          if (t > hiT) hiT = t;
        });
      });
      if (isFinite(loT) && hiT > loT) {
        panX = stage.clientWidth / 2 - (timeToX(loT) + timeToX(hiT)) / 2;
      } else {
        panX = -cachedMaxX / 2;
      }
    }
    panXBase = panX;
    panY = 0;
    updatePositions();
    applyPan();
  }
  /* reflect nonlinear state on both the resident button and the ctx menu */
  function syncNonlinearUI() {
    var nb = document.getElementById('tl-nonlinear');
    if (nb) nb.classList.toggle('is-on', nonlinearMode);
    var cb = document.getElementById('ctx-nonlinear');
    if (cb) cb.textContent = nonlinearMode ? '线性模式' : '非线性模式';
  }
  var nonlinearBtn = document.getElementById('tl-nonlinear');
  if (nonlinearBtn) nonlinearBtn.addEventListener('click', toggleNonlinear);
  var fitAllBtn = document.getElementById('tl-fitall');
  if (fitAllBtn) fitAllBtn.addEventListener('click', function () { fitAllView(true); });   /* glide, don't rebuild */

  /* generic in-app confirm (replaces window.confirm) */
  var confirmModal = document.getElementById('tl-confirm-modal');
  var confirmResolve = null;
  function confirmInApp(message, title) {
    document.getElementById('confirm-modal-title').textContent = title || '确认';
    document.getElementById('confirm-modal-message').textContent = message;
    confirmModal.style.display = 'flex';
    return new Promise(function (res) { confirmResolve = res; });
  }
  function closeConfirm(ok) {
    confirmModal.style.display = 'none';
    if (confirmResolve) { confirmResolve(ok); confirmResolve = null; }
  }
  document.getElementById('confirm-modal-ok').addEventListener('click', function () { closeConfirm(true); });
  document.getElementById('confirm-modal-cancel').addEventListener('click', function () { closeConfirm(false); });
  confirmModal.addEventListener('click', function (e) { if (scrubJustEnded) return; if (e.target === confirmModal) closeConfirm(false); });

  /* switch the active worldset: save current, load target, re-render */
  function switchWorldset(name) {
    if (name === activeWorldset || !worldsets[name]) return;
    saveTimelines();   /* persist the current set first */
    activeWorldset = name;
    var ws = worldsets[name] || {};
    timelines = ws.timelines || {};
    order = Array.isArray(ws.order) && ws.order.length ? ws.order : Object.keys(timelines);
    docs = ws.docs || {};
    if (!order.length) order = Object.keys(timelines);
    activeId = order[0] || '';
    saveTimelines();
    if (typeof lastSaved !== 'undefined') {
      lastSaved = JSON.stringify({ timelines: timelines, order: order });
      undoStack.length = 0;
      undoRedoStack.length = 0;
    }
    /* fresh worldset → fit the whole range (open at a glance) */
    nonlinearMode = false;
    multiMode = false;
    syncNonlinearUI();
    if (multiBtn) multiBtn.classList.remove('is-on');
    if (stage) stage.classList.remove('is-multi');
    NODE_SPACING = fitSpacing();
    renderTimeline(false);
    applyModeView();
    fitAllView();
    refreshWorldsetBtn();
  }

  /* fit the whole current view (all visible worlds / the active one):
     recenter spacing AND the viewport on the year range, so a world at
     year 1999-2020 is actually visible (track starts at year 0). */
    /* fit animation — nodes snap to the fit layout (spacing is set), then
     only the viewport CENTRE TIME glides (panX derived), so the camera
     slides to the overview without nodes flying off to huge x values
     (easing both spacing AND panX independently caused that). */
  var fitRaf = null;
  var FIT = { fromC: 0, toC: 0, t0: 0, dur: 420 };
  function fitEase(now) {
    track.classList.add('is-panning');   /* 相机 glide 时节点即时跟随，不缓动 */
    var k = Math.min(1, (now - FIT.t0) / FIT.dur);
    var e = 1 - Math.pow(1 - k, 3);   /* ease-out */
    var ct = FIT.fromC + (FIT.toC - FIT.fromC) * e;
    panX = stage.clientWidth / 2 - timeToX(ct);
    panXBase = panX;
    layoutNodes();
    buildScale();
    if (k < 1) fitRaf = requestAnimationFrame(fitEase);
    else { fitRaf = null; track.classList.remove('is-panning'); applyPan(); refreshPanBounds(); }
  }

  function fitAllView(noRebuild) {
    var fromS = NODE_SPACING, fromQ = seqPitch, fromX = panX;
    var fromC = xToTime(stage.clientWidth / 2 - fromX);   /* centre time, OLD spacing */
    NODE_SPACING = fitSpacing();
    zoomDepth = 0;              /* fit = depth 0 — wheel zoom anchors from here */
    if (nonlinearMode) {
      /* sequence view lays nodes out by index at seqPitch — fit = spread
         them across the viewport width */
      var nSeq = seqNodeCount();
      seqPitch = Math.max(32, Math.min(300, (stage.clientWidth - 2 * PAD_X) / Math.max(1, nSeq)));
    }
    if (!noRebuild) renderTimeline(false);   /* rebuild unless told to keep lanes */
    applyModeView();
    refreshPanBounds();
    var loT = Infinity, hiT = -Infinity;
    (multiMode ? order.slice() : [activeId]).forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;
      loopsOf(tl).forEach(function (L) {
        var r = loopRange(tl, L);
        if (r) {
          hiT = Math.max(hiT, r.hi);
          loT = Math.min(loT, r.lo);
        }
      });
      if (Array.isArray(tl.nodes)) tl.nodes.forEach(function (n) {
        var t = absYearOf(n, tl);
        if (t < loT) loT = t;
        if (t > hiT) hiT = t;
      });
    });
    if (nonlinearMode) {
      /* sequence layout is index-based — center the first/last node span */
      var nSeq = seqNodeCount();
      panX = stage.clientWidth / 2 - (PAD_X + (nSeq / 2) * seqPitch);
    } else if (isFinite(loT) && hiT > loT) {
      var cx = (timeToX(loT) + timeToX(hiT)) / 2;
      panX = stage.clientWidth / 2 - cx;
    } else {
      panX = -cachedMaxX / 2;
    }
    panXBase = panX;   /* bake the new camera into node left */
    panY = 0;
    if (!noRebuild) {
      /* just rebuilt — nothing to glide from; commit instantly */
      track.classList.add('is-panning');
      updatePositions();
      track.style.transform = 'translate(' + (panX - panXBase) + 'px,' + panY + 'px)';
      void track.offsetWidth;   /* force reflow → commit the style */
      track.classList.remove('is-panning');
      return;
    }
    /* snap nodes to the fit layout, then glide only the camera to centre */
    if (fitRaf) cancelAnimationFrame(fitRaf);
    updatePositions();   /* spacing is final — nodes take the fit layout */
    FIT.fromC = fromC;   /* centre time measured with the OLD spacing */
    FIT.toC = xToTime(stage.clientWidth / 2 - panX);
    FIT.t0 = performance.now();
    fitRaf = requestAnimationFrame(fitEase);
  }
  /* create a new (empty) worldset */
  function createWorldset(name) {
    if (!name || worldsets[name]) return false;
    worldsets[name] = { timelines: {}, order: [], docs: {} };
    switchWorldset(name);
    return true;
  }

  /* 种子/示例数据来自 data/worldbuilding.js（window.__SEED_TIMELINES__），
     初始 worldset「示例世界观」即装载示例数据，无需额外内置测试集。 */

  /* open the worldset picker modal (list existing sets + create new) */
  var worldsetBtn = document.getElementById('tl-worldset-btn');
  var wsMenu = null;   /* lazy — the menu HTML sits AFTER the script tag */
  function wsMenuEl() {
    if (!wsMenu) wsMenu = document.getElementById('tl-ws-dropmenu');
    return wsMenu;
  }
  function fillWorldsetDrop() {
    var list = document.getElementById('tl-ws-drop-list');
    list.innerHTML = '';
    Object.keys(worldsets).forEach(function (name) {
      var b = document.createElement('button');
      b.textContent = name + (name === activeWorldset ? '（当前）' : '');
      b.classList.toggle('is-active', name === activeWorldset);
      b.addEventListener('click', function () {
        closeWorldsetDrop();
        if (name !== activeWorldset) switchWorldset(name);
      });
      list.appendChild(b);
    });
  }
  function openWorldsetDrop() {
    fillWorldsetDrop();
    var m = wsMenuEl();
    if (!m) return;
    /* position under the button, clamped to the window (never overflow) */
    var br = worldsetBtn.getBoundingClientRect();
    m.style.display = 'block';
    var mw = m.offsetWidth || 220, mh = m.offsetHeight || 180;
    var left = Math.max(4, Math.min(br.left, window.innerWidth - mw - 4));
    var top = (br.bottom + 4 + mh <= window.innerHeight)
      ? br.bottom + 4
      : Math.max(4, br.top - mh - 4);   /* flip above if no room below */
    m.style.left = left + 'px';
    m.style.top = top + 'px';
  }
  function closeWorldsetDrop() { var m = wsMenuEl(); if (m) m.style.display = 'none'; }
  if (worldsetBtn) worldsetBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var m = wsMenuEl();
    if (!m) return;
    m.style.display === 'block' ? closeWorldsetDrop() : openWorldsetDrop();
  });
  document.addEventListener('click', function (e) {
    var m = wsMenuEl();
    if (m && m.style.display === 'block' && !m.contains(e.target) && e.target !== worldsetBtn) closeWorldsetDrop();
  });
  /* create action — elements live after the script tag, resolve lazily */
  function wsDropCreateEl() { return document.getElementById('tl-ws-drop-create'); }
  document.addEventListener('click', function (e) {
    var btn = wsDropCreateEl();
    if (!btn || e.target !== btn) return;
    var name = document.getElementById('tl-ws-drop-name').value.trim();
    if (!name) return;
    closeWorldsetDrop();
    createWorldset(name);
  });
  document.addEventListener('keydown', function (e) {
    var input = document.getElementById('tl-ws-drop-name');
    if (!input || e.target !== input || e.key !== 'Enter') return;
    var btn = wsDropCreateEl();
    if (btn) btn.click();
  });
  function refreshWorldsetBtn() {
    if (worldsetBtn) worldsetBtn.textContent = activeWorldset + ' ▾';
  }
  refreshWorldsetBtn();

  /* create a cyclic loop on the current timeline: opens an in-app dialog
     (interval / count / style name / first-node title), builds a default
     style template and renders the loop frames. Existing loop → confirm. */
  var loopModal = document.getElementById('tl-loop-modal');
  /* 循环创建面板可拖动（按住标题栏拖） */
  (function () {
    var card = loopModal.querySelector('.tl__modal-card');
    var title = loopModal.querySelector('.tl__modal-title');
    var offX = 0, offY = 0, dragging = false, sx = 0, sy = 0;
    title.style.cursor = 'move';
    title.addEventListener('mousedown', function (e) {
      dragging = true;
      sx = e.clientX - offX;
      sy = e.clientY - offY;
      card.style.animation = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      offX = e.clientX - sx;
      offY = e.clientY - sy;
      card.style.transform = 'translate(' + offX + 'px,' + offY + 'px)';
    });
    window.addEventListener('mouseup', function () { dragging = false; });
  })();
  function createLoop() {
    var tl = timelines[activeId];
    if (!tl) return;
    document.getElementById('loop-modal-title').textContent = '循环 · ' + tl.name;
    document.getElementById('loop-modal-name').value = '';
    document.getElementById('loop-start-title').value = '';
    document.getElementById('loop-modal-start').value = '';
    document.getElementById('loop-start-desc').value = '';
    document.getElementById('loop-end-title').value = '';
    document.getElementById('loop-modal-end').value = '';
    document.getElementById('loop-end-desc').value = '';
    eyedropStartNodeId = null;
    eyedropEndNodeId = null;
    updateLoopPickUI();
    loopModal.style.display = 'flex';
    document.getElementById('loop-modal-start').focus();
  }
  /* 实时校验起始/结束年份（红字提醒，不弹窗） */
  (function () {
    var sIn = document.getElementById('loop-modal-start');
    var eIn = document.getElementById('loop-modal-end');
    var errEl = document.getElementById('loop-modal-error');
    function check() {
      var s = parseFloat(sIn.value), e = parseFloat(eIn.value);
      if (!isNaN(s) && !isNaN(e) && e <= s) {
        errEl.textContent = '结束年份必须大于起始年份';
        errEl.style.display = '';
      } else {
        errEl.style.display = 'none';
      }
    }
    sIn.addEventListener('input', check);
    eIn.addEventListener('input', check);
  })();
  function confirmLoop() {
    var loopName = document.getElementById('loop-modal-name').value.trim() || '循环';
    var errEl = document.getElementById('loop-modal-error');
    var tl = timelines[activeId];
    if (!Array.isArray(tl.loops)) tl.loops = [];
    if (!Array.isArray(tl.nodes)) tl.nodes = [];
    /* 起始节点：吸取的已有节点，或新建边界节点（智能共享：起始年≈已有循环结束节点时自动复用） */
    var startId = eyedropStartNodeId;
    if (!startId) {
      var startY = parseFloat(document.getElementById('loop-modal-start').value);
      if (isNaN(startY)) {
        errEl.textContent = '请填写起始年份';
        errEl.style.display = '';
        document.getElementById('loop-modal-start').focus();
        return;
      }
      /* 智能共享：起始年 ≈ 某条已有循环的结束节点（半年内视为首尾相接）→ 复用为共享边界 */
      var shareEnd = null, shareD = Infinity;
      loopsOf(tl).forEach(function (other) {
        var oe = findNodeById(tl, other.endNodeId);
        if (!oe) return;
        var d = Math.abs(absYearOf(oe, tl) - startY);
        if (d < shareD) { shareD = d; shareEnd = oe; }
      });
      if (shareEnd && shareD < 0.5) {
        shareEnd.boundary = 'both';
        startId = shareEnd.id;
      } else {
        var startTitle = document.getElementById('loop-start-title').value.trim() || '循环起始';
        var startDesc = document.getElementById('loop-start-desc').value.trim();
        var startN = { id: 'n_' + Date.now() + '_s', type: 'loop-boundary', boundary: 'start', year: startY, title: startTitle, desc: startDesc, people: [], places: [], precision: 'year' };
        tl.nodes.push(startN);
        startId = startN.id;
      }
    }
    /* 结束节点：吸取的已有节点，或新建边界节点 */
    var endId = eyedropEndNodeId;
    if (!endId) {
      var endY = parseFloat(document.getElementById('loop-modal-end').value);
      if (isNaN(endY)) {
        errEl.textContent = '请填写结束年份';
        errEl.style.display = '';
        document.getElementById('loop-modal-end').focus();
        return;
      }
      var endTitle = document.getElementById('loop-end-title').value.trim() || '循环结束';
      var endDesc = document.getElementById('loop-end-desc').value.trim();
      var endN = { id: 'n_' + Date.now() + '_e', type: 'loop-boundary', boundary: 'end', year: endY, title: endTitle, desc: endDesc, people: [], places: [], precision: 'year' };
      tl.nodes.push(endN);
      endId = endN.id;
    }
    /* 越界校验：结束节点必须晚于起始节点 */
    var sNode = findNodeById(tl, startId);
    var eNode = findNodeById(tl, endId);
    if (sNode && eNode && absYearOf(eNode, tl) <= absYearOf(sNode, tl)) {
      errEl.textContent = '结束节点必须晚于起始节点';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';
    tl.loops.push({ id: 'lp_' + Date.now(), name: loopName, startNodeId: startId, endNodeId: endId, count: 1 });
    saveTimelines();
    loopModal.style.display = 'none';
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    applyPan();
  }
  /* 吸管：吸取画布时间到起点/终点框，精度随当前缩放档位 */
  function roundToBand(t) {
    var band = currentScaleBand();
    if (band === 'year') return Math.round(t);
    if (band === 'month') return Math.round(t * 12) / 12;
    if (band === 'day') return Math.round(t * 360) / 360;
    if (band === 'hour') return Math.round(t * 8640) / 8640;
    return Math.round(t * 518400) / 518400;
  }
  /* 吸管：吸取画布节点/时间到起始/结束节点框 */
  var eyedropTarget = null;
  var eyedropOwner = 'loop';   /* 吸管归属：'loop'（循环面板）/'story'（剧情范围面板） */
  var eyedropStartNodeId = null;   /* 起始节点吸取的已有节点 id（null=新建） */
  var eyedropEndNodeId = null;     /* 结束节点吸取的已有节点 id（null=新建） */
  function startEyedrop(target) {
    eyedropTarget = target;
    loopModal.style.display = 'none';
    if (storyModal) storyModal.style.display = 'none';   /* 剧情范围面板也收起 */
    stage.classList.add('is-eyedropping');
    var b = document.getElementById('loop-pick-' + target);
    if (b) b.classList.add('is-picking');
    document.body.style.cursor = 'crosshair';
    var tip = document.getElementById('eyedrop-tip');
    if (tip) { tip.style.display = ''; tip.textContent = '吸取时间'; }
  }
  function endEyedrop() {
    eyedropTarget = null;
    stage.classList.remove('is-eyedropping');
    ['start', 'end'].forEach(function (k) {
      var b = document.getElementById('loop-pick-' + k);
      if (b) b.classList.remove('is-picking');
    });
    document.body.style.cursor = '';
    var tip = document.getElementById('eyedrop-tip');
    if (tip) tip.style.display = 'none';
  }
  /* 吸管模式下，鼠标旁小字提示：悬停节点显示"吸取节点：标题"，否则"吸取时间" */
  window.addEventListener('pointermove', function (e) {
    if (!eyedropTarget) return;
    var tip = document.getElementById('eyedrop-tip');
    if (!tip) return;
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
    var near = nearestNodeAt(e.clientX, e.clientY);
    tip.textContent = (near && near._node) ? ('吸取节点：' + near._node.title) : '吸取时间';
  });
  document.getElementById('loop-pick-start').addEventListener('click', function (e) {
    e.stopPropagation();
    startEyedrop('start');
  });
  document.getElementById('loop-pick-end').addEventListener('click', function (e) {
    e.stopPropagation();
    startEyedrop('end');
  });
  /* 更新创建循环面板的起始/结束节点显示（新建 vs 已吸取） */
  function updateLoopPickUI() {
    var tl = timelines[activeId];
    var sPicked = document.getElementById('loop-start-picked');
    var sFields = document.getElementById('loop-start-fields');
    var sName = document.getElementById('loop-start-picked-name');
    if (eyedropStartNodeId) {
      var sn = findNodeById(tl, eyedropStartNodeId);
      sName.textContent = sn ? sn.title : '已吸取节点';
      sPicked.style.display = 'flex';
      sFields.style.display = 'none';
    } else {
      sPicked.style.display = 'none';
      sFields.style.display = '';
    }
    var ePicked = document.getElementById('loop-end-picked');
    var eFields = document.getElementById('loop-end-fields');
    var eName = document.getElementById('loop-end-picked-name');
    if (eyedropEndNodeId) {
      var en = findNodeById(tl, eyedropEndNodeId);
      eName.textContent = en ? en.title : '已吸取节点';
      ePicked.style.display = 'flex';
      eFields.style.display = 'none';
    } else {
      ePicked.style.display = 'none';
      eFields.style.display = '';
    }
  }
  document.getElementById('loop-start-unpick').addEventListener('click', function () {
    eyedropStartNodeId = null;
    updateLoopPickUI();
  });
  document.getElementById('loop-end-unpick').addEventListener('click', function () {
    eyedropEndNodeId = null;
    updateLoopPickUI();
  });
  document.getElementById('loop-modal-ok').addEventListener('click', confirmLoop);
  document.getElementById('loop-modal-cancel').addEventListener('click', function () { loopModal.style.display = 'none'; });
  loopModal.addEventListener('click', function (e) { if (scrubJustEnded) return; if (e.target === loopModal) loopModal.style.display = 'none'; });
  var newlineModal = document.getElementById('tl-newline-modal');
  document.getElementById('tl-tab-add').addEventListener('click', function () {
    document.getElementById('newline-modal-name').value = '';
    newlineModal.style.display = 'flex';
    document.getElementById('newline-modal-name').focus();
  });
  function confirmNewline() {
    var name = document.getElementById('newline-modal-name').value.trim() || '未命名世界线';
    var id = 'tl_' + Date.now();
    timelines[id] = { id: id, name: name, nodes: [] };
    order.push(id);
    saveTimelines();
    newlineModal.style.display = 'none';
    /* rebuild so the new world's lane + tab exist, then show it */
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    applyPan();
    selectTimeline(id);
  }
  document.getElementById('newline-modal-ok').addEventListener('click', confirmNewline);
  document.getElementById('newline-modal-cancel').addEventListener('click', function () { newlineModal.style.display = 'none'; });
  newlineModal.addEventListener('click', function (e) { if (scrubJustEnded) return; if (e.target === newlineModal) newlineModal.style.display = 'none'; });
  document.getElementById('newline-modal-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirmNewline();
  });

  function delTimeline(id) {
    if (order.length <= 1) { return; }
    confirmInApp('要抹去「' + timelines[id].name + '」这条世界线吗？', '删除世界线').then(function (ok) {
      if (!ok) return;
      var idx = order.indexOf(id);
      order.splice(idx, 1);
      delete timelines[id];
      saveTimelines();   /* worldline deleted */
      if (activeId === id) {
        activeId = order[Math.max(0, idx - 1)];
        renderTimeline();
      } else {
        renderTimelineTabs();
      }
    });
  }

  /* add-node dialog (app-native modal) */
  var nodeModal = document.getElementById('tl-node-modal');
  var nodeModalTarget = document.getElementById('node-modal-target');
  function fillNodeTargets() {
    nodeModalTarget.innerHTML = '';
    order.forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = timelines[id].name;
      nodeModalTarget.appendChild(opt);
    });
    nodeModalTarget.value = activeId;
  }
  function syncTimeFields() {
    var p = document.getElementById('node-modal-precision').value;
    var showYMD = (p === 'day' || p === 'hour' || p === 'minute');
    document.getElementById('node-modal-month').style.display = (p === 'year') ? 'none' : '';
    document.getElementById('node-modal-day').style.display = showYMD ? '' : 'none';
    document.getElementById('node-modal-hour').style.display = (p === 'hour' || p === 'minute') ? '' : 'none';
    document.getElementById('node-modal-minute').style.display = (p === 'minute') ? '' : 'none';
  }
  /* tag collector: input#id → Enter adds to list[], renders into #tags */
  function bindTagInput(inputId, tagsId, list) {
    var input = document.getElementById(inputId);
    var box = document.getElementById(tagsId);
    function render() {
      box.innerHTML = '';
      list.forEach(function (v, i) {
        var t = document.createElement('span');
        t.className = 'tl__modal-tag';
        t.textContent = v;
        var x = document.createElement('button');
        x.textContent = '×';
        x.addEventListener('click', function () { list.splice(i, 1); render(); });
        t.appendChild(x);
        box.appendChild(t);
      });
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = input.value.trim();
        if (v && list.indexOf(v) === -1) { list.push(v); input.value = ''; render(); }
      }
    });
    render();
  }
  var modalPeople = [], modalPlaces = [];
  function openForm(yearHint) {
    /* reset to blank, show target picker only in multi mode */
    document.getElementById('node-modal-precision').value = (SETTINGS && SETTINGS.defPrecision) ? SETTINGS.defPrecision : 'day';
    document.getElementById('node-modal-year').value = '';
    document.getElementById('node-modal-month').value = '';
    document.getElementById('node-modal-day').value = '';
    document.getElementById('node-modal-hour').value = '';
    document.getElementById('node-modal-minute').value = '';
    document.getElementById('node-modal-title-input').value = '';
    document.getElementById('node-modal-desc').value = '';
    document.getElementById('node-modal-type').value = 'event';
    document.getElementById('node-modal-target-wrap').style.display = multiMode ? '' : 'none';
    if (multiMode) fillNodeTargets();
    document.getElementById('node-modal-title').textContent = '添加节点 · ' + timelines[activeId].name;
    modalPeople.length = 0; modalPlaces.length = 0;
    bindTagInput('node-modal-people', 'node-modal-people-tags', modalPeople);
    bindTagInput('node-modal-places', 'node-modal-places-tags', modalPlaces);
    syncTimeFields();
    nodeModal.style.display = 'flex';
    if (yearHint !== undefined) {
      /* pre-fill from the ruler cursor — hint is LOCAL year already */
      var y = Math.floor(yearHint);
      document.getElementById('node-modal-year').value = y;
      var frac = yearHint - y;
      if (frac > 0.001) {
        var mo = Math.floor(frac * 12) + 1;
        document.getElementById('node-modal-month').value = mo;
        var dfrac = frac * 12 - (mo - 1);
        var da = Math.floor(dfrac * 30) + 1;
        if (da <= 31) document.getElementById('node-modal-day').value = da;
        var hfrac = dfrac * 30 - (da - 1);
        var hh = Math.floor(hfrac * 24);
        document.getElementById('node-modal-hour').value = hh;
        var mifrac = hfrac * 24 - hh;
        document.getElementById('node-modal-minute').value = Math.round(mifrac * 60);
      }
      document.getElementById('node-modal-title-input').focus();
    } else {
      document.getElementById('node-modal-year').focus();
    }
  }
  function closeForm() { nodeModal.style.display = 'none'; }
  document.getElementById('node-modal-precision').addEventListener('change', syncTimeFields);
  function confirmNode() {
    var precision = document.getElementById('node-modal-precision').value;
    var year = toNumber(document.getElementById('node-modal-year').value);
    var type = document.getElementById('node-modal-type').value;
    var title = document.getElementById('node-modal-title-input').value.trim();
    var desc = document.getElementById('node-modal-desc').value.trim();
    if (!title) { document.getElementById('node-modal-title-input').focus(); return; }
    var node = { year: year, type: type, title: title, desc: desc, tag: '事件', people: modalPeople.slice(), places: modalPlaces.slice(), precision: precision };
    if (precision !== 'year') {
      node.month = toNumber(document.getElementById('node-modal-month').value) || undefined;
      if (precision === 'day' || precision === 'hour' || precision === 'minute') node.day = toNumber(document.getElementById('node-modal-day').value) || undefined;
      if (precision === 'hour' || precision === 'minute') node.hour = toNumber(document.getElementById('node-modal-hour').value) || undefined;
      if (precision === 'minute') node.minute = toNumber(document.getElementById('node-modal-minute').value) || undefined;
    }
    var targetId = multiMode
      ? document.getElementById('node-modal-target').value
      : activeId;
    var tl = timelines[targetId];
    if (tl) {
      if (!node.id) node.id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      tl.nodes.push(node);
    }
    saveTimelines();   /* persist the new node */
    closeForm();
    var keepPanX = panX, keepPanY = panY, keepSpacing = NODE_SPACING;
    renderTimeline(false);      /* no wake animation on add */
    panX = keepPanX; panY = keepPanY;
    NODE_SPACING = keepSpacing;
    updatePositions();
    applyModeView();
    applyPan();
  }
  document.getElementById('node-modal-ok').addEventListener('click', confirmNode);
  document.getElementById('node-modal-cancel').addEventListener('click', closeForm);
  nodeModal.addEventListener('click', function (e) { if (scrubJustEnded) return; if (e.target === nodeModal) closeForm(); });
  document.getElementById('node-modal-title-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirmNode();
  });

  /* ── pan + zoom (AE-style, depth-based) ─────────────── */
  var panX = 0;
  var panY = 0;               /* vertical pan (wheel scrolls lanes) */
  var cachedMaxX = 0;         /* clamped pan bounds, cached to avoid reflow */
  var cachedMinX = 0;         /* lower pan bound — content start vs left edge */
  var cachedMaxY = 0;
  var targetX = 0, targetY = 0;   /* camera destinations (wheel sets these) */
  var panXBase = 0;   /* camera baked into node left at last rebuild —
                         horizontal panning moves transform, not nodes */
  var panRaf = null;
  function refreshPanBounds() {
    /* clamp so AT LEAST ONE NODE stays on screen (bounds are loose, not
       tight): panning right may push the leftmost node up to the right
       edge, panning left may push the rightmost node up to the left edge */
    var lo = Infinity, hi = -Infinity;
    (multiMode ? order.slice() : [activeId]).forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;
      if (Array.isArray(tl.nodes)) tl.nodes.forEach(function (n) {
        var t = absYearOf(n, tl);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      });
    });
    if (!isFinite(lo)) {
      cachedMinX = 0;
      cachedMaxX = 0;
    } else if (nonlinearMode) {
      var nSeq = seqNodeCount();
      cachedMinX = -(PAD_X + Math.max(0, nSeq - 1) * seqPitch);
      cachedMaxX = stage.clientWidth - PAD_X;
    } else {
      cachedMinX = -timeToX(hi);            /* rightmost node ≥ left edge */
      cachedMaxX = stage.clientWidth - timeToX(lo);   /* leftmost ≤ right edge */
    }
    cachedMaxY = Math.max(0, track.scrollHeight - stage.clientHeight);
  }
  function maxPanX() { return cachedMaxX; }
  function maxPanY() { return cachedMaxY; }
  function clampPan() {
    if (panClampLock) {
      /* zoom-drag: keep the track start from passing the LEFT edge (else
         the line visibly breaks mid-screen when zoomed way out), but
         NEVER clamp the right side — clamping against the shrinking
         cachedMaxX mid-drag is what caused the wobble */
      if (panX > 0) panX = 0;
      return;
    }
    if (panX > cachedMaxX) panX = cachedMaxX;
    else if (panX < cachedMinX) panX = cachedMinX;
    if (panY > 0) panY = 0;
    else if (panY < -cachedMaxY) panY = -cachedMaxY;
  }
  var panClampLock = false;   /* set while alt+right zoom-dragging */
  var zoomDepth = 0;          /* 0 = fit-all (middle); extremes decay sensitivity */
  var MIN_DEPTH = -14, MAX_DEPTH = 14;  /* legacy constants — superseded by depthLimits() */

  /* semantic zoom limits: the viewport may show at most 10,000 years
     (zoom out floor) and at least 1 minute (zoom in ceiling). Converted
     to spacing limits relative to the fit baseline, then to depth:
       - spacing floor = viewport / 10000          px/year
       - spacing ceil  = viewport * 525600         px/year (525600 min/yr) */
  function depthLimits() {
    var base = Math.max(0.001, fitSpacing());
    var w = stage ? stage.clientWidth : 1200;
    var loPx = w / 10000;
    var hiPx = w * 525600;
    return {
      lo: Math.log(loPx / base) / Math.LN2,
      hi: Math.log(hiPx / base) / Math.LN2
    };
  }

  function fitSpacing() {
    /* unified canvas: single mode fits the CURRENT world, multi fits all */
    var lo = Infinity, hi = -Infinity;
    (multiMode ? order.slice() : [activeId]).forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;   /* stale order entry — skip, don't crash */
      loopsOf(tl).forEach(function (L) {
        var r = loopRange(tl, L);
        if (r) {
          hi = Math.max(hi, r.hi);
          lo = Math.min(lo, r.lo);
        }
      });
      if (Array.isArray(tl.nodes)) {
        tl.nodes.forEach(function (n) {
          var t = absYearOf(n, tl);
          if (t < lo) lo = t;
          if (t > hi) hi = t;
        });
      }
    });
    if (!isFinite(lo)) return NODE_SPACING;
    var span = hi - lo;
    if (span <= 0) return 120;   /* single-point world: default pitch */
    var usable = stage.clientWidth - 2 * PAD_X;
    if (usable < 80) return 120;   /* stage too small / hidden → default */
    return usable / span;
  }
  function spacingFromDepth(d) {
    return fitSpacing() * Math.pow(2, d);
  }
  /* zoom without rebuilding the DOM: move existing nodes, resize track,
     refresh ruler — the wake animation never replays on zoom */
  /* name is always visible; density handling was removed at user request */
  /* sheet-music layout: plot/character labels fan OUTWARD above the axis,
     world-event labels fan outward below. Start at lane 1 (nearest the
     axis) and step outward until a lane has room for the name; lane ≥ 2
     draws a leader stem. Runs on render and on every zoom. */
  function layoutNames() {
    var els = nodesEl.querySelectorAll('.tl__n');
    var upLanes = [], dnLanes = [];    /* per-lane occupied intervals */
    function overlaps(a, b) { return a[0] < b[1] && b[0] < a[1]; }
    function fits(lanes, lane, iv) {
      var list = lanes[lane] || [];
      for (var j = 0; j < list.length; j++) {
        if (overlaps(list[j], iv)) return false;
      }
      return true;
    }
    function place(lanes, lane, iv) {
      (lanes[lane] = lanes[lane] || []).push(iv);
    }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var n = el._node;
      if (!n) continue;
      var up = n.type === 'plot';              /* plot → above, event → below */
      el.classList.toggle('is-up', up);
      el.classList.toggle('is-dn', !up);
      var x = parseFloat(el.style.left);
      var w = Math.max(40, String(n.title).length * 13 + 8);
      var iv = [x - w / 2, x + w / 2];
      var lanes = up ? upLanes : dnLanes;
      var lane = 1;
      /* cap the fan-out: beyond 8 layers labels just overlap (zoomed-out is
         unreadable anyway) — prevents lanes growing to thousands of px */
      while (lane < 8 && !fits(lanes, lane, iv)) lane++;
      if (!fits(lanes, lane, iv)) lane = 1;   /* all busy: reuse nearest layer */
      place(lanes, lane, iv);
      el.setAttribute('data-lane', lane);
      el.style.setProperty('--lane', lane);
      el._laneDir = up ? lane : -lane;         /* signed: up + / down - */
    }
  }

  /* after lanes are repositioned, refresh each node's hit-detection y */
  function syncNodeY() {    var trackRect = track.getBoundingClientRect();
    Array.prototype.forEach.call(nodesEl.querySelectorAll('.tl__lane'), function (lane) {
      var rect = lane.getBoundingClientRect();
      var top = rect.top - trackRect.top;   /* lane top incl. transform */
      var h = parseFloat(lane.style.height) || 150;
      Array.prototype.forEach.call(lane.querySelectorAll('.tl__n'), function (el) {
        el._y = top + h / 2;   /* axis is at lane visual center */
      });
    });
  }

  /* after labels are fanned out, grow each lane so its labels never cross
     the world divider — height = max(|lane|) × step + headroom, symmetric */
  function fitLaneHeights() {
    var lanesEls = nodesEl.querySelectorAll('.tl__lane');
    var laneMax = {};                          /* data-tl → max |lane| */
    Array.prototype.forEach.call(nodesEl.querySelectorAll('.tl__n'), function (el) {
      var tlId = el.getAttribute('data-tl');
      var m = Math.abs(el._laneDir || 1);
      laneMax[tlId] = Math.max(laneMax[tlId] || 0, m);
    });
    var y = LANE_PAD;
    Array.prototype.forEach.call(lanesEls, function (lane, li) {
      var tlId = lane.getAttribute('data-tl') || (lanesEls[0] && lanesEls[0].getAttribute('data-tl'));
      var maxLane = laneMax[tlId] || 1;
      /* symmetric headroom: label offset (14) + (maxLane-1) steps + label height (16)
         on EACH side of the axis, plus padding */
      var h = Math.max(150, 2 * (14 + (maxLane - 1) * 24 + 16) + 30);
      lane.style.height = h + 'px';
      lane.style.top = y + 'px';
      y += h + 20;                              /* gap between worlds */
    });
    /* track height follows the lanes */
    var H = y + LANE_PAD;
    track.style.height = Math.max(H, stage.clientHeight) + 'px';
    refreshPanBounds();
  }
  /* sequence mode: a loop frame hugs its bound nodes (startNode → endNode) */
  function positionLoopFrameNonlinear(fr) {
    var tid = fr.getAttribute('data-tl');
    var fid = fr.getAttribute('data-loop-id');
    var tl = timelines[tid];
    var L = loopById(tl, fid);
    if (!tl || !L) return;
    var startN = findNodeById(tl, L.startNodeId);
    var endN = findNodeById(tl, L.endNodeId);
    if (!startN || !endN) return;
    var startSeq = null, endSeq = null;
    nodesEl.querySelectorAll('.tl__n[data-tl="' + tid + '"]').forEach(function (nn) {
      if (nn._node === startN) startSeq = nn._seq;
      if (nn._node === endN) endSeq = nn._seq;
    });
    fr.style.display = '';
    if (typeof startSeq === 'number' && typeof endSeq === 'number') {
      var minSeq = Math.min(startSeq, endSeq);
      var maxSeq = Math.max(startSeq, endSeq);
      var half = 5;   /* cap 圆点视觉半宽（14px 含 2px border，内缩一点避免虚线外溢） */
      var c = parseInt(fr.getAttribute('data-loop-idx'), 10) || 0;
      var seqSpan = maxSeq - minSeq + 1;   /* 一个周期的节点跨度 */
      var x0 = PAD_X + (minSeq + c * seqSpan) * seqPitch + panXBase;
      var x1 = PAD_X + (maxSeq + c * seqSpan) * seqPitch + panXBase;
      fr.style.left = (x0 - half) + 'px';
      fr.style.width = (minSeq === maxSeq) ? '0px' : (x1 - x0 + 2 * half) + 'px';
    }
  }

  /* light repositioning for panning only — actually unused for panning now
     (camera moves via transform); kept for rebuilds after zoom/mode changes */
  function layoutNodes() {
    var els = nodesEl.querySelectorAll('.tl__n');
    if (nonlinearMode) {
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el._seq !== undefined && el._seq !== null) {
          el.style.left = (PAD_X + el._seq * seqPitch + panXBase) + 'px';
        }
      }
    } else {
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var tl = timelines[el.getAttribute('data-tl')] || timelines[activeId];
        el.style.left = (timeToX(absYearOf(el._node, tl)) + panXBase) + 'px';
      }
    }
    var frames = nodesEl.querySelectorAll('.tl__loop');
    for (var f = 0; f < frames.length; f++) {
      var fr = frames[f];
      var tl2 = timelines[fr.getAttribute('data-tl')];
      var L = loopById(tl2, fr.getAttribute('data-loop-id'));
      if (!tl2 || !L) continue;
      if (nonlinearMode) {
        positionLoopFrameNonlinear(fr);
      } else {
        var r = loopRange(tl2, L);
        fr.style.display = '';
        if (r) {
          var c = parseInt(fr.getAttribute('data-loop-idx'), 10) || 0;
          var span = r.hi - r.lo;
          var fl = (timeToX(r.lo + c * span) + panXBase);
          var fw = Math.max(timeToX(r.hi + c * span) - timeToX(r.lo + c * span), 0);
          fr.style.left = fl + 'px';
          fr.style.width = fw + 'px';
        }
      }
    }
  }
  function updatePositions() {
    var els = nodesEl.querySelectorAll('.tl__n');
    var lo = Infinity, hi = -Infinity;
    if (nonlinearMode) {
      /* event-sequence view: each lane's nodes sit at FIXED pitch, ordered
         by their absolute time. Time gaps are ignored — like a metro map. */
      var byLane = {};
      for (var i0 = 0; i0 < els.length; i0++) {
        var el0 = els[i0];
        var tl0 = timelines[el0.getAttribute('data-tl')] || timelines[activeId];
        var id0 = el0.getAttribute('data-tl') || activeId;
        var rep0 = el0.classList.contains('is-loop-repeat');
        var t0 = absYearOf(el0._node, tl0);
        if (rep0) t0 += (el0._ghostOffset || 0);   /* 重复段节点排到后续轮回 */
        (byLane[id0] = byLane[id0] || []).push({ el: el0, t: t0, rep: rep0 });
      }
      var laneKeys = Object.keys(byLane);
      var FIXED = seqPitch;   /* current event pitch */
      laneKeys.forEach(function (lid) {
        byLane[lid].sort(function (a, b) {
          /* 先按循环分组（同一循环的节点连续，循环框不重叠），
             anchor 节点（无 _loopId）排最后 */
          var la = (a.el._node && a.el._node._loopId) || '\uffff';
          var lb = (b.el._node && b.el._node._loopId) || '\uffff';
          if (la !== lb) return la < lb ? -1 : 1;
          if (a.rep !== b.rep) return a.rep ? 1 : -1;   /* 第一段在前，重复段按轮回顺序在后 */
          if (a.t !== b.t) return a.t - b.t;
          var ta = String(a.el._node && a.el._node.title), tb = String(b.el._node && b.el._node.title);
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        byLane[lid].forEach(function (item, idx) {
          var x = PAD_X + idx * FIXED + panXBase;
          item.el.style.left = x + 'px';
          item.el._seq = idx;   /* expose for scale/cursor */
          if (idx < lo) lo = idx;
          if (idx > hi) hi = idx;
        });
      });
    } else {
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var isRep = el.classList.contains('is-loop-repeat');
        var tl = timelines[el.getAttribute('data-tl')] || timelines[activeId];
        var n = el._node;
        /* unified absolute coordinates — absYearOf() prefers n.absYear
           (loop clones) and falls back to absOffset + n.year (normal) */
        var t = absYearOf(n, tl);
        if (isRep) t += (el._ghostOffset || 0);   /* 重复段：偏移到后续轮回，随缩放重定位 */
        var sx = timeToX(t) + panXBase;
        el.style.left = sx + 'px';
        el._seq = null;
        if (!isRep) {   /* 重复段不参与内容范围（lo/hi），避免撑大 fit/标尺 */
          if (t < lo) lo = t;
          if (t > hi) hi = t;
        }
      }
    }
    /* loop frames must track the zoom/pan too */
    var frames = nodesEl.querySelectorAll('.tl__loop');
    for (var f = 0; f < frames.length; f++) {
      var fr = frames[f];
      var tl2 = timelines[fr.getAttribute('data-tl')];
      var L = loopById(tl2, fr.getAttribute('data-loop-id'));
      if (!tl2 || !L) continue;
      if (nonlinearMode) {
        positionLoopFrameNonlinear(fr);
      } else {
        var r = loopRange(tl2, L);
        fr.style.display = '';
        if (r) {
          var c = parseInt(fr.getAttribute('data-loop-idx'), 10) || 0;
          var span = r.hi - r.lo;
          var fl = (timeToX(r.lo + c * span) + panXBase);
          var fw = Math.max(timeToX(r.hi + c * span) - timeToX(r.lo + c * span), 0);
          fr.style.left = fl + 'px';
          fr.style.width = fw + 'px';
        }
      }
    }
    /* 剧情范围条也要跟随缩放/平移（非线性视图不画，隐藏） */
    var storyBars = nodesEl.querySelectorAll('.tl__storybar');
    for (var sb = 0; sb < storyBars.length; sb++) {
      var bar = storyBars[sb];
      var tl3 = timelines[bar.getAttribute('data-tl')];
      if (!tl3) continue;
      if (nonlinearMode) { bar.style.display = 'none'; continue; }
      var sr = findStoryRange(tl3, bar.getAttribute('data-story'));
      if (!sr) { bar.style.display = 'none'; continue; }
      var sp = storyRangeSpan(tl3, sr);
      bar.style.display = '';
      if (sp) {
        bar.style.left = (timeToX(sp.lo) + panXBase) + 'px';
        bar.style.width = Math.max(20, timeToX(sp.hi) - timeToX(sp.lo)) + 'px';
      }
    }
    /* camera is baked into node positions — track stays viewport-sized so
       the compositor never has to rasterize a huge layer (a 10^12 px wide
       track silently disappears on Chromium past ~32k px) */
    track.style.width = stage.clientWidth + 'px';
    layoutNames();
    fitLaneHeights(); syncNodeY();
    applyModeView();   /* re-center the current world in single mode */
    syncNodeY();       /* hit-test y must follow the (transform) layout */
    refreshPanBounds();
    syncAxisSpan();   /* axis spans the content range (+ margin), aligned */
    syncVisible();    /* 视口裁剪：视口外的节点/循环框 display:none */
  }

  /* 视口裁剪（虚拟化）：按屏幕位置隐藏视口外的节点与循环框，避免大量离屏
     DOM 元素参与 layout/paint。屏幕位置 = left + (panX - panXBase)。 */
  function syncVisible() {
    var margin = 240;   /* 覆盖节点 label 的 fan-out 宽度 */
    var vp0 = -margin, vp1 = stage.clientWidth + margin;
    var shift = panX - panXBase;
    var els = nodesEl.querySelectorAll('.tl__n');
    /* 左右锚点：放大到日时节点「缩成点」、视口内可能一个节点都没有，
       此时把视口左右两侧最近的节点钉在视口边缘，方便定位 */
    var leftAnchor = null, rightAnchor = null;
    var leftD = Infinity, rightD = Infinity;
    var anyVisible = false;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var sx = parseFloat(el.style.left) + shift;
      var visible = (sx >= vp0 && sx <= vp1);
      el.style.display = visible ? '' : 'none';
      el.classList.remove('is-anchor');
      if (visible) {
        anyVisible = true;
      } else if (sx < vp0) {
        var d = vp0 - sx;
        if (d < leftD) { leftD = d; leftAnchor = el; }
      } else if (sx > vp1) {
        var d = sx - vp1;
        if (d < rightD) { rightD = d; rightAnchor = el; }
      }
    }
    if (!anyVisible) {
      if (leftAnchor) {
        leftAnchor.style.display = '';
        leftAnchor.classList.add('is-anchor');
        leftAnchor.style.left = (panXBase - panX + 6) + 'px';
      }
      if (rightAnchor && rightAnchor !== leftAnchor) {
        rightAnchor.style.display = '';
        rightAnchor.classList.add('is-anchor');
        rightAnchor.style.left = (stage.clientWidth - 32 + panXBase - panX) + 'px';
      }
    }
    var frames = nodesEl.querySelectorAll('.tl__loop');
    for (var f = 0; f < frames.length; f++) {
      var fr = frames[f];
      var fl = parseFloat(fr.style.left) + shift;
      var fw = parseFloat(fr.style.width) || 0;
      fr.style.display = (fl + fw >= vp0 && fl <= vp1) ? '' : 'none';
    }
    /* 轴线跟随视口（线性模式）：放大到日时节点范围宽度会超 Chromium
       渲染上限（~32k px）导致轴线消失，改为只覆盖视口 + margin */
    if (!nonlinearMode) {
      var axes = nodesEl.querySelectorAll('.tl__axis');
      for (var a = 0; a < axes.length; a++) {
        axes[a].style.left = (panXBase - panX - 120) + 'px';
        axes[a].style.width = (stage.clientWidth + 240) + 'px';
      }
    }
  }

  /* stretch each lane's axis to cover the node range, centred on it, and
     at least ~2 viewport widths so panning doesn't immediately show an
     end. Runs after every rebuild (NODE_SPACING / panXBase may change). */
  function syncAxisSpan() {
    var lo = Infinity, hi = -Infinity;
    var focusRange = activeStoryRange();   /* 聚焦模式：标尺也裁剪到剧情范围内 */
    (multiMode ? order.slice() : [activeId]).forEach(function (id) {
      var tl = timelines[id];
      if (!tl) return;
      /* 循环节点范围，axis 需覆盖循环框（聚焦时只看与范围重叠的循环） */
      loopsOf(tl).forEach(function (L) {
        var r = loopRange(tl, L);
        if (r) {
          if (focusRange && id === activeId) {
            var sp = storyRangeSpan(tl, focusRange);
            var ovLo = sp ? Math.max(r.lo, sp.lo) : r.lo;
            var ovHi = sp ? Math.min(r.hi, sp.hi) : r.hi;
            if (ovHi < ovLo) return;   /* 循环在范围外 → 不计入标尺 */
          }
          hi = Math.max(hi, r.hi);
          lo = Math.min(lo, r.lo);
        }
      });
      if (Array.isArray(tl.nodes)) tl.nodes.forEach(function (n) {
        /* 聚焦剧情范围：范围外节点不计入标尺（世界历史裁剪） */
        if (focusRange && id === activeId && !nodeInRange(tl, focusRange, n)) return;
        var t = absYearOf(n, tl);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      });
    });
    if (!isFinite(lo)) return;
    var centre, w;
    if (nonlinearMode) {
      /* sequence layout is index-based (PAD_X + idx×seqPitch) — centre on
         the node span, not the year-scale */
      var nSeq = seqNodeCount();
      centre = PAD_X + (nSeq / 2) * seqPitch + panXBase;
      w = Math.max(nSeq * seqPitch + 2 * PAD_X, stage.clientWidth * 2);
    } else {
      /* 轴线覆盖视口 + margin（跟随视口）：放大到日时节点范围宽度
         （如 1752 年 × 39600 px/年 ≈ 6900 万 px）会超 Chromium 渲染上限
         导致轴线消失，改为只覆盖视口 */
      centre = panXBase - panX + stage.clientWidth / 2;
      w = stage.clientWidth + 2 * PAD_X;
    }
    var axes = nodesEl.querySelectorAll('.tl__axis');
    for (var i = 0; i < axes.length; i++) {
      axes[i].style.left = (centre - w / 2) + 'px';
      axes[i].style.width = w + 'px';
    }
  }
  /* 聚焦剧情线：范围外区域截断遮罩（视口坐标，随 pan 跟随） */
  function updateRangeMask() {
    var mask = document.getElementById('tl-range-mask');
    if (!mask) return;
    var focusRange = activeStoryRange();
    var tl = timelines[activeId];
    var sp = focusRange ? storyRangeSpan(tl, focusRange) : null;
    if (!sp || storyMode !== 'focus' || multiMode) { mask.style.display = 'none'; return; }
    mask.style.display = '';
    var rect = stage.getBoundingClientRect();
    var xLo = timeToX(sp.lo) + panX;   /* 范围起止的视口 x */
    var xHi = timeToX(sp.hi) + panX;
    var sides = mask.children;
    sides[0].style.left = '0px';
    sides[0].style.width = Math.max(0, xLo) + 'px';
    sides[1].style.left = Math.max(0, xHi) + 'px';
    sides[1].style.width = Math.max(0, rect.width - Math.max(0, xHi)) + 'px';
  }

  function applyPan() {
    clampPan();
    /* horizontal camera rides the GPU transform (like panY) — node left
       is baked at panXBase, so panning never relayouts nodes */
    track.style.transform = 'translate(' + (panX - panXBase) + 'px,' + panY + 'px)';
    buildScale();   /* ruler is viewport-fixed — refresh as the view pans */
    /* direct assignments must also reset the glide target, else a running
       rAF would overwrite them with stale destinations */
    targetX = panX; targetY = panY;
    if (panRaf) { cancelAnimationFrame(panRaf); panRaf = null; }
    updateRangeMask();   /* 剧情线聚焦遮罩跟随平移 */
    updateTimeCursorPos();   /* 时间指针跟随平移 */
  }
  /* direct pan assignments (zoom/snap/mode) must also reset the glide target,
     else a running rAF would overwrite them with stale destinations */
  function commitPan() {
    targetX = panX; targetY = panY;
    if (panRaf) { cancelAnimationFrame(panRaf); panRaf = null; }
    updateRangeMask();
  }

  /* camera glide: wheel only moves the target; rAF eases pan toward it */
  function scrollPan(dx, dy) {
    if (!panRaf) targetX = panX;   /* sync base with actual camera */
    targetX += dx; targetY += dy;
    clampTarget();
    startPanRaf();
  }
  /* refresh the cursor time readout after the camera moves (mouse is still) */
  function refreshCursorTime() {
    if (cursorEl.style.display === 'none') return;
    cursorEl.querySelector('.tl__cursor-time').textContent = cursorTimeAt(cursorX);
  }
  /* time readout under the cursor: linear mode reads the ruler; nonlinear
     snaps to the nearest event's year (metro-map behaviour) */
  function cursorTimeAt(mx) {
    if (!nonlinearMode) {
      var t = xToTime(mx - panX);
      if (!multiMode) {
        var cur = timelines[activeId];
        if (cur) t = t - (cur.absOffset || 0);
      }
      return fmtCursorTime(t);
    }
    /* 非线性：按序列位置插值相邻节点的年份，按缩放精度取整（不带小数） */
    var nodes = [];
    nodesEl.querySelectorAll('.tl__n[data-tl="' + activeId + '"]').forEach(function (e) {
      if (e._seq !== undefined && e._seq !== null) {
        var yr = toNumber(e._node.year);
        if (e.classList.contains('is-loop-repeat')) yr += (e._ghostOffset || 0);   /* 重复段用偏移后的年份 */
        nodes.push({ seq: e._seq, year: yr });
      }
    });
    if (!nodes.length) return '—';
    if (nodes.length === 1) return fmtCursorTime(roundToBand(nodes[0].year));
    nodes.sort(function (a, b) { return a.seq - b.seq; });
    var seqFrac = (mx - panX - PAD_X) / (seqPitch || 1);
    var idx = Math.max(0, Math.min(nodes.length - 2, Math.floor(seqFrac)));
    var a = nodes[idx], b = nodes[idx + 1];
    var frac = Math.max(0, Math.min(1, seqFrac - idx));
    return fmtCursorTime(roundToBand(a.year + (b.year - a.year) * frac));
  }
  /* full date readout: 公元 X年X月X日 — the fractional year becomes month/day */
  /* which ruler band is active at the current zoom — shares the ruler's
     targetPx so the cursor readout matches the tick labels exactly */
  function currentScaleBand() {
    var pxPerYear = NODE_SPACING;
    var stepYears = niceStep(targetPx / pxPerYear);
    if (stepYears >= 1) return 'year';
    if (stepYears * 12 >= 1) return 'month';
    if (stepYears * 360 >= 1) return 'day';
    if (stepYears * 8640 >= 1) return 'hour';
    return 'minute';
  }
  function fmtCursorTime(t) {
    var neg = t < 0;
    var ay = Math.abs(t);
    var yr = Math.floor(ay + 1e-9);          /* float-safety */
    var frac = ay - yr;
    if (frac < 1e-9) frac = 0;               /* exactly a year boundary */
    var days = Math.round(frac * 360);       /* 360-day year, rounded */
    if (days >= 360) { days = 0; yr++; }     /* roll over to next year */
    var mo = Math.floor(days / 30) + 1;
    var da = days % 30 + 1;
    var hh = Math.floor((frac * 8640) % 24);
    var mi = Math.round((frac * 518400) % 60);
    if (mi >= 60) { mi = 0; hh++; }          /* rounding roll-over */
    var sign = neg ? '公元前' : '公元';
    var base = sign + yr + '年';
    var band = currentScaleBand();
    if (band === 'year') return base;
    base += mo + '月';
    if (band === 'month') return base;
    base += da + '日';
    if (band === 'day') return base;
    base += hh + '时';
    if (band === 'hour') return base;
    return base + mi + '分';
  }
  var cursorX = 0;   /* last known cursor x in stage coords */
  function clampTarget() {
    if (targetX > cachedMaxX) targetX = cachedMaxX;
    else if (targetX < cachedMinX) targetX = cachedMinX;
    if (targetY > 0) targetY = 0;
    else if (targetY < -cachedMaxY) targetY = -cachedMaxY;
  }
  function startPanRaf() {
    if (panRaf) return;
    var step = function () {
      clampTarget();
      var dx = targetX - panX, dy = targetY - panY;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
        panX = targetX; panY = targetY;
        panRaf = null;
        clampPan();   /* keep panX inside bounds at rest too */
        track.style.transform = 'translate(' + (panX - panXBase) + 'px,' + panY + 'px)';
        buildScale();
        syncVisible();   /* 平移停止：视口裁剪收尾 */
        updateTimeCursorPos();   /* 时间指针跟随 glide */
        updateRangeMask();       /* 聚焦遮罩跟随 glide */
        return;
      }
      var k = SETTINGS ? SETTINGS.glide : 0.15;   /* glide factor per frame — gentle camera ease */
      panX += dx * k;
      panY += dy * k;
      clampPan();   /* glide must never push the camera past the bounds */
      track.style.transform = 'translate(' + (panX - panXBase) + 'px,' + panY + 'px)';
      buildScale();   /* ruler glides with the camera */
      syncVisible();   /* 平移中：视口裁剪跟随 */
      refreshCursorTime();   /* cursor readout follows the pan */
      updateTimeCursorPos();   /* 时间指针跟随 glide（每帧） */
      updateRangeMask();       /* 聚焦遮罩跟随 glide（每帧） */
      panRaf = requestAnimationFrame(step);
    };
    panRaf = requestAnimationFrame(step);
  }

  /* wheel: plain = vertical scroll; Shift = horizontal pan; Alt = depth-zoom */
  stage.addEventListener('wheel', function (e) {
    if (e.target.closest && e.target.closest('.tl__detail')) return;   /* 面板内滚轮：滚动面板，不动画布 */
    e.preventDefault();
    if (e.altKey) {
      var rect = stage.getBoundingClientRect();
      var cx = e.clientX - rect.left;              /* cursor x in stage */
      /* anchor: nonlinear layout is index-based, so pin the fractional
         sequence position under the cursor (like the drag zoom); linear
         pins the year */
      var seqFrac = nonlinearMode ? (cx - panX - PAD_X) / (seqPitch || 1) : null;
      var tBefore = xToTime(cx - panX);            /* time under cursor */
      /* depth change: sensitivity decays toward the extremes (AE-like) */
      var k = (0.0016 / (1 + Math.abs(zoomDepth) * 0.14)) * (SETTINGS ? SETTINGS.sens : 1);
      var lim = depthLimits();
      var d = Math.min(lim.hi, Math.max(lim.lo, zoomDepth - e.deltaY * k));
      if (d === zoomDepth) return;
      zoomDepth = d;
      if (nonlinearMode) {
        /* event-sequence zoom: change the FIXED pitch instead of spacing */
        seqPitch = Math.min(300, Math.max(32, 96 * Math.pow(2, zoomDepth / 2)));
      } else {
        NODE_SPACING = spacingFromDepth(zoomDepth);
      }
      /* AE-style: keep the anchor under the cursor pinned (no DOM rebuild,
         no wake re-animation); disable transition so zoom never "springs" */
      track.classList.add('is-panning');
      var lanes = laneEls();
      for (var li = 0; li < lanes.length; li++) lanes[li].style.transition = 'none';
      panX = nonlinearMode
        ? cx - (PAD_X + seqFrac * seqPitch)
        : cx - timeToX(tBefore);
      panXBase = panX;   /* bake the new camera into node left */
      updatePositions();   /* camera is baked into node left — panX first */
      applyPan();
      buildScale();
      for (var lj = 0; lj < lanes.length; lj++) lanes[lj].style.transition = '';
      track.classList.remove('is-panning');
    } else if (e.shiftKey || stage.classList.contains('tl-y-locked')) {
      /* Shift+滚轮，或单列（y 锁定）模式：滚轮直接左右横移时间轴 */
      scrollPan(-(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY), 0);
    } else {
      scrollPan(0, -e.deltaY);   /* 多列模式：滚轮上下 */
    }
  }, { passive: false });

  /* start at fit-all: depth 0 = whole timeline across the stage width.
     Layout may not be ready at script time (clientWidth still 0 → nodes
     pile on the left); wait for real layout via load + a retrying rAF. */
  var stageReady = false;   /* set once the first render is done */
  function initialFit() {
    if (!stage.clientWidth) { requestAnimationFrame(initialFit); return; }
    /* first open of the timeline: select the first world and run a full
       overview so the user lands on a useful view, not a blank corner */
    if (order.length && timelines[order[0]]) {
      activeId = order[0];
      refreshWorldsetBtn();
    }
    NODE_SPACING = fitSpacing();
    renderTimeline(true);   /* first open → play wake */
    applyModeView();
    syncNodeY();
    stageReady = true;
    fitAllView();
  }
  /* file data arrived AFTER the first render → re-render with real data */
  function applyLoadedData() {
    NODE_SPACING = fitSpacing();
    renderTimeline(false);
    applyModeView();
    syncNodeY();
    applyPan();
    /* data arrived from file — reset undo history to this baseline */
    lastSaved = JSON.stringify({ timelines: timelines, order: order });
    undoStack.length = 0;
    undoRedoStack.length = 0;
    if (typeof renderEditor === 'function') renderEditor();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialFit);
  } else {
    requestAnimationFrame(initialFit);
  }
  window.addEventListener('load', initialFit);

  /* multi-timeline toggle: show every world's timeline stacked & aligned */
  var multiBtn = document.getElementById('tl-multi');
  var tabsBox = document.getElementById('tl-tabs');
  var tabAddBtn = document.getElementById('tl-tab-add');
  var maskEl = document.getElementById('tl-multi-mask');
  multiBtn.addEventListener('click', function () {
    if (animLock) return;     /* ignore rapid clicks mid-animation */
    multiMode = !multiMode;
    if (multiMode && nonlinearMode) {
      /* mutually exclusive: parallel view aligns world times, so the
         sequence view (equal node spacing) must switch off */
      nonlinearMode = false;
      syncNonlinearUI();
    }
    multiBtn.classList.toggle('is-on', multiMode);
    stage.classList.toggle('is-multi', multiMode);
    panY = 0;
    if (multiMode) {
      animateTabsIn();
    } else {
      animLock = true;
      animateTabsOut(true);
    }
    /* fit without rebuilding — lanes keep their DOM and CSS transition,
       so switching parallel/single stays animated (AE-like slide) */
    fitAllView(true);
    if (multiMode) {
      /* align the view with the CURRENT world's lane, not world #1 */
      var curLane = laneEls()[laneIndex()];
      if (curLane) {
        var ct = parseFloat(curLane.style.top) || 0;
        panY = Math.max(-(ct), -cachedMaxY);
        applyPan();
      }
    }
    if (!multiMode) {
      setTimeout(function () {
        tabsBox.classList.add('is-ready');
        animLock = false;
      }, LANE_SLIDE_MS + 80);
    }
  });/* ═══ unified canvas mode view ══════════════════════════════
     All lanes always exist in the canvas. Mode switches only re-arrange
     them (transform + opacity), so nothing is rebuilt and the transition
     is a smooth camera move — with depth-of-field blur on distant lanes. */
  var LANE_SLIDE_MS = 480;
  function laneEls() {
    return Array.prototype.slice.call(nodesEl.querySelectorAll('.tl__lane'));
  }
  function laneIndex() {
    var els = laneEls();
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute('data-tl') === activeId) return i;
    }
    return 0;
  }
  function applyModeView() {
    var els = laneEls();
    var cur = laneIndex();
    var vh = stage.clientHeight;
    if (multiMode) {
      /* multi: every lane expanded in order, y unlocked */
      stage.classList.remove('tl-y-locked');
      for (var i = 0; i < els.length; i++) {
        els[i].style.opacity = '1';
        els[i].style.filter = 'none';
        els[i].style.pointerEvents = '';
        els[i].style.transform = '';
      }
    } else {
      /* single: current world centered, others pushed far + blurred (depth) */
      stage.classList.add('tl-y-locked');
      var curEl = els[cur];
      var curTop = curEl ? parseFloat(curEl.style.top) || 0 : 0;
      var curH = curEl ? (parseFloat(curEl.style.height) || 150) : 150;
      var targetY = Math.max(0, (stage.clientHeight - curH) / 2);
      panY = 0;   /* lock y: single mode never scrolls vertically */
      for (var j = 0; j < els.length; j++) {
        if (j === cur) {
          els[j].style.opacity = '1';
          els[j].style.filter = 'none';
          els[j].style.pointerEvents = '';
          els[j].style.transform = 'translateY(' + (targetY - curTop) + 'px)';
        } else {
          /* push above/below off-screen + depth blur */
          els[j].style.opacity = '0';
          els[j].style.filter = 'blur(6px)';
          els[j].style.pointerEvents = 'none';
          els[j].style.transform = 'translateY(' + (j < cur ? -vh * 2 : vh * 2) + 'px)';
        }
      }
    }
  }

  /* ═══ multi-tab animation orchestration (AE reference) ═══════
     Each tab computes its own dash distance/shrink/stagger so N tabs
     adapt automatically — no baked single-tab values. */
  var TAB_STAGGER = 45;      /* ms between tabs */
  var TAB_DASH_MS = 460;     /* total dash duration */
  var TAB_SWING_MS = 440;
  var animLock = false;      /* ignore clicks while an animation is running */
  var animTimer = null;      /* pending cleanup timer */

  function cancelAnim() {
    if (animTimer) { clearTimeout(animTimer); animTimer = null; }
    tabsBox.style.display = '';
    tabsBox.classList.remove('is-dashing', 'is-swinging', 'is-ready');
    maskEl.classList.remove('is-on');
    Array.prototype.forEach.call(tabsBox.querySelectorAll('.tl__tab'), function (t) {
      t.classList.remove('is-dashing', 'is-swinging');
      var nm = t.querySelector('.tl__tab-name'), ct = t.querySelector('.count');
      if (nm) nm.style.opacity = '';
      if (ct) ct.style.opacity = '';
    });
    multiBtn.classList.remove('is-caught');
    tabAddBtn.classList.remove('is-hiding');
    tabAddBtn.style.display = '';
    animLock = false;
  }

  function tabGeom(tab) {
    var tr = tab.getBoundingClientRect();
    var br = multiBtn.getBoundingClientRect();
    /* center-align onto the button — robust even if label width differs */
    var dx = (tr.left + tr.width / 2) - (br.left + br.width / 2);
    var tw = Math.max(30, br.width * 0.95);     /* target width ≈ button */
    return { dx: dx, tw: tw, w0: tr.width };
  }
  function animateTabsIn() {
    cancelAnim();   /* flush any stale state */
    animLock = true;
    showMask();
    var tabs = Array.prototype.slice.call(tabsBox.querySelectorAll('.tl__tab'));
    tabsBox.style.display = '';
    tabs.forEach(function (tab, i) {
      var g = tabGeom(tab);
      tab.style.setProperty('--tx', (-g.dx) + 'px');
      tab.style.setProperty('--tw', g.tw + 'px');
      tab.style.setProperty('--tw0', g.w0 + 'px');
      tab.style.setProperty('--delay', (i * TAB_STAGGER) + 'ms');
      tab.classList.add('is-dashing');
    });
    /* the button springs when the first tab lands */
    multiBtn.classList.remove('is-caught');
    void multiBtn.offsetWidth;
    multiBtn.classList.add('is-caught');
    tabAddBtn.classList.add('is-hiding');
    var total = TAB_DASH_MS + tabs.length * TAB_STAGGER + 40;
    animTimer = setTimeout(function () {
      tabsBox.style.display = 'none';
      tabs.forEach(function (t) { t.classList.remove('is-dashing'); });
      maskEl.classList.remove('is-on');
      animLock = false;
      animTimer = null;
    }, total);
  }
  /* show the dash mask: covers panel-left → button center so overshooting
     tabs are hidden during BOTH enter and exit animations */
  /* mask hides tabs during flight. The tabs fly between home (right) and
     the button. Cover panel-left → button centre: hides the left side
     where the swing-back STARTS (so no "appear on the left"), while the
     swing-back to the right stays visible as the animation. */
  function showMask(full) {
    var mgr = managerEl.parentElement || managerEl;
    var br = multiBtn.getBoundingClientRect();
    var mr = mgr.getBoundingClientRect();
    if (full) {
      /* legacy full-cover (unused now — kept for the enter side) */
      maskEl.style.left = '0px';
      maskEl.style.width = (mr.right - mr.left) + 'px';
    } else {
      maskEl.style.left = '0px';
      maskEl.style.width = Math.max(0, (br.left + br.width / 2) - mr.left) + 'px';
    }
    maskEl.classList.add('is-on');
  }
  function animateTabsOut(keepLock) {
    cancelAnim();
    animLock = true;
    showMask();   /* left side only — swing-back to the right stays visible */
    var tabs = Array.prototype.slice.call(tabsBox.querySelectorAll('.tl__tab'));
    tabsBox.style.display = '';
    tabs.forEach(function (tab, i) {
      /* recompute the swing: start centred on the button (same offset as
         the dash, negative) then ease back to home (0). Use the tab's own
         width (--tw0), NOT the shrunk button width — so its left edge can't
         poke out left of the button during the swing-back. */
      var g = tabGeom(tab);
      tab.style.setProperty('--tx', (-g.dx) + 'px');
      tab.style.setProperty('--tw', g.w0 + 'px');
      tab.style.setProperty('--tw0', g.w0 + 'px');
      tab.style.setProperty('--delay', (i * TAB_STAGGER) + 'ms');
      tab.classList.add('is-swinging');
      /* text fades back in with the swing */
      var name = tab.querySelector('.tl__tab-name');
      var cnt = tab.querySelector('.count');
      if (name) name.style.opacity = '';
      if (cnt) cnt.style.opacity = '';
    });
    tabAddBtn.classList.remove('is-hiding');
    tabAddBtn.style.display = '';
    var total = TAB_SWING_MS + tabs.length * TAB_STAGGER + 60;
    animTimer = setTimeout(function () {
      tabs.forEach(function (t) { t.classList.remove('is-swinging'); });
      tabsBox.classList.add('is-ready');
      maskEl.classList.remove('is-on');
      if (managerEl) managerEl.scrollLeft = 0;   /* home position */
      if (!keepLock) animLock = false;
      animTimer = null;
    }, total);
  }

  /* drag to pan (left button) */
  var dragStartX = 0, dragStartPan = 0, dragging = false, moved = false, lastDragX = 0;

  /* alt+right-drag quick zoom (AE-style): drag up = zoom in, down = out,
     pinned to the time under the press point. */
  var zoomDrag = null;   /* { startY, startDepth, anchorT, cx } or null */
  stage.addEventListener('pointerdown', function (e) {
    if (e.altKey && e.button === 2) {
      /* right-button + Alt → quick zoom drag, Blender-style: lock the
         pointer so the drag never stops at the window edge (movement
         keeps accumulating while locked) */
      var rect = stage.getBoundingClientRect();
      zoomDrag = {
        startY: e.clientY,
        startDepth: zoomDepth,
        startSpacing: NODE_SPACING,
        startPitch: seqPitch,
        anchorT: xToTime((e.clientX - rect.left) - panX),
        cx: e.clientX - rect.left,
        accumY: 0,             /* accumulated movementY while locked */
        locked: false,
        /* nonlinear layout is index-based (x = PAD_X + idx*pitch), so the
           anchor must be the fractional sequence position under the cursor,
           not a year — timeToX() there would use the wrong spacing */
        anchorSeqFrac: ((e.clientX - rect.left) - panX - PAD_X) / (seqPitch || 1)
      };
      try {
        if (!document.pointerLockElement) {
          stage.requestPointerLock();
          zoomDrag.locked = true;
        }
      } catch (err) { /* pointer lock may be unavailable — fall back to normal drag */ }
      panClampLock = true;   /* zoom-drag owns the viewport — no clamping */
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    /* clicks on the info panel's inputs are for editing, not panning */
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    /* 刷子模式：拖拽框选时间区间（不平移） */
    if (brushMode && !e.altKey) {
      var rect0 = stage.getBoundingClientRect();
      var vx0 = e.clientX - rect0.left;
      brushDrag = { startVx: vx0, startT: brushYearFromVx(vx0) };
      brushSel = document.createElement('div');
      brushSel.className = 'tl__brush-sel';
      brushSel.style.left = vx0 + 'px';
      brushSel.style.width = '0px';
      stage.appendChild(brushSel);
      e.preventDefault();
      return;
    }
    /* 默认工具 = 时间指针：点击/拖动空白设置当前时间；空格+拖拽 = 平移画布 */
    if (!spaceDown && !e.target.closest('.tl__n, .tl__loop, .tl__storybar, .tl__time-cursor-handle')) {
      cursorScrub = { startX: e.clientX };
      var rect0b = stage.getBoundingClientRect();
      var mx0 = e.clientX - rect0b.left;
      timeCursor = xToTime(mx0 - panX);
      /* 兜底：强制刷新指针视觉（即使 updateTimeCursorPos 被某处吞掉） */
      if (timeCursorEl) {
        timeCursorEl.style.display = '';
        timeCursorEl.style.transform = 'translateX(' + (timeToX(timeCursor) + panX) + 'px)';
        var tcTimeEl = timeCursorEl.querySelector('.tl__time-cursor-time');
        if (tcTimeEl) tcTimeEl.textContent = fmtScale(Math.round(timeCursor * 100) / 100);
      }
      updateTimeCursorPos();
      applyTimeCursorState();
      e.preventDefault();
      return;
    }
    dragging = true; moved = false;
    dragStartX = e.clientX;
    lastDragX = e.clientX;
    dragStartPan = panX;
    track.classList.add('is-panning');
  });
  window.addEventListener('pointermove', function (e) {
    /* 刷子拖拽：实时更新选区高亮 */
    if (brushDrag) {
      var rect1 = stage.getBoundingClientRect();
      var vx = e.clientX - rect1.left;
      brushDrag.curT = brushYearFromVx(vx);
      if (brushSel) {
        var l = Math.min(brushDrag.startVx, vx);
        brushSel.style.left = l + 'px';
        brushSel.style.width = Math.abs(vx - brushDrag.startVx) + 'px';
      }
      return;
    }
    /* 时间指针拖动：实时更新当前时间 */
    if (cursorScrub) {
      var rect2 = stage.getBoundingClientRect();
      var mx2 = e.clientX - rect2.left;
      timeCursor = xToTime(mx2 - panX);
      updateTimeCursorPos();
      applyTimeCursorState();
      return;
    }
    /* zoom drag only while the RIGHT button is physically held — a stale
       zoomDrag (lost pointerup) must not zoom on plain mouse movement */
    if (zoomDrag && (e.buttons & 2)) {
      /* linear drag on the spacing itself: 1px ≈ +0.9% spacing, so the
         response is immediate and even near the fit-all middle. Up = in.
         Clamped to the same depth range as the wheel zoom so the spacing
         can never hit 0 or go negative (which would flip the timeline). */
      zoomDrag.accumY += (e.movementY || 0);
      var dy = zoomDrag.accumY;
      /* depth-space drag with edge damping: sensitive in the middle,
         progressively harder to pull near the MIN/MAX limits (Blender-like).
         atan compression never reaches the hard bounds — asymptotic. */
      var DAMP = 2.5;
      var lim = depthLimits();
      var range = lim.hi - lim.lo;
      var mid = (lim.lo + lim.hi) / 2;
      var aAtan = Math.atan(DAMP);
      var halfR = range / 2;
      if (nonlinearMode) {
        var pLo = 32, pHi = 300, pMid = (pLo + pHi) / 2;
        /* linear pitch delta in pitch-space, with a quadratic slowdown
           across the last EDGE pitch units before each bound */
        var np = zoomDrag.startPitch - dy * 0.06 * (SETTINGS ? SETTINGS.sens : 1);
        var pEdge = 24;
        if (np < pLo + pEdge) {
          var pf = Math.max(0, Math.min(1, (np - pLo) / pEdge));
          np = pLo + pEdge * pf * pf;
        } else if (np > pHi - pEdge) {
          var pf2 = Math.max(0, Math.min(1, (pHi - np) / pEdge));
          np = pHi - pEdge * pf2 * pf2;
        }
        np = Math.round(Math.min(pHi, Math.max(pLo, np)));
        if (np === seqPitch) return;
        seqPitch = np;
      } else {
        var base0 = fitSpacing();
        /* LINEAR delta in depth-space (so full travel is ~660px), plus a
           quadratic ease across the last EDGE depth units before each
           bound — the drag slows down approaching the limit (Blender-like) */
        var nd = zoomDrag.startDepth - dy * 0.013 * (SETTINGS ? SETTINGS.sens : 1);
        var edge = 5.0;
        if (nd < lim.lo + edge) {
          var f = Math.max(0, Math.min(1, (nd - lim.lo) / edge));
          nd = lim.lo + edge * f * f;      /* velocity → 0 at the bound */
        } else if (nd > lim.hi - edge) {
          var f2 = Math.max(0, Math.min(1, (lim.hi - nd) / edge));
          nd = lim.hi - edge * f2 * f2;
        }
        var sp = base0 * Math.pow(2, nd);
        if (sp === NODE_SPACING) return;
        NODE_SPACING = sp;
        zoomDepth = nd;
      }
      {
        /* keep the anchor pinned under the press point */
        track.classList.add('is-panning');
        var lanes = laneEls();
        for (var li = 0; li < lanes.length; li++) lanes[li].style.transition = 'none';
        panX = nonlinearMode
          ? zoomDrag.cx - (PAD_X + zoomDrag.anchorSeqFrac * seqPitch)
          : zoomDrag.cx - timeToX(zoomDrag.anchorT);
        panXBase = panX;   /* bake the new camera into node left */
        updatePositions();   /* camera is baked into node left — panX first */
        applyPan();
        buildScale();
        for (var lj = 0; lj < lanes.length; lj++) lanes[lj].style.transition = '';
        track.classList.remove('is-panning');
      }
      e.preventDefault();
      return;
    }
    if (!dragging) return;
    var dx = e.clientX - lastDragX;   /* per-frame delta (not cumulative) */
    if (Math.abs(e.clientX - dragStartX) > 3) moved = true;
    if (moved && dx !== 0) {
      lastDragX = e.clientX;
      panX += dx;          /* incremental — reversing past a clamp is instant */
      layoutNodes();       /* camera is baked into node left */
      applyPan();
    }
  });
  /* release: clear every drag state (a lost pointerup used to lock pan
     AND leave zoomDrag alive → phantom zooming) */
  function endDrag() {
    zoomDrag = null;
    dragging = false;
    panClampLock = false;   /* re-enable viewport clamping */
    track.classList.remove('is-panning');
    if (document.pointerLockElement) document.exitPointerLock();
    if (typeof finishBrush === 'function') finishBrush();   /* 刷子松手：框选 → 剧情范围 */
    if (cursorScrub) { cursorScrub = null; if (typeof saveTimeCursor === 'function') saveTimeCursor(); }
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', endDrag);
  /* Esc exits pointer lock without a pointerup — must clear zoomDrag */
  document.addEventListener('pointerlockchange', function () {
    if (!document.pointerLockElement) {
      zoomDrag = null;
      panClampLock = false;
    }
  });
  /* keep the browser menu out of the zoom drag; plain right-click opens
     the custom quick menu — shift+right-click keeps the browser menu */
  var ctxEl = document.getElementById('tl-ctx');
  var ctxX = 0, ctxY = 0;   /* last right-click viewport pos */
  var ctxNodeEl = null;     /* node under the right-click, if any */
  var ctxLoopEl = null;     /* loop frame under the right-click, if any */
  var ctxTlId = null;       /* timeline under the right-click (clear targets) */
  function closeCtx() {
    ctxEl.style.display = 'none';
    ctxNodeEl = null;   /* stale node ref must not leak to next menu */
    ctxLoopEl = null;
    /* ctxTlId is NOT cleared here — the clear/delete menu action reads it
       AFTER closeCtx runs; it gets overwritten on the next contextmenu */
  }
  /* fill the 切换世界观 submenu with the worldset list + create box */
  function fillWorldsetSub() {
    var list = document.getElementById('ctx-worldset-list');
    list.innerHTML = '';
    Object.keys(worldsets).forEach(function (name) {
      var b = document.createElement('button');
      b.textContent = name + (name === activeWorldset ? '（当前）' : '');
      b.classList.toggle('is-active', name === activeWorldset);
      b.addEventListener('click', function () {
        closeCtx();
        if (name !== activeWorldset) switchWorldset(name);
      });
      list.appendChild(b);
    });
  }
  /* worldset create — event delegation (menu is rebuilt each open) */
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'ctx-worldset-create') {
      var name = document.getElementById('ctx-worldset-name').value.trim();
      if (!name) return;
      closeCtx();
      createWorldset(name);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'ctx-worldset-name') {
      var create = document.getElementById('ctx-worldset-create');
      if (create) create.click();
    }
  });
  /* ── context-menu config: edit this array to add/reorder/remove items
     without touching code. sub → renders a hover submenu (worldset);
     contextOnly 'node' hides the item unless a node was right-clicked. */
  var CTX_ITEMS = [
    { id: 'add',       label: '添加节点' },
    { id: 'loop',      label: '创建循环' },
    { id: 'storyline', label: '创建剧情线' },
    { id: 'nonlinear', label: '非线性模式', syncId: 'ctx-nonlinear' },
    { id: 'multi',     label: '并列 / 单列' },
    { id: 'worldset',  label: '切换世界观', sub: true },
    { id: 'newline',   label: '新建时间线' },
    { id: 'clear',     label: '清空本时间线', danger: true },
    { id: 'del-node',  label: '删除节点', danger: true, contextOnly: 'node' },
    { id: 'del-loop',  label: '删除此循环', danger: true, contextOnly: 'loop' }
  ];
  function renderCtxMenu() {
    ctxEl.innerHTML = '';
    var nodeCtx = !!ctxNodeEl;
    var loopCtx = !!ctxLoopEl;
    CTX_ITEMS.forEach(function (item) {
      if (item.contextOnly === 'node' && !nodeCtx) return;
      if (item.contextOnly === 'loop' && !loopCtx) return;
      if (item.sub) {
        var wrap = document.createElement('div');
        wrap.className = 'tl__ctx-sub';
        wrap.id = 'ctx-worldset-wrap';
        var btn = document.createElement('button');
        btn.setAttribute('data-ctx', item.id);
        btn.textContent = item.label;
        var submenu = document.createElement('div');
        submenu.className = 'tl__ctx-submenu';
        submenu.id = 'ctx-worldset-sub';
        var list = document.createElement('div');
        list.className = 'tl__ctx-sub-list';
        list.id = 'ctx-worldset-list';
        var newRow = document.createElement('div');
        newRow.className = 'tl__ctx-sub-new';
        var input = document.createElement('input');
        input.type = 'text';
        input.id = 'ctx-worldset-name';
        input.placeholder = '新世界观名称';
        var createBtn = document.createElement('button');
        createBtn.id = 'ctx-worldset-create';
        createBtn.textContent = '创建';
        newRow.appendChild(input);
        newRow.appendChild(createBtn);
        submenu.appendChild(list);
        submenu.appendChild(newRow);
        wrap.appendChild(btn);
        wrap.appendChild(submenu);
        ctxEl.appendChild(wrap);
      } else {
        var b = document.createElement('button');
        b.setAttribute('data-ctx', item.id);
        b.textContent = item.label;
        if (item.danger) b.className = 'is-danger';
        if (item.syncId) b.id = item.syncId;
        ctxEl.appendChild(b);
      }
    });
    syncNonlinearUI();   /* restore the is-on state on the rebuilt toggle */
  }

  function openCtx(x, y) {
    /* fixed positioning: x/y are viewport coords already, clamp to the
       window so the menu never spills out */
    var mw = ctxEl.offsetWidth || 170, mh = ctxEl.offsetHeight || 180;
    ctxEl.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
    ctxEl.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px';
    ctxEl.style.display = '';   /* CSS animation plays on display toggle */
    /* submenu flip: if it would spill past the window's right edge, show
       it on the LEFT side of the parent item instead */
    var subs = ctxEl.querySelectorAll('.tl__ctx-sub');
    for (var i = 0; i < subs.length; i++) {
      var sm = subs[i].querySelector('.tl__ctx-submenu');
      if (!sm) continue;
      var smw = sm.offsetWidth || 220;
      var menuRight = Math.min(x, window.innerWidth - mw - 4) + mw;
      subs[i].classList.toggle('is-flip', menuRight + smw + 10 > window.innerWidth);
    }
  }
  stage.addEventListener('contextmenu', function (e) {
    if (e.shiftKey) return;                 /* native browser menu */
    if (e.altKey) { e.preventDefault(); return; }  /* alt+right = zoom drag, no menu (keep the browser menu out too) */
    e.preventDefault();
    ctxX = e.clientX; ctxY = e.clientY;     /* remember for add-node hint */
    /* resolve the right-clicked node BEFORE rendering so contextOnly items
       (删除节点) show/hide for THIS click — the old order used a stale
       ctxNodeEl, left del-node unrendered, and the null delBtn then
       crashed the whole menu */
    ctxNodeEl = nearestNodeAt(e.clientX, e.clientY);
    /* 右键在循环框上：记录 loop 元素（用于"删除此循环"菜单项） */
    ctxLoopEl = (function () {
      var all = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      for (var li3 = 0; li3 < all.length; li3++) {
        if (all[li3].classList && all[li3].classList.contains('tl__loop')) return all[li3];
      }
      return null;
    })();
    ctxTlId = ctxNodeEl
      ? ctxNodeEl.getAttribute('data-tl')
      : (function () {
          /* elementsFromPoint returns EVERY element at that point (top→bottom);
             walk it for the first lane/axis carrying data-tl. This is robust
             against children without data-tl and off-screen y. */
          var all = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
          for (var ai = 0; ai < all.length; ai++) {
            var lid2 = all[ai].getAttribute && all[ai].getAttribute('data-tl');
            if (lid2 && timelines[lid2]) return lid2;
          }
          /* final fallback: Y maps onto a lane (single lane per world) */
          var lls = laneEls();
          for (var li2 = 0; li2 < lls.length; li2++) {
            var lr2 = lls[li2].getBoundingClientRect();
            if (e.clientY >= lr2.top && e.clientY <= lr2.bottom) {
              return lls[li2].getAttribute('data-tl') || activeId;
            }
          }
          return activeId;
        })();
    renderCtxMenu();
    fillWorldsetSub();
    var delBtn = ctxEl.querySelector('[data-ctx="del-node"]');
    var clearBtn = ctxEl.querySelector('[data-ctx="clear"]');
    var newlineBtn = ctxEl.querySelector('[data-ctx="newline"]');
    var hasNode = !!ctxNodeEl;
    if (delBtn) delBtn.style.display = hasNode ? '' : 'none';
    clearBtn.style.display = hasNode ? 'none' : '';
    newlineBtn.style.display = hasNode ? 'none' : '';
    openCtx(e.clientX, e.clientY);
  });
  /* 删除循环框对应的循环（右键菜单"删除此循环"） */
  function deleteLoopByFrame(frame) {
    var tid = frame.getAttribute('data-tl');
    var lid = frame.getAttribute('data-loop-id');
    var tl = timelines[tid];
    var L = loopById(tl, lid);
    if (tl && L) {
      var idx = tl.loops.indexOf(L);
      if (idx >= 0) tl.loops.splice(idx, 1);
      saveTimelines();
      closeDetail();
      renderTimeline(false);
      updatePositions();
      applyModeView();
      applyPan();
    }
  }
  ctxEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    /* capture context BEFORE closeCtx clears the refs */
    var actNode = ctxNodeEl;
    var actLoop = ctxLoopEl;
    var actTl = ctxTlId;
    closeCtx();
    switch (btn.getAttribute('data-ctx')) {
      case 'add': {
        /* pre-fill the node time from the right-click position */
        var rect = stage.getBoundingClientRect();
        var mx = ctxX - rect.left;
        var t = nonlinearMode
          ? (function () {
              /* nearest event time in nonlinear view */
              var best = null, bestD = Infinity;
              var els = nodesEl.querySelectorAll('.tl__n');
              for (var i = 0; i < els.length; i++) {
                var e = els[i];
                if (multiMode && e.getAttribute('data-tl') !== activeId) continue;
                var x = nodeRealX(e);
                var d = Math.abs(x - mx);
                if (d < bestD) { bestD = d; best = e._node; }
              }
              if (!best) return NaN;
              var by = toNumber(best.year);
              var cur = timelines[activeId];
              return cur ? by - (cur.absOffset || 0) : by;
            })()
          : xToTime(mx - panX) - (timelines[activeId].absOffset || 0);
        openForm(isFinite(t) ? t : undefined);
        break;
      }
      case 'loop':    createLoop(); break;
      case 'del-node':
        if (actNode) deleteNode(actNode._node, actNode);
        break;
      case 'storyline':
        /* 右键创建剧情线 → 进入画线模式 */
        if (brushBtn) { brushBtn.click(); }
        break;
      case 'del-loop':
        if (actLoop) deleteLoopByFrame(actLoop);
        break;
      case 'nonlinear': toggleNonlinear(); break;
      case 'multi':   multiBtn.click(); break;
      case 'worldset': return;   /* submenu handles it — don't close/switch */
      case 'newline': document.getElementById('tl-tab-add').click(); break;
      case 'clear':   clearTimeline(actTl); break;
    }
  });
  /* close the menu on any other interaction */
  document.addEventListener('pointerdown', function (e) {
    if (!ctxEl.contains(e.target)) closeCtx();
  });
  window.addEventListener('blur', closeCtx);

  /* 子菜单开合改由 CSS :hover 驱动（.tl__ctx-submenu 的 clip-path + opacity
     transition），不再需要 JS 的 mousemove/mouseout 补丁。 */

  /* nearest-node hover: highlight the cap closest to the pointer.
     Hit radius ~ the node-to-name distance, so a near miss still counts. */
  var HIT_RADIUS = 34;   /* px around the cap that selects the node */
  var hoverEl = null;
  function nearestNodeAt(cx, cy) {
    /* clicking/hovering a node's label OR dot should hit that node */
    var under = document.elementFromPoint(cx, cy);
    if (under) {
      var host = under.classList
        ? under.closest('.tl__n')
        : null;
      if (host && host._node) return host;
    }
    var rect = stage.getBoundingClientRect();
    var sx = cx - rect.left - panX + panXBase;   /* pointer x in track coords (left bakes panXBase) */
    var sy = cy - rect.top - panY;       /* pointer y in track coordinates */
    var best = null, bestD = Infinity;
    var els = nodesEl.querySelectorAll('.tl__n');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.style.display === 'none') continue;   /* 视口裁剪掉的节点不参与命中 */
      /* skip nodes in hidden (pushed-away) lanes — single mode */
      var lane = el.closest('.tl__lane');
      if (lane && lane.style.pointerEvents === 'none') continue;
      var dx = sx - parseFloat(el.style.left);
      var dy = sy - (el._y || 0);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = el; }
    }
    return bestD <= HIT_RADIUS ? best : null;
  }
  stage.addEventListener('pointermove', function (e) {
    if (dragging && moved) {
      /* 拖动时十字线仍跟随鼠标（时间读数随 pan 更新） */
      var drect = stage.getBoundingClientRect();
      var dmx = e.clientX - drect.left;
      if (dmx >= 0 && dmx <= stage.clientWidth) {
        cursorX = dmx;
        cursorEl.style.display = '';
        cursorEl.style.left = dmx + 'px';
        cursorEl.querySelector('.tl__cursor-time').textContent = cursorTimeAt(dmx);
      }
      return;
    }
    var near = nearestNodeAt(e.clientX, e.clientY);
    if (near !== hoverEl) {
      if (hoverEl) hoverEl.classList.remove('is-hovered');
      hoverEl = near;
      if (hoverEl) hoverEl.classList.add('is-hovered');
    }
    /* guide line: crosshair at the cursor, time readout above the ruler */
    var rect = stage.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    if (mx >= 0 && mx <= stage.clientWidth) {
      cursorX = mx;
      cursorEl.style.display = '';
      cursorEl.style.left = mx + 'px';
      var timeEl = cursorEl.querySelector('.tl__cursor-time');
      timeEl.textContent = cursorTimeAt(mx);
      /* the label centers itself on the guide line via translateX(-50%);
         only the container moves with the cursor — no separate math */
    }
  });
  stage.addEventListener('pointerleave', function () {
    if (hoverEl) { hoverEl.classList.remove('is-hovered'); hoverEl = null; }
    cursorEl.style.display = 'none';
  });
  stage.addEventListener('click', function (e) {
    if (scrubJustEnded) return;   /* scrub 刚结束，跳过空白关闭 */
    if (moved) { moved = false; return; }  /* was a drag, not a click */
    /* 默认工具 = 时间指针：点空白定位当前时间（click 兜底，不依赖空格状态，保证一定触发） */
    if (!eyedropTarget && !e.target.closest('.tl__n, .tl__loop, .tl__storybar, .tl__time-cursor-handle, .tl__detail, .tl__ctx')) {
      var rectC = stage.getBoundingClientRect();
      var mxC = e.clientX - rectC.left;
      timeCursor = xToTime(mxC - panX);
      updateTimeCursorPos();
      applyTimeCursorState();
      saveTimeCursor();
    }
    /* 吸管模式：点击节点吸取该节点，点击空白吸取时间 */
    if (eyedropTarget) {
      var near = nearestNodeAt(e.clientX, e.clientY);
      if (near && near._node && near._node.id) {
        /* 点击节点：直接吸取该节点 */
        if (eyedropTarget === 'start') eyedropStartNodeId = near._node.id;
        else eyedropEndNodeId = near._node.id;
      } else {
        /* 点击空白：清空吸取的节点，吸取时间 */
        if (eyedropTarget === 'start') eyedropStartNodeId = null;
        else eyedropEndNodeId = null;
        var rect = stage.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var t = nonlinearMode
          ? (function () {
              var bestN = null, bestD = Infinity;
              nodesEl.querySelectorAll('.tl__n').forEach(function (nn) {
                if (multiMode && nn.getAttribute('data-tl') !== activeId) return;
                var nx = nodeRealX(nn);
                var nd = Math.abs(nx - mx);
                if (nd < bestD) { bestD = nd; bestN = nn._node; }
              });
              return bestN ? toNumber(bestN.year) - (timelines[activeId].absOffset || 0) : NaN;
            })()
          : xToTime(mx - panX) - (timelines[activeId].absOffset || 0);
        if (isFinite(t)) {
          var inp = document.getElementById('loop-modal-' + eyedropTarget);
          if (inp) inp.value = roundToBand(t);
        }
      }
      endEyedrop();
      loopModal.style.display = 'flex';
      updateLoopPickUI();
      return;
    }
    /* clicks on the info panel, its loop-settings, or the right-click
       menu must never count as "empty space" */
    if (e.target.closest('.tl__detail, .tl__ctx')) return;
    var near = nearestNodeAt(e.clientX, e.clientY);
    if (near) {
      toggleNode(near._node, near);
    } else if (openNodeEl) {
      closeDetail();          /* click on empty space dismisses the panel */
    } else if (activeLoop) {
      closeLoopSettings();    /* ... or the loop settings */
    }
  });

  /* -- window resize keeps the track wide enough ------------ */
  window.addEventListener('resize', function () {
    updatePositions();
    buildScale();
    refreshPanBounds();
  });

  /* ── The Hum · AI panel ────────────────────────────────── */
  var humWrap = document.getElementById('hum-wrap');
  var humBody = document.getElementById('hum-body');
  var humInput = document.getElementById('hum-input');
  var humSend = document.getElementById('hum-send');

  function openHum() {
    humWrap.classList.add('is-open');
    setTimeout(function () { humInput.focus(); }, 500);
  }
  function closeHum() { humWrap.classList.remove('is-open'); }

  document.querySelectorAll('[data-open-hum]').forEach(function (b) {
    b.addEventListener('click', openHum);
  });
  document.querySelectorAll('[data-close-hum]').forEach(function (b) {
    b.addEventListener('click', closeHum);
  });

  var aiReply = function (msg) {
    return '嗯，我在听。你说"' + msg + '"……我会记得把这一点留在光的角落里。';
  };

  function pushMsg(text, isUser) {
    var time = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var stamp = p(time.getHours()) + ':' + p(time.getMinutes());
    var msg = document.createElement('div');
    msg.className = 'msg ' + (isUser ? 'msg--user' : 'msg--ai');
    var avatar = isUser ? '' :
      '<div class="msg__avatar"><span class="glyph">灵</span></div>';
    msg.innerHTML =
      avatar +
      '<div style="flex:1; min-width:0"></div>' +
      '<div style="min-width:0">' +
        '<div class="msg__bubble">' + escapeHtml(text) + '</div>' +
        '<div class="msg__time">' + stamp + '</div>' +
      '</div>';
    if (isUser) { msg.querySelector('[style]').style.display = 'none'; }
    humBody.appendChild(msg);
    humBody.scrollTop = humBody.scrollHeight;
  }

  function send() {
    var text = humInput.value.trim();
    if (!text) return;
    pushMsg(text, true);
    humInput.value = '';
    setTimeout(function () { pushMsg(aiReply(text), false); }, 900);
  }
  humSend.addEventListener('click', send);
  humInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send();
  });

  /* ═══ MARKDOWN EDITOR ══════════════════════════════════════
     Documents live in localStorage (key: lingkuang-docs-v1).
     A minimal inline markdown renderer — no external deps. */
  var ED_KEY = 'lingkuang-docs-v1';
  var docs = { '__untitled__': '# 未命名\n\n写点什么…' };
  var activeDoc = '__untitled__';
  var saveTimer = null;

  function loadDocs() {
    if (api) return;   /* docs arrive with the file load (applyLoadedData) */
    try {
      var raw = localStorage.getItem(ED_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d === 'object' && Object.keys(d).length) docs = d;
      }
    } catch (e) { /* keep default */ }
  }
  function saveDocs() {
    if (api) {
      /* docs live in the same worldbuilding.json as the timelines, in the
         {worldsets, active} format — saving the legacy {timelines,...}
         shape here used to overwrite the file and wipe every other worldset */
      saveTimelines();
      return;
    }
    try { localStorage.setItem(ED_KEY, JSON.stringify(docs)); } catch (e) {}
  }
  loadDocs();

  var edInput = document.getElementById('ed-input');
  var edPreview = document.getElementById('ed-preview');
  var edTitle = document.getElementById('ed-title');
  var edFiles = document.getElementById('ed-files');
  var edSaved = document.getElementById('ed-saved');
  var edNew = document.getElementById('ed-new');
  var edExport = document.getElementById('ed-export');

  /* minimal markdown → HTML (headings, bold/italic, code, lists, quotes,
     links, hr). Code fences are extracted first, then re-inserted. */
  function mdRender(src) {
    var blocks = [];
    /* pull out ``` fenced blocks */
    src = src.replace(/```[\s\S]*?```/g, function (m) {
      var inner = m.replace(/^```[^\n]*\n/, '').replace(/\n?```$/, '');
      blocks.push('<pre><code>' + escapeHtml(inner) + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    var out = [];
    var listType = null;
    function closeList() { if (listType) { out.push('</' + listType + '>'); listType = null; } }
    src.split('\n').forEach(function (line) {
      var m;
      if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
        closeList();
        out.push('<h' + m[1].length + '>' + inlineMd(m[2]) + '</h' + m[1].length + '>');
      } else if (/^(---|\*\*\*)\s*$/.test(line)) {
        closeList(); out.push('<hr>');
      } else if ((m = line.match(/^>\s?(.*)$/))) {
        closeList(); out.push('<blockquote>' + inlineMd(m[1]) + '</blockquote>');
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push('<li>' + inlineMd(m[1]) + '</li>');
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push('<li>' + inlineMd(m[1]) + '</li>');
      } else if ((m = line.match(/^\u0000(\d+)\u0000$/))) {
        closeList(); out.push(blocks[+m[1]]);
      } else {
        closeList();
        if (line.trim() === '') out.push('');
        else out.push('<p>' + inlineMd(line) + '</p>');
      }
    });
    closeList();
    return out.join('\n');
  }
  function inlineMd(s) {
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }

  function renderEditor() {
    var d = docs[activeDoc] || '';
    edTitle.value = activeDoc === '__untitled__' ? '' : activeDoc;
    edInput.value = d;
    edPreview.innerHTML = mdRender(d);
    edSaved.textContent = '已保存';
    edSaved.classList.remove('is-dirty');
    /* file list */
    edFiles.innerHTML = '';
    Object.keys(docs).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'editor__file' + (k === activeDoc ? ' is-active' : '');
      b.textContent = k;
      b.title = k;
      b.addEventListener('click', function () { activeDoc = k; renderEditor(); });
      edFiles.appendChild(b);
    });
    /* make the list scrollable if long */
    edFiles.scrollTop = 0;
  }
  edInput.addEventListener('input', function () {
    docs[activeDoc] = edInput.value;
    edSaved.textContent = '未保存…';
    edSaved.classList.add('is-dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveDocs(); edSaved.textContent = '已保存'; edSaved.classList.remove('is-dirty'); }, 600);
    /* live preview — throttle to every ~150ms via rAF */
    clearTimeout(edPreviewTimer);
    edPreviewTimer = setTimeout(function () { edPreview.innerHTML = mdRender(edInput.value); }, 120);
  });
  var edPreviewTimer = null;
  edTitle.addEventListener('change', function () {
    var name = edTitle.value.trim();
    if (!name) return;
    if (name !== activeDoc && docs[name] !== undefined) { edTitle.value = activeDoc; return; }
    if (activeDoc !== '__untitled__') delete docs[activeDoc];
    docs[name] = edInput.value;
    activeDoc = name;
    saveDocs();
    renderEditor();
  });
  edNew.addEventListener('click', function () {
    activeDoc = '__untitled__';
    docs['__untitled__'] = '';
    renderEditor();
    edTitle.focus();
  });
  edExport.addEventListener('click', function () {
    var name = activeDoc === '__untitled__' ? 'untitled' : activeDoc;
    var blob = new Blob([docs[activeDoc] || ''], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  renderEditor();

  /* ═══ global keyboard shortcuts ══════════════════════════ */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var anyModalOpen = [loopModal, nodeModal, newlineModal, confirmModal].some(function (m) {
      return m && m.style.display !== 'none';
    });
    /* only treat as text-editing when the focus is a VISIBLE text field
       (a hidden input left behind by a closed modal must not block undo) */
    var inEditor = e.target && (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
    var inVisibleInput = e.target && e.target.tagName === 'INPUT' && e.target.offsetParent !== null;
    var editing = (inEditor || inVisibleInput) && !anyModalOpen;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (editing) return;   /* let the editor handle its own undo */
      e.preventDefault();
      undoTimeline();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      if (editing) return;
      e.preventDefault();
      redoTimeline();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (editing) return;
      e.preventDefault();
      redoTimeline();
      return;
    }
    if (e.key === 'Escape') {
      /* close any open modal / menu / detail */
      closeCtx();
      [loopModal, nodeModal, newlineModal, confirmModal, settingsModal].forEach(function (m) {
        if (m && m.style.display !== 'none') m.style.display = 'none';
      });
      if (openNodeEl) closeDetail();
    }
  });

  /* ── user settings: glide speed / zoom sensitivity / ruler density ──
     persisted to %APPDATA%\lingkuang\settings.json (no destructive knobs) */
  var SETTINGS_DEFAULTS = { glide: 0.15, sens: 1.0, ruler: 1.0, defPrecision: 'day', seqPitchDef: 96, animMs: 480,
    ai: { mode: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b', apiKey: '' } };
  var SETTINGS = Object.assign({}, SETTINGS_DEFAULTS);
  var settingsModal = document.getElementById('settings-modal');
  var glideInput = document.getElementById('set-glide');
  var sensInput = document.getElementById('set-sens');
  var rulerInput = document.getElementById('set-ruler');
  var precisionInput = document.getElementById('set-precision');
  var seqInput = document.getElementById('set-seq');
  var animInput = document.getElementById('set-anim');
  var aiModeInput = document.getElementById('set-ai-mode');
  var aiUrlInput = document.getElementById('set-ai-url');
  var aiKeyInput = document.getElementById('set-ai-key');
  var aiModelInput = document.getElementById('set-ai-model');

  function applySettings() {
    targetPx = 110 * SETTINGS.ruler;
    LANE_SLIDE_MS = SETTINGS.animMs;
    if (nonlinearMode) seqPitch = Math.max(32, Math.min(300, SETTINGS.seqPitchDef || 96));
  }
  function saveSettings() {
    if (window.lingkuangAPI && window.lingkuangAPI.saveSettings) {
      window.lingkuangAPI.saveSettings(SETTINGS).catch(function () {});
    }
  }
  function syncSettingsUI() {
    glideInput.value = SETTINGS.glide;
    sensInput.value = SETTINGS.sens;
    rulerInput.value = SETTINGS.ruler;
    precisionInput.value = SETTINGS.defPrecision;
    seqInput.value = SETTINGS.seqPitchDef;
    document.getElementById('set-glide-val').textContent = SETTINGS.glide.toFixed(2);
    document.getElementById('set-sens-val').textContent = SETTINGS.sens.toFixed(1) + '×';
    document.getElementById('set-ruler-val').textContent = SETTINGS.ruler.toFixed(1) + '×';
    document.getElementById('set-seq-val').textContent = SETTINGS.seqPitchDef + 'px';
    document.getElementById('set-anim-val').textContent = SETTINGS.animMs + 'ms';
    var ai = SETTINGS.ai || {};
    aiModeInput.value = ai.mode || 'ollama';
    aiUrlInput.value = ai.baseUrl || '';
    aiKeyInput.value = ai.apiKey || '';
    aiModelInput.value = ai.model || '';
  }
  function bindAiSettings() {
    function onAiChange() {
      SETTINGS.ai = {
        mode: aiModeInput.value,
        baseUrl: aiUrlInput.value.trim(),
        model: aiModelInput.value.trim() || 'qwen2.5:7b',
        apiKey: aiKeyInput.value.trim()
      };
      saveSettings();
    }
    [aiModeInput, aiUrlInput, aiKeyInput, aiModelInput].forEach(function (el) {
      el.addEventListener('change', onAiChange);
    });
  }
  function openSettings() { syncSettingsUI(); settingsModal.style.display = 'flex'; }
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-modal-close').addEventListener('click', function () { settingsModal.style.display = 'none'; });
  settingsModal.addEventListener('click', function (e) { if (scrubJustEnded) return; if (e.target === settingsModal) settingsModal.style.display = 'none'; });
  document.getElementById('settings-modal-reset').addEventListener('click', function () {
    SETTINGS = Object.assign({}, SETTINGS_DEFAULTS);
    applySettings(); syncSettingsUI(); saveSettings();
    buildScale();
  });
  bindAiSettings();
  glideInput.addEventListener('input', function () { SETTINGS.glide = parseFloat(glideInput.value); document.getElementById('set-glide-val').textContent = SETTINGS.glide.toFixed(2); saveSettings(); });
  sensInput.addEventListener('input', function () { SETTINGS.sens = parseFloat(sensInput.value); document.getElementById('set-sens-val').textContent = SETTINGS.sens.toFixed(1) + '×'; saveSettings(); });
  rulerInput.addEventListener('input', function () { SETTINGS.ruler = parseFloat(rulerInput.value); document.getElementById('set-ruler-val').textContent = SETTINGS.ruler.toFixed(1) + '×'; applySettings(); saveSettings(); buildScale(); });
  precisionInput.addEventListener('change', function () { SETTINGS.defPrecision = precisionInput.value; saveSettings(); });
  seqInput.addEventListener('input', function () { SETTINGS.seqPitchDef = parseInt(seqInput.value, 10); document.getElementById('set-seq-val').textContent = SETTINGS.seqPitchDef + 'px'; applySettings(); saveSettings(); updatePositions(); });
  animInput.addEventListener('input', function () { SETTINGS.animMs = parseInt(animInput.value, 10); document.getElementById('set-anim-val').textContent = SETTINGS.animMs + 'ms'; applySettings(); saveSettings(); });
  /* load persisted settings at boot */
  (function loadSettings() {
    if (!window.lingkuangAPI || !window.lingkuangAPI.loadSettings) { applySettings(); return; }
    window.lingkuangAPI.loadSettings().then(function (res) {
      if (res && res.ok && res.data) {
        Object.keys(SETTINGS_DEFAULTS).forEach(function (k) {
          var v = res.data[k];
          if (k === 'defPrecision') {
            if (['day', 'hour', 'minute', 'month', 'year'].indexOf(v) >= 0) SETTINGS[k] = v;
          } else if (typeof v === 'number' && isFinite(v)) SETTINGS[k] = v;
        });
      }
      applySettings();
    }).catch(function () { applySettings(); });
  })();

  var scrubJustEnded = false;   /* scrub 刚结束，跳过 stage 的空白点击关闭 */
  /* AE-style scrubby value：数值输入框左右拖动改值
     Shift = 10x 力度，Ctrl/Cmd = 0.1x 力度（精细） */
  function makeScrubbable(input) {
    var startX = 0, startVal = 0, tracking = false, scrubbing = false;
    input.style.cursor = 'ew-resize';
    input.addEventListener('pointerdown', function (e) {
      startX = e.clientX;
      startVal = parseFloat(input.value) || 0;
      tracking = true;
      scrubbing = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!tracking) return;
      var dx = e.clientX - startX;
      if (!scrubbing && Math.abs(dx) >= 3) {
        scrubbing = true;
        input.blur();
        document.body.style.cursor = 'ew-resize';
      }
      if (scrubbing) {
        var isInt = input.type === 'number';   /* 年/月/日/循环次数等整数字段 */
        var step = 1;
        if (e.shiftKey) step *= 10;
        if (e.ctrlKey || e.metaKey) step *= 0.1;   /* ctrl 精细：移动 10px = 1 单位 */
        var v = isInt
          ? Math.round(startVal + dx * step)       /* 整数字段取整，ctrl 仍 10px/单位 */
          : Math.round((startVal + dx * step) * 1000) / 1000;
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    window.addEventListener('pointerup', function () {
      if (tracking && scrubbing) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        scrubJustEnded = true;
        setTimeout(function () { scrubJustEnded = false; }, 120);
      } else if (tracking && !scrubbing) {
        /* 单击（未拖拽）：全选数值，方便直接输入覆盖 */
        input.focus();
        input.select();
      }
      tracking = false;
      scrubbing = false;
      document.body.style.cursor = '';
    });
  }
  (function initScrubbables() {
    document.querySelectorAll('input[type="number"], #loop-modal-start, #loop-modal-end, #d-loop-start-year, #d-loop-end-year, #d-year').forEach(function (inp) {
      makeScrubbable(inp);
    });
  })();

  /* select enhancer — AE-style: hovering + wheel cycles the options
     (wraps, instant); clicking still opens the native list, where the
     wheel moves the highlight and releasing on an item commits it. */
  Array.prototype.forEach.call(document.querySelectorAll('select'), function (sel) {
    sel.addEventListener('wheel', function (e) {
      e.preventDefault();
      var n = sel.options.length;
      if (!n) return;
      var i = sel.selectedIndex + (e.deltaY > 0 ? 1 : -1);
      sel.selectedIndex = ((i % n) + n) % n;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  /* ── idle un-render：停止注视时画面慢慢失焦褪色（CRT 待机）──
     30s 无操作 → body.is-idle（CSS 里 .app 褪色、grain 增强）；
     任何输入立刻唤醒。reduced-motion 下 CSS 已禁用褪色。 */
  var IDLE_MS = 30000;
  var idleTimer = null;
  function idleWake() {
    document.body.classList.remove('is-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      document.body.classList.add('is-idle');
    }, IDLE_MS);
  }
  ['mousemove', 'mousedown', 'pointerdown', 'wheel', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, idleWake, { passive: true });
  });
  idleWake();

  /* ── random character generator ──────────────────────────── */
  var charLib = null;
  var CHAR_STATUS = document.getElementById('char-status');
  var CHAR_RESULT = document.getElementById('char-result');
  var CHAR_ROLL = document.getElementById('char-roll');
  var CHAR_SAVE = document.getElementById('char-save');
  var CHAR_SAVE_NAME = document.getElementById('char-save-name');
  var CHAR_SAVES = document.getElementById('char-saves');

  function charStatus(msg) { CHAR_STATUS.textContent = msg; }

  var CHAR_GROUPS = [
    { t: '外貌',     keys: ['发色', '发型', '瞳色', '肤色'], n: 4 },
    { t: '身体特征', keys: ['角', '瞳', '耳', '尾', '翅', '其他身体特征'], n: 2 },
    { t: '服装',     keys: ['上衣', '下装', '连体衣', '套装'], n: 2 },
    { t: '穿戴',     keys: ['鞋', '袜', '眼镜'], n: 2 },
    { t: '饰品',     keys: ['头饰', '颈饰', '臂饰', '腰饰', '手饰', '脚链', '肩饰', '面饰'], n: 2 },
    { t: '装备',     keys: ['武器', '法器', '道具', '随身物'], n: 1 },
    { t: '内在',     keys: ['表层性格', '深层性格'], n: 2 },
    { t: '身份',     keys: ['气质', '职业', '种族'], n: 2 },
    { t: '背景',     keys: ['背景经历', '秘密', '目标', '执念'], n: 1 },
    { t: '能力',     keys: ['能力', '弱点'], n: 1 },
    { t: '关系/主题', keys: ['关系', '主题意象', '代表色'], n: 1 }
  ];

  /* 词条锁定表：key -> 锁定的值。锁定的词条下次随机保留。 */
  var locks = {};
  /* 每组词条数选择：gi -> 'rand' | '1'..'4'（渲染时恢复，不随重绘丢失） */
  var groupCounts = {};

  /* 洗牌（原地） */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* 组内词条数 select 的选项 HTML（上限 = min(4, key 数)） */
  function countOptions(g, current) {
    var max = Math.min(4, g.keys.length);
    var cur = current || String(g.n);
    var opts = ['<option value="rand"' + (cur === 'rand' ? ' selected' : '') + '>随机</option>'];
    for (var i = 1; i <= max; i++) {
      opts.push('<option value="' + i + '"' + (cur === String(i) ? ' selected' : '') + '>' + i + '</option>');
    }
    return opts.join('');
  }

  /* 当前组实际抽词条数：'rand' 时在 1..上限 间随机 */
  function currentCount(g, gi) {
    var v = groupCounts[gi];
    if (v === 'rand') return 1 + Math.floor(Math.random() * Math.min(4, g.keys.length));
    var n = parseInt(v, 10);
    return isNaN(n) ? g.n : n;
  }

  /* 抽一组：锁定 key 保留原值，其余从自由 key 洗牌补足 count 个 */
  function rollGroup(g, count) {
    var res = {};
    var lockedKeys = g.keys.filter(function (k) { return locks[k] !== undefined; });
    lockedKeys.forEach(function (k) { res[k] = locks[k]; });
    var free = g.keys.filter(function (k) {
      return locks[k] === undefined && Array.isArray(charLib[k]) && charLib[k].length > 0;
    });
    shuffle(free);
    var need = Math.max(0, count - lockedKeys.length);
    free.slice(0, Math.min(need, free.length)).forEach(function (k) {
      res[k] = charLib[k][Math.floor(Math.random() * charLib[k].length)];
    });
    return res;
  }

  /* combo = { 组名: { key: value } }；有则按 combo 渲染（加载存档），无则随机 */
  function renderChar(combo) {
    var html = CHAR_GROUPS.map(function (g, gi) {
      var picks = combo ? (combo[g.t] || {}) : rollGroup(g, currentCount(g, gi));
      var rows = Object.keys(picks).map(function (k) {
        var locked = locks[k] !== undefined;
        return '<div class="char__row' + (locked ? ' is-locked' : '') + '" data-key="' + k + '">'
          + '<span class="char__key">' + k + '</span>'
          + '<span class="char__val">' + picks[k] + '</span>'
          + '<button class="char__lock" data-key="' + k + '" title="' + (locked ? '解锁，下次参与随机' : '锁定：下次随机保留') + '">⚿</button>'
          + '</div>';
      }).join('');
      return '<div class="char__card">'
        + '<div class="char__card-head"><h3>' + g.t + '</h3>'
        + '<select class="char__count" data-group="' + gi + '">' + countOptions(g, groupCounts[gi]) + '</select></div>'
        + rows + '</div>';
    }).join('');
    CHAR_RESULT.innerHTML = html || '<div class="char__empty">词库还没有可用分类</div>';
  }

  function generateChar() {
    if (!charLib) { charStatus('词库未加载'); return; }
    renderChar(null);
  }

  /* 从当前 DOM 收集组合数据 */
  function collectCombo() {
    var combo = {};
    CHAR_GROUPS.forEach(function (g, gi) {
      var card = CHAR_RESULT.children[gi];
      if (!card) return;
      var m = {};
      Array.prototype.forEach.call(card.querySelectorAll('.char__row'), function (row) {
        m[row.dataset.key] = row.querySelector('.char__val').textContent;
      });
      combo[g.t] = m;
    });
    return combo;
  }

  /* ── 存档（localStorage）── */
  var SAVES_KEY = 'lingkuang-char-saves';
  var saves = [];
  try { saves = JSON.parse(localStorage.getItem(SAVES_KEY)) || []; } catch (e) { saves = []; }
  function persistSaves() {
    try { localStorage.setItem(SAVES_KEY, JSON.stringify(saves)); } catch (e) { /* 空间满等忽略 */ }
  }
  function renderSaves() {
    CHAR_SAVES.innerHTML = saves.map(function (s, i) {
      return '<span class="char__save-chip" data-save="' + i + '" title="加载：' + s.name + '">'
        + s.name + ' <span class="chip-x" data-del="' + i + '">×</span></span>';
    }).join('');
  }
  function saveChar() {
    var combo = collectCombo();
    if (!Object.keys(combo).length) { charStatus('还没有可保存的组合'); return; }
    var name = CHAR_SAVE_NAME.value.trim() || ('角色 ' + (saves.length + 1));
    saves.push({ name: name, time: Date.now(), combo: combo });
    persistSaves();
    renderSaves();
    CHAR_SAVE_NAME.value = '';
    charStatus('已保存：' + name);
  }

  /* 事件（委托） */
  CHAR_RESULT.addEventListener('click', function (e) {
    var btn = e.target.closest('.char__lock');
    if (!btn) return;
    var k = btn.dataset.key;
    var row = btn.parentElement;
    if (locks[k] !== undefined) {
      /* 解锁：原地切换，不重绘 */
      delete locks[k];
      row.classList.remove('is-locked');
      btn.title = '锁定：下次随机保留';
    } else {
      var valEl = row.querySelector('.char__val');
      if (!valEl) return;
      locks[k] = valEl.textContent;
      row.classList.add('is-locked');
      btn.title = '解锁，下次参与随机';
    }
  });
  CHAR_RESULT.addEventListener('change', function (e) {
    var sel = e.target.closest('.char__count');
    if (!sel) return;
    groupCounts[sel.dataset.group] = sel.value;
  });
  CHAR_SAVES.addEventListener('click', function (e) {
    var del = e.target.closest('.chip-x');
    if (del) {
      saves.splice(parseInt(del.dataset.del, 10), 1);
      persistSaves();
      renderSaves();
      return;
    }
    var chip = e.target.closest('.char__save-chip');
    if (!chip) return;
    var s = saves[parseInt(chip.dataset.save, 10)];
    if (!s) return;
    renderChar(s.combo);
    charStatus('已加载：' + s.name);
  });

  function charReady() {
    var n = Object.keys(charLib).length;
    var total = Object.keys(charLib).reduce(function (s, k) { return s + charLib[k].length; }, 0);
    charStatus('词库已加载 · ' + n + ' 分类 / ' + total + ' 词条');
    renderSaves();
    buildCharWords();
    generateChar();
  }

  function loadCharLib() {
    if (window.lingkuangAPI && window.lingkuangAPI.loadCharLib) {
      window.lingkuangAPI.loadCharLib().then(function (res) {
        if (res && res.ok) { charLib = res.data; charReady(); }
        else charStatus('词库加载失败（' + ((res && res.error) || '未知') + '）');
      }).catch(function () { charStatus('词库加载失败'); });
    } else {
      /* 浏览器降级：直接 fetch 相对路径 json */
      fetch('data/character_lib.json').then(function (r) {
        if (!r.ok) throw 0;
        return r.json();
      }).then(function (d) { charLib = d; charReady(); })
        .catch(function () { charStatus('词库加载失败'); });
    }
  }
  CHAR_ROLL.addEventListener('click', generateChar);
  CHAR_SAVE.addEventListener('click', saveChar);
  CHAR_SAVE_NAME.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveChar(); });
  loadCharLib();

  /* ── word association（词义联想 · 无限画布 + 单线聚焦）── */
  var ASSOC_INPUT = document.getElementById('assoc-input');
  var ASSOC_GO = document.getElementById('assoc-go');
  var ASSOC_STATUS = document.getElementById('assoc-status');
  var ASSOC_STAGE = document.getElementById('assoc-tree');
  var ASSOC_WORLD = document.getElementById('assoc-world');
  var ASSOC_EXPORT = document.getElementById('assoc-export');

  function updateExportBtn() {
    ASSOC_EXPORT.textContent = '导出暂存词（' + staged.length + '）';
    ASSOC_EXPORT.disabled = staged.length === 0;
  }

  /* 词库全量词集合（命中检测）+ 暂存词表（localStorage） */
  var charWords = null;
  var STAGED_KEY = 'lingkuang-char-staged';
  var staged = [];
  try {
    staged = (JSON.parse(localStorage.getItem(STAGED_KEY)) || [])
      .filter(function (w) { return typeof w === 'string' && w.length > 0; });
  } catch (e) { staged = []; }
  /* 累积式联想图 + 单线聚焦 */
  var assocGraph = null;
  var focusedId = 0;
  var WORLD_W = 2000, WORLD_H = 1200;
  function persistStaged() {
    try { localStorage.setItem(STAGED_KEY, JSON.stringify(staged)); } catch (e) { /* 忽略 */ }
  }
  function buildCharWords() {
    charWords = new Set();
    Object.keys(charLib).forEach(function (c) {
      charLib[c].forEach(function (w) { charWords.add(w); });
    });
  }
  function assocStatus(msg) { ASSOC_STATUS.textContent = msg; }

  /* ── 无限画布：平移 + 缩放 ── */
  var assocPanX = 0, assocPanY = 0, assocZoom = 1;
  var isPanning = false, panSX = 0, panSY = 0, panOX = 0, panOY = 0;

  function applyWorldTransform() {
    if (!ASSOC_WORLD) return;
    ASSOC_WORLD.style.transform = 'translate(' + assocPanX + 'px,' + assocPanY + 'px) scale(' + assocZoom + ')';
  }

  var dragNodeId = null, dragMoved = false, dragSX = 0, dragSY = 0, dragGroup = null, suppressClick = false;

  /* 收集子树（含自身）——拖动时整组跟随 */
  function collectTree(rootId) {
    var set = new Set();
    (function walk(nid) {
      if (set.has(nid)) return;
      set.add(nid);
      var n = assocGraph.nodes[nid];
      if (n) n.children.forEach(walk);
    })(rootId);
    return set;
  }

  ASSOC_STAGE.addEventListener('mousedown', function (e) {
    if (e.target.closest('.store')) return;              /* 存按钮交给 click 处理，此处只跳过拖拽 */
    var nodeEl = e.target.closest('.assoc__node, .assoc__root');
    if (nodeEl && assocGraph) {
      dragNodeId = parseInt(nodeEl.dataset.id, 10);
      dragGroup = collectTree(dragNodeId);
      dragSX = e.clientX; dragSY = e.clientY;
      dragMoved = false;
      suppressClick = false;
      var dn = assocGraph.nodes[dragNodeId];
      if (dn) { dn._dragOx = dn.x; dn._dragOy = dn.y; }
      return;                                    /* 节点拖拽，不启动画布平移 */
    }
    isPanning = true;
    panSX = e.clientX; panSY = e.clientY;
    panOX = assocPanX; panOY = assocPanY;
    ASSOC_STAGE.classList.add('is-panning');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (dragNodeId !== null && assocGraph) {
      var dn = assocGraph.nodes[dragNodeId];
      if (!dn) { dragNodeId = null; dragGroup = null; return; }
      if (!dragMoved && Math.abs(e.clientX - dragSX) + Math.abs(e.clientY - dragSY) > 4) dragMoved = true;
      if (dragMoved) {
        dn.x = dn._dragOx + (e.clientX - dragSX) / assocZoom;
        dn.y = dn._dragOy + (e.clientY - dragSY) / assocZoom;
        dn.vx = 0; dn.vy = 0;
        Array.prototype.forEach.call(ASSOC_WORLD.querySelectorAll('.assoc__node, .assoc__root'), function (el) {
          if (parseInt(el.dataset.id, 10) === dragNodeId) {
            el.style.transform = 'translate(' + dn.x + 'px,' + dn.y + 'px)';
          }
        });
        drawEdges();
      }
      return;
    }
    if (isPanning) {
      assocPanX = panOX + (e.clientX - panSX);
      assocPanY = panOY + (e.clientY - panSY);
      applyWorldTransform();
    }
  });
  window.addEventListener('mouseup', function () {
    var wasDrag = dragMoved;
    dragNodeId = null;
    dragGroup = null;
    isPanning = false;
    ASSOC_STAGE.classList.remove('is-panning');
    if (wasDrag) {
      /* 本次是拖动：抑制随后的 click（若触发）；无 click 时 setTimeout 清理残留 */
      suppressClick = true;
      dragMoved = false;
      setTimeout(function () { suppressClick = false; }, 0);
    }
  });
  ASSOC_STAGE.addEventListener('wheel', function (e) {
    if (!e.altKey) return;            /* 普通滚轮 = 页面滚动；Alt+滚轮 = 缩放画布 */
    e.preventDefault();
    var rect = ASSOC_STAGE.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var nz = Math.min(3, Math.max(0.4, assocZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    assocPanX = mx - (mx - assocPanX) * (nz / assocZoom);
    assocPanY = my - (my - assocPanY) * (nz / assocZoom);
    assocZoom = nz;
    applyWorldTransform();
  }, { passive: false });

  /* ── 可见性：selected 支线永远保留；其余由父的子层显示模式（focusChildId）决定 ── */
  function visibleIds() {
    var vis = new Set();
    if (!assocGraph || !assocGraph.nodes.length) return vis;
    assocGraph.nodes.forEach(function (n) {
      if (n.selected) vis.add(n.id);                   /* selected 自身永远可见（子层仍受其 focusChildId 限制） */
      if (n.isRoot) vis.add(n.id);
    });
    assocGraph.nodes.forEach(function (n) {            /* 展开节点的子层（受父收起限制） */
      if (!n.expanded) return;
      n.children.forEach(function (c) {
        if (vis.has(c)) return;
        if (n.focusChildId !== null && n.focusChildId !== undefined && n.focusChildId !== c) return;
        vis.add(c);
      });
    });
    return vis;
  }

  /* 点击节点：再点焦点=刷新 / 点子词=选中收起兄弟 / 点父=恢复或刷新 */
  function onNodeClick(id) {
    if (!assocGraph) return;
    var node = assocGraph.nodes[id];
    if (!node) return;
    if (id === focusedId) {
      refreshNode(id);
      return;
    }
    focusedId = id;
    var parent = node.parent !== null ? assocGraph.nodes[node.parent] : null;
    if (parent) {
      node.selected = true;                    /* 选中：成为保留支线 */
      parent.focusChildId = id;                /* 收起同级未选中兄弟 */
      if (!node.expanded) expandNode(id);
      else renderGraph();
      assocStatus('选中「' + node.word + '」· 点父级恢复 / 再点刷新');
      return;
    }
    if (node.children.length) {                /* 根/无父子层：恢复或刷新 */
      if (node.focusChildId !== null && node.focusChildId !== undefined) {
        node.focusChildId = null;
        renderGraph();
        assocStatus('恢复全部子层');
      } else {
        refreshNode(id);
      }
    }
  }

  /* ── 力导向（可见节点/边；dragGroup 非空时：组与外部断开，组内力学继续）── */
  function forceStep(nodes, vis, edges, temp, damp, dragGroup) {
    var nodeById = {};
    nodes.forEach(function (n) { nodeById[n.id] = n; });
    var vList = nodes.filter(function (n) { return vis.has(n.id); });
    var i, j;
    for (i = 0; i < vList.length; i++) {
      for (j = i + 1; j < vList.length; j++) {
        var a = vList[i], b = vList[j];
        if (dragGroup && (dragGroup.has(a.id) !== dragGroup.has(b.id))) continue;  /* 组内外斥力断开 */
        var dx = a.x - b.x, dy = a.y - b.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = 900 / (d * d) * temp;
        var fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    edges.forEach(function (e) {
      var a = nodeById[e.from], b = nodeById[e.to];
      if (!a || !b || !vis.has(a.id) || !vis.has(b.id)) return;
      if (dragGroup && (dragGroup.has(a.id) !== dragGroup.has(b.id))) return;  /* 跨组边断开（含父级引力） */
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var f = (d - 140) * 0.05 * temp;
      var fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });
    vList.forEach(function (n) {
      if (dragGroup && n.id === dragNodeId) { n.vx = 0; n.vy = 0; return; }  /* 被拖节点由鼠标控制 */
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx * 0.5;
      n.y += n.vy * 0.5;
      if (n.x < 20) { n.x = 20; n.vx = 0; }
      if (n.x > WORLD_W - 20 - (n.w || 70)) { n.x = WORLD_W - 20 - (n.w || 70); n.vx = 0; }
      if (n.y < 20) { n.y = 20; n.vy = 0; }
      if (n.y > WORLD_H - 20 - (n.h || 30)) { n.y = WORLD_H - 20 - (n.h || 30); n.vy = 0; }
    });
  }

  function drawEdges() {
    var svg = ASSOC_WORLD.querySelector('.assoc__lines');
    if (!svg || !assocGraph) return;
    svg.setAttribute('viewBox', '0 0 ' + WORLD_W + ' ' + WORLD_H);
    var nodeById = {};
    assocGraph.nodes.forEach(function (n) { nodeById[n.id] = n; });
    var vis = visibleIds();
    svg.innerHTML = assocGraph.edges.filter(function (e) {
      return vis.has(e.from) && vis.has(e.to);
    }).map(function (e) {
      var a = nodeById[e.from], b = nodeById[e.to];
      if (!a || !b) return '';
      var x1 = a.x + (a.w || 70) / 2, y1 = a.y + (a.h || 30) / 2;
      var x2 = b.x + (b.w || 70) / 2, y2 = b.y + (b.h || 30) / 2;
      return '<path d="M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
        + '" fill="none" stroke="rgba(58,58,52,0.25)" stroke-width="1.2"/>';
    }).join('');
  }

  var simRAF = null;
  function stopSim() {
    if (simRAF) { cancelAnimationFrame(simRAF); simRAF = null; }
  }

  function startSim() {
    stopSim();
    if (!assocGraph) return;
    var frame = 0;
    function tick() {
      if (!assocGraph || !assocGraph.nodes.length) { simRAF = requestAnimationFrame(tick); return; }
      frame++;
      var temp = frame < 90 ? 1 : 0.22;
      var damp = frame < 90 ? 0.82 : 0.92;
      var vis = visibleIds();
      if (dragNodeId !== null) vis.delete(dragNodeId);   /* 拖动的节点位置由鼠标控制 */
      forceStep(assocGraph.nodes, vis, assocGraph.edges, temp, damp,
        dragNodeId !== null ? dragGroup : null);
      var els = ASSOC_WORLD.querySelectorAll('.assoc__node, .assoc__root');
      Array.prototype.forEach.call(els, function (el, i) {
        var n = assocGraph.nodes[i];
        if (n) el.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)';
      });
      drawEdges();
      simRAF = requestAnimationFrame(tick);
    }
    simRAF = requestAnimationFrame(tick);
  }

  /* ── 渲染：world 内重建节点（隐藏的收起），位置由力导向接管 ── */
  function renderGraph() {
    if (!assocGraph) return;
    ASSOC_WORLD.style.width = WORLD_W + 'px';
    ASSOC_WORLD.style.height = WORLD_H + 'px';
    var vis = visibleIds();
    ASSOC_WORLD.innerHTML = '<svg class="assoc__lines"></svg>'
      + assocGraph.nodes.map(function (n) {
        var cls = n.isRoot ? 'assoc__root' : 'assoc__node';
        var extra = '';
        if (n.id === focusedId) extra += ' is-focus';
        if (n.selected) extra += ' is-selected';
        if (n.expanded) extra += ' is-expanded';
        if (!n.isRoot) {
          if (!(charWords && charWords.has(n.word))) extra += ' is-new';
          if (staged.indexOf(n.word) !== -1) extra += ' is-staged';
        }
        var store = (!n.isRoot && !(charWords && charWords.has(n.word)) && staged.indexOf(n.word) === -1)
          ? '<span class="store" title="暂存到词库">存</span>' : '';
        var tip = n.isRoot ? '根词' :
          (staged.indexOf(n.word) !== -1 ? '已暂存，导出时写入词库' :
            (charWords && charWords.has(n.word) ? '词库已有，无需暂存' : '未入库，点「存」暂存'));
        var hidden = vis.has(n.id) ? '' : ' style="display:none"';
        return '<span class="' + cls + extra + '" data-id="' + n.id + '" title="' + tip + '"' + hidden + '>'
          + n.word + store + '</span>';
      }).join('');
    Array.prototype.forEach.call(
      ASSOC_WORLD.querySelectorAll('.assoc__node, .assoc__root'),
      function (el, i) {
        var n = assocGraph.nodes[i];
        if (!n) return;
        n.w = el.offsetWidth;
        n.h = el.offsetHeight;
        el.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)';
      });
  }

  /* ── 联想调用（展开/刷新共用）── */
  function callAssociate(id) {
    var node = assocGraph.nodes[id];
    if (!node) return;
    if (!window.lingkuangAPI || !window.lingkuangAPI.associate) {
      assocStatus('联想不可用（需 Electron 环境 + Ollama 运行）');
      return;
    }
    window.lingkuangAPI.associate(node.word).then(function (res) {
      if (!res || !res.ok || !res.words) {
        node.expanded = false;
        renderGraph();
        assocStatus('联想失败：' + ((res && res.error) || '未知'));
        return;
      }
      var added = 0;
      res.words.forEach(function (w) {
        var nid;
        if (assocGraph.wordIndex[w] !== undefined) {
          nid = assocGraph.wordIndex[w];
        } else {
          nid = assocGraph.nodes.length;
          assocGraph.wordIndex[w] = nid;
          assocGraph.nodes.push({
            id: nid, word: w, isRoot: false, parent: id, children: [], expanded: false,
            x: node.x + (Math.random() - 0.5) * 180,
            y: node.y + (Math.random() - 0.5) * 180,
            vx: 0, vy: 0
          });
          node.children.push(nid);
          added++;
        }
        if (nid !== id) {
          var dup = assocGraph.edges.some(function (e) { return e.from === id && e.to === nid; });
          if (!dup) assocGraph.edges.push({ from: id, to: nid });
        }
      });
      renderGraph();
      assocStatus('「' + node.word + '」联想 ' + added + ' 词 · 点子词进入 / 点上级返回 / 再点焦点刷新');
    }).catch(function () {
      node.expanded = false;
      renderGraph();
      assocStatus('联想调用失败');
    });
  }

  function expandNode(id) {
    var node = assocGraph && assocGraph.nodes[id];
    if (!node || node.expanded) return;
    node.expanded = true;
    renderGraph();
    assocStatus('展开「' + node.word + '」的联想…');
    callAssociate(id);
  }

  /* 移除节点的子树（自身保留）——skipSelected 时跳过已选中的支线（刷新保留） */
  function removeSubtree(id, skipSelected) {
    var node = assocGraph.nodes[id];
    if (!node) return;
    var toRemove = new Set();
    node.children.slice().forEach(function (cid) {
      (function collect(nid) {
        var n = assocGraph.nodes[nid];
        if (!n || toRemove.has(nid)) return;
        if (skipSelected && n.selected) return;   /* 选中的支线保留 */
        n.children.slice().forEach(collect);
        toRemove.add(nid);
      })(cid);
    });
    node.children = node.children.filter(function (c) { return !toRemove.has(c); });
    node.focusChildId = null;
    if (!toRemove.size) return;
    assocGraph.edges = assocGraph.edges.filter(function (e) {
      return !toRemove.has(e.from) && !toRemove.has(e.to);
    });
    /* 保留节点按原顺序重排，id 重新连续（= 下标），children/parent/边/wordIndex/focusChildId 全量重映射 */
    var keep = assocGraph.nodes.filter(function (n) { return !toRemove.has(n.id); });
    var idMap = {};
    keep.forEach(function (n, i) { idMap[n.id] = i; });
    keep.forEach(function (n) { n.id = idMap[n.id]; });
    assocGraph.nodes = keep;
    assocGraph.wordIndex = {};
    assocGraph.nodes.forEach(function (n) {
      n.children = n.children.filter(function (c) { return !toRemove.has(c); })
        .map(function (c) { return idMap[c]; });
      n.parent = n.parent === null ? null : idMap[n.parent];
      if (n.focusChildId !== null && n.focusChildId !== undefined) {
        n.focusChildId = idMap[n.focusChildId] !== undefined ? idMap[n.focusChildId] : null;
      }
      assocGraph.wordIndex[n.word] = n.id;
    });
    assocGraph.edges = assocGraph.edges.map(function (e) {
      return { from: idMap[e.from], to: idMap[e.to] };
    });
    if (focusedId !== undefined && idMap[focusedId] !== undefined) focusedId = idMap[focusedId];
  }

  /* 再点焦点 → 刷新（保留选中支线，替换未选中子层） */
  function refreshNode(id) {
    var node = assocGraph && assocGraph.nodes[id];
    if (!node) return;
    removeSubtree(id, true);
    node.expanded = true;
    renderGraph();
    assocStatus('刷新「' + node.word + '」的联想…');
    callAssociate(id);
  }

  /* 初始化：从输入词开始一张新图（自动展开根词一层，根居中） */
  function initAssoc(word) {
    stopSim();
    word = (word || '').trim();
    if (!word) { assocStatus('输入一个词'); return; }
    ASSOC_INPUT.value = word;
    assocGraph = {
      nodes: [{ id: 0, word: word, isRoot: true, parent: null, children: [], expanded: false, x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0 }],
      edges: [],
      wordIndex: {}
    };
    assocGraph.wordIndex[word] = 0;
    focusedId = 0;
    renderGraph();
    var rect = ASSOC_STAGE.getBoundingClientRect();
    assocPanX = (rect.width ? rect.width / 2 : 400) - WORLD_W / 2;
    assocPanY = (rect.height ? rect.height / 2 : 300) - WORLD_H / 2;
    assocZoom = 1;
    applyWorldTransform();
    startSim();
    expandNode(0);
  }

  ASSOC_GO.addEventListener('click', function () { initAssoc(ASSOC_INPUT.value); });
  ASSOC_INPUT.addEventListener('keydown', function (e) { if (e.key === 'Enter') initAssoc(ASSOC_INPUT.value); });

  /* 点生成器里的词条值 → 以该词开始联想图 */
  CHAR_RESULT.addEventListener('click', function (e) {
    var val = e.target.closest('.char__val');
    if (val) initAssoc(val.textContent);
  });

  /* 画布内：节点点击状态机；「存」= 暂存 */
  ASSOC_STAGE.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }   /* 刚拖过节点，忽略本次点击 */
    var storeBtn = e.target.closest('.store');
    if (storeBtn) {
      e.stopPropagation();
      e.preventDefault();
      var node = storeBtn.closest('.assoc__node');
      var n = assocGraph && assocGraph.nodes[parseInt(node.dataset.id, 10)];
      var w = n ? n.word : '';
      if (w && staged.indexOf(w) === -1) {
        staged.push(w);
        persistStaged();
        updateExportBtn();
        renderGraph();
        assocStatus('已暂存「' + w + '」(' + staged.length + ') · 虚线词可继续存，点「导出暂存词」写入词库');
      } else if (w) {
        assocStatus('「' + w + '」已在暂存列表');
      }
      return;
    }
    var node = e.target.closest('.assoc__node');
    if (node) onNodeClick(parseInt(node.dataset.id, 10));
    var root = e.target.closest('.assoc__root');
    if (root) onNodeClick(0);
  });

  /* 导出暂存词：Ollama 批量分类 → 合并进词库 → 写回文件 */
  function exportStaged() {
    if (!staged.length) return;
    if (!charLib) { assocStatus('词库未加载'); return; }
    if (!window.lingkuangAPI || !window.lingkuangAPI.classifyWords || !window.lingkuangAPI.saveCharLib) {
      assocStatus('导出不可用（需 Electron 环境 + Ollama 运行）');
      return;
    }
    assocStatus('正在分类 ' + staged.length + ' 个暂存词…');
    ASSOC_EXPORT.textContent = '分类中…';
    ASSOC_EXPORT.disabled = true;
    window.lingkuangAPI.classifyWords(staged).then(function (res) {
      if (!res || !res.ok) {
        assocStatus('分类失败：' + ((res && res.error) || '未知'));
        updateExportBtn();
        return;
      }
      var map = res.map || {};
      var added = 0, fallback = 0;
      staged.forEach(function (w) {
        if (charWords && charWords.has(w)) return;
        var cat = map[w];
        if (!cat || !charLib[cat]) { cat = '主题意象'; fallback++; }
        if (charLib[cat].indexOf(w) === -1) {
          charLib[cat].push(w);
          added++;
        }
      });
      if (!added) {
        assocStatus('暂存词都已在词库中');
        staged = [];
        persistStaged();
        updateExportBtn();
        renderGraph();
        return;
      }
      window.lingkuangAPI.saveCharLib(charLib).then(function (sr) {
        if (sr && sr.ok) {
          buildCharWords();
          staged = [];
          persistStaged();
          updateExportBtn();
          renderGraph();
          assocStatus('已导入 ' + added + ' 个词到词库' + (fallback ? '（' + fallback + ' 个进「主题意象」）' : ''));
        } else {
          assocStatus('写词库失败：' + ((sr && sr.error) || '未知'));
          updateExportBtn();
        }
      });
    }).catch(function () {
      assocStatus('分类调用失败');
      updateExportBtn();
    });
  }
  ASSOC_EXPORT.addEventListener('click', exportStaged);
  updateExportBtn();
})();
