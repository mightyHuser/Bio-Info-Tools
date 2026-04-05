'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type LookupResult = {
  source: 'db' | 'ai'
  term: string
  explanation: string
  relatedTerms: string[]
  occurrenceCount: number
}

type Props = {
  term: string
  x: number
  y: number
  pdfName: string
  onClose: () => void
  onSaved: (term: string, explanation: string, relatedTerms: string[]) => void
}

export default function TermPopup({ term, x, y, pdfName, onClose, onSaved }: Props) {
  const [result, setResult] = useState<LookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y + 8 })

  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el) return
    const POPUP_W = el.offsetWidth
    const POPUP_H = el.offsetHeight
    const container = el.offsetParent as HTMLElement | null
    const cW = container?.offsetWidth  ?? window.innerWidth
    const cH = container?.offsetHeight ?? window.innerHeight
    const left = Math.min(x, Math.max(0, cW - POPUP_W - 8))
    const top  = y + 8 + POPUP_H > cH ? Math.max(0, y - POPUP_H - 8) : y + 8
    setPos({ left, top })
  }, [x, y, result, error])

  useEffect(() => {
    setResult(null)
    setError(null)
    fetch(`/api/lookup?term=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setResult(data)
        }
      })
      .catch(() => setError('通信エラーが発生しました'))
  }, [term])

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    await fetch('/api/terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: result.term,
        explanation: result.explanation,
        tags: result.relatedTerms,
        pdfName,
      }),
    })
    setSaving(false)
    onSaved(result.term, result.explanation, result.relatedTerms)
  }

  const borderColor = result?.source === 'db' ? 'border-green-600' : 'border-blue-500'

  return (
    <div
      ref={popupRef}
      className={`absolute z-50 bg-slate-900 border ${borderColor} rounded-lg p-4 w-72 max-h-80 overflow-y-auto shadow-xl`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className={`text-sm font-semibold ${result?.source === 'db' ? 'text-green-400' : 'text-blue-400'}`}>
          {term}
        </span>
        <button onClick={onClose} aria-label="✕" className="text-slate-500 hover:text-slate-300 text-xs ml-2">
          ✕
        </button>
      </div>

      {error ? (
        <p className="text-red-400 text-xs">{error}</p>
      ) : !result ? (
        <p className="text-slate-400 text-xs animate-pulse">読み込み中...</p>
      ) : (
        <>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            result.source === 'db'
              ? 'bg-green-950 text-green-300'
              : 'bg-blue-950 text-blue-300'
          }`}>
            {result.source === 'db' ? '📚 DB' : '✨ AI生成'}
          </span>

          <p className="text-slate-200 text-xs leading-relaxed mt-2">{result.explanation}</p>

          {result.occurrenceCount > 0 && (
            <p className="text-green-500 text-xs mt-2">{result.occurrenceCount}件の発表で出現</p>
          )}

          {result.relatedTerms.length > 0 && (
            <p className="text-slate-500 text-xs mt-1">
              関連: {result.relatedTerms.join(', ')}
            </p>
          )}

          {result.source === 'ai' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-3 w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-1.5 rounded"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
