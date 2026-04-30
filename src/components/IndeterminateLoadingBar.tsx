/**
 * Slim indeterminate progress strip (shared by SplashScreen and SceneView bootstrap overlay).
 */
export default function IndeterminateLoadingBar() {
  return (
    <>
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
            animation: 'indeterminateBarSlide 1.2s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes indeterminateBarSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(350%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </>
  )
}
