const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3009;
const DATA = path.join(__dirname, 'entries.json');
const MEMORY_INDEX = '/home/w00dst0ck/.claude/projects/-home-w00dst0ck/memory/MEMORY.md';
const BASE = '/diary';

const app = express();
app.use(express.json());
app.use(BASE, express.static(path.join(__dirname, 'public')));

function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return []; }
}
function save(entries) {
  fs.writeFileSync(DATA, JSON.stringify(entries, null, 2));
}

let writeQueue = Promise.resolve();
function withWriteLock(fn) {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => {});
  return result;
}

app.get(`${BASE}/api/entries`, (req, res) => {
  const entries = load();
  const limit = parseInt(req.query.limit) || 200;
  res.json(entries.slice(0, limit));
});

const VALID_KINDS = ['trade-reflection'];

app.post(`${BASE}/api/entries`, async (req, res) => {
  const { app: appName, content, author, kind } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const entry = await withWriteLock(() => {
    const entries = load();
    const newEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      app: appName || 'general',
      content: content.trim(),
      author: author || 'manual'
    };
    if (VALID_KINDS.includes(kind)) newEntry.kind = kind;
    entries.unshift(newEntry);
    save(entries);
    return newEntry;
  });
  res.json(entry);
});

app.get(`${BASE}/api/memory-index`, (req, res) => {
  let raw = '';
  let mtime = null;
  try {
    raw = fs.readFileSync(MEMORY_INDEX, 'utf8');
    mtime = fs.statSync(MEMORY_INDEX).mtime.toISOString();
  } catch {
    return res.json({ updatedAt: null, items: [] });
  }
  const items = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^- \[(.+?)\]\((.+?)\) *[—-] *(.+)$/);
    if (m) items.push({ title: m[1], file: m[2], desc: m[3] });
  }
  res.json({ updatedAt: mtime, items });
});

app.delete(`${BASE}/api/entries/:id`, async (req, res) => {
  await withWriteLock(() => {
    const entries = load().filter(e => e.id !== req.params.id);
    save(entries);
  });
  res.json({ ok: true });
});

app.listen(PORT, '127.0.0.1', () => console.log(`diary on :${PORT}`));
