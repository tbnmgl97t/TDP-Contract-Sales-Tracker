import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Sparkles, Send, Loader, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import ReactMarkdown from 'react-markdown'

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const text = String(children).replace(/\n$/, '')
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      <div className="bg-gray-900 px-3 pt-3 pb-3 font-mono text-[11px] leading-relaxed text-gray-100 overflow-x-auto whitespace-pre">
        {text}
      </div>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1 rounded bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  )
}

const mdComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-navy-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="text-sm font-bold text-navy-900 mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xs font-bold text-navy-900 mt-3 mb-1 first:mt-0 uppercase tracking-wide">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-navy-900 mt-2 mb-0.5 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary-300 pl-3 my-2 text-gray-500 italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-gray-200 my-3" />,
  code: ({ node, inline, children, ...props }) =>
    inline
      ? <code className="bg-gray-100 text-pink-600 rounded px-1 py-0.5 font-mono text-[10px]" {...props}>{children}</code>
      : <CodeBlock>{children}</CodeBlock>,
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-[11px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-semibold text-left text-navy-900">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 text-gray-700">{children}</td>,
}

const DealBrainPanel = forwardRef(function DealBrainPanel(
  { dealId, contracts, buildDealContext, currentUserId, aiExtracting, setAiExtracting, aiContract, setAiContract },
  ref
) {
  const [aiExtracted, setAiExtracted] = useState(null)
  const [aiChat, setAiChat] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  const [aiMinimized, setAiMinimized] = useState(true)
  const chatEndRef = useRef(null)

  // Load chat history on mount / deal change
  useEffect(() => {
    if (!currentUserId || !dealId) return
    async function loadHistory() {
      const { data } = await supabase
        .from('deal_brain_messages')
        .select('role, content')
        .eq('deal_id', dealId)
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data?.length) setAiChat(data.reverse())
    }
    loadHistory()
  }, [dealId, currentUserId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiChat])

  async function openPanel(contract, forceRefresh = false) {
    setAiContract(contract)
    setAiMinimized(false)

    if (contract.ai_analysis && !forceRefresh) {
      setAiExtracted(contract.ai_analysis)
      return
    }

    setAiExtracted(null)
    setAiExtracting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ file_path: contract.file_path, context: buildDealContext() }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { result, error } = await res.json()
      if (error) throw new Error(error)
      let parsed
      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { summary: result }
      }
      setAiExtracted(parsed)
      // Persist to contracts table and update parent contracts state
      await supabase.from('contracts').update({ ai_analysis: parsed }).eq('id', contract.id)
    } catch (err) {
      setAiExtracted({ error: err.message || 'Analysis failed. Please try again.' })
    } finally {
      setAiExtracting(false)
    }
  }

  useImperativeHandle(ref, () => ({
    openPanel,
    openChat() { setAiMinimized(false) },
  }))

  async function sendAiMessage() {
    if (!aiInput.trim() || aiThinking) return
    const userMsg = { role: 'user', content: aiInput.trim() }
    setAiChat((prev) => [...prev, userMsg])
    setAiInput('')
    setAiThinking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          file_path: contracts.find((c) => c.mime_type === 'application/pdf')?.file_path,
          query: userMsg.content,
          history: aiChat.slice(-20),
          context: buildDealContext(),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { result, error } = await res.json()
      if (error) throw new Error(error)
      const assistantMsg = { role: 'assistant', content: result || 'No response.' }
      setAiChat((prev) => [...prev, assistantMsg])
      if (currentUserId) {
        await supabase.from('deal_brain_messages').insert([
          { deal_id: dealId, user_id: currentUserId, role: 'user', content: userMsg.content },
          { deal_id: dealId, user_id: currentUserId, role: 'assistant', content: assistantMsg.content },
        ])
      }
    } catch (err) {
      setAiChat((prev) => [...prev, { role: 'assistant', content: `⚠️ Something went wrong — ${err.message}. Please try again.` }])
    } finally {
      setAiThinking(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white flex flex-col" style={{ maxHeight: aiMinimized ? 'auto' : '520px' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-navy-900 cursor-pointer select-none"
        onClick={() => setAiMinimized((m) => !m)}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white">Deal Brain</span>
          <span className="text-xs text-gray-500">— ask me anything</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={async () => {
              setAiChat([])
              if (currentUserId) {
                await supabase.from('deal_brain_messages')
                  .delete()
                  .eq('deal_id', dealId)
                  .eq('user_id', currentUserId)
              }
            }}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
          <button onClick={() => setAiMinimized((m) => !m)} className="p-1 text-gray-400 hover:text-white rounded transition-colors">
            {aiMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {!aiMinimized && (
        <div className="flex flex-col overflow-hidden" style={{ maxHeight: '476px' }}>
          <div className="flex flex-col flex-1 overflow-hidden px-4 pt-3 pb-4 gap-3">
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {aiExtracting && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="relative">
                    <Sparkles size={26} className="text-primary-300" />
                    <Loader size={13} className="animate-spin text-primary-500 absolute -bottom-1 -right-1" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-navy-900">Analyzing contract…</p>
                    <p className="text-xs text-gray-400 mt-0.5">Claude is reading and extracting key terms</p>
                  </div>
                </div>
              )}
              {aiChat.length === 0 && !aiExtracting && (
                <p className="text-xs text-gray-400 text-center pt-4">Ask anything about this deal</p>
              )}
              {aiChat.map((msg, i) => (
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
              {aiThinking && (
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
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()}
                placeholder="Ask anything about this deal…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                disabled={aiExtracting || aiThinking}
              />
              <button
                onClick={sendAiMessage}
                disabled={!aiInput.trim() || aiThinking || aiExtracting}
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
})

export default DealBrainPanel
