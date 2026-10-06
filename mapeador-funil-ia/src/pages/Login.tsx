import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function Login() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'entrar' | 'cadastrar' | 'recuperar'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nomeProduto, setNomeProduto] = useState('CRM Flow');

  useEffect(() => {
    supabase.rpc('public_get_branding').then(({ data }) => {
      const branding = data?.[0];
      if (branding?.nome_produto) setNomeProduto(branding.nome_produto);
    });
  }, []);

  if (user) return <Navigate to="/" replace />;

  function trocarModo(novoModo: typeof mode) {
    setMode(novoModo);
    setError(null);
    setInfo(null);
    setPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'cadastrar' && !email.trim().toLowerCase().endsWith('@v4company.com')) {
      setError('O cadastro é permitido apenas para e-mails do domínio @v4company.com.');
      return;
    }

    setSubmitting(true);

    if (mode === 'recuperar') {
      // Nunca confirma se o e-mail existe ou não (seção 6/7 do pedido) —
      // a mensagem é sempre a mesma, com sucesso ou erro de rede/validação
      // do próprio Supabase à parte (esses sim são mostrados, pois não
      // revelam nada sobre a existência da conta).
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      setSubmitting(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setInfo('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
      return;
    }

    const result = mode === 'entrar' ? await signIn(email, password) : await signUp(email, password);

    if (result.error) {
      setError(result.error);
    } else if (mode === 'cadastrar') {
      setInfo('Conta criada. Verifique seu e-mail para confirmar o cadastro, se necessário.');
    }
    setSubmitting(false);
  }

  const titulo =
    mode === 'entrar' ? 'Entre na sua conta' : mode === 'cadastrar' ? 'Crie sua conta' : 'Recuperar senha';

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/favicon.svg" alt="" className="auth-logo" />
        <h1 className="auth-title">{nomeProduto}</h1>
        <p className="auth-subtitle">{titulo}</p>

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

          {mode !== 'recuperar' && (
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
          )}

          {error && <p className="form-error">{error}</p>}
          {info && <p className="form-info">{info}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting
              ? 'Aguarde…'
              : mode === 'entrar'
                ? 'Entrar'
                : mode === 'cadastrar'
                  ? 'Cadastrar'
                  : 'Enviar link de recuperação'}
          </button>
        </form>

        {mode === 'entrar' && (
          <button type="button" className="link-button" onClick={() => trocarModo('recuperar')}>
            Esqueci minha senha
          </button>
        )}

        <button
          type="button"
          className="link-button"
          onClick={() => trocarModo(mode === 'cadastrar' ? 'entrar' : mode === 'recuperar' ? 'entrar' : 'cadastrar')}
        >
          {mode === 'entrar' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
}
