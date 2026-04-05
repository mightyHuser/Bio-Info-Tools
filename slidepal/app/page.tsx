import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listPdfFiles } from '@/lib/google-drive'
import Link from 'next/link'

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/api/auth/signin')

  const accessToken = (session as any).accessToken as string | undefined
  const authError   = (session as any).error as string | undefined
  if (!accessToken || authError === 'RefreshAccessTokenError') redirect('/api/auth/signin')

  const files = await listPdfFiles(accessToken)

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">SlidePal</h1>
        <Link href="/database" className="text-sm text-slate-400 hover:text-blue-400 transition-colors">
          📚 用語DB
        </Link>
      </div>
      <p className="text-slate-400 mb-8">Google Drive の PDF ファイル一覧</p>

      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id}>
            <Link
              href={`/viewer/${file.id}`}
              className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-blue-600 transition-colors"
            >
              <span className="text-slate-100">{file.name}</span>
              <span className="text-slate-500 text-sm">
                {new Date(file.modifiedTime).toLocaleDateString('ja-JP')}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {files.length === 0 && (
        <p className="text-slate-500 text-center py-16">PDF ファイルが見つかりませんでした</p>
      )}
    </main>
  )
}
