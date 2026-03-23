const path = require('path');
const express = require('express');
const {
  ensureDatabase,
  getSuggestions,
  createSuggestion,
  addLike,
  suggestionExists,
} = require('./lib/database');

ensureDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/suggestions', (req, res) => {
  res.json({ suggestions: getSuggestions() });
});

app.post('/api/suggestions', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();

  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }

  const suggestion = createSuggestion(title, description);
  return res.status(201).json({ suggestion });
});

app.post('/api/suggestions/:id/like', (req, res) => {
  const suggestionId = Number(req.params.id);
  const clientId = String(req.body?.clientId || '').trim();

  if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
    return res.status(400).json({ error: 'Invalid suggestion id.' });
  }

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' });
  }

  if (!suggestionExists(suggestionId)) {
    return res.status(404).json({ error: 'Suggestion not found.' });
  }

  const inserted = addLike(suggestionId, clientId);
  if (!inserted) {
    return res.status(409).json({ error: 'You already liked this suggestion.' });
  }

  const suggestion = getSuggestions().find((entry) => Number(entry.id) === suggestionId);
  return res.status(201).json({ suggestion });
});

app.listen(PORT, () => {
  console.log(`Team activity suggestions app listening on http://localhost:${PORT}`);
});
