/* Prep Desk storage: one API over two backends.
   - cloud: claude.ai artifact database (each viewer's private data/users/<id> subtree)
   - local: browser localStorage (GitHub Pages); uploaded material goes to IndexedDB
   Global keys (profiles, custom courses) and per-profile keys; papers and mistakes are
   stored one record per item, bucketed by month, so no record nears the 256 KiB limit. */
'use strict';
const Store = {
  mode: 'local', db: null, uid: null, pid: null,
  g: new Map(), p: new Map(), items: { papers: new Map(), errors: new Map() },
  saved: { papers: new Map(), errors: new Map() }, bucketOf: new Map(), chunks: new Map(), mat: new Map(),
  queue: new Map(), timer: null, writing: false, failed: false, legacy: null, idbP: null,
  CHUNK: 60000,

  cloud(db, uid) { this.mode = 'cloud'; this.db = db; this.uid = uid; },
  base() { return 'data/users/' + this.uid; },
  pbase(pid) { return this.base() + '/p.' + (pid || this.pid); },

  /* ---------- low-level local ---------- */
  lget(k) { try { const v = localStorage.getItem('pd2:' + k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } },
  lset(k, v) { try { localStorage.setItem('pd2:' + k, JSON.stringify(v)); } catch { toast('Could not save: browser storage is full or blocked.'); } },
  ldel(k) { try { localStorage.removeItem('pd2:' + k); } catch { } },
  lkeys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('pd2:' + prefix)) out.push(k.slice(4)); } } catch { } return out; },
  /* IndexedDB for uploaded material (localStorage is too small): store "material", key "<pid>:<docId>" */
  idb(mode, fn) {
    this.idbP = this.idbP || new Promise((ok, no) => { const r = indexedDB.open('pd2', 1); r.onupgradeneeded = () => r.result.createObjectStore('material'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    return this.idbP.then(db => new Promise((ok, no) => { const tx = db.transaction('material', mode); const req = fn(tx.objectStore('material')); tx.oncomplete = () => ok(req.result); tx.onerror = () => no(tx.error || new Error('Browser storage refused the write.')); }));
  },
  irange: pid => IDBKeyRange.bound(pid + ':', pid + ':￿'),

  /* ---------- cloud write queue (debounced, last write per path wins) ---------- */
  put(path, data) { this.queue.set(path, data); this.kick(); },
  rm(path) { this.queue.set(path, null); this.kick(); },
  kick() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 500); },
  async flush() {
    if (this.writing) { this.kick(); return; }
    this.writing = true;
    try {
      while (this.queue.size) {
        const [path, data] = this.queue.entries().next().value; this.queue.delete(path);
        try { if (data === null) await this.db.doc(path).delete(); else await this.db.doc(path).set(data); this.failed = false; }
        catch (e) {
          if (e && (e.code === 'unavailable' || e.code === 'resource_exhausted')) { if (!this.queue.has(path)) this.queue.set(path, data); await new Promise(r => setTimeout(r, 1500)); continue; }
          if (!this.failed) toast(e && e.code === 'quota_exceeded' ? 'Storage is full. Delete old papers to free space.' : 'Could not save a change: ' + ((e && e.message) || 'unknown error'));
          this.failed = true;
        }
      }
    } finally { this.writing = false; }
  },
  async drain() { clearTimeout(this.timer); await this.flush(); },

  /* chunk-aware value write for cloud docs */
  cwrite(colPath, key, v) {
    const s = JSON.stringify(v); const old = this.chunks.get(colPath + '/' + key) || 0;
    if (s.length <= this.CHUNK) { this.put(colPath + '/' + key, { v }); for (let i = 0; i < old; i++) this.rm(colPath + '/' + key + '~' + i); this.chunks.set(colPath + '/' + key, 0); return; }
    const n = Math.ceil(s.length / this.CHUNK);
    for (let i = 0; i < n; i++) this.put(colPath + '/' + key + '~' + i, { s: s.slice(i * this.CHUNK, (i + 1) * this.CHUNK) });
    for (let i = n; i < old; i++) this.rm(colPath + '/' + key + '~' + i);
    this.put(colPath + '/' + key, { chunks: n }); this.chunks.set(colPath + '/' + key, n);
  },
  cdelete(colPath, key) { const n = this.chunks.get(colPath + '/' + key) || 0; this.rm(colPath + '/' + key); for (let i = 0; i < n; i++) this.rm(colPath + '/' + key + '~' + i); this.chunks.delete(colPath + '/' + key); },
  async cread(colPath) { // -> Map key -> value (chunks reassembled)
    const snap = await this.db.collection(colPath).limit(1000).get(); const raw = new Map(), out = new Map();
    snap.docs.forEach(d => raw.set(d.id, d.data()));
    for (const [id, d] of raw) {
      if (id.includes('~')) continue;
      if (d && d.chunks) { let s = ''; for (let i = 0; i < d.chunks; i++) s += (raw.get(id + '~' + i) || {}).s || ''; try { out.set(id, JSON.parse(s)); this.chunks.set(colPath + '/' + id, d.chunks); } catch { } }
      else if (d && 'v' in d) out.set(id, d.v);
    }
    return out;
  },

  /* ---------- global ---------- */
  async loadGlobal() {
    this.g.clear();
    if (this.mode === 'cloud') {
      const snap = await this.db.collection(this.base()).limit(1000).get();
      const raw = new Map(); snap.docs.forEach(d => raw.set(d.id, d.data()));
      for (const [id, d] of raw) {
        if (!id.startsWith('g.') || id.includes('~')) continue; const key = id.slice(2);
        if (d && d.chunks) { let s = ''; for (let i = 0; i < d.chunks; i++) s += (raw.get(id + '~' + i) || {}).s || ''; try { this.g.set(key, JSON.parse(s)); this.chunks.set(this.base() + '/' + id, d.chunks); } catch { } }
        else if (d && 'v' in d) this.g.set(key, d.v);
      }
      if (raw.has('progress')) this.legacy = raw.get('progress');
    } else {
      for (const k of this.lkeys('g:')) this.g.set(k.slice(2), this.lget(k));
    }
  },
  gget(k, d) { return this.g.has(k) ? this.g.get(k) : d; },
  gset(k, v) {
    this.g.set(k, v);
    if (this.mode === 'cloud') { const n = this.chunks.get(this.base() + '/g.' + k) || 0; const s = JSON.stringify(v);
      if (s.length <= this.CHUNK) { this.put(this.base() + '/g.' + k, { v }); for (let i = 0; i < n; i++) this.rm(this.base() + '/g.' + k + '~' + i); this.chunks.set(this.base() + '/g.' + k, 0); }
      else { const m = Math.ceil(s.length / this.CHUNK); for (let i = 0; i < m; i++) this.put(this.base() + '/g.' + k + '~' + i, { s: s.slice(i * this.CHUNK, (i + 1) * this.CHUNK) }); for (let i = m; i < n; i++) this.rm(this.base() + '/g.' + k + '~' + i); this.put(this.base() + '/g.' + k, { chunks: m }); this.chunks.set(this.base() + '/g.' + k, m); } }
    else this.lset('g:' + k, v);
  },
  gdel(k) { this.g.delete(k); if (this.mode === 'cloud') { const n = this.chunks.get(this.base() + '/g.' + k) || 0; this.rm(this.base() + '/g.' + k); for (let i = 0; i < n; i++) this.rm(this.base() + '/g.' + k + '~' + i); } else this.ldel('g:' + k); },

  /* ---------- profile data ---------- */
  async readProfile(pid) { // -> {kv: Map, papers: Map, errors: Map, buckets, material: []}
    const out = { kv: new Map(), papers: new Map(), errors: new Map(), bucketOf: new Map(), material: [] };
    if (this.mode === 'cloud') {
      out.kv = await this.cread(this.pbase(pid) + '/kv');
      const buckets = out.kv.get('buckets') || {};
      for (const col of ['papers', 'errors']) for (const b of (buckets[col] || [])) {
        const m = await this.cread(this.pbase(pid) + '/' + col + '_' + b); for (const [id, v] of m) { out[col].set(id, v); out.bucketOf.set(col + '/' + id, b); }
      }
      // shortcut: cread reads at most 1000 records, about 50 whole-textbook PDFs; page the read if a student goes past that
      out.material = [...(await this.cread(this.pbase(pid) + '/material')).values()];
    } else {
      for (const k of this.lkeys('p:' + pid + ':')) out.kv.set(k.slice(('p:' + pid + ':').length), this.lget(k));
      for (const col of ['papers', 'errors']) for (const k of this.lkeys('i:' + pid + ':' + col + ':')) out[col].set(k.split(':').pop(), this.lget(k));
      try { out.material = await this.idb('readonly', s => s.getAll(this.irange(pid))) || []; } catch { toast('Your uploaded material could not be read from this browser.'); }
    }
    return out;
  },
  /* uploaded material: {id, name, kind, subj, topic, added, pages:[text]}; cloud = one chunked record per document */
  mlist() { return [...this.mat.values()]; },
  mget(id) { return this.mat.get(id); },
  async mput(doc, pid = this.pid) {
    if (this.mode === 'cloud') this.cwrite(this.pbase(pid) + '/material', doc.id, doc); else await this.idb('readwrite', s => s.put(doc, pid + ':' + doc.id));
    if (pid === this.pid) this.mat.set(doc.id, doc);
  },
  async mdel(id, pid = this.pid) {
    if (this.mode === 'cloud') this.cdelete(this.pbase(pid) + '/material', id); else await this.idb('readwrite', s => s.delete(pid + ':' + id));
    if (pid === this.pid) this.mat.delete(id);
  },
  async openProfile(pid) {
    await this.drain(); this.pid = pid;
    const d = await this.readProfile(pid);
    this.p = d.kv; this.bucketOf = d.bucketOf; this.mat = new Map(d.material.map(x => [x.id, x]));
    for (const col of ['papers', 'errors']) { this.items[col] = d[col]; this.saved[col] = new Map([...d[col]].map(([id, v]) => [id, JSON.stringify(v)])); }
  },
  pget(k, d) { return this.p.has(k) ? this.p.get(k) : d; },
  pset(k, v) { this.p.set(k, v); if (this.mode === 'cloud') this.cwrite(this.pbase() + '/kv', k, v); else this.lset('p:' + this.pid + ':' + k, v); },
  list(col) { return [...this.items[col].values()]; },
  sync(col, arr) { // write changed items, delete removed ones
    const seen = new Set();
    for (const it of arr) {
      const id = String(it.id); seen.add(id); const j = JSON.stringify(it);
      if (this.saved[col].get(id) === j) continue;
      this.saved[col].set(id, j); this.items[col].set(id, it);
      if (this.mode === 'cloud') {
        let b = this.bucketOf.get(col + '/' + id);
        if (!b) { const t = new Date(it.created || it.at || Date.now()); b = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; this.bucketOf.set(col + '/' + id, b);
          const bk = this.pget('buckets', {}); if (!(bk[col] || []).includes(b)) { bk[col] = [...(bk[col] || []), b]; this.pset('buckets', bk); } }
        this.put(this.pbase() + '/' + col + '_' + b + '/' + id, { v: it });
      } else this.lset('i:' + this.pid + ':' + col + ':' + id, it);
    }
    for (const id of [...this.saved[col].keys()]) if (!seen.has(id)) {
      this.saved[col].delete(id); this.items[col].delete(id);
      if (this.mode === 'cloud') { const b = this.bucketOf.get(col + '/' + id); if (b) this.rm(this.pbase() + '/' + col + '_' + b + '/' + id); this.bucketOf.delete(col + '/' + id); }
      else this.ldel('i:' + this.pid + ':' + col + ':' + id);
    }
  },
  async writeProfile(pid, data) { // data: {kv:{}, papers:[], errors:[], material:[]} — used by restore
    const prev = this.pid, prevP = this.p, prevItems = this.items, prevSaved = this.saved, prevB = this.bucketOf, prevM = this.mat;
    if (pid !== this.pid) { this.pid = pid; this.p = new Map(); this.items = { papers: new Map(), errors: new Map() }; this.saved = { papers: new Map(), errors: new Map() }; this.bucketOf = new Map(); const cur = await this.readProfile(pid); this.p = cur.kv; this.bucketOf = cur.bucketOf; this.mat = new Map(cur.material.map(x => [x.id, x])); for (const col of ['papers', 'errors']) { this.items[col] = cur[col]; this.saved[col] = new Map([...cur[col]].map(([id, v]) => [id, JSON.stringify(v)])); } }
    for (const [k, v] of Object.entries(data.kv || {})) this.pset(k, v);
    for (const col of ['papers', 'errors']) { const merged = new Map(this.items[col]); for (const it of (data[col] || [])) merged.set(String(it.id), it); this.sync(col, [...merged.values()]); }
    for (const d of data.material || []) if (d && d.id && Array.isArray(d.pages)) await this.mput(d);
    await this.drain();
    if (prev !== pid) { this.pid = prev; this.p = prevP; this.items = prevItems; this.saved = prevSaved; this.bucketOf = prevB; this.mat = prevM; }
  },
  async deleteProfile(pid) {
    const d = await this.readProfile(pid);
    if (this.mode === 'cloud') {
      for (const k of d.kv.keys()) this.cdelete(this.pbase(pid) + '/kv', k);
      for (const col of ['papers', 'errors']) for (const id of d[col].keys()) { const b = d.bucketOf.get(col + '/' + id); if (b) this.rm(this.pbase(pid) + '/' + col + '_' + b + '/' + id); }
      for (const m of d.material) this.cdelete(this.pbase(pid) + '/material', m.id);
      await this.drain();
    } else {
      for (const k of this.lkeys('p:' + pid + ':')) this.ldel(k);
      for (const k of this.lkeys('i:' + pid + ':')) this.ldel(k);
      try { await this.idb('readwrite', s => s.delete(this.irange(pid))); } catch { }
    }
  },

  /* ---------- legacy (first version of the claude.ai page) ---------- */
  async readLegacy() {
    if (this.mode !== 'cloud') return null;
    const out = { progress: this.legacy, papers: [], errors: [], bank: [], seen: [], concepts: null };
    const col = async name => { try { const s = await this.db.collection(this.base() + '/app/' + name).limit(1000).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); } catch { return []; } };
    out.papers = await col('papers'); out.errors = await col('errors'); out.bank = await col('bank');
    (await col('seen')).forEach(c => out.seen.push(...(c.fps || [])));
    try { const c = await this.db.doc(this.base() + '/concepts').get(); if (c.exists) out.concepts = c.data(); } catch { }
    return out;
  }
};
