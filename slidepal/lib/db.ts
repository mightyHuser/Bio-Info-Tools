// slidepal/lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'slidepal.db')
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS terms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      term        TEXT    NOT NULL UNIQUE,
      explanation TEXT    NOT NULL,
      tags        TEXT    NOT NULL DEFAULT '[]',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS term_occurrences (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id     INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      pdf_name    TEXT    NOT NULL,
      page        INTEGER,
      appeared_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export type Term = {
  id: number
  term: string
  explanation: string
  tags: string
  created_at: string
  updated_at: string
  occurrenceCount: number
}

export function upsertTerm(input: { term: string; explanation: string; tags: string[] }): Term {
  const db = getDb()
  db.prepare(`
    INSERT INTO terms (term, explanation, tags)
    VALUES (@term, @explanation, @tags)
    ON CONFLICT(term) DO UPDATE SET
      explanation = excluded.explanation,
      tags = excluded.tags,
      updated_at = CURRENT_TIMESTAMP
  `).run({ term: input.term, explanation: input.explanation, tags: JSON.stringify(input.tags) })
  return findTerm(input.term)!
}

export function findTerm(term: string): Term | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT t.*, COUNT(o.id) as occurrenceCount
    FROM terms t
    LEFT JOIN term_occurrences o ON o.term_id = t.id
    WHERE t.term = ?
    GROUP BY t.id
  `).get(term) as Term | undefined
  return row ?? null
}

export function getAllTerms(search?: string): Term[] {
  const db = getDb()
  const query = search
    ? `SELECT t.*, COUNT(o.id) as occurrenceCount
       FROM terms t
       LEFT JOIN term_occurrences o ON o.term_id = t.id
       WHERE t.term LIKE ? OR t.explanation LIKE ?
       GROUP BY t.id ORDER BY t.updated_at DESC`
    : `SELECT t.*, COUNT(o.id) as occurrenceCount
       FROM terms t
       LEFT JOIN term_occurrences o ON o.term_id = t.id
       GROUP BY t.id ORDER BY t.updated_at DESC`
  const params = search ? [`%${search}%`, `%${search}%`] : []
  return db.prepare(query).all(...params) as Term[]
}

export function recordOccurrence(input: { termId: number; pdfName: string; page?: number }) {
  const db = getDb()
  db.prepare(`
    INSERT INTO term_occurrences (term_id, pdf_name, page)
    VALUES (@termId, @pdfName, @page)
  `).run({ termId: input.termId, pdfName: input.pdfName, page: input.page ?? null })
}

export function deleteTerm(id: number) {
  getDb().prepare('DELETE FROM terms WHERE id = ?').run(id)
}

export function updateTerm(id: number, input: { explanation: string; tags: string[] }) {
  getDb().prepare(`
    UPDATE terms SET explanation = @explanation, tags = @tags, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ id, explanation: input.explanation, tags: JSON.stringify(input.tags) })
}
