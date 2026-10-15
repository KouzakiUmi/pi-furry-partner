const $ = (selector) => document.querySelector(selector);
const media = matchMedia("(prefers-reduced-motion: reduce)");
const stateLabels = { idle: "待机", thinking: "思考", running: "敲代码", searching: "找线索", speaking: "说话", waiting: "等你", success: "完成", error: "吃瘪", waking: "睡醒", compacting: "整理" };
const responses = { idle: "我在这儿呢，有想法就叫我呀。", thinking: "好呀，我先想想从哪儿开始。", running: "这几处我来改，写完再检查一遍。", searching: "线索藏在哪儿呢？我翻翻看。", speaking: "找到啦，我慢慢讲给你听。", waiting: "你慢慢想，我把耳朵竖好等你。", success: "做好啦，来看看有没有合你心意。", error: "唔，这步绊了一下。我再认真看看。", waking: "你来啦！我醒醒神，这就陪你。", compacting: "我把前面的线索收好，接着往下走。" };
const canvas = $("#mascot"), context = canvas.getContext("2d"), stage = $(".character-stage");
let time = 0, wall = performance.now(), paused = media.matches, timer, visible = !document.hidden;
let state = "thinking", style = "wumi", sheets, activity, player, running = false;
const bitmaps = new Map();

function advance() {
  const next = performance.now();
  if (!paused && visible) time += Math.min(1000, Math.max(0, next - wall));
  wall = next;
}

function bitmap(sheet, index, key) {
  if (bitmaps.has(key)) return bitmaps.get(key);
  const image = document.createElement("canvas");
  image.width = sheet.width; image.height = sheet.height;
  const ctx = image.getContext("2d"), data = ctx.createImageData(image.width, image.height);
  for (let i = 0; i < sheet.frames[index].pixels.length; i++) {
    const color = sheet.frames[index].pixels[i];
    if (color !== (sheet.transparentIndex ?? 0)) data.data.set([...sheet.palette[color], 255], i * 4);
  }
  ctx.putImageData(data, 0, 0); bitmaps.set(key, image);
  if (bitmaps.size > 64) bitmaps.delete(bitmaps.keys().next().value);
  return image;
}

function updateControls() {
  const button = $("#pause");
  button.replaceChildren();
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = paused ? "▷" : "Ⅱ";
  button.append(icon, document.createTextNode(paused ? " 继续动画" : " 暂停动画"));
  button.setAttribute("aria-pressed", String(paused));
  for (const item of document.querySelectorAll("[data-state]")) item.setAttribute("aria-pressed", String(item.dataset.state === state));
  for (const item of document.querySelectorAll("[data-style]")) item.setAttribute("aria-pressed", String(item.dataset.style === style));
}

function render() {
  if (!running) return;
  const snapshot = activity.snapshot(), sheet = sheets[style];
  let face = snapshot.face;
  const phaseBlink = { thinking: "think-blink", running: "work-blink", success: "happy-blink", waiting: "wait-blink" };
  if (snapshot.blink && phaseBlink[snapshot.phase]) face = phaseBlink[snapshot.phase];
  if (snapshot.blink && face === "idle-open") face = "idle-blink";
  if (!(face in sheet.ids)) face = "idle-open";
  const visual = player.frame(sheet, sheet.ids[face], {
    animate: !paused,
    phase: snapshot.reaction || (snapshot.drowsy ? "dozing" : snapshot.visualPhase || snapshot.phase),
    blink: snapshot.blink,
  });
  const image = bitmap(visual.sheet, visual.frameIndex, `${style}:${visual.cacheKey}`);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = style !== "wumi-pixel";
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  stage.classList.add("ready"); stage.classList.toggle("pixel", style === "wumi-pixel");
  canvas.setAttribute("aria-label", `呜咪${stateLabels[state]}中的${paused ? "静态表情" : "动画"}`);
  $("#bubble").textContent = snapshot.bubble;
  $("#state-glyph").textContent = snapshot.glyph;
  $("#state-phrase").textContent = snapshot.phrase;
  $("#frame-status").textContent = `${paused ? "已暂停" : "实时演示"} · ${style === "wumi" ? "角色版" : "像素版"}`;
}

function schedule() {
  clearTimeout(timer); advance(); render();
  if (!paused && visible && running) timer = setTimeout(schedule, 70);
}

