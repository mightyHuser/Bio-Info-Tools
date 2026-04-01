// slidepal/__tests__/lib/ai.test.ts
jest.mock('ai', () => ({
  generateText: jest.fn().mockResolvedValue({
    text: JSON.stringify({
      explanation: 'テスト説明',
      relatedTerms: ['関連A'],
    }),
  }),
}))

import { explainTerm, analyzePresentation } from '@/lib/ai'

test('explainTerm: 用語説明オブジェクトを返す', async () => {
  const result = await explainTerm('DADA2')
  expect(result.explanation).toBeDefined()
  expect(typeof result.explanation).toBe('string')
  expect(Array.isArray(result.relatedTerms)).toBe(true)
})

test('analyzePresentation: 難語リストと質問候補を返す', async () => {
  const { generateText } = require('ai')
  generateText.mockResolvedValueOnce({
    text: JSON.stringify({
      terms: [{ term: 'DADA2', page: 3 }],
      questions: ['手法選択の根拠は？'],
    }),
  })
  const result = await analyzePresentation('PDF本文テキスト', 'progress')
  expect(Array.isArray(result.terms)).toBe(true)
  expect(Array.isArray(result.questions)).toBe(true)
})
