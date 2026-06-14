import {
  clearRules,
  exportData,
  getAllVocabulary,
  getRules,
  importData,
  searchVocabulary,
  saveRules,
  softDeleteVocabulary,
  undoLatest,
  updateVocabulary,
  upsertVocabulary
} from "./db.js";
import { callGemini, extractJson, getStoredApiKey, setStoredApiKey } from "./gemini.js";
import { buildChatPrompt, buildGeneratePrompt, buildSavePrompt, buildSearchPrompt } from "./prompts.js";
import { classifyLocalIntent, formatRules, mergeRuleText } from "./rules.js";
import { nextReviewDate, sortForReview } from "./review.js";

const state = {
  rules: null,
  vocabulary: [],
  messages: [],
  deferredPrompt: null,
  isBusy: false
};

const ACCESS_HASH = "817b662f67b67f7a03e10a15814fa50a90a30645d5522f604a61d61104af41d4";
const ACCESS_GRANTED_KEY = "englishLearningAccessGranted";
const DEFAULT_RULES_KEY = "defaultLearningRulesInitialized";
const DEFAULT_RULES_VERSION_KEY = "defaultLearningRulesVersion";
const RULES_CLEARED_KEY = "learningRulesCleared";
const DEFAULT_RULES_VERSION = "2";
const DEFAULT_LEARNING_RULES = [
  "📝 1. 单词内容构成：新单词包含音标、中文释义、高频搭配、五个例句、同根词，以及每个同根词的三个例句。请注意：已移除英文解释，不再提供英文释义。",
  "🚫 2. 词汇选择原则：避免推荐词库中已有词的衍生词。例如已有 alignment 后，不再推荐 misalignment 或 alignment drift。",
  "💡 3. 词汇实用性导向：不推荐过于生僻、为高级而高级但不实用的词汇，一切以职场实用性为主。",
  "🔗 4. 例句关联网络：例句中尽量引用单词本里已有的词汇，帮助构建词汇之间的联系，形成词网。",
  "🧑‍💼 5. 用户背景定制：用户在澳洲西人公司有四年团队负责人经验，不推荐过于基础的词汇。",
  "🗣️ 6. 智能反馈机制：如果用户反馈某个词太基础，或者某个词特别好，要利用这些反馈优化后续的单词推荐。",
  "🧠 7. 中文释义深度：单词不再提供英文释义，只提供中文释义。中文释义除了字典标准解释外，还必须包含从实际应用场景出发的更深入、更贴切的解读。",
  "✨ 8. 回答内容设计：回答内容，特别是列出单词时，要提高可读性和设计感，灵活使用小图标、横向段落分割线、粗体等 Markdown 元素。高频搭配中的每个搭配单独占一行，并且中文释义用空格隔开。"
].join("\n");

