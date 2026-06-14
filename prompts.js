export function buildChatPrompt({ userMessage, rulesText, recentMessages = [], vocabulary = [] }) {
  return [
    appSystemText(rulesText),
    richAnswerStyle(),
    formatVocabularyContext(vocabulary),
    formatRecentMessages(recentMessages),
    `User message:\n${userMessage}`,
    "Answer in a natural Gemini-like chat style. Do not save, delete, or change data unless the app asks you through a structured prompt."
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildSavePrompt({ userMessage, rulesText, recentMessages = [] }) {
  return [
    appSystemText(rulesText),
    "Extract only vocabulary items the user asked to save or summarize into the wordbook.",
    "Return JSON only in this shape:",
    '{"items":[{"term":"","type":"","cnMeaning":"","enMeaning":"","wordFamily":[],"collocations":[],"examples":[],"scenarios":[],"tags":[],"aiSummary":"","userNotes":""}]}',
    formatRecentMessages(recentMessages),
    `User save request:\n${userMessage}`
  ].join("\n\n");
}

export function buildSearchPrompt({ userMessage, rulesText, vocabulary = [] }) {
  return [
    appSystemText(rulesText),
    "The following vocabulary items are already saved. Use them first.",
    JSON.stringify(vocabulary, null, 2),
    "Answer the user's request. Clearly separate saved wordbook information from temporary extra explanation.",
    `User request:\n${userMessage}`
  ].join("\n\n");
}

export function buildGeneratePrompt({ userMessage, rulesText, vocabulary = [] }) {
  return [
    appSystemText(rulesText),
    richAnswerStyle(),
    "The user explicitly asked to generate new vocabulary. Follow only the current saved rules and the user's latest request.",
    "Do not assume any default number or format unless the user or saved rules specify it.",
    "When recommending new words, avoid words or phrases that are already saved, and avoid obvious derivatives of saved words unless the user explicitly asks for them.",
    "When writing examples, reuse saved vocabulary naturally where useful so the user's wordbook becomes a connected word network.",
    formatVocabularyContext(vocabulary),
    `User request:\n${userMessage}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function appSystemText(rulesText) {
  const cleaned = String(rulesText || "").trim();
  return [
    "You are an English learning assistant inside a personal vocabulary app.",
    "There are no preset learning rules.",
    cleaned ? `Current user-created rules:\n${cleaned}` : "Current user-created rules: none.",
    "If no user-created rules exist, answer only the current request without forcing a study template.",
    "Do not claim an item is saved unless it appears in provided app data."
  ].join("\n");
}

function richAnswerStyle() {
  return [
    "Response style:",
    "- Give a complete, helpful answer rather than a short tool response.",
    "- Use clear Markdown structure when useful: headings, bullets, numbered steps, bold terms, and tables.",
    "- For English learning questions, explain nuance, natural usage, common mistakes, and provide practical examples when relevant.",
    "- Match the user's language. Chinese explanations are welcome, with English examples kept natural.",
    "- Do not be verbose for simple questions, but do not under-answer learning requests."
  ].join("\n");
}

function formatVocabularyContext(vocabulary) {
  if (!vocabulary.length) return "";
  return `Relevant saved vocabulary:\n${JSON.stringify(vocabulary.slice(0, 12), null, 2)}`;
}

function formatRecentMessages(messages) {
  if (!messages.length) return "";
  const visible = messages.slice(-8).map((message) => `${message.role}: ${message.text}`).join("\n");
  return `Recent chat context:\n${visible}`;
}
