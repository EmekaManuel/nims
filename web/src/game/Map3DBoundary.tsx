import { Component, type ReactNode } from 'react';

/**
 * Holds the 3D town. If it cannot load or start (no WebGL after all, a failed download, a graphics error), the player gets the 2D map
 * instead of a broken screen.
 */
export class Map3DBoundary extends Component<{ fallback: ReactNode; onFail?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
