import { NextRequest, NextResponse } from 'next/server'
import { upsertTerm, recordOccurrence, getAllTerms } from '@/lib/db'

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search') ?? undefined
  return NextResponse.json(getAllTerms(search))
}

export async function POST(req: NextRequest) {
  const { term, explanation, tags, pdfName, page } = await req.json()
  const saved = upsertTerm({ term, explanation, tags: tags ?? [] })
  if (pdfName) {
    recordOccurrence({ termId: saved.id, pdfName, page })
  }
  return NextResponse.json(saved, { status: 201 })
}
