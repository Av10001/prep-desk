# Prep Desk

A free study platform for competitive exams. Each person gets a **profile** that follows one **course**, with their own progress.

**Live site:** https://avichalchaturvedi.github.io/prep-desk/

## What it does

- **Today:** what to study in each time slot, the exact sub-topics to read (tick them off), the book chapter, and lecture links for each sub-topic.
- **Calendar:** the whole plan day by day, with test days and milestones such as applications and exams.
- **Papers:** timed, exam-style papers; a question you have seen is never repeated. Supports GATE-style (MCQ/MSQ/NAT with negative marking), MCQ-only and descriptive formats.
- **Notes:** key formulas, must-know results and common traps per subject, plus a topic-by-topic reading checklist.
- **PYQ bank:** paste questions from official previous-year papers; they are tagged automatically and used in your papers first.
- **Mistakes:** every wrong answer with its solution, until you mark it understood.
- **Tutor:** an AI tutor that knows your plan, scores and weak areas.
- **Profiles:** one per person or per exam. Add a course for any other exam with Claude, or import a course file.

## Courses included

| Course | Subjects | Topics | Plan |
| --- | --- | --- | --- |
| GATE EC + ESE E&T 2028 | 22 | 196 | 14 Oct 2026 to ESE mains, about 26 h/week alongside a 9–6 job |
| CDSCO Drug Inspector (UPSC) | 12 | 101 | One year at about 3 h/day; test pattern 300 marks, 2 h, 1/3 negative marking |

Future exam dates are projections from official calendars and are marked as expected.

## Two ways to run it

| | claude.ai page | This site (GitHub Pages) |
| --- | --- | --- |
| Where progress is saved | The viewer's Claude account, privately | This browser (download backups from Settings) |
| AI features | The viewer's Claude account, no key needed | Your own Anthropic API key, kept only in this browser |

To use the AI features here, create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys), add credit, and paste it in **Settings**. A Claude.ai Pro or Max subscription does not include API access. Everything else works without a key.

## Adding a course for everyone

Courses are JSON files in [`courses/`](courses/).

1. Create one in the app (**Profiles → Create a course with Claude**) and click **Download file**, or copy an existing course file and edit it.
2. Put the file in `courses/` and add it to [`courses/index.json`](courses/index.json):
   ```json
   { "id": "my-course-id", "name": "My Exam 2027", "file": "my-course.json", "description": "One line about it." }
   ```
3. Commit and push. GitHub Pages republishes in a minute or two.

| Field | What it holds |
| --- | --- |
| `subjects` | Subject id → name `n`, colour `c` (1–8), `book`, `topics`, `read` (sub-topics per topic), `refs` (book chapter per topic), `notes` |
| `blocks` | Date ranges: `kind` = `learn` / `revise` / `mock` / `written`, `main` subjects, Sunday `par` track, paper `style` |
| `styles` | Question formats: `kind` = `mixed` / `mcq` / `desc`, `marks`, `neg` (fraction of marks lost per wrong answer) |
| `patterns` | Full-mock blueprints: questions per subject (`dist`) and duration |
| `exams`, `milestones` | Countdown dates and calendar markers |
| `routine`, `habit`, `hoursTarget` | Slot times, a daily 20-minute habit subject, weekly hour target |

Subject, style and pattern ids may only use letters, digits, `_` and `-`.

## Running locally

Plain HTML, CSS and JavaScript, with no build step. Serve the folder (course files load with `fetch`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Working on the code with Claude Code

The repo is set up for two Claude Code add-ons:

- **[ponytail](https://github.com/DietrichGebert/ponytail)** (MIT, by Dietrich Gebert): keeps changes small and simple. Its skills are included in [`.claude/skills/`](.claude/skills/), so they work in any session, including cloud sessions. Use `/ponytail-review` before committing. The latest review is in [`docs/ponytail-review.md`](docs/ponytail-review.md).
- **[graphify](https://github.com/Graphify-Labs/graphify)** (Apache-2.0): a map of the code in [`graphify-out/`](graphify-out/). Open `graph.html` in a browser, or read `GRAPH_REPORT.md`. Install it once with `uv tool install graphifyy`, and run `graphify update .` after code changes. Its Claude Code checks in `.claude/settings.json` do nothing when graphify is not installed.

[`CLAUDE.md`](CLAUDE.md) has the project layout and rules for Claude Code.
