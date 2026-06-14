export function classifyLocalIntent(text) {
  const message = String(text || "").trim();
  const lower = message.toLowerCase();

  if (/^(显示|查看|呼出).*(规则)|规则是什么|current rules/i.test(message)) return { intent: "show_rules" };
  if (/忘掉所有规则|清空规则|删除所有规则|取消所有规则/i.test(message)) return { intent: "clear_rules" };
  if (/^(撤销|undo)$/i.test(message)) return { intent: "undo" };
  if (/(以后|之后|接下来|从现在开始).*(规则|每个词|解释|例句|同根词|搭配|不要|需要|尽量)/i.test(message)) {
    return { intent: "set_rules", rulesText: message };
  }
  if (/(取消|不要).*(规则|同根词|例句|搭配|限制)/i.test(message)) return { intent: "set_rules", rulesText: message };
  if (/太基础|太简单|过于基础|特别好|很好用|好词|不实用|太生僻|过于生僻/i.test(message)) {
    return { intent: "set_rules", rulesText: `用户反馈：${message}` };
  }
  if (/(给我|生成|整理).*(\d+|一|二|三|四|五|六|七|八|九|十).*(单词|词语|表达|短语)/i.test(message)) {
    return { intent: "generate_words" };
  }
  if (/(总结|保存|存到|加入).*(单词本|词库|wordbook)|存到单词本|加入单词本/i.test(message)) {
    return { intent: "save_summary" };
  }
  if (/(删除|删掉|移除).+/i.test(message)) return { intent: "delete_word", term: extractAfterVerb(message, ["删除", "删掉", "移除"]) };
  if (/标记为重要|设为重要/i.test(message)) return { intent: "mark_important", term: extractBeforePhrase(message, ["标记为重要", "设为重要"]) };
  if (/(加笔记|添加笔记|备注)/i.test(message)) return { intent: "add_note" };
  if (/(复习|review)/i.test(message)) return { intent: "review" };
  if (/(从.*单词库.*找|找.*词|表达.*更专业|适合.*表达|wordbook)/i.test(message)) return { intent: "search_wordbook" };

  return { intent: "chat" };
}

function extractAfterVerb(message, verbs) {
  for (const verb of verbs) {
    const index = message.indexOf(verb);
    if (index >= 0) return message.slice(index + verb.length).replace(/[。.!！]/g, "").trim();
  }
  return "";
}

function extractBeforePhrase(message, phrases) {
  for (const phrase of phrases) {
    const index = message.indexOf(phrase);
    if (index > 0) return message.slice(0, index).replace(/^把/, "").trim();
  }
  return "";
}

export function mergeRuleText(currentText, newInstruction) {
  const text = String(newInstruction || "").trim();
  if (!text) return currentText || "";
  if (/^(把|将).*(改成|改为)/.test(text) || /取消|不要/.test(text)) {
    return [currentText, text].filter(Boolean).join("\n");
  }
  return [currentText, text].filter(Boolean).join("\n");
}

export function formatRules(rules) {
  const text = String(rules?.rulesText || "").trim();
  return text ? `当前规则：\n${text}` : "目前还没有设置规则。";
}
