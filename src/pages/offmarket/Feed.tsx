import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { ArrowLeft, Search, Image, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

interface RawMessage {
  id: string
  slackMessageTs: string
  slackChannelId: string
  slackThreadTs: string | null
  slackUserId: string
  userName: string
  text: string
  hasImage: boolean
  imageUrl: string | null
  imageTranscription: string | null
  createdAt: { seconds: number; nanoseconds: number } | null
}

export function OffMarketFeed() {
  const [messages, setMessages] = useState<RawMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showThreadsOnly, setShowThreadsOnly] = useState(false)

  useEffect(() => {
    const q = query(
      collection(db, 'raw_messages'),
      orderBy('createdAt', 'desc'),
      limit(200)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RawMessage[]
      setMessages(msgs)
      setLoading(false)
    }, (err) => {
      console.error('Failed to load messages:', err)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const filtered = useMemo(() => {
    let result = messages

    if (showThreadsOnly) {
      // Only show top-level messages (no thread_ts or thread_ts === message ts)
      result = result.filter(
        (m) => !m.slackThreadTs || m.slackThreadTs === m.slackMessageTs
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.text.toLowerCase().includes(q) ||
          m.userName.toLowerCase().includes(q) ||
          (m.imageTranscription && m.imageTranscription.toLowerCase().includes(q))
      )
    }

    return result
  }, [messages, searchQuery, showThreadsOnly])

  // Group messages by thread
  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of messages) {
      if (m.slackThreadTs) {
        counts[m.slackThreadTs] = (counts[m.slackThreadTs] || 0) + 1
      }
    }
    return counts
  }, [messages])

  function formatTime(ts: { seconds: number; nanoseconds: number } | null): string {
    if (!ts) return ''
    return new Date(ts.seconds * 1000).toLocaleString()
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Skills
      </Link>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">OffMarket Intel Feed</h1>
        <p className="text-slate-400 text-sm">
          Raw messages captured from Slack #{'{'}offmarket{'}'} channel.
          {messages.length > 0 && (
            <span className="text-slate-500 ml-2">
              {messages.length} messages loaded
            </span>
          )}
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search messages, names, or transcriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
        <button
          onClick={() => setShowThreadsOnly(!showThreadsOnly)}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showThreadsOnly
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
          }`}
        >
          Top-level only
        </button>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading messages...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">
            {messages.length === 0
              ? 'No messages captured yet. Messages will appear here once the Slack integration is active.'
              : 'No messages match your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => (
            <div
              key={msg.id}
              className={`p-4 rounded-xl border transition-colors ${
                msg.slackThreadTs && msg.slackThreadTs !== msg.slackMessageTs
                  ? 'ml-8 bg-white/[0.02] border-white/5'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {msg.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-white">{msg.userName}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {msg.hasImage && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                      <Image className="w-3 h-3" />
                      Image
                    </span>
                  )}
                  {msg.slackThreadTs && threadCounts[msg.slackThreadTs] > 1 && msg.slackThreadTs === msg.slackMessageTs && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                      <MessageSquare className="w-3 h-3" />
                      {threadCounts[msg.slackThreadTs]} in thread
                    </span>
                  )}
                </div>
              </div>

              {/* Message Text */}
              {msg.text && (
                <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                  {msg.text}
                </p>
              )}

              {/* Image Transcription */}
              {msg.imageTranscription && (
                <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <p className="text-xs font-medium text-amber-400 mb-1">Image Transcription</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                    {msg.imageTranscription}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
