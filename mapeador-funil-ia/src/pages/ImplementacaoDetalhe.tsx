import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { gerarItensDerivados } from '../lib/checklistDerivado';
import { supabase } from '../lib/supabaseClient';
import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  CredencialApiKommoMeta,
  CredencialCrmListada,
  FunilGerado,
  FunilKommoCriacao,
  ImplementacaoCrm,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
} from '../types/database';

type Aba = 'geral' | 'checklist' | 'credenciais';

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
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [evidenciaFaltando, setEvidenciaFaltando] = useState<Set<string>>(new Set());
  const [credenciais, setCredenciais] = useState<CredencialCrmListada[]>([]);
  const [funisDoMapeamento, setFunisDoMapeamento] = useState<FunilGerado[]>([]);
  const [criacoesKommo, setCriacoesKommo] = useState<Record<string, FunilKommoCriacao>>({});
  const [credencialKommoMeta, setCredencialKommoMeta] = useState<CredencialApiKommoMeta | null>(null);
  const [historicoStatus, setHistoricoStatus] = useState<ImplementacaoStatusHistorico[]>([]);
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
        .select('item_id, marcado, evidencia')
        .eq('implementacao_id', implementacaoId),
      supabase.rpc('listar_credenciais_crm', { p_implementacao_id: implementacaoId }),
      supabase
        .from('implementacao_status_historico')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('alterado_em', { ascending: true }),
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
    }
    setEvidenciaFaltando(new Set());
    if (!credenciaisError) setCredenciais(credenciaisData ?? []);
    if (!historicoError) setHistoricoStatus(historicoData ?? []);

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

    const grupoSemana1 = grupos.find((g) => g.chave === 'semana_1');
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

  async function persistirItem(itemId: string, marcado: boolean) {
    if (!implementacao) return;
    await supabase.from('implementacao_checklist_marcado').upsert(
      {
        implementacao_id: implementacao.id,
        item_id: itemId,
        marcado,
        evidencia: (evidencias[itemId] ?? '').trim() || null,
        marcado_em: new Date().toISOString(),
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

    await persistirItem(item.id, novoMarcado);
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
          className={`tab-button${aba === 'credenciais' ? ' active' : ''}`}
          onClick={() => setAba('credenciais')}
        >
          Credenciais
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
          return (
            <section key={grupo.id} className="card form-card">
              <div className="page-header">
                <h2 style={{ marginBottom: 0 }}>{grupo.titulo}</h2>
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
              <div className="options-list">
                {itensDoGrupo(grupo.id).map((item) =>
                  item.requer_evidencia ? (
                    <div key={item.id} className="option-checkbox-wrap">
                      <label className="option-checkbox">
                        <input
                          type="checkbox"
                          checked={marcados.has(item.id)}
                          onChange={() => handleToggleItem(item)}
                        />
                        <span>
                          {item.texto}
                          {item.implementacao_id && <span className="derivado-badge"> · gerado do funil</span>}
                        </span>
                      </label>
                      <input
                        type="text"
                        className="option-livre-input evidencia-input"
                        placeholder="Evidência (link, print ou nota) — obrigatória pra marcar"
                        value={evidencias[item.id] ?? ''}
                        onChange={(e) => handleEvidenciaChange(item.id, e.target.value)}
                        onBlur={() => handleEvidenciaBlur(item)}
                      />
                      {evidenciaFaltando.has(item.id) && (
                        <p className="form-error">Escreva a evidência antes de marcar este critério.</p>
                      )}
                    </div>
                  ) : (
                    <label key={item.id} className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={marcados.has(item.id)}
                        onChange={() => handleToggleItem(item)}
                      />
                      <span>
                        {item.texto}
                        {item.implementacao_id && <span className="derivado-badge"> · gerado do funil</span>}
                      </span>
                    </label>
                  ),
                )}
                {itensDoGrupo(grupo.id).length === 0 && (
                  <p className="field-hint">Nenhum item cadastrado neste grupo.</p>
                )}
              </div>
            </section>
          );
        })}

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
    </div>
  );
}
