import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'entrar' | 'cadastrar'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    const result = mode === 'entrar' ? await signIn(email, password) : await signUp(email, password);

    if (result.error) {
      setError(result.error);
    } else if (mode === 'cadastrar') {
      setInfo('Conta criada. Verifique seu e-mail para confirmar o cadastro, se necessário.');
    }
    setSubmitting(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="auth-logo" aria-hidden="true">
          C
        </span>
        <h1 className="auth-title">CRM Flow</h1>
        <p className="auth-subtitle">
          {mode === 'entrar' ? 'Entre na sua conta' : 'Crie sua conta'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="form-error">{error}</p>}
          {info && <p className="form-info">{info}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'entrar' ? 'cadastrar' : 'entrar');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'entrar' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
}
