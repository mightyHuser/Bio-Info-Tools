'use client'

import { useState, useCallback, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type Props = {
  fileId: string
  fileName: string
  onTextSelect: (text: string, x: number, y: number) => void
}

export default function PdfViewer({ fileId, fileName, onTextSelect }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [showPrev, setShowPrev] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (!text || text.length < 2) return

    const range = selection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return

    onTextSelect(text, rect.left - containerRect.left, rect.top - containerRect.top)
  }, [onTextSelect])

  return (
    <div ref={containerRef} className="relative h-full flex flex-col" onMouseUp={handleMouseUp}>
      {/* ページ番号 */}
      <div className="bg-slate-900 px-4 py-2 text-sm text-slate-400 border-b border-slate-800">
        {fileName} — ページ {pageNumber} / {numPages}
      </div>

      {/* PDF 表示エリア */}
      <div className="relative flex-1 overflow-auto flex justify-center bg-slate-800 p-4">
        <Document
          file={`/api/drive/${fileId}`}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <Page pageNumber={pageNumber} width={700} />
        </Document>

        {/* ← 前のページ (左端ホバー) */}
        {pageNumber > 1 && (
          <div
            className="absolute top-0 left-0 h-full w-16 flex items-center justify-center cursor-pointer"
            onMouseEnter={() => setShowPrev(true)}
            onMouseLeave={() => setShowPrev(false)}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                background: 'linear-gradient(to right, rgba(15,23,42,0.75), transparent)',
                opacity: showPrev ? 1 : 0,
              }}
            />
            <span
              className="text-3xl text-slate-200 relative z-10 transition-opacity duration-200"
              style={{ opacity: showPrev ? 1 : 0 }}
            >
              ‹
            </span>
          </div>
        )}

        {/* → 次のページ (右端ホバー) */}
        {pageNumber < numPages && (
          <div
            className="absolute top-0 right-0 h-full w-16 flex items-center justify-center cursor-pointer"
            onMouseEnter={() => setShowNext(true)}
            onMouseLeave={() => setShowNext(false)}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{
                background: 'linear-gradient(to left, rgba(15,23,42,0.75), transparent)',
                opacity: showNext ? 1 : 0,
              }}
            />
            <span
              className="text-3xl text-slate-200 relative z-10 transition-opacity duration-200"
              style={{ opacity: showNext ? 1 : 0 }}
            >
              ›
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
