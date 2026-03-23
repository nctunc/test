const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'suggestions.sqlite');

function ensureDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  runSql(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(suggestion_id, client_id),
      FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
    );
  `);
}

function runSql(sql, params = []) {
  return execFileSync('sqlite3', [dbPath, '-json', sql, ...params.map(String)], {
    encoding: 'utf8',
  }).trim();
}

function escape(value) {
  return String(value).replace(/'/g, "''");
}

function getSuggestions() {
  const raw = runSql(`
    SELECT
      suggestions.id,
      suggestions.title,
      suggestions.description,
      suggestions.created_at AS createdAt,
      COUNT(likes.id) AS likes
    FROM suggestions
    LEFT JOIN likes ON likes.suggestion_id = suggestions.id
    GROUP BY suggestions.id
    ORDER BY likes DESC, suggestions.created_at DESC;
  `);
  return raw ? JSON.parse(raw) : [];
}

function createSuggestion(title, description = '') {
  runSql(`
    INSERT INTO suggestions (title, description)
    VALUES ('${escape(title)}', '${escape(description)}');
  `);
  const raw = runSql(`
    SELECT id, title, description, created_at AS createdAt, 0 AS likes
    FROM suggestions
    ORDER BY id DESC
    LIMIT 1;
  `);
  return JSON.parse(raw)[0];
}

function addLike(suggestionId, clientId) {
  const safeClientId = escape(clientId);
  const raw = runSql(`
    INSERT INTO likes (suggestion_id, client_id)
    VALUES (${Number(suggestionId)}, '${safeClientId}')
    ON CONFLICT(suggestion_id, client_id) DO NOTHING;

    SELECT changes() AS changes;
  `);
  const result = JSON.parse(raw)[0];
  return Number(result.changes) > 0;
}

function suggestionExists(suggestionId) {
  const raw = runSql(`SELECT id FROM suggestions WHERE id = ${Number(suggestionId)} LIMIT 1;`);
  const rows = raw ? JSON.parse(raw) : [];
  return rows.length > 0;
}

module.exports = {
  ensureDatabase,
  getSuggestions,
  createSuggestion,
  addLike,
  suggestionExists,
  dbPath,
};
