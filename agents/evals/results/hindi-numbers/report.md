# Hindi numbers — raw numbers against placeholders (D7)

21 fixture moments (SYN-1017), every line through the seven agents with the provider off (template lines) in English and Hindi. The translator is **simulated**: it reorders words the way Hindi does and, in the stated share of lines with two or more numbers, moves the numbers between slots — what Azure AI Translator did in the October runs ("1–0 after 3 minutes" came back as "0–3 after 1 minute"). The share Azure does this at is unknown, so three are shown. No paid calls.

| Swap share | Hindi lines dropped, before | after | Wrong Hindi lines published, before | after | Digits the translator saw, after |
|---|---|---|---|---|---|
| 25.0% | 2 of 130 (1.5%) | 0 of 130 (0.0%) | 3 | 0 | 0 |
| 50.0% | 8 of 130 (6.2%) | 0 of 130 (0.0%) | 7 | 0 | 0 |
| 100.0% | 19 of 130 (14.6%) | 0 of 130 (0.0%) | 16 | 0 | 0 |

Control (no swaps, placeholders on): 0 dropped of 130, 0 wrong.

**Before**, a moved number is caught by the re-check only when a unit gives it away (a minute count landing on a goal count); a swapped score with nothing else in the line, such as "2–1" turned into "1–2", has the same numbers in a different order and passes, so the wrong-lines column is the hole the drop rule could not close. **After**, the translator never sees a digit: each number goes as its own placeholder, comes back wherever the Hindi word order puts it, and is restored to exactly its value; a line whose placeholders don't all return exactly once is treated as untranslated (template, or dropped), never guessed. The re-check is unchanged and still runs on every restored line.

What this does not show: how often Azure keeps a placeholder intact. The placeholders are pinned with the dynamic dictionary like names, which Azure honours; the first Azure run after deploy should record the Hindi drop rate next to this table.
