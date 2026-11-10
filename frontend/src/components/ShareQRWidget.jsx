import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export const SHARE_QR_OPEN_EVENT = 'campustu:open-share-qr'

export default function ShareQRWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://campustu.vercel.app'

  useEffect(() => {
    const openShareDialog = () => {
      setIsOpen(true)
    }
    window.addEventListener(SHARE_QR_OPEN_EVENT, openShareDialog)
    return () => window.removeEventListener(SHARE_QR_OPEN_EVENT, openShareDialog)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    function closeOnEscape(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 xl:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-qr-title"
            className="w-full max-w-xs rounded-2xl border border-brand-100 bg-white p-6 text-center shadow-xl"
          >
            <h2 id="share-qr-title" className="mb-3 text-sm font-bold tracking-wide text-brand-700">
              Share Campustu instantly
            </h2>
            <div className="mb-4 flex justify-center rounded-xl border border-brand-100 bg-brand-50 p-3">
              <QRCodeSVG value={shareUrl} size={180} marginSize={2} />
            </div>
            <p className="mb-4 text-xs text-slate-600">Point another device's camera here to open this page.</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full rounded-full bg-brand-700 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Close
            </button>
          </section>
        </div>
      )}

      <aside
        aria-label="Share Campustu"
        className="fixed bottom-4 right-4 z-50 hidden rounded-2xl border border-brand-100 bg-white p-2 shadow-lg xl:block"
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-1">
            <QRCodeSVG value={shareUrl} size={64} marginSize={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-brand-700">SHARE</p>
            <p className="text-[9px] text-slate-600">Scan on mobile</p>
          </div>
        </div>
      </aside>
    </>
  )
}