const els = {
  accessGate: document.querySelector("#accessGate"),
  accessForm: document.querySelector("#accessForm"),
  accessPassword: document.querySelector("#accessPassword"),
  accessError: document.querySelector("#accessError"),
  appShell: document.querySelector("#appShell"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveKeyBtn: document.querySelector("#saveKeyBtn"),
  openKeyBtn: document.querySelector("#openKeyBtn"),
  closeKeyBtn: document.querySelector("#closeKeyBtn"),
  keyDialog: document.querySelector("#keyDialog"),
  keyStatus: document.querySelector("#keyStatus"),
  sendBtn: document.querySelector("#chatForm button[type='submit']"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  ruleSummary: document.querySelector("#ruleSummary"),
  undoBtn: document.querySelector("#undoBtn"),
  wordCount: document.querySelector("#wordCount"),
  wordList: document.querySelector("#wordList"),
  searchInput: document.querySelector("#searchInput"),
  reviewList: document.querySelector("#reviewList"),
  refreshReviewBtn: document.querySelector("#refreshReviewBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  installBtn: document.querySelector("#installBtn")
};

init();

async function init() {
  bindAccessGate();
  if (!hasAccess()) {
    els.accessPassword.focus();
    return;
  }
  await startApp();
}

async function startApp() {
  unlockApp();
  els.apiKeyInput.value = getStoredApiKey();
  bindEvents();
  await initializeDefaultRules();
  await refreshState();
  renderKeyStatus();
  addMessage("assistant", "你好。默认学习规则已经准备好。你可以说“显示当前规则”查看，也可以在聊天里继续修改或清空规则。");
  registerServiceWorker();
}

function bindAccessGate() {
  els.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = els.accessPassword.value;
    if (await verifyAccess(password)) {
      localStorage.setItem(ACCESS_GRANTED_KEY, "true");
      els.accessPassword.value = "";
      els.accessError.classList.add("hidden");
      await startApp();
      return;
    }
    els.accessError.classList.remove("hidden");
  });
}

function hasAccess() {
  return localStorage.getItem(ACCESS_GRANTED_KEY) === "true";
}

async function verifyAccess(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") === ACCESS_HASH;
}

function unlockApp() {
  els.accessGate.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.appShell.classList.remove("app-locked");
}

function bindEvents() {
  els.saveKeyBtn.addEventListener("click", () => {
    setStoredApiKey(els.apiKeyInput.value);
    renderKeyStatus();
    closeKeyDialog();
    addMessage("system", "Gemini API key 已保存在本机浏览器。");
  });

  els.openKeyBtn.addEventListener("click", openKeyDialog);
  els.closeKeyBtn.addEventListener("click", closeKeyDialog);
  els.keyDialog.addEventListener("click", (event) => {
    if (event.target === els.keyDialog) closeKeyDialog();
  });

  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.isBusy) return;
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    addMessage("user", text);
    await handleUserMessage(text);
  });

  els.undoBtn.addEventListener("click", async () => {
    const log = await undoLatest();
    addMessage("system", log ? "已撤销最近一次操作。" : "没有可以撤销的操作。");
    await refreshState();
  });

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.searchInput.addEventListener("input", () => renderWordList(els.searchInput.value));
  els.refreshReviewBtn.addEventListener("click", renderReviewList);
  els.exportBtn.addEventListener("click", exportBackup);
  els.importInput.addEventListener("change", importBackup);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    els.installBtn.classList.remove("hidden");
  });

  els.installBtn.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    els.installBtn.classList.add("hidden");
  });
}

async function initializeDefaultRules() {
  const rules = await getRules();
  const rulesCleared = localStorage.getItem(RULES_CLEARED_KEY) === "true";
  const alreadyInitialized = localStorage.getItem(DEFAULT_RULES_KEY) === "true";
  const currentVersion = localStorage.getItem(DEFAULT_RULES_VERSION_KEY);
  if (rulesCleared) return;
  if (alreadyInitialized && !rules.rulesText?.trim()) {
    localStorage.setItem(RULES_CLEARED_KEY, "true");
    return;
  }
  if (alreadyInitialized && currentVersion === DEFAULT_RULES_VERSION) return;
  if (rules.rulesText?.trim()) {
    await saveRules(DEFAULT_LEARNING_RULES, { source: "user_default_2026_06_14", version: DEFAULT_RULES_VERSION }, { log: false });
  } else {
    await saveRules(DEFAULT_LEARNING_RULES, { source: "user_default_2026_06_14", version: DEFAULT_RULES_VERSION }, { log: false });
  }
  localStorage.setItem(DEFAULT_RULES_KEY, "true");
  localStorage.setItem(DEFAULT_RULES_VERSION_KEY, DEFAULT_RULES_VERSION);
}

async function handleUserMessage(text) {
  const intent = classifyLocalIntent(text);
  try {
    if (intent.intent === "show_rules") {
      addMessage("assistant", formatRules(state.rules));
      return;
    }
    if (intent.intent === "clear_rules") {
      state.rules = await clearRules();
      localStorage.setItem(RULES_CLEARED_KEY, "true");
      addMessage("assistant", "已清空所有学习规则。");
      await refreshState();
      return;
    }
    if (intent.intent === "set_rules") {
      const nextText = mergeRuleText(state.rules?.rulesText || "", intent.rulesText || text);
      state.rules = await saveRules(nextText, {});
      localStorage.removeItem(RULES_CLEARED_KEY);
      addMessage("assistant", `规则已更新。\n${formatRules(state.rules)}`);
      await refreshState();
      return;
    }
    if (intent.intent === "undo") {
      const log = await undoLatest();
      addMessage("assistant", log ? "已撤销最近一次操作。" : "没有可以撤销的操作。");
      await refreshState();
      return;
    }
    if (intent.intent === "delete_word") {
      await deleteWord(intent.term || text);
      return;
    }
    if (intent.intent === "mark_important") {
      await markImportant(intent.term || text);
      return;
    }
    if (intent.intent === "add_note") {
      await addNoteFromText(text);
      return;
    }
    if (intent.intent === "review") {
      await respondWithReview(text);
      return;
    }
    if (intent.intent === "search_wordbook") {
      await respondWithSearch(text);
      return;
    }
    if (intent.intent === "save_summary") {
      await saveSummary(text);
      return;
    }
    if (intent.intent === "generate_words") {
      await generateWords(text);
      return;
    }
    await normalChat(text);
  } catch (error) {
    addMessage("system", `出现问题：${error.message}`);
  } finally {
    await refreshState();
  }
}

