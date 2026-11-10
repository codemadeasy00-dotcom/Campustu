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
            className="w-full max-w-xs border-2 border-teal-900 bg-white p-6 text-center font-mono shadow-[6px_6px_0px_0px_#0f766e]"
          >
            <h2 id="share-qr-title" className="mb-3 text-xs font-bold tracking-wider text-teal-900">
              SHARE CAMPUSTU INSTANTLY
            </h2>
            <div className="mb-4 flex justify-center border border-teal-800 bg-teal-50 p-3">
              <QRCodeSVG value={shareUrl} size={180} marginSize={2} />
            </div>
            <p className="mb-4 text-[10px] text-teal-700">Point another device's camera here to open this page.</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full border border-teal-800 bg-teal-900 py-2 text-xs font-bold text-white"
            >
              CLOSE
            </button>
          </section>
        </div>
      )}

      <aside
        aria-label="Share Campustu"
        className="fixed bottom-4 right-4 z-50 hidden border border-teal-800 bg-white p-3 font-mono shadow-[4px_4px_0px_0px_#0f766e] xl:block"
      >
        <div className="flex items-center gap-2">
          <div className="border border-teal-800 bg-teal-50 p-1">
            <QRCodeSVG value={shareUrl} size={64} marginSize={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-teal-900">SHARE</p>
            <p className="text-[9px] text-teal-700">Scan on mobile</p>
          </div>
        </div>
      </aside>
    </>
  )
}
