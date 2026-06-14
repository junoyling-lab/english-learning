const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CACHE_KEY = "geminiModelName";
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash"
];

export function getStoredApiKey() {
  return localStorage.getItem("geminiApiKey") || "";
}

export function setStoredApiKey(key) {
  localStorage.setItem("geminiApiKey", String(key || "").trim());
}

export async function callGemini({ apiKey, prompt, model }) {
  if (!apiKey) throw new Error("Missing Gemini API key");
  const modelNames = model ? [model] : await getModelCandidates(apiKey);
  let lastError;
  for (const modelName of modelNames) {
    try {
      const result = await generateWithModel({ apiKey, prompt, model: modelName });
      localStorage.setItem(MODEL_CACHE_KEY, modelName);
      return result;
    } catch (error) {
      lastError = error;
      if (!/not found|not supported|404|generateContent/i.test(error.message)) throw error;
    }
  }
  throw lastError || new Error("No Gemini model is available for generateContent");
}

async function generateWithModel({ apiKey, prompt, model }) {
  const response = await fetch(`${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Gemini request failed";
    throw new Error(message);
  }
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim() || "";
}

async function getModelCandidates(apiKey) {
  const cached = localStorage.getItem(MODEL_CACHE_KEY);
  const discovered = await listGenerateContentModels(apiKey).catch(() => []);
  return unique([
    cached,
    ...MODEL_CANDIDATES,
    ...discovered
  ].filter(Boolean));
}

async function listGenerateContentModels(apiKey) {
  const response = await fetch(`${API_BASE}?key=${encodeURIComponent(apiKey)}`);
  const data = await response.json();
  if (!response.ok) return [];
  const models = data.models || [];
  return models
    .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
    .map((model) => String(model.name || "").replace(/^models\//, ""))
    .sort((a, b) => modelRank(a) - modelRank(b));
}

function modelRank(name) {
  const lower = name.toLowerCase();
  if (lower.includes("flash")) return 0;
  if (lower.includes("pro")) return 1;
  return 2;
}

function unique(values) {
  return [...new Set(values)];
}

export function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}