async function normalChat(text) {
  const candidates = await searchVocabulary(text);
  await runGeminiWithStatus({
    prompt: buildChatPrompt({
      userMessage: text,
      rulesText: state.rules?.rulesText,
      recentMessages: state.messages,
      vocabulary: candidates.slice(0, 8)
    }),
    loadingText: "AI 正在思考...",
    onAnswer: (answer) => answer
  });
}

async function generateWords(text) {
  await runGeminiWithStatus({
    prompt: buildGeneratePrompt({
      userMessage: text,
      rulesText: state.rules?.rulesText,
      vocabulary: state.vocabulary.slice(0, 80)
    }),
    loadingText: "AI 正在生成新词...",
    onAnswer: (answer) => answer
  });
}

async function saveSummary(text) {
  await runGeminiWithStatus({
    prompt: buildSavePrompt({ userMessage: text, rulesText: state.rules?.rulesText, recentMessages: state.messages }),
    loadingText: "AI 正在整理可保存的词条...",
    onAnswer: async (raw) => {
      const parsed = extractJson(raw);
      const items = parsed.items || [];
      if (!items.length) {
        return "我没有找到明确可以保存的词条。你可以说得更具体一点，比如“把 negotiate 和 renewal 存到单词本”。";
      }
      const saved = [];
      for (const item of items) {
        saved.push(await upsertVocabulary(item));
      }
      return `已保存 ${saved.length} 个词条：${saved.map((item) => item.term).join("、")}`;
    }
  });
}

async function deleteWord(term) {
  const clean = cleanTerm(term);
  if (!clean) {
    addMessage("assistant", "你想删除哪个词？例如：删除 negotiate");
    return;
  }
  await softDeleteVocabulary(clean);
  addMessage("assistant", `已删除 ${clean}。可以输入“撤销”恢复最近一次操作。`);
}

async function markImportant(term) {
  const clean = cleanTerm(term);
  if (!clean) {
    addMessage("assistant", "你想把哪个词标记为重要？例如：把 negotiate 标记为重要");
    return;
  }
  await updateVocabulary(clean, { isImportant: true });
  addMessage("assistant", `${clean} 已标记为重要。它表示你已经会了，但想多复习。`);
}

async function addNoteFromText(text) {
  const match = text.match(/(?:给|为|把)?\s*([A-Za-z][A-Za-z\s-]*)\s*(?:加笔记|添加笔记|备注)[:：]?\s*(.+)$/i);
  if (!match) {
    addMessage("assistant", "请这样写：给 negotiate 加笔记：适合邮件里用。");
    return;
  }
  const term = match[1].trim();
  const note = match[2].trim();
  const item = await updateVocabulary(term, { userNotes: note });
  addMessage("assistant", `已给 ${item.term} 保存笔记。`);
}

async function respondWithSearch(text) {
  const candidates = await searchVocabulary(text);
  if (!candidates.length) {
    await runGeminiWithStatus({
      prompt: buildChatPrompt({ userMessage: text, rulesText: state.rules?.rulesText, recentMessages: state.messages }),
      loadingText: "AI 正在查找和补充...",
      onAnswer: (answer) => `单词库里暂时没有明显匹配。\n\nGemini 临时补充：\n${answer}`
    });
    return;
  }
  await runGeminiWithStatus({
    prompt: buildSearchPrompt({ userMessage: text, rulesText: state.rules?.rulesText, vocabulary: candidates.slice(0, 10) }),
    loadingText: "AI 正在根据单词库组织回答...",
    onAnswer: (answer) => answer
  });
}

