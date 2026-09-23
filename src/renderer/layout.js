'use strict';

/**
 * 画布引擎
 *
 * 设计要点
 *  - 实例无边框、无标题栏，就是一块画面；实例之间留 1px 缝，露出画布底色区分彼此。
 *  - 坐标一律用相对画布的归一化值 0..1；渲染时用 calc() 把缝算进去。
 *  - 拖动/缩放做碰撞消解（最小平移向量），保证实例永不重叠遮挡。
 *  - 拖动把手是「悬停气泡」本身 —— 画面被 webview 占满，鼠标事件到不了宿主。
 *  - 分区模式：把画布 N 等分，选中一格后本实例移入，其余实例按序填入剩余格。
 */
const LayoutEngine = (() => {
  const GAP = 1;          // 每边留缝，两实例之间即 2px
  const MIN_W = 0.16;     // 归一化最小宽
  const MIN_H = 0.16;
  const SNAP_PX = 8;      // 吸附阈值
  const MAX_CANVAS = 9;   // 画布舒适容量上限

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** 分区划分 */
  function zoneRects(count) {
    if (count === 2) {
      return [
        { x: 0, y: 0, w: 0.5, h: 1 },
        { x: 0.5, y: 0, w: 0.5, h: 1 },
      ];
    }
    if (count === 3) {
      const t = 1 / 3;
      return [
        { x: 0, y: 0, w: t, h: 1 },
        { x: t, y: 0, w: t, h: 1 },
        { x: 2 * t, y: 0, w: t, h: 1 },
      ];
    }
    if (count === 4) {
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    }
    return [];
  }

  function snapDelta(candidates, targets, threshold) {
    let best = null;
    for (const c of candidates) {
      for (const t of targets) {
        const d = t - c;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) {
          best = { d, line: t };
        }
      }
    }
    return best;
  }

  class Layout {
    constructor(opts) {
      this.stage = opts.stage;
      this.guides = opts.guides;
      this.shield = opts.shield;
      this.zoneLayer = opts.zoneLayer;

      this.onChanged = opts.onChanged || (() => {});
      this.onActivate = opts.onActivate || (() => {});
      this.onCollapse = opts.onCollapse || (() => {});
      this.onZoneModeChange = opts.onZoneModeChange || (() => {});

      this.items = new Map();
      this.activeId = null;
      this._skipId = null;
      this._dragging = false;
      this.zone = null;
    }

    // -------------------------------------------------- 几何

    stageSize() {
      const r = this.stage.getBoundingClientRect();
      return { w: r.width || 1, h: r.height || 1 };
    }

    /** 某实例相对画布的像素矩形 */
    paneRect(id) {
      const it = this.items.get(id);
      if (!it) return null;
      const s = this.stage.getBoundingClientRect();
      const r = it.el.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
    }

    /** 把归一化矩形写成带缝的样式 */
    setRect(id, rect, { animate = true } = {}) {
      const it = this.items.get(id);
      if (!it) return;

      const x = clamp(rect.x, 0, 1 - MIN_W);
      const y = clamp(rect.y, 0, 1 - MIN_H);
      const w = clamp(rect.w, MIN_W, 1 - x);
      const h = clamp(rect.h, MIN_H, 1 - y);

      Object.assign(it.model, { x, y, w, h });

      const el = it.el;
      if (animate && !this._dragging) {
        el.style.transition =
          'left .22s cubic-bezier(.2,.7,.3,1), top .22s cubic-bezier(.2,.7,.3,1), ' +
          'width .22s cubic-bezier(.2,.7,.3,1), height .22s cubic-bezier(.2,.7,.3,1)';
        clearTimeout(it._tTimer);
        it._tTimer = setTimeout(() => {
          el.style.transition = '';
        }, 280);
      } else {
        el.style.transition = 'none';
      }

      el.style.left = `calc(${x * 100}% + ${GAP}px)`;
      el.style.top = `calc(${y * 100}% + ${GAP}px)`;
      el.style.width = `calc(${w * 100}% - ${GAP * 2}px)`;
      el.style.height = `calc(${h * 100}% - ${GAP * 2}px)`;
    }

    // -------------------------------------------------- 增删

    create(model) {
      const el = document.createElement('section');
      el.className = 'pane';
      el.dataset.id = model.id;

      // resize 热区（贴边，平时不可见）
      for (const dir of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']) {
        const h = document.createElement('div');
        h.className = `rz rz-${dir}`;
        h.dataset.dir = dir;
        h.addEventListener('mousedown', (e) => this._startResize(el.dataset.id, dir, e));
        el.append(h);
      }

      el.addEventListener('mousedown', () => this.activate(model.id), true);
      this.stage.append(el);

      const item = { model, el };
      this.items.set(model.id, item);
      this.setRect(model.id, model, { animate: false });
      this.activate(model.id);
      return item;
    }

    destroy(id) {
      const it = this.items.get(id);
      if (!it) return;
      it.el.remove();
      this.items.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
        const next = [...this.items.keys()].pop();
        if (next) this.activate(next);
      }
      this.onChanged(this.snapshot());
    }

    get(id) {
      return this.items.get(id) || null;
    }

    list() {
      return [...this.items.values()];
    }

    ids() {
      return [...this.items.keys()];
    }

    activate(id) {
      const it = this.items.get(id);
      if (!it) return;
      this.activeId = id;
      this.onActivate(id);
    }

    // -------------------------------------------------- 碰撞消解

    /** 其它实例占用的矩形（像素，相对画布） */
    _others(skipId) {
      const out = [];
      for (const it of this.items.values()) {
        if (it.model.id === skipId) continue;
        const r = this.paneRect(it.model.id);
        if (r) out.push(r);
      }
      return out;
    }

    /** 最小平移向量推出：迭代几轮，处理被推入另一个实例的情况 */
    _resolve(rect, skipId) {
      const s = this.stageSize();
      let { x, y, w, h } = rect;
      const others = this._others(skipId);

      for (let pass = 0; pass < 6; pass += 1) {
        let moved = false;
        for (const o of others) {
          const ovx = Math.min(x + w, o.x + o.w) - Math.max(x, o.x);
          const ovy = Math.min(y + h, o.y + o.h) - Math.max(y, o.y);
          if (ovx <= 0 || ovy <= 0) continue;

          if (ovx <= ovy) {
            x += x + w / 2 < o.x + o.w / 2 ? -ovx : ovx;
          } else {
            y += y + h / 2 < o.y + o.h / 2 ? -ovy : ovy;
          }
          moved = true;
        }
        if (!moved) break;
      }

      x = clamp(x, 0, Math.max(0, s.w - w));
      y = clamp(y, 0, Math.max(0, s.h - h));
      return { x, y };
    }

    /** 是否与任何其它实例重叠 */
    _overlaps(rect, skipId) {
      for (const o of this._others(skipId)) {
        const ovx = Math.min(rect.x + rect.w, o.x + o.w) - Math.max(rect.x, o.x);
        const ovy = Math.min(rect.y + rect.h, o.y + o.h) - Math.max(rect.y, o.y);
        if (ovx > 0.5 && ovy > 0.5) return true;
      }
      return false;
    }

    // -------------------------------------------------- 拖动（把手 = 气泡）

    startDrag(id, ev) {
      const it = this.items.get(id);
      if (!it) return;
      ev.preventDefault();
      this.activate(id);

      const sRect = this.stage.getBoundingClientRect();
      const pRect = it.el.getBoundingClientRect();
      const startLeft = pRect.left - sRect.left;
      const startTop = pRect.top - sRect.top;
      const startX = ev.clientX;
      const startY = ev.clientY;
      const W = sRect.width || 1;
      const H = sRect.height || 1;
      const w = pRect.width;
      const h = pRect.height;

      this._skipId = id;
      this._dragging = true;
      it.el.classList.add('dragging');
      this._lock();

      const onMove = (e) => {
        const rawX = startLeft + (e.clientX - startX);
        const rawY = startTop + (e.clientY - startY);
        const solved = this._resolve({ x: rawX, y: rawY, w, h }, id);

        const targets = this._snapTargets(id);
        let gx = null;
        let gy = null;
        const sv = snapDelta([solved.x, solved.x + w / 2, solved.x + w], targets.vs, SNAP_PX);
        if (sv) {
          solved.x = clamp(solved.x + sv.d, 0, Math.max(0, W - w));
          gx = sv.line;
        }
        const sh = snapDelta([solved.y, solved.y + h / 2, solved.y + h], targets.hs, SNAP_PX);
        if (sh) {
          solved.y = clamp(solved.y + sh.d, 0, Math.max(0, H - h));
          gy = sh.line;
        }
        this._drawGuides(gx, gy);

        it.el.style.transition = 'none';
        it.el.style.left = solved.x + 'px';
        it.el.style.top = solved.y + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        it.el.classList.remove('dragging');
        this._clearGuides();
        this._unlock();
        this._skipId = null;
        this._dragging = false;

        const r = it.el.getBoundingClientRect();
        this.setRect(id, {
          x: (r.left - sRect.left) / W,
          y: (r.top - sRect.top) / H,
          w: r.width / W,
          h: r.height / H,
        }, { animate: false });
        this.onChanged(this.snapshot());
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    // -------------------------------------------------- 缩放

    _startResize(id, dir, ev) {
      const it = this.items.get(id);
      if (!it) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.activate(id);

      const sRect = this.stage.getBoundingClientRect();
      const pRect = it.el.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const L0 = pRect.left - sRect.left;
      const T0 = pRect.top - sRect.top;
      const R0 = L0 + pRect.width;
      const B0 = T0 + pRect.height;
      const W = sRect.width || 1;
      const H = sRect.height || 1;
      const minW = MIN_W * W;
      const minH = MIN_H * H;

      const west = dir.includes('w');
      const east = dir.includes('e');
      const north = dir.includes('n');
      const south = dir.includes('s');

      this._skipId = id;
      this._dragging = true;
      it.el.classList.add('resizing');
      this._lock();

      let last = { L: L0, T: T0, R: R0, B: B0 };
      let blocked = false;

      const onMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let L = L0;
        let T = T0;
        let R = R0;
        let B = B0;

        if (west) L = clamp(L0 + dx, 0, R0 - minW);
        if (east) R = clamp(R0 + dx, L0 + minW, W);
        if (north) T = clamp(T0 + dy, 0, B0 - minH);
        if (south) B = clamp(B0 + dy, T0 + minH, H);

        const cand = { x: L, y: T, w: R - L, h: B - T };
        if (this._overlaps(cand, id)) {
          blocked = true;
        } else {
          blocked = false;
          last = { L, T, R, B };
        }

        it.el.style.transition = 'none';
        it.el.style.left = last.L + 'px';
        it.el.style.top = last.T + 'px';
        it.el.style.width = last.R - last.L + 'px';
        it.el.style.height = last.B - last.T + 'px';
        it.el.classList.toggle('blocked', blocked);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        it.el.classList.remove('resizing', 'blocked');
        this._unlock();
        this._skipId = null;
        this._dragging = false;

        const r = it.el.getBoundingClientRect();
        this.setRect(id, {
          x: (r.left - sRect.left) / W,
          y: (r.top - sRect.top) / H,
          w: r.width / W,
          h: r.height / H,
        }, { animate: false });
        this.onChanged(this.snapshot());
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    // -------------------------------------------------- 吸附辅助线

    _snapTargets(skipId) {
      const { w, h } = this.stageSize();
      const vs = [0, w / 2, w];
      const hs = [0, h / 2, h];
      for (const o of this._others(skipId)) {
        vs.push(o.x, o.x + o.w / 2, o.x + o.w);
        hs.push(o.y, o.y + o.h / 2, o.y + o.h);
      }
      return { vs, hs };
    }

    _drawGuides(vx, hy) {
      this.guides.innerHTML = '';
      if (vx != null) {
        const g = document.createElement('div');
        g.className = 'guide guide-v';
        g.style.left = vx + 'px';
        this.guides.append(g);
      }
      if (hy != null) {
        const g = document.createElement('div');
        g.className = 'guide guide-h';
        g.style.top = hy + 'px';
        this.guides.append(g);
      }
    }

    _clearGuides() {
      this.guides.innerHTML = '';
    }

    _lock() {
      this.shield.hidden = false;
      for (const it of this.items.values()) it.el.classList.add('no-pointer');
    }

    _unlock() {
      this.shield.hidden = true;
      for (const it of this.items.values()) it.el.classList.remove('no-pointer');
    }

    // -------------------------------------------------- 排布

    /** 网格平铺：列数取最接近正方的那组 */
    tileAll() {
      const list = this.list();
      const n = list.length;
      if (!n) return;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      list.forEach((it, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const inRow = Math.min(cols, n - r * cols);
        this.setRect(it.model.id, { x: c / inRow, y: r / rows, w: 1 / inRow, h: 1 / rows });
      });
      this.onChanged(this.snapshot());

      // 格子小到没法用时得说一声 —— 否则用户只会觉得「画面糊成一团」，
      // 却不知道这是平铺装不下，而不是软件坏了。
      const s = this.stageSize();
      if (this.onCramped) {
        this.onCramped({ cols, rows, w: s.w / cols, h: s.h / rows, n });
      }
    }

    /** 让新实例落在不重叠的空位上 */
    placeNew(id) {
      const list = this.list();
      const n = list.length;
      if (n <= 1) return;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const idx = n - 1;
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const inRow = Math.min(cols, n - r * cols);
      this.setRect(id, { x: c / inRow, y: r / rows, w: 1 / inRow, h: 1 / rows });
    }

    fillPane(id, mode) {
      const map = {
        fill: { x: 0, y: 0, w: 1, h: 1 },
        left: { x: 0, y: 0, w: 0.5, h: 1 },
        right: { x: 0.5, y: 0, w: 0.5, h: 1 },
        top: { x: 0, y: 0, w: 1, h: 0.5 },
        bottom: { x: 0, y: 0.5, w: 1, h: 0.5 },
      };
      const rect = map[mode];
      if (!rect) return;
      this.setRect(id, rect);
      this.onChanged(this.snapshot());
    }

    capacity() {
      return MAX_CANVAS;
    }

    /** 看看再加一个会不会挤爆 */
    isCrowded() {
      return this.items.size >= MAX_CANVAS;
    }

    // -------------------------------------------------- 分区模式

    get zoneMode() {
      return this.zone;
    }

    enterZones(paneId, count) {
      const rects = zoneRects(count);
      if (!rects.length) return;
      if (!this.items.has(paneId)) return;

      this.zone = { paneId, count, rects };
      const layer = this.zoneLayer;
      layer.innerHTML = '';
      layer.hidden = false;

      const glow = document.createElement('div');
      glow.className = 'zone-glow';
      layer.append(glow);

      const tip = document.createElement('div');
      tip.className = 'zone-tip';
      tip.textContent = `${t('zone.hint')} · ${t('zone.cancel')}`;
      layer.append(tip);

      rects.forEach((r, i) => {
        const z = document.createElement('button');
        z.className = 'zone';
        z.style.left = r.x * 100 + '%';
        z.style.top = r.y * 100 + '%';
        z.style.width = r.w * 100 + '%';
        z.style.height = r.h * 100 + '%';
        z.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyZone(i);
        });
        layer.append(z);
      });

      // 点空白处退出
      this._zoneHandler = (e) => {
        if (!layer.contains(e.target)) this.exitZones();
      };
      setTimeout(() => document.addEventListener('mousedown', this._zoneHandler), 0);

      this.onZoneModeChange(this.zone);
    }

    exitZones() {
      if (!this.zone) return;
      this.zone = null;
      this.zoneLayer.hidden = true;
      this.zoneLayer.innerHTML = '';
      if (this._zoneHandler) {
        document.removeEventListener('mousedown', this._zoneHandler);
        this._zoneHandler = null;
      }
      this.onZoneModeChange(null);
    }

    /**
     * 把 paneId 放进第 index 个分区，其余实例按序填入剩余分区；
     * 装不下的回调 onCollapse 交给上层收起。
     */
    applyZone(index) {
      const z = this.zone;
      if (!z) return;
      const rects = z.rects;
      if (index < 0 || index >= rects.length) return;

      const order = [z.paneId, ...this.ids().filter((id) => id !== z.paneId)];
      const collapsed = [];

      // 目标实例先占住选中的那块
      this.setRect(order[0], rects[index]);

      const rest = rects.map((_, i) => i).filter((i) => i !== index);
      for (let k = 1; k < order.length; k += 1) {
        const slot = rest[k - 1];
        if (slot === undefined) {
          collapsed.push(order[k]);
          continue;
        }
        this.setRect(order[k], rects[slot]);
      }

      this.exitZones();
      this.onChanged(this.snapshot());

      if (collapsed.length) this.onCollapse(collapsed);
    }

    /** 铺满：其余实例全部收起 */
    fillAndCollapseOthers(id) {
      const others = this.ids().filter((x) => x !== id);
      this.setRect(id, { x: 0, y: 0, w: 1, h: 1 });
      this.onChanged(this.snapshot());
      if (others.length) this.onCollapse(others);
    }

    // -------------------------------------------------- 序列化

    snapshot() {
      return this.list().map((it) => ({
        id: it.model.id,
        instanceId: it.model.instanceId,
        title: it.model.title,
        url: it.model.url,
        partition: it.model.partition,
        x: it.model.x,
        y: it.model.y,
        w: it.model.w,
        h: it.model.h,
      }));
    }
  }

  return { Layout, zoneRects, MIN_W, MIN_H };
})();
