const DB_NAME = "geminiEnglishLearning";
const DB_VERSION = 1;
const STORES = {
  vocabulary: "vocabulary",
  rules: "rules",
  logs: "logs"
};

let dbPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.vocabulary)) {
        const store = db.createObjectStore(STORES.vocabulary, { keyPath: "id" });
        store.createIndex("termKey", "termKey", { unique: true });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORES.rules)) {
        db.createObjectStore(STORES.rules, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.logs)) {
        const store = db.createObjectStore(STORES.logs, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeTerm(term) {
  return String(term || "").trim().toLowerCase();
}

function cleanArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,，;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeItem(raw, existing = null) {
  const stamp = now();
  const term = String(raw.term || existing?.term || "").trim();
  return {
    id: existing?.id || raw.id || uid(),
    term,
    termKey: normalizeTerm(term),
    type: raw.type || existing?.type || "",
    cnMeaning: raw.cnMeaning || existing?.cnMeaning || "",
    enMeaning: raw.enMeaning || existing?.enMeaning || "",
    wordFamily: cleanArray(raw.wordFamily ?? existing?.wordFamily),
    collocations: cleanArray(raw.collocations ?? existing?.collocations),
    examples: cleanArray(raw.examples ?? existing?.examples),
    scenarios: cleanArray(raw.scenarios ?? existing?.scenarios),
    tags: cleanArray(raw.tags ?? existing?.tags),
    aiSummary: raw.aiSummary || existing?.aiSummary || "",
    userNotes: raw.userNotes || existing?.userNotes || "",
    reviewStatus: raw.reviewStatus || existing?.reviewStatus || "模糊",
    isImportant: Boolean(raw.isImportant ?? existing?.isImportant ?? false),
    nextReviewAt: raw.nextReviewAt || existing?.nextReviewAt || stamp,
    createdAt: existing?.createdAt || raw.createdAt || stamp,
    updatedAt: stamp,
    deletedAt: raw.deletedAt ?? existing?.deletedAt ?? null,
    syncStatus: "local"
  };
}

export async function getRules() {
  const store = await tx(STORES.rules);
  const rules = await requestToPromise(store.get("active"));
  return rules || { id: "active", rulesText: "", structuredRules: {}, updatedAt: null };
}

export async function saveRules(rulesText, structuredRules = {}, options = {}) {
  const record = { id: "active", rulesText: String(rulesText || "").trim(), structuredRules, updatedAt: now() };
  const store = await tx(STORES.rules, "readwrite");
  await requestToPromise(store.put(record));
  if (options.log !== false) {
    await addLog({ actionType: "update", targetType: "rules", targetId: "active", before: null, after: record });
  }
  return record;
}

export async function clearRules() {
  const before = await getRules();
  const record = { id: "active", rulesText: "", structuredRules: {}, updatedAt: now() };
  const store = await tx(STORES.rules, "readwrite");
  await requestToPromise(store.put(record));
  await addLog({ actionType: "clear", targetType: "rules", targetId: "active", before, after: record });
  return record;
}

export async function getAllVocabulary(includeDeleted = false) {
  const store = await tx(STORES.vocabulary);
  const items = await requestToPromise(store.getAll());
  return items
    .filter((item) => includeDeleted || !item.deletedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function findByTerm(term, includeDeleted = false) {
  const store = await tx(STORES.vocabulary);
  const item = await requestToPromise(store.index("termKey").get(normalizeTerm(term)));
  if (!item) return null;
  if (!includeDeleted && item.deletedAt) return null;
  return item;
}

export async function upsertVocabulary(raw) {
  if (!String(raw.term || "").trim()) throw new Error("Missing vocabulary term");
  const existing = await findByTerm(raw.term, true);
  const item = normalizeItem({ ...raw, deletedAt: null }, existing);
  const store = await tx(STORES.vocabulary, "readwrite");
  await requestToPromise(store.put(item));
  await addLog({
    actionType: existing ? "update" : "create",
    targetType: "vocabulary",
    targetId: item.id,
    before: existing,
    after: item
  });
  return item;
}

export async function updateVocabulary(termOrId, patch) {
  const item = await getVocabularyByTermOrId(termOrId, true);
  if (!item) throw new Error(`Cannot find ${termOrId}`);
  const updated = normalizeItem({ ...item, ...patch }, item);
  const store = await tx(STORES.vocabulary, "readwrite");
  await requestToPromise(store.put(updated));
  await addLog({ actionType: "update", targetType: "vocabulary", targetId: item.id, before: item, after: updated });
  return updated;
}

export async function softDeleteVocabulary(termOrId) {
  const item = await getVocabularyByTermOrId(termOrId, true);
  if (!item) throw new Error(`Cannot find ${termOrId}`);
  const deleted = { ...item, deletedAt: now(), updatedAt: now(), syncStatus: "local" };
  const store = await tx(STORES.vocabulary, "readwrite");
  await requestToPromise(store.put(deleted));
  await addLog({ actionType: "delete", targetType: "vocabulary", targetId: item.id, before: item, after: deleted });
  return deleted;
}

export async function getVocabularyByTermOrId(value, includeDeleted = false) {
  const store = await tx(STORES.vocabulary);
  const byId = await requestToPromise(store.get(value));
  const item = byId || (await requestToPromise(store.index("termKey").get(normalizeTerm(value))));
  if (!item) return null;
  if (!includeDeleted && item.deletedAt) return null;
  return item;
}

export async function addLog(raw) {
  const store = await tx(STORES.logs, "readwrite");
  const record = { id: uid(), createdAt: now(), ...raw };
  await requestToPromise(store.put(record));
  return record;
}

export async function getLatestLog() {
  const store = await tx(STORES.logs);
  const logs = await requestToPromise(store.getAll());
  return logs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

export async function undoLatest() {
  const latest = await getLatestLog();
  if (!latest) return null;
  if (latest.targetType === "vocabulary") {
    const store = await tx(STORES.vocabulary, "readwrite");
    if (latest.before) {
      await requestToPromise(store.put(latest.before));
    } else if (latest.after?.id) {
      await requestToPromise(store.delete(latest.after.id));
    }
  }
  if (latest.targetType === "rules") {
    const store = await tx(STORES.rules, "readwrite");
    await requestToPromise(store.put(latest.before || { id: "active", rulesText: "", structuredRules: {}, updatedAt: now() }));
  }
  const logStore = await tx(STORES.logs, "readwrite");
  await requestToPromise(logStore.delete(latest.id));
  return latest;
}

export async function searchVocabulary(query) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const items = await getAllVocabulary();
  if (!terms.length) return items;
  return items
    .map((item) => {
      const haystack = [
        item.term,
        item.type,
        item.cnMeaning,
        item.enMeaning,
        item.aiSummary,
        item.userNotes,
        ...(item.wordFamily || []),
        ...(item.collocations || []),
        ...(item.examples || []),
        ...(item.scenarios || []),
        ...(item.tags || [])
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

export async function exportData() {
  return {
    exportedAt: now(),
    vocabulary: await getAllVocabulary(true),
    rules: await getRules(),
    logs: await (async () => {
      const store = await tx(STORES.logs);
      return requestToPromise(store.getAll());
    })()
  };
}

export async function importData(data) {
  for (const item of data.vocabulary || []) {
    const vocabStore = await tx(STORES.vocabulary, "readwrite");
    await requestToPromise(vocabStore.put({ ...item, termKey: normalizeTerm(item.term), syncStatus: "local" }));
  }
  if (data.rules) {
    const ruleStore = await tx(STORES.rules, "readwrite");
    await requestToPromise(ruleStore.put(data.rules));
  }
  for (const log of data.logs || []) {
    const logStore = await tx(STORES.logs, "readwrite");
    await requestToPromise(logStore.put(log));
  }
}
