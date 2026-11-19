const state = {
  currentFile: "Main.java",
  tool: "files",
  environment: "running",
  testPanelCollapsed: false,
  liked: false,
  answerDeduction: 0,
};
const apiEnabled = /^https?:$/.test(location.protocol);
const terminalState = { history: [], historyIndex: 0 };
const interactiveTerminal = { terminal: null, fitAddon: null, socket: null, resizeObserver: null, sessionId: "", connecting: false, closing: false, profile: null, limits: null };
const defaultProgress = { status: "未开始", score: null, attempts: 0, completedAt: "", lastActivityAt: "", history: [], gradeRecords: [] };
let studentProgress = { ...defaultProgress };
let comments = [];
let activeLab = null;
let activeProject = null;
let activeCheckpoints = [];
let activeCheckpointIndex = 0;
let runtimeUser = null;

function isTeacherPreview() {
  return new URLSearchParams(location.search).get("teacherPreview") === "1" && ["teacher", "admin"].includes(runtimeUser?.role);
}

const files = {};
const fileMetadata = new Map();
const savedFileContents = new Map();
let saveFileTimer = null;
let saveRequestQueue = Promise.resolve();
let fileOpenSequence = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const toast = (message) => {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
};

function configureBackLink() {
  const link = $("#backToCourse");
  const query = new URLSearchParams(location.search);
  const allowedPages = new Set(["home", "learning", "student-course", "practice", "grades", "records", "labs"]);
  const requestedPage = query.get("returnPage");
  const returnPage = allowedPages.has(requestedPage) ? requestedPage : "learning";
  const target = new URLSearchParams({ page: returnPage });
  const courseId = query.get("courseId");
  if (returnPage === "student-course" && courseId && courseId.length <= 128) target.set("courseId", courseId);
  link.href = `portal.html?${target}`;
  link.title = returnPage === "labs" ? "返回实验模板" : returnPage === "student-course" ? "返回课程安排" : returnPage === "practice" ? "返回实训与考试" : "返回课程学习";
}

function terminalRequestHeaders(formal = false) {
  const headers = {};
  if (interactiveTerminal.sessionId) headers["X-Terminal-Session"] = interactiveTerminal.sessionId;
  const labId = new URLSearchParams(location.search).get("labId");
  if (labId) headers["X-Lab-Id"] = labId;
  const checkpointId = activeCheckpoints[activeCheckpointIndex]?.id || new URLSearchParams(location.search).get("checkpointId");
  if (checkpointId) headers["X-Checkpoint-Id"] = checkpointId;
  const commitSha = new URLSearchParams(location.search).get("commitSha");
  if (commitSha) headers["X-Repository-Commit"] = commitSha;
  const courseId = new URLSearchParams(location.search).get("courseId");
  const examId = new URLSearchParams(location.search).get("examId");
  if (courseId) headers["X-Course-Id"] = courseId;
  if (examId) headers["X-Exam-Id"] = examId;
  headers["X-Lab-Formal"] = formal ? "true" : "false";
  return headers;
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function renderTestRows(checks = []) {
  const body = $("#testBody");
  body.innerHTML = "";
  checks.forEach((check, index) => {
    const row = document.createElement("button");
    row.className = `test-case${index === 0 ? " expanded" : ""}`;
    row.dataset.test = String(index + 1);
    const visibility = check.visibility === "hidden" ? "隐藏" : "公开";
    row.innerHTML = `<span class="chevron">›</span><span>测试集 ${index + 1} · ${visibility}测试</span><strong class="waiting">待测试</strong>`;
    const displayName = check.visibility === "hidden" && check.actual == null ? "隐藏测试（正式评测时执行）" : (check.name || "未命名测试");
    row.children[1].textContent = `测试集 ${index + 1} · ${displayName}`;
    const detail = document.createElement("div");
    detail.className = "test-detail";
    detail.dataset.testDetail = String(index + 1);
    detail.hidden = index !== 0;
    const expectedRow = document.createElement("div");
    const expectedLabel = document.createElement("span");
    expectedLabel.textContent = "预期结果";
    const expected = document.createElement("strong");
    expected.textContent = check.visibility === "hidden" && check.actual == null ? "正式评测时执行" : (check.expected || "满足测试规则");
    expectedRow.append(expectedLabel, expected);
    const actualRow = document.createElement("div");
    const actualLabel = document.createElement("span");
    actualLabel.textContent = "实际结果";
    const actual = document.createElement("code");
    actual.textContent = check.actual ?? "尚未测试";
    actualRow.append(actualLabel, actual);
    detail.append(expectedRow, actualRow);
    body.append(row, detail);
  });
}

function renderArtifacts(artifacts = []) {
  if (!artifacts.length) return;
  const section = document.createElement("section");
  section.className = "result-artifacts";
  const title = document.createElement("strong");
  title.textContent = "实验输出";
  section.appendChild(title);
  artifacts.forEach((artifact) => {
    const card = document.createElement("article");
    const name = document.createElement("span");
    name.textContent = artifact.path;
    card.appendChild(name);
    if (String(artifact.mimeType).startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = artifact.path;
      image.src = `data:${artifact.mimeType};base64,${artifact.contentBase64}`;
      card.appendChild(image);
    } else {
      const output = document.createElement("pre");
      try {
        const bytes = Uint8Array.from(atob(artifact.contentBase64), (char) => char.charCodeAt(0));
        output.textContent = new TextDecoder().decode(bytes);
      } catch { output.textContent = "无法预览该文件"; }
      card.appendChild(output);
    }
    section.appendChild(card);
  });
  $("#testBody").appendChild(section);
}

function renderLabConfiguration(lab) {
  if (!lab) return;
  activeProject = lab;
  activeCheckpoints = Array.isArray(lab.checkpoints) && lab.checkpoints.length ? lab.checkpoints : [{ id: "checkpoint-legacy", name: lab.name, objectives: lab.objectives, description: lab.description, knowledge: lab.knowledge, requirements: lab.requirements, testDescription: lab.testDescription, difficulty: lab.difficulty, rewardExperience: lab.rewardExperience, maxExecutionSeconds: lab.maxExecutionSeconds, evaluationConfig: lab.evaluationConfig }];
  const requestedCheckpoint = new URLSearchParams(location.search).get("checkpointId");
  activeCheckpointIndex = Math.max(0, activeCheckpoints.findIndex((item) => item.id === requestedCheckpoint));
  const checkpoint = activeCheckpoints[activeCheckpointIndex];
  activeLab = { ...lab, ...checkpoint, id: lab.id, projectName: lab.name, initialFiles: lab.repository?.files || lab.initialFiles, evaluationConfig: checkpoint.evaluationConfig || lab.evaluationConfig };
  lab = activeLab;
  state.currentFile = "";
  Object.keys(files).forEach((key) => delete files[key]);
  fileMetadata.clear();
  document.title = `学生实践平台 · ${activeProject.name} · ${checkpoint.name}`;
  $("#labTitle").textContent = activeProject.name;
  $("#labEyebrow").textContent = `${lab.difficulty || "实践"}实验 · 第 ${activeCheckpointIndex + 1} / ${activeCheckpoints.length} 关`;
  $("#labTaskKicker").textContent = `Task ${String(activeCheckpointIndex + 1).padStart(2, "0")} · ${checkpoint.name}`;
  $("#labDescription").textContent = lab.description || "教师尚未填写任务描述。";
  $("#labKnowledge").textContent = lab.knowledge || "请结合课程知识完成本实验。";
  $("#labObjectives").textContent = lab.objectives || "完成教师配置的实验任务并通过正式评测。";
  const requirements = lines(lab.requirements);
  $("#labRequirements").innerHTML = "";
  (requirements.length ? requirements : ["按任务说明完成实验。", "运行公开测试检查结果。", "提交正式评测达到通过标准。"]).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    $("#labRequirements").appendChild(li);
  });
  $("#labTestDescription").textContent = lab.testDescription || "自动测试执行公开测试，正式评测还会执行隐藏测试。";
  $("#labTimeLimit").textContent = `${lab.maxExecutionSeconds || Math.min(120, Number(lab.duration || 2) * 60)} 秒`;
  const platform = lab.techPlatform || "Linux";
  $("#environmentStatus").textContent = `${platform} 环境待连接`;
  const teacherPreview = isTeacherPreview();
  const preferredTool = teacherPreview || lab.mode === "代码 + 命令行" ? "files" : "terminal";
  state.tool = preferredTool;
  $$('[data-tool-tab]').forEach((item) => item.classList.toggle("active", item.dataset.toolTab === preferredTool));
  $$('[data-tool-view]').forEach((view) => view.classList.toggle("active", view.dataset.toolView === preferredTool));
  const filesTab = $('[data-tool-tab="files"]');
  if (filesTab) {
    filesTab.disabled = !teacherPreview && lab.mode === "仅命令行";
    filesTab.title = teacherPreview ? "教师预览：检查实验工作区文件" : lab.mode === "仅命令行" ? "本实验仅开放命令行" : "编辑实验工作区文件";
  }
  const evaluation = lab.evaluationConfig || {};
  renderTestRows(Array.isArray(evaluation.tests) ? evaluation.tests : []);
  const answers = Array.isArray(evaluation.referenceAnswers) ? evaluation.referenceAnswers : [];
  $("#referenceAnswerOptions").innerHTML = answers.map((answer, index) => `<button class="secondary-button answer-option" data-answer-index="${index}">${answer.name || `提示 ${index + 1}`}（扣 ${Number(answer.deductionPercent || 0)}%）</button>`).join(" ");
  $("#unlockAnswer").hidden = answers.length > 0;
  $("#prevButton").disabled = activeCheckpointIndex === 0;
  $("#nextButton").disabled = activeCheckpointIndex >= activeCheckpoints.length - 1;
  $("#prevButton").textContent = activeCheckpointIndex === 0 ? "已是首关" : `上一关`;
  $("#nextButton").textContent = activeCheckpointIndex >= activeCheckpoints.length - 1 ? "已是末关" : `下一关`;
}

function navigateCheckpoint(offset) {
  const target = activeCheckpointIndex + offset;
  if (!activeProject || target < 0 || target >= activeCheckpoints.length) return;
  const query = new URLSearchParams(location.search);
  query.set("checkpointId", activeCheckpoints[target].id);
  history.replaceState(null, "", `${location.pathname}?${query}`);
  renderLabConfiguration(activeProject);
  loadWorkspaceFiles().catch(() => {});
  toast(`已切换到第 ${target + 1} 关`);
}

async function loadLabConfiguration() {
  if (!apiEnabled) return;
  const labId = new URLSearchParams(location.search).get("labId");
  if (!labId) return;
  try {
    const response = await fetch("/api/bootstrap?runtime=1");
    if (!response.ok) return;
    const data = await response.json();
    const lab = Array.isArray(data.labs) ? data.labs.find((item) => item.id === labId) : null;
    if (lab) renderLabConfiguration(lab);
  } catch {}
}

function setTerminalConnection(title, detail, retry = false) {
  const panel = $("#terminalConnection");
  panel.hidden = false;
  $("strong", panel).textContent = title;
  $("small", panel).textContent = detail;
  $(".terminal-connection-spinner", panel).hidden = retry;
  $("#reconnectTerminal").hidden = !retry;
}

