import L from "leaflet";

export class TrafficPolylineLayer extends L.Layer {
  constructor(routesLatLngs = [], options = {}) {
    super();
    this._routes = routesLatLngs;
    this.options = {
      vehicleCount: 70,
      speedMin: 18,
      speedMax: 42,
      headlightAlpha: 0.75,
      taillightAlpha: 0.65,
      headlightRadius: 2.2,
      taillightRadius: 2.2,
      glowRadius: 7,
      densityByZoom: true,
      minZoom: 13,
      maxZoom: 18,
      ...options,
    };

    this._map = null;
    this._canvas = null;
    this._ctx = null;
    this._anim = null;
    this._routeMeta = [];
    this._vehicles = [];
    this._lastT = 0;

    this._reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

   setOptions(next = {}) {
    this.options = { ...(this.options || {}), ...next };

    // ถ้า route meta ยังไม่พร้อม ก็ไม่ต้องทำต่อ
    if (!this._map) return;

    // ถ้าเปลี่ยนจำนวนรถ/ density policy -> reseed
    const reseedKeys = ["vehicleCount", "densityByZoom", "minZoom", "maxZoom"];
    const needReseed = reseedKeys.some((k) => k in next);

    // ถ้าเปลี่ยนช่วงความเร็ว -> apply ให้รถเดิมทันที
    const speedChanged = ("speedMin" in next) || ("speedMax" in next);

    if (needReseed) {
      this._reseedVehicles();
    } else if (speedChanged) {
      this._applySpeedRange();
    }

    this._draw(0);
  }

  _reseedVehicles() {
    this._seedVehicles();
  }

  _applySpeedRange() {
    // อัปเดต speed ของรถเดิมให้เข้าช่วงใหม่แบบสุ่ม
    const rand = (a, b) => a + Math.random() * (b - a);
    const a = this.options.speedMin;
    const b = this.options.speedMax;
    for (const v of this._vehicles || []) {
      v.speed = rand(a, b);
    }
  }



  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-traffic-canvas");
    this._canvas.style.position = "absolute";
    this._canvas.style.top = "0";
    this._canvas.style.left = "0";
    this._canvas.style.pointerEvents = "none";
this._canvas.style.zIndex = "1200";

    map.getPanes().overlayPane.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");

    this._handleResize();
    map.on("move zoom resize", this._handleResize, this);

    this._buildRouteMeta();
    this._seedVehicles();

    if (!this._reducedMotion) this._start();
    else this._draw(0);
  }

  onRemove(map) {
    map.off("move zoom resize", this._handleResize, this);
    this._stop();
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._ctx = null;
    this._map = null;
    this._routeMeta = [];
    this._vehicles = [];
  }

  setRoutes(routesLatLngs) {
    this._routes = routesLatLngs || [];
    this._buildRouteMeta();
    this._seedVehicles();
    this._draw(0);
  }

  setEnabled(enabled) {
    if (!this._map) return;
    if (!enabled) {
      this._stop();
      this._clear();
    } else {
      if (!this._reducedMotion) this._start();
      else this._draw(0);
    }
  }

  _handleResize() {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const ratio = window.devicePixelRatio || 1;

    this._canvas.width = size.x * ratio;
    this._canvas.height = size.y * ratio;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    this._ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    this._draw(0);
  }

  _buildRouteMeta() {
    if (!this._map) return;
    this._routeMeta = [];

    const routes = (this._routes || []).filter(r => Array.isArray(r) && r.length >= 2);

    for (const latlngs of routes) {
      const cum = [0];
      let total = 0;
      for (let i = 1; i < latlngs.length; i++) {
        const d = this._map.distance(latlngs[i - 1], latlngs[i]);
        total += d;
        cum.push(total);
      }
      if (total > 10) this._routeMeta.push({ latlngs, cumMeters: cum, totalMeters: total });
    }
  }

  _seedVehicles() {
    const routes = this._routeMeta;
    if (!routes.length) { this._vehicles = []; return; }

    let count = this.options.vehicleCount;
    if (this.options.densityByZoom && this._map) {
      const z = this._map.getZoom();
      if (z <= this.options.minZoom) count = Math.floor(count * 0.45);
      else if (z <= this.options.minZoom + 1) count = Math.floor(count * 0.65);
      else if (z >= this.options.maxZoom) count = Math.floor(count * 1.1);
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    this._vehicles = Array.from({ length: count }, (_, i) => {
      const routeIdx = Math.floor(Math.random() * routes.length);
      const route = routes[routeIdx];
      return {
        routeIdx,
        meters: Math.random() * route.totalMeters,
        speed: rand(this.options.speedMin, this.options.speedMax),
        dir: Math.random() > 0.5 ? 1 : -1,
        kind: i % 3 === 0 ? "tail" : "head",
      };
    });

    this._lastT = performance.now();
  }

  _start() {
    this._stop();
    this._lastT = performance.now();
    const tick = (t) => {
      this._anim = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - this._lastT) / 1000);
      this._lastT = t;
      this._draw(dt);
    };
    this._anim = requestAnimationFrame(tick);
  }

  _stop() {
    if (this._anim) cancelAnimationFrame(this._anim);
    this._anim = null;
  }

  _clear() {
    if (!this._ctx || !this._map) return;
    const size = this._map.getSize();
    this._ctx.clearRect(0, 0, size.x, size.y);
  }

  _draw(dt) {
    if (!this._ctx || !this._map) return;

    const z = this._map.getZoom();
    if (z < this.options.minZoom) { this._clear(); return; }

    if (dt > 0 && !this._reducedMotion) {
      for (const v of this._vehicles) {
        const route = this._routeMeta[v.routeIdx];
        if (!route) continue;
        v.meters += v.dir * v.speed * dt;
        if (v.meters < 0) v.meters += route.totalMeters;
        if (v.meters > route.totalMeters) v.meters -= route.totalMeters;
      }
    }

    this._clear();

    for (const v of this._vehicles) {
      const route = this._routeMeta[v.routeIdx];
      if (!route) continue;
      const p = this._interpLatLng(route, v.meters);
      if (!p) continue;
      const pt = this._map.latLngToContainerPoint(p);
      this._drawLight(pt.x, pt.y, v.kind);
    }
  }

  _interpLatLng(route, meters) {
    const { latlngs, cumMeters, totalMeters } = route;
    const m = ((meters % totalMeters) + totalMeters) % totalMeters;

    let hi = cumMeters.length - 1, lo = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumMeters[mid] < m) lo = mid + 1;
      else hi = mid;
    }

    const i = Math.max(1, lo);
    const m0 = cumMeters[i - 1], m1 = cumMeters[i];
    const t = m1 === m0 ? 0 : (m - m0) / (m1 - m0);

    const a = latlngs[i - 1], b = latlngs[i];
    return L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
  }

  _drawLight(x, y, kind) {
    const ctx = this._ctx;
    const isTail = kind === "tail";
    const r = isTail ? this.options.taillightRadius : this.options.headlightRadius;
    const alpha = isTail ? this.options.taillightAlpha : this.options.headlightAlpha;
    const glow = this.options.glowRadius;

    const color = isTail ? `rgba(239, 68, 68, ${alpha})` : `rgba(251, 191, 36, ${alpha})`;
    const glowColor = isTail ? `rgba(239, 68, 68, ${alpha * 0.35})` : `rgba(251, 191, 36, ${alpha * 0.35})`;

    ctx.beginPath(); ctx.fillStyle = glowColor; ctx.arc(x, y, glow, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}
