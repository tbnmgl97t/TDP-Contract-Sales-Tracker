import { clsx } from 'clsx'
import { forwardRef } from 'react'

const Input = forwardRef(function Input({ label, error, hint, className, prefix, suffix, ...props }, ref) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-navy-900">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-500 text-sm select-none">{prefix}</span>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full rounded-lg border text-sm text-navy-900 placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
            'disabled:bg-gray-50 disabled:text-gray-500',
            prefix ? 'pl-7 pr-3 py-2.5' : 'px-3 py-2.5',
            suffix ? 'pr-10' : '',
            error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-gray-500 text-sm select-none">{suffix}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
})

export default Input

export function Select({ label, error, hint, className, children, ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-navy-900">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        className={clsx(
          'w-full rounded-lg border text-sm text-navy-900',
          'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
          'disabled:bg-gray-50 disabled:text-gray-500 bg-white py-2.5 px-3',
          error ? 'border-red-400 bg-red-50' : 'border-gray-200'
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Textarea({ label, error, hint, className, ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-navy-900">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        className={clsx(
          'w-full rounded-lg border text-sm text-navy-900 placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent',
          'disabled:bg-gray-50 px-3 py-2.5 resize-none',
          error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
        )}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