function showLegacyTerminal(message) {
  interactiveTerminal.sessionId = "wsl-fallback";
  $("#terminalHost").hidden = true;
  $("#terminalConnection").hidden = true;
  $("#terminalFallback").hidden = false;
  $("#terminalMeta").textContent = "bash · 受限命令回退模式";
  $("#footerState").textContent = "交互终端不可用 · 已启用受限命令模式";
  if (message) toast(message);
  loadWorkspaceFiles().catch((error) => toast(error.message || "WSL 工作区文件读取失败"));
  setTimeout(() => $("#terminalInput")?.focus(), 0);
}

async function disposeInteractiveTerminal() {
  interactiveTerminal.closing = true;
  try { interactiveTerminal.socket?.close(1000, "restart"); } catch {}
  interactiveTerminal.socket = null;
  interactiveTerminal.sessionId = "";
  interactiveTerminal.resizeObserver?.disconnect();
  interactiveTerminal.resizeObserver = null;
  interactiveTerminal.terminal?.dispose();
  interactiveTerminal.terminal = null;
  interactiveTerminal.fitAddon = null;
  $("#terminalHost").innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 120));
  interactiveTerminal.closing = false;
}

async function ensureInteractiveTerminal(force = false) {
  if (interactiveTerminal.connecting) return;
  if (!force && interactiveTerminal.socket?.readyState === WebSocket.OPEN) {
    interactiveTerminal.fitAddon?.fit();
    interactiveTerminal.terminal?.focus();
    return;
  }
  interactiveTerminal.connecting = true;
  if (force) await disposeInteractiveTerminal();
  $("#terminalFallback").hidden = true;
  $("#terminalHost").hidden = false;
  setTerminalConnection("准备隔离终端", "正在申请一次性会话并创建独立 Linux 容器");
  $("#terminalMeta").textContent = "bash · Docker 隔离环境 · 正在连接";
  try {
    if (!apiEnabled) throw new Error("请通过学生实践平台服务地址打开实验页面");
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import("./vendor/xterm.mjs"),
      import("./vendor/addon-fit.mjs"),
    ]);
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: true,
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: 2000,
      allowProposedApi: false,
      theme: { background: "#08131b", foreground: "#d8e5e7", cursor: "#8be8b6", selectionBackground: "#28516b" },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open($("#terminalHost"));
    interactiveTerminal.terminal = terminal;
    interactiveTerminal.fitAddon = fitAddon;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    fitAddon.fit();
    terminal.writeln("\x1b[36m正在创建安全隔离的 Linux 终端…\x1b[0m");
    const labId = new URLSearchParams(location.search).get("labId") || "";
    const checkpointId = activeCheckpoints[activeCheckpointIndex]?.id || "";
    const commitSha = new URLSearchParams(location.search).get("commitSha") || "";
    const response = await fetch("/api/terminal/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labId, checkpointId, commitSha, teacherPreview: isTeacherPreview() }) });
    const session = await response.json();
    if (!response.ok) throw new Error(session.message || session.reason || "终端会话申请失败");
    interactiveTerminal.profile = session.profile || null;
    interactiveTerminal.limits = session.limits || null;
    const security = $(".terminal-security");
    if (security && session.limits) security.textContent = `无网络 · ${session.limits.memoryMiB} MiB · ${session.limits.maxMinutes} 分钟`;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}${session.websocketPath}?token=${encodeURIComponent(session.token)}`);
    interactiveTerminal.socket = socket;
    socket.addEventListener("open", () => {
      fitAddon.fit();
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    });
    socket.addEventListener("message", async (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "output") terminal.write(message.data);
      if (message.type === "ready") {
        interactiveTerminal.sessionId = message.sessionId;
        $("#terminalConnection").hidden = true;
        const platform = message.profile?.platform || session.profile?.platform || activeLab?.techPlatform || "Linux";
        $("#terminalMeta").textContent = `${platform} · Docker 隔离环境 · 已连接`;
        $("#environmentStatus").textContent = `${platform} 环境运行中`;
        $("#footerState").textContent = "隔离终端运行中 · 无网络 · 自动回收";
        terminal.focus();
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        try { await loadWorkspaceFiles(); } catch (error) { toast(error.message || "工作区文件读取失败"); }
        await recordProgress({ kind: "操作", title: `启动交互式 ${platform} 终端`, detail: "独立 Docker 实验环境已创建" });
      }
      if (message.type === "error") {
        terminal.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`);
        setTerminalConnection("终端启动失败", message.message, true);
      }
      if (message.type === "exit") {
        terminal.writeln(`\r\n\x1b[33m${message.reason || "终端会话已结束"}\x1b[0m`);
        interactiveTerminal.sessionId = "";
        setTerminalConnection("终端会话已结束", message.reason || "可以重新创建隔离终端", true);
      }
    });
    socket.addEventListener("close", () => {
      interactiveTerminal.sessionId = "";
      if (!interactiveTerminal.closing) setTerminalConnection("终端连接已关闭", "点击重新连接可创建新的隔离环境", true);
    });
    socket.addEventListener("error", () => {
      if (!interactiveTerminal.closing) setTerminalConnection("无法连接交互终端", "WebSocket 连接失败，已保留受限模式回退", true);
    });
    terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
    });
    terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    interactiveTerminal.resizeObserver = new ResizeObserver(() => {
      if (state.tool !== "terminal") return;
      try { fitAddon.fit(); } catch {}
    });
    interactiveTerminal.resizeObserver.observe($("#terminalHost"));
  } catch (error) {
    await disposeInteractiveTerminal();
    showLegacyTerminal(error.message || "交互终端连接失败，已切换受限模式");
  } finally {
    interactiveTerminal.connecting = false;
  }
}

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeProgress(value = {}) {
  return { ...defaultProgress, ...value, history: Array.isArray(value.history) ? value.history : [], gradeRecords: Array.isArray(value.gradeRecords) ? value.gradeRecords : [] };
}

