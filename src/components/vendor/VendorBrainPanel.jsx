import { useState, useEffect, useRef } from 'react'
import { Sparkles, Send, Loader, ChevronDown, ChevronUp, Copy, Check, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import ReactMarkdown from 'react-markdown'

// ─── Markdown renderer (same as DealBrainPanel) ───────────────────────────────
function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const text = String(children).replace(/\n$/, '')
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      <div className="bg-gray-900 px-3 pt-3 pb-3 font-mono text-[11px] leading-relaxed text-gray-100 overflow-x-auto whitespace-pre">{text}</div>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className="absolute top-2 right-2 p-1 rounded bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  )
}

const mdComponents = {
  p:          ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong:     ({ children }) => <strong className="font-semibold text-navy-900">{children}</strong>,
  em:         ({ children }) => <em className="italic">{children}</em>,
  h1:         ({ children }) => <h1 className="text-sm font-bold text-navy-900 mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2:         ({ children }) => <h2 className="text-xs font-bold text-navy-900 mt-3 mb-1 first:mt-0 uppercase tracking-wide">{children}</h2>,
  h3:         ({ children }) => <h3 className="text-xs font-semibold text-navy-900 mt-2 mb-0.5 first:mt-0">{children}</h3>,
  ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-primary-300 pl-3 my-2 text-gray-500 italic">{children}</blockquote>,
  hr:         ()             => <hr className="border-gray-200 my-3" />,
  code:       ({ inline, children, ...props }) =>
    inline
      ? <code className="bg-gray-100 text-pink-600 rounded px-1 py-0.5 font-mono text-[10px]" {...props}>{children}</code>
      : <CodeBlock>{children}</CodeBlock>,
  pre:        ({ children }) => <>{children}</>,
  table:      ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-[11px] border-collapse">{children}</table></div>,
  th:         ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold text-left text-navy-900">{children}</th>,
  td:         ({ children }) => <td className="border border-gray-200 px-2 py-1 text-gray-700">{children}</td>,
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function VendorBrainPanel({ vendor, contracts, allDocs }) {
  const [chat, setChat] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [minimized, setMinimized] = useState(true)
  const [activePdf, setActivePdf] = useState(null)   // currently selected PDF file_path
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // All PDFs across all contracts, for the file selector
  const pdfs = allDocs.filter((d) => d.mime_type === 'application/pdf')

  // Auto-select the first PDF when docs load
  useEffect(() => {
    if (pdfs.length > 0 && !activePdf) setActivePdf(pdfs[0].file_path)
  }, [pdfs.length])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  // Build context string about this vendor and its contracts
  function buildContext() {
    const lines = [
      `Vendor: ${vendor.name}`,
      vendor.website ? `Website: ${vendor.website}` : null,
      vendor.notes   ? `Notes: ${vendor.notes}`     : null,
      '',
      'Contracts on file:',
      ...contracts.map((c) => {
        const cDocs = allDocs.filter((d) => d.contract_id === c.id)
        const docNames = cDocs.map((d) => d.file_name).join(', ') || 'no documents'
        const term = c.end_date ? ` · Terminated ${c.end_date}` : ' · Active'
        return `  - ${c.title} (${c.contract_type.toUpperCase()}) — started ${c.start_date || 'unknown'}${term} — files: ${docNames}`
      }),
    ].filter((l) => l !== null)
    return lines.join('\n')
  }

  async function send() {
    if (!input.trim() || thinking) return
    const userMsg = { role: 'user', content: input.trim() }
    setChat((prev) => [...prev, userMsg])
    setInput('')
    setThinking(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          file_path: activePdf || null,
          query:     userMsg.content,
          history:   chat.slice(-20),
          context:   buildContext(),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { result, error } = await res.json()
      if (error) throw new Error(error)
      setChat((prev) => [...prev, { role: 'assistant', content: result || 'No response.' }])
    } catch (err) {
      setChat((prev) => [...prev, { role: 'assistant', content: `⚠️ Something went wrong — ${err.message}` }])
    } finally {
      setThinking(false)
    }
  }

  // Don't render if no docs have been uploaded yet
  if (allDocs.length === 0) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-96 shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white flex flex-col"
      style={{ maxHeight: minimized ? 'auto' : '540px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-navy-900 cursor-pointer select-none"
        onClick={() => { setMinimized((m) => !m); if (minimized) setTimeout(() => inputRef.current?.focus(), 150) }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white">Vendor Brain</span>
          <span className="text-xs text-gray-500">— ask about contracts</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setChat([])}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
          <button onClick={() => setMinimized((m) => !m)} className="p-1 text-gray-400 hover:text-white rounded transition-colors">
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="flex flex-col overflow-hidden" style={{ maxHeight: '496px' }}>
          {/* PDF selector (shown when multiple PDFs exist) */}
          {pdfs.length > 1 && (
            <div className="px-4 pt-3 pb-0">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <FileText size={11} />
                <span className="font-medium">Referencing:</span>
              </div>
              <select
                value={activePdf || ''}
                onChange={(e) => setActivePdf(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 text-navy-900"
              >
                {pdfs.map((d) => (
                  <option key={d.id} value={d.file_path}>{d.file_name}</option>
                ))}
              </select>
            </div>
          )}
          {pdfs.length === 1 && (
            <div className="px-4 pt-3 pb-0 flex items-center gap-1.5 text-xs text-gray-400">
              <FileText size={11} />
              <span className="truncate">{pdfs[0].file_name}</span>
            </div>
          )}

          {/* Chat */}
          <div className="flex flex-col flex-1 overflow-hidden px-4 pt-3 pb-4 gap-3">
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {chat.length === 0 && !thinking && (
                <p className="text-xs text-gray-400 text-center pt-4">
                  Ask anything about {vendor.name}'s contracts
                </p>
              )}
              {chat.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles size={11} className="text-primary-500" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-xs ${
                    msg.role === 'user'
                      ? 'bg-navy-900 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-navy-900 rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.role === 'assistant'
                      ? <ReactMarkdown components={mdComponents}>{msg.content}</ReactMarkdown>
                      : msg.content}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={11} className="text-primary-500" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 pt-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder={`Ask about ${vendor.name}'s contracts…`}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                disabled={thinking}
              />
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="p-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
