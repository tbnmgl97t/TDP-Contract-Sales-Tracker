import { useState } from 'react'
import { CheckCircle, Copy, ExternalLink } from 'lucide-react'
import Button from '../ui/Button'

export default function QuestionnaireSuccessView({ created, publicLink, expiresIn, onClose, onCopy }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicLink)
    } catch {
      const el = document.createElement('textarea')
      el.value = publicLink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.()
  }

  return (
    <div className="flex flex-col items-center text-center py-12 gap-6">
      <div className="w-14 h-14 rounded-full bg-primary-400/10 flex items-center justify-center">
        <CheckCircle size={32} className="text-primary-500" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-navy-900">Questionnaire Created</h3>
        <p className="text-sm text-gray-500 mt-1">{created.title}</p>
      </div>

      <div className="w-full">
        <p className="text-sm font-medium text-navy-900 mb-2 text-left">
          Share this link with your customer:
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 font-mono truncate select-all">
            {publicLink}
          </div>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-navy-900"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-left">
          The link expires in {expiresIn} {Number(expiresIn) === 1 ? 'day' : 'days'}.
        </p>
      </div>

      <div className="flex gap-3">
        <a
          href={publicLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-navy-900"
        >
          <ExternalLink size={14} />
          Open in new tab
        </a>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
