'use client'

import dynamic from 'next/dynamic'
import TermPopup from '@/components/TermPopup'
import { useState } from 'react'

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false })

type Props = { fileId: string; fileName: string }

export default function ViewerClient({ fileId, fileName }: Props) {
  const [popup, setPopup] = useState<{ term: string; x: number; y: number } | null>(null)

  return (
    <div className="flex h-screen">
      <div className="relative flex-[7] overflow-hidden">
        <PdfViewer
          fileId={fileId}
          fileName={fileName}
          onTextSelect={(text, x, y) => setPopup({ term: text, x, y })}
        />
        {popup && (
          <TermPopup
            term={popup.term}
            x={popup.x}
            y={popup.y}
            pdfName={fileName}
            onClose={() => setPopup(null)}
            onSaved={() => setPopup(null)}
          />
        )}
      </div>
      <div className="flex-[3] bg-slate-950 border-l border-slate-800 p-4">
        <p className="text-slate-500 text-sm">用語を選択すると説明が表示されます</p>
      </div>
    </div>
  )
}
