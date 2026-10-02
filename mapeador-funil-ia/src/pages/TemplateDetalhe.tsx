// Módulo de Templates de Implementação (núcleo, Fase 1) — editor com
// abas. Só administradores escrevem (RLS garante isso no backend);
// consultores veem tudo em modo leitura.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { TIPO_REUNIAO_LABELS } from '../lib/reunioes';
import {
  STATUS_TEMPLATE_LABELS,
  STATUS_TEMPLATE_TONE,
  TIPO_CAMPO_CRM_LABELS,
  TIPO_CRITERIO_TEMPLATE_LABELS,
} from '../lib/templatesImplementacao';
import { supabase } from '../lib/supabaseClient';
import type {
  StatusTemplate,
  TemplateAtividade,
  TemplateAutomacao,
  TemplateCampoCrm,
  TemplateCriterio,
  TemplateDocumento,
  TemplateImplementacao,
  TemplateReuniao,
  TipoCampoCrm,
  TipoCriterioTemplate,
  TipoReuniao,
} from '../types/database';

type Aba = 'geral' | 'checklist' | 'reunioes' | 'criterios' | 'campos_crm' | 'automacoes' | 'documentos' | 'historico';

const ABAS: { valor: Aba; label: string }[] = [
  { valor: 'geral', label: 'Geral' },
  { valor: 'checklist', label: 'Checklist' },
  { valor: 'reunioes', label: 'Reuniões' },
  { valor: 'criterios', label: 'Critérios' },
  { valor: 'campos_crm', label: 'Campos CRM' },
  { valor: 'automacoes', label: 'Automações' },
  { valor: 'documentos', label: 'Documentos' },
  { valor: 'historico', label: 'Histórico' },
];

const TIPOS_CAMPO_CRM: TipoCampoCrm[] = [
  'texto',
  'numero',
  'selecao',
  'multipla_selecao',
  'data',
  'telefone',
  'email',
  'checkbox',
];

const TIPOS_REUNIAO: TipoReuniao[] = [
  'kickoff',
  'treinamento',
  'checkin_1',
  'checkin_2',
  'tira_duvidas',
  'reuniao_final',
  'extraordinaria',
];

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type HistoricoEvento = {
  id: string;
  acao: string;
  user_email: string | null;
  criado_em: string;
  detalhes: Record<string, unknown>;
};

