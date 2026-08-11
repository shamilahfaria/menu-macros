// One table, two label widths: the detail view has room to spell macros out,
// the card band does not. `primary` splits the three headline macros (shown
// beside calories) from the secondary row.
const MACROS = [
  ["Protein", "P", "proteinG", "g", true],
  ["Carbs", "C", "carbsG", "g", true],
  ["Fat", "F", "fatG", "g", true],
  ["Sodium", "Sodium", "sodiumMg", "mg", false],
  ["Sugar", "Sugar", "sugarG", "g", false],
  ["Fiber", "Fiber", "fiberG", "g", false],
];

// DoorDash's menu grid is virtualized: card wrappers are absolutely positioned
// on a fixed row pitch, so a card that grows overlaps the row below instead of
// making room. The list variant therefore renders as an overlay band anchored
// to the card photo — it takes part in no layout, so the virtualizer's
// arithmetic stays correct. Price and the base-item caveat stay off the band;
// the card already shows the price, and the caveat lives on the detail view.
const BAND_MACROS = MACROS.filter(([, , , , primary]) => primary);
const BAND_SECONDARY = MACROS.filter(([, , , , primary]) => !primary);

const DELTAS = [
  ["calories", " cal"],
  ["proteinG", "g P"],
  ["carbsG", "g C"],
  ["fatG", "g F"],
  ["sodiumMg", "mg Na"],
  ["sugarG", "g S"],
  ["fiberG", "g Fi"],
];

