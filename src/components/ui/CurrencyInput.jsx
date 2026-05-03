import { clsx } from 'clsx'
import { forwardRef, useState } from 'react'

function formatWithCommas(val) {
  if (val === '' || val === null || val === undefined) return ''
  const parts = String(val).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

const CurrencyInput = forwardRef(function CurrencyInput(
  { label, error, hint, className, value, onChange, required, placeholder = '0', ...props },
  ref
) {
  const [focused, setFocused] = useState(false)

  function handleChange(e) {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    onChange(raw === '' ? '' : raw)
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const cleaned = pasted.replace(/[^0-9.]/g, '')
    onChange(cleaned)
  }

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-navy-900">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <span className="absolute left-3 text-gray-500 text-sm select-none">$</span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={focused ? value : formatWithCommas(value)}
          onChange={handleChange}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className={clsx(
            'w-full pl-7 pr-3 py-2.5 rounded-lg border text-sm text-navy-900 placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
            'disabled:bg-gray-50 disabled:text-gray-500',
            error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
})

export default CurrencyInput
