import { Component, type ErrorInfo, type ReactNode } from "react"

type State = { error: Error | null }

/** Shows a readable message instead of a blank page if something on screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Barterman crashed while rendering:", error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="app-crash" role="alert">
        <h1>Something went wrong</h1>
        <p>This page hit an error. Reloading usually fixes it.</p>
        <pre>{error.message}</pre>
        <div className="app-crash-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>Reload page</button>
          <button type="button" className="secondary" onClick={() => window.location.assign("/marketplace")}>Go to marketplace</button>
        </div>
      </main>
    )
  }
}
