function buildSamplerList() {
  const list = document.getElementById("sampler-list");
  if (!list) return;
  clearNode(list);
  S.samplers.forEach((name, i) => {
    const div = document.createElement("div");
    div.className = "sampler-item";
    div.draggable = true;
    div.dataset.idx = i;
    div.appendChild(createSpan("sampler-handle", "::"));
    div.appendChild(createSpan("", name));
    const order = createSpan("", String(i + 1));
    order.style.cssText = "margin-left:auto;font-size:9px;color:var(--fg3)";
    div.appendChild(order);
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", i);
      div.style.opacity = ".4";
    });
    div.addEventListener("dragend", () => {
      div.style.opacity = "1";
      list.querySelectorAll(".sampler-item").forEach((item) => item.classList.remove("drag-over"));
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      div.classList.add("drag-over");
    });
    div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const to = parseInt(div.dataset.idx, 10);
      if (from === to) return;
      const moved = S.samplers.splice(from, 1)[0];
      S.samplers.splice(to, 0, moved);
      buildSamplerList();
      clearTimeout(sSet._timer);
      sSet._timer = setTimeout(saveSettingsToConfig, 800);
    });
    list.appendChild(div);
  });
}
buildSamplerList();

function renderStops() {
  const cont = document.getElementById("stop-tags");
  if (!cont) return;
  clearNode(cont);
  S.stop.forEach((s, i) => {
    const tag = document.createElement("div");
    tag.className = "stop-tag";
    const label = createSpan("", s === "\n" ? "\\n" : s);
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => stopRemove(i));
    tag.appendChild(label);
    tag.appendChild(removeBtn);
    cont.appendChild(tag);
  });
}

function stopAdd() {
  const inp = document.getElementById("stop-input");
  if (!inp || !inp.value.trim()) return;
  S.stop.push(inp.value.trim());
  inp.value = "";
  renderStops();
  clearTimeout(sSet._timer);
  sSet._timer = setTimeout(saveSettingsToConfig, 800);
}

function stopRemove(i) {
  S.stop.splice(i, 1);
  renderStops();
  clearTimeout(sSet._timer);
  sSet._timer = setTimeout(saveSettingsToConfig, 800);
}

document.getElementById("stop-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") stopAdd();
});

S.stop = ["<|im_end|>", "<|endoftext|>"];
renderStops();
