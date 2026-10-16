# Graph Report - prep-desk  (2026-10-16)

## Corpus Check
- 5 files · ~16,867 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .css 1)

## Summary
- 130 nodes · 382 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- sname
- dayPlan
- app.js
- esc
- todayKey
- col
- Prep Desk
- store.js

## God Nodes (most connected - your core abstractions)
1. `esc()` - 23 edges
2. `dayPlan()` - 20 edges
3. `sname()` - 15 edges
4. `todayKey()` - 14 edges
5. `hasKey()` - 13 edges
6. `renderDay()` - 13 edges
7. `renderStats()` - 12 edges
8. `buildPaper()` - 12 edges
9. `addDays()` - 11 edges
10. `vCalendar()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Must fix` --references--> `validateCourse()`  [INFERRED]
  docs/ponytail-review.md → app.js
- `Should fix` --references--> `grade()`  [INFERRED]
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
Cohesion: 0.14
Nodes (22): askClaude(), buildPaper(), claudeJSON(), download(), exportAll(), extractBank(), fp(), genBatch() (+14 more)

### Community 1 - "dayPlan"
Cohesion: 0.21
Nodes (21): blockDays(), blockFor(), completedBefore(), D(), dayPlan(), defaultStyleKey(), diff(), dow() (+13 more)

### Community 2 - "app.js"
Cohesion: 0.12
Nodes (27): addProfile(), allCourses(), BLOCKS, createCourse(), CS, importAll(), LETTERS, loadCourseById() (+19 more)

### Community 3 - "esc"
Cohesion: 0.24
Nodes (20): aiHint(), courseName(), courseOptions(), esc(), hasKey(), IN_CLAUDE(), linksFor(), readBlock() (+12 more)

### Community 4 - "todayKey"
Cohesion: 0.36
Nodes (10): addDays(), K(), planPct(), renderStats(), streak(), todayKey(), tutorContext(), weakSubjects() (+2 more)

### Community 5 - "col"
Cohesion: 0.24
Nodes (10): clock(), col(), grade(), nextSat(), styleOf(), vBank(), vMistakes(), vPapers() (+2 more)

### Community 6 - "Prep Desk"
Cohesion: 0.12
Nodes (13): graphify, Prep Desk, Rules, Must fix, Nice to have, Ponytail review: whole codebase (16 Oct 2026), Adding a course for everyone, Courses included (+5 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Layout` connect `dayPlan` to `sname`, `Prep Desk`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `dayPlan()` (e.g. with `Layout` and `Should fix`) actually correct?**
  _`dayPlan()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `sname` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Why does `dayPlan()` connect `dayPlan` to `sname`, `app.js`, `todayKey`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._
- **Why does `Prep Desk` connect `Prep Desk` to `dayPlan`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Should `Prep Desk` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._