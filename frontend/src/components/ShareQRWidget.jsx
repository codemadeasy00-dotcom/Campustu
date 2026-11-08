import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function ShareQRWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const shareUrl = typeof window !== 'undefined' ? window.location.href : 'https://campustu.vercel.app'

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
      <div className="fixed right-3 top-3 z-50 md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Show Campustu share QR code"
          aria-haspopup="dialog"
          className="border border-teal-800 bg-teal-900 px-2.5 py-1 text-xs font-mono text-white shadow-[2px_2px_0px_0px_#0f766e]"
        >
          QR
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 md:hidden"
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
        className="fixed bottom-4 right-4 z-50 hidden border border-teal-800 bg-white p-3 font-mono shadow-[4px_4px_0px_0px_#0f766e] md:block"
      >
        <div className="flex items-center gap-3">
          <div className="border border-teal-800 bg-teal-50 p-1">
            <QRCodeSVG value={shareUrl} size={96} marginSize={2} />
          </div>
          <div>
            <p className="text-xs font-bold text-teal-900">SHARE CAMPUSTU</p>
            <p className="text-[10px] text-teal-700">Scan to open on mobile</p>
          </div>
        </div>
      </aside>
    </>
  )
}
