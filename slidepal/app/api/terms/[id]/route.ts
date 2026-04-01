import { NextRequest, NextResponse } from 'next/server'
import { updateTerm, deleteTerm } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { explanation, tags } = await req.json()
  updateTerm(Number(id), { explanation, tags })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  deleteTerm(Number(id))
  return NextResponse.json({ ok: true })
}
