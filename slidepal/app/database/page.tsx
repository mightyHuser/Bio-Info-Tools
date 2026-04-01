'use client'

import { useEffect, useState } from 'react'
import TermCard from '@/components/TermCard'
import type { Term } from '@/lib/db'
import Link from 'next/link'

export default function DatabasePage() {
  const [terms, setTerms] = useState<Term[]>([])
  const [search, setSearch] = useState('')

  const fetchTerms = async (q?: string) => {
    const url = q ? `/api/terms?search=${encodeURIComponent(q)}` : '/api/terms'
    const res = await fetch(url)
    setTerms(await res.json())
  }

  useEffect(() => { fetchTerms() }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchTerms(search || undefined), 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">用語データベース</h1>
          <p className="text-slate-400 text-sm mt-1">{terms.length}件登録</p>
        </div>
        <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← 一覧に戻る</Link>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍  用語を検索..."
        className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-4 py-2 mb-6 focus:outline-none focus:border-blue-500"
      />

      <div className="grid grid-cols-1 gap-3">
        {terms.map((term) => (
          <TermCard
            key={term.id}
            term={term}
            onDeleted={(id) => setTerms((prev) => prev.filter((t) => t.id !== id))}
            onUpdated={(id, explanation, tags) =>
              setTerms((prev) =>
                prev.map((t) => t.id === id ? { ...t, explanation, tags: JSON.stringify(tags) } : t)
              )
            }
          />
        ))}
      </div>

      {terms.length === 0 && (
        <p className="text-slate-600 text-center py-16">
          {search ? '該当する用語がありません' : '用語がまだ登録されていません'}
        </p>
      )}
    </main>
  )
}
