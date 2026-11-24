"use client"

import { Component, type ReactNode } from "react"

/** Keeps a model that fails to download from taking the whole stage down. */
class LoadBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError?.()
  }

  render() {
    return this.state.failed
      ? (this.props.fallback ?? null)
      : this.props.children
  }
}

export { LoadBoundary }