function renderProgress() {
  $("#scorePill").textContent = studentProgress.score == null ? "--" : studentProgress.score;
  const list = $("#historyList");
  list.innerHTML = "";
  if (!studentProgress.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-view";
    const title = document.createElement("h2");
    title.textContent = "暂无学习记录";
    const copy = document.createElement("p");
    copy.textContent = "执行命令或运行评测后，这里会显示真实操作记录。";
    empty.append(title, copy);
    list.appendChild(empty);
    return;
  }
  studentProgress.history.slice(0, 30).forEach((record) => {
    const row = document.createElement("div");
    row.className = "history-row";
    const title = document.createElement("span");
    title.textContent = record.title;
    const detail = document.createElement("strong");
    detail.textContent = record.detail || record.kind;
    if (record.kind === "评测" && /通过/.test(record.detail || "")) detail.className = "status-pass";
    const time = document.createElement("time");
    time.textContent = new Date(record.at).toLocaleString("zh-CN", { hour12: false });
    row.append(title, detail, time);
    list.appendChild(row);
  });
}

function renderComments() {
  const list = $("#commentList");
  list.innerHTML = "";
  if (!comments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-view";
    empty.innerHTML = "<h2>暂无评论</h2><p>提交后会同步到实验评论区。</p>";
    list.appendChild(empty);
    return;
  }
  comments.slice(0, 30).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "comment";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = (entry.authorName || "同学").slice(0, 1);
    const body = document.createElement("div");
    const author = document.createElement("strong");
    author.textContent = entry.authorName || "同学";
    const text = document.createElement("p");
    text.textContent = entry.text;
    const time = document.createElement("time");
    time.textContent = new Date(entry.at).toLocaleString("zh-CN", { hour12: false });
    body.append(author, text, time);
    row.append(avatar, body);
    list.appendChild(row);
  });
}

