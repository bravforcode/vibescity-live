/**
 * Build the control panel UI — toggles, theme, tier, bulk actions.
 * @param {import('../effects/registry.js').EffectsRegistry} reg
 */
export function createControls(reg) {
  const root = document.getElementById('controls');
  if (!root) return;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'controls-header';
  const h2 = document.createElement('h2');
  h2.textContent = 'VibeCity FX';
  const sub = document.createElement('p');
  sub.textContent = 'Cyberpunk Map Effects';
  header.append(h2, sub);
  root.appendChild(header);

  // ── Theme + Tier row ──
  const row1 = document.createElement('div');
  row1.className = 'controls-row';

  const themeBtn = document.createElement('button');
  themeBtn.className = 'btn';
  themeBtn.textContent = reg.ctx.theme === 'night' ? 'Night' : 'Day';

  themeBtn.onclick = () => {
    const isNight = reg.ctx.theme === 'night';
    const next = isNight ? 'day' : 'night';
    const prev = [...reg.enabled];
    reg.disableAll();
    reg.ctx.theme = next;

    const map = reg.ctx.map;
    map.setStyle(`mapbox://styles/mapbox/${next === 'night' ? 'dark' : 'light'}-v11`);
    map.once('style.load', () => {
      prev.forEach(id => reg.enable(id));
      syncToggles();
    });
    themeBtn.textContent = next === 'night' ? 'Night' : 'Day';
  };

  const tierSel = document.createElement('select');
  tierSel.className = 'btn';
  ['low', 'mid', 'high'].forEach(t => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t.toUpperCase();
    if (t === reg.ctx.deviceTier) o.selected = true;
    tierSel.appendChild(o);
  });
  tierSel.onchange = () => reg.setDeviceTier(tierSel.value);

  row1.append(themeBtn, tierSel);
  root.appendChild(row1);

  // ── Bulk actions ──
  const row2 = document.createElement('div');
  row2.className = 'controls-row';

  const allOn = document.createElement('button');
  allOn.className = 'btn';
  allOn.textContent = 'Enable All';
  allOn.onclick = () => { reg.enableAll(); syncToggles(); };

  const allOff = document.createElement('button');
  allOff.className = 'btn';
  allOff.textContent = 'Disable All';
  allOff.onclick = () => { reg.disableAll(); syncToggles(); };

  row2.append(allOn, allOff);
  root.appendChild(row2);

  // ── Effect toggles grouped by category ──
  const groups = {};
  reg.effects.forEach(fx => {
    (groups[fx.group] ??= []).push(fx);
  });

  const toggleMap = {};

  Object.entries(groups).forEach(([group, effects]) => {
    const sec = document.createElement('div');
    sec.className = 'effect-group';
    const h3 = document.createElement('h3');
    h3.textContent = group;
    sec.appendChild(h3);

    effects.forEach(fx => {
      const label = document.createElement('label');
      label.className = 'effect-toggle';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = reg.isEnabled(fx.id);
      cb.onchange = () => {
        reg.toggle(fx.id);
        cb.checked = reg.isEnabled(fx.id);
      };

      const span = document.createElement('span');
      span.textContent = fx.name;

      label.append(cb, span);

      if (fx.heavyEffect) {
        const tag = document.createElement('span');
        tag.className = 'heavy';
        tag.textContent = ' [heavy]';
        label.appendChild(tag);
      }

      sec.appendChild(label);
      toggleMap[fx.id] = cb;
    });

    root.appendChild(sec);
  });

  function syncToggles() {
    Object.entries(toggleMap).forEach(([id, cb]) => {
      cb.checked = reg.isEnabled(id);
    });
  }
}