async function respondWithReview(text) {
  const items = sortForReview(state.vocabulary, text).slice(0, 8);
  if (!items.length) {
    addMessage("assistant", "目前没有可复习的词。");
    return;
  }
  const lines = items.map((item, index) => {
    const important = item.isImportant ? " · 重要" : "";
    const meaning = item.cnMeaning || item.enMeaning || item.aiSummary || "暂无解释";
    return `${index + 1}. ${item.term}（${item.reviewStatus}${important}）\n${meaning}`;
  });
  addMessage("assistant", `这次可以先复习这些：\n\n${lines.join("\n\n")}`);
}

async function askGemini(prompt) {
  const apiKey = getStoredApiKey();
  if (!apiKey) throw new Error("请先保存 Gemini API key。");
  const answer = await callGemini({ apiKey, prompt });
  return answer || "Gemini 没有返回内容。";
}

async function runGeminiWithStatus({ prompt, loadingText, onAnswer }) {
  const statusNode = addStatusMessage(loadingText);
  setBusy(true);
  try {
    const answer = await askGemini(prompt);
    const finalText = onAnswer ? await onAnswer(answer) : answer;
    replaceStatusMessage(statusNode, "assistant", finalText);
  } catch (error) {
    replaceStatusMessage(statusNode, "system", `出现问题：${error.message}`);
  } finally {
    setBusy(false);
  }
}

function addStatusMessage(text) {
  const node = document.createElement("div");
  node.className = "message assistant loading";
  node.innerHTML = `<span>${escapeHtml(text)}</span><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
  els.chatLog.appendChild(node);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return node;
}

function replaceStatusMessage(node, role, text) {
  node.className = `message ${role}`;
  if (role === "assistant") {
    node.innerHTML = renderMarkdown(text);
    state.messages.push({ role, text, createdAt: new Date().toISOString() });
    if (state.messages.length > 24) state.messages = state.messages.slice(-24);
  } else {
    node.textContent = text;
  }
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function setBusy(isBusy) {
  state.isBusy = isBusy;
  els.chatInput.disabled = isBusy;
  els.sendBtn.disabled = isBusy;
  els.sendBtn.textContent = isBusy ? "生成中..." : "发送";
}

function addMessage(role, text) {
  const message = { role, text, createdAt: new Date().toISOString() };
  state.messages.push(message);
  if (state.messages.length > 24) state.messages = state.messages.slice(-24);
  const node = document.createElement("div");
  node.className = `message ${role}`;
  if (role === "assistant") {
    node.innerHTML = renderMarkdown(text);
  } else {
    node.textContent = text;
  }
  els.chatLog.appendChild(node);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

async function refreshState() {
  state.rules = await getRules();
  state.vocabulary = await getAllVocabulary();
  renderRuleSummary();
  renderWordList(els.searchInput?.value || "");
  renderReviewList();
}

function renderRuleSummary() {
  const text = state.rules?.rulesText?.trim();
  els.ruleSummary.textContent = text ? `当前规则：${text.split("\n").slice(-1)[0]}` : "当前没有设置学习规则。";
}

function renderKeyStatus() {
  const hasKey = Boolean(getStoredApiKey());
  els.keyStatus.textContent = hasKey ? "已保存" : "未设置";
  els.keyStatus.classList.toggle("saved", hasKey);
}

function openKeyDialog() {
  els.apiKeyInput.value = getStoredApiKey();
  els.keyDialog.classList.remove("hidden");
  els.apiKeyInput.focus();
}

function closeKeyDialog() {
  els.keyDialog.classList.add("hidden");
}

function renderWordList(query = "") {
  const filtered = filterWords(state.vocabulary, query);
  els.wordCount.textContent = `${state.vocabulary.length} 个词条`;
  if (!filtered.length) {
    els.wordList.innerHTML = `<div class="empty">还没有匹配的词条。</div>`;
    return;
  }
  els.wordList.innerHTML = filtered.map(wordCardTemplate).join("");
  els.wordList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (action === "important") await updateVocabulary(id, { isImportant: true });
      if (action === "known") await updateVocabulary(id, { reviewStatus: "会了", nextReviewAt: nextReviewDate("会了", button.dataset.important === "true") });
      if (action === "fuzzy") await updateVocabulary(id, { reviewStatus: "模糊", nextReviewAt: nextReviewDate("模糊", button.dataset.important === "true") });
      if (action === "unknown") await updateVocabulary(id, { reviewStatus: "不会", nextReviewAt: nextReviewDate("不会", button.dataset.important === "true") });
      if (action === "delete") await softDeleteVocabulary(id);
      await refreshState();
    });
  });
}

function renderReviewList() {
  const items = sortForReview(state.vocabulary).slice(0, 12);
  if (!items.length) {
    els.reviewList.innerHTML = `<div class="empty">还没有可复习的词。</div>`;
    return;
  }
  els.reviewList.innerHTML = items.map(wordCardTemplate).join("");
}

function filterWords(items, query) {
  const lower = String(query || "").trim().toLowerCase();
  if (!lower) return items;
  return items.filter((item) =>
    [
      item.term,
      item.type,
      item.cnMeaning,
      item.enMeaning,
      item.userNotes,
      item.aiSummary,
      ...(item.wordFamily || []),
      ...(item.collocations || []),
      ...(item.examples || []),
      ...(item.scenarios || []),
      ...(item.tags || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(lower)
  );
}

function wordCardTemplate(item) {
  const badges = [
    item.reviewStatus ? `<span class="badge">${escapeHtml(item.reviewStatus)}</span>` : "",
    item.isImportant ? `<span class="badge important">重要</span>` : "",
    ...(item.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`)
  ].join("");
  const examples = (item.examples || []).slice(0, 3).map((example) => `<li>${escapeHtml(example)}</li>`).join("");
  return `
    <article class="word-card">
      <div class="word-title">
        <h3>${escapeHtml(item.term)}</h3>
        <span>${escapeHtml(item.type || "")}</span>
      </div>
      <p>${escapeHtml(item.cnMeaning || item.enMeaning || item.aiSummary || "暂无解释")}</p>
      ${badges ? `<div class="badge-row">${badges}</div>` : ""}
      ${item.userNotes ? `<p><strong>笔记：</strong>${escapeHtml(item.userNotes)}</p>` : ""}
      ${examples ? `<ul>${examples}</ul>` : ""}
      <div class="card-actions">
        <button type="button" data-action="important" data-id="${item.id}">重要</button>
        <button type="button" class="secondary" data-action="known" data-id="${item.id}" data-important="${item.isImportant}">会了</button>
        <button type="button" class="secondary" data-action="fuzzy" data-id="${item.id}" data-important="${item.isImportant}">模糊</button>
        <button type="button" class="secondary" data-action="unknown" data-id="${item.id}" data-important="${item.isImportant}">不会</button>
        <button type="button" class="danger" data-action="delete" data-id="${item.id}">删除</button>
      </div>
    </article>
  `;
}

