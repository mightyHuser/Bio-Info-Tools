import { NextRequest, NextResponse } from 'next/server'
import { analyzePresentation } from '@/lib/ai'
import { findTerm } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { fileId, type } = (await req.json()) as {
    fileId: string
    type: 'progress' | 'journal'
  }

  // PDF バイナリを取得 (同一オリジンのプロキシ経由)
  const origin = req.nextUrl.origin
  const pdfRes = await fetch(`${origin}/api/drive/${fileId}`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })
  if (!pdfRes.ok) return NextResponse.json({ error: 'PDF fetch failed' }, { status: 502 })
  const buffer = await pdfRes.arrayBuffer()

  // pdf-parse でテキスト抽出 (Node.js ネイティブ、worker 不要)
  const pdfParse = (await import('pdf-parse')).default
  const parsed = await pdfParse(Buffer.from(buffer))
  const fullText = parsed.text

  // AI 解析
  const analysis = await analyzePresentation(fullText, type)

  // 各用語が DB 済みかチェック
  const termsWithDbFlag = analysis.terms.map((t) => ({
    ...t,
    inDb: !!findTerm(t.term),
  }))

  return NextResponse.json({ terms: termsWithDbFlag, questions: analysis.questions })
}
