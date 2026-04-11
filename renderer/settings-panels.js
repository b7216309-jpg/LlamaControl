let _settingsOpen = true;
let _settingsWidth = 280;

function toggleSettings() {
  const col = document.getElementById("settings-col");
  const inner = document.getElementById("settings-inner");
  const arrow = document.getElementById("settings-arrow");
  const toggle = document.getElementById("settings-toggle");
  const label = document.getElementById("settings-label");
  const handle = document.getElementById("drag-settings");

  if (_settingsOpen) {
    _settingsWidth = col.offsetWidth || 280;
    col.style.width = "22px";
    col.style.minWidth = "22px";
    col.style.overflow = "hidden";
    inner.style.display = "none";
    handle.style.display = "none";
    toggle.style.writingMode = "vertical-rl";
    toggle.style.height = "100%";
    toggle.style.justifyContent = "flex-start";
    toggle.style.padding = "10px 4px";
    toggle.style.gap = "6px";
    toggle.style.position = "relative";
    toggle.style.borderBottom = "none";
    toggle.style.borderRight = "1px solid var(--bdr)";
    label.style.letterSpacing = "3px";
    arrow.textContent = ">";
    arrow.style.transform = "rotate(180deg)";
    _settingsOpen = false;
    return;
  }

  col.style.width = _settingsWidth + "px";
  col.style.minWidth = "";
  col.style.overflowY = "auto";
  col.style.overflowX = "hidden";
  inner.style.display = "";
  handle.style.display = "";
  toggle.style.writingMode = "";
  toggle.style.height = "18px";
  toggle.style.justifyContent = "space-between";
  toggle.style.padding = "3px 8px";
  toggle.style.gap = "";
  toggle.style.position = "sticky";
  toggle.style.borderBottom = "1px solid var(--bdr)";
  toggle.style.borderRight = "none";
  label.style.letterSpacing = "2px";
  arrow.textContent = ">";
  arrow.style.transform = "";
  _settingsOpen = true;
}

