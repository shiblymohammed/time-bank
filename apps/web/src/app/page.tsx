/**
 * Root page — placeholder for Milestone 1.
 *
 * Authentication and role-based routing are implemented in Milestone 2.
 * This page simply confirms the Next.js app is running.
 */
export default function RootPage(): React.JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a',
        background: '#f5f5f5',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Kottakkal Time Bank</h1>
      <p style={{ color: '#666', marginTop: '0.5rem' }}>
        Web dashboard — Milestone 1 foundation running ✓
      </p>
      <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '1rem' }}>
        Login and role-aware routing coming in Milestone 2.
      </p>
    </main>
  );
}
