import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPdfStream } from '@/lib/google-drive'
import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const accessToken = (session as any).accessToken as string | undefined
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const stream = await getPdfStream(accessToken, id)

  const readable = stream as unknown as Readable
  const chunks: Buffer[] = []
  for await (const chunk of readable) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)

  return new NextResponse(buffer, {
    headers: { 'Content-Type': 'application/pdf' },
  })
}
