export function AuthScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="auth-screen">
      <div className="auth-container">
        <h1>Family Hub</h1>
        <p>Games and utilities for the whole family</p>
        <button onClick={onSignIn} className="btn btn-primary">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
