import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GanttRuler } from '../components/GanttRuler';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { gerarItensDerivados } from '../lib/checklistDerivado';
import { PX_POR_DIA, calcularEscala, diaParaPx, fasesImplementacao, itensCronograma } from '../lib/cronograma';
import { supabase } from '../lib/supabaseClient';
import type {
  CheckpointAdocao,
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  CredencialApiKommoMeta,
  CredencialCrmListada,
  FrequenciaUsoCheckpoint,
  FunilGerado,
  FunilKommoCriacao,
  ImplementacaoCrm,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
  IntencaoManutencaoCheckpoint,
  UsoDiarioCheckpoint,
} from '../types/database';

type Aba = 'geral' | 'checklist' | 'cronograma' | 'credenciais' | 'checkpoint';

const USO_DIARIO_LABELS: Record<UsoDiarioCheckpoint, string> = {
  so_kommo: 'Só Kommo',
  kommo_mais_planilha: 'Kommo + planilha ainda',
  voltou_planilha: 'Voltaram pra planilha',
};

const FREQUENCIA_USO_LABELS: Record<FrequenciaUsoCheckpoint, string> = {
  diariamente: 'Diariamente',
  semanalmente: 'Semanalmente',
  raramente: 'Raramente',
  nao_uso: 'Não uso',
};

const INTENCAO_MANUTENCAO_LABELS: Record<IntencaoManutencaoCheckpoint, string> = {
  sim: 'Sim',
  talvez: 'Talvez',
  nao: 'Não',
};

type FormGeral = {
  nome_cliente: string;
  consultor_responsavel: string;
  stakeholder_decisor: string;
  status: ImplementacaoStatus;
  conta_criada_via_v4: boolean;
  email_conta_kommo: string;
  whatsapp_corporativo_confirmado: boolean;
  acesso_facebook_confirmado: boolean;
  plano_contratado: string;
  periodo_contratado: string;
  data_decisao_plano: string;
  observacoes: string;
};

type FormCredencial = {
  id: string | null;
  login: string;
  senha: string;
  observacoes: string;
};

const FORM_CREDENCIAL_VAZIO: FormCredencial = { id: null, login: '', senha: '', observacoes: '' };

type FormCredencialKommo = {
  subdominio: string;
  token: string;
};

const STATUS_BLOQUEADOS_SEM_PRE_REQUISITO = new Set<ImplementacaoStatus>([
  'semana_1',
  'semana_2',
  'semana_3',
  'semana_4',
  'concluida',
]);

// Pra que grupo de checklist completo sugere avançar o status — e pra qual
// próximo status. "criterios_sucesso" não é um status em si, então também
// aponta pra "concluida" junto com o grupo "semana_4".
const PROXIMO_STATUS: Partial<Record<ImplementacaoStatus, ImplementacaoStatus>> = {
  pre_requisito: 'semana_1',
  semana_1: 'semana_2',
  semana_2: 'semana_3',
  semana_3: 'semana_4',
  semana_4: 'concluida',
};

function grupoSugereAvancoStatus(chave: string, statusAtual: ImplementacaoStatus): boolean {
  // Semana 1 é dividida em duas sessões (grupos) — só a segunda sugere
  // avançar de status, e só depois de checar que a primeira também está
  // completa (ver uso de `completoSemana1Sessao1` no render do checklist).
  if (chave === 'semana_1_sessao1') return false;
  const chaveEfetiva = chave === 'semana_1_sessao2' ? 'semana_1' : chave;
  return chaveEfetiva === statusAtual || (chaveEfetiva === 'criterios_sucesso' && statusAtual === 'semana_4');
}

// Ordem das fases, pra saber se um grupo de checklist já pode ser
// preenchido ou se ainda está à frente do status atual da implementação.
const ORDEM_STATUS: Record<ImplementacaoStatus, number> = {
  pre_requisito: 0,
  semana_1: 1,
  semana_2: 2,
  semana_3: 3,
  semana_4: 4,
  concluida: 5,
  cancelada: 99,
};

// "criterios_sucesso" não é uma fase em si — libera junto com "semana_4".
const GRUPO_STATUS_REQUERIDO: Partial<Record<string, ImplementacaoStatus>> = {
  pre_requisito: 'pre_requisito',
  semana_1_sessao1: 'semana_1',
  semana_1_sessao2: 'semana_1',
  semana_2: 'semana_2',
  semana_3: 'semana_3',
  semana_4: 'semana_4',
  criterios_sucesso: 'semana_4',
};

function grupoBloqueado(chave: string, statusAtual: ImplementacaoStatus): boolean {
  const statusRequerido = GRUPO_STATUS_REQUERIDO[chave];
  if (!statusRequerido) return false;
  return ORDEM_STATUS[statusAtual] < ORDEM_STATUS[statusRequerido];
}

