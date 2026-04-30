/**
 * Full-viewport splash shown while the initial world is loading.
 * Matches app dark theme; shows title and an indeterminate loading bar.
 */
import IndeterminateLoadingBar from '@/components/IndeterminateLoadingBar'

export default function SplashScreen() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: '#171a22',
        color: '#e6e9f2',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Renn</h1>
      <IndeterminateLoadingBar />
    </div>
  )
}
