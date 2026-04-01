'use client'

import PdfViewer from '@/components/PdfViewer'
import { useState } from 'react'

type Props = { fileId: string; fileName: string }

export default function ViewerClient({ fileId, fileName }: Props) {
  const [popup, setPopup] = useState<{ term: string; x: number; y: number } | null>(null)

  return (
    <div className="flex h-screen">
      {/* PDF エリア (70%) */}
      <div className="relative flex-[7] overflow-hidden">
        <PdfViewer
          fileId={fileId}
          fileName={fileName}
          onTextSelect={(text, x, y) => setPopup({ term: text, x, y })}
        />
        {popup && (
          <div
            className="absolute z-50 bg-slate-900 border border-blue-500 rounded-lg p-4 max-w-xs shadow-xl"
            style={{ left: popup.x, top: popup.y }}
          >
            <p className="text-blue-400 font-semibold text-sm mb-1">{popup.term}</p>
            <p className="text-slate-400 text-xs">読み込み中...</p>
            <button onClick={() => setPopup(null)} className="absolute top-2 right-2 text-slate-600 hover:text-slate-300 text-xs">✕</button>
          </div>
        )}
      </div>

      {/* サイドパネル (30%) */}
      <div className="flex-[3] bg-slate-950 border-l border-slate-800 p-4">
        <p className="text-slate-500 text-sm">用語を選択すると説明が表示されます</p>
      </div>
    </div>
  )
}
