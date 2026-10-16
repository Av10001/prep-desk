/* Prep Desk — study planner, no-repeat paper builder, PYQ bank, notes and tutor.
   Runs as a claude.ai page (data in each viewer's private storage, AI through their Claude account)
   or as a static site on GitHub Pages (data in the browser, AI with the visitor's own API key).
   Each course is a JSON file in /courses; each person has a profile = name + course + their own progress.
   Storage lives in store.js. */
'use strict';

/* ===================== Utils ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const K = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return K(d); };
const dow = s => D(s).getUTCDay();
const diff = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const todayKey = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const fmt = (k, o = { weekday: 'short', day: 'numeric', month: 'short' }) => D(k).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
const yt = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
function fp(text) { const n = String(text).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 220); let h = 2166136261; for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0') + n.length.toString(36); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const spread = (keys, n) => { const out = {}; keys.forEach((k, i) => { out[k] = Math.floor(n / keys.length) + (i < n % keys.length ? 1 : 0); }); return out; };
const pick = (list, i, n) => list[Math.max(0, Math.min(list.length - 1, Math.floor(i * list.length / Math.max(1, n))))];
const clock = s => `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const LETTERS = ['A', 'B', 'C', 'D'];

/* ===================== Local storage ===================== */
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem('pd:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pd:' + k, JSON.stringify(v)); return true; } catch (e) { toast('Could not save: browser storage is full or blocked.'); return false; } },
  del(k) { try { localStorage.removeItem('pd:' + k); } catch { } },
  keys() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('pd:')) out.push(k); } } catch { } return out; }
};
const CS = { // profile-scoped storage (see store.js)
  get: (k, d) => Store.pget(k, d),
  set: (k, v) => Store.pset(k, v)
};
let SAMPLE = null, DL = null; // claude.ai capabilities when running as an artifact
const IN_CLAUDE = () => Store.mode === 'cloud';

/* ===================== Course engine ===================== */
let C = null, S = {}, BLOCKS = [], PLAN_START = '', PLAN_END = '';
const ROUTINE_DEFAULT = { weekdayAM: '6:00–7:30', weekdayPM: '8:30–9:30', satAM: '8:00–11:00', satMid: '11:30–1:30', satPM: '3:00–5:30', sunAM: '8:00–10:00', sunMid: '10:30–12:30', sunPM: '3:00–5:00' };
const STYLE_DEFAULT = {
  MIXED: { label: 'MCQ, MSQ, NAT', exam: 'the exam', kind: 'mixed', mix: { MCQ: .55, MSQ: .15, NAT: .30 }, marks: [1, 2], neg: 1 / 3, minsPerQ: 2.8 },
  MCQ: { label: 'MCQ only', exam: 'the exam', kind: 'mcq', marks: [1], neg: 1 / 3, minsPerQ: 1.5 },
  DESC: { label: 'Descriptive', exam: 'the exam', kind: 'desc', minsPerQ: 25 }
};
function useCourse(course) {
  C = course; S = C.subjects; BLOCKS = C.blocks.map(b => ({ ...b, _d: null }));
  PLAN_START = BLOCKS[0].s; PLAN_END = BLOCKS[BLOCKS.length - 1].e;
  C.routine = { ...ROUTINE_DEFAULT, ...(C.routine || {}) };
  C.styles = C.styles && Object.keys(C.styles).length ? C.styles : STYLE_DEFAULT;
  C.patterns = C.patterns || {}; C.exams = C.exams || []; C.milestones = C.milestones || {};
  C.hoursTarget = C.hoursTarget || 20;
}
const col = k => `var(--c${S[k] ? S[k].c || 1 : 1})`;
const sname = k => S[k] ? S[k].n : k;
const shortName = k => sname(k).replace(/^[^·]+· /, '');
const styleOf = key => ({ ...STYLE_DEFAULT[C.styles[key]?.kind === 'mcq' ? 'MCQ' : C.styles[key]?.kind === 'desc' ? 'DESC' : 'MIXED'], ...(C.styles[key] || {}), key });
const defaultStyleKey = () => Object.keys(C.styles)[0];
function blockFor(k) { return BLOCKS.find(b => k >= b.s && k <= b.e) || null; }
function blockDays(b) { if (b._d) return b._d; const work = [], sun = []; for (let k = b.s; k <= b.e; k = addDays(k, 1)) (dow(k) === 0 ? sun : work).push(k); return b._d = { work, sun }; }
const topicsOf = keys => keys.filter(k => S[k]).flatMap(k => S[k].topics.map(t => ({ subj: k, name: t })));
const habitOf = b => (b && b.habit && S[b.habit]) ? b.habit : (C.habit && S[C.habit.subject] ? C.habit.subject : null);
function completedBefore(k) { return [...new Set(BLOCKS.filter(b => b.kind === 'learn' && b.e < k).flatMap(b => b.main))]; }
function theoryOn(k) {
  const b = blockFor(k); if (!b || dow(k) === 0) return null; const { work } = blockDays(b); const i = work.indexOf(k);
  if (b.kind === 'learn') return pick(topicsOf(b.main), i, work.length);
  return { subj: pick(b.main, i, work.length), name: null };
}
const parList = b => b.par && b.par.length ? b.par : (habitOf(b) ? [habitOf(b)] : b.main);
/* Which sub-topics of the current topic to read on day k: the topic's list is split evenly over the days the plan gives it. */
function readFor(b, k, which) {
  if (!b || b.kind !== 'learn') return null;
  const days = which === 'sun' ? blockDays(b).sun : blockDays(b).work; const T = topicsOf(which === 'sun' ? parList(b) : b.main);
  const i = days.indexOf(k); if (i < 0 || !T.length) return null;
  const idx = j => Math.min(T.length - 1, Math.floor(j * T.length / Math.max(1, days.length))); const ti = idx(i);
  const same = days.map((_, j) => j).filter(j => idx(j) === ti); const pos = same.indexOf(i), n = same.length;
  const t = T[ti]; const all = ((S[t.subj] && S[t.subj].read) || {})[t.name] || CS.get('read:' + t.subj, {})[t.name] || [];
  return { subj: t.subj, topic: t.name, all, from: Math.floor(pos * all.length / n), to: Math.floor((pos + 1) * all.length / n), pos, n };
}
function weekTheory(k) { const out = []; for (let j = 6; j >= 0; j--) { const t = theoryOn(addDays(k, -j)); if (t && !out.some(o => o.subj === t.subj && o.name === t.name)) out.push(t); } return out; }

