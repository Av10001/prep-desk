# Prep Desk

Exam-prep web app: daily study plan with exact sub-topics to read, timed no-repeat papers, PYQ bank, notes, mistake log and an AI tutor. One profile per person; each profile follows one course.

## Layout
- `index.html`: page shell for GitHub Pages. The claude.ai version uses the same `app.js`, `store.js`, `styles.css` and `courses/` with its own shell.
- `app.js`: plan engine (`dayPlan`, `readFor`), views, paper builder, Study now (`studyPick`, `studyCard`, `writeLesson`), Ask drawer (`openAsk`, `sendAsk`, `sourcesFor`), material upload (`readUpload`; pdf.js 3.11.174 and mammoth 1.6.0 lazy-loaded from cdnjs) and retrieval (`retrieve`: ~800-char chunks, term overlap, topic boost), profiles, AI adapter (`askClaude(prompt, {images, system, onText})`; no AI throws `no_ai`, shown with `aiHtml()` and `CLAUDE_PAGE_URL`). Never define a global named `claude`: it would overwrite `window.claude` on claude.ai.
- `store.js`: storage. `cloud` = claude.ai per-viewer database (records max 256 KiB, so papers and mistakes are one record each, bucketed by month); `local` = localStorage. Uploaded material (`mlist/mget/mput/mdel`, docs `{id, name, kind, subj, topic, added, pages:[text]}`, text only) is one chunked record per document under `p.<pid>/material` in the cloud, and IndexedDB `pd2` store `material` (key `<pid>:<id>`) locally.
- `courses/*.json` + `courses/index.json`: one file per course. Per subject: `topics`, `read` (sub-topics per topic), `kp` (key points per topic), `src` (per topic `[bookId, chapter]` pairs), `refs` (same as text), `notes` (subject summary). Per course: `books` (`t` title, `a` author, `kind`, `subj`), `blocks`, `styles`, `patterns` (optional `sections` with per-part `marks`), `exams`, `milestones`.
- Per-profile keys in `store.js`: `progress` (days, sub-topic ticks), `mynotes.<subject>` (own notes per topic), `revise`, `bookdone` (`bookId|chapter`), `ownbooks`, `lessons.<subject>` (cached Study now lessons, key `topic|index`), `asks` (Ask history: context, question, answer, cited sources, `unclear` date), plus papers and mistakes.

## Rules
- Use the **ponytail** skill (`.claude/skills/ponytail`, level `full`) on every coding task: smallest complete change, no new dependencies, no build step.
- Review changes with `/ponytail-review` before committing.
- Keep it a static site: plain HTML, CSS and JS, no framework, no bundler.
- Test in a browser served over HTTP (`python3 -m http.server`); `fetch` of course files fails from `file://`.
- After editing code, run `graphify update .` (see below).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