// Converte entre <input type="date"> (YYYY-MM-DD, sem fuso) e timestamptz
// (marcado_em), usando o fuso local pra não voltar/adiantar um dia na volta.
function hojeInputDate(): string {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function paraDataInput(iso: string): string {
  const data = new Date(iso);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dataInputParaIso(dataInput: string): string {
  return new Date(`${dataInput}T12:00:00`).toISOString();
}

function preRequisitoCompleto(form: FormGeral): boolean {
  return (
    form.email_conta_kommo.trim().length > 0 &&
    form.whatsapp_corporativo_confirmado &&
    form.acesso_facebook_confirmado
  );
}

function paraFormGeral(impl: ImplementacaoCrm): FormGeral {
  return {
    nome_cliente: impl.nome_cliente,
    consultor_responsavel: impl.consultor_responsavel ?? '',
    stakeholder_decisor: impl.stakeholder_decisor ?? '',
    status: impl.status,
    conta_criada_via_v4: impl.conta_criada_via_v4,
    email_conta_kommo: impl.email_conta_kommo ?? '',
    whatsapp_corporativo_confirmado: impl.whatsapp_corporativo_confirmado,
    acesso_facebook_confirmado: impl.acesso_facebook_confirmado,
    plano_contratado: impl.plano_contratado ?? '',
    periodo_contratado: impl.periodo_contratado ?? '',
    data_decisao_plano: impl.data_decisao_plano ?? '',
    observacoes: impl.observacoes ?? '',
  };
}

export function ImplementacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [implementacao, setImplementacao] = useState<ImplementacaoCrm | null>(null);
  const [grupos, setGrupos] = useState<ChecklistGrupoImplementacao[]>([]);
  const [itens, setItens] = useState<ChecklistItemImplementacao[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [dataConclusao, setDataConclusao] = useState<Record<string, string>>({});
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [evidenciaFaltando, setEvidenciaFaltando] = useState<Set<string>>(new Set());
  const [credenciais, setCredenciais] = useState<CredencialCrmListada[]>([]);
  const [funisDoMapeamento, setFunisDoMapeamento] = useState<FunilGerado[]>([]);
  const [criacoesKommo, setCriacoesKommo] = useState<Record<string, FunilKommoCriacao>>({});
  const [credencialKommoMeta, setCredencialKommoMeta] = useState<CredencialApiKommoMeta | null>(null);
  const [historicoStatus, setHistoricoStatus] = useState<ImplementacaoStatusHistorico[]>([]);
  const [checkpointAdocao, setCheckpointAdocao] = useState<CheckpointAdocao | null>(null);
  const [linkCheckpointCopiado, setLinkCheckpointCopiado] = useState(false);
  const [aba, setAba] = useState<Aba>('geral');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formGeral, setFormGeral] = useState<FormGeral | null>(null);
  const [salvandoGeral, setSalvandoGeral] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);

  const [formCredencial, setFormCredencial] = useState<FormCredencial | null>(null);
  const [salvandoCredencial, setSalvandoCredencial] = useState(false);
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [revelando, setRevelando] = useState<string | null>(null);

  const [formCredencialKommo, setFormCredencialKommo] = useState<FormCredencialKommo | null>(null);
  const [salvandoCredencialKommo, setSalvandoCredencialKommo] = useState(false);
  const [criandoFunilId, setCriandoFunilId] = useState<string | null>(null);
  const [apagarFunilPadrao, setApagarFunilPadrao] = useState(false);
  const [mensagemSucessoKommo, setMensagemSucessoKommo] = useState<string | null>(null);

  const [excluindo, setExcluindo] = useState(false);
  const [gerandoItens, setGerandoItens] = useState(false);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const fasesCronograma = useMemo(
    () => (implementacao ? fasesImplementacao(implementacao, historicoStatus) : []),
    [implementacao, historicoStatus],
  );

  const itensGantt = useMemo(() => {
    if (!implementacao) return [];
    const marcadosMapa = new Map(
      itens.map((item) => [
        item.id,
        {
          marcado: marcados.has(item.id),
          marcadoEm: dataConclusao[item.id] ? `${dataConclusao[item.id]}T12:00:00` : null,
        },
      ]),
    );
    return itensCronograma({
      implementacao,
      grupos,
      itens,
      marcados: marcadosMapa,
      fases: fasesCronograma,
      hoje,
    });
  }, [implementacao, grupos, itens, marcados, dataConclusao, fasesCronograma, hoje]);

  const escalaGantt = useMemo(() => {
    const datas = [
      ...fasesCronograma.flatMap((fase) => [fase.inicio, fase.fim ?? hoje]),
      ...itensGantt.flatMap((entrada) => [entrada.dataConclusao, entrada.vencimento].filter((d): d is Date => d !== null)),
    ];
    return calcularEscala(datas, hoje);
  }, [fasesCronograma, itensGantt, hoje]);

  async function carregar(implementacaoId: string) {
    setLoading(true);
    setError(null);

    const [
      { data: implData, error: implError },
      { data: gruposData, error: gruposError },
      { data: itensData, error: itensError },
      { data: marcadosData, error: marcadosError },
      { data: credenciaisData, error: credenciaisError },
      { data: historicoData, error: historicoError },
      { data: checkpointData },
    ] = await Promise.all([
      supabase.from('implementacoes_crm').select('*').eq('id', implementacaoId).single(),
      supabase.from('checklist_grupos_implementacao').select('*').order('ordem', { ascending: true }),
      // Template global (implementacao_id nulo) + itens derivados do funil desta implementação.
      supabase
        .from('checklist_itens_implementacao')
        .select('*')
        .or(`implementacao_id.is.null,implementacao_id.eq.${implementacaoId}`)
        .order('ordem', { ascending: true }),
      supabase
        .from('implementacao_checklist_marcado')
        .select('item_id, marcado, evidencia, marcado_em')
        .eq('implementacao_id', implementacaoId),
      supabase.rpc('listar_credenciais_crm', { p_implementacao_id: implementacaoId }),
      supabase
        .from('implementacao_status_historico')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('alterado_em', { ascending: true }),
      supabase
        .from('checkpoints_adocao')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .maybeSingle(),
    ]);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setImplementacao(implData);
    setFormGeral(paraFormGeral(implData));
    if (!gruposError) setGrupos(gruposData ?? []);
    if (!itensError) setItens(itensData ?? []);
    if (!marcadosError) {
      setMarcados(new Set((marcadosData ?? []).filter((m) => m.marcado).map((m) => m.item_id)));
      setEvidencias(
        Object.fromEntries((marcadosData ?? []).map((m) => [m.item_id, m.evidencia ?? ''])),
      );
      setDataConclusao(
        Object.fromEntries(
          (marcadosData ?? [])
            .filter((m) => m.marcado)
            .map((m) => [m.item_id, paraDataInput(m.marcado_em)]),
        ),
      );
    }
    setEvidenciaFaltando(new Set());
    if (!credenciaisError) setCredenciais(credenciaisData ?? []);
    if (!historicoError) setHistoricoStatus(historicoData ?? []);
    setCheckpointAdocao(checkpointData ?? null);

    const funis = await buscarFunisMaisRecentes(implData.mapeamento_id);
    setFunisDoMapeamento(funis);

    const [{ data: criacoesData }, { data: credKommoData }] = await Promise.all([
      funis.length > 0
        ? supabase
            .from('funis_kommo_criacoes')
            .select('*')
            .in(
              'funil_gerado_id',
              funis.map((f) => f.id),
            )
        : Promise.resolve({ data: [] as FunilKommoCriacao[] }),
      supabase.rpc('obter_credencial_api_kommo_meta', { p_implementacao_id: implementacaoId }),
    ]);

    setCriacoesKommo(
      Object.fromEntries((criacoesData ?? []).map((c) => [c.funil_gerado_id, c])),
    );
    setCredencialKommoMeta(credKommoData?.[0] ?? null);

    setLoading(false);
  }

  useEffect(() => {
    if (id) carregar(id);
  }, [id]);

  function itensDoGrupo(grupoId: string): ChecklistItemImplementacao[] {
    return itens.filter((item) => item.grupo_id === grupoId).sort((a, b) => a.ordem - b.ordem);
  }

  function progressoGrupo(grupoId: string): { feitos: number; total: number } {
    const doGrupo = itensDoGrupo(grupoId);
    const feitos = doGrupo.filter((item) => marcados.has(item.id)).length;
    return { feitos, total: doGrupo.length };
  }

  // Base pros itens derivados: sempre logo após os itens globais do template,
  // pra não crescer a cada regeneração (os derivados antigos já foram apagados).
  function proximaOrdemGrupo(grupoId: string): number {
    const ordens = itens
      .filter((item) => item.grupo_id === grupoId && item.implementacao_id === null)
      .map((item) => item.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 0;
  }

  async function buscarFunisMaisRecentes(mapeamentoId: string): Promise<FunilGerado[]> {
    const { data: versaoAtual } = await supabase
      .from('funis_gerados')
      .select('versao')
      .eq('mapeamento_id', mapeamentoId)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!versaoAtual) return [];

    const { data } = await supabase
      .from('funis_gerados')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', versaoAtual.versao)
      .order('ordem', { ascending: true });

    return data ?? [];
  }

  async function handleGerarItensDoFunil() {
    if (!implementacao) return;

    const jaTemDerivados = itens.some((item) => item.implementacao_id === implementacao.id);
    if (
      jaTemDerivados &&
      !window.confirm(
        'Já existem itens gerados a partir do funil nesta implementação. Gerar de novo substitui esses itens — o que já tinha sido marcado neles se perde. Continuar?',
      )
    ) {
      return;
    }

    setGerandoItens(true);
    setError(null);

    const funis = await buscarFunisMaisRecentes(implementacao.mapeamento_id);
    if (funis.length === 0) {
      setGerandoItens(false);
      setError('O mapeamento de origem ainda não tem funil gerado.');
      return;
    }

    const grupoSemana1 = grupos.find((g) => g.chave === 'semana_1_sessao1');
    const grupoSemana2 = grupos.find((g) => g.chave === 'semana_2');
    if (!grupoSemana1 || !grupoSemana2) {
      setGerandoItens(false);
      setError('Grupos de checklist "Semana 1" / "Semana 2" não encontrados.');
      return;
    }

    const { semana1, semana2 } = gerarItensDerivados(funis);

    if (jaTemDerivados) {
      await supabase
        .from('checklist_itens_implementacao')
        .delete()
        .eq('implementacao_id', implementacao.id);
    }

    const ordemBaseSemana1 = proximaOrdemGrupo(grupoSemana1.id);
    const ordemBaseSemana2 = proximaOrdemGrupo(grupoSemana2.id);

    const rows = [
      ...semana1.map((texto, i) => ({
        grupo_id: grupoSemana1.id,
        texto,
        ordem: ordemBaseSemana1 + i,
        implementacao_id: implementacao.id,
      })),
      ...semana2.map((texto, i) => ({
        grupo_id: grupoSemana2.id,
        texto,
        ordem: ordemBaseSemana2 + i,
        implementacao_id: implementacao.id,
      })),
    ];

    const { error: insertError } = await supabase.from('checklist_itens_implementacao').insert(rows);
    setGerandoItens(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await carregar(implementacao.id);
  }

  async function persistirItem(itemId: string, marcado: boolean, dataConclusaoInput?: string) {
    if (!implementacao) return;
    const marcadoEm = marcado
      ? dataInputParaIso(dataConclusaoInput ?? dataConclusao[itemId] ?? hojeInputDate())
      : new Date().toISOString();
    await supabase.from('implementacao_checklist_marcado').upsert(
      {
        implementacao_id: implementacao.id,
        item_id: itemId,
        marcado,
        evidencia: (evidencias[itemId] ?? '').trim() || null,
        marcado_em: marcadoEm,
      },
      { onConflict: 'implementacao_id,item_id' },
    );
  }

  async function handleToggleItem(item: ChecklistItemImplementacao) {
    if (!implementacao) return;
    const jaMarcado = marcados.has(item.id);
    const novoMarcado = !jaMarcado;

    // Critério que exige evidência não pode ser marcado sem ela — vira só
    // um lembrete e perde a força de controle de qualidade, senão.
    if (novoMarcado && item.requer_evidencia && !(evidencias[item.id] ?? '').trim()) {
      setEvidenciaFaltando((prev) => new Set(prev).add(item.id));
      return;
    }

    setEvidenciaFaltando((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    setMarcados((prev) => {
      const next = new Set(prev);
      if (novoMarcado) next.add(item.id);
      else next.delete(item.id);
      return next;
    });

    const dataParaSalvar = novoMarcado ? dataConclusao[item.id] ?? hojeInputDate() : undefined;
    if (novoMarcado) {
      setDataConclusao((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: dataParaSalvar! }));
    }

    await persistirItem(item.id, novoMarcado, dataParaSalvar);
  }

  async function handleDataConclusaoChange(itemId: string, valor: string) {
    setDataConclusao((prev) => ({ ...prev, [itemId]: valor }));
    if (marcados.has(itemId)) {
      await persistirItem(itemId, true, valor);
    }
  }

  function handleEvidenciaChange(itemId: string, texto: string) {
    setEvidencias((prev) => ({ ...prev, [itemId]: texto }));
  }

  async function handleEvidenciaBlur(item: ChecklistItemImplementacao) {
    const texto = (evidencias[item.id] ?? '').trim();
    const estavaMarcado = marcados.has(item.id);

    // Sem evidência não sustenta a marcação de um critério que exige evidência.
    if (item.requer_evidencia && !texto && estavaMarcado) {
      setMarcados((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      await persistirItem(item.id, false);
      return;
    }

    if (!estavaMarcado && !texto) return;
    await persistirItem(item.id, estavaMarcado);
  }

  async function handleSalvarGeral(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formGeral) return;

    setError(null);

    if (
      implementacao.status === 'pre_requisito' &&
      STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(formGeral.status) &&
      !preRequisitoCompleto(formGeral)
    ) {
      setError(
        'Não dá pra avançar pra Semana 1 sem o pré-requisito completo: e-mail da conta Kommo, WhatsApp Corporativo e acesso ao Facebook confirmados.',
      );
      return;
    }

    setSalvandoGeral(true);
    setSalvoRecentemente(false);

    const { data, error: updateError } = await supabase
      .from('implementacoes_crm')
      .update({
        nome_cliente: formGeral.nome_cliente.trim(),
        consultor_responsavel: formGeral.consultor_responsavel.trim() || null,
        stakeholder_decisor: formGeral.stakeholder_decisor.trim() || null,
        status: formGeral.status,
        conta_criada_via_v4: formGeral.conta_criada_via_v4,
        email_conta_kommo: formGeral.email_conta_kommo.trim() || null,
        whatsapp_corporativo_confirmado: formGeral.whatsapp_corporativo_confirmado,
        acesso_facebook_confirmado: formGeral.acesso_facebook_confirmado,
        plano_contratado: formGeral.plano_contratado || null,
        periodo_contratado: formGeral.periodo_contratado.trim() || null,
        data_decisao_plano: formGeral.data_decisao_plano || null,
        observacoes: formGeral.observacoes.trim() || null,
      })
      .eq('id', implementacao.id)
      .select()
      .single();

    setSalvandoGeral(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setImplementacao(data);
    setSalvoRecentemente(true);
    setTimeout(() => setSalvoRecentemente(false), 2000);
  }

  async function handleAvancarStatus(proximo: ImplementacaoStatus) {
    if (!implementacao || !formGeral) return;
    setError(null);
    setSalvandoGeral(true);

    const { data, error: updateError } = await supabase
      .from('implementacoes_crm')
      .update({ status: proximo })
      .eq('id', implementacao.id)
      .select()
      .single();

    setSalvandoGeral(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setImplementacao(data);
    setFormGeral({ ...formGeral, status: proximo });
  }

  async function handleExcluirImplementacao() {
    if (!implementacao) return;
    if (
      !window.confirm(
        `Excluir a implementação de "${implementacao.nome_cliente}"? Isso também apaga as credenciais salvas. Essa ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setExcluindo(true);
    const { error: deleteError } = await supabase
      .from('implementacoes_crm')
      .delete()
      .eq('id', implementacao.id);
    setExcluindo(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/implementacoes');
  }

  function abrirNovaCredencial() {
    setFormCredencial(FORM_CREDENCIAL_VAZIO);
  }

  async function abrirEdicaoCredencial(credencial: CredencialCrmListada) {
    const { data, error: revelarError } = await supabase.rpc('revelar_credencial_crm', {
      p_id: credencial.id,
    });

    if (revelarError || !data || data.length === 0) {
      setError(revelarError?.message ?? 'Não foi possível carregar a credencial.');
      return;
    }

    const revelada = data[0];
    setFormCredencial({
      id: credencial.id,
      login: revelada.login,
      senha: revelada.senha,
      observacoes: revelada.observacoes ?? '',
    });
  }

  function fecharFormCredencial() {
    setFormCredencial(null);
  }

  async function handleSalvarCredencial(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formCredencial) return;
    if (!formCredencial.login.trim() || !formCredencial.senha.trim()) return;

    setSalvandoCredencial(true);

    const { error: saveError } = formCredencial.id
      ? await supabase.rpc('atualizar_credencial_crm', {
          p_id: formCredencial.id,
          p_login: formCredencial.login.trim(),
          p_senha: formCredencial.senha,
          p_observacoes: formCredencial.observacoes.trim() || null,
        })
      : await supabase.rpc('salvar_credencial_crm', {
          p_implementacao_id: implementacao.id,
          p_login: formCredencial.login.trim(),
          p_senha: formCredencial.senha,
          p_observacoes: formCredencial.observacoes.trim() || null,
        });

    setSalvandoCredencial(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormCredencial();
    carregar(implementacao.id);
  }

  async function handleRevelarSenha(credencialId: string) {
    setRevelando(credencialId);
    const { data, error: revelarError } = await supabase.rpc('revelar_credencial_crm', {
      p_id: credencialId,
    });
    setRevelando(null);

    if (revelarError || !data || data.length === 0) {
      setError(revelarError?.message ?? 'Não foi possível revelar a senha.');
      return;
    }

    setReveladas((prev) => ({ ...prev, [credencialId]: data[0].senha }));
  }

  function handleEsconderSenha(credencialId: string) {
    setReveladas((prev) => {
      const next = { ...prev };
      delete next[credencialId];
      return next;
    });
  }

  async function handleExcluirCredencial(credencial: CredencialCrmListada) {
    if (!window.confirm(`Excluir a credencial "${credencial.login}"?`)) return;

    const { error: deleteError } = await supabase.from('credenciais_crm').delete().eq('id', credencial.id);
    if (deleteError) setError(deleteError.message);
    else setCredenciais((prev) => prev.filter((c) => c.id !== credencial.id));
  }

  function abrirFormCredencialKommo() {
    setFormCredencialKommo({
      subdominio: credencialKommoMeta?.subdominio ?? '',
      token: '',
    });
  }

  function fecharFormCredencialKommo() {
    setFormCredencialKommo(null);
  }

  async function handleSalvarCredencialKommo(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formCredencialKommo) return;
    if (!formCredencialKommo.subdominio.trim() || !formCredencialKommo.token.trim()) return;

    setSalvandoCredencialKommo(true);
    const { error: saveError } = await supabase.rpc('salvar_credencial_api_kommo', {
      p_implementacao_id: implementacao.id,
      p_subdominio: formCredencialKommo.subdominio.trim(),
      p_token: formCredencialKommo.token.trim(),
    });
    setSalvandoCredencialKommo(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormCredencialKommo();
    carregar(implementacao.id);
  }

  async function handleCopiarLinkCheckpoint() {
    if (!implementacao) return;
    const link = `${window.location.origin}/checkpoint/${implementacao.codigo_checkpoint}`;
    await navigator.clipboard.writeText(link);
    setLinkCheckpointCopiado(true);
    setTimeout(() => setLinkCheckpointCopiado(false), 2000);
  }

  async function handleCriarFunilNoKommo(funil: FunilGerado) {
    if (!implementacao) return;

    const jaCriado = criacoesKommo[funil.id];
    if (jaCriado) {
      const confirmar = window.confirm(
        `O funil "${funil.nome_funil}" já foi criado no Kommo (pipeline ${jaCriado.kommo_pipeline_id}) em ${new Date(jaCriado.criado_em).toLocaleString('pt-BR')}. Criar de novo cria um pipeline NOVO e separado na conta do cliente — não atualiza o existente. Continuar mesmo assim?`,
      );
      if (!confirmar) return;
    } else if (
      !window.confirm(
        `Confirma a criação do funil "${funil.nome_funil}" direto na conta Kommo do cliente? Isso grava o pipeline, as etapas e os campos personalizados de verdade — revise o funil antes de confirmar.`,
      )
    ) {
      return;
    }

    setCriandoFunilId(funil.id);
    setError(null);
    setMensagemSucessoKommo(null);

    const { data, error: invokeError } = await supabase.functions.invoke('criar-funil-kommo', {
      body: {
        implementacao_id: implementacao.id,
        funil_id: funil.id,
        confirmar: Boolean(jaCriado),
        apagar_funil_padrao: apagarFunilPadrao,
      },
    });

    setCriandoFunilId(null);

    if (invokeError || data?.error) {
      setError(data?.message ?? data?.error ?? invokeError?.message ?? 'Falha ao criar o funil no Kommo.');
      return;
    }

    const campos: { reaproveitado: boolean }[] = data?.campoIds ?? [];
    const novos = campos.filter((c) => !c.reaproveitado).length;
    const reaproveitados = campos.filter((c) => c.reaproveitado).length;
    const resumoCampos =
      campos.length > 0
        ? ` ${novos} campo(s) criado(s)${reaproveitados > 0 ? `, ${reaproveitados} já existiam e foram reaproveitados` : ''}.`
        : '';

    if (data?.funil_padrao) {
      setMensagemSucessoKommo(
        (data.funil_padrao.apagado
          ? `Funil "${funil.nome_funil}" criado no Kommo. O funil padrão da conta também foi apagado.`
          : `Funil "${funil.nome_funil}" criado no Kommo. Funil padrão não apagado: ${data.funil_padrao.motivo ?? 'motivo desconhecido'}.`) +
          resumoCampos,
      );
    } else {
      setMensagemSucessoKommo(`Funil "${funil.nome_funil}" criado no Kommo.${resumoCampos}`);
    }

    await carregar(implementacao.id);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !implementacao) return <p className="form-error">{error}</p>;
  if (!implementacao || !formGeral) return <p className="form-error">Implementação não encontrada.</p>;

  const gateSemanaUmBloqueado = implementacao.status === 'pre_requisito' && !preRequisitoCompleto(formGeral);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{implementacao.nome_cliente}</h1>
          <p className="field-hint">
            <Link to={`/mapeamento/${implementacao.mapeamento_id}`}>Ver mapeamento de origem</Link>
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExcluirImplementacao} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir implementação'}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        <button
          type="button"
          className={`tab-button${aba === 'geral' ? ' active' : ''}`}
          onClick={() => setAba('geral')}
        >
          Visão Geral
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'checklist' ? ' active' : ''}`}
          onClick={() => setAba('checklist')}
        >
          Checklist
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'cronograma' ? ' active' : ''}`}
          onClick={() => setAba('cronograma')}
        >
          Cronograma
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'credenciais' ? ' active' : ''}`}
          onClick={() => setAba('credenciais')}
        >
          Credenciais
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'checkpoint' ? ' active' : ''}`}
          onClick={() => setAba('checkpoint')}
        >
          Checkpoint 30 dias
          {checkpointAdocao?.risco_churn && <span className="badge-danger">Risco</span>}
        </button>
      </div>

      {aba === 'geral' && (
        <>
          <form onSubmit={handleSalvarGeral} className="card form-card">
            <h2>Dados gerais</h2>

            <div className="form-grid">
              <label className="field">
                <span>Nome do cliente</span>
                <input
                  type="text"
                  required
                  value={formGeral.nome_cliente}
                  onChange={(e) => setFormGeral({ ...formGeral, nome_cliente: e.target.value })}
                />
              </label>

              <label className="field">
                <span>Status</span>
                <select
                  value={formGeral.status}
                  onChange={(e) =>
                    setFormGeral({ ...formGeral, status: e.target.value as ImplementacaoStatus })
                  }
                >
                  {Object.entries(IMPLEMENTACAO_STATUS_LABELS).map(([valor, label]) => (
                    <option
                      key={valor}
                      value={valor}
                      disabled={
                        gateSemanaUmBloqueado &&
                        STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(valor as ImplementacaoStatus)
                      }
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {gateSemanaUmBloqueado && (
                  <span className="field-hint">
                    Bloqueado até confirmar o pré-requisito: e-mail da conta Kommo, WhatsApp
                    Corporativo e acesso ao Facebook (campos "Acessos" abaixo).
                  </span>
                )}
              </label>

              <label className="field">
                <span>Consultor responsável</span>
                <input
                  type="text"
                  value={formGeral.consultor_responsavel}
                  onChange={(e) => setFormGeral({ ...formGeral, consultor_responsavel: e.target.value })}
                />
              </label>

              <label className="field">
                <span>Stakeholder decisor</span>
                <input
                  type="text"
                  value={formGeral.stakeholder_decisor}
                  onChange={(e) => setFormGeral({ ...formGeral, stakeholder_decisor: e.target.value })}
                />
              </label>
            </div>

            <h3>Acessos</h3>

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formGeral.conta_criada_via_v4}
                onChange={(e) => setFormGeral({ ...formGeral, conta_criada_via_v4: e.target.checked })}
              />
              <span>Conta Kommo criada via V4 Company</span>
            </label>

            <div className="form-grid">
              <label className="field">
                <span>E-mail da conta Kommo</span>
                <input
                  type="email"
                  value={formGeral.email_conta_kommo}
                  onChange={(e) => setFormGeral({ ...formGeral, email_conta_kommo: e.target.value })}
                />
              </label>
            </div>

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formGeral.whatsapp_corporativo_confirmado}
                onChange={(e) =>
                  setFormGeral({ ...formGeral, whatsapp_corporativo_confirmado: e.target.checked })
                }
              />
              <span>WhatsApp Corporativo (business) confirmado</span>
            </label>

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formGeral.acesso_facebook_confirmado}
                onChange={(e) => setFormGeral({ ...formGeral, acesso_facebook_confirmado: e.target.checked })}
              />
              <span>Acesso às credenciais do Facebook confirmado</span>
            </label>

            <div className="form-grid">
              <label className="field">
                <span>Plano contratado</span>
                <select
                  value={formGeral.plano_contratado}
                  onChange={(e) => setFormGeral({ ...formGeral, plano_contratado: e.target.value })}
                >
                  <option value="">— Ainda não decidido —</option>
                  <option value="Kommo Basic">Kommo Basic</option>
                  <option value="Kommo PRO">Kommo PRO</option>
                </select>
              </label>

              <label className="field">
                <span>Período contratado</span>
                <input
                  type="text"
                  placeholder="Ex: Mensal, Anual, 12x"
                  value={formGeral.periodo_contratado}
                  onChange={(e) => setFormGeral({ ...formGeral, periodo_contratado: e.target.value })}
                />
              </label>

              <label className="field">
                <span>Data da decisão do plano</span>
                <input
                  type="date"
                  value={formGeral.data_decisao_plano}
                  onChange={(e) => setFormGeral({ ...formGeral, data_decisao_plano: e.target.value })}
                />
              </label>

              <label className="field field-full">
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={formGeral.observacoes}
                  onChange={(e) => setFormGeral({ ...formGeral, observacoes: e.target.value })}
                />
              </label>
            </div>

            <div className="wizard-actions">
              <span className="field-hint">{salvoRecentemente ? 'Alterações salvas.' : ''}</span>
              <button type="submit" className="btn btn-primary" disabled={salvandoGeral}>
                {salvandoGeral ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </form>

          {historicoStatus.length > 0 && (
            <section className="card form-card">
              <h2>Histórico de status</h2>
              <p className="field-hint">Data real de quando cada fase foi alcançada.</p>
              <ul className="historico-status-lista">
                {historicoStatus.map((h) => (
                  <li key={h.id} className="historico-status-item">
                    <span className="historico-status-data">
                      {new Date(h.alterado_em).toLocaleString('pt-BR')}
                    </span>
                    <span>
                      {h.status_anterior
                        ? `${IMPLEMENTACAO_STATUS_LABELS[h.status_anterior]} → ${IMPLEMENTACAO_STATUS_LABELS[h.status_novo]}`
                        : `Implementação iniciada em ${IMPLEMENTACAO_STATUS_LABELS[h.status_novo]}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card form-card">
            <h2>Itens derivados do funil</h2>
            <p className="field-hint">
              Gera itens específicos pra Semana 1 (funis, campos, gatilhos) e Semana 2 (automações,
              mensagens, motivos de perda) a partir do funil já gerado pra este cliente, direto no
              checklist abaixo — sem precisar montar essa lista na mão. Rodar de novo substitui os
              itens gerados anteriormente (o que já tinha sido marcado neles se perde).
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={handleGerarItensDoFunil}
              disabled={gerandoItens}
            >
              {gerandoItens ? 'Gerando…' : 'Gerar itens a partir do funil'}
            </button>
          </section>

          <section className="card form-card">
            <div className="page-header">
              <h2 style={{ marginBottom: 0 }}>Criar funil no Kommo (API)</h2>
              {!formCredencialKommo && (
                <button type="button" className="btn btn-secondary" onClick={abrirFormCredencialKommo}>
                  {credencialKommoMeta ? 'Trocar token' : '+ Cadastrar credencial de API'}
                </button>
              )}
            </div>
            <p className="field-hint">
              Cria o pipeline, as etapas e os campos personalizados direto na conta Kommo do cliente,
              usando o token de longa duração da integração (Kommo → Configurações → Integrações →
              sua integração → "Token de longa duração"). Diferente das credenciais de acesso acima
              — esse token nunca fica visível na tela depois de salvo.
            </p>

            {credencialKommoMeta && !formCredencialKommo && (
              <p className="field-hint">
                Configurado para <code>{credencialKommoMeta.subdominio}.kommo.com</code>.
              </p>
            )}
            {!credencialKommoMeta && !formCredencialKommo && (
              <p className="field-hint">Nenhuma credencial de API cadastrada ainda.</p>
            )}

            {formCredencialKommo && (
              <form onSubmit={handleSalvarCredencialKommo} className="card form-card">
                <label className="field">
                  <span>Subdomínio Kommo</span>
                  <input
                    type="text"
                    required
                    placeholder="ex: minhaempresa (de minhaempresa.kommo.com)"
                    value={formCredencialKommo.subdominio}
                    onChange={(e) =>
                      setFormCredencialKommo({ ...formCredencialKommo, subdominio: e.target.value })
                    }
                  />
                </label>

                <label className="field">
                  <span>Token de longa duração</span>
                  <input
                    type="text"
                    required
                    value={formCredencialKommo.token}
                    onChange={(e) =>
                      setFormCredencialKommo({ ...formCredencialKommo, token: e.target.value })
                    }
                  />
                </label>

                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharFormCredencialKommo}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={salvandoCredencialKommo}>
                    {salvandoCredencialKommo ? 'Salvando…' : 'Salvar credencial'}
                  </button>
                </div>
              </form>
            )}

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={apagarFunilPadrao}
                onChange={(e) => setApagarFunilPadrao(e.target.checked)}
              />
              <span>
                Ao criar, apagar também o funil padrão que o Kommo cria sozinho em conta nova — só
                some se ele ainda estiver vazio (sem negociações); com dado dentro, não é apagado.
              </span>
            </label>

            {mensagemSucessoKommo && <p className="form-info">{mensagemSucessoKommo}</p>}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Funil</th>
                    <th>Status no Kommo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {funisDoMapeamento.map((funil) => {
                    const criacao = criacoesKommo[funil.id];
                    return (
                      <tr key={funil.id}>
                        <td>{funil.nome_funil}</td>
                        <td>
                          {criacao
                            ? `Criado (pipeline ${criacao.kommo_pipeline_id}) em ${new Date(criacao.criado_em).toLocaleString('pt-BR')}`
                            : 'Ainda não criado'}
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleCriarFunilNoKommo(funil)}
                            disabled={criandoFunilId === funil.id || !credencialKommoMeta}
                            title={
                              !credencialKommoMeta ? 'Cadastre a credencial de API acima primeiro' : undefined
                            }
                          >
                            {criandoFunilId === funil.id
                              ? 'Criando…'
                              : criacao
                                ? 'Criar de novo'
                                : 'Criar no Kommo'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {funisDoMapeamento.length === 0 && (
                    <tr>
                      <td colSpan={3} className="field-hint">
                        O mapeamento de origem ainda não tem funil gerado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {aba === 'checklist' &&
        grupos.map((grupo) => {
          const { feitos, total } = progressoGrupo(grupo.id);
          const completo = total > 0 && feitos === total;
          const percentual = total > 0 ? Math.round((feitos / total) * 100) : 0;
          const travado = grupoBloqueado(grupo.chave, implementacao.status);
          // Semana 1 é dividida em duas sessões — a sugestão de avançar de
          // status (mostrada junto da Sessão 2) exige as duas completas.
          const sessao1Completa = (() => {
            if (grupo.chave !== 'semana_1_sessao2') return true;
            const grupoSessao1 = grupos.find((g) => g.chave === 'semana_1_sessao1');
            if (!grupoSessao1) return true;
            const p = progressoGrupo(grupoSessao1.id);
            return p.total > 0 && p.feitos === p.total;
          })();
          return (
            <section key={grupo.id} className={`card form-card${travado ? ' checklist-grupo-travado' : ''}`}>
              <div className="page-header">
                <h2 style={{ marginBottom: 0 }}>
                  {grupo.titulo}
                  {travado && <span className="checklist-travado-badge">Bloqueado</span>}
                </h2>
                {total > 0 && (
                  <div className="checklist-progress">
                    <div className="checklist-progress-bar">
                      <div
                        className={`checklist-progress-bar-fill${completo ? ' complete' : ''}`}
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                    <span className="checklist-progress-count">
                      {feitos}/{total}
                    </span>
                  </div>
                )}
              </div>
              {travado && GRUPO_STATUS_REQUERIDO[grupo.chave] && (
                <p className="field-hint">
                  Disponível quando o status da implementação chegar em "
                  {IMPLEMENTACAO_STATUS_LABELS[GRUPO_STATUS_REQUERIDO[grupo.chave]!]}" (aba Visão
                  Geral).
                </p>
              )}
              {!travado &&
                completo &&
                sessao1Completa &&
                grupoSugereAvancoStatus(grupo.chave, implementacao.status) && (
                (() => {
                  const proximo = PROXIMO_STATUS[implementacao.status];
                  if (!proximo) return null;
                  const bloqueado =
                    STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(proximo) &&
                    !preRequisitoCompleto(formGeral);
                  return (
                    <p className="form-info form-info-com-acao">
                      <span>
                        Checklist completo! O status da implementação ainda está em "
                        {IMPLEMENTACAO_STATUS_LABELS[implementacao.status]}".
                      </span>
                      {bloqueado ? (
                        'Confirme o pré-requisito (aba Visão Geral) antes de avançar.'
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleAvancarStatus(proximo)}
                          disabled={salvandoGeral}
                        >
                          Avançar status para "{IMPLEMENTACAO_STATUS_LABELS[proximo]}"
                        </button>
                      )}
                    </p>
                  );
                })()
              )}
              <div className="options-list">
                {itensDoGrupo(grupo.id).map((item) => (
                  <div key={item.id} className="option-checkbox-wrap">
                    <label className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={marcados.has(item.id)}
                        onChange={() => handleToggleItem(item)}
                        disabled={travado}
                      />
                      <span>
                        {item.texto}
                        {item.implementacao_id && <span className="derivado-badge"> · gerado do funil</span>}
                      </span>
                    </label>
                    {marcados.has(item.id) && (
                      <label className="data-conclusao-field">
                        <span className="field-hint">Feito em</span>
                        <input
                          type="date"
                          className="option-livre-input data-conclusao-input"
                          value={dataConclusao[item.id] ?? hojeInputDate()}
                          onChange={(e) => handleDataConclusaoChange(item.id, e.target.value)}
                          disabled={travado}
                        />
                      </label>
                    )}
                    {item.requer_evidencia && (
                      <>
                        <input
                          type="text"
                          className="option-livre-input evidencia-input"
                          placeholder="Evidência (link, print ou nota) — obrigatória pra marcar"
                          value={evidencias[item.id] ?? ''}
                          onChange={(e) => handleEvidenciaChange(item.id, e.target.value)}
                          onBlur={() => handleEvidenciaBlur(item)}
                          disabled={travado}
                        />
                        {evidenciaFaltando.has(item.id) && (
                          <p className="form-error">Escreva a evidência antes de marcar este critério.</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {itensDoGrupo(grupo.id).length === 0 && (
                  <p className="field-hint">Nenhum item cadastrado neste grupo.</p>
                )}
              </div>
            </section>
          );
        })}

      {aba === 'cronograma' && (
        <section className="card form-card">
          <h2>Cronograma</h2>
          <p className="field-hint">
            Uma linha por item do checklist inteiro. Verde = feito, na data real. Laranja/vermelho =
            pendente, do início da fase até o prazo do item (vermelho se já venceu). Sem barra = fase
            ainda não alcançada ou item sem dia definido.
          </p>

          {itensGantt.length === 0 && <p className="field-hint">Nenhum item de checklist cadastrado ainda.</p>}

          {itensGantt.length > 0 && (
            <div className="gantt-scroll">
              <div className="gantt-inner" style={{ minWidth: escalaGantt.totalDias * PX_POR_DIA + 220 }}>
                <div className="gantt-row gantt-row-ruler">
                  <div className="gantt-row-label" />
                  <div className="gantt-row-track" style={{ width: escalaGantt.totalDias * PX_POR_DIA }}>
                    <GanttRuler escala={escalaGantt} />
                  </div>
                </div>

                {itensGantt.map((entrada) => {
                  const fase = fasesCronograma.find((f) => f.status === entrada.grupoStatus);
                  const largura = escalaGantt.totalDias * PX_POR_DIA;
                  const hojePx = diaParaPx(hoje, escalaGantt);

                  return (
                    <div key={entrada.item.id} className="gantt-row">
                      <div className="gantt-row-label" title={entrada.item.texto}>
                        <span className="gantt-row-label-texto">{entrada.item.texto}</span>
                      </div>
                      <div className="gantt-row-track" style={{ width: largura }}>
                        <div className="gantt-hoje-tick" style={{ left: hojePx }} />

                        {entrada.feito && entrada.dataConclusao && (
                          <div
                            className="gantt-bar gantt-bar-ponto"
                            style={{ left: diaParaPx(entrada.dataConclusao, escalaGantt) - 4, background: '#34d399' }}
                            title={`Feito em ${entrada.dataConclusao.toLocaleDateString('pt-BR')}`}
                          />
                        )}

                        {!entrada.feito && entrada.vencimento && fase && (
                          <div
                            className="gantt-bar"
                            style={{
                              left: diaParaPx(fase.inicio, escalaGantt),
                              width: Math.max(
                                PX_POR_DIA,
                                diaParaPx(entrada.vencimento, escalaGantt) - diaParaPx(fase.inicio, escalaGantt),
                              ),
                              background: entrada.diasAtraso > 0 ? '#f87171' : '#fbbf24',
                            }}
                            title={
                              entrada.diasAtraso > 0
                                ? `Atrasado há ${entrada.diasAtraso} dia(s) — venceu em ${entrada.vencimento.toLocaleDateString('pt-BR')}`
                                : `Vence em ${entrada.vencimento.toLocaleDateString('pt-BR')}`
                            }
                          />
                        )}

                        {!entrada.feito && !entrada.vencimento && (
                          <span className="field-hint gantt-sem-fase">
                            {fase ? 'Sem dia definido' : 'Fase ainda não alcançada'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {aba === 'credenciais' && (
        <section className="card form-card">
          <div className="page-header">
            <h2 style={{ marginBottom: 0 }}>Credenciais de acesso do cliente no CRM</h2>
            {!formCredencial && (
              <button type="button" className="btn btn-primary" onClick={abrirNovaCredencial}>
                + Nova credencial
              </button>
            )}
          </div>
          <p className="field-hint">
            As senhas ficam criptografadas no banco — só aparecem em texto quando você clica em
            "Revelar".
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Login</th>
                  <th>Senha</th>
                  <th>Observações</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credenciais.map((credencial) => (
                  <tr key={credencial.id}>
                    <td>{credencial.login}</td>
                    <td>
                      {reveladas[credencial.id] ? <code>{reveladas[credencial.id]}</code> : '••••••••'}
                    </td>
                    <td>{credencial.observacoes || '—'}</td>
                    <td className="table-actions">
                      {reveladas[credencial.id] ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleEsconderSenha(credencial.id)}
                        >
                          Esconder
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleRevelarSenha(credencial.id)}
                          disabled={revelando === credencial.id}
                        >
                          {revelando === credencial.id ? 'Revelando…' : 'Revelar'}
                        </button>
                      )}{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => abrirEdicaoCredencial(credencial)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleExcluirCredencial(credencial)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {credenciais.length === 0 && !formCredencial && (
                  <tr>
                    <td colSpan={4} className="field-hint">
                      Nenhuma credencial cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {formCredencial && (
            <form onSubmit={handleSalvarCredencial} className="card form-card">
              <h3>{formCredencial.id ? 'Editar credencial' : 'Nova credencial'}</h3>

              <label className="field">
                <span>Login / e-mail</span>
                <input
                  type="text"
                  required
                  value={formCredencial.login}
                  onChange={(e) => setFormCredencial({ ...formCredencial, login: e.target.value })}
                />
              </label>

              <label className="field">
                <span>Senha</span>
                <input
                  type="text"
                  required
                  value={formCredencial.senha}
                  onChange={(e) => setFormCredencial({ ...formCredencial, senha: e.target.value })}
                />
              </label>

              <label className="field">
                <span>Observações (opcional)</span>
                <input
                  type="text"
                  value={formCredencial.observacoes}
                  onChange={(e) => setFormCredencial({ ...formCredencial, observacoes: e.target.value })}
                />
              </label>

              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={fecharFormCredencial}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvandoCredencial}>
                  {salvandoCredencial ? 'Salvando…' : 'Salvar credencial'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'checkpoint' && (
        <section className="card form-card">
          <h2>Checkpoint de Adoção — 30 dias pós-entrega</h2>
          <p className="field-hint">
            Instrumento separado do checklist técnico e do NPS: mede se a adoção do Kommo
            realmente aconteceu depois que o cliente ficou sozinho com a ferramenta, 30 dias após
            a Semana 4.
          </p>

          {!checkpointAdocao && (
            <>
              <p className="field-hint">
                Copie o link abaixo e envie para o cliente 30 dias após a entrega (Semana 4).
              </p>
              <button type="button" className="btn btn-secondary" onClick={handleCopiarLinkCheckpoint}>
                {linkCheckpointCopiado ? 'Link copiado!' : 'Copiar link do checkpoint'}
              </button>
            </>
          )}

          {checkpointAdocao && (
            <>
              {checkpointAdocao.risco_churn && (
                <p className="form-error">
                  Sinal de risco de churn: o cliente respondeu que voltou a usar planilha/WhatsApp
                  em paralelo ao Kommo. Vale acionar o comercial ou reforçar o acompanhamento.
                </p>
              )}

              <ul className="historico-status-lista">
                <li className="historico-status-item">
                  <span className="historico-status-data">Uso diário</span>
                  <span>{USO_DIARIO_LABELS[checkpointAdocao.uso_diario]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Frequência de uso dos relatórios</span>
                  <span>{FREQUENCIA_USO_LABELS[checkpointAdocao.frequencia_uso]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Obstáculo relatado</span>
                  <span>{checkpointAdocao.obstaculo || '—'}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Contrataria manutenção?</span>
                  <span>{INTENCAO_MANUTENCAO_LABELS[checkpointAdocao.intencao_manutencao]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Respondido em</span>
                  <span>{new Date(checkpointAdocao.respondido_em).toLocaleString('pt-BR')}</span>
                </li>
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
