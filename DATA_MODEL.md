# Data Model

All records include cloud-friendly fields so local data can later be synced.

## VocabularyItem

```json
{
  "id": "uuid",
  "term": "negotiate",
  "type": "verb",
  "cnMeaning": "协商，谈判",
  "enMeaning": "to discuss in order to reach an agreement",
  "wordFamily": ["negotiation", "negotiator"],
  "collocations": ["negotiate a contract"],
  "examples": ["We need to negotiate the renewal terms."],
  "scenarios": ["leasing", "workplace communication"],
  "tags": ["workplace"],
  "aiSummary": "A practical verb for formal discussion.",
  "userNotes": "Useful in renewal emails.",
  "reviewStatus": "模糊",
  "isImportant": true,
  "nextReviewAt": "2026-06-11T00:00:00.000Z",
  "createdAt": "2026-06-11T00:00:00.000Z",
  "updatedAt": "2026-06-11T00:00:00.000Z",
  "deletedAt": null,
  "syncStatus": "local"
}
```

`reviewStatus` values:

- `会了`
- `模糊`
- `不会`

`isImportant` means the user knows the item but wants more review.

## LearningRules

```json
{
  "id": "active",
  "rulesText": "",
  "structuredRules": {},
  "updatedAt": "2026-06-11T00:00:00.000Z"
}
```

Initial state is populated once with the user's requested default learning rules. If the user clears rules, the empty state is respected.

## OperationLog

```json
{
  "id": "uuid",
  "actionType": "update",
  "targetType": "vocabulary",
  "targetId": "uuid",
  "before": {},
  "after": {},
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

Used for undoing the latest AI operation.
