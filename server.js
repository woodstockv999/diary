const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3009;
const DATA = path.join(__dirname, 'entries.json');
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

app.get(`${BASE}/api/entries`, (req, res) => {
  const entries = load();
  const limit = parseInt(req.query.limit) || 200;
  res.json(entries.slice(0, limit));
});

app.post(`${BASE}/api/entries`, (req, res) => {
  const { app: appName, content, author } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const entries = load();
  const entry = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    app: appName || 'general',
    content: content.trim(),
    author: author || 'manual'
  };
  entries.unshift(entry);
  save(entries);
  res.json(entry);
});

app.delete(`${BASE}/api/entries/:id`, (req, res) => {
  const entries = load().filter(e => e.id !== req.params.id);
  save(entries);
  res.json({ ok: true });
});

app.listen(PORT, '127.0.0.1', () => console.log(`diary on :${PORT}`));