for (const button of document.querySelectorAll("[data-state]")) button.addEventListener("click", () => {
  if (!running) return;
  advance(); state = button.dataset.state; activity.setDemo(state);
  $("#demo-response").textContent = responses[state];
  $("#demo-note").textContent = state === "waiting" ? "呜咪歪头等你回答。等十秒，还会悄悄打个瞌睡。" : state === "waking" ? "给呜咪六秒钟：从迷迷糊糊，到发现你来啦。" : `${stateLabels[state]}演示 · 使用插件同款动作与状态短句，不会连接模型。`;
  updateControls(); schedule();
});
for (const button of document.querySelectorAll("[data-style]")) button.addEventListener("click", () => {
  advance(); style = button.dataset.style; updateControls(); schedule();
});
$("#pause").addEventListener("click", () => { advance(); paused = !paused; updateControls(); schedule(); });
document.addEventListener("visibilitychange", () => { advance(); visible = !document.hidden; wall = performance.now(); schedule(); });
media.addEventListener("change", (event) => { advance(); paused = event.matches; updateControls(); schedule(); });

const toggleState = { locale: true, prompt: true, persona: false };
const toggleNames = { locale: "中文界面", prompt: "中文精简提示词", persona: "呜咪角色口吻" };
for (const button of document.querySelectorAll("[data-toggle]")) button.addEventListener("click", () => {
  const key = button.dataset.toggle; toggleState[key] = !toggleState[key];
  button.setAttribute("aria-checked", String(toggleState[key]));
  $("#result-label").textContent = toggleState.locale ? "回答口吻示例" : "Response style preview";
  $("#result-copy").textContent = toggleState.persona ? "改好啦，我也认真检查过一遍。来看看合不合你心意呀。" : "已完成修改，并通过相关检查。";
  $("#toggle-command").textContent = `/mascot ${key} ${toggleState[key] ? "on" : "off"}`;
  const details = [toggleState.locale ? "常用界面显示中文" : "保留 Pi 原始界面", toggleState.prompt ? "默认固定说明使用精简中文" : "保留 Pi 原始系统说明", toggleState.persona ? "加入呜咪口吻" : "使用普通工作口吻"];
  $(".toggle-note").textContent = `${toggleNames[key]}已${toggleState[key] ? "开启" : "关闭"}（演示）。${details.join("；")}。本页不改动你的 Pi。`;
});

$("#copy-install").addEventListener("click", async () => {
  const text = $("#install-command").textContent;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    $("#copy-status").textContent = "安装命令已复制，可以粘贴到终端运行啦。";
    $("#copy-install").textContent = "已复制 ✓";
  } catch {
    const range = document.createRange(); range.selectNodeContents($("#install-command"));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    $("#copy-status").textContent = "浏览器未开放剪贴板权限，已选中命令。按 Ctrl+C 或 ⌘C 即可复制。";
  }
});

updateControls();
try {
  // Catch dependency loading failures too, so a strict static-server MIME error
  // or missing runtime file leaves an explicit static preview instead of a spinner.
  const [activityModule, motionModule, sheetResponse, phraseResponse, copyResponse] = await Promise.all([
    import("./runtime/activity.js"),
    import("./runtime/motion.js"),
    fetch(new URL("./assets/animation-sheets.json", import.meta.url)),
    fetch(new URL("./assets/status-phrases.json", import.meta.url)),
    fetch(new URL("./assets/status-copy.json", import.meta.url)),
  ]);
  if (![sheetResponse, phraseResponse, copyResponse].every((response) => response.ok)) throw new Error("Animation assets unavailable");
  const [raw, phrases, copy] = await Promise.all([sheetResponse.json(), phraseResponse.json(), copyResponse.json()]);
  sheets = raw;
  for (const sheet of Object.values(sheets)) for (const frame of sheet.frames) frame.pixels = Uint8Array.from(atob(frame.pixels), (character) => character.charCodeAt(0));
  activity = activityModule.createActivity({ phrases: phrases.phrases, labels: copy.labels, bubbles: copy.bubbles, rotationMs: phrases.rotationMs, now: () => time });
  activity.start({ wake: false }); activity.setDemo(state);
  player = motionModule.createMotionPlayer({ now: () => time, maxFrames: 64 });
  running = true; schedule();
} catch (error) {
  console.error("Animation preview:", error);
  $("#frame-status").textContent = "静态角色预览";
  $("#demo-note").textContent = "动画暂时没有加载成功，可以刷新页面重试。安装与文档仍可使用。";
  for (const button of document.querySelectorAll("[data-state], [data-style], #pause")) button.disabled = true;
}
