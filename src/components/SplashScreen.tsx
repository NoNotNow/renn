/**
 * Full-viewport splash shown while the initial world is loading.
 * Matches app dark theme; shows title and an indeterminate loading bar.
 */
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
      <div
        style={{
          width: 240,
          height: 4,
          background: '#2f3545',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '40%',
            background: '#8ab4ff',
            borderRadius: 2,
            animation: 'splashProgress 1.2s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes splashProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(350%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
