function formatRefreshStatus(meta) {
  if (meta.lastRefreshOk === true) return "OK";
  if (meta.lastRefreshOk === false) return "Failed";
  return "Unknown";
}

async function render() {
  const statusEl = document.getElementById("status");
  try {
    const { packs } = await chrome.runtime.sendMessage({ type: "MM_GET_PACKS" });
    const { meta } = await chrome.runtime.sendMessage({ type: "MM_STATUS" });

    const names = packs.map((pack) => pack.displayName).join(", ") || "No packs";
    const when = meta.lastRefreshAt
      ? new Date(meta.lastRefreshAt).toLocaleString()
      : "Never";
    const ok = formatRefreshStatus(meta);

    statusEl.innerHTML =
      `<strong>${names}</strong><br>Last refresh: ${when}<br>Status: ${ok}`;
  } catch {
    statusEl.textContent = "Could not load status";
  }
}

document.getElementById("refresh").addEventListener("click", async () => {
  const btn = document.getElementById("refresh");
  btn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: "MM_REFRESH" });
    await render();
  } finally {
    btn.disabled = false;
  }
});

render();