function dayPlan(k) {
  const b = blockFor(k); const w = dow(k); const R = C.routine;
  if (!b) return { k, b: null, phase: k < PLAN_START ? 'Before plan start' : 'Plan complete', items: [{ slot: 'Today', time: '', kind: 'rest', title: k < PLAN_START ? `Plan starts ${fmt(PLAN_START, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'All phases complete. Well done.' }] };
  const items = []; const { work, sun } = blockDays(b);
  const hs = habitOf(b);
  const habit = hs ? { slot: 'Daily', time: '20 min', kind: 'ga', title: (C.habit && C.habit.title) || sname(hs), subj: hs, topic: null, note: (C.habit && C.habit.note) || 'A short daily practice block.' } : null;
  if (b.kind === 'learn') {
    if (w >= 1 && w <= 5) {
      const t = theoryOn(k);
      items.push({ slot: 'Morning', time: R.weekdayAM, kind: 'theory', title: t.name, subj: t.subj, topic: t.name, rd: readFor(b, k, 'work'), note: 'Study the sub-topics below, then write one page of short notes.' });
      items.push({ slot: 'Evening', time: R.weekdayPM, kind: 'practice', title: '15 PYQ-pattern problems: ' + t.name, subj: t.subj, topic: t.name, note: 'Log every wrong or guessed answer in Mistakes.' });
      if (habit) items.push(habit);
    } else if (w === 6) {
      const t = theoryOn(k);
      items.push({ slot: 'Morning', time: R.satAM, kind: 'theory', title: t.name, subj: t.subj, topic: t.name, rd: readFor(b, k, 'work'), note: 'Longer theory block. Also finish anything left unticked this week.' });
      items.push({ slot: 'Midday', time: R.satMid, kind: 'practice', title: 'Problem practice on this week’s topics', subj: t.subj, topic: null, note: 'Mixed problems across the week. Aim for 70% accuracy.' });
      items.push({ slot: 'Afternoon', time: R.satPM, kind: 'paper', title: 'Weekend paper: 30 questions, timed', scope: 'week', note: 'Built from this week’s topics and one older subject. No question repeats.' });
    } else {
      const si = sun.indexOf(k); const par = topicsOf(parList(b)); const pt = pick(par, si, sun.length);
      items.push({ slot: 'Morning', time: R.sunAM, kind: 'parallel', title: pt.name, subj: pt.subj, topic: pt.name, rd: readFor(b, k, 'sun'), note: 'Parallel track for the week.' });
      const done = completedBefore(k);
      if (done.length) { const rs = done[Math.floor(diff(PLAN_START, k) / 7) % done.length]; items.push({ slot: 'Late morning', time: R.sunMid, kind: 'revise', title: 'Spaced revision: ' + sname(rs), subj: rs, topic: null, note: 'Re-read your notes, then 20 mixed PYQs from this subject.' }); }
      items.push({ slot: 'Afternoon', time: R.sunPM, kind: 'errors', title: 'Mistake log review', note: 'Redo every unresolved mistake without looking at the solution.' });
    }
  } else if (b.kind === 'revise') {
    if (w >= 1 && w <= 6) {
      const t = theoryOn(k);
      items.push({ slot: 'Morning', time: w === 6 ? R.satAM : R.weekdayAM, kind: 'revise', title: 'Revise ' + sname(t.subj) + ' from your notes', subj: t.subj, topic: null, note: 'Second pass: formulas, derivations, standard results.' });
      if (w < 6) items.push({ slot: 'Evening', time: R.weekdayPM, kind: 'practice', title: '25 mixed PYQs: ' + sname(t.subj), subj: t.subj, topic: null, note: 'Timed. 2 minutes per question.' });
      else items.push({ slot: 'Afternoon', time: R.satPM, kind: 'paper', title: 'Sectional paper: this week’s subjects', scope: 'week', note: '30 questions across what you revised this week.' });
      if (habit) items.push(habit);
    } else {
      const si = sun.indexOf(k); const parS = b.par && b.par.length ? b.par[0] : null;
      if (parS) { const tp = pick(S[parS].topics, si, sun.length); items.push({ slot: 'Morning', time: R.sunAM, kind: 'parallel', title: 'Revision: ' + tp, subj: parS, topic: tp }); }
      if (si % 2 === 1 && C.revisionMock && C.patterns[C.revisionMock]) items.push({ slot: 'Afternoon', time: '1:00–4:30', kind: 'paper', title: C.patterns[C.revisionMock].title, scope: 'pattern:' + C.revisionMock, note: 'Exam conditions, no breaks.' });
      else items.push({ slot: 'Afternoon', time: R.sunPM, kind: 'errors', title: 'Mistake log review', note: 'Clear the unresolved list.' });
    }
  } else if (b.kind === 'mock') {
    const pid = (C.mockDays || {})[String(w)];
    if (pid && C.patterns[pid]) items.push({ slot: 'Main', time: w === 0 || w === 6 ? '9:00–12:00' : '7:00–9:30', kind: 'paper', title: C.patterns[pid].title, scope: 'pattern:' + pid, note: 'Full mock under exam conditions. Analyse it the same day.' });
    else { const i = work.indexOf(k); const s = pick(b.main, Math.max(0, i), work.length); items.push({ slot: 'Morning', time: R.weekdayAM, kind: 'revise', title: 'Formula notebook: ' + sname(s), subj: s, topic: null, note: 'Only your notes and mistake log. No new material.' }); }
    items.push({ slot: 'Evening', time: R.weekdayPM, kind: 'errors', title: 'Analyse the last mock and clear mistakes', note: 'For each wrong answer: concept gap, silly error, or time pressure?' });
  } else { // written / mains
    const i = work.indexOf(k); const s = i < 0 ? null : b.main[Math.floor(i / 3) % b.main.length];
    if (w === 6) items.push({ slot: 'Morning', time: '9:00–12:00', kind: 'paper', title: 'Conventional practice paper (6 questions)', scope: 'written', note: 'Write full answers on paper, then self-mark against the model points.' });
    else if (w === 0) items.push({ slot: 'Morning', time: '9:00–12:00', kind: 'errors', title: 'Rewrite your two weakest answers of the week', note: 'Focus on structure: diagram, derivation, final result.' });
    else { items.push({ slot: 'Morning', time: R.weekdayAM, kind: 'written', title: 'Two conventional answers: ' + sname(s), subj: s, topic: null, note: '15 minutes per answer. Include a labelled diagram.' }); items.push({ slot: 'Evening', time: R.weekdayPM, kind: 'revise', title: 'Derivations and standard results: ' + sname(s), subj: s, topic: null }); }
  }
  return { k, b, phase: b.phase, items };
}

/* ===================== State ===================== */
const st = {
  tab: 'today', sel: null, month: null, progress: { done: {} }, papers: [], bank: [], errors: [], seen: new Set(), concepts: {},
  test: null, openPaper: null, gen: null, bankPreview: null, bankBusy: false, chat: [], chatBusy: false, errFilter: 'all',
  noteSubj: null, noteBusy: false, courseIndex: [], custom: [], creating: false, createMsg: null, settings: LS.get('settings', { key: '', model: 'claude-sonnet-5-5' }),
  profiles: [], profile: null, renaming: null, profMsg: null
};
function loadCourseData() {
  st.progress = CS.get('progress', { done: {} }); if (!st.progress.done) st.progress = { done: {} };
  st.papers = Store.list('papers').sort((a, b) => (b.created || 0) - (a.created || 0)); st.bank = CS.get('bank', []); st.errors = Store.list('errors');
  st.seen = new Set(CS.get('seen', [])); st.concepts = CS.get('concepts', {});
  const t = todayKey(); const start = t < PLAN_START ? PLAN_START : t > PLAN_END ? PLAN_END : t;
  st.sel = start; st.month = start.slice(0, 7); st.noteSubj = Object.keys(S)[0]; st.chat = []; st.test = null; st.openPaper = null; st.gen = null;
}
const savePapers = () => Store.sync('papers', st.papers);
const saveErrors = () => Store.sync('errors', st.errors);
function markSeen(fps, conc) {
  fps.forEach(f => st.seen.add(f)); CS.set('seen', [...st.seen]);
  for (const [s, list] of Object.entries(conc || {})) st.concepts[s] = [...(st.concepts[s] || []), ...list].slice(-80);
  CS.set('concepts', st.concepts);
}

/* ===================== Claude API (visitor's own key) ===================== */
const MODELS = [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (recommended)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (cheapest, fastest)'], ['claude-opus-5-5', 'Claude Opus 5.5 (most accurate, costliest)']];
const hasKey = () => !!SAMPLE || (!IN_CLAUDE() && !!(st.settings.key && st.settings.key.trim()));
const aiHint = () => IN_CLAUDE() ? 'Allow Claude for this page: reload it and accept the prompt.' : 'Add your Claude API key in Settings.';
async function viaSample({ messages, system, onText, signal }) {
  const msgs = messages.map((m, i) => ({ role: m.role, content: i === 0 && system ? system + '\n\n' + m.content : m.content }));
  try { const r = await SAMPLE(msgs, { cache: false, signal, onText: onText ? (u => onText(u.text)) : undefined }); return r.text || ''; }
  catch (e) {
    const code = e && e.code; const human = { not_granted: 'Claude access was declined for this page. Reload and allow it to use AI features.', rate_limited: 'Too many requests right now. Wait a minute and try again.', prompt_too_large: 'That request is too long for Claude. Paste less text at a time.', sampling_disabled: 'AI is turned off for this page.', session_expired: 'Your session expired. Reload the page.' }[code];
    throw { code: code === 'rate_limited' ? 'rate_limited' : code || 'http', message: human || ((e && e.message) || 'Claude could not answer.') };
  }
}
async function askClaude({ messages, system, max_tokens = 8000, onText, signal }) {
  if (SAMPLE) return viaSample({ messages, system, onText, signal });
  if (!hasKey()) throw { code: 'no_key', message: aiHint() };
  const body = { model: st.settings.model || 'claude-sonnet-5-5', max_tokens, messages };
  if (system) body.system = system; if (onText) body.stream = true;
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': st.settings.key.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(body)
    });
  } catch (e) { throw { code: 'network', message: 'Could not reach the Claude API. Check your internet connection.' }; }
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error?.message || ''; } catch { }
    const code = res.status === 401 ? 'bad_key' : res.status === 429 ? 'rate_limited' : res.status === 529 ? 'overloaded' : res.status === 400 && /credit/i.test(msg) ? 'no_credit' : 'http';
    const human = { bad_key: 'Your API key was rejected. Check it in Settings.', rate_limited: 'Rate limit reached. Wait a minute and try again.', overloaded: 'Claude is busy right now. Try again in a minute.', no_credit: 'Your Anthropic account has no API credit left. Add credit at console.anthropic.com.' }[code];
    throw { code, message: human || `Claude API error ${res.status}${msg ? ': ' + msg : ''}` };
  }
  if (!onText) { const j = await res.json(); return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', text = '';
  for (; ;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue; let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; onText(text); }
      if (ev.type === 'error') throw { code: 'http', message: ev.error?.message || 'Stream error' };
    }
  }
  return text;
}
function parseJSON(t) {
  let s = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { }
  const a = s.indexOf('['), o = s.indexOf('{'); const start = a < 0 ? o : o < 0 ? a : Math.min(a, o);
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (start >= 0 && end > start) { try { return JSON.parse(s.slice(start, end + 1)); } catch { } }
  throw { code: 'invalid_json', message: 'Claude returned something that was not valid JSON. Try again.' };
}
const claudeJSON = async (prompt, max) => parseJSON(await askClaude({ messages: [{ role: 'user', content: prompt }], max_tokens: max || 8000 }));

/* ===================== Top bar ===================== */
function renderTop() {
  const t = todayKey();
  $('#coursename').textContent = C ? C.name : 'Prep Desk';
  $('#countdowns').innerHTML = !C ? '' : C.exams.slice(0, 3).map(e => `<div class="cd"><b>${Math.max(0, diff(t, e.date))}</b><span>days to ${esc(e.name)}</span></div>`).join('') + `<div class="cd"><b>${planPct()}%</b><span>of plan days done</span></div>`;
  $('#sync').textContent = !C ? '' : `${st.profile ? st.profile.name + ' · ' : ''}${IN_CLAUDE() ? 'Saved to your Claude account' : 'Saved in this browser'} · ${hasKey() ? 'AI on' : 'AI off'}${C.datesNote ? ' · ' + C.datesNote : ''}`;
  renderProfileBar();
  const n = st.errors.filter(e => !e.resolved).length;
  const mt = document.querySelector('[data-tab="mistakes"]'); if (mt) mt.innerHTML = 'Mistakes' + (n ? `<span class="badge">${n}</span>` : '');
}
function planPct() { if (todayKey() < PLAN_START) return 0; return Math.round(Object.keys(st.progress.done).length / (diff(PLAN_START, PLAN_END) + 1) * 100); }
let toastT = null;
function toast(msg) { const el = $('#toast'); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3500); }

/* ===================== Day view ===================== */
function linksFor(it) {
  if (!it.subj || !S[it.subj] || it.kind === 'paper' || it.kind === 'errors') return '';
  const s = S[it.subj]; const base = shortName(it.subj); const q = it.topic || base; const ctx = C.short || C.name;
  return `<div class="links">
    <a class="chip" href="${yt(q + (it.topic ? ' ' + base : '') + ' ' + ctx + ' lecture')}" target="_blank" rel="noopener">▶ YouTube lectures</a>
    <a class="chip" href="${yt('NPTEL ' + base + ' ' + (it.topic || ''))}" target="_blank" rel="noopener">▶ NPTEL</a>
    <a class="chip" href="${yt(q + ' ' + base + ' ' + ctx + ' previous year questions solved')}" target="_blank" rel="noopener">PYQ solutions</a>
    <button class="chip" data-act="notesfor" data-subj="${it.subj}" data-topic="${esc(it.kind === 'theory' || it.kind === 'parallel' ? it.title : '')}">Notes</button>
    ${s.book ? `<span class="chip">📖 ${esc(s.book)}</span>` : ''}</div>`;
}
const readKey = (s, t, x) => `${s}|${t}|${x}`;
function readLine(s, t, items, x) {
  const key = readKey(s, t, x); const on = !!(st.progress.read || {})[key];
  return `<label class="ri ${on ? 'on' : ''}"><input type="checkbox" id="rt-${fp(key)}" data-act="readtick" data-key="${esc(key)}" ${on ? 'checked' : ''}><span>${esc(items[x])}</span><a class="yt" href="${yt(items[x] + ' ' + shortName(s) + ' lecture')}" target="_blank" rel="noopener" title="Find lectures on this">▶</a></label>`;
}
function readBlock(r) {
  if (!r || !r.all.length) return '';
  const today = []; for (let x = r.from; x < r.to; x++) today.push(x);
  const revise = !today.length; const list = revise ? r.all.map((_, x) => x) : today; const others = r.all.map((_, x) => x).filter(x => !list.includes(x));
  const cnt = r.all.filter((_, x) => (st.progress.read || {})[readKey(r.subj, r.topic, x)]).length;
  return `<div class="readlist"><div class="label">${revise ? 'Revise the whole topic' : 'Read today'}${r.n > 1 ? ` · day ${r.pos + 1} of ${r.n} on this topic` : ''} · ${cnt}/${r.all.length} ticked</div>
   ${list.map(x => readLine(r.subj, r.topic, r.all, x)).join('')}
   ${others.length ? `<details><summary class="muted tiny">Rest of this topic (${others.length})</summary>${others.map(x => readLine(r.subj, r.topic, r.all, x)).join('')}</details>` : ''}
   ${srcOf(r.subj, r.topic).length ? `<div class="muted tiny">📖 ${srcOf(r.subj, r.topic).map(([b, ch]) => esc(bookName(b)) + (ch ? ' — ' + esc(ch) : '')).join('; ')}</div>` : (S[r.subj].refs || {})[r.topic] ? `<div class="muted tiny">📖 ${esc(S[r.subj].refs[r.topic])}</div>` : ''}</div>`;
}
function paperForDay(k, scope) {
  const p = st.papers.find(p => p.day === k && p.scope === scope); if (!p) return '';
  return p.status === 'done' ? `<button class="btn small" data-act="open" data-id="${p.id}">Review · ${p.score}/${p.max}</button>` : `<button class="btn small" data-act="start" data-id="${p.id}">Resume paper</button>`;
}
function slotAction(it, k) {
  if (it.kind === 'paper') return `<div class="row"><button class="btn test" data-act="paper" data-scope="${esc(it.scope)}" data-day="${k}">Build this paper</button>${paperForDay(k, it.scope)}</div>`;
  if (['practice', 'theory', 'revise', 'parallel', 'ga'].includes(it.kind) && it.subj) return `<div class="row"><button class="btn small" data-act="drill" data-subj="${it.subj}" data-topic="${esc(it.topic || '')}" data-n="${it.kind === 'practice' ? 15 : it.kind === 'ga' ? 5 : 10}">Practice ${it.kind === 'practice' ? 15 : it.kind === 'ga' ? 5 : 10} questions</button></div>`;
  if (it.kind === 'errors') return `<div class="row"><button class="btn small" data-act="tab" data-to="mistakes">Open mistakes (${st.errors.filter(e => !e.resolved).length} unresolved)</button></div>`;
  if (it.kind === 'written') return `<div class="row"><button class="btn small" data-act="paper" data-scope="writtenone" data-subj="${it.subj}" data-day="${k}">Get 2 conventional questions</button></div>`;
  return '';
}
function renderDay(k) {
  const plan = dayPlan(k); const done = st.progress.done[k]; const w = dow(k); const defH = w === 0 ? 6 : w === 6 ? 7.5 : 2.5;
  return `<div class="sheet">
  <div class="dayhead"><div><div class="label">${esc(plan.phase)}${plan.b ? ` · week ${Math.floor(diff(PLAN_START, k) / 7) + 1}` : ''}</div>
   <h2>${fmt(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
   ${C.milestones[k] ? `<div class="pill ms">${esc(C.milestones[k])}</div>` : ''}</div>
   ${done ? `<span class="done-flag">✓ Done · ${done.h} h</span>` : ''}</div>
  <div class="slots">${plan.items.map(it => `<div class="slot ${it.kind === 'paper' ? 'paper' : ''}">
   <div class="time"><b>${esc(it.slot)}</b>${esc(it.time)}</div>
   <div class="what">${it.subj && S[it.subj] ? `<div class="subj"><span class="dot" style="background:${col(it.subj)}"></span>${esc(sname(it.subj))}</div>` : ''}
    <div class="title">${esc(it.title)}</div>${it.note ? `<div class="muted small">${esc(it.note)}</div>` : ''}
    ${readBlock(it.rd)}${linksFor(it)}${slotAction(it, k)}</div></div>`).join('')}</div>
  ${plan.b ? `<div class="donebar"><label class="check"><input type="checkbox" id="done-${k}" data-act="done" data-day="${k}" ${done ? 'checked' : ''}> Mark day done</label>
   <label class="muted" for="hrs-${k}">Hours studied</label><input type="number" id="hrs-${k}" min="0" max="16" step="0.5" value="${done ? done.h : defH}" data-hrs="${k}"></div>` : ''}
 </div>`;
}
function weekHours(k) { let h = 0; const mon = addDays(k, -((dow(k) + 6) % 7)); for (let i = 0; i < 7; i++) { const d = st.progress.done[addDays(mon, i)]; if (d) h += Number(d.h) || 0; } return h; }
function streak() { let n = 0, k = todayKey(); if (!st.progress.done[k]) k = addDays(k, -1); while (st.progress.done[k]) { n++; k = addDays(k, -1); } return n; }
function weakSubjects() {
  const agg = {}; for (const p of st.papers) { if (p.status !== 'done' || !p.bySubject) continue; for (const [s, v] of Object.entries(p.bySubject)) { agg[s] = agg[s] || { c: 0, t: 0 }; agg[s].c += v.c; agg[s].t += v.t; } }
  return Object.entries(agg).filter(([s, v]) => v.t >= 4 && S[s]).map(([s, v]) => ({ s, pct: Math.round(v.c / v.t * 100) })).sort((a, b) => a.pct - b.pct);
}
function renderStats() {
  const t = todayKey(); const wh = weekHours(t); const done = st.papers.filter(p => p.status === 'done' && p.max > 0);
  const avg = done.length ? Math.round(done.slice(0, 5).reduce((s, p) => s + Math.max(0, p.score) / p.max, 0) / Math.min(5, done.length) * 100) : null;
  const total = Object.values(st.progress.done).reduce((s, d) => s + (Number(d.h) || 0), 0); const weak = weakSubjects().slice(0, 3); const T = C.hoursTarget;
  return `<div class="sheet stack"><h3>This week</h3>
  <div class="stats">
   <div class="stat"><b>${wh.toFixed(1)} / ${T}</b><span>hours this week</span><div class="meter"><i style="width:${Math.min(100, wh / T * 100)}%"></i></div></div>
   <div class="stat"><b>${streak()}</b><span>day streak</span></div>
   <div class="stat"><b>${total.toFixed(0)}</b><span>hours logged in total</span></div>
   <div class="stat"><b>${avg == null ? '–' : avg + '%'}</b><span>avg score, last 5 papers</span></div>
  </div>
  ${weak.length ? `<div><div class="label" style="margin-bottom:6px">Weakest subjects so far</div>${weak.map(w => `<div class="row spread small"><span><span class="dot" style="background:${col(w.s)}"></span> ${esc(sname(w.s))}</span><span class="num">${w.pct}%</span></div>`).join('')}</div>` : '<div class="muted small">Take your first weekend paper to see subject-wise accuracy here.</div>'}
  <div class="label">Next 6 days</div>
  <div class="stack" style="gap:6px">${[1, 2, 3, 4, 5, 6].map(i => { const k = addDays(t, i); const p = dayPlan(k); return `<button class="btn small left" data-act="goday" data-day="${k}"><span class="num" style="min-width:76px">${fmt(k)}</span><span class="ell">${esc(p.items.find(x => x.kind === 'paper')?.title || p.items[0].title)}</span></button>`; }).join('')}</div>
 </div>`;
}

/* ===================== Views ===================== */
function vToday() {
  const t = todayKey(); const k = t < PLAN_START ? PLAN_START : t;
  const pre = t < PLAN_START ? `<div class="notice">This plan starts on ${fmt(PLAN_START, { day: 'numeric', month: 'long', year: 'numeric' })}. Here is day one.</div>` : '';
  const keyNote = !hasKey() ? `<div class="notice warn">Paper building, notes generation and the tutor need Claude. ${esc(aiHint())}${IN_CLAUDE() ? '' : ' <button class="btn small" data-act="tab" data-to="settings">Open Settings</button>'}</div>` : '';
  return `${pre}${keyNote}<div class="grid2"><div class="stack">${renderDay(k)}</div>${renderStats()}</div>`;
}
function vCalendar() {
  const [y, m] = st.month.split('-').map(Number); const first = `${st.month}-01`; const offset = (dow(first) + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); const t = todayKey(); let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const k = `${st.month}-${String(d).padStart(2, '0')}`; const p = dayPlan(k); const inPlan = !!p.b;
    const main = p.items.find(x => x.subj && x.kind !== 'ga') || p.items[0]; const paper = p.items.some(x => x.kind === 'paper'); const ms = C.milestones[k];
    cells += `<button class="cell ${inPlan ? '' : 'out'} ${k === t ? 'today' : ''} ${k === st.sel ? 'sel' : ''} ${st.progress.done[k] ? 'done' : ''}" data-act="sel" data-day="${k}" aria-label="${fmt(k, { day: 'numeric', month: 'long' })}">
     <span class="d"><span>${d}</span></span>
     ${inPlan && main.subj && S[main.subj] ? `<span class="s"><span class="dot" style="background:${col(main.subj)}"></span><span>${esc(shortName(main.subj))}</span></span>` : ''}
     ${paper ? '<span class="t">PAPER</span>' : ''}${ms ? '<span class="m">◆ ' + esc(ms.split(' ').slice(0, 2).join(' ')) + '</span>' : ''}</button>`;
  }
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const b = blockFor(`${st.month}-15`) || blockFor(first);
  const legend = [...new Set(BLOCKS.filter(x => x.s.slice(0, 7) <= st.month && x.e.slice(0, 7) >= st.month).flatMap(x => x.kind === 'learn' ? [...x.main, ...(x.par || [])] : []))].filter(s => S[s]);
  return `<div class="stack"><div class="sheet">
  <div class="calhead"><div><div class="label">${b ? esc(b.phase) : 'Outside the plan'}</div><h2>${label}</h2></div>
   <div class="row"><button class="btn small" data-act="mon" data-d="-1" aria-label="Previous month">‹ Prev</button><button class="btn small" data-act="montoday">Today</button><button class="btn small" data-act="mon" data-d="1" aria-label="Next month">Next ›</button></div></div>
  <div class="calwrap"><div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div></div>
  <div class="legend">${legend.map(s => `<span><span class="dot" style="background:${col(s)}"></span>${esc(sname(s))}</span>`).join('')}<span class="lt">PAPER = test day</span><span class="lm">◆ milestone</span></div>
 </div>${renderDay(st.sel)}</div>`;
}

/* ---------- Papers ---------- */
function nextSat(k) { let d = k; while (dow(d) !== 6) d = addDays(d, 1); return d; }
function vPapers() {
  if (st.test) return vTest();
  if (st.openPaper) return vReview(st.openPaper);
  const g = st.gen;
  const styleOpts = Object.keys(C.styles).filter(k => styleOf(k).kind !== 'desc').map(k => `<option value="${k}">${esc(styleOf(k).label)}</option>`).join('');
  const custom = `<div class="sheet stack"><h3>Build a custom paper</h3>
  <div class="row" style="align-items:flex-end">
   <div class="field"><label for="cp-subj">Subject</label><select id="cp-subj"><option value="week">This week's topics</option>${Object.entries(C.patterns).map(([k, p]) => `<option value="pattern:${k}">${esc(p.title)}</option>`).join('')}${Object.entries(S).map(([k, v]) => `<option value="s:${k}">${esc(v.n)}</option>`).join('')}</select></div>
   <div class="field"><label for="cp-n">Questions</label><select id="cp-n"><option>10</option><option>15</option><option selected>30</option><option>50</option><option>65</option></select></div>
   <div class="field"><label for="cp-mode">Exam style</label><select id="cp-mode">${styleOpts}</select></div>
   <button class="btn primary" data-act="custom">Build paper</button></div>
  <div class="muted small">Questions from your PYQ bank are used first, then new ones are written in the pattern of previous-year papers. Every question you have seen is remembered and skipped later (${st.seen.size} seen so far).</div></div>`;
  const gen = g ? `<div class="notice ${g.error ? 'err' : ''}">${g.error ? esc(g.error) + (!IN_CLAUDE() && (g.code === 'no_key' || g.code === 'bad_key') ? ' <button class="btn small" data-act="tab" data-to="settings">Open Settings</button>' : '') : `<span class="spin"></span> ${esc(g.msg)}`}</div>` : '';
  const list = st.papers.length ? `<div class="plist">${st.papers.map(p => `<div class="pitem"><div style="min-width:0"><div class="b">${esc(p.title)}</div>
  <div class="muted small">${new Date(p.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${p.questions.length} questions${p.fromBank ? ` · ${p.fromBank} from your PYQ bank` : ''}</div></div>
  <div class="row">${p.status === 'done' ? `<span class="score">${p.score}/${p.max}</span><button class="btn small" data-act="open" data-id="${p.id}">Review</button>` : `<button class="btn small test" data-act="start" data-id="${p.id}">${p.answers && Object.keys(p.answers).length ? 'Resume' : 'Start'}</button>`}<button class="btn small ghost" data-act="delpaper" data-id="${p.id}" aria-label="Delete paper">✕</button></div></div>`).join('')}</div>` :
    `<div class="empty">No papers yet. Your next weekend paper is on ${fmt(nextSat(todayKey()))}. You can also build one now.</div>`;
  return `<div class="stack">${gen}${custom}<div class="sheet"><h3 style="margin-bottom:6px">Your papers</h3>${list}</div></div>`;
}
function vTest() {
  const T = st.test; const p = T.paper; const q = p.questions[T.i]; const a = p.answers[T.i]; const left = Math.max(0, Math.round((T.end - Date.now()) / 1000));
  let body = '';
  if (q.type === 'NAT') body = `<input class="natin" id="nat" inputmode="decimal" placeholder="Your answer" value="${esc(a ?? '')}" data-ans="nat">`;
  else if (q.type === 'DESC') body = `<div class="field"><label for="desc">Your answer outline (write the full answer on paper)</label><textarea id="desc" data-ans="desc">${esc(a ?? '')}</textarea></div>`;
  else body = `<div class="opts">${q.options.map((o, j) => { const L = LETTERS[j]; const on = q.type === 'MSQ' ? (Array.isArray(a) && a.includes(L)) : a === L; return `<label class="opt"><input type="${q.type === 'MSQ' ? 'checkbox' : 'radio'}" name="opt" id="opt-${L}" value="${L}" ${on ? 'checked' : ''} data-ans="${q.type}"><span class="k">${L}</span><span>${esc(o)}</span></label>`; }).join('')}</div>`;
  const neg = q.type === 'MCQ' && q.neg ? ` · −${(q.marks * q.neg).toFixed(2).replace(/\.00$/, '')} if wrong` : q.type === 'DESC' ? '' : ' · no negative';
  return `<div class="testbar"><div><div class="label">${esc(p.title)}</div><span class="timer ${left < 300 ? 'low' : ''}" id="timer">${clock(left)}</span></div>
  <div class="row"><button class="btn small" data-act="pause">Save and exit</button><button class="btn small test" data-act="submit">Submit paper</button></div></div>
 <div class="qlayout"><div class="sheet">
  <div class="qmeta"><span class="num">Q${T.i + 1} of ${p.questions.length}</span><span class="pill pa">${q.type}</span><span>${q.marks} mark${q.marks > 1 ? 's' : ''}${neg}</span>
   <span><span class="dot" style="background:${col(q.subject)}"></span> ${esc(sname(q.subject))}</span>${q.source ? `<span class="pill pt">${esc(q.source)}</span>` : ''}</div>
  <div class="stem">${esc(q.stem)}</div>${body}
  <div class="row spread" style="margin-top:16px"><button class="btn" data-act="qnav" data-d="-1" ${T.i === 0 ? 'disabled' : ''}>‹ Previous</button>
   <div class="row"><button class="btn small" data-act="clear">Clear</button><button class="btn small" data-act="markq">${T.marked.has(T.i) ? 'Unmark' : 'Mark for review'}</button></div>
   <button class="btn primary" data-act="qnav" data-d="1" ${T.i === p.questions.length - 1 ? 'disabled' : ''}>Save & next ›</button></div></div>
  <div class="sheet"><div class="label" style="margin-bottom:8px">Question palette</div><div class="palette">${p.questions.map((_, j) => { const aj = p.answers[j]; const has = aj != null && aj !== '' && !(Array.isArray(aj) && !aj.length); return `<button class="${has ? 'ans' : ''} ${T.marked.has(j) ? 'mark' : ''} ${j === T.i ? 'cur' : ''}" data-act="qgo" data-i="${j}" aria-label="Question ${j + 1}">${j + 1}</button>`; }).join('')}</div>
   <div class="muted small" style="margin-top:10px">Green: answered · Orange: marked for review</div></div></div>`;
}
function grade(q, a) {
  const empty = a == null || a === '' || (Array.isArray(a) && !a.length);
  if (q.type === 'DESC') return { s: empty ? 'skip' : 'self', m: 0 };
  if (empty) return { s: 'skip', m: 0 };
  if (q.answer == null) return { s: 'ungraded', m: 0 };
  if (q.type === 'MCQ') return a === q.answer ? { s: 'ok', m: q.marks } : { s: 'bad', m: -(q.marks * (q.neg || 0)) };
  if (q.type === 'MSQ') { const A = [...a].sort().join(''), B = [...q.answer].sort().join(''); return A === B ? { s: 'ok', m: q.marks } : { s: 'bad', m: 0 }; }
  const v = parseFloat(String(a).replace(/,/g, '')); const ok = Number.isFinite(v) && v >= q.answer.lo - 1e-9 && v <= q.answer.hi + 1e-9; return ok ? { s: 'ok', m: q.marks } : { s: 'bad', m: 0 };
}
function submitTest() {
  const T = st.test; if (!T) return; clearInterval(T.timer); const p = T.paper;
  let score = 0, max = 0; const bySubject = {};
  p.questions.forEach((q, i) => {
    const g = grade(q, p.answers[i]);
    if (q.type !== 'DESC' && q.answer != null) { max += q.marks; score += g.m; bySubject[q.subject] = bySubject[q.subject] || { c: 0, t: 0 }; bySubject[q.subject].t++; if (g.s === 'ok') bySubject[q.subject].c++; }
    if (g.s === 'bad') { const e = { id: q.fp, q, your: p.answers[i] ?? null, paperId: p.id, paperTitle: p.title, at: Date.now(), resolved: false }; const ex = st.errors.findIndex(x => x.id === e.id); if (ex >= 0) st.errors[ex] = e; else st.errors.push(e); }
  });
  Object.assign(p, { score: Math.round(score * 100) / 100, max, bySubject, status: 'done', finished: Date.now() });
  savePapers(); saveErrors(); st.test = null; st.openPaper = p.id; render(); window.scrollTo(0, 0);
}
function vReview(id) {
  const p = st.papers.find(x => x.id === id); if (!p) { st.openPaper = null; return vPapers(); }
  const desc = p.questions.every(q => q.type === 'DESC');
  const subj = Object.entries(p.bySubject || {}).map(([s, v]) => ({ s, ...v, pct: Math.round(v.c / v.t * 100) })).sort((a, b) => a.pct - b.pct);
  const qs = p.questions.map((q, i) => {
    const a = p.answers?.[i]; const g = grade(q, a);
    const tag = { ok: ['var(--ok)', 'Correct'], bad: ['var(--bad)', 'Wrong'], ungraded: ['var(--muted)', 'No answer key'], self: ['var(--accent)', 'Self-mark'], skip: ['var(--muted)', 'Skipped'] }[g.s];
    let ans = '';
    if (q.type === 'MCQ' || q.type === 'MSQ') ans = `<div class="opts">${q.options.map((o, j) => { const L = LETTERS[j]; const isAns = q.type === 'MSQ' ? (q.answer || []).includes(L) : q.answer === L; const picked = q.type === 'MSQ' ? (Array.isArray(a) && a.includes(L)) : a === L; return `<div class="opt ${isAns ? 'right' : picked ? 'wrong' : ''}"><span class="k">${L}</span><span>${esc(o)}</span>${picked ? '<span class="muted tiny" style="margin-left:auto">your pick</span>' : ''}</div>`; }).join('')}</div>`;
    else if (q.type === 'NAT') ans = `<div class="row"><span>Your answer: <b class="num">${esc(a ?? '–')}</b></span><span>Accepted range: <b class="num">${q.answer ? `${q.answer.lo} to ${q.answer.hi}` : '–'}</b></span></div>`;
    else ans = `<div class="label">Your outline</div><div class="expl">${esc(a || '–')}</div><div class="label">Model answer points</div><div class="expl">${esc(q.modelAnswer || '')}</div>`;
    return `<div class="sheet stack" id="rq-${i}"><div class="qmeta"><span class="num">Q${i + 1}</span><span class="pill" style="background:var(--surface2);color:${tag[0]}">${tag[1]}</span><span>${q.type} · ${q.marks} mark${q.marks > 1 ? 's' : ''}</span><span><span class="dot" style="background:${col(q.subject)}"></span> ${esc(sname(q.subject))} · ${esc(q.topic || '')}</span>${q.source ? `<span class="pill pt">${esc(q.source)}</span>` : ''}</div>
   <div class="stem" style="margin:0">${esc(q.stem)}</div>${ans}${q.explanation ? `<div class="expl"><b>Solution.</b> ${esc(q.explanation)}</div>` : ''}
   ${q.answerChecked === false ? '<div class="muted tiny">This PYQ answer was worked out by Claude; check it against the official key.</div>' : ''}</div>`;
  }).join('');
  return `<div class="stack"><div class="row"><button class="btn small" data-act="back">‹ All papers</button></div>
  <div class="grid2"><div class="sheet stack"><div class="label">${new Date(p.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div><h2>${esc(p.title)}</h2>
   ${desc ? '<div class="muted">Conventional paper: compare your written answers with the model points and mark yourself out of 10 each.</div>' : `<div class="row"><span class="score big">${p.score} / ${p.max}</span><span class="muted">${p.max ? Math.round(Math.max(0, p.score) / p.max * 100) : 0}% · negative marks included</span></div>`}
   <div class="palette">${p.questions.map((q, i) => { const g = grade(q, p.answers?.[i]); return `<button class="${g.s === 'ok' ? 'r-ok' : g.s === 'bad' ? 'r-bad' : ''}" data-act="jump" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`; }).join('')}</div></div>
   <div class="sheet"><h3 style="margin-bottom:8px">By subject</h3>${subj.length ? `<table class="subjtable"><tbody>${subj.map(r => `<tr><td><span class="dot" style="background:${col(r.s)}"></span> ${esc(sname(r.s))}</td><td class="n">${r.c}/${r.t}</td><td style="width:35%"><div class="bar"><i style="width:${r.pct}%;background:${r.pct >= 70 ? 'var(--ok)' : r.pct >= 40 ? 'var(--test)' : 'var(--bad)'}"></i></div></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Self-marked paper.</div>'}
    <div class="muted small" style="margin-top:10px">Wrong answers were added to Mistakes.</div></div></div>${qs}</div>`;
}

/* ---------- Paper building ---------- */
function scopeSpec(scope, day, n, styleKey, subj) {
  const k = day || todayKey(); const b = blockFor(k) || BLOCKS[0];
  if (scope.startsWith('pattern:')) {
    const P = C.patterns[scope.slice(8)]; if (!P) return null; // sections: per-part marks, e.g. CSIR NET Part C at 4 marks
    let parts = (P.sections || [{ dist: P.dist }]).flatMap(x => Object.entries(x.dist).filter(([s]) => S[s]).map(([s, c]) => ({ s, t: null, c, m: x.marks })));
    const total = parts.reduce((a, p) => a + p.c, 0);
    if (n && n < total) parts = parts.map(p => ({ ...p, c: Math.max(0, Math.round(p.c * n / total)) })).filter(p => p.c > 0);
    return { style: P.style || defaultStyleKey(), title: P.title + (n && n < total ? ` · ${n} questions` : ''), parts, mins: n && n < total ? null : P.mins };
  }
  const descKey = Object.keys(C.styles).find(x => styleOf(x).kind === 'desc') || 'DESC';
  if (scope === 'written') { const pool = [...new Set(weekTheory(k).map(x => x.subj))]; const use = pool.length ? pool : b.main; return { style: descKey, title: 'Conventional practice paper', parts: Object.entries(spread(use, 6)).filter(([, c]) => c).map(([s, c]) => ({ s, t: null, c })), mins: 180 }; }
  if (scope === 'writtenone') return { style: descKey, title: 'Conventional questions: ' + sname(subj), parts: [{ s: subj, t: null, c: 2 }], mins: 30 };
  if (scope.startsWith('s:')) { const s = scope.slice(2); return { style: styleKey || S[s].style || b.style || defaultStyleKey(), title: `${sname(s)} · ${n} questions`, parts: Object.entries(spread(S[s].topics, n)).filter(([, c]) => c).map(([t, c]) => ({ s, t, c })) }; }
  // this week's paper
  const tot = n || 30; const sk = styleKey || b.style || defaultStyleKey(); const hs = habitOf(b);
  const wk = weekTheory(k); const wt = wk.length ? wk : [{ subj: b.main[0], name: null }];
  const habitN = b.kind === 'learn' && hs && !wt.some(x => x.subj === hs) && styleOf(sk).kind !== 'desc' ? Math.round(tot * .13) : 0;
  const older = completedBefore(k).filter(x => !wt.some(w => w.subj === x) && x !== hs);
  const rest = older.length ? Math.round(tot * .17) : 0; const weekN = tot - rest - habitN; const parts = [];
  Object.entries(spread(wt.map((_, i) => i), weekN)).forEach(([i, c]) => { if (c) parts.push({ s: wt[i].subj, t: wt[i].name, c }); });
  if (rest) Object.entries(spread(older.sort(() => Math.random() - .5).slice(0, 2), rest)).forEach(([s, c]) => { if (c) parts.push({ s, t: null, c }); });
  if (habitN) parts.push({ s: hs, t: null, c: habitN });
  return { style: sk, title: (b.kind === 'revise' ? 'Sectional paper' : 'Weekend paper') + ' · ' + fmt(k, { day: 'numeric', month: 'short' }), parts };
}
function normQ(raw, ST, allowed) {
  if (!raw || typeof raw !== 'object') return null;
  const q = { type: String(raw.type || 'MCQ').toUpperCase(), marks: Number(raw.marks) || 1, subject: raw.subject, topic: String(raw.topic || ''), stem: String(raw.stem || '').trim(), explanation: String(raw.explanation || ''), concept: String(raw.concept || '') };
  if (!S[q.subject] || (allowed && !allowed.includes(q.subject))) q.subject = allowed ? allowed[0] : Object.keys(S)[0];
  if (q.stem.length < 12) return null;
  if (ST.kind === 'desc') { q.type = 'DESC'; q.marks = Number(raw.marks) || 10; q.modelAnswer = String(raw.modelAnswer || raw.answer || ''); q.answer = null; return q; }
  if (ST.kind === 'mcq') { q.type = 'MCQ'; q.marks = (ST.marks || [1])[0]; }
  if (!['MCQ', 'MSQ', 'NAT'].includes(q.type)) q.type = 'MCQ';
  if (ST.kind === 'mixed') { const ms = ST.marks || [1, 2]; if (!ms.includes(q.marks)) q.marks = ms[ms.length - 1]; }
  q.neg = q.type === 'MCQ' ? (ST.neg ?? 0) : 0;
  if (q.type === 'NAT') { const a = raw.answer || {}; let lo = Number(a.lo), hi = Number(a.hi); if (!Number.isFinite(lo) && Number.isFinite(Number(raw.answer))) lo = hi = Number(raw.answer); if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null; if (lo > hi) [lo, hi] = [hi, lo]; q.answer = { lo, hi }; }
  else {
    if (!Array.isArray(raw.options) || raw.options.length !== 4) return null; q.options = raw.options.map(o => String(o).replace(/^\s*\(?[A-Da-d][\).:]\s*/, ''));
    if (q.type === 'MCQ') { const a = String(raw.answer || '').trim().toUpperCase().replace(/[^A-D]/g, ''); if (a.length !== 1) return null; q.answer = a; }
    else { const arr = (Array.isArray(raw.answer) ? raw.answer : String(raw.answer || '').split(/[ ,;]+/)).map(x => String(x).toUpperCase().trim()).filter(x => /^[A-D]$/.test(x)); if (!arr.length) return null; q.answer = [...new Set(arr)].sort(); }
  }
  return q;
}
async function genBatch(ST, parts, avoid) {
  const subs = [...new Set(parts.map(p => p.s))]; const n = parts.reduce((a, p) => a + p.c, 0);
  const dist = parts.map(p => `- ${p.c} × subject "${p.s}" (${sname(p.s)})${p.t ? `, topic: ${p.t}` : ', any topic in this subject'}`).join('\n');
  const exam = subs.length === 1 && S[subs[0]].exam ? S[subs[0]].exam : ST.exam || C.name;
  const mix = ST.mix ? Object.entries(ST.mix).map(([k, v]) => `${Math.round(v * 100)}% ${k}`).join(', ') : '';
  const style = ST.kind === 'mixed' ? `Mix question types: about ${mix}. Marks ${(ST.marks || [1, 2]).join(' or ')}; higher-mark questions need multi-step working.` :
    ST.kind === 'mcq' ? `All MCQ with 4 options, ${(ST.marks || [1])[0]} mark(s) each, in this exam's style: a mix of conceptual, statement-based ("Which of the following statements are correct?") and short numerical questions.` :
      'Conventional descriptive questions of 8–12 marks: derivations, multi-part numericals, or explain-with-diagram questions.';
  const schema = ST.kind === 'desc' ? '{"subject":key,"topic":string,"marks":number,"stem":string,"modelAnswer":"key points, equations and final results an examiner looks for, 60-120 words","concept":"3-6 word tag"}' :
    '{"type":"MCQ"|"MSQ"|"NAT","marks":number,"subject":key,"topic":string,"stem":string,"options":[4 strings, no letter prefixes; omit for NAT],"answer":MCQ "A"-"D" | MSQ array of letters | NAT {"lo":number,"hi":number},"explanation":"key steps to the answer, under 70 words","concept":"3-6 word tag"}';
  const prompt = `You are an expert question setter for ${exam}. Write ${n} NEW questions in the exact style, difficulty and syllabus of its previous-year papers.

Distribution (use these exact subject keys):
${dist}

Rules:
- Model each question on a pattern that recurs in previous-year papers for that topic, but use fresh numbers and wording. Do not copy any real question.
- ${style}
- Each question has exactly one defensible answer (MSQ: the full set of correct options). Solve each one yourself and double-check the arithmetic. NAT ranges should be tight (rounding of the final digit).
- Plain text only. Write powers as ^, use sqrt(), and symbols like π, Ω, μ, ω, ∞, ∠. No LaTeX, no images; describe any figure or circuit fully in words.
- Vary the concepts. Avoid these concepts the student has already practised: ${avoid.length ? avoid.join('; ') : '(none yet)'}.

Return ONLY a JSON array of ${n} objects with this shape:
${schema}`;
  const out = await claudeJSON(prompt, 12000);
  return Array.isArray(out) ? out : (out && Array.isArray(out.questions) ? out.questions : []);
}
async function buildPaper(spec, meta) {
  st.tab = 'papers'; st.openPaper = null;
  if (!spec || !spec.parts.length) { st.gen = { error: 'Nothing to build for this selection.' }; render(); return; }
  if (!hasKey() && !st.bank.length) { st.gen = { code: 'no_key', error: 'Building papers needs Claude (or questions in your PYQ bank). ' + aiHint() }; render(); return; }
  const ST = styleOf(spec.style); st.gen = { msg: 'Picking questions from your PYQ bank…' }; render();
  try {
    const chosen = [], used = new Set(); const parts = spec.parts.map(p => ({ ...p }));
    for (const p of parts) {
      const kw = p.t ? p.t.toLowerCase().split(/[ ,:]/)[0] : '';
      const pool = st.bank.filter(q => q.subject === p.s && !st.seen.has(q.fp) && !used.has(q.fp) && (ST.kind === 'desc') === (q.type === 'DESC') && (ST.kind !== 'mcq' || q.type === 'MCQ') && (!kw || !q.topic || q.topic.toLowerCase().includes(kw)));
      while (p.c > 0 && pool.length) { const q = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; chosen.push({ ...q, neg: q.type === 'MCQ' ? (ST.neg ?? 0) : 0 }); used.add(q.fp); p.c--; }
    }
    const fromBank = chosen.length; const need = parts.filter(p => p.c > 0);
    if (need.length && !hasKey()) { if (!chosen.length) throw { code: 'no_key', message: 'Not enough unused bank questions. ' + aiHint() }; }
    else {
      const batches = []; let cur = [], cn = 0;
      for (const p of need) { if (cn && cur[0].m !== p.m) { batches.push(cur); cur = []; cn = 0; } let c = p.c; while (c > 0) { const take = Math.min(c, 10 - cn); cur.push({ ...p, c: take }); cn += take; c -= take; if (cn >= 10) { batches.push(cur); cur = []; cn = 0; } } }
      if (cur.length) batches.push(cur);
      const total = batches.reduce((a, b) => a + b.reduce((x, y) => x + y.c, 0), 0); let done = 0;
      for (const batch of batches) {
        st.gen = { msg: `Writing new PYQ-pattern questions… ${done} of ${total}${fromBank ? ` (plus ${fromBank} from your bank)` : ''}` }; render();
        const subs = [...new Set(batch.map(p => p.s))]; const avoid = subs.flatMap(s => (st.concepts[s] || []).slice(-25)); const BST = batch[0].m ? { ...ST, marks: [batch[0].m] } : ST;
        let raw; try { raw = await genBatch(BST, batch, avoid); } catch (e) { if (e.code === 'rate_limited' || e.code === 'overloaded' || e.code === 'invalid_json') { await new Promise(r => setTimeout(r, 5000)); raw = await genBatch(BST, batch, avoid); } else throw e; }
        const want = batch.reduce((a, p) => a + p.c, 0); let got = 0;
        for (const r of raw) { if (got >= want) break; const q = normQ(r, BST, subs); if (!q) continue; q.fp = fp(q.stem); if (st.seen.has(q.fp) || used.has(q.fp)) continue; used.add(q.fp); chosen.push(q); got++; }
        done += got;
      }
    }
    if (!chosen.length) throw { message: 'No usable questions came back. Try again in a minute.' };
    const id = 'p' + uid();
    const p = { id, title: spec.title, style: spec.style, scope: meta.scope, day: meta.day || null, created: Date.now(), questions: chosen, answers: {}, status: 'ready', mins: spec.mins || Math.max(10, Math.round(chosen.length * (ST.minsPerQ || 2.5))), fromBank };
    const conc = {}; chosen.forEach(q => { if (q.concept) (conc[q.subject] = conc[q.subject] || []).push(q.concept); });
    markSeen(chosen.map(q => q.fp), conc);
    st.papers.unshift(p); savePapers(); st.gen = null; startPaper(id);
  } catch (e) { st.gen = { code: e.code, error: (e.code ? '' : 'The paper could not be built: ') + (e.message || 'unknown error') }; render(); }
}
function startPaper(id) {
  const p = st.papers.find(x => x.id === id); if (!p) return; p.answers = p.answers || {};
  st.test = { paper: p, i: 0, end: Date.now() + ((p.remaining != null ? p.remaining : p.mins * 60) * 1000), marked: new Set(), timer: null };
  st.tab = 'papers'; st.openPaper = null; render(); window.scrollTo(0, 0);
}
function startTick() { const T = st.test; if (!T || T.timer) return; T.timer = setInterval(() => { const left = Math.max(0, Math.round((T.end - Date.now()) / 1000)); const el = $('#timer'); if (el) { el.textContent = clock(left); el.classList.toggle('low', left < 300); } if (left <= 0) submitTest(); }, 1000); }
let saveT = null; function saveDraft() { clearTimeout(saveT); saveT = setTimeout(() => { const T = st.test; if (!T) return; T.paper.remaining = Math.max(0, Math.round((T.end - Date.now()) / 1000)); savePapers(); }, 1200); }
function pauseTest() { const T = st.test; if (!T) return; clearInterval(T.timer); T.paper.remaining = Math.max(0, Math.round((T.end - Date.now()) / 1000)); savePapers(); st.test = null; }

/* ---------- Notes: key points, sources, sub-topics and the candidate's own notes per topic ---------- */
const kpOf = (s, t) => ((S[s].kp || {})[t]) || CS.get('kp:' + s, {})[t] || [];
const srcOf = (s, t) => ((S[s].src || {})[t]) || [];
const myNote = (s, t) => ((CS.get('mynotes.' + s, {})[t]) || {}).t || '';
const isRev = (s, t) => !!CS.get('revise', {})[s + '|' + t];
const ownBooks = () => CS.get('ownbooks', []);
const bookName = b => ((C.books || {})[b] || {}).t || b;
function srcLine(b, ch, t, bd) {
  const B = (C.books || {})[b]; const key = b + '|' + (ch || t);
  return `<label class="ri ${bd[key] ? 'on' : ''}"><input type="checkbox" data-act="bch" data-key="${esc(key)}" ${bd[key] ? 'checked' : ''}><span><b>${esc(B ? B.t : b)}</b>${B && B.a ? ` · ${esc(B.a)}` : ''} — ${ch ? esc(ch) : 'sections on this topic'}</span></label>`;
}
function topicCard(s, t, ti, open, showSubj) {
  const id = fp(s + '|' + t), kp = kpOf(s, t), src = srcOf(s, t), note = myNote(s, t), rev = isRev(s, t);
  const items = (S[s].read || CS.get('read:' + s, {}))[t] || []; const done = st.progress.read || {};
  const c = items.filter((_, x) => done[readKey(s, t, x)]).length; const bd = CS.get('bookdone', {});
  const own = ownBooks().filter(o => o.subj === s);
  return `<details class="topicbox" id="tp-${id}" ${open ? 'open' : ''}><summary><span class="b">${showSubj ? esc(shortName(s)) + ' · ' : ''}${ti + 1}. ${esc(t)}</span><span class="row tiny" style="gap:6px">${note ? '<span class="pill pa">My notes</span>' : ''}${rev ? '<span class="pill pt">Revise</span>' : ''}${items.length ? `<span class="num muted">${c}/${items.length}</span>` : ''}</span></summary>
  <div class="stack topicbody">
   ${kp.length ? `<div><div class="label">Key points</div><ul class="kp">${kp.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
   ${src.length || own.length ? `<div><div class="label">Read from</div>${src.map(([b, ch]) => srcLine(b, ch, t, bd)).join('')}${own.map(o => `<div class="muted small">Your material: ${esc(o.t)}${o.url ? ` · <a href="${esc(o.url)}" target="_blank" rel="noopener">open</a>` : ''}</div>`).join('')}</div>` : ''}
   ${items.length ? `<div><div class="label">Sub-topics</div>${items.map((_, x) => readLine(s, t, items, x)).join('')}</div>` : ''}
   <div class="field"><label for="mn-${id}">My notes</label><textarea class="mynote" id="mn-${id}" data-subj="${s}" data-topic="${esc(t)}" placeholder="Formulas, shortcuts, page numbers, mistakes you made…">${esc(note)}</textarea><span class="muted tiny" data-saved>${note ? 'Saved' : 'Saves as you type'}</span></div>
   <div class="row"><button class="btn small" data-act="revise" data-subj="${s}" data-topic="${esc(t)}">${rev ? 'Remove revision mark' : 'Mark for revision'}</button><button class="btn small" data-act="drill" data-subj="${s}" data-topic="${esc(t)}" data-n="10">Practice 10 questions</button><a class="chip" href="${yt(t + ' ' + shortName(s) + ' lecture')}" target="_blank" rel="noopener">▶ Lectures</a></div>
  </div></details>`;
}
function notesBody() {
  const q = (st.noteQ || '').trim().toLowerCase(), f = st.noteFilter || 'all';
  const keep = (s, t) => (f !== 'mine' || myNote(s, t)) && (f !== 'rev' || isRev(s, t)) &&
    (!q || [t, ...kpOf(s, t), myNote(s, t), ...(((S[s].read || {})[t]) || [])].some(x => String(x).toLowerCase().includes(q)));
  if (q || f !== 'all') {
    const hits = Object.keys(S).flatMap(s => S[s].topics.map((t, ti) => ({ s, t, ti })).filter(x => keep(x.s, x.t)));
    return `<div class="label">${hits.length} topic${hits.length === 1 ? '' : 's'}${q ? ` matching “${esc(st.noteQ.trim())}”` : f === 'mine' ? ' with your notes' : ' marked for revision'}</div>
     ${hits.length ? hits.slice(0, 80).map(h => topicCard(h.s, h.t, h.ti, !!q, true)).join('') : '<div class="empty">Nothing found.</div>'}`;
  }
  const s = st.noteSubj && S[st.noteSubj] ? st.noteSubj : Object.keys(S)[0]; const subj = S[s];
  const summary = subj.notes && subj.notes.length ? subj.notes : CS.get('notes:' + s, null);
  const books = Object.entries(C.books || {}).filter(([, B]) => (B.subj || []).includes(s));
  const hasKp = subj.topics.some(t => kpOf(s, t).length);
  return `<div><div class="label">Notes</div><h2>${esc(subj.n)}</h2></div>
  ${books.length ? `<div class="row" style="gap:6px">${books.map(([b, B]) => `<button class="chip" data-act="bookfor" data-subj="${s}">📖 ${esc(B.t)}</button>`).join('')}</div>` : (subj.book ? `<div class="muted small">Standard book: ${esc(subj.book)}</div>` : '')}
  <details class="topicbox"><summary><span class="b">Subject summary</span><span class="muted tiny">formulas and traps for the whole subject</span></summary>
   ${summary ? summary.map(sec => `<section class="nsec"><h3>${esc(sec.h)}</h3><ul>${sec.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('') : `<div class="empty">No summary yet.</div>`}
   ${!(subj.notes && subj.notes.length) && hasKey() ? `<button class="btn small" data-act="gennotes" data-subj="${s}" ${st.noteBusy ? 'disabled' : ''}>${st.noteBusy ? '<span class="spin"></span> Writing…' : summary ? 'Rewrite summary' : 'Write summary with Claude'}</button>` : ''}</details>
  ${!hasKp && hasKey() ? `<button class="btn small" data-act="genkp" data-subj="${s}" ${st.noteBusy ? 'disabled' : ''}>${st.noteBusy ? '<span class="spin"></span> Writing…' : 'Write key points for every topic with Claude'}</button>` : ''}
  ${!subj.read && hasKey() ? `<button class="btn small" data-act="genread" data-subj="${s}" ${st.noteBusy ? 'disabled' : ''}>Write sub-topic lists with Claude</button>` : ''}
  <div class="stack" style="gap:6px">${subj.topics.map((t, ti) => topicCard(s, t, ti, t === st.noteTopic, false)).join('')}</div>`;
}
function vNotes() {
  const s = st.noteSubj && S[st.noteSubj] ? st.noteSubj : Object.keys(S)[0];
  const list = Object.entries(S).map(([k, v]) => { const n = Object.keys(CS.get('mynotes.' + k, {})).length;
    return `<button class="nsub ${k === s && !st.noteQ && (st.noteFilter || 'all') === 'all' ? 'on' : ''}" data-act="note" data-subj="${k}"><span class="dot" style="background:${col(k)}"></span><span>${esc(v.n)}</span>${n ? `<span class="num muted tiny" style="margin-left:auto">${n}</span>` : ''}</button>`; }).join('');
  const f = st.noteFilter || 'all';
  return `<div class="stack"><div class="sheet row" style="align-items:flex-end">
   <div class="field grow"><label for="nsearch">Search</label><input id="nsearch" type="search" value="${esc(st.noteQ || '')}" placeholder="Search topics, key points and your notes"></div>
   <div class="field"><label for="nfilter">Show</label><select id="nfilter" data-act="nfilter"><option value="all" ${f === 'all' ? 'selected' : ''}>One subject</option><option value="mine" ${f === 'mine' ? 'selected' : ''}>All topics with my notes</option><option value="rev" ${f === 'rev' ? 'selected' : ''}>All topics marked for revision</option></select></div>
   <button class="btn small" data-act="exportnotes">Download my notes</button></div>
  <div class="notes"><nav class="nlist sheet" aria-label="Subjects">${list}</nav><article class="sheet stack" id="nbody">${notesBody()}</article></div></div>`;
}
async function exportNotes() {
  const rev = CS.get('revise', {}); let md = `# My notes: ${C.name}\n\n${st.profile ? st.profile.name + ' · ' : ''}${todayKey()}\n`;
  for (const [s, v] of Object.entries(S)) {
    const m = CS.get('mynotes.' + s, {}); const ts = v.topics.filter(t => (m[t] && m[t].t) || rev[s + '|' + t]); if (!ts.length) continue;
    md += `\n## ${v.n}\n`; for (const t of ts) md += `\n### ${t}${rev[s + '|' + t] ? ' (revise)' : ''}\n\n${(m[t] && m[t].t) || ''}\n`;
  }
  await download(`my-notes-${todayKey()}.md`, md);
}
async function genKP(s) {
  st.noteBusy = true; render();
  try {
    const out = await claudeJSON(`For "${sname(s)}" in ${C.name}, write 3-5 exam-focused key points for each topic: formulas, standard results and common traps. Plain text with unicode symbols, no LaTeX, each point one short sentence, every formula correct. Topics: ${JSON.stringify(S[s].topics)}.
Return ONLY a JSON object mapping each topic string exactly as given to an array of key-point strings.`, 8000);
    const map = {}; for (const t of S[s].topics) if (Array.isArray(out[t])) map[t] = out[t].map(String).slice(0, 6);
    if (!Object.keys(map).length) throw { message: 'No key points came back. Try again.' };
    CS.set('kp:' + s, map);
  } catch (e) { toast(e.message || 'Could not write key points.'); }
  st.noteBusy = false; render();
}

/* ---------- Books: course library with chapter → topic map, plus the candidate's own material ---------- */
const KIND = { book: 'Book', doc: 'Official text', guide: 'Any standard guide', notes: 'Notes' };
function bookChapters(bid) {
  const rows = new Map();
  for (const [s, v] of Object.entries(S)) for (const t of v.topics) for (const [b, ch] of srcOf(s, t)) if (b === bid) {
    const key = b + '|' + (ch || t); if (!rows.has(key)) rows.set(key, { ch, key, topics: [] }); rows.get(key).topics.push({ s, t });
  }
  return [...rows.values()];
}
function vBooks() {
  const fs = st.bookSubj && (S[st.bookSubj] || st.bookSubj === 'all') ? st.bookSubj : 'all'; const bd = CS.get('bookdone', {});
  const order = Object.keys(S); const rank = B => Math.min(...(B.subj || []).map(x => order.indexOf(x)).filter(i => i >= 0), 99);
  const ids = Object.keys(C.books || {}).filter(b => fs === 'all' || (C.books[b].subj || []).includes(fs)).sort((a, b) => rank(C.books[a]) - rank(C.books[b]) || C.books[a].t.localeCompare(C.books[b].t));
  let tot = 0, dn = 0;
  const cards = ids.map(b => {
    const B = C.books[b], rows = bookChapters(b), n = rows.filter(r => bd[r.key]).length; tot += rows.length; dn += n;
    return `<details class="topicbox"><summary><span style="min-width:0"><span class="b">${esc(B.t)}</span>${B.a ? ` <span class="muted small">· ${esc(B.a)}</span>` : ''}<br><span class="row tiny" style="gap:6px;margin-top:4px"><span class="pill pa">${KIND[B.kind] || 'Book'}</span>${(B.subj || []).map(x => `<span><span class="dot" style="background:${col(x)}"></span> ${esc(shortName(x))}</span>`).join('')}</span></span>
     <span class="num muted tiny">${n}/${rows.length}</span></summary>
     <div class="meter" style="margin-bottom:8px"><i style="width:${rows.length ? n / rows.length * 100 : 0}%"></i></div>
     ${rows.map(r => `<div class="chrow"><label class="ri ${bd[r.key] ? 'on' : ''}"><input type="checkbox" data-act="bch" data-key="${esc(r.key)}" ${bd[r.key] ? 'checked' : ''}><span>${r.ch ? esc(r.ch) : 'Sections on ' + esc(r.topics[0].t)}</span></label>
      <div class="row" style="gap:4px;padding-left:28px">${r.topics.map(x => `<button class="chip tiny" data-act="notesfor" data-subj="${x.s}" data-topic="${esc(x.t)}">${esc(x.t)}</button>`).join('')}</div></div>`).join('')}</details>`;
  }).join('');
  const own = ownBooks().filter(o => fs === 'all' || o.subj === fs);
  const ownCards = own.map(o => { const n = o.ch.filter(c => c.d).length;
    return `<details class="topicbox"><summary><span style="min-width:0"><span class="b">${esc(o.t)}</span>${o.a ? ` <span class="muted small">· ${esc(o.a)}</span>` : ''}<br><span class="row tiny" style="gap:6px;margin-top:4px"><span class="pill pt">${esc(o.kind)}</span>${S[o.subj] ? `<span><span class="dot" style="background:${col(o.subj)}"></span> ${esc(shortName(o.subj))}</span>` : ''}${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">open</a>` : ''}</span></span><span class="num muted tiny">${o.ch.length ? `${n}/${o.ch.length}` : ''}</span></summary>
     ${o.ch.map((c, i) => `<label class="ri ${c.d ? 'on' : ''}"><input type="checkbox" data-act="obch" data-id="${esc(o.id)}" data-i="${i}" ${c.d ? 'checked' : ''}><span>${esc(c.n)}</span></label>`).join('') || '<div class="muted tiny">No chapters listed.</div>'}
     <div class="row" style="margin-top:8px"><button class="btn small ghost" data-act="delbook" data-id="${esc(o.id)}">Remove</button></div></details>`; }).join('');
  return `<div class="stack"><div class="sheet row spread" style="align-items:flex-end"><div><h2>Books and material</h2><div class="muted small">${dn} of ${tot} chapters done. Tick a chapter here or in Notes; each chapter lists the topics it covers.</div></div>
   <div class="field"><label for="bsubj">Subject</label><select id="bsubj" data-act="bsubj"><option value="all">All subjects</option>${Object.entries(S).map(([k, v]) => `<option value="${k}" ${fs === k ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></div></div>
  <div class="stack" style="gap:6px">${cards || '<div class="sheet empty">No books listed for this course.</div>'}</div>
  <div class="sheet stack"><h3>Your own books and material</h3><div class="muted small">Coaching notes, a different book, a video course or a PDF you use. Add chapters to track them; they also show under "Read from" in Notes for that subject.</div>
   ${ownCards ? `<div class="stack" style="gap:6px">${ownCards}</div>` : ''}
   <div class="grid-form">
    <div class="field"><label for="ob-title">Title</label><input id="ob-title" placeholder="e.g. Made Easy Networks notes"></div>
    <div class="field"><label for="ob-author">Author or source</label><input id="ob-author" placeholder="optional"></div>
    <div class="field"><label for="ob-kind">Type</label><select id="ob-kind">${['Book', 'Coaching notes', 'Video course', 'PDF or handout', 'Website'].map(k => `<option>${k}</option>`).join('')}</select></div>
    <div class="field"><label for="ob-subj">Subject</label><select id="ob-subj">${Object.entries(S).map(([k, v]) => `<option value="${k}" ${fs === k ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></div>
    <div class="field wide"><label for="ob-url">Link (optional)</label><input id="ob-url" type="url" placeholder="https://…"></div>
    <div class="field wide"><label for="ob-ch">Chapters, one per line (optional)</label><textarea id="ob-ch" style="min-height:90px" placeholder="1. Basics&#10;2. Network theorems"></textarea></div>
   </div>
   <div class="row"><button class="btn primary" data-act="addbook">Add to my material</button></div></div></div>`;
}

async function genRead(s) {
  st.noteBusy = true; render();
  try {
    const out = await claudeJSON(`For "${sname(s)}" in ${C.name}, list the exact sub-topics a student must read for each syllabus topic, in teaching order (4-6 per topic, each a short phrase naming a concrete concept, method or result). Topics: ${JSON.stringify(S[s].topics)}.
Return ONLY a JSON object mapping each topic string exactly as given to an array of sub-topic strings.`, 6000);
    const map = {}; for (const t of S[s].topics) if (Array.isArray(out[t])) map[t] = out[t].map(String).slice(0, 8);
    if (!Object.keys(map).length) throw { message: 'No sub-topics came back. Try again.' };
    CS.set('read:' + s, map);
  } catch (e) { toast(e.message || 'Could not write sub-topics.'); }
  st.noteBusy = false; render();
}
async function genNotes(s) {
  st.noteBusy = true; render();
  try {
    const out = await claudeJSON(`Write concise, exam-focused revision notes for "${sname(s)}" in ${C.name}. Syllabus topics: ${S[s].topics.join('; ')}.
Return ONLY JSON: an array of 2-3 sections {"h": heading, "items": [6-11 strings]}. First section "Must-know results" (formulas, standard results, definitions with numbers), last "PYQ traps" (common mistakes in previous-year questions). Plain text with unicode symbols, no LaTeX, each item one or two sentences. Be precise: every formula must be correct.`, 6000);
    const notes = (Array.isArray(out) ? out : []).filter(x => x && x.h && Array.isArray(x.items)).map(x => ({ h: String(x.h), items: x.items.map(String) }));
    if (!notes.length) throw { message: 'No notes came back. Try again.' };
    CS.set('notes:' + s, notes);
  } catch (e) { toast(e.message || 'Could not write notes.'); }
  st.noteBusy = false; render();
}

/* ---------- PYQ bank ---------- */
function vBank() {
  const counts = {}; for (const q of st.bank) { counts[q.subject] = counts[q.subject] || { t: 0, u: 0 }; counts[q.subject].t++; if (!st.seen.has(q.fp)) counts[q.subject].u++; }
  const prev = st.bankPreview; const sources = (C.sources || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ');
  const styleOpts = Object.keys(C.styles).map(k => `<option value="${k}">${esc(styleOf(k).label)}</option>`).join('');
  const nAuto = prev && prev.items ? prev.items.filter(q => q.answerChecked === false).length : 0;
  return `<div class="stack"><div class="sheet stack"><h3>Add previous-year questions</h3>
  <div class="muted small">Open an official paper, copy a block of questions (with the answer key if you have it) and paste it here. Claude extracts each question and tags its subject and topic. Bank questions go into your papers before any new ones, and each is used once.</div>
  <div class="row" style="align-items:flex-end"><div class="field"><label for="bk-style">Paper format</label><select id="bk-style">${styleOpts}</select></div>
   <div class="field"><label for="bk-exam">Exam name</label><input id="bk-exam" value="${esc(C.short || C.name)}" style="width:170px"></div>
   <div class="field"><label for="bk-year">Year</label><input id="bk-year" type="number" min="1980" max="2030" value="2024" style="width:96px"></div></div>
  <div class="field"><label for="bk-text">Pasted questions</label><textarea id="bk-text" placeholder="Q.12 … (A) … (B) … (C) … (D) …&#10;Answer key: 12-B, 13-C …"></textarea></div>
  <div class="row"><button class="btn primary" data-act="extract" ${st.bankBusy ? 'disabled' : ''}>${st.bankBusy ? '<span class="spin"></span> Extracting…' : 'Extract questions'}</button>${sources ? `<span class="muted small">Official papers: ${sources}</span>` : ''}</div>
  ${prev ? `<div class="notice ${prev.error ? 'err' : ''}">${prev.error ? esc(prev.error) : `Found ${prev.items.length} question${prev.items.length === 1 ? '' : 's'}${prev.dups ? `, ${prev.dups} already in your bank` : ''}.${nAuto ? ` ${nAuto} answer${nAuto === 1 ? ' was' : 's were'} worked out by Claude because no key was pasted.` : ''}`}</div>
   ${prev.items?.length ? `<div class="stack" style="gap:8px">${prev.items.slice(0, 6).map(q => `<div class="expl"><b>${esc(sname(q.subject))} · ${esc(q.topic)}</b>\n${esc(q.stem.slice(0, 220))}${q.stem.length > 220 ? '…' : ''}</div>`).join('')}${prev.items.length > 6 ? `<div class="muted">and ${prev.items.length - 6} more</div>` : ''}</div>
   <div class="row"><button class="btn primary" data-act="bankadd">Add ${prev.items.length} to bank</button><button class="btn" data-act="bankdiscard">Discard</button></div>` : ''}` : ''}
 </div>
 <div class="sheet"><h3 style="margin-bottom:8px">Your bank</h3>${st.bank.length ? `<table class="subjtable"><thead><tr><th>Subject</th><th class="n">Questions</th><th class="n">Unused</th></tr></thead><tbody>${Object.entries(counts).sort((a, b) => b[1].t - a[1].t).map(([s, v]) => `<tr><td><span class="dot" style="background:${col(s)}"></span> ${esc(sname(s))}</td><td class="n">${v.t}</td><td class="n">${v.u}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Your bank is empty. Paste questions from one official paper above to start it. Until then, papers use new questions written in the previous-year pattern.</div>'}</div></div>`;
}
async function extractBank() {
  const text = $('#bk-text').value.trim(); if (!text) { st.bankPreview = { error: 'Paste at least one question first.' }; render(); return; }
  if (!hasKey()) { st.bankPreview = { error: 'Extraction needs Claude. ' + aiHint() }; render(); return; }
  const sk = $('#bk-style').value, exam = $('#bk-exam').value.trim(), year = $('#bk-year').value; const ST = styleOf(sk); st.bankBusy = true; st.bankPreview = null; render();
  const keys = Object.entries(S).map(([k, v]) => `${k} = ${v.n}`).join('; '); const desc = ST.kind === 'desc';
  try {
    const out = await claudeJSON(`Extract every question from this text copied from the ${exam} ${year} question paper. Keep each question's wording exactly as written (fix only broken line wraps). Tag each with a subject key from: ${keys}.
For each question return ${desc ? '{"subject","topic","marks":number,"stem","modelAnswer":"key points an examiner expects, 60-120 words"}' : '{"type":"MCQ"|"MSQ"|"NAT","marks":number,"subject","topic","stem","options":[4 strings without letter prefixes, omit for NAT],"answer":MCQ letter | MSQ array | NAT {"lo","hi"},"answerFromKey":true if the answer came from an answer key in the text, false if you solved it,"explanation":"key steps, under 70 words"}'}.
Return ONLY a JSON array. Skip anything that is not a complete question (for example one that depends on a missing figure).

TEXT:
${text.slice(0, 30000)}`, 16000);
    const arr = Array.isArray(out) ? out : []; const items = []; let dups = 0;
    for (const r of arr) {
      const q = normQ(r, ST.kind === 'mcq' ? { ...ST, kind: 'mixed', marks: [Number(r.marks) || (ST.marks || [1])[0]] } : ST, null); if (!q) continue; if (ST.kind === 'mcq' && q.type !== 'MCQ') continue;
      q.source = `${exam} ${year}`; q.fp = fp(q.stem); q.answerChecked = desc ? true : !!r.answerFromKey;
      if (st.bank.some(b => b.fp === q.fp) || items.some(b => b.fp === q.fp)) { dups++; continue; } items.push(q);
    }
    st.bankPreview = items.length ? { items, dups } : { error: dups ? `All ${dups} questions are already in your bank.` : 'No complete questions were found. Include the options and, ideally, the answer key.' };
  } catch (e) { st.bankPreview = { error: e.message || 'Extraction failed.' }; }
  st.bankBusy = false; render();
}

/* ---------- Mistakes ---------- */
function vMistakes() {
  const open = st.errors.filter(e => !e.resolved).sort((a, b) => b.at - a.at); const subs = [...new Set(open.map(e => e.q.subject))]; const f = st.errFilter; const list = open.filter(e => f === 'all' || e.q.subject === f);
  return `<div class="stack"><div class="sheet"><div class="row spread"><div><h2>Mistake log</h2><div class="muted small">${open.length} unresolved · ${st.errors.length - open.length} understood. Redo each one without the solution, then mark it understood.</div></div>
  ${subs.length ? `<div class="field"><label for="ef">Subject</label><select id="ef" data-act="ef"><option value="all">All subjects</option>${subs.map(s => `<option value="${s}" ${f === s ? 'selected' : ''}>${esc(sname(s))}</option>`).join('')}</select></div>` : ''}</div></div>
 ${list.length ? list.map(e => {
    const q = e.q; const yours = Array.isArray(e.your) ? e.your.join(', ') : e.your; const right = q.type === 'NAT' ? `${q.answer.lo} to ${q.answer.hi}` : Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
    return `<details class="sheet"><summary style="cursor:pointer"><span class="qmeta" style="display:inline-flex"><span><span class="dot" style="background:${col(q.subject)}"></span> ${esc(sname(q.subject))} · ${esc(q.topic || '')}</span></span><div class="b" style="margin-top:6px">${esc(q.stem.slice(0, 160))}${q.stem.length > 160 ? '…' : ''}</div></summary>
   <div class="stack" style="margin-top:12px"><div class="stem" style="margin:0">${esc(q.stem)}</div>${q.options ? `<div class="opts">${q.options.map((o, j) => `<div class="opt"><span class="k">${LETTERS[j]}</span><span>${esc(o)}</span></div>`).join('')}</div>` : ''}
   <div class="row"><span>You answered <b class="num">${esc(yours)}</b></span><span>Correct <b class="num">${esc(right)}</b></span></div>
   <div class="expl"><b>Solution.</b> ${esc(q.explanation || '')}</div>
   <div class="row"><button class="btn small primary" data-act="resolve" data-id="${e.id}">Mark understood</button><button class="btn small" data-act="askerr" data-id="${e.id}">Ask the tutor</button><span class="muted tiny">From ${esc(e.paperTitle)}</span></div></div></details>`;
  }).join('') : `<div class="sheet empty">No unresolved mistakes. Wrong answers from your papers land here automatically.</div>`}</div>`;
}

/* ---------- Tutor ---------- */
function tutorContext() {
  const t = todayKey(); const p = dayPlan(t < PLAN_START ? PLAN_START : t);
  const wk = weekTheory(t).map(x => x.name ? `${sname(x.subj)}: ${x.name}` : sname(x.subj)).join('; ');
  const recent = st.papers.filter(x => x.status === 'done').slice(0, 5).map(x => `${x.title}: ${x.score}/${x.max}`).join('; ') || 'none yet';
  const weak = weakSubjects().slice(0, 4).map(w => `${sname(w.s)} ${w.pct}%`).join(', ') || 'not enough data';
  const missed = [1, 2, 3, 4, 5, 6, 7].map(i => addDays(t, -i)).filter(k => k >= PLAN_START && !st.progress.done[k]).map(k => fmt(k)).join(', ') || 'none';
  const errs = st.errors.filter(e => !e.resolved).slice(-8).map(e => `${sname(e.q.subject)}: ${e.q.concept || e.q.topic}`).join('; ') || 'none';
  return `You are a strict but encouraging personal tutor for: ${C.name}. ${C.description || ''}
Exams: ${C.exams.map(e => `${e.name} ${e.date}`).join(', ')}. Weekly target: ${C.hoursTarget} hours.
Today is ${fmt(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Phase: ${p.phase}.
Today's plan: ${p.items.map(i => `${i.slot} ${i.time}: ${i.title}${i.rd && i.rd.all.length ? ' (sub-topics today: ' + (i.rd.to > i.rd.from ? i.rd.all.slice(i.rd.from, i.rd.to) : i.rd.all).join('; ') + ')' : ''}`).join(' | ')}.
This week's topics: ${wk || 'n/a'}. Days in the last week not marked done: ${missed}. Hours this week: ${weekHours(t)} of ${C.hoursTarget}.
Recent papers: ${recent}. Weak subjects: ${weak}. Recent unresolved mistakes: ${errs}.
Answer concisely and concretely. For a concept doubt, explain step by step with one small worked example. For planning questions, give specific times and topics from the plan; to catch up, compress rather than shift the whole plan. Plain text only, no LaTeX or markdown headings.`;
}
function vTutor() {
  const chips = ['What should I study today?', 'I missed yesterday. How do I catch up?', 'Explain today’s topic simply', 'What are my weak areas?'];
  return `<div class="sheet"><div class="row spread"><div><h2>Tutor</h2><div class="muted small">Knows your plan, today’s topic, your scores and your mistakes.</div></div>${st.chat.length ? '<button class="btn small" data-act="chatclear">New chat</button>' : ''}</div>
 ${!hasKey() ? `<div class="notice warn" style="margin-top:12px">The tutor needs Claude. ${esc(aiHint())}</div>` : ''}
 <div class="chat" id="chat" style="margin-top:14px">${st.chat.length ? st.chat.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.role === 'user' ? m.show || m.content : m.content)}</div>`).join('') : `<div class="empty">Ask anything: a concept you are stuck on, how to adjust the plan after a busy week, or how to approach a question type.</div>`}${st.chatBusy ? `<div class="msg ai" id="streaming"><span class="spin"></span></div>` : ''}</div>
 <div class="row" style="margin-top:10px;gap:6px">${chips.map(c => `<button class="chip" data-act="chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
 <div class="composer"><textarea id="ask" placeholder="Type your question" aria-label="Your question"></textarea><button class="btn primary" data-act="send" ${st.chatBusy || !hasKey() ? 'disabled' : ''}>Send</button></div></div>`;
}
async function sendChat(text) {
  text = (text || '').trim(); if (!text || st.chatBusy || !hasKey()) return;
  st.chat.push({ role: 'user', content: text }); st.chatBusy = true; render();
  try {
    const res = await askClaude({ system: tutorContext(), messages: st.chat.map(m => ({ role: m.role, content: m.content })), max_tokens: 2000, onText: t => { const el = $('#streaming'); if (el) el.textContent = t; const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight; } });
    st.chat.push({ role: 'assistant', content: res || '(no answer)' });
  } catch (e) { st.chat.pop(); toast(e.message || 'The tutor could not answer.'); }
  st.chatBusy = false; render();
}

/* ---------- Profiles and courses ---------- */
function allCourses() { return [...st.courseIndex.map(c => ({ ...c, builtIn: true })), ...st.custom.map(c => ({ id: c.id, name: c.name, description: c.description, short: c.short, custom: true }))]; }
const courseName = id => (allCourses().find(c => c.id === id) || {}).name || id;
const courseOptions = sel => allCourses().map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
function renderProfileBar() {
  const el = $('#profbar'); if (!el) return;
  if (!st.profiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<label class="label" for="profsel">Profile</label><select id="profsel" data-act="profsel">${st.profiles.map(p => `<option value="${esc(p.id)}" ${st.profile && p.id === st.profile.id ? 'selected' : ''}>${esc(p.name)} · ${esc(courseName(p.course))}</option>`).join('')}<option value="__manage">Add or manage profiles…</option></select>`;
}
function vCourses() {
  const first = !st.profiles.length; const cur = st.profile ? st.profile.id : null;
  const list = first ? '' : `<div class="sheet stack"><h2>Profiles</h2><div class="muted small">Each profile has its own plan, papers, PYQ bank, mistakes and progress. Use one per person or per exam.</div>
  <div class="plist">${st.profiles.map(p => `<div class="pitem"><div style="min-width:0">
   ${st.renaming === p.id ? `<div class="row"><input class="inline" id="rn-${esc(p.id)}" value="${esc(p.name)}" aria-label="New name for ${esc(p.name)}"><button class="btn small primary" data-act="renamesave" data-id="${esc(p.id)}">Save</button><button class="btn small" data-act="renamecancel">Cancel</button></div>` : `<div class="b">${esc(p.name)} ${p.id === cur ? '<span class="pill pa">Current</span>' : ''}</div>`}
   <div class="muted small">${esc(courseName(p.course))}</div></div>
   <div class="row">${p.id !== cur ? `<button class="btn small primary" data-act="openprof" data-id="${esc(p.id)}">Open</button>` : ''}${st.renaming === p.id ? '' : `<button class="btn small" data-act="rename" data-id="${esc(p.id)}">Rename</button>`}${st.profiles.length > 1 ? `<button class="btn small ghost" data-act="delprof" data-id="${esc(p.id)}" aria-label="Delete profile ${esc(p.name)}">✕</button>` : ''}</div></div>`).join('')}</div>
  ${st.profMsg ? `<div class="notice">${esc(st.profMsg)}</div>` : ''}
  ${IN_CLAUDE() ? '<div class="muted tiny">Profiles are saved to your Claude account. Anyone you share this page with gets their own private profiles and progress.</div>' : ''}</div>`;
  const add = `<div class="sheet stack"><h3>${first ? 'Create your profile' : 'Add a profile'}</h3><div class="muted small">${first ? 'Choose the exam you are preparing for. You can add more profiles later, one per person or per exam.' : 'Add another person, or another exam for yourself.'}</div>
   <div class="grid-form"><div class="field"><label for="np-name">Name</label><input id="np-name" placeholder="e.g. Priya" value="${first ? 'Me' : ''}"></div>
   <div class="field"><label for="np-course">Course</label><select id="np-course">${courseOptions(null)}</select></div></div>
   <div class="row"><button class="btn primary" data-act="addprof">${first ? 'Start' : 'Create profile'}</button></div></div>`;
  const courses = `<div class="sheet stack"><h3>Courses</h3><div class="plist">${allCourses().map(c => `<div class="pitem"><div style="min-width:0"><div class="b">${esc(c.name)} ${c.custom ? '<span class="pill pt">Yours</span>' : ''}</div><div class="muted small">${esc(c.description || '')}</div></div>
   <div class="row">${c.custom ? `<button class="btn small" data-act="dlcourse" data-id="${esc(c.id)}">Download file</button>${st.profiles.some(p => p.course === c.id) ? '' : `<button class="btn small ghost" data-act="delcourse" data-id="${esc(c.id)}" aria-label="Remove course">✕</button>`}` : ''}</div></div>`).join('')}</div></div>`;
  const create = `<div class="sheet stack"><h3>Create a course with Claude</h3><div class="muted small">For an exam not listed above. Describe it and the person's situation; Claude drafts the syllabus, reading lists, weekly plan, exam pattern and milestones, and a profile is created for it.</div>
  <div class="grid-form">
   <div class="field"><label for="nc-pname">Profile name</label><input id="nc-pname" placeholder="e.g. Priya" value="${esc(st.profile ? st.profile.name : 'Me')}"></div>
   <div class="field"><label for="nc-exam">Exam(s)</label><input id="nc-exam" placeholder="e.g. SSC JE Electrical 2027, or UPPSC Food Safety Officer"></div>
   <div class="field"><label for="nc-date">Exam date (approx.)</label><input id="nc-date" type="date"></div>
   <div class="field"><label for="nc-start">Start date</label><input id="nc-start" type="date" value="${todayKey()}"></div>
   <div class="field"><label for="nc-hours">Hours per week</label><input id="nc-hours" type="number" min="3" max="80" value="20"></div>
   <div class="field wide"><label for="nc-about">About the person and their schedule</label><textarea id="nc-about" style="min-height:80px" placeholder="e.g. B.Pharm graduate, working 10–6, evenings and Sundays free, weak in analysis."></textarea></div>
  </div>
  <div class="row"><button class="btn primary" data-act="createcourse" ${st.creating || !hasKey() ? 'disabled' : ''}>${st.creating ? '<span class="spin"></span> Drafting the course…' : 'Create course and profile'}</button>${!hasKey() ? `<span class="muted small">${esc(aiHint())}</span>` : ''}</div>
  ${st.createMsg ? `<div class="notice ${st.createMsg.err ? 'err' : ''}">${esc(st.createMsg.text)}</div>` : ''}</div>`;
  const imp = `<div class="sheet stack"><h3>Import a course file</h3><div class="muted small">Load a course file someone shared with you (same format as the files in the courses folder).</div>
  <div class="row"><input type="file" id="imp-course" accept=".json,application/json"><button class="btn small" data-act="impcourse">Import</button></div></div>`;
  return `<div class="stack">${list}${add}${courses}${create}${imp}</div>`;
}
function saveCustom(c) {
  c.custom = true; st.custom = st.custom.filter(x => x.id !== c.id).concat(c);
  const { custom, ...clean } = c; Store.gset('cc.' + c.id, clean); Store.gset('ccIndex', st.custom.map(x => x.id));
}
function removeCustom(id) { st.custom = st.custom.filter(c => c.id !== id); Store.gdel('cc.' + id); Store.gset('ccIndex', st.custom.map(x => x.id)); }
async function switchProfile(id) {
  if (st.test) pauseTest();
  const p = st.profiles.find(x => x.id === id) || st.profiles[0]; if (!p) return;
  $('#view').innerHTML = `<div class="empty"><span class="spin"></span> Opening ${esc(p.name)}…</div>`;
  const c = await loadCourseById(p.course);
  await Store.openProfile(p.id); useCourse(c); st.profile = p; loadCourseData(); st.profMsg = null; st.renaming = null;
  if (Store.gget('active') !== p.id) Store.gset('active', p.id);
}
async function addProfile(name, course) {
  name = (name || '').trim() || 'Me'; if (!allCourses().some(c => c.id === course)) throw new Error('Choose a course.');
  const p = { id: 'p' + uid(), name: name.slice(0, 40), course, created: Date.now() };
  st.profiles = st.profiles.concat(p); Store.gset('profiles', st.profiles); await switchProfile(p.id); return p;
}
async function migrateLegacy() { // progress from the first version of the claude.ai page
  const L = await Store.readLegacy(); if (!L || (!L.progress && !L.papers.length && !L.errors.length)) return false;
  const gid = 'gate-ese-ece-2028'; if (!st.courseIndex.some(c => c.id === gid)) return false;
  const course = await loadCourseById(gid);
  const prog = { done: (L.progress && L.progress.done) || {}, read: {} };
  for (const k of Object.keys((L.progress && L.progress.read) || {})) {
    const [s, t, ...rest] = k.split('|'); const list = ((course.subjects[s] || {}).read || {})[t] || []; const x = list.indexOf(rest.join('|'));
    if (x >= 0) prog.read[`${s}|${t}|${x}`] = Date.now();
  }
  const styleOfMode = { GATE: 'MIXED', ESE: 'MCQ', MAINS: 'DESC' };
  const papers = L.papers.map(p => ({ ...p, style: p.style || styleOfMode[p.mode] || 'MIXED', questions: (p.questions || []).map(q => ({ ...q, neg: q.type === 'MCQ' ? (q.neg ?? 1 / 3) : 0 })) }));
  const kv = { progress: prog };
  if (L.bank.length) kv.bank = L.bank.map(({ id, ...q }) => q);
  if (L.seen.length) kv.seen = L.seen;
  if (L.concepts) kv.concepts = L.concepts;
  const p = { id: 'me', name: 'Me', course: gid, created: Date.now() };
  await Store.writeProfile(p.id, { kv, papers, errors: L.errors });
  st.profiles = [p]; Store.gset('profiles', st.profiles); Store.gset('active', p.id); await Store.drain();
  return true;
}
async function exportAll() {
  await Store.drain();
  const out = { app: 'prep-desk', version: 2, saved: new Date().toISOString(), profiles: st.profiles, courses: st.custom.map(({ custom, ...c }) => c), data: {} };
  for (const p of st.profiles) {
    let d;
    if (p.id === Store.pid) d = { kv: Object.fromEntries(Store.p), papers: Store.list('papers'), errors: Store.list('errors') };
    else { const r = await Store.readProfile(p.id); d = { kv: Object.fromEntries(r.kv), papers: [...r.papers.values()], errors: [...r.errors.values()] }; }
    delete d.kv.buckets; out.data[p.id] = d;
  }
  await download(`prep-desk-backup-${todayKey()}.json`, out);
}
async function importAll(j) {
  if (!j || j.app !== 'prep-desk' || j.version !== 2 || !Array.isArray(j.profiles)) throw new Error('That is not a Prep Desk backup file.');
  for (const c of j.courses || []) saveCustom(validateCourse(c));
  for (const p of j.profiles) {
    if (!p || !p.id || !allCourses().some(c => c.id === p.course)) continue;
    if (!st.profiles.some(x => x.id === p.id)) st.profiles = st.profiles.concat({ id: p.id, name: p.name, course: p.course, created: p.created || Date.now() });
    await Store.writeProfile(p.id, (j.data || {})[p.id] || {});
  }
  Store.gset('profiles', st.profiles); await Store.drain();
  await switchProfile(st.profile ? st.profile.id : st.profiles[0].id);
}
function validateCourse(c) {
  if (!c || typeof c !== 'object') throw new Error('Not a course object.');
  if (!c.name || !c.subjects || !Array.isArray(c.blocks) || !c.blocks.length) throw new Error('Course needs a name, subjects and blocks.');
  // names end up in HTML attributes, so only allow safe characters
  if (![...Object.keys(c.subjects), ...Object.keys(c.styles || {}), ...Object.keys(c.patterns || {})].every(k => /^[\w-]{1,40}$/.test(k)))
    throw new Error('Subject, style and pattern names may only use letters, digits, _ and -.');
  c.id = String(c.id || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'course-' + uid();
  for (const [k, s] of Object.entries(c.subjects)) { if (!s.n || !Array.isArray(s.topics) || !s.topics.length) throw new Error(`Subject ${k} needs a name and topics.`); s.c = Math.max(1, Math.min(8, Number(s.c) || 1)); if (s.read && typeof s.read === 'object') { for (const t of Object.keys(s.read)) if (!Array.isArray(s.read[t])) delete s.read[t]; } else delete s.read; }
  const keys = Object.keys(c.subjects); let prevE = null;
  c.blocks = c.blocks.filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.s) && /^\d{4}-\d{2}-\d{2}$/.test(b.e) && b.e >= b.s).sort((a, b) => a.s.localeCompare(b.s));
  for (const b of c.blocks) {
    b.kind = ['learn', 'revise', 'mock', 'written'].includes(b.kind) ? b.kind : 'learn';
    b.main = (Array.isArray(b.main) ? b.main : [b.main]).filter(k => keys.includes(k)); if (!b.main.length) b.main = keys.slice(0, 1);
    b.par = (b.par || []).filter(k => keys.includes(k)); if (b.habit && !keys.includes(b.habit)) delete b.habit;
    if (prevE && b.s <= prevE) b.s = addDays(prevE, 1); prevE = b.e; b.phase = b.phase || 'Study';
  }
  c.blocks = c.blocks.filter(b => b.e >= b.s); if (!c.blocks.length) throw new Error('No valid date blocks.');
  c.styles = c.styles && Object.keys(c.styles).length ? c.styles : { MCQ: { ...STYLE_DEFAULT.MCQ, exam: c.name } };
  for (const b of c.blocks) if (!c.styles[b.style]) b.style = Object.keys(c.styles)[0];
  for (const [k, p] of Object.entries(c.patterns || {})) { if (!p.dist || !p.title) delete c.patterns[k]; else if (!c.styles[p.style]) p.style = Object.keys(c.styles)[0]; }
  if (c.habit && !keys.includes(c.habit.subject)) delete c.habit;
  c.start = c.blocks[0].s; return c;
}
async function createCourse() {
  const exam = $('#nc-exam').value.trim(), date = $('#nc-date').value, start = $('#nc-start').value || todayKey(), hours = $('#nc-hours').value, about = $('#nc-about').value.trim();
  if (!exam || !date) { st.createMsg = { err: true, text: 'Enter the exam name and its approximate date.' }; render(); return; }
  st.creating = true; st.createMsg = null; render();
  try {
    const sample = await (await fetch('courses/' + st.courseIndex[0].file)).json(); delete sample.notes;
    const skeleton = { ...sample, subjects: Object.fromEntries(Object.entries(sample.subjects).slice(0, 2).map(([k, v]) => [k, { n: v.n, c: v.c, book: v.book, topics: v.topics.slice(0, 3) }])), blocks: sample.blocks.slice(0, 2).concat(sample.blocks.slice(-3)) };
    const out = await claudeJSON(`Design a complete study course for this student and return it as ONE JSON object.

Exam(s): ${exam}. Exam date: ${date}. Start date: ${start}. Study time: ${hours} hours per week.
About the student: ${about || 'not given'}.

Use exactly the same JSON structure as this example (abridged; your version must be complete):
${JSON.stringify(skeleton)}

Requirements:
- "subjects": every subject or section of the official syllabus, keyed by short ids; each with "n" (name), "c" (colour 1-8), "book" (standard book), "topics" (6-17 specific syllabus topics in teaching order) and "read" (object mapping every topic string to 4-6 short sub-topic phrases to read, in order). Do not include "notes". Add a "General aptitude" style subject only if the exam has one.
- "blocks": contiguous date ranges from ${start} to the exam date (no gaps or overlaps). Kinds: "learn" (main = subjects taught, par = Sunday parallel track), then "revise" (main = all subjects), then "mock" for the last 4-6 weeks, and "written" only if the exam has a descriptive stage. Block lengths should match topic counts and weightage.
- "styles": one entry per question format in this exam (kind "mixed" for MCQ+MSQ+numerical exams, "mcq" for pure MCQ, "desc" for descriptive), with the real marking scheme ("marks", "neg" as a fraction of marks) and "exam" naming the paper.
- "patterns": full-mock patterns matching the real paper (question count per subject in "dist", "mins" = real duration). "mockDays" maps weekday numbers (0=Sun … 6=Sat) to pattern ids for the mock phase. "revisionMock" = one pattern id.
- "exams": the exam date(s); "milestones": application windows, admit card, exam dates you are confident about (mark uncertain ones as expected). "hoursTarget": ${hours}. "routine": slot times that fit the student's schedule.
- "habit": a 20-minute daily practice subject if it suits the exam, else omit. "sources": official websites for previous papers only if you are sure of the URL, else [].
- Use realistic syllabus and weightage for the current exam pattern. Return ONLY the JSON object.`, 16000);
    const c = validateCourse(out);
    if (allCourses().some(x => x.id === c.id && !x.custom)) c.id += '-custom';
    saveCustom(c); const pname = ($('#nc-pname') && $('#nc-pname').value) || 'Me';
    st.creating = false; await addProfile(pname, c.id);
    st.createMsg = null; st.tab = 'today'; render(); toast(`Created "${c.name}" with ${Object.keys(c.subjects).length} subjects. Notes can be generated from the Notes tab.`); return;
  } catch (e) { st.createMsg = { err: true, text: 'Could not create the course: ' + (e.message || 'unknown error') }; }
  st.creating = false; render();
}
async function download(name, obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1);
  if (DL) { try { await DL.save({ filename: name, data: text }); } catch (e) { if (!e || e.code !== 'declined') toast((e && e.message) || 'Could not save the file.'); } return; }
  if (IN_CLAUDE()) { toast('Saving files is not available on this page.'); return; }
  const blob = new Blob([text], { type: name.endsWith('.md') ? 'text/markdown' : 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function loadCourseById(id) {
  const custom = st.custom.find(c => c.id === id); if (custom) return JSON.parse(JSON.stringify(custom));
  const meta = st.courseIndex.find(c => c.id === id) || st.courseIndex[0]; if (!meta) throw new Error('No courses found.');
  const r = await fetch('courses/' + meta.file, { cache: 'no-cache' }); if (!r.ok) throw new Error('Could not load ' + meta.file); return r.json();
}

/* ---------- Settings ---------- */
function vSettings() {
  const ai = IN_CLAUDE() ? `<div class="sheet stack"><h2>AI</h2><div class="muted small">${SAMPLE ? 'Paper building, notes, PYQ extraction, course creation and the tutor run through your Claude account on this page. No API key is needed.' : 'Claude access is off for this page. Reload it and allow Claude when asked to turn on paper building, notes and the tutor.'}</div></div>` :
  `<div class="sheet stack"><h2>Claude API key</h2>
  <div class="muted small">Paper building, notes, PYQ extraction and the tutor call Claude with your own key. It is stored only in this browser and sent only to api.anthropic.com. A Claude.ai Pro or Max subscription does not include API access: create a key and add credit at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</div>
  <div class="grid-form">
   <div class="field wide"><label for="set-key">API key</label><input id="set-key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(st.settings.key || '')}"></div>
   <div class="field"><label for="set-model">Model</label><select id="set-model">${MODELS.map(([v, l]) => `<option value="${v}" ${st.settings.model === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
  </div>
  <div class="row"><button class="btn primary" data-act="savekey">Save</button><button class="btn" data-act="testkey">Test key</button>${hasKey() ? '<button class="btn ghost" data-act="clearkey">Remove key</button>' : ''}<span class="muted small" id="keymsg"></span></div>
  <div class="muted tiny">Don't use this on a shared or public computer, and never paste your key into the GitHub repo.</div></div>`;
  const canSave = !IN_CLAUDE() || !!DL;
  return `<div class="stack">${ai}
 <div class="sheet stack"><h2>Backup</h2><div class="muted small">${IN_CLAUDE() ? 'Your profiles and progress are saved to your Claude account. A backup file lets you keep a copy or move to the GitHub version.' : 'Everything (profiles, progress, papers, PYQ bank, mistakes, your courses) lives in this browser only. Download a backup regularly, and use it to move to another device.'}</div>
  <div class="row">${canSave ? '<button class="btn" data-act="export">Download backup</button>' : ''}<input type="file" id="imp-backup" accept=".json,application/json"><button class="btn small" data-act="import">Restore backup</button></div>
  <div class="muted tiny">Restoring adds the profiles in the file and merges their data; your API key is never included in backups.</div></div>
 <div class="sheet stack"><h2>About</h2><div class="muted small">Courses are JSON files in the <code>courses</code> folder. Each holds the syllabus, reading list per topic, notes, exam pattern and plan.</div></div></div>`;
}

/* ===================== Render ===================== */
const VIEWS = { today: vToday, calendar: vCalendar, papers: vPapers, notes: vNotes, books: vBooks, bank: vBank, mistakes: vMistakes, tutor: vTutor, courses: vCourses, settings: vSettings };
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
  if (!C && !['courses', 'settings'].includes(st.tab)) st.tab = 'courses';
  $('#view').innerHTML = VIEWS[st.tab]();
  renderTop();
  if (st.tab === 'tutor') { const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight; }
  if (st.test) startTick();
}

/* ===================== Events ===================== */
document.addEventListener('click', async ev => {
  const tab = ev.target.closest('#tabs button');
  if (tab) { if (st.test && tab.dataset.tab !== 'papers') pauseTest(); st.tab = tab.dataset.tab; if (st.tab !== 'papers') st.openPaper = null; render(); return; }
  const el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return; const a = el.dataset.act;
  try {
    if (a === 'sel') { st.sel = el.dataset.day; render(); }
    else if (a === 'goday') { st.sel = el.dataset.day; st.month = st.sel.slice(0, 7); st.tab = 'calendar'; render(); }
    else if (a === 'mon') { const [y, m] = st.month.split('-').map(Number); st.month = K(new Date(Date.UTC(y, m - 1 + Number(el.dataset.d), 1))).slice(0, 7); render(); }
    else if (a === 'montoday') { const t = todayKey(); const k = t < PLAN_START ? PLAN_START : t; st.month = k.slice(0, 7); st.sel = k; render(); }
    else if (a === 'tab') { st.tab = el.dataset.to; render(); window.scrollTo(0, 0); }
    else if (a === 'notesfor' || a === 'note') {
      st.noteSubj = el.dataset.subj; st.noteTopic = el.dataset.topic || null; st.noteQ = ''; st.noteFilter = 'all'; st.tab = 'notes'; render();
      const card = st.noteTopic && document.getElementById('tp-' + fp(st.noteSubj + '|' + st.noteTopic)); if (card) card.scrollIntoView({ block: 'start' }); else if (a === 'notesfor') window.scrollTo(0, 0);
    }
    else if (a === 'bookfor') { st.bookSubj = el.dataset.subj; st.tab = 'books'; render(); window.scrollTo(0, 0); }
    else if (a === 'genkp') await genKP(el.dataset.subj);
    else if (a === 'exportnotes') await exportNotes();
    else if (a === 'revise') { const m = CS.get('revise', {}); const k = el.dataset.subj + '|' + el.dataset.topic; if (m[k]) delete m[k]; else m[k] = Date.now(); CS.set('revise', m); const y = window.scrollY; render(); window.scrollTo(0, y); }
    else if (a === 'addbook') {
      const t = $('#ob-title').value.trim(); if (!t) { toast('Enter a title.'); return; }
      const url = $('#ob-url').value.trim(); const list = ownBooks();
      list.push({ id: 'b' + uid(), t: t.slice(0, 120), a: $('#ob-author').value.trim().slice(0, 80), kind: $('#ob-kind').value, subj: $('#ob-subj').value, url: /^https?:\/\//i.test(url) ? url : '', ch: $('#ob-ch').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 200).map(n => ({ n, d: 0 })) });
      CS.set('ownbooks', list); render(); toast('Added ' + t);
    }
    else if (a === 'delbook') { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Remove this material?'; return; } CS.set('ownbooks', ownBooks().filter(o => o.id !== el.dataset.id)); render(); }
    else if (a === 'gennotes') await genNotes(el.dataset.subj);
    else if (a === 'genread') await genRead(el.dataset.subj);
    else if (a === 'paper') {
      const scope = el.dataset.scope, day = el.dataset.day;
      if (scope === 'writtenone') { await buildPaper(scopeSpec('writtenone', day, 2, null, el.dataset.subj), { scope, day }); return; }
      const ex = st.papers.find(p => p.day === day && p.scope === scope);
      if (ex) { if (ex.status === 'done') { st.tab = 'papers'; st.openPaper = ex.id; render(); } else startPaper(ex.id); return; }
      await buildPaper(scopeSpec(scope, day, 30), { scope, day });
    }
    else if (a === 'drill') {
      const s = el.dataset.subj, t = el.dataset.topic, n = Number(el.dataset.n) || 10; const b = blockFor(todayKey());
      const sk = S[s].style || (b && b.style && styleOf(b.style).kind !== 'desc' ? b.style : Object.keys(C.styles).find(k => styleOf(k).kind !== 'desc'));
      await buildPaper({ style: sk, title: `Practice · ${t || sname(s)}`, parts: t ? [{ s, t, c: n }] : Object.entries(spread(S[s].topics, n)).filter(([, c]) => c).map(([tt, c]) => ({ s, t: tt, c })) }, { scope: 'drill' });
    }
    else if (a === 'custom') { const sel = $('#cp-subj').value, n = Number($('#cp-n').value), sk = $('#cp-mode').value; const spec = scopeSpec(sel, todayKey(), n, sk); if (spec && !sel.startsWith('pattern:')) spec.style = sk; await buildPaper(spec, { scope: 'custom' }); }
    else if (a === 'start') startPaper(el.dataset.id);
    else if (a === 'open') { st.tab = 'papers'; st.openPaper = el.dataset.id; render(); window.scrollTo(0, 0); }
    else if (a === 'delpaper') { if (el.dataset.confirm === '1') { st.papers = st.papers.filter(p => p.id !== el.dataset.id); savePapers(); render(); } else { el.dataset.confirm = '1'; el.textContent = 'Delete?'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = '✕'; } }, 3000); } }
    else if (a === 'back') { st.openPaper = null; render(); }
    else if (a === 'jump') document.getElementById('rq-' + el.dataset.i)?.scrollIntoView({ behavior: 'smooth' });
    else if (a === 'qnav') { st.test.i = Math.max(0, Math.min(st.test.paper.questions.length - 1, st.test.i + Number(el.dataset.d))); render(); }
    else if (a === 'qgo') { st.test.i = Number(el.dataset.i); render(); }
    else if (a === 'clear') { delete st.test.paper.answers[st.test.i]; saveDraft(); render(); }
    else if (a === 'markq') { const m = st.test.marked; m.has(st.test.i) ? m.delete(st.test.i) : m.add(st.test.i); render(); }
    else if (a === 'pause') { pauseTest(); render(); }
    else if (a === 'submit') { if (el.dataset.confirm === '1') submitTest(); else { el.dataset.confirm = '1'; const un = st.test.paper.questions.length - Object.keys(st.test.paper.answers).length; el.textContent = un ? `Submit with ${un} unanswered?` : 'Confirm submit'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = 'Submit paper'; } }, 4000); } }
    else if (a === 'extract') await extractBank();
    else if (a === 'bankadd') { st.bank.push(...st.bankPreview.items); CS.set('bank', st.bank); st.bankPreview = null; render(); toast('Added to your PYQ bank.'); }
    else if (a === 'bankdiscard') { st.bankPreview = null; render(); }
    else if (a === 'resolve') { const e = st.errors.find(x => x.id === el.dataset.id); if (e) { e.resolved = true; e.resolvedAt = Date.now(); saveErrors(); render(); } }
    else if (a === 'askerr') {
      const e = st.errors.find(x => x.id === el.dataset.id); if (!e) return; st.tab = 'tutor'; render(); const q = e.q;
      await sendChat(`I got this wrong. Explain where I likely went wrong and the concept behind it.\n\n${q.stem}${q.options ? '\n' + q.options.map((o, j) => LETTERS[j] + ') ' + o).join('\n') : ''}\nMy answer: ${Array.isArray(e.your) ? e.your.join(',') : e.your}. Correct: ${q.type === 'NAT' ? q.answer.lo + ' to ' + q.answer.hi : Array.isArray(q.answer) ? q.answer.join(',') : q.answer}.`);
    }
    else if (a === 'chip') { st.tab = 'tutor'; await sendChat(el.dataset.q); }
    else if (a === 'send') await sendChat($('#ask').value);
    else if (a === 'chatclear') { st.chat = []; render(); }
    else if (a === 'addprof') { const p = await addProfile($('#np-name').value, $('#np-course').value); st.tab = 'today'; render(); window.scrollTo(0, 0); toast('Created profile ' + p.name); }
    else if (a === 'openprof') { await switchProfile(el.dataset.id); st.tab = 'today'; render(); window.scrollTo(0, 0); toast('Opened ' + st.profile.name); }
    else if (a === 'rename') { st.renaming = el.dataset.id; render(); const i = document.getElementById('rn-' + el.dataset.id); if (i) { i.focus(); i.select(); } }
    else if (a === 'renamecancel') { st.renaming = null; render(); }
    else if (a === 'renamesave') { const p = st.profiles.find(x => x.id === el.dataset.id); const v = (document.getElementById('rn-' + el.dataset.id)?.value || '').trim(); if (p && v) { p.name = v.slice(0, 40); Store.gset('profiles', st.profiles); } st.renaming = null; render(); }
    else if (a === 'delprof') {
      if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Delete profile and its data?'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = '✕'; } }, 4000); return; }
      const id = el.dataset.id; const p = st.profiles.find(x => x.id === id); st.profiles = st.profiles.filter(x => x.id !== id); Store.gset('profiles', st.profiles);
      if (st.profile && st.profile.id === id) await switchProfile(st.profiles[0].id);
      await Store.deleteProfile(id); st.profMsg = `Deleted ${p ? p.name : 'the profile'} and its data.`; render();
    }
    else if (a === 'createcourse') await createCourse();
    else if (a === 'dlcourse') { const c = st.custom.find(x => x.id === el.dataset.id); if (c) { const { custom, ...clean } = c; await download(c.id + '.json', clean); } }
    else if (a === 'delcourse') { if (el.dataset.confirm === '1') { removeCustom(el.dataset.id); render(); } else { el.dataset.confirm = '1'; el.textContent = 'Remove?'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = '✕'; } }, 3000); } }
    else if (a === 'impcourse') { const f = $('#imp-course').files[0]; if (!f) { toast('Choose a course file first.'); return; } const c = validateCourse(JSON.parse(await f.text())); if (st.courseIndex.some(x => x.id === c.id)) c.id += '-imported'; saveCustom(c); render(); toast(`Imported ${c.name}. Add a profile to use it.`); }
    else if (a === 'savekey') { st.settings = { key: $('#set-key').value.trim(), model: $('#set-model').value }; LS.set('settings', st.settings); render(); toast('Settings saved.'); }
    else if (a === 'clearkey') { st.settings = { ...st.settings, key: '' }; LS.set('settings', st.settings); render(); toast('Key removed from this browser.'); }
    else if (a === 'testkey') { st.settings = { key: $('#set-key').value.trim(), model: $('#set-model').value }; LS.set('settings', st.settings); const m = $('#keymsg'); m.innerHTML = '<span class="spin"></span> Testing…'; try { const t = await askClaude({ messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 10 }); m.textContent = t ? 'Key works.' : 'Got an empty reply.'; } catch (e) { m.textContent = e.message; } renderTop(); }
    else if (a === 'export') await exportAll();
    else if (a === 'import') { const f = $('#imp-backup').files[0]; if (!f) { toast('Choose a backup file first.'); return; } await importAll(JSON.parse(await f.text())); render(); toast('Backup restored.'); }
  } catch (e) { toast(e.message || 'Something went wrong.'); }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.act === 'done') { const k = el.dataset.day; const h = Number(document.querySelector(`[data-hrs="${k}"]`)?.value) || 0; if (el.checked) st.progress.done[k] = { h, at: Date.now() }; else delete st.progress.done[k]; CS.set('progress', st.progress); render(); }
  else if (el.dataset.hrs) { const k = el.dataset.hrs; if (st.progress.done[k]) { st.progress.done[k].h = Number(el.value) || 0; CS.set('progress', st.progress); render(); } }
  else if (el.dataset.act === 'readtick') { st.progress.read = st.progress.read || {}; if (el.checked) st.progress.read[el.dataset.key] = Date.now(); else delete st.progress.read[el.dataset.key]; CS.set('progress', st.progress); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (el.dataset.act === 'ef') { st.errFilter = el.value; render(); }
  else if (el.dataset.act === 'bch') { const m = CS.get('bookdone', {}); if (el.checked) m[el.dataset.key] = Date.now(); else delete m[el.dataset.key]; CS.set('bookdone', m); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (el.dataset.act === 'obch') { const list = ownBooks(); const o = list.find(x => x.id === el.dataset.id); if (o && o.ch[+el.dataset.i]) { o.ch[+el.dataset.i].d = el.checked ? Date.now() : 0; CS.set('ownbooks', list); } const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (el.dataset.act === 'nfilter') { st.noteFilter = el.value; st.noteQ = ''; render(); }
  else if (el.dataset.act === 'bsubj') { st.bookSubj = el.value; render(); }
  else if (el.dataset.act === 'profsel') { if (el.value === '__manage') { st.tab = 'courses'; render(); return; } switchProfile(el.value).then(() => { st.tab = 'today'; render(); window.scrollTo(0, 0); }).catch(e => toast(e.message || 'Could not open that profile.')); }
  else if (el.dataset.ans && st.test) {
    const T = st.test; const t = el.dataset.ans;
    if (t === 'MCQ') T.paper.answers[T.i] = el.value;
    else if (t === 'MSQ') T.paper.answers[T.i] = [...document.querySelectorAll('input[name="opt"]:checked')].map(x => x.value);
    saveDraft(); const v = T.paper.answers[T.i];
    document.querySelectorAll('.palette button')[T.i]?.classList.toggle('ans', v != null && v !== '' && !(Array.isArray(v) && !v.length));
  }
});
const noteTimers = {};
document.addEventListener('input', ev => {
  const el = ev.target;
  if (st.test && (el.dataset.ans === 'nat' || el.dataset.ans === 'desc')) { st.test.paper.answers[st.test.i] = el.value; saveDraft(); }
  else if (el.id === 'nsearch') { st.noteQ = el.value; const b = $('#nbody'); if (b) b.innerHTML = notesBody(); }
  else if (el.classList.contains('mynote')) {
    const sv = el.parentElement.querySelector('[data-saved]'); if (sv) sv.textContent = 'Saving…';
    const key = el.dataset.subj + '|' + el.dataset.topic; clearTimeout(noteTimers[key]);
    noteTimers[key] = setTimeout(() => {
      const m = CS.get('mynotes.' + el.dataset.subj, {}); if (el.value.trim()) m[el.dataset.topic] = { t: el.value, u: Date.now() }; else delete m[el.dataset.topic];
      CS.set('mynotes.' + el.dataset.subj, m); if (sv) sv.textContent = 'Saved';
    }, 600);
  }
});
document.addEventListener('keydown', ev => { if (ev.target.id === 'ask' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendChat(ev.target.value); } });
window.addEventListener('beforeunload', () => { if (st.test) pauseTest(); Store.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });

/* ===================== Boot ===================== */
(async () => {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const [db, user, sample, dl] = await Promise.all(['db', 'user', 'sample', 'downloads'].map(n => window.claude.use(n).catch(() => null)));
      SAMPLE = sample || null; DL = dl || null;
      if (db && user) { const id = await user.id(); if (id) Store.cloud(db, id); }
    }
  } catch { }
  try { await Store.loadGlobal(); } catch (e) { toast('Could not load your saved data: ' + ((e && e.message) || 'unknown error')); }
  try { const r = await fetch('courses/index.json', { cache: 'no-cache' }); st.courseIndex = r.ok ? await r.json() : []; } catch { st.courseIndex = []; }
  st.custom = Store.gget('ccIndex', []).map(id => Store.gget('cc.' + id)).filter(Boolean).map(c => ({ ...c, custom: true }));
  st.profiles = Store.gget('profiles', []);
  if (!st.profiles.length && IN_CLAUDE()) { try { if (await migrateLegacy()) toast('Your progress is now in the profile "Me".'); } catch (e) { console.warn('migration', e); } }
  if (!st.courseIndex.length && !st.custom.length) { st.tab = 'courses'; $('#view').innerHTML = `<div class="notice err">Courses could not be loaded. If you opened index.html straight from your computer, run it through a web server or open the hosted site instead.</div>`; renderTop(); return; }
  if (st.profiles.length) { try { await switchProfile(Store.gget('active', st.profiles[0].id)); } catch (e) { toast('Could not open your profile: ' + ((e && e.message) || 'unknown error')); } }
  if (!C) st.tab = 'courses';
  render();
})();
