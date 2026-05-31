import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  private copyTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, copied: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false }
  }

  componentWillUnmount() {
    if (this.copyTimeout) clearTimeout(this.copyTimeout)
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state
    const message = error?.message || 'An unexpected error occurred'
    const stack = error?.stack || ''
    const componentStack = errorInfo?.componentStack || ''

    const fullError = [
      stack || message,
      componentStack ? `\nComponent Stack:${componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    void navigator.clipboard.writeText(fullError.trim())
    this.setState({ copied: true })
    if (this.copyTimeout) clearTimeout(this.copyTimeout)
    this.copyTimeout = setTimeout(() => this.setState({ copied: false }), 2000)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '24px',
            background: '#171a22',
            color: '#e6e9f2',
          }}
        >
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <p style={{ marginBottom: '16px', textAlign: 'center', maxWidth: '600px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                background: '#8ab4ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={this.handleCopy}
              style={{
                padding: '8px 16px',
                background: '#2f3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                minWidth: '100px',
              }}
            >
              {this.state.copied ? 'Copied!' : 'Copy Error'}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
