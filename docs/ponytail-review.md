# Ponytail review: whole codebase (16 Oct 2026)

Run with the `ponytail-review` skill rules (`.claude/skills/ponytail-review`) over `app.js`, `store.js`, `index.html` and the course loader.
Expected load: one person per browser or per Claude account; courses are files shared between friends.

What this code does: a static web app that plans each study day from a course file, builds timed papers with Claude, and saves each person's progress per profile. On claude.ai it saves to the viewer's private database; on GitHub Pages it saves to the browser and calls Claude with the visitor's own API key.

## Must fix

1. **A shared course file can run code in the page** (`app.js:L762-764` `validateCourse`, used at `L233`, `L337`, `L340`, `L532`, `L576`)
   - **What this is:** Course files can be imported from anyone. Their subject, style and pattern names are written into the page's HTML (for example `data-subj="…"` and `value="…"`).
   - **Problem:** Those names are not escaped or checked. A course with a subject named `a" autofocus onfocus="…` runs that code when the page draws. On GitHub Pages the code can read the visitor's API key from browser storage.
   - **Fix:** In `validateCourse`, reject any subject, style or pattern name that is not letters, digits, `_` or `-`. Three lines, nothing else changes.
   - **If we skip it:** One malicious course file can steal API keys or change someone's saved progress.
   - **Status: fixed in this commit.**

## Should fix

2. **No test for the plan engine or the marking** (`app.js` `dayPlan`, `readFor`, `grade`)
   - **What this is:** These functions decide what every day of a 1–2 year plan shows, and how each paper is scored.
   - **Problem:** A small edit can quietly break hundreds of days or score negative marking wrong. Nothing fails when that happens.
   - **Fix:** One Node script that loads `app.js` with a stub `document` and checks two things. Every day of each course must have a plan. `grade()` must score MCQ, MSQ, NAT and negative marks correctly. About 40 lines, no dependencies.
   - **If we skip it:** Breakage shows up only when someone opens that day.

3. **Chunking logic is written twice in `store.js`** (`store.js:L83-90` `gset`/`gdel`, `L67` `loadGlobal` vs `L46-55` `cwrite`/`cdelete`/`cread`)
   - **What this is:** Large records are split into chunks under the 256 KiB limit. Profile data and global data (the profile list and custom courses) both need this.
   - **Problem:** The global versions repeat the same split, rejoin and delete logic instead of calling the shared functions. If the chunk format changes in one place and not the other, saved courses stop loading.
   - **Fix:** `gset` calls `cwrite(base, 'g.' + k, v)`, `gdel` calls `cdelete`, and `loadGlobal` uses `cread` and keeps the `g.` keys plus the old `progress` record.
   - **If we skip it:** Two copies must always change together.

## Nice to have

4. **Unused helpers** (`app.js:L30-31` `LS.del`, `LS.keys`)
   - **What this is:** Leftovers from before profiles; settings are now the only thing kept in plain browser storage.
   - **Problem:** Nothing calls them.
   - **Fix:** Delete both lines.
   - **If we skip it:** Two dead lines to read past.

Verdict: fix 1 first (done). 2 and 3 when the code is next touched.
Lean: -17 lines possible.
Not checked: the live claude.ai database under real use; this review used a simulated one.
