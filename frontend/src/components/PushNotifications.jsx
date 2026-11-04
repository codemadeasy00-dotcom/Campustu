import { useEffect, useState } from 'react'
import { errorMessage, pushApi } from '../services/api.js'

function decodeApplicationServerKey(encodedKey) {
  const padded = encodedKey.padEnd(Math.ceil(encodedKey.length / 4) * 4, '=')
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/')
  const binary = window.atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export default function PushNotifications() {
  const [enabled, setEnabled] = useState(false)
  const [publicKey, setPublicKey] = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const isSupported = 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && window.isSecureContext
    setSupported(isSupported)
    if (!isSupported) {
      setBusy(false)
      return undefined
    }

    Promise.all([
      pushApi.configuration(),
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()),
    ]).then(([configuration, subscription]) => {
      if (!active) return
      setEnabled(configuration.enabled)
      setPublicKey(configuration.public_key)
      setSubscribed(Boolean(subscription))
    }).catch((loadError) => {
      if (active) setError(errorMessage(loadError))
    }).finally(() => {
      if (active) setBusy(false)
    })

    return () => { active = false }
  }, [])

  async function enablePush() {
    setBusy(true)
    setError('')
    try {
      if (!enabled || !publicKey) {
        setError('Web push is not configured on the server yet.')
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Notification permission was not granted. Change it in your browser site settings to enable push.')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(publicKey),
        })
      await pushApi.subscribe(subscription.toJSON())
      setEnabled(true)
      setSubscribed(true)
    } catch (subscribeError) {
      setError(errorMessage(subscribeError))
    } finally {
      setBusy(false)
    }
  }

  async function disablePush() {
    setBusy(true)
    setError('')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setSubscribed(false)
    } catch (unsubscribeError) {
      setError(errorMessage(unsubscribeError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">Lost &amp; Found push notifications</h2>
        <p className="mt-1 text-sm text-slate-600">Get a browser notification when a visually similar lost/found post appears. Post details are not included in the notification.</p>
      </div>
      {!supported && <p className="text-sm text-amber-800">Web push is unavailable in this browser or context. Use an up-to-date browser on HTTPS.</p>}
      {supported && !enabled && <p className="text-sm text-amber-800">Push notifications are not configured on the server yet.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {supported && enabled && (
        <button
          type="button"
          disabled={busy}
          onClick={subscribed ? disablePush : enablePush}
          className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-800 disabled:opacity-50"
        >
          {busy ? 'Checking…' : subscribed ? 'Turn off push notifications' : 'Enable push notifications'}
        </button>
      )}
    </section>
  )
}
