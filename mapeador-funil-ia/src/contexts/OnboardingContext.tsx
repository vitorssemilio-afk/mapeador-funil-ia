// Onboarding de primeiro acesso — abre sozinho na primeira vez que o
// usuário loga (onboarding_concluido_em e onboarding_pulado ainda nulos/
// falsos), nunca mais depois disso. "Continuar"/"Refazer" ficam disponíveis
// a qualquer momento pelo menu do usuário (ver UserMenu.tsx). Progresso é
// por consultor — nunca compartilhado entre usuários (migration 0088).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';
import { buscarMeuConsultor } from '../lib/consultores';
import { deveAbrirOnboardingAutomaticamente, ITENS_PRIMEIROS_PASSOS, PASSOS_ONBOARDING } from '../lib/onboarding';
import { useToast } from './ToastContext';
import type { Consultor } from '../types/database';

type OnboardingContextValue = {
  // null enquanto carrega — o menu do usuário usa isso pra decidir se
  // mostra "Continuar" (em andamento, nunca concluído nem pulado) ou
  // "Conhecer o CRM Flow"/"Refazer onboarding" (já concluído/pulado).
  consultor: Consultor | null;
  continuarOnboarding: () => void;
  refazerOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [consultor, setConsultor] = useState<Consultor | null>(null);
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [jaOfereceu, setJaOfereceu] = useState(false);
  // Fila de persistência — cada chamada só começa depois da anterior
  // terminar, pra "Próximo, Próximo, Próximo" rápido não disparar
  // requisições concorrentes cuja resposta mais antiga poderia chegar
  // depois e sobrescrever um passo mais novo (seção 24 do pedido).
  const filaPersistenciaRef = useRef<Promise<void>>(Promise.resolve());
  // Evita toast duplicado a cada passo enquanto o erro persiste — avisa
  // uma vez, só avisa de novo se voltar a falhar depois de um salvamento
  // ter funcionado (seção 10/26).
  const erroJaAvisadoRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    buscarMeuConsultor(user.id).then((c) => setConsultor(c));
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
  }, [user]);

  // Oferece automaticamente só uma vez por sessão/carregamento — sem isso,
  // navegar entre páginas reabriria o modal a cada remontagem do Layout
  // pra quem pulou momentos atrás.
  useEffect(() => {
    if (!consultor || jaOfereceu) return;
    setJaOfereceu(true);
    if (deveAbrirOnboardingAutomaticamente(consultor)) {
      setEtapa(consultor.onboarding_etapa ?? 0);
      setAberto(true);
      if (!consultor.onboarding_iniciado_em) {
        atualizarConsultor({ onboarding_iniciado_em: new Date().toISOString() });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultor, jaOfereceu]);

  // Uma tentativa + 1 retry (sem loop infinito) antes de desistir e avisar
  // (seção 11). `consultorId` é fixado no momento da chamada — nunca o
  // `id` de um consultor diferente que tenha vindo a existir nesse
  // meio-tempo.
  async function persistirComRetry(consultorId: string, patch: Partial<Consultor>) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data, error } = await supabase
        .from('consultores')
        .update(patch)
        .eq('id', consultorId)
        .select()
        .single();
      if (!error) {
        erroJaAvisadoRef.current = false;
        if (data) setConsultor(data);
        return;
      }
      if (tentativa === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      // Se isso falhar silenciosamente, o estado de conclusão/pulado não
      // persiste e o onboarding volta a abrir sozinho no próximo reload —
      // por isso avisa (uma vez só, mesmo em sequência de falhas) em vez
      // de só fechar o modal como se tivesse salvo.
      console.error('Falha ao salvar progresso do onboarding:', error);
      if (!erroJaAvisadoRef.current) {
        erroJaAvisadoRef.current = true;
        mostrarToast('Não conseguimos salvar seu progresso agora. Tentaremos de novo no próximo passo.', 'error');
      }
    }
  }

  function atualizarConsultor(patch: Partial<Consultor>) {
    if (!consultor) return Promise.resolve();
    const consultorId = consultor.id;
    const proxima = filaPersistenciaRef.current.then(() => persistirComRetry(consultorId, patch));
    // A fila sempre segue adiante, mesmo se essa chamada tiver falhado —
    // senão uma falha isolada travaria toda chamada futura.
    filaPersistenciaRef.current = proxima.catch(() => {});
    return proxima;
  }

  const continuarOnboarding = useCallback(() => {
    setEtapa(consultor?.onboarding_etapa ?? 0);
    setAberto(true);
  }, [consultor]);

  // Reabre a experiência manualmente (menu "Refazer onboarding") SEM
  // zerar onboarding_concluido_em/onboarding_pulado — esses dois campos
  // são a única coisa que decide se o onboarding reabre sozinho. Zerá-los
  // aqui e o usuário fechar a aba antes de terminar o refazer faria o
  // onboarding voltar a abrir automaticamente em todo F5 dali em diante,
  // mesmo já tendo concluído antes. `handleConcluir` sobrescreve
  // onboarding_concluido_em normalmente quando o refazer é finalizado.
  const refazerOnboarding = useCallback(() => {
    setEtapa(0);
    setAberto(true);
  }, []);

  function irPara(novaEtapaAlvo: number) {
    const novaEtapa = Math.max(0, Math.min(novaEtapaAlvo, totalEtapas - 1));
    setEtapa(novaEtapa);
    atualizarConsultor({ onboarding_etapa: novaEtapa });
  }

  function handlePular() {
    setAberto(false);
    atualizarConsultor({ onboarding_pulado: true, onboarding_etapa: etapa });
  }

  function handleConcluir() {
    setAberto(false);
    atualizarConsultor({ onboarding_concluido_em: new Date().toISOString() });
  }

  function handleAlternarPasso(chave: string) {
    if (!consultor) return;
    const atual = consultor.primeiros_passos_concluidos ?? [];
    const novo = atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave];
    atualizarConsultor({ primeiros_passos_concluidos: novo });
  }

  const totalEtapas = PASSOS_ONBOARDING.length + 1; // +1 = tela de "Primeiros passos"

  return (
    <OnboardingContext.Provider value={{ consultor, continuarOnboarding, refazerOnboarding }}>
      {children}

      {aberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Onboarding do CRM Flow">
          <div className="card modal-card onboarding-modal">
            {etapa < PASSOS_ONBOARDING.length ? (
              <>
                <h2>{PASSOS_ONBOARDING[etapa].titulo}</h2>
                <p>{PASSOS_ONBOARDING[etapa].texto}</p>
              </>
            ) : (
              <>
                <h2>Primeiros passos</h2>
                <p className="field-hint">
                  Opcional — marque o que já explorou. Nada aqui exige criar ou alterar dados reais.
                </p>
                <ul className="onboarding-checklist">
                  {ITENS_PRIMEIROS_PASSOS.filter((item) => !item.somenteAdministrador || souAdministrador).map(
                    (item) => (
                      <li key={item.chave}>
                        <label className="option-checkbox">
                          <input
                            type="checkbox"
                            checked={(consultor?.primeiros_passos_concluidos ?? []).includes(item.chave)}
                            onChange={() => handleAlternarPasso(item.chave)}
                          />
                          <span>{item.label}</span>
                        </label>
                        <a href={item.to} className="btn-link" target="_blank" rel="noopener noreferrer">
                          Abrir
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </>
            )}

            <div className="onboarding-progresso" aria-hidden="true">
              {Array.from({ length: totalEtapas }).map((_, i) => (
                <span key={i} className={`onboarding-ponto${i === etapa ? ' onboarding-ponto-atual' : ''}`} />
              ))}
            </div>

            <div className="wizard-actions">
              <button type="button" className="btn btn-ghost" onClick={handlePular}>
                Pular por enquanto
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                {etapa > 0 && (
                  <button type="button" className="btn btn-secondary" onClick={() => irPara(etapa - 1)}>
                    Voltar
                  </button>
                )}
                {etapa < totalEtapas - 1 ? (
                  <button type="button" className="btn btn-primary" onClick={() => irPara(etapa + 1)}>
                    Próximo
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleConcluir}>
                    Concluir
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding precisa estar dentro de OnboardingProvider');
  return ctx;
}
