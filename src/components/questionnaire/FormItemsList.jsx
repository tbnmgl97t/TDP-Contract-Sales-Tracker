import { ChevronUp, ChevronDown, X } from 'lucide-react'
import TypeBadge from './TypeBadge'

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

export default function FormItemsList({ formItems, onMove, onRemove, onToggleType }) {
  const qCount = formItems.filter((i) => i.question_type !== 'section' && i.question_type !== 'subsection').length
  const sCount = formItems.filter((i) => i.question_type === 'section' || i.question_type === 'subsection').length
  const parts = []
  if (qCount) parts.push(`${qCount} question${qCount !== 1 ? 's' : ''}`)
  if (sCount) parts.push(`${sCount} header${sCount !== 1 ? 's' : ''}`)

  return (
    <section>
      <SectionLabel>Form layout {parts.length ? `— ${parts.join(', ')}` : ''}</SectionLabel>

      {formItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">
            No questions added yet. Add from a set or the library above.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
          {formItems.map((item, idx) => {
            const isSection = item.question_type === 'section'
            const isSubsection = item.question_type === 'subsection'
            const isHeader = isSection || isSubsection

            return (
              <div
                key={item._key}
                className={`flex items-start gap-3 px-4 py-3 ${isHeader ? 'bg-gray-50/60' : ''}`}
              >
                {isHeader ? (
                  <span className={`text-xs mt-1 flex-shrink-0 w-5 text-right font-bold ${isSection ? 'text-primary-500' : 'text-gray-400'}`}>
                    {isSection ? '§' : '—'}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 mt-1 flex-shrink-0 w-5 text-right font-medium">
                    {idx + 1}.
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isSection ? 'font-bold text-navy-900' : isSubsection ? 'font-semibold text-gray-700' : 'text-gray-800'}`}>
                    {item.question_text}
                  </p>
                  {!isHeader && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <TypeBadge type={item.question_type} />
                      {item.source_set_id && (
                        <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded font-medium">
                          Set: {item.source_set_name}
                        </span>
                      )}
                      {item.question_help_text && (
                        <span className="text-xs text-gray-400 italic truncate max-w-xs">
                          {item.question_help_text}
                        </span>
                      )}
                    </div>
                  )}
                  {isHeader && <TypeBadge type={item.question_type} />}
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {!isHeader && (
                    <button
                      onClick={() => onToggleType(idx)}
                      className="text-xs px-1.5 py-0.5 rounded border mr-1 transition-colors font-medium"
                      style={item.question_type === 'long'
                        ? { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }
                        : { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }}
                      title="Toggle short / long answer"
                    >
                      {item.question_type === 'long' ? 'Long' : 'Short'}
                    </button>
                  )}
                  <button
                    onClick={() => onMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => onMove(idx, 1)}
                    disabled={idx === formItems.length - 1}
                    className="p-1 text-gray-400 hover:text-navy-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    onClick={() => onRemove(idx)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors ml-1"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
