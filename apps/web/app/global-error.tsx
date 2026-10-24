'use client';

/** Last-resort boundary for failures in the root layout. Renders its own document. */
export default function GlobalError({
  retry,
}: {
  readonly error: Error;
  readonly retry: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          color: '#2b1236',
          background: '#fdf5f9',
        }}
      >
        <title>Something went wrong | Nivomi AI</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: '#5b6478' }}>Nivomi hit an unexpected problem. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: '12px 20px',
              borderRadius: 12,
              border: 0,
              background: '#be1a6e',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
