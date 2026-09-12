import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-red-400">error</span>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Unexpected Error</p>
          <h2 className="text-xl font-black text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-400 max-w-sm">
            {this.state.error?.message || 'An unexpected error occurred in this section.'}
          </p>
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="px-5 py-2.5 bg-surface text-slate-900 text-xs font-black uppercase tracking-widest rounded-lg hover:brightness-90 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
