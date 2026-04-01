import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listPdfFiles } from '@/lib/google-drive'
import ViewerClient from './ViewerClient'

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/api/auth/signin')

  const { id } = await params
  const accessToken = (session as any).accessToken as string | undefined
  if (!accessToken) redirect('/api/auth/signin')
  const files = await listPdfFiles(accessToken)
  const file = files.find((f) => f.id === id)

  return <ViewerClient fileId={id} fileName={file?.name ?? 'PDF'} />
}