const STYLES = `
  :host {
    box-sizing: border-box;
    clear: both;
    color: #191919;
    display: block;
    flex: 0 0 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    grid-column: 1 / -1;
    line-height: 1.3;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }

  * {
    box-sizing: border-box;
  }

  .strip {
    border-top: 1px solid #f0f0f0;
    margin-top: 10px;
    padding-top: 9px;
  }

  .summary {
    align-items: baseline;
    display: flex;
    justify-content: space-between;
    margin-bottom: 9px;
  }

  .price {
    color: #191919;
    font-weight: 600;
  }

  .calories {
    color: #6b6b6b;
    font-variant-numeric: tabular-nums;
  }

  .macros {
    display: grid;
    gap: 8px 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* Overlay band (list variant). Anchored to the card photo, out of flow. */
  :host(.mm-band) {
    bottom: 0;
    display: block;
    left: 0;
    position: absolute;
    right: 0;
    z-index: 2;
  }

  .band {
    /* Right padding clears DoorDash's floating "+" button (32px + inset). */
    background: linear-gradient(
      to top,
      rgb(0 0 0 / 82%) 0%,
      rgb(0 0 0 / 66%) 42%,
      rgb(0 0 0 / 28%) 74%,
      rgb(0 0 0 / 0%) 100%
    );
    color: #fff;
    font-variant-numeric: tabular-nums;
    padding: 22px 52px 8px 10px;
    pointer-events: none;
    -webkit-font-smoothing: antialiased;
  }

  .band-primary {
    align-items: baseline;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .band-cal {
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.2px;
    line-height: 1.1;
  }

  .band-cal-unit {
    font-size: 10.5px;
    font-weight: 500;
    margin-left: 2px;
    opacity: 0.82;
  }

  .band-macros {
    font-size: 10.5px;
    font-weight: 550;
    letter-spacing: 0.1px;
    white-space: nowrap;
  }

  .band-macros b {
    font-weight: 650;
  }

  .band-secondary {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.15px;
    margin-top: 2px;
    opacity: 0.72;
    white-space: nowrap;
  }

  .band.unavailable {
    font-size: 11px;
    font-weight: 550;
    letter-spacing: 0.1px;
    opacity: 0.85;
    padding-bottom: 10px;
  }

  .macro-label {
    color: #9a9a9a;
    display: block;
    font-size: 10px;
    margin-bottom: 1px;
  }

  .macro-value {
    color: #191919;
    font-variant-numeric: tabular-nums;
  }

  .footer-row {
    align-items: center;
    display: flex;
    gap: 5px;
    margin-top: 9px;
    min-height: 18px;
  }

  .footer {
    color: #9a9a9a;
    font-size: 10px;
  }

  .extras {
    display: inline-flex;
    position: relative;
  }

  .extras-trigger {
    appearance: none;
    background: transparent;
    border: 0;
    color: #6b6b6b;
    cursor: help;
    font: inherit;
    line-height: 1;
    padding: 2px;
  }

  .extras-popover {
    background: #fff;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    bottom: calc(100% + 4px);
    box-shadow: 0 3px 12px rgb(0 0 0 / 10%);
    display: none;
    left: 0;
    min-width: 170px;
    padding: 8px 10px;
    position: absolute;
    z-index: 1;
  }

  .extras:hover .extras-popover,
  .extras:focus-within .extras-popover {
    display: block;
  }

  .extra {
    display: flex;
    gap: 16px;
    justify-content: space-between;
    white-space: nowrap;
  }

  .extra + .extra {
    margin-top: 4px;
  }

  .extra-label {
    color: #6b6b6b;
  }

  .extra-value {
    color: #191919;
    font-variant-numeric: tabular-nums;
  }

  .unavailable .calories,
  .unavailable .macro-value {
    color: #9a9a9a;
  }
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value, unit) {
  return Number.isFinite(value) ? `${value}${unit}` : "—";
}

export function formatMacros(item) {
  return MACROS.map(([label, , key, unit]) => ({
    label,
    value: formatValue(item?.[key], unit),
  }));
}

export function formatExtras(item) {
  return Array.isArray(item?.extras) ? item.extras : [];
}

export function shouldShowMagnifier(item) {
  return formatExtras(item).length > 0;
}

export function formatDeltaText(modifier) {
  const deltas = modifier?.deltas;
  if (!deltas || typeof deltas !== "object") return "";

  return DELTAS.flatMap(([key, suffix]) => {
    const value = deltas[key];
    if (!Number.isFinite(value)) return [];
    const sign = value > 0 ? "+" : "";
    return `${sign}${value}${suffix}`;
  }).join(" · ");
}

function renderExtras(item) {
  if (!shouldShowMagnifier(item)) return "";

  const rows = formatExtras(item).map(({ label, value }) => `
    <div class="extra">
      <span class="extra-label">${escapeHtml(label)}</span>
      <span class="extra-value">${escapeHtml(value)}</span>
    </div>
  `).join("");

  return `
    <span class="extras">
      <button class="extras-trigger" type="button" aria-label="More nutrition details">🔍</button>
      <span class="extras-popover" role="tooltip">${rows}</span>
    </span>
  `;
}

function renderMacroGrid(entries) {
  return entries.map(({ label, value }) => `
    <div class="macro">
      <span class="macro-label">${label}</span>
      <span class="macro-value">${value}</span>
    </div>
  `).join("");
}

function renderBandRow(entries, item, { bold } = {}) {
  return entries
    .map(([, short, key, unit]) => {
      const value = formatValue(item[key], unit);
      return `${short} ${bold ? `<b>${value}</b>` : value}`;
    })
    .join(" · ");
}

function renderListStrip(item) {
  if (item == null) {
    return `<div class="band unavailable">Nutrition unavailable</div>`;
  }

  return `
    <div class="band">
      <div class="band-primary">
        <span class="band-cal">${formatValue(item.calories, "")}<span class="band-cal-unit">cal</span></span>
        <span class="band-macros">${renderBandRow(BAND_MACROS, item, { bold: true })}</span>
      </div>
      <div class="band-secondary">${renderBandRow(BAND_SECONDARY, item)}</div>
    </div>
  `;
}

function renderDetailStrip(item, priceText) {
  const macros = renderMacroGrid(formatMacros(item));
  const calories = item == null ? "—" : formatValue(item.calories, "");
  const footer = item == null
    ? "Nutrition unavailable"
    : "Base item · excludes customizations";

  return `
    <div class="strip${item == null ? " unavailable" : ""}">
      <div class="summary">
        <span class="price">${escapeHtml(priceText)}</span>
        <span class="calories">${calories}${item == null ? "" : " cal"}</span>
      </div>
      <div class="macros">${macros}</div>
      <div class="footer-row">
        <span class="footer">${footer}</span>
        ${renderExtras(item)}
      </div>
    </div>
  `;
}

export function createNutritionStrip({ item, priceText = "", variant = "detail" } = {}) {
  const host = document.createElement("div");
  host.className = variant === "list" ? "mm-root mm-band" : "mm-root";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>${STYLES}</style>
    ${variant === "list" ? renderListStrip(item) : renderDetailStrip(item, priceText)}
  `;

  return host;
}

const MODIFIER_DELTA_STYLES = `
  :host {
    color: #6b6b6b;
    display: inline;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
`;

export function createModifierDelta(modifier) {
  const text = formatDeltaText(modifier);
  if (!text) return null;

  const host = document.createElement("span");
  host.className = "mm-modifier-delta";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${MODIFIER_DELTA_STYLES}</style><span>${escapeHtml(text)}</span>`;
  return host;
}
