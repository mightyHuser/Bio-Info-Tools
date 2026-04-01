// slidepal/__tests__/components/TermPopup.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TermPopup from '@/components/TermPopup'

global.fetch = jest.fn()

const mockDbResult = {
  source: 'db',
  term: 'DADA2',
  explanation: 'テスト説明',
  relatedTerms: ['ASV'],
  occurrenceCount: 3,
}

test('DB ヒット時: 緑バッジと説明が表示される', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => mockDbResult,
  })

  render(<TermPopup term="DADA2" x={100} y={100} pdfName="test.pdf" onClose={() => {}} onSaved={() => {}} />)

  await waitFor(() => screen.getByText('📚 DB'))
  expect(screen.getByText('テスト説明')).toBeInTheDocument()
  expect(screen.getByText('3件の発表で出現')).toBeInTheDocument()
})

test('AI 生成時: 青バッジと保存ボタンが表示される', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ...mockDbResult, source: 'ai', occurrenceCount: 0 }),
  })

  render(<TermPopup term="DADA2" x={100} y={100} pdfName="test.pdf" onClose={() => {}} onSaved={() => {}} />)

  await waitFor(() => screen.getByText('✨ AI生成'))
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
})

test('✕ ボタンで閉じられる', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => mockDbResult,
  })
  const onClose = jest.fn()
  render(<TermPopup term="DADA2" x={100} y={100} pdfName="test.pdf" onClose={onClose} onSaved={() => {}} />)
  await waitFor(() => screen.getByText('DADA2'))
  await userEvent.click(screen.getByRole('button', { name: '✕' }))
  expect(onClose).toHaveBeenCalled()
})
