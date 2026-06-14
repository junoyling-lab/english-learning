# Product Spec

## Goal

Build a personal English learning assistant that feels like a chat-based AI tutor while maintaining a durable local vocabulary database.

## Core Principles

- Start with the user's requested default learning rules.
- No automatic daily word generation.
- Chat is the main control surface.
- Gemini can answer freely, but persistent vocabulary data is only saved when requested.
- Saved data is structured enough to migrate to cloud sync later.

## User Flows

### Chat and Learn

The user asks English questions naturally. If no rules are set, Gemini answers only the current request without forcing a wordbook format.

### Default and Chat Rules

The app initializes once with the user's requested learning rules for practical workplace vocabulary. The user can still change or clear them through chat. The default vocabulary format excludes English explanations and uses Chinese meanings with practical context.

### Set Rules in Chat

The user sets rules by saying things like:

- `以后每个词给 5 个例句`
- `解释单词时给同根词`
- `例句尽量用职场和租赁场景`

The app stores the rule text and includes it in future Gemini prompts.

### Show or Clear Rules

- `显示当前规则` shows saved rules.
- `忘掉所有规则` clears all saved rules.
- If no rules exist after clearing, the app says: `目前还没有设置规则。`

### API Key

The API key is hidden behind an `API Key` button. After the user saves it once, the app remembers it in the browser and shows only a saved status.

### Save Vocabulary

The user can ask Gemini to summarize useful items and save them. Saved fields may be empty if not requested by rules or the current prompt.

### Manage Vocabulary

The user can delete, update notes, mark important, and change review status from chat. Deletion is soft deletion and can be undone.

### Review

The user starts review from chat. Important words are reviewed more often even when already marked as known.

## Out of Scope for v1

- Multi-user accounts.
- Cloud sync.
- Fixed rule option buttons.
- Automatic morning push notifications.
- Full long-term storage of every chat turn.
