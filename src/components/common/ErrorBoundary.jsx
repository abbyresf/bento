import { Component } from 'react';
import ServiceDown from './ServiceDown';

/* Catches render-time crashes so one broken component cannot blank the app.
 *
 * Without this, any uncaught error in the tree unmounts everything and leaves a
 * white screen with nothing to act on. A student reads that as "the app is
 * broken", not "something is temporarily wrong", and there is no way back
 * except deleting and reinstalling.
 *
 * Class component because React still has no hook equivalent for this. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    // Kept in the console rather than swallowed, so a crash is still
    // diagnosable from a student's device if they send a screenshot.
    console.error('Bento crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return <ServiceDown onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
