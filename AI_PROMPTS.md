# AI Prompts

The app uses system instructions only to explain available app actions and response format. It must not include preset learning rules.

## Chat Prompt

Inputs:

- User message.
- Current saved rules, usually initialized from the user's requested defaults but possibly empty after clearing.
- Recent visible chat context.
- Relevant vocabulary candidates, if any.

Rules:

- If saved rules are empty, answer only the current user request.
- If saved rules exist, follow them.
- Do not invent that a word is saved unless it appears in provided vocabulary data.
- When using saved vocabulary and temporary Gemini knowledge together, clearly separate them.

## Intent Prompt

Classify user intent into:

- `chat`
- `set_rules`
- `show_rules`
- `clear_rules`
- `generate_words`
- `save_summary`
- `delete_word`
- `mark_important`
- `set_review_status`
- `add_note`
- `search_wordbook`
- `review`
- `undo`

Return JSON only.

## Save Vocabulary Prompt

Return JSON only:

```json
{
  "items": [
    {
      "term": "",
      "type": "",
      "cnMeaning": "",
      "enMeaning": "",
      "wordFamily": [],
      "collocations": [],
      "examples": [],
      "scenarios": [],
      "tags": [],
      "aiSummary": "",
      "userNotes": ""
    }
  ]
}
```

Fields may be empty when the user did not request them.
