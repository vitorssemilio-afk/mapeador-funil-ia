// Menu do usuário no canto superior direito — identidade de quem está
// logado (avatar + primeiro nome no header, seção 11/12) e ações de
// conta (seção 14): hoje só avatar/nome/e-mail/papel + Alterar/Remover
// foto + Sair, porque não existe página de perfil completa ainda (não
// criamos uma só por isso).
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { buscarMeuConsultor, PAPEL_LABELS, primeiroNome } from '../lib/consultores';
import { supabase } from '../lib/supabaseClient';
import type { PapelConsultor } from '../types/database';
import { AlterarSenhaModal } from './AlterarSenhaModal';
import { Avatar } from './Avatar';
import { IconChevronDown } from './icons';

const BUCKET_AVATARS = 'avatars';
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEITOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState(false);
  const [mostrarModalSenha, setMostrarModalSenha] = useState(false);
  const [consultorId, setConsultorId] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [role, setRole] = useState<PapelConsultor | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    buscarMeuConsultor(user.id).then((consultor) => {
      if (!consultor) return;
      setConsultorId(consultor.id);
      setNome(consultor.nome);
      setRole(consultor.role);
      setAvatarUrl(consultor.avatar_url);
    });
  }, [user]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  const nomeExibicao = nome ?? user?.email?.split('@')[0] ?? 'Usuário';

  async function handleSelecionarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo || !user || !consultorId) return;

    const extensao = TIPOS_ACEITOS[arquivo.type];
    if (!extensao) {
      mostrarToast('Use uma imagem JPG, PNG ou WEBP.', 'error');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      mostrarToast('A imagem precisa ter até 5 MB.', 'error');
      return;
    }

    setEnviando(true);
    const caminho = `${user.id}/profile.${extensao}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_AVATARS)
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

    if (uploadError) {
      setEnviando(false);
      mostrarToast('Não foi possível enviar a foto. Tente de novo.', 'error');
      return;
    }

    // Cache-bust: o caminho é sempre o mesmo (upsert), então sem isso o
    // navegador continuaria mostrando a foto antiga em cache mesmo após
    // o upload (seção 20 — tem que atualizar na hora, sem logout/login).
    const { data } = supabase.storage.from(BUCKET_AVATARS).getPublicUrl(caminho);
    const novaUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('consultores')
      .update({ avatar_url: novaUrl })
      .eq('id', consultorId);

    setEnviando(false);

    if (updateError) {
      mostrarToast('A foto foi enviada, mas não foi possível salvar no seu perfil.', 'error');
      return;
    }

    setAvatarUrl(novaUrl);
    mostrarToast('Foto atualizada.');
  }

  async function handleRemoverFoto() {
    if (!user || !consultorId) return;
    const confirmado = await confirmar({
      titulo: 'Remover sua foto de perfil?',
      descricao: 'Você pode adicionar outra depois, quando quiser.',
      confirmarLabel: 'Remover',
      destrutivo: true,
    });
    if (!confirmado) return;

    setEnviando(true);
    await supabase.storage
      .from(BUCKET_AVATARS)
      .remove(['jpg', 'png', 'webp'].map((ext) => `${user.id}/profile.${ext}`));

    const { error: updateError } = await supabase
      .from('consultores')
      .update({ avatar_url: null })
      .eq('id', consultorId);

    setEnviando(false);

    if (updateError) {
      mostrarToast('Não foi possível remover a foto. Tente de novo.', 'error');
      return;
    }

    setAvatarUrl(null);
    mostrarToast('Foto removida.');
  }

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Menu de ${nomeExibicao}`}
      >
        <Avatar nome={nomeExibicao} avatarUrl={avatarUrl} size={28} />
        <span className="user-menu-nome">{primeiroNome(nomeExibicao)}</span>
        <IconChevronDown className="user-menu-chevron" />
      </button>

      {aberto && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-panel-identidade">
            <Avatar nome={nomeExibicao} avatarUrl={avatarUrl} size={44} />
            <div className="user-menu-panel-identidade-texto">
              <span className="user-menu-panel-nome">{nomeExibicao}</span>
              <span className="user-menu-panel-email">{user?.email}</span>
              {role && <span className="user-menu-panel-papel">{PAPEL_LABELS[role]}</span>}
            </div>
          </div>

          {consultorId && (
            <div className="user-menu-panel-foto-acoes">
              <button
                type="button"
                className="user-menu-panel-item"
                role="menuitem"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
              >
                {enviando ? 'Enviando…' : 'Alterar foto'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="user-menu-panel-item"
                  role="menuitem"
                  onClick={handleRemoverFoto}
                  disabled={enviando}
                >
                  Remover foto
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleSelecionarArquivo}
                style={{ display: 'none' }}
              />
            </div>
          )}

          <div className="user-menu-panel-foto-acoes">
            <button
              type="button"
              className="user-menu-panel-item"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                setMostrarModalSenha(true);
              }}
            >
              Alterar senha
            </button>
          </div>

          <button
            type="button"
            className="user-menu-panel-item user-menu-panel-item-sair"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              signOut();
            }}
          >
            Sair
          </button>
        </div>
      )}

      {mostrarModalSenha && <AlterarSenhaModal onFechar={() => setMostrarModalSenha(false)} />}
    </div>
  );
}
