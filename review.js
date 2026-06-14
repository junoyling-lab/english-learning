const REVIEW_WEIGHT = {
  "不会": 0,
  "模糊": 1,
  "会了": 3
};

export function sortForReview(items, query = "") {
  const lower = String(query || "").toLowerCase();
  return [...items]
    .filter((item) => {
      if (!lower) return true;
      const haystack = [
        item.term,
        item.cnMeaning,
        item.enMeaning,
        item.userNotes,
        item.aiSummary,
        ...(item.scenarios || []),
        ...(item.tags || [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(lower) || (lower.includes("重要") && item.isImportant) || haystack.includes(lower);
    })
    .sort((a, b) => score(a) - score(b));
}

function score(item) {
  const statusWeight = REVIEW_WEIGHT[item.reviewStatus] ?? 2;
  const importantBoost = item.isImportant ? -1.5 : 0;
  const due = item.nextReviewAt ? new Date(item.nextReviewAt).getTime() : 0;
  const dueWeight = Number.isFinite(due) ? due / 10000000000000 : 0;
  return statusWeight + importantBoost + dueWeight;
}

export function nextReviewDate(status, isImportant) {
  const date = new Date();
  let days = 3;
  if (status === "不会") days = 1;
  if (status === "模糊") days = 2;
  if (status === "会了") days = isImportant ? 4 : 7;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
