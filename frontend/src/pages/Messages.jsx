import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { conversationsApi, errorMessage } from '../services/api.js'

function formatMessageTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

export default function Messages() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [pageError, setPageError] = useState('')
  const [listError, setListError] = useState('')
  const [threadError, setThreadError] = useState('')
  const [openRetry, setOpenRetry] = useState(0)
  const latestMessageId = useRef('')
  const endOfThreadRef = useRef(null)
  const openingKey = useRef('')
  const itemId = searchParams.get('item_id')
  const lostFoundItemId = searchParams.get('lost_found_item_id')
  const claimId = searchParams.get('claim_id')

  const refreshConversations = useCallback(async () => {
    try {
      const result = await conversationsApi.list()
      setConversations(result.conversations || [])
      setListError('')
    } catch (error) {
      setListError(errorMessage(error))
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    refreshConversations()
    const timer = window.setInterval(refreshConversations, 45_000)
    return () => window.clearInterval(timer)
  }, [refreshConversations])

  useEffect(() => {
    if (!itemId && !lostFoundItemId && !claimId) return
    const key = `${itemId || ''}:${lostFoundItemId || ''}:${claimId || ''}`
    if (openingKey.current === key) return
    openingKey.current = key
    setPageError('')

    const context = itemId
      ? { item_id: itemId }
      : claimId
        ? { claim_id: claimId }
        : { lost_found_item_id: lostFoundItemId }
    conversationsApi.create(context)
      .then(({ conversation }) => {
        navigate(`/messages/${encodeURIComponent(conversation.id)}`, { replace: true })
        refreshConversations()
      })
      .catch((error) => {
        openingKey.current = ''
        setPageError(errorMessage(error))
      })
  }, [itemId, lostFoundItemId, claimId, navigate, refreshConversations, openRetry])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      latestMessageId.current = ''
      setThreadError('')
      return undefined
    }

    let active = true
    setLoadingThread(true)
    setThreadError('')
    latestMessageId.current = ''

    const loadLatest = async () => {
      try {
        const result = await conversationsApi.messages(conversationId)
        if (!active) return
        const initialMessages = result.messages || []
        setMessages(initialMessages)
        latestMessageId.current = initialMessages.at(-1)?.id || ''
        setThreadError('')
      } catch (error) {
        if (active) setThreadError(errorMessage(error))
      } finally {
        if (active) setLoadingThread(false)
      }
    }

    loadLatest()
    return () => {
      active = false
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return undefined
    let active = true

    const pollMessages = async () => {
      try {
        const result = await conversationsApi.messages(conversationId, latestMessageId.current || undefined)
        if (!active) return
        const newMessages = result.messages || []
        if (newMessages.length) {
          latestMessageId.current = newMessages.at(-1).id
          setMessages((current) => {
            const existingIds = new Set(current.map((message) => message.id))
            return [...current, ...newMessages.filter((message) => !existingIds.has(message.id))]
          })
        }
        setThreadError('')
      } catch (error) {
        if (active) setThreadError(errorMessage(error))
      }
    }

    const timer = window.setInterval(pollMessages, 12_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [conversationId, messages.length])

  useEffect(() => {
    endOfThreadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const selectedConversation = conversations.find((entry) => entry.id === conversationId)

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!conversationId || !body || sending) return

    setSending(true)
    setThreadError('')
    try {
      const result = await conversationsApi.send(conversationId, body)
      const message = result.message
      latestMessageId.current = message.id
      setMessages((current) => current.some((entry) => entry.id === message.id) ? current : [...current, message])
      setDraft('')
      refreshConversations()
    } catch (error) {
      setThreadError(errorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const showEmptyThread = !conversationId && !itemId && !lostFoundItemId && !claimId

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Campustu inbox</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-slate-600">Coordinate directly with students about marketplace listings and Lost &amp; Found reports.</p>
      </header>

      {(pageError || listError) && (
        <div className="mb-4 space-y-2">
          <Alert>{pageError || listError}</Alert>
          <button
            type="button"
            onClick={() => pageError && (itemId || lostFoundItemId || claimId)
              ? setOpenRetry((count) => count + 1)
              : refreshConversations()}
            className="text-sm font-semibold text-brand-700 underline"
          >
            Try again
          </button>
        </div>
      )}

      <div className="grid min-h-[65vh] overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm md:grid-cols-[minmax(16rem,0.36fr)_minmax(0,1fr)]">
        <aside className={`${conversationId ? 'hidden md:block' : ''} border-b border-brand-100 md:border-b-0 md:border-r`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">Your conversations</h2>
          </div>
          {loadingList ? (
            <p role="status" className="p-5 text-sm text-slate-500">Loading conversations…</p>
          ) : conversations.length ? (
            <ul className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    to={`/messages/${encodeURIComponent(conversation.id)}`}
                    className={`block px-4 py-4 transition hover:bg-brand-50 ${
                      conversation.id === conversationId ? 'bg-brand-50' : ''
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">{conversation.other_user_name}</span>
                      {Number(conversation.unread_count) > 0 && (
                        <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-brand-700">{conversation.subject}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{conversation.last_message || 'No messages yet'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">No conversations yet.</p>
              <p className="mt-1">Open a listing or report and choose Message to start one.</p>
            </div>
          )}
        </aside>

        <div className={`${conversationId ? '' : 'hidden md:flex'} min-h-[65vh] flex-col`}>
          {conversationId ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <Link to="/messages" className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 md:hidden">Back</Link>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900">
                    {selectedConversation?.other_user_name || 'Conversation'}
                  </h2>
                  <p className="truncate text-xs text-slate-500">{selectedConversation?.subject || 'Campus message thread'}</p>
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
                {threadError && <Alert>{threadError}</Alert>}
                {loadingThread ? (
                  <p role="status" className="py-8 text-center text-sm text-slate-500">Loading messages…</p>
                ) : messages.length ? (
                  messages.map((message) => {
                    const mine = message.sender_id === user?.id
                    return (
                      <article key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm sm:max-w-[75%] ${
                          mine ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                        }`}>
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                          <time className={`mt-1 block text-right text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                            {formatMessageTime(message.created_at)}
                          </time>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">Say hello to start the conversation.</p>
                )}
                <div ref={endOfThreadRef} />
              </div>
              <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3 sm:p-4">
                <label className="sr-only" htmlFor="message-draft">Write a message</label>
                <textarea
                  id="message-draft"
                  rows={2}
                  maxLength={2000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message…"
                  className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="rounded-xl bg-brand-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          ) : showEmptyThread ? (
            <div className="m-auto hidden max-w-sm p-8 text-center md:block">
              <p className="text-lg font-bold text-slate-900">Select a conversation</p>
              <p className="mt-2 text-sm text-slate-600">Your item-related messages will appear here.</p>
              <Link to="/marketplace" className="mt-4 inline-flex rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Browse marketplace</Link>
            </div>
          ) : (
            <p role="status" className="m-auto p-8 text-center text-sm text-slate-600">Opening conversation…</p>
          )}
        </div>
      </div>
    </section>
  )
}
