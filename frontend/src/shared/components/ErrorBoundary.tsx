import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ErrorState'

/**
 * Граница ошибок вокруг части экрана (доска): сбой внутри показывает ErrorState на её месте,
 * остальная страница продолжает работать. Ошибка — в консоль.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    return this.state.failed ? <ErrorState /> : this.props.children
  }
}
