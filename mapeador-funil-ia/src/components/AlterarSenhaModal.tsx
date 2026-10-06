// "Alterar senha" do menu do usuário. O Supabase Auth não expõe uma
// verificação direta de "a senha atual está certa?" — a abordagem segura
// recomendada pelo próprio provedor é reautenticar com
// signInWithPassword antes de chamar updateUser (nunca comparamos senha
// manualmente, nunca existe tabela própria de senha). Se a senha atual
// estiver errada, signInWithPassword falha e a troca nem chega a ser
// tentada.
import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

const TAMANHO_MINIMO_SENHA = 6;

type Props = {
  onFechar: () => void;
};

export function AlterarSenhaModal({ onFechar }: Props) {
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user?.email) {
      setError('Não foi possível identificar seu e-mail. Recarregue a página e tente de novo.');
      return;
    }
    if (novaSenha.length < TAMANHO_MINIMO_SENHA) {
      setError(`A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError('Senhas não conferem.');
      return;
    }

    setSalvando(true);

    // Reautentica como o próprio usuário — é a forma recomendada pelo
    // Supabase de confirmar a senha atual antes de uma troca (não existe
    // endpoint separado só pra "verificar senha"). Em caso de sucesso, a
    // sessão atual continua válida normalmente (seção 8 do pedido).
    const { error: reautenticacaoError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: senhaAtual,
    });

    if (reautenticacaoError) {
      setSalvando(false);
      setError('Senha atual incorreta.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvando(false);

    if (updateError) {
      setError('Não foi possível alterar a senha. Tente novamente.');
      return;
    }

    setSucesso(true);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Alterar senha">
      <div className="card modal-card">
        <h2>Alterar senha</h2>

        {sucesso ? (
          <>
            <p className="form-info">Senha alterada com sucesso.</p>
            <div className="wizard-actions">
              <button type="button" className="btn btn-primary" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="field">
              <span>Senha atual</span>
              <input
                type="password"
                required
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            <label className="field">
              <span>Nova senha</span>
              <input
                type="password"
                required
                minLength={TAMANHO_MINIMO_SENHA}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label className="field">
              <span>Confirmar nova senha</span>
              <input
                type="password"
                required
                minLength={TAMANHO_MINIMO_SENHA}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="wizard-actions">
              <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Alterar senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
