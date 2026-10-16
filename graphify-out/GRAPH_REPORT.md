# Graph Report - prep-desk  (2026-10-16)

## Corpus Check
- 5 files · ~18,713 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .css 1)

## Summary
- 144 nodes · 421 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `65c8bf04`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sname
- dayPlan
- app.js
- esc
- todayKey
- esc
- Prep Desk
- store.js

## God Nodes (most connected - your core abstractions)
1. `esc()` - 26 edges
2. `dayPlan()` - 20 edges
3. `sname()` - 16 edges
4. `todayKey()` - 15 edges
5. `topicCard()` - 14 edges
6. `renderDay()` - 13 edges
7. `hasKey()` - 12 edges
8. `renderStats()` - 12 edges
9. `buildPaper()` - 12 edges
10. `render()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Should fix` --references--> `grade()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Must fix` --references--> `validateCourse()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Should fix` --references--> `readFor()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Should fix` --references--> `dayPlan()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Layout` --references--> `askClaude()`  [INFERRED]
  CLAUDE.md → app.js

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "sname"
Cohesion: 0.22
Nodes (18): buildPaper(), claudeJSON(), createCourse(), extractBank(), fp(), genBatch(), genKP(), genNotes() (+10 more)

### Community 1 - "dayPlan"
Cohesion: 0.21
Nodes (21): blockDays(), blockFor(), completedBefore(), D(), dayPlan(), defaultStyleKey(), diff(), dow() (+13 more)

### Community 2 - "app.js"
Cohesion: 0.09
Nodes (33): BLOCKS, clock(), CS, grade(), importAll(), KIND, LETTERS, loadCourseById() (+25 more)

### Community 3 - "esc"
Cohesion: 0.25
Nodes (15): aiHint(), allCourses(), askClaude(), courseName(), courseOptions(), hasKey(), IN_CLAUDE(), renderProfileBar() (+7 more)

### Community 4 - "todayKey"
Cohesion: 0.26
Nodes (13): addDays(), download(), exportAll(), exportNotes(), K(), planPct(), renderStats(), streak() (+5 more)

### Community 5 - "esc"
Cohesion: 0.19
Nodes (21): bookChapters(), bookName(), col(), esc(), isRev(), kpOf(), linksFor(), myNote() (+13 more)

### Community 6 - "Prep Desk"
Cohesion: 0.11
Nodes (16): addProfile(), uid(), validateCourse(), graphify, Prep Desk, Rules, Must fix, Nice to have (+8 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Layout` connect `dayPlan` to `esc`, `Prep Desk`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `dayPlan()` (e.g. with `Layout` and `Should fix`) actually correct?**
  _`dayPlan()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0907563025210084 - nodes in this community are weakly interconnected._
- **Why does `dayPlan()` connect `dayPlan` to `sname`, `app.js`, `todayKey`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `Prep Desk` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Why does `Prep Desk` connect `Prep Desk` to `dayPlan`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._