// ── RAF Manager — single loop for all animations ──

export class RAFManager {
  #cbs = new Map();
  #rid = 0;
  #running = false;

  add(id, fn) {
    this.#cbs.set(id, fn);
    if (!this.#running) this.#start();
  }

  remove(id) {
    this.#cbs.delete(id);
    if (this.#cbs.size === 0) this.#stop();
  }

  #start() {
    this.#running = true;
    const loop = (t) => {
      if (!this.#running) return;
      for (const fn of this.#cbs.values()) fn(t);
      this.#rid = requestAnimationFrame(loop);
    };
    this.#rid = requestAnimationFrame(loop);
  }

  #stop() {
    this.#running = false;
    cancelAnimationFrame(this.#rid);
  }

  destroy() { this.#stop(); this.#cbs.clear(); }
}

// ── Effects Registry ──

export class EffectsRegistry {
  #effects = new Map();
  #enabled = new Set();
  #ctx;

  constructor(map, opts = {}) {
    this.#ctx = {
      map,
      theme: opts.theme ?? 'night',
      rafManager: new RAFManager(),
      audioCtx: null,
      debug: opts.debug ?? false,
      deviceTier: opts.deviceTier ?? 'mid',
    };
  }

  get ctx() { return this.#ctx; }
  get effects() { return [...this.#effects.values()]; }
  get enabled() { return this.#enabled; }

  register(effect) { this.#effects.set(effect.id, effect); }

  registerAll(effects) { effects.forEach(e => this.register(e)); }

  enable(id) {
    const fx = this.#effects.get(id);
    if (!fx || this.#enabled.has(id)) return false;
    if (fx.heavyEffect && this.#ctx.deviceTier === 'low') {
      console.warn(`[VibeCity] Skipping heavy "${fx.name}" on low-tier`);
      return false;
    }
    try {
      fx.enable(this.#ctx.map, this.#ctx);
      this.#enabled.add(id);
      if (this.#ctx.debug) console.log(`[VibeCity] ✓ ${fx.name}`);
      return true;
    } catch (err) {
      console.error(`[VibeCity] ✗ ${fx.name}:`, err);
      return false;
    }
  }

  disable(id) {
    const fx = this.#effects.get(id);
    if (!fx || !this.#enabled.has(id)) return false;
    try {
      fx.disable(this.#ctx.map, this.#ctx);
      this.#enabled.delete(id);
      return true;
    } catch (err) {
      console.error(`[VibeCity] disable ${fx.name}:`, err);
      return false;
    }
  }

  toggle(id) { return this.#enabled.has(id) ? this.disable(id) : this.enable(id); }
  isEnabled(id) { return this.#enabled.has(id); }

  enableAll() { for (const [id] of this.#effects) this.enable(id); }

  disableAll() { for (const id of [...this.#enabled]) this.disable(id); }

  setTheme(theme) {
    this.#ctx.theme = theme;
    // re-apply active effects for new theme
    const active = [...this.#enabled];
    active.forEach(id => { this.disable(id); this.enable(id); });
  }

  setDeviceTier(tier) { this.#ctx.deviceTier = tier; }

  selfCheck() {
    const rows = [];
    for (const [id, fx] of this.#effects) {
      rows.push({
        id,
        name: fx.name,
        group: fx.group,
        enabled: this.#enabled.has(id),
        heavy: !!fx.heavyEffect,
      });
    }
    console.log('[VibeCity] Self-check:');
    console.table(rows);
    return rows;
  }

  destroy() {
    this.disableAll();
    this.#ctx.rafManager.destroy();
    if (this.#ctx.audioCtx) this.#ctx.audioCtx.close().catch(() => {});
  }
}
