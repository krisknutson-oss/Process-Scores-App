import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Ignore third-party extension errors
    if (error?.message && error.message.includes('ethereum')) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error?.message && error.message.includes('ethereum')) {
      return;
    }
    console.error('Uncaught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F5F0] text-[#18191B] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border-2 border-[#18191B] rounded-2xl p-6 bold-shadow space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#FBEBE7] border-2 border-[#D94826] text-[#D94826] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h2 className="font-serif-fraunces font-black text-xl text-[#18191B]">Something went wrong</h2>
            <p className="text-xs font-medium text-[#5C626A] font-mono-jb bg-[#F6F5F0] p-3 rounded-lg border border-[#18191B]/20 break-words text-left">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-[#18191B] hover:bg-[#1F6F6B] text-white font-black text-xs uppercase tracking-wider rounded-lg border-2 border-[#18191B] bold-shadow-sm flex items-center justify-center gap-2 cursor-pointer transition active:translate-x-0.5 active:translate-y-0.5"
            >
              <RotateCcw className="w-4 h-4 stroke-[2.5]" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