export function TemplateDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();

  const [souAdministrador, setSouAdministrador] = useState(false);
  const [template, setTemplate] = useState<TemplateImplementacao | null>(null);
  const [atividades, setAtividades] = useState<TemplateAtividade[]>([]);
  const [reunioes, setReunioes] = useState<TemplateReuniao[]>([]);
  const [criterios, setCriterios] = useState<TemplateCriterio[]>([]);
  const [camposCrm, setCamposCrm] = useState<TemplateCampoCrm[]>([]);
  const [automacoes, setAutomacoes] = useState<TemplateAutomacao[]>([]);
  const [documentos, setDocumentos] = useState<TemplateDocumento[]>([]);
  const [historico, setHistorico] = useState<HistoricoEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('geral');

  const [formGeral, setFormGeral] = useState({
    nome: '',
    descricao: '',
    categoria: '',
    tags: '',
    observacoes_internas: '',
    duracao_total_dias: '',
  });
  const [salvandoGeral, setSalvandoGeral] = useState(false);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [
      { data: souAdmin },
      { data: templateData, error: templateError },
      { data: atividadesData },
      { data: reunioesData },
      { data: criteriosData },
      { data: camposCrmData },
      { data: automacoesData },
      { data: documentosData },
      { data: historicoData },
    ] = await Promise.all([
      supabase.rpc('sou_administrador'),
      supabase.from('templates_implementacao').select('*').eq('id', id).single(),
      supabase.from('template_atividades').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase.from('template_reunioes').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase.from('template_criterios').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase.from('template_campos_crm').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase.from('template_automacoes').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase.from('template_documentos').select('*').eq('template_id', id).order('ordem', { ascending: true }),
      supabase
        .from('auditoria_eventos')
        .select('id, acao, user_email, criado_em, detalhes')
        .eq('entidade', 'template_implementacao')
        .eq('entidade_id', id)
        .order('criado_em', { ascending: false })
        .limit(50),
    ]);

    setSouAdministrador(souAdmin === true);

    if (templateError || !templateData) {
      setError(templateError?.message ?? 'Template não encontrado.');
      setLoading(false);
      return;
    }

    setTemplate(templateData);
    setFormGeral({
      nome: templateData.nome,
      descricao: templateData.descricao ?? '',
      categoria: templateData.categoria ?? '',
      tags: (templateData.tags ?? []).join(', '),
      observacoes_internas: templateData.observacoes_internas ?? '',
      duracao_total_dias: templateData.duracao_total_dias != null ? String(templateData.duracao_total_dias) : '',
    });
    setAtividades(atividadesData ?? []);
    setReunioes(reunioesData ?? []);
    setCriterios(criteriosData ?? []);
    setCamposCrm(camposCrmData ?? []);
    setAutomacoes(automacoesData ?? []);
    setDocumentos(documentosData ?? []);
    setHistorico((historicoData ?? []) as HistoricoEvento[]);
    setLoading(false);
  }

  useEffect(() => {
    if (user) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function handleSalvarGeral(e: FormEvent) {
    e.preventDefault();
    if (!template) return;

    if (!formGeral.nome.trim()) {
      setError('Nome é obrigatório.');
      return;
    }

    setSalvandoGeral(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('templates_implementacao')
      .update({
        nome: formGeral.nome.trim(),
        descricao: formGeral.descricao.trim() || null,
        categoria: formGeral.categoria.trim() || null,
        tags: formGeral.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        observacoes_internas: formGeral.observacoes_internas.trim() || null,
        duracao_total_dias: formGeral.duracao_total_dias.trim() ? Number(formGeral.duracao_total_dias) : null,
        atualizado_por_email: user?.email ?? null,
      })
      .eq('id', template.id);

    setSalvandoGeral(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    mostrarToast('Template salvo.');
    carregar();
  }

  async function handleAlterarStatus(novoStatus: StatusTemplate) {
    if (!template) return;

    const confirmado = await confirmar({
      titulo: `Mudar o status para "${STATUS_TEMPLATE_LABELS[novoStatus]}"?`,
      descricao:
        novoStatus === 'ativo'
          ? 'A partir de agora este template pode ser escolhido ao iniciar novas implementações.'
          : novoStatus === 'arquivado'
            ? 'Templates arquivados deixam de aparecer para novas implementações, mas continuam no histórico e não afetam implementações que já o usaram.'
            : 'Templates em rascunho não podem ser aplicados em novas implementações.',
      confirmarLabel: 'Confirmar',
    });
    if (!confirmado) return;

    const { error: rpcError } = await supabase.rpc('alterar_status_template_implementacao', {
      p_template_id: template.id,
      p_novo_status: novoStatus,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    mostrarToast('Status atualizado.');
    carregar();
  }

  async function handleDuplicar() {
    if (!template) return;
    const novoNome = window.prompt('Nome do novo template:', `${template.nome} (cópia)`);
    if (novoNome === null) return;

    const { data, error: rpcError } = await supabase.rpc('duplicar_template_implementacao', {
      p_template_id: template.id,
      p_novo_nome: novoNome,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    mostrarToast('Template duplicado.');
    navigate(`/templates/${data}`);
  }

  async function handleCriarNovaVersao() {
    if (!template) return;

    const confirmado = await confirmar({
      titulo: `Criar a versão ${template.versao + 1} de "${template.nome}"?`,
      descricao:
        'Copia todo o conteúdo atual pra uma nova versão em rascunho. Esta versão (v' +
        template.versao +
        ') continua existindo, intacta, pro histórico — implementações que já a aplicaram não mudam.',
      confirmarLabel: 'Criar nova versão',
    });
    if (!confirmado) return;

    const { data, error: rpcError } = await supabase.rpc('criar_versao_template_implementacao', {
      p_template_id: template.id,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    mostrarToast('Nova versão criada.');
    navigate(`/templates/${data}`);
  }

  // ============================================================
  // Checklist (atividades)
  // ============================================================
  const [formAtividade, setFormAtividade] = useState<Partial<TemplateAtividade> | null>(null);

  function abrirNovaAtividade() {
    setFormAtividade({ titulo: '', obrigatorio: true, ordem: atividades.length });
  }

  async function handleSalvarAtividade(e: FormEvent) {
    e.preventDefault();
    if (!formAtividade || !template || !formAtividade.titulo?.trim()) return;

    const payload = {
      template_id: template.id,
      titulo: formAtividade.titulo.trim(),
      descricao: formAtividade.descricao?.trim() || null,
      ciclo: formAtividade.ciclo?.trim() || null,
      dia_recomendado: formAtividade.dia_recomendado ?? null,
      obrigatorio: formAtividade.obrigatorio ?? true,
      responsavel_padrao: formAtividade.responsavel_padrao?.trim() || null,
      categoria: formAtividade.categoria?.trim() || null,
      ordem: formAtividade.ordem ?? atividades.length,
      depende_de_atividade_id: formAtividade.depende_de_atividade_id || null,
    };

    const { error: salvarError } = formAtividade.id
      ? await supabase.from('template_atividades').update(payload).eq('id', formAtividade.id)
      : await supabase.from('template_atividades').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormAtividade(null);
    carregar();
  }

  async function handleExcluirAtividade(atividade: TemplateAtividade) {
    const confirmado = await confirmar({
      titulo: `Excluir a atividade "${atividade.titulo}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_atividades').delete().eq('id', atividade.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Atividade excluída.');
    carregar();
  }

  // ============================================================
  // Reuniões
  // ============================================================
  const [formReuniao, setFormReuniao] = useState<Partial<TemplateReuniao> | null>(null);

  function abrirNovaReuniao() {
    setFormReuniao({ tipo: 'kickoff', obrigatoria: true, ordem: reunioes.length, pauta_padrao: [] });
  }

  async function handleSalvarReuniao(e: FormEvent) {
    e.preventDefault();
    if (!formReuniao || !template || !formReuniao.tipo) return;

    const payload = {
      template_id: template.id,
      tipo: formReuniao.tipo,
      obrigatoria: formReuniao.obrigatoria ?? true,
      ciclo: formReuniao.ciclo?.trim() || null,
      dia_recomendado: formReuniao.dia_recomendado ?? null,
      duracao_sugerida_minutos: formReuniao.duracao_sugerida_minutos ?? null,
      objetivo: formReuniao.objetivo?.trim() || null,
      pauta_padrao: formReuniao.pauta_padrao ?? [],
      ordem: formReuniao.ordem ?? reunioes.length,
    };

    const { error: salvarError } = formReuniao.id
      ? await supabase.from('template_reunioes').update(payload).eq('id', formReuniao.id)
      : await supabase.from('template_reunioes').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormReuniao(null);
    carregar();
  }

  async function handleExcluirReuniao(reuniao: TemplateReuniao) {
    const confirmado = await confirmar({
      titulo: `Excluir "${TIPO_REUNIAO_LABELS[reuniao.tipo]}" deste template?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_reunioes').delete().eq('id', reuniao.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Reunião removida do template.');
    carregar();
  }

  // ============================================================
  // Critérios
  // ============================================================
  const [formCriterio, setFormCriterio] = useState<Partial<TemplateCriterio> | null>(null);

  function abrirNovoCriterio(tipo: TipoCriterioTemplate) {
    setFormCriterio({ tipo, titulo: '', obrigatorio: true, ordem: criterios.length });
  }

  async function handleSalvarCriterio(e: FormEvent) {
    e.preventDefault();
    if (!formCriterio || !template || !formCriterio.titulo?.trim() || !formCriterio.tipo) return;

    const payload = {
      template_id: template.id,
      tipo: formCriterio.tipo,
      titulo: formCriterio.titulo.trim(),
      descricao: formCriterio.descricao?.trim() || null,
      obrigatorio: formCriterio.obrigatorio ?? true,
      evidencia_esperada: formCriterio.evidencia_esperada?.trim() || null,
      categoria: formCriterio.categoria?.trim() || null,
      ordem: formCriterio.ordem ?? criterios.length,
    };

    const { error: salvarError } = formCriterio.id
      ? await supabase.from('template_criterios').update(payload).eq('id', formCriterio.id)
      : await supabase.from('template_criterios').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormCriterio(null);
    carregar();
  }

  async function handleExcluirCriterio(criterio: TemplateCriterio) {
    const confirmado = await confirmar({
      titulo: `Excluir o critério "${criterio.titulo}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_criterios').delete().eq('id', criterio.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Critério excluído.');
    carregar();
  }

  // ============================================================
  // Campos CRM recomendados — só conteúdo de referência (seção 13 do
  // pedido): nunca criados automaticamente no Kommo, o consultor configura
  // manualmente a partir daqui. Por isso não têm "status" por implementação,
  // só são lidos direto do template aplicado (ver ImplementacaoDetalhe.tsx).
  // ============================================================
  const [formCampoCrm, setFormCampoCrm] = useState<Partial<TemplateCampoCrm> | null>(null);

  function abrirNovoCampoCrm() {
    setFormCampoCrm({ tipo: 'texto', nome: '', entidade: 'Lead', obrigatorio: false, ordem: camposCrm.length });
  }

  async function handleSalvarCampoCrm(e: FormEvent) {
    e.preventDefault();
    if (!formCampoCrm || !template || !formCampoCrm.nome?.trim() || !formCampoCrm.tipo || !formCampoCrm.entidade?.trim())
      return;

    const payload = {
      template_id: template.id,
      nome: formCampoCrm.nome.trim(),
      tipo: formCampoCrm.tipo,
      entidade: formCampoCrm.entidade.trim(),
      obrigatorio: formCampoCrm.obrigatorio ?? false,
      descricao: formCampoCrm.descricao?.trim() || null,
      quando_usar: formCampoCrm.quando_usar?.trim() || null,
      ordem: formCampoCrm.ordem ?? camposCrm.length,
    };

    const { error: salvarError } = formCampoCrm.id
      ? await supabase.from('template_campos_crm').update(payload).eq('id', formCampoCrm.id)
      : await supabase.from('template_campos_crm').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormCampoCrm(null);
    carregar();
  }

  async function handleExcluirCampoCrm(campo: TemplateCampoCrm) {
    const confirmado = await confirmar({
      titulo: `Excluir o campo "${campo.nome}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_campos_crm').delete().eq('id', campo.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Campo excluído.');
    carregar();
  }

  // ============================================================
  // Automações sugeridas — mesma lógica dos campos CRM: só referência,
  // nunca implantadas automaticamente no Kommo (seção 14 do pedido).
  // ============================================================
  const [formAutomacao, setFormAutomacao] = useState<Partial<TemplateAutomacao> | null>(null);

  function abrirNovaAutomacao() {
    setFormAutomacao({ nome: '', ordem: automacoes.length });
  }

  async function handleSalvarAutomacao(e: FormEvent) {
    e.preventDefault();
    if (!formAutomacao || !template || !formAutomacao.nome?.trim()) return;

    const payload = {
      template_id: template.id,
      nome: formAutomacao.nome.trim(),
      objetivo: formAutomacao.objetivo?.trim() || null,
      gatilho: formAutomacao.gatilho?.trim() || null,
      condicao: formAutomacao.condicao?.trim() || null,
      acao: formAutomacao.acao?.trim() || null,
      observacoes: formAutomacao.observacoes?.trim() || null,
      ordem: formAutomacao.ordem ?? automacoes.length,
    };

    const { error: salvarError } = formAutomacao.id
      ? await supabase.from('template_automacoes').update(payload).eq('id', formAutomacao.id)
      : await supabase.from('template_automacoes').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormAutomacao(null);
    carregar();
  }

  async function handleExcluirAutomacao(automacao: TemplateAutomacao) {
    const confirmado = await confirmar({
      titulo: `Excluir a automação "${automacao.nome}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_automacoes').delete().eq('id', automacao.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Automação excluída.');
    carregar();
  }

  // ============================================================
  // Documentos esperados — têm estado real por cliente (entregue ou não),
  // por isso SÃO clonados por implementação ao aplicar o template.
  // ============================================================
  const [formDocumento, setFormDocumento] = useState<Partial<TemplateDocumento> | null>(null);

  function abrirNovoDocumento() {
    setFormDocumento({ nome: '', obrigatorio: true, ordem: documentos.length });
  }

  async function handleSalvarDocumento(e: FormEvent) {
    e.preventDefault();
    if (!formDocumento || !template || !formDocumento.nome?.trim()) return;

    const payload = {
      template_id: template.id,
      nome: formDocumento.nome.trim(),
      obrigatorio: formDocumento.obrigatorio ?? true,
      fase: formDocumento.fase?.trim() || null,
      descricao: formDocumento.descricao?.trim() || null,
      ordem: formDocumento.ordem ?? documentos.length,
    };

    const { error: salvarError } = formDocumento.id
      ? await supabase.from('template_documentos').update(payload).eq('id', formDocumento.id)
      : await supabase.from('template_documentos').insert(payload);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setFormDocumento(null);
    carregar();
  }

  async function handleExcluirDocumento(documento: TemplateDocumento) {
    const confirmado = await confirmar({
      titulo: `Excluir o documento "${documento.nome}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('template_documentos').delete().eq('id', documento.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    mostrarToast('Documento excluído.');
    carregar();
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="page">
        <p className="form-error">{error ?? 'Template não encontrado.'}</p>
      </div>
    );
  }

  const criteriosEntrega = criterios.filter((c) => c.tipo === 'entrega');
  const criteriosAdocao = criterios.filter((c) => c.tipo === 'adocao');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {template.nome} <span className="field-hint">v{template.versao}</span>
          </h1>
          <p className="field-hint">
            <span className={`status-badge status-tone-${STATUS_TEMPLATE_TONE[template.status]}`}>
              {STATUS_TEMPLATE_LABELS[template.status]}
            </span>{' '}
            · Atualizado em {formatarDataHora(template.updated_at)}
            {template.atualizado_por_email ? ` por ${template.atualizado_por_email}` : ''}
          </p>
        </div>
        {souAdministrador && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDuplicar}>
              Duplicar
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleCriarNovaVersao}>
              Criar nova versão
            </button>
            {template.status !== 'ativo' && (
              <button type="button" className="btn btn-primary" onClick={() => handleAlterarStatus('ativo')}>
                Ativar
              </button>
            )}
            {template.status !== 'arquivado' && (
              <button type="button" className="btn btn-secondary" onClick={() => handleAlterarStatus('arquivado')}>
                Arquivar
              </button>
            )}
            {template.status === 'arquivado' && (
              <button type="button" className="btn btn-secondary" onClick={() => handleAlterarStatus('rascunho')}>
                Voltar a rascunho
              </button>
            )}
          </div>
        )}
      </div>

      {!souAdministrador && (
        <p className="field-hint">Você pode visualizar este template, mas só administradores podem alterá-lo.</p>
      )}
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {ABAS.map((a) => (
          <button
            type="button"
            key={a.valor}
            className={`tab-button${aba === a.valor ? ' active' : ''}`}
            onClick={() => setAba(a.valor)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'geral' && (
        <form onSubmit={handleSalvarGeral} className="card form-card">
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              required
              value={formGeral.nome}
              disabled={!souAdministrador}
              onChange={(e) => setFormGeral({ ...formGeral, nome: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea
              rows={2}
              value={formGeral.descricao}
              disabled={!souAdministrador}
              onChange={(e) => setFormGeral({ ...formGeral, descricao: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Categoria</span>
              <input
                type="text"
                placeholder="Ex: Varejo, Serviços, Assinatura…"
                value={formGeral.categoria}
                disabled={!souAdministrador}
                onChange={(e) => setFormGeral({ ...formGeral, categoria: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Duração padrão (dias, opcional)</span>
              <input
                type="number"
                min={1}
                value={formGeral.duracao_total_dias}
                disabled={!souAdministrador}
                onChange={(e) => setFormGeral({ ...formGeral, duracao_total_dias: e.target.value })}
              />
              <span className="field-hint">
                Só organiza o checklist deste template — quem define o cronograma de verdade da implementação
                continua sendo a Configuração global e o snapshot do cliente no Kickoff.
              </span>
            </label>
          </div>
          <label className="field">
            <span>Tags (separadas por vírgula)</span>
            <input
              type="text"
              value={formGeral.tags}
              disabled={!souAdministrador}
              onChange={(e) => setFormGeral({ ...formGeral, tags: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Observações internas</span>
            <textarea
              rows={2}
              value={formGeral.observacoes_internas}
              disabled={!souAdministrador}
              onChange={(e) => setFormGeral({ ...formGeral, observacoes_internas: e.target.value })}
            />
            <span className="field-hint">Visível só pra equipe interna, nunca aparece pro cliente.</span>
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvandoGeral}>
                {salvandoGeral ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'checklist' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Checklist</h2>
            {souAdministrador && !formAtividade && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovaAtividade}>
                + Nova atividade
              </button>
            )}
          </div>

          {atividades.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma atividade cadastrada ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Ciclo</th>
                    <th>Dia</th>
                    <th>Obrigatória</th>
                    <th>Responsável padrão</th>
                    <th>Depende de</th>
                    {souAdministrador && <th />}
                  </tr>
                </thead>
                <tbody>
                  {atividades.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Título">{a.titulo}</td>
                      <td data-label="Ciclo">{a.ciclo ?? '—'}</td>
                      <td data-label="Dia">{a.dia_recomendado ?? '—'}</td>
                      <td data-label="Obrigatória">{a.obrigatorio ? 'Sim' : 'Não'}</td>
                      <td data-label="Responsável padrão">{a.responsavel_padrao ?? '—'}</td>
                      <td data-label="Depende de">
                        {atividades.find((x) => x.id === a.depende_de_atividade_id)?.titulo ?? '—'}
                      </td>
                      {souAdministrador && (
                        <td className="table-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setFormAtividade(a)}>
                            Editar
                          </button>{' '}
                          <button type="button" className="btn btn-danger" onClick={() => handleExcluirAtividade(a)}>
                            Excluir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formAtividade && (
            <form onSubmit={handleSalvarAtividade} className="card form-card">
              <h3>{formAtividade.id ? 'Editar atividade' : 'Nova atividade'}</h3>
              <label className="field">
                <span>Título</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formAtividade.titulo ?? ''}
                  onChange={(e) => setFormAtividade({ ...formAtividade, titulo: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Descrição</span>
                <textarea
                  rows={2}
                  value={formAtividade.descricao ?? ''}
                  onChange={(e) => setFormAtividade({ ...formAtividade, descricao: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Ciclo (texto livre, ex: "Ciclo 1")</span>
                  <input
                    type="text"
                    value={formAtividade.ciclo ?? ''}
                    onChange={(e) => setFormAtividade({ ...formAtividade, ciclo: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Dia recomendado (opcional)</span>
                  <input
                    type="number"
                    min={1}
                    value={formAtividade.dia_recomendado ?? ''}
                    onChange={(e) =>
                      setFormAtividade({
                        ...formAtividade,
                        dia_recomendado: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Responsável padrão (texto livre)</span>
                  <input
                    type="text"
                    value={formAtividade.responsavel_padrao ?? ''}
                    onChange={(e) => setFormAtividade({ ...formAtividade, responsavel_padrao: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Categoria (opcional)</span>
                  <input
                    type="text"
                    value={formAtividade.categoria ?? ''}
                    onChange={(e) => setFormAtividade({ ...formAtividade, categoria: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Depende de (opcional)</span>
                <select
                  value={formAtividade.depende_de_atividade_id ?? ''}
                  onChange={(e) =>
                    setFormAtividade({ ...formAtividade, depende_de_atividade_id: e.target.value || null })
                  }
                >
                  <option value="">Sem dependência</option>
                  {atividades
                    .filter((a) => a.id !== formAtividade.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.titulo}
                      </option>
                    ))}
                </select>
                <span className="field-hint">
                  Só orienta a ordem lógica do template — não bloqueia automaticamente o checklist da implementação
                  nesta versão.
                </span>
              </label>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formAtividade.obrigatorio ?? true}
                  onChange={(e) => setFormAtividade({ ...formAtividade, obrigatorio: e.target.checked })}
                />
                <span>Obrigatória</span>
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormAtividade(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'reunioes' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Reuniões esperadas</h2>
            {souAdministrador && !formReuniao && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovaReuniao}>
                + Nova reunião
              </button>
            )}
          </div>
          <p className="field-hint">
            Só a expectativa operacional — aplicar o template nunca agenda uma reunião real. O consultor agenda de
            verdade no módulo de Reuniões, quando fizer sentido.
          </p>

          {reunioes.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma reunião cadastrada ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Obrigatória</th>
                    <th>Ciclo</th>
                    <th>Dia</th>
                    <th>Duração</th>
                    {souAdministrador && <th />}
                  </tr>
                </thead>
                <tbody>
                  {reunioes.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Tipo">{TIPO_REUNIAO_LABELS[r.tipo]}</td>
                      <td data-label="Obrigatória">{r.obrigatoria ? 'Sim' : 'Não'}</td>
                      <td data-label="Ciclo">{r.ciclo ?? '—'}</td>
                      <td data-label="Dia">{r.dia_recomendado ?? '—'}</td>
                      <td data-label="Duração">{r.duracao_sugerida_minutos ? `${r.duracao_sugerida_minutos}min` : '—'}</td>
                      {souAdministrador && (
                        <td className="table-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setFormReuniao(r)}>
                            Editar
                          </button>{' '}
                          <button type="button" className="btn btn-danger" onClick={() => handleExcluirReuniao(r)}>
                            Excluir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formReuniao && (
            <form onSubmit={handleSalvarReuniao} className="card form-card">
              <h3>{formReuniao.id ? 'Editar reunião' : 'Nova reunião'}</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Tipo</span>
                  <select
                    required
                    value={formReuniao.tipo ?? 'kickoff'}
                    onChange={(e) => setFormReuniao({ ...formReuniao, tipo: e.target.value as TipoReuniao })}
                  >
                    {TIPOS_REUNIAO.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_REUNIAO_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Ciclo (texto livre)</span>
                  <input
                    type="text"
                    value={formReuniao.ciclo ?? ''}
                    onChange={(e) => setFormReuniao({ ...formReuniao, ciclo: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Dia recomendado (opcional)</span>
                  <input
                    type="number"
                    min={1}
                    value={formReuniao.dia_recomendado ?? ''}
                    onChange={(e) =>
                      setFormReuniao({
                        ...formReuniao,
                        dia_recomendado: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Duração sugerida (minutos, opcional)</span>
                  <input
                    type="number"
                    min={1}
                    value={formReuniao.duracao_sugerida_minutos ?? ''}
                    onChange={(e) =>
                      setFormReuniao({
                        ...formReuniao,
                        duracao_sugerida_minutos: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>Objetivo</span>
                <textarea
                  rows={2}
                  value={formReuniao.objetivo ?? ''}
                  onChange={(e) => setFormReuniao({ ...formReuniao, objetivo: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Pauta padrão (um item por linha)</span>
                <textarea
                  rows={4}
                  value={(formReuniao.pauta_padrao ?? []).join('\n')}
                  onChange={(e) =>
                    setFormReuniao({
                      ...formReuniao,
                      pauta_padrao: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                    })
                  }
                />
                <span className="field-hint">O consultor pode editar a pauta na reunião real.</span>
              </label>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formReuniao.obrigatoria ?? true}
                  onChange={(e) => setFormReuniao({ ...formReuniao, obrigatoria: e.target.checked })}
                />
                <span>Obrigatória</span>
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormReuniao(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'criterios' && (
        <>
          {(['entrega', 'adocao'] as TipoCriterioTemplate[]).map((tipo) => {
            const lista = tipo === 'entrega' ? criteriosEntrega : criteriosAdocao;
            return (
              <section className="card form-card" key={tipo} style={{ marginBottom: 16 }}>
                <div className="page-header-actions page-header-actions-split">
                  <h2 style={{ marginBottom: 0 }}>Critérios de {TIPO_CRITERIO_TEMPLATE_LABELS[tipo]}</h2>
                  {souAdministrador && !formCriterio && (
                    <button type="button" className="btn btn-secondary btn-auto" onClick={() => abrirNovoCriterio(tipo)}>
                      + Novo critério
                    </button>
                  )}
                </div>
                {tipo === 'adocao' && (
                  <p className="field-hint">
                    Avaliados depois da entrega técnica — nunca bloqueiam a conclusão técnica da implementação.
                  </p>
                )}

                {lista.length === 0 ? (
                  <div className="empty-state">
                    <p>Nenhum critério de {TIPO_CRITERIO_TEMPLATE_LABELS[tipo].toLowerCase()} cadastrado ainda.</p>
                  </div>
                ) : (
                  <ul className="observacoes-lista">
                    {lista.map((c) => (
                      <li key={c.id} className="observacao-item">
                        <div className="observacao-item-header">
                          <strong>{c.titulo}</strong>
                          {souAdministrador && (
                            <span>
                              <button type="button" className="btn btn-secondary btn-auto" onClick={() => setFormCriterio(c)}>
                                Editar
                              </button>{' '}
                              <button type="button" className="btn btn-danger btn-auto" onClick={() => handleExcluirCriterio(c)}>
                                Excluir
                              </button>
                            </span>
                          )}
                        </div>
                        {c.descricao && <p className="field-hint">{c.descricao}</p>}
                        <p className="field-hint">
                          {c.obrigatorio ? 'Obrigatório' : 'Quando aplicável'}
                          {c.evidencia_esperada ? ` · Evidência: ${c.evidencia_esperada}` : ''}
                          {c.categoria ? ` · ${c.categoria}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {formCriterio && (
            <form onSubmit={handleSalvarCriterio} className="card form-card">
              <h3>{formCriterio.id ? 'Editar critério' : `Novo critério de ${TIPO_CRITERIO_TEMPLATE_LABELS[formCriterio.tipo!]}`}</h3>
              <label className="field">
                <span>Título</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formCriterio.titulo ?? ''}
                  onChange={(e) => setFormCriterio({ ...formCriterio, titulo: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Descrição</span>
                <textarea
                  rows={2}
                  value={formCriterio.descricao ?? ''}
                  onChange={(e) => setFormCriterio({ ...formCriterio, descricao: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Evidência esperada</span>
                  <input
                    type="text"
                    value={formCriterio.evidencia_esperada ?? ''}
                    onChange={(e) => setFormCriterio({ ...formCriterio, evidencia_esperada: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Categoria (opcional)</span>
                  <input
                    type="text"
                    value={formCriterio.categoria ?? ''}
                    onChange={(e) => setFormCriterio({ ...formCriterio, categoria: e.target.value })}
                  />
                </label>
              </div>
              {formCriterio.tipo === 'entrega' && (
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={formCriterio.obrigatorio ?? true}
                    onChange={(e) => setFormCriterio({ ...formCriterio, obrigatorio: e.target.checked })}
                  />
                  <span>Obrigatório</span>
                </label>
              )}
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormCriterio(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {aba === 'campos_crm' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Campos CRM recomendados</h2>
            {souAdministrador && !formCampoCrm && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovoCampoCrm}>
                + Novo campo
              </button>
            )}
          </div>
          <p className="field-hint">
            Só referência — nenhum campo é criado automaticamente no Kommo. O consultor revisa e configura
            manualmente ao aplicar o template.
          </p>

          {camposCrm.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum campo cadastrado ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Entidade</th>
                    <th>Tipo</th>
                    <th>Obrigatório</th>
                    <th>Quando usar</th>
                    {souAdministrador && <th />}
                  </tr>
                </thead>
                <tbody>
                  {camposCrm.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Nome">{c.nome}</td>
                      <td data-label="Entidade">{c.entidade}</td>
                      <td data-label="Tipo">{TIPO_CAMPO_CRM_LABELS[c.tipo]}</td>
                      <td data-label="Obrigatório">{c.obrigatorio ? 'Sim' : 'Não'}</td>
                      <td data-label="Quando usar">{c.quando_usar ?? '—'}</td>
                      {souAdministrador && (
                        <td className="table-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setFormCampoCrm(c)}>
                            Editar
                          </button>{' '}
                          <button type="button" className="btn btn-danger" onClick={() => handleExcluirCampoCrm(c)}>
                            Excluir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formCampoCrm && (
            <form onSubmit={handleSalvarCampoCrm} className="card form-card">
              <h3>{formCampoCrm.id ? 'Editar campo' : 'Novo campo'}</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Nome</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={formCampoCrm.nome ?? ''}
                    onChange={(e) => setFormCampoCrm({ ...formCampoCrm, nome: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Entidade (ex: Lead, Contato, Empresa)</span>
                  <input
                    type="text"
                    required
                    value={formCampoCrm.entidade ?? ''}
                    onChange={(e) => setFormCampoCrm({ ...formCampoCrm, entidade: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Tipo</span>
                <select
                  required
                  value={formCampoCrm.tipo ?? 'texto'}
                  onChange={(e) => setFormCampoCrm({ ...formCampoCrm, tipo: e.target.value as TipoCampoCrm })}
                >
                  {TIPOS_CAMPO_CRM.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_CAMPO_CRM_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Descrição</span>
                <textarea
                  rows={2}
                  value={formCampoCrm.descricao ?? ''}
                  onChange={(e) => setFormCampoCrm({ ...formCampoCrm, descricao: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Quando usar</span>
                <textarea
                  rows={2}
                  value={formCampoCrm.quando_usar ?? ''}
                  onChange={(e) => setFormCampoCrm({ ...formCampoCrm, quando_usar: e.target.value })}
                />
              </label>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formCampoCrm.obrigatorio ?? false}
                  onChange={(e) => setFormCampoCrm({ ...formCampoCrm, obrigatorio: e.target.checked })}
                />
                <span>Obrigatório</span>
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormCampoCrm(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'automacoes' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Automações sugeridas</h2>
            {souAdministrador && !formAutomacao && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovaAutomacao}>
                + Nova automação
              </button>
            )}
          </div>
          <p className="field-hint">
            Modelos pra revisão — nenhuma automação é implantada automaticamente no Kommo.
          </p>

          {automacoes.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma automação cadastrada ainda.</p>
            </div>
          ) : (
            <ul className="observacoes-lista">
              {automacoes.map((a) => (
                <li key={a.id} className="observacao-item">
                  <div className="observacao-item-header">
                    <strong>{a.nome}</strong>
                    {souAdministrador && (
                      <span>
                        <button type="button" className="btn btn-secondary btn-auto" onClick={() => setFormAutomacao(a)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-auto" onClick={() => handleExcluirAutomacao(a)}>
                          Excluir
                        </button>
                      </span>
                    )}
                  </div>
                  {a.objetivo && <p className="field-hint">{a.objetivo}</p>}
                  <p className="field-hint">
                    {a.gatilho ? `Gatilho: ${a.gatilho}` : ''}
                    {a.condicao ? ` · Condição: ${a.condicao}` : ''}
                    {a.acao ? ` · Ação: ${a.acao}` : ''}
                  </p>
                  {a.observacoes && <p className="field-hint">{a.observacoes}</p>}
                </li>
              ))}
            </ul>
          )}

          {formAutomacao && (
            <form onSubmit={handleSalvarAutomacao} className="card form-card">
              <h3>{formAutomacao.id ? 'Editar automação' : 'Nova automação'}</h3>
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formAutomacao.nome ?? ''}
                  onChange={(e) => setFormAutomacao({ ...formAutomacao, nome: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Objetivo</span>
                <textarea
                  rows={2}
                  value={formAutomacao.objetivo ?? ''}
                  onChange={(e) => setFormAutomacao({ ...formAutomacao, objetivo: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Gatilho</span>
                  <input
                    type="text"
                    value={formAutomacao.gatilho ?? ''}
                    onChange={(e) => setFormAutomacao({ ...formAutomacao, gatilho: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Condição</span>
                  <input
                    type="text"
                    value={formAutomacao.condicao ?? ''}
                    onChange={(e) => setFormAutomacao({ ...formAutomacao, condicao: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Ação</span>
                <input
                  type="text"
                  value={formAutomacao.acao ?? ''}
                  onChange={(e) => setFormAutomacao({ ...formAutomacao, acao: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Observações</span>
                <textarea
                  rows={2}
                  value={formAutomacao.observacoes ?? ''}
                  onChange={(e) => setFormAutomacao({ ...formAutomacao, observacoes: e.target.value })}
                />
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormAutomacao(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'documentos' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Documentos esperados</h2>
            {souAdministrador && !formDocumento && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovoDocumento}>
                + Novo documento
              </button>
            )}
          </div>
          <p className="field-hint">
            Ao aplicar o template, cada documento vira um item rastreável (entregue ou não) nesta implementação.
          </p>

          {documentos.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum documento cadastrado ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Fase</th>
                    <th>Obrigatório</th>
                    {souAdministrador && <th />}
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Nome">{d.nome}</td>
                      <td data-label="Fase">{d.fase ?? '—'}</td>
                      <td data-label="Obrigatório">{d.obrigatorio ? 'Sim' : 'Não'}</td>
                      {souAdministrador && (
                        <td className="table-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setFormDocumento(d)}>
                            Editar
                          </button>{' '}
                          <button type="button" className="btn btn-danger" onClick={() => handleExcluirDocumento(d)}>
                            Excluir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formDocumento && (
            <form onSubmit={handleSalvarDocumento} className="card form-card">
              <h3>{formDocumento.id ? 'Editar documento' : 'Novo documento'}</h3>
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formDocumento.nome ?? ''}
                  onChange={(e) => setFormDocumento({ ...formDocumento, nome: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Fase (opcional)</span>
                <input
                  type="text"
                  value={formDocumento.fase ?? ''}
                  onChange={(e) => setFormDocumento({ ...formDocumento, fase: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Descrição</span>
                <textarea
                  rows={2}
                  value={formDocumento.descricao ?? ''}
                  onChange={(e) => setFormDocumento({ ...formDocumento, descricao: e.target.value })}
                />
              </label>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formDocumento.obrigatorio ?? true}
                  onChange={(e) => setFormDocumento({ ...formDocumento, obrigatorio: e.target.checked })}
                />
                <span>Obrigatório</span>
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormDocumento(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'historico' && (
        <section className="card">
          <h2>Histórico</h2>
          {historico.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum evento registrado ainda para esta versão.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Ação</th>
                    <th>Usuário</th>
                    <th>Data/hora</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Ação">{h.acao}</td>
                      <td data-label="Usuário">{h.user_email ?? '—'}</td>
                      <td data-label="Data/hora">{formatarDataHora(h.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
