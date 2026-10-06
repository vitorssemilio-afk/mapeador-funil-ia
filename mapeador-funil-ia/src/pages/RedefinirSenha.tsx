// Destino do link enviado por supabase.auth.resetPasswordForEmail
// (Login.tsx, modo "recuperar"). Fica fora do ProtectedRoute (rota pública
// em App.tsx) porque quem chega aqui ainda não tem uma sessão "normal" —
// o Supabase troca o token da URL por uma sessão de recuperação sozinho
// (detectSessionInUrl, ligado por padrão) e dispara o evento
// PASSWORD_RECOVERY; só então o formulário de nova senha aparece. Sem
// token válido na URL, nada acontece e a tela mostra "link inválido".
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

type Estado = 'verificando' | 'pronto' | 'invalido' | 'concluido';

const TEMPO_LIMITE_VERIFICACAO_MS = 4000;

export function RedefinirSenha() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ativo = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && ativo) setEstado('pronto');
    });

    // Cobre o caso de a troca de sessão já ter acontecido antes deste efeito
    // montar (o evento PASSWORD_RECOVERY só dispara uma vez, na troca).
    supabase.auth.getSession().then(({ data }) => {
      if (ativo && data.session) setEstado((atual) => (atual === 'verificando' ? 'pronto' : atual));
    });

    const limite = setTimeout(() => {
      if (ativo) setEstado((atual) => (atual === 'verificando' ? 'invalido' : atual));
    }, TEMPO_LIMITE_VERIFICACAO_MS);

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
      clearTimeout(limite);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (novaSenha.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError('Senhas não conferem.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });
    setSubmitting(false);

    if (updateError) {
      setError('Não foi possível alterar a senha. Tente novamente.');
      return;
    }

    setEstado('concluido');
    setTimeout(() => navigate('/', { replace: true }), 2000);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/favicon.svg" alt="" className="auth-logo" />
        <h1 className="auth-title">Redefinir senha</h1>

        {estado === 'verificando' && <p className="page-loading">Verificando o link…</p>}

        {estado === 'invalido' && (
          <>
            <p className="form-error">
              Este link de recuperação é inválido ou já expirou. Solicite um novo na tela de login.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/login', { replace: true })}>
              Voltar para o login
            </button>
          </>
        )}

        {estado === 'concluido' && <p className="form-info">Senha alterada com sucesso. Redirecionando…</p>}

        {estado === 'pronto' && (
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="field">
              <span>Nova senha</span>
              <input
                type="password"
                required
                minLength={6}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </label>

            <label className="field">
              <span>Confirmar nova senha</span>
              <input
                type="password"
                required
                minLength={6}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Aguarde…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