function switchView(view) {
  const targetPanel = document.querySelector(`#${view}View`);
  const shouldHide = targetPanel && !targetPanel.classList.contains("hidden");
  document.querySelectorAll(".tab-btn").forEach((button) => button.classList.toggle("active", !shouldHide && button.dataset.view === view));
  document.querySelector("#wordbookView").classList.toggle("hidden", shouldHide || view !== "wordbook");
  document.querySelector("#reviewView").classList.toggle("hidden", shouldHide || view !== "review");
  document.querySelector("#backupView").classList.toggle("hidden", shouldHide || view !== "backup");
}

async function exportBackup() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `english-learning-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  await importData(JSON.parse(text));
  addMessage("system", "备份已导入。");
  event.target.value = "";
  await refreshState();
}

function cleanTerm(text) {
  return String(text || "")
    .replace(/^把/, "")
    .replace(/标记为重要|设为重要|重要|删除|删掉|移除/g, "")
    .replace(/[。.!！]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split(/\n/);
  const html = [];
  let inList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (inOrderedList) {
      html.push("</ol>");
      inOrderedList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeLists();
      html.push(`<h4>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h4>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeLists();
      html.push(`<h3>${inlineMarkdown(line.replace(/^##\s+/, ""))}</h3>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeLists();
      html.push(`<h3>${inlineMarkdown(line.replace(/^#\s+/, ""))}</h3>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inOrderedList) {
        html.push("</ol>");
        inOrderedList = false;
      }
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      if (!inOrderedList) {
        html.push("<ol>");
        inOrderedList = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    closeLists();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeLists();
  return html.join("");
}

function inlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
