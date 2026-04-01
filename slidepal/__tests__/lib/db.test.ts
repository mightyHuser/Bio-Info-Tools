// slidepal/__tests__/lib/db.test.ts
import { upsertTerm, findTerm, getAllTerms, recordOccurrence, deleteTerm, closeDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

const TEST_DB = path.join(process.cwd(), 'test.db')

beforeEach(() => {
  process.env.DB_PATH = TEST_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
})

test('upsertTerm: 新しい用語を保存できる', () => {
  upsertTerm({ term: 'DADA2', explanation: 'アンプリコン解析ツール', tags: ['解析手法'] })
  const result = findTerm('DADA2')
  expect(result).not.toBeNull()
  expect(result!.explanation).toBe('アンプリコン解析ツール')
  expect(JSON.parse(result!.tags)).toEqual(['解析手法'])
})

test('upsertTerm: 同じ用語を再度保存すると上書きされる', () => {
  upsertTerm({ term: 'DADA2', explanation: '旧説明', tags: [] })
  upsertTerm({ term: 'DADA2', explanation: '新説明', tags: ['解析手法'] })
  const result = findTerm('DADA2')
  expect(result!.explanation).toBe('新説明')
})

test('findTerm: 存在しない用語は null を返す', () => {
  expect(findTerm('存在しない用語')).toBeNull()
})

test('getAllTerms: 登録した用語を一覧で返す', () => {
  upsertTerm({ term: 'A', explanation: '説明A', tags: [] })
  upsertTerm({ term: 'B', explanation: '説明B', tags: [] })
  const all = getAllTerms()
  expect(all).toHaveLength(2)
})

test('recordOccurrence: 出現履歴を記録できる', () => {
  upsertTerm({ term: 'DADA2', explanation: '説明', tags: [] })
  const term = findTerm('DADA2')!
  recordOccurrence({ termId: term.id, pdfName: '発表2025.pdf', page: 3 })
  const updated = findTerm('DADA2')!
  expect(updated.occurrenceCount).toBe(1)
})

test('deleteTerm: 用語を削除できる', () => {
  upsertTerm({ term: 'DADA2', explanation: '説明', tags: [] })
  const term = findTerm('DADA2')!
  deleteTerm(term.id)
  expect(findTerm('DADA2')).toBeNull()
})
