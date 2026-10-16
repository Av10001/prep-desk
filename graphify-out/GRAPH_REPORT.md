# Graph Report - prep-desk  (2026-10-16)

## Corpus Check
- 5 files · ~23,371 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .css 1)

## Summary
- 184 nodes · 574 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c4f2c191`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sname
- dayPlan
- app.js
- hasKey
- sendAsk
- esc
- Prep Desk
- store.js

## God Nodes (most connected - your core abstractions)
1. `esc()` - 33 edges
2. `sname()` - 23 edges
3. `dayPlan()` - 21 edges
4. `studyCard()` - 20 edges
5. `topicCard()` - 18 edges
6. `todayKey()` - 17 edges
7. `hasKey()` - 17 edges
8. `render()` - 17 edges
9. `renderDay()` - 13 edges
10. `renderStats()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Should fix` --references--> `grade()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Must fix` --references--> `validateCourse()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Should fix` --references--> `readFor()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Should fix` --references--> `dayPlan()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Layout` --references--> `aiHtml()`  [INFERRED]
  CLAUDE.md → app.js

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "sname"
Cohesion: 0.14
Nodes (27): addProfile(), autoCtx(), buildPaper(), claudeJSON(), createCourse(), extractBank(), fp(), genBatch() (+19 more)

### Community 1 - "dayPlan"
Cohesion: 0.13
Nodes (37): addDays(), blockDays(), blockFor(), completedBefore(), D(), dayPlan(), defaultStyleKey(), diff() (+29 more)

### Community 2 - "app.js"
Cohesion: 0.08
Nodes (37): BLOCKS, chunkCache, clock(), CS, download(), exportAll(), exportNotes(), grade() (+29 more)

### Community 3 - "hasKey"
Cohesion: 0.15
Nodes (21): aiHint(), aiHtml(), allCourses(), askClaude(), b64(), canvasJpeg(), courseName(), courseOptions() (+13 more)

### Community 4 - "sendAsk"
Cohesion: 0.22
Nodes (13): bookName(), chunkName(), chunksOf(), cited(), ctxKey(), renderDrawer(), retrieve(), sendAsk() (+5 more)

### Community 5 - "esc"
Cohesion: 0.18
Nodes (28): askMsg(), bookChapters(), col(), esc(), isRev(), kpOf(), linksFor(), matFor() (+20 more)

### Community 6 - "Prep Desk"
Cohesion: 0.12
Nodes (14): validateCourse(), graphify, Prep Desk, Rules, Must fix, Nice to have, Ponytail review: whole codebase (16 Oct 2026), Adding a course for everyone (+6 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Layout` connect `dayPlan` to `sname`, `hasKey`, `sendAsk`, `esc`, `Prep Desk`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `dayPlan()` (e.g. with `Layout` and `Should fix`) actually correct?**
  _`dayPlan()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `sname` be split into smaller, more focused modules?**
  _Cohesion score 0.1396011396011396 - nodes in this community are weakly interconnected._
- **Why does `Prep Desk` connect `Prep Desk` to `dayPlan`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `studyCard()` (e.g. with `matLine()` and `Layout`) actually correct?**
  _`studyCard()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `dayPlan` be split into smaller, more focused modules?**
  _Cohesion score 0.13363363363363365 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07557354925775979 - nodes in this community are weakly interconnected._