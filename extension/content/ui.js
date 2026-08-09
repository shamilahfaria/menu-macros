const MACROS = [
  ["Protein", "proteinG", "g"],
  ["Carbs", "carbsG", "g"],
  ["Fat", "fatG", "g"],
  ["Sodium", "sodiumMg", "mg"],
  ["Sugar", "sugarG", "g"],
  ["Fiber", "fiberG", "g"],
];

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
    display: block;
    color: #191919;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    line-height: 1.3;
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
  return MACROS.map(([label, key, unit]) => ({
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

export function createNutritionStrip({ item, priceText = "" } = {}) {
  const host = document.createElement("div");
  host.className = "mm-root";
  const shadow = host.attachShadow({ mode: "open" });
  const macros = formatMacros(item).map(({ label, value }) => `
    <div class="macro">
      <span class="macro-label">${label}</span>
      <span class="macro-value">${value}</span>
    </div>
  `).join("");
  const calories = item == null ? "—" : formatValue(item.calories, "");
  const footer = item == null
    ? "Nutrition unavailable"
    : "Base item · excludes customizations";

  shadow.innerHTML = `
    <style>${STYLES}</style>
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
