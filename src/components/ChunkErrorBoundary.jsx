import { Component } from 'react'
import { RefreshCw } from 'lucide-react'

function isChunkError(err) {
  if (!err) return false
  const msg = err.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    err.name === 'ChunkLoadError'
  )
}

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasChunkError: false, otherError: null }
  }

  static getDerivedStateFromError(err) {
    if (isChunkError(err)) return { hasChunkError: true, otherError: null }
    return { hasChunkError: false, otherError: err }
  }

  componentDidCatch(err, info) {
    if (!isChunkError(err)) {
      console.error('Unhandled error:', err, info)
    }
  }

  render() {
    if (this.state.hasChunkError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
              <RefreshCw size={22} className="text-primary-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-navy-900">New version available</h2>
              <p className="text-sm text-gray-500 mt-1">
                SalesFlow was updated while you had it open. Refresh to load the latest version.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-navy-900 text-white text-sm font-medium rounded-xl px-4 py-2.5 hover:bg-navy-800 transition-colors"
            >
              Refresh now
            </button>
          </div>
        </div>
      )
    }

    if (this.state.otherError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
            <p className="text-sm font-medium text-red-600">Something went wrong</p>
            <p className="text-xs text-gray-400 font-mono break-all">{this.state.otherError.message}</p>
            <button
              onClick={() => this.setState({ otherError: null })}
              className="text-sm text-primary-500 hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
