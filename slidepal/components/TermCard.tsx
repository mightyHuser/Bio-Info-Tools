'use client'

import { useState } from 'react'
import type { Term } from '@/lib/db'

type Props = {
  term: Term
  onDeleted: (id: number) => void
  onUpdated: (id: number, explanation: string, tags: string[]) => void
}

export default function TermCard({ term, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [explanation, setExplanation] = useState(term.explanation)
  const tags = JSON.parse(term.tags) as string[]

  const handleSave = async () => {
    await fetch(`/api/terms/${term.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explanation, tags }),
    })
    onUpdated(term.id, explanation, tags)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm(`"${term.term}" を削除しますか？`)) return
    await fetch(`/api/terms/${term.id}`, { method: 'DELETE' })
    onDeleted(term.id)
  }

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-slate-600 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="text-slate-100 font-semibold">{term.term}</span>
        <div className="flex gap-2 text-xs">
          <button onClick={() => setEditing(!editing)} className="text-slate-500 hover:text-blue-400">編集</button>
          <button onClick={handleDelete} className="text-slate-500 hover:text-red-400">削除</button>
        </div>
      </div>

      {editing ? (
        <>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full bg-slate-800 text-slate-100 text-sm p-2 rounded border border-slate-700 resize-none"
            rows={3}
          />
          <button onClick={handleSave} className="mt-2 bg-blue-700 text-white text-xs px-3 py-1 rounded">
            保存
          </button>
        </>
      ) : (
        <p className="text-slate-400 text-sm leading-relaxed">{term.explanation}</p>
      )}

      <div className="mt-3 flex justify-between text-xs text-slate-600">
        <span>📄 {term.occurrenceCount}件の発表</span>
        <span>{new Date(term.updated_at).toLocaleDateString('ja-JP')}</span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
