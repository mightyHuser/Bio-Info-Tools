'use client'

import { useState } from 'react'

type TermResult = { term: string; page?: number; inDb: boolean; explanation?: string; relatedTerms?: string[] }

type Props = { fileId: string; fileName: string }

export default function SidePanel({ fileId, fileName }: Props) {
  const [type, setType] = useState<'progress' | 'journal'>('progress')
  const [tab, setTab] = useState<'terms' | 'questions'>('terms')
  const [terms, setTerms] = useState<TermResult[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [newTerms, setNewTerms] = useState<TermResult[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleTerm = (term: string) => {
    setExpanded(prev => ({ ...prev, [term]: !prev[term] }))
  }

  const handleAnalyze = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, type }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTerms(data.terms)
      setQuestions(data.questions)
      setNewTerms(data.terms.filter((t: TermResult) => !t.inDb))
    } catch (e) {
      alert(`解析エラー: ${e instanceof Error ? e.message : '不明なエラー'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkSave = async () => {
    setBulkSaving(true)
    await Promise.all(
      newTerms.map((t) =>
        fetch('/api/terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: t.term, explanation: '', tags: [], pdfName: fileName }),
        })
      )
    )
    setNewTerms([])
    setBulkSaving(false)
  }

  return (
    <div className="flex-[3] bg-slate-950 border-l border-slate-800 flex flex-col">
      {/* タブ */}
      <div className="p-3 border-b border-slate-800 flex gap-2">
        {(['terms', 'questions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded text-xs ${tab === t ? 'bg-blue-900 text-blue-200' : 'text-slate-500'}`}
          >
            {t === 'terms' ? '難語リスト' : '質問候補'}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'terms' && terms.map((t, i) => (
          <div key={i} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleTerm(t.term)}
              className="w-full p-3 flex justify-between items-center hover:bg-slate-800 transition-colors text-left"
            >
              <span className="text-slate-100 text-sm font-medium">{t.term}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.inDb ? 'bg-green-950 text-green-400' : 'bg-blue-950 text-blue-400'}`}>
                  {t.inDb ? '📚 DB' : '✨ 新規'}
                </span>
                {t.explanation && <span className="text-slate-500 text-xs">{expanded[t.term] ? '▲' : '▼'}</span>}
              </div>
            </button>
            {expanded[t.term] && t.explanation && (
              <div className="px-3 pb-3 border-t border-slate-800 pt-2">
                <p className="text-slate-200 text-xs leading-relaxed">{t.explanation}</p>
                {t.relatedTerms && t.relatedTerms.length > 0 && (
                  <p className="text-slate-500 text-xs mt-1">関連: {t.relatedTerms.join(', ')}</p>
                )}
              </div>
            )}
          </div>
        ))}

        {tab === 'questions' && questions.map((q, i) => (
          <div key={i} className="bg-slate-900 rounded-lg p-3 border-l-2 border-amber-500">
            <p className="text-amber-300 text-xs">{q}</p>
          </div>
        ))}

        {terms.length === 0 && questions.length === 0 && !loading && (
          <p className="text-slate-600 text-xs text-center py-8">解析ボタンを押してください</p>
        )}
        {loading && <p className="text-slate-400 text-xs animate-pulse text-center py-8">解析中...</p>}
      </div>

      {/* フッター */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <div className="flex gap-2">
          {(['progress', 'journal'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 text-xs py-1 rounded ${type === t ? 'bg-slate-700 text-slate-100' : 'text-slate-500 border border-slate-800'}`}
            >
              {t === 'progress' ? '📊 進捗報告' : '📄 抄読'}
            </button>
          ))}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-2 rounded"
        >
          {loading ? '解析中...' : '🤖 このPDFを事前解析する'}
        </button>

        {newTerms.length > 0 && (
          <button
            onClick={handleBulkSave}
            disabled={bulkSaving}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-1.5 rounded"
          >
            {bulkSaving ? '保存中...' : `新語 ${newTerms.length}件を DB に保存`}
          </button>
        )}
      </div>
    </div>
  )
}
