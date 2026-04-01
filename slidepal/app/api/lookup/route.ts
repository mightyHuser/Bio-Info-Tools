import { NextRequest, NextResponse } from 'next/server'
import { findTerm } from '@/lib/db'
import { explainTerm } from '@/lib/ai'

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('term')
  if (!term) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const existing = findTerm(term)
  if (existing) {
    return NextResponse.json({
      source: 'db' as const,
      term: existing.term,
      explanation: existing.explanation,
      relatedTerms: JSON.parse(existing.tags) as string[],
      occurrenceCount: existing.occurrenceCount,
    })
  }

  const aiResult = await explainTerm(term)
  return NextResponse.json({
    source: 'ai' as const,
    term,
    explanation: aiResult.explanation,
    relatedTerms: aiResult.relatedTerms,
    occurrenceCount: 0,
  })
}
