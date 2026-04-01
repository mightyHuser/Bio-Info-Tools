import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listPdfFiles } from '@/lib/google-drive'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = (session as any).accessToken as string | undefined
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined

  const files = await listPdfFiles(accessToken, folderId)
  return NextResponse.json(files)
}
