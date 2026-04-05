'use client'

import dynamic from 'next/dynamic'
import TermPopup from '@/components/TermPopup'
import SidePanel from '@/components/SidePanel'
import { useState } from 'react'

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false })

type Props = { fileId: string; fileName: string }

export default function ViewerClient({ fileId, fileName }: Props) {
  const [popup, setPopup] = useState<{ term: string; x: number; y: number } | null>(null)
  const [savedTerms, setSavedTerms] = useState<{ term: string; explanation: string; relatedTerms: string[] }[]>([])

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
            onSaved={(term, explanation, relatedTerms) => {
              setSavedTerms((prev) => [...prev, { term, explanation, relatedTerms }])
              setPopup(null)
            }}
          />
        )}
      </div>
      <SidePanel fileId={fileId} fileName={fileName} savedTerms={savedTerms} />
    </div>
  )
}