async function loadComments() {
  if (!apiEnabled || !activeProject?.id) {
    comments = Array.isArray(readLocalJson("cloudlab-comments", [])) ? readLocalJson("cloudlab-comments", []) : [];
    return renderComments();
  }
  try {
    const response = await fetch(`/api/lab-comments?labId=${encodeURIComponent(activeProject.id)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "评论加载失败");
    comments = Array.isArray(body.comments) ? body.comments : [];
  } catch (error) { comments = []; toast(error.message || "评论加载失败"); }
  renderComments();
}

function updateProgressLocally(event) {
  const now = new Date().toISOString();
  studentProgress.lastActivityAt = now;
  if (studentProgress.status === "未开始") studentProgress.status = "进行中";
  if (event.kind === "评测") {
    studentProgress.attempts += 1;
    const score = Number.isFinite(Number(event.score)) ? Number(event.score) : (event.passed ? 100 : 0);
    studentProgress.score = Math.max(studentProgress.score ?? 0, score);
    if (event.passed) {
      studentProgress.status = "已完成";
      studentProgress.completedAt = now;
    }
  }
  studentProgress.history.unshift({ id: `${Date.now()}-${Math.random()}`, kind: event.kind || "操作", title: event.title, detail: event.detail || "", at: now });
  studentProgress.history = studentProgress.history.slice(0, 100);
}

async function recordProgress(event) {
  if (apiEnabled) {
    try {
      const response = await fetch("/api/student-progress/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "学习记录保存失败");
      studentProgress = normalizeProgress(body);
      localStorage.setItem("cloudlab-student-progress", JSON.stringify(studentProgress));
      renderProgress();
      return;
    } catch (error) { toast(error.message || "学习记录保存失败"); return; }
  }
  updateProgressLocally(event);
  localStorage.setItem("cloudlab-student-progress", JSON.stringify(studentProgress));
  renderProgress();
}

async function loadProgress() {
  studentProgress = normalizeProgress(readLocalJson("cloudlab-student-progress", defaultProgress));
  if (apiEnabled) {
    try {
      const response = await fetch("/api/student-progress");
      if (response.ok) studentProgress = normalizeProgress(await response.json());
    } catch {}
  }
  localStorage.setItem("cloudlab-student-progress", JSON.stringify(studentProgress));
  renderProgress();
  if (studentProgress.status === "未开始") await recordProgress({ kind: "操作", title: `进入${activeLab?.name || "实验"}`, detail: "实验学习已开始" });
}

function updateLineNumbers() {
  const lines = $("#codeEditor").value.split("\n").length;
  $("#lineNumbers").innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join("");
}

function fileDotClass(fileName) {
  const extension = fileName.split(".").pop().toLowerCase();
  return ["java", "py", "sql", "sh", "md"].includes(extension) ? extension : "";
}

function renderFileTree(entries = []) {
  const host = $("#fileEntries");
  host.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("span");
    empty.className = "terminal-meta";
    empty.textContent = "工作区暂无文件";
    host.appendChild(empty);
    return;
  }
  const fillInFiles = new Set(activeLab?.evaluationConfig?.studentFiles || []);
  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `file-entry${entry.path === state.currentFile ? " active" : ""}`;
    button.dataset.file = entry.path;
    button.setAttribute("aria-current", entry.path === state.currentFile ? "page" : "false");
    const dot = document.createElement("span");
    dot.className = `file-dot ${fileDotClass(entry.path)}`;
    const name = document.createElement("span");
    name.className = "file-entry-name";
    name.textContent = entry.path;
    button.append(dot, name);
    const marker = document.createElement("small");
    if (entry.readOnly) {
      marker.textContent = "只读";
    } else if (fillInFiles.has(entry.path)) {
      marker.textContent = "填空文件";
      marker.className = "file-entry-editable";
    } else {
      marker.textContent = "可编辑";
      marker.className = "file-entry-editable";
    }
    button.appendChild(marker);
    host.appendChild(button);
  });
}

function currentFileIsDirty() {
  const path = state.currentFile;
  return Boolean(path && savedFileContents.has(path) && files[path] !== savedFileContents.get(path));
}

function updateSaveButton(status = "idle") {
  const button = $("#saveFileButton");
  if (!button) return;
  const path = state.currentFile;
  const readOnly = Boolean(path && fileMetadata.get(path)?.readOnly === true);
  const connected = Boolean(interactiveTerminal.sessionId);
  const dirty = currentFileIsDirty();
  button.classList.toggle("save-dirty", dirty && status !== "saving");
  button.classList.toggle("save-saving", status === "saving");
  button.classList.toggle("save-error", status === "error");
  if (!path || !connected) {
    button.textContent = "等待连接";
    button.title = "连接实验环境后才能保存文件";
    button.disabled = true;
  } else if (readOnly) {
    button.textContent = "只读";
    button.title = "教师已将此文件设为只读";
    button.disabled = true;
  } else if (status === "saving") {
    button.textContent = "保存中…";
    button.title = "正在把修改写入实验环境";
    button.disabled = true;
  } else if (status === "error") {
    button.textContent = "重试保存";
    button.title = "上次保存失败，点击重试";
    button.disabled = false;
  } else if (dirty) {
    button.textContent = "保存修改";
    button.title = "保存当前修改（Ctrl+S）";
    button.disabled = false;
  } else {
    button.textContent = "已保存";
    button.title = "当前文件已经保存";
    button.disabled = true;
  }
}

async function loadWorkspaceFiles() {
  if (!interactiveTerminal.sessionId) return;
  const response = await fetch("/api/lab/files", { headers: terminalRequestHeaders() });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "文件列表读取失败");
  fileMetadata.clear();
  (body.files || []).forEach((entry) => fileMetadata.set(entry.path, entry));
  renderFileTree(body.files || []);
  const preferred = state.currentFile && fileMetadata.has(state.currentFile) ? state.currentFile : body.files?.[0]?.path;
  if (preferred) await loadFile(preferred);
}

async function loadFile(fileName) {
  if (!fileName) return;
  const sequence = ++fileOpenSequence;
  $$(".file-entry").forEach((entry) => {
    const selected = entry.dataset.file === fileName;
    entry.classList.toggle("active", selected);
    entry.setAttribute("aria-current", selected ? "page" : "false");
  });
  $("#activeFile").firstChild.textContent = `${fileName} · 正在读取 `;
  $("#codeEditor").setAttribute("aria-busy", "true");
  try {
    if (interactiveTerminal.sessionId) {
      const response = await fetch(`/api/lab/file?path=${encodeURIComponent(fileName)}`, { cache: "no-store", headers: terminalRequestHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "文件读取失败");
      if (sequence !== fileOpenSequence) return;
      files[fileName] = body.content;
      savedFileContents.set(fileName, body.content);
    }
  } catch (error) {
    if (sequence === fileOpenSequence) {
      $("#codeEditor").removeAttribute("aria-busy");
      $("#activeFile").firstChild.textContent = state.currentFile ? `${state.currentFile} ` : "尚未打开文件 ";
      $$(".file-entry").forEach((entry) => {
        const selected = entry.dataset.file === state.currentFile;
        entry.classList.toggle("active", selected);
        entry.setAttribute("aria-current", selected ? "page" : "false");
      });
    }
    throw error;
  }
  if (sequence !== fileOpenSequence) return;
  state.currentFile = fileName;
  $("#codeEditor").value = files[fileName] ?? "";
  $("#activeFile").firstChild.textContent = `${fileName} `;
  $("#codeEditor").readOnly = fileMetadata.get(fileName)?.readOnly === true;
  $("#codeEditor").removeAttribute("aria-busy");
  updateLineNumbers();
  updateSaveButton();
}

async function saveCurrentFile(showMessage = true) {
  const path = state.currentFile;
  if (!path) throw new Error("请先打开需要保存的文件");
  if (!interactiveTerminal.sessionId) throw new Error("实验环境尚未连接，无法保存文件");
  if ($("#codeEditor").readOnly) throw new Error("当前文件为只读文件，不能保存修改");
  clearTimeout(saveFileTimer);
  const content = $("#codeEditor").value;
  files[path] = content;
  if (savedFileContents.get(path) === content) {
    updateSaveButton();
    if (showMessage) toast(`${path} 已经是最新内容`);
    return true;
  }
  updateSaveButton("saving");
  const request = saveRequestQueue.catch(() => {}).then(async () => {
    // Some campus/VPN proxies reset non-standard PUT requests before they reach
    // the application. POST is accepted by the same save endpoint and keeps the
    // editor usable in those network environments.
    const response = await fetch("/api/lab/file", { method: "POST", headers: { ...terminalRequestHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ path, content }) });
    const body = await response.json();
    if (!response.ok || body.saved !== true) throw new Error(body.message || "文件保存失败");
    savedFileContents.set(path, content);
    return body;
  });
  saveRequestQueue = request;
  try {
    await request;
    updateSaveButton();
    if (showMessage) toast(`已保存 ${path}`);
    return true;
  } catch (error) {
    updateSaveButton("error");
    throw error;
  }
}

function bindContentTabs() {
  $$("[data-content-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.contentTab;
    $$("[data-content-tab]").forEach((item) => item.classList.toggle("active", item === button));
    $$("[data-content-view]").forEach((view) => view.classList.toggle("active", view.dataset.contentView === tab));
  }));
}

function bindToolTabs() {
  $$("[data-tool-tab]").forEach((button) => button.addEventListener("click", () => {
    state.tool = button.dataset.toolTab;
    $$("[data-tool-tab]").forEach((item) => item.classList.toggle("active", item === button));
    $$("[data-tool-view]").forEach((view) => view.classList.toggle("active", view.dataset.toolView === state.tool));
    if (state.tool === "terminal") {
      toast("正在进入交互式 Linux 终端");
      setTimeout(() => ensureInteractiveTerminal(), 0);
    }
  }));
}

async function runTest(formal = false, sourceButton = null) {
  const button = sourceButton || (formal ? $("#evaluateButton") : $("#autoTestButton"));
  const lockedButtons = formal ? [$("#autoTestButton"), $("#evaluateButton")].filter(Boolean) : [button];
  const original = button.innerHTML;
  lockedButtons.forEach((item) => { item.disabled = true; });
  button.textContent = formal ? "评测中…" : "测试中…";
  $("#testSummary").textContent = formal ? "正式评测中…" : "公开测试集中…";
  $("#footerState").textContent = formal ? "正在运行完整评测，请稍候" : "正在运行公开测试集";
  try {
    if (!apiEnabled) throw new Error("请通过学生实践平台服务地址打开实验页面");
    if (currentFileIsDirty()) {
      $("#testSummary").textContent = "正在保存最新代码…";
      await saveCurrentFile(false);
    }
    const response = await fetch("/api/lab/test", { method: "POST", headers: terminalRequestHeaders(formal) });
    const report = await response.json();
    if (!response.ok) throw new Error(report.message || "测试服务不可用");
    renderTestRows(report.checks || []);
    report.checks.forEach((check, index) => {
      const result = $("strong", $$(".test-case")[index]);
      result.textContent = check.passed ? "通过" : "未通过";
      result.className = check.passed ? "passed" : "waiting";
      const actual = $(`[data-test-detail="${index + 1}"] code`);
      if (actual) actual.textContent = check.actual;
    });
    renderArtifacts(report.artifacts || []);
    const rawScore = Number(report.score ?? (report.passed ? 100 : 0));
    const finalScore = report.evaluationId ? rawScore : formal ? Math.max(0, rawScore - state.answerDeduction) : rawScore;
    const finalPassed = report.passed && (report.passPolicy !== "score-threshold" || finalScore >= Number(report.passingScore || 100));
    $("#testSummary").textContent = finalPassed ? (formal ? `正式评测完成：通过（${finalScore} 分）` : "最近一次测试：通过") : `测试完成：${finalScore} 分，请根据反馈继续操作`;
    $("#footerState").textContent = finalPassed && formal ? "本关已完成 · 自动保存已开启" : "环境正常 · 自动保存已开启";
    toast(finalPassed ? (formal ? "评测通过，已记录本关成绩" : "自动测试通过") : "有测试项未通过，请根据测试反馈继续修改");
    const query = new URLSearchParams(location.search);
    const progressEvent = { kind: formal ? "评测" : "操作", title: formal ? "提交正式评测" : "运行自动测试", detail: finalPassed ? `达到通过标准，得分 ${finalScore}` : `未达到通过标准，得分 ${finalScore}`, passed: finalPassed, score: finalScore, evaluationId: report.evaluationId || "", courseId: query.get("courseId") || "", labId: query.get("labId") || "", checkpointId: activeCheckpoints[activeCheckpointIndex]?.id || "", examId: query.get("examId") || "" };
    if (formal && report.progressRecorded === true && report.studentProgress) {
      studentProgress = normalizeProgress(report.studentProgress);
      localStorage.setItem("cloudlab-student-progress", JSON.stringify(studentProgress));
      renderProgress();
    } else {
      await recordProgress(progressEvent);
    }
  } catch (error) {
    $("#testSummary").textContent = "测试服务连接失败";
    $("#footerState").textContent = "环境连接异常，请刷新后重试";
    toast(error.message || "测试失败");
  } finally {
    lockedButtons.forEach((item) => { item.disabled = false; });
    button.innerHTML = original;
  }
}

async function executeTerminalCommand(command) {
  const output = $("#terminalOutput");
  const input = $("#terminalInput");
  const activePrompt = output.querySelector(".cursor")?.parentElement;
  if (activePrompt) activePrompt.remove();
  const row = document.createElement("div");
  const prompt = document.createElement("span");
  prompt.className = "terminal-prompt";
  prompt.textContent = "cloudlab@lab-node-01:~/workspace$";
  row.append(prompt, document.createTextNode(` ${command}`));
  output.appendChild(row);
  const response = document.createElement("div");
  response.className = "terminal-muted";
  response.textContent = "执行中…";
  output.appendChild(response);
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
  input.disabled = true;
  try {
    if (!apiEnabled) throw new Error("请通过学生实践平台服务地址打开实验页面");
    const result = await fetch("/api/lab/execute", { method: "POST", headers: { ...terminalRequestHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ command }) });
    const body = await result.json();
    if (!result.ok) throw new Error(body.message || "命令执行失败");
    response.textContent = body.output;
    $("#footerState").textContent = body.exitCode === 0 ? "命令已在 Ubuntu 实验环境中真实执行" : `命令退出码：${body.exitCode}`;
    await recordProgress({ kind: "操作", title: `执行命令：${command.split(/\s+/)[0]}`, detail: body.exitCode === 0 ? "执行成功" : `退出码 ${body.exitCode}` });
  } catch (error) {
    response.textContent = `错误：${error.message || "命令执行失败"}`;
    $("#footerState").textContent = "命令未执行，请检查实验环境";
  } finally {
    const nextPrompt = document.createElement("div");
    const nextPromptLabel = document.createElement("span");
    nextPromptLabel.className = "terminal-prompt";
    nextPromptLabel.textContent = "cloudlab@lab-node-01:~/workspace$";
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    nextPrompt.append(nextPromptLabel, document.createTextNode(" "), cursor);
    output.appendChild(nextPrompt);
    input.disabled = false;
    input.focus();
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
  }
}

async function refreshLabStatus() {
  try {
    if (!apiEnabled) throw new Error("请通过学生实践平台服务地址打开实验页面");
    const labId = new URLSearchParams(location.search).get("labId") || "";
    const checkpointId = activeCheckpoints[activeCheckpointIndex]?.id || "";
    const commitSha = new URLSearchParams(location.search).get("commitSha") || "";
    const response = await fetch(`/api/lab/status?labId=${encodeURIComponent(labId)}&checkpointId=${encodeURIComponent(checkpointId)}&commitSha=${encodeURIComponent(commitSha)}`);
    const body = await response.json();
    if (!body.available) throw new Error(body.error || "Ubuntu 实验环境不可用");
    $("#environmentStatus").textContent = `${body.platform || "Linux"} 环境运行中`;
    $("#footerState").textContent = `环境正常 · ${body.mode || "隔离实验模式"}`;
    toast(`已连接：${body.mode}`);
  } catch (error) {
    $("#environmentStatus").textContent = "环境连接失败";
    toast(error.message || "环境状态检查失败");
  }
}

function bindSplitter() {
  const splitter = $("#splitter");
  let dragging = false;
  splitter.addEventListener("pointerdown", (event) => { dragging = true; splitter.setPointerCapture(event.pointerId); });
  splitter.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const ratio = Math.min(0.58, Math.max(0.28, event.clientX / window.innerWidth));
    $(".learn-panel").style.flexBasis = `${ratio * 100}%`;
  });
  splitter.addEventListener("pointerup", () => { dragging = false; });
}

function bindTestPanel() {
  $("#testBody").addEventListener("click", (event) => {
    const row = event.target.closest(".test-case");
    if (!row) return;
    const detail = row.nextElementSibling;
    row.classList.toggle("expanded");
    if (detail?.classList.contains("test-detail")) detail.hidden = !row.classList.contains("expanded");
  });
  $("#toggleTestPanel").addEventListener("click", () => {
    state.testPanelCollapsed = !state.testPanelCollapsed;
    $("#testPanel").classList.toggle("collapsed", state.testPanelCollapsed);
    $("#toggleTestPanel").textContent = state.testPanelCollapsed ? "⌄" : "⌃";
  });
  const resizer = $("#testResizer");
  let resizing = false;
  resizer.addEventListener("pointerdown", (event) => { resizing = true; resizer.setPointerCapture(event.pointerId); });
  resizer.addEventListener("pointermove", (event) => {
    if (!resizing) return;
    const panel = $("#testPanel");
    const height = Math.min(330, Math.max(100, window.innerHeight - event.clientY - 58));
    panel.style.height = `${height}px`;
    panel.style.flexBasis = `${height}px`;
  });
  resizer.addEventListener("pointerup", () => { resizing = false; });
}

async function init() {
  if (apiEnabled) {
    try {
      const authResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const auth = await authResponse.json();
      if (auth.authRequired && !auth.authenticated) {
        location.replace("portal.html?login=1");
        return;
      }
      runtimeUser = auth.user || null;
    } catch {}
  }
  configureBackLink();
  await loadLabConfiguration();
  bindContentTabs();
  bindToolTabs();
  bindSplitter();
  bindTestPanel();
  $("#codeEditor").value = "";
  updateLineNumbers();
  $("#codeEditor").addEventListener("input", () => {
    if (!state.currentFile) return;
    files[state.currentFile] = $("#codeEditor").value;
    updateLineNumbers();
    updateSaveButton();
    clearTimeout(saveFileTimer);
    saveFileTimer = setTimeout(() => saveCurrentFile(false).catch((error) => toast(error.message || "自动保存失败")), 700);
  });
  $("#codeEditor").addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    saveCurrentFile(true).catch((error) => toast(error.message || "保存失败"));
  });
  $("#fileEntries").addEventListener("click", async (event) => {
    const entry = event.target.closest("[data-file]");
    if (!entry) return;
    event.preventDefault();
    try {
      if (currentFileIsDirty()) await saveCurrentFile(false);
      await loadFile(entry.dataset.file);
    } catch (error) {
      toast(error.message || "文件读取失败");
    }
  });
  $("#saveFileButton").addEventListener("click", () => saveCurrentFile(true).catch((error) => toast(error.message || "保存失败")));
  $("#newFileButton").addEventListener("click", async () => {
    if (!interactiveTerminal.sessionId) return toast("请先连接实验终端");
    const path = prompt("请输入新文件名（可包含子目录）", activeLab?.techPlatform === "Python" ? "main.py" : activeLab?.techPlatform === "Java" ? "Main.java" : activeLab?.techPlatform === "数据库" ? "main.sql" : "notes.txt");
    if (!path) return;
    try {
      const response = await fetch("/api/lab/file", { method: "POST", headers: { ...terminalRequestHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ path, content: "" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "新建文件失败");
      files[path] = "";
      await loadWorkspaceFiles();
      await loadFile(path);
    } catch (error) { toast(error.message || "新建文件失败"); }
  });
  $("#autoTestButton").addEventListener("click", () => runTest(true, $("#autoTestButton")));
  $("#evaluateButton").addEventListener("click", () => runTest(true));
  $("#terminalInput").addEventListener("keydown", (event) => {
    const input = event.target;
    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      $("#terminalOutput").innerHTML = "";
      input.value = "";
      const prompt = document.createElement("div");
      prompt.innerHTML = '<span class="terminal-prompt">cloudlab@lab-node-01:~/workspace$</span> <span class="cursor"></span>';
      $("#terminalOutput").appendChild(prompt);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (!terminalState.history.length) return;
      terminalState.historyIndex = Math.max(0, Math.min(terminalState.history.length, terminalState.historyIndex + (event.key === "ArrowUp" ? -1 : 1)));
      input.value = terminalState.history[terminalState.historyIndex] || "";
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = input.value.trim();
    if (!value || input.disabled) return;
    if (terminalState.history.at(-1) !== value) terminalState.history.push(value);
    terminalState.historyIndex = terminalState.history.length;
    input.value = "";
    executeTerminalCommand(value);
  });
  $("#refreshEnvironment").addEventListener("click", refreshLabStatus);
  $("#resetEnvironment").addEventListener("click", async () => {
    if (!confirm("重置后当前实验环境中的命令和临时文件将无法恢复，确定继续吗？")) return;
    $("#environmentStatus").textContent = "环境重置中";
    $("#footerState").textContent = "正在重置实验环境";
    try {
      const response = await fetch("/api/lab/reset", { method: "POST", headers: terminalRequestHeaders() });
      const body = await response.json();
      if (!response.ok || !body.reset) throw new Error(body.output || "重置失败");
      $("#environmentStatus").textContent = `${activeLab?.techPlatform || "Linux"} 环境运行中`;
      $("#footerState").textContent = "环境已重置 · 可重新开始";
      interactiveTerminal.terminal?.clear();
      interactiveTerminal.terminal?.write("\x1b[2J\x1b[H\x1b[32m实验工作目录已重置。\x1b[0m\r\n");
      Object.keys(files).forEach((key) => delete files[key]);
      await loadWorkspaceFiles();
      toast("实验工作目录已真实重置");
    } catch (error) {
      $("#environmentStatus").textContent = "环境重置失败";
      toast(error.message || "环境重置失败");
    }
  });
  $("#newTerminal").addEventListener("click", async () => {
    if (interactiveTerminal.sessionId && !confirm("重建终端会清除当前容器中的临时文件，确定继续吗？")) return;
    await ensureInteractiveTerminal(true);
  });
  $("#reconnectTerminal").addEventListener("click", () => ensureInteractiveTerminal(true));
  $("#prevButton").addEventListener("click", () => navigateCheckpoint(-1));
  $("#nextButton").addEventListener("click", () => navigateCheckpoint(1));
  $("#focusButton").addEventListener("click", () => $(".app-shell").classList.toggle("focus-lab"));
  $("#expandLab").addEventListener("click", () => $(".app-shell").classList.toggle("focus-lab"));
  $("#settingsButton").addEventListener("click", () => {
    const limits = interactiveTerminal.limits || { memoryMiB: 256, cpu: 0.25, maxMinutes: activeLab?.duration || 120 };
    toast(`隔离限制：${limits.memoryMiB} MiB 内存、${limits.cpu} 核 CPU、无网络、${limits.maxMinutes} 分钟自动回收`);
  });
  $("#unlockAnswer").addEventListener("click", () => toast("提示：依次执行 touch notes.txt、chmod 600 notes.txt，再用 stat 查看权限"));
  $("#referenceAnswerOptions").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-answer-index]");
    if (!button || !activeLab) return;
    const answer = activeLab.evaluationConfig?.referenceAnswers?.[Number(button.dataset.answerIndex)];
    if (!answer) return;
    try {
      let content = answer.content;
      if (apiEnabled) {
        const response = await fetch("/api/lab/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labId: activeProject?.id, checkpointId: activeCheckpoints[activeCheckpointIndex]?.id || "", index: Number(button.dataset.answerIndex) }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "参考答案读取失败");
        content = body.content;
      }
      state.answerDeduction = Math.max(state.answerDeduction, Number(answer.deductionPercent || 0));
      $("#referenceAnswerContent").textContent = content || "教师尚未填写参考内容。";
      $("#referenceAnswerContent").hidden = false;
      await recordProgress({ kind: "操作", title: `查看参考答案：${answer.name}`, detail: `本次正式评测最高扣减 ${state.answerDeduction} 分` });
    } catch (error) { toast(error.message || "参考答案读取失败"); }
  });
  $("#likeButton").addEventListener("click", () => { state.liked = !state.liked; $("#likeButton").textContent = state.liked ? "♥" : "♡"; $("#likeButton").style.color = state.liked ? "#e66c73" : ""; });
  $("#sendComment").addEventListener("click", async () => {
    const value = $("#commentInput").value.trim();
    if (!value) return toast("请输入评论内容");
    try {
      if (apiEnabled) {
        const response = await fetch("/api/lab-comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labId: activeProject?.id, checkpointId: activeLab?.id, authorId: "student-current", authorName: "当前学生", text: value }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message || "评论发布失败"); comments.unshift(body.comment);
      } else {
        comments.unshift({ text: value.slice(0, 1000), authorName: "我", at: new Date().toISOString() }); comments = comments.slice(0, 30); localStorage.setItem("cloudlab-comments", JSON.stringify(comments));
      }
      $("#commentInput").value = ""; renderComments(); toast("评论已发布");
    } catch (error) { toast(error.message || "评论发布失败"); }
  });
  await loadComments();
  await loadProgress();
  refreshLabStatus();
  if (activeLab?.builtIn) ensureInteractiveTerminal().catch((error) => toast(error.message || "实验环境启动失败"));
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", () => {
  interactiveTerminal.closing = true;
  try { interactiveTerminal.socket?.close(1000, "page-unload"); } catch {}
});
