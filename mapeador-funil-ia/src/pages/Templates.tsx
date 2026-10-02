// Módulo de Templates de Implementação (núcleo, Fase 1) — lista com
// busca/filtro. Consultores só visualizam; só administradores criam,
// editam, versionam, duplicam e arquivam (RLS garante isso no backend,
// este frontend só reflete).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_TEMPLATE_LABELS, STATUS_TEMPLATE_TONE } from '../lib/templatesImplementacao';
import { supabase } from '../lib/supabaseClient';
import type { StatusTemplate, TemplateImplementacao } from '../types/database';

type TemplateComContagens = TemplateImplementacao & {
  qtdAtividades: number;
  qtdReunioes: number;
  qtdCriterios: number;
  qtdUsos: number;
};

type Ordenacao = 'nome' | 'atualizacao' | 'uso';

export function Templates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [templates, setTemplates] = useState<TemplateComContagens[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusTemplate | ''>('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('atualizacao');

  async function carregar() {
    setLoading(true);
    setError(null);

    const [{ data: souAdmin }, { data: templatesData, error: templatesError }] = await Promise.all([
      supabase.rpc('sou_administrador'),
      supabase.from('templates_implementacao').select('*').order('updated_at', { ascending: false }),
    ]);

    setSouAdministrador(souAdmin === true);

    if (templatesError) {
      setError(templatesError.message);
      setLoading(false);
      return;
    }

    const lista = templatesData ?? [];
    const ids = lista.map((t) => t.id);

    const [{ data: atividades }, { data: reunioes }, { data: criterios }, { data: usos }] = await Promise.all([
      ids.length
        ? supabase.from('template_atividades').select('template_id').in('template_id', ids)
        : Promise.resolve({ data: [] as { template_id: string }[] }),
      ids.length
        ? supabase.from('template_reunioes').select('template_id').in('template_id', ids)
        : Promise.resolve({ data: [] as { template_id: string }[] }),
      ids.length
        ? supabase.from('template_criterios').select('template_id').in('template_id', ids)
        : Promise.resolve({ data: [] as { template_id: string }[] }),
      ids.length
        ? supabase.from('implementacoes_crm').select('template_aplicado_id').in('template_aplicado_id', ids)
        : Promise.resolve({ data: [] as { template_aplicado_id: string | null }[] }),
    ]);

    function contar<T extends Record<string, unknown>>(rows: T[] | null, campo: keyof T, id: string): number {
      return (rows ?? []).filter((r) => r[campo] === id).length;
    }

    setTemplates(
      lista.map((t) => ({
        ...t,
        qtdAtividades: contar(atividades, 'template_id', t.id),
        qtdReunioes: contar(reunioes, 'template_id', t.id),
        qtdCriterios: contar(criterios, 'template_id', t.id),
        qtdUsos: contar(usos, 'template_aplicado_id', t.id),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    if (user) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const categorias = useMemo(
    () => Array.from(new Set(templates.map((t) => t.categoria).filter((c): c is string => !!c))).sort(),
    [templates],
  );

  const templatesFiltrados = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    let lista = templates.filter((t) => {
      if (filtroStatus && t.status !== filtroStatus) return false;
      if (filtroCategoria && t.categoria !== filtroCategoria) return false;
      if (buscaNormalizada && !t.nome.toLowerCase().includes(buscaNormalizada)) return false;
      return true;
    });

    lista = [...lista].sort((a, b) => {
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome);
      if (ordenacao === 'uso') return b.qtdUsos - a.qtdUsos;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return lista;
  }, [templates, busca, filtroStatus, filtroCategoria, ordenacao]);

  async function handleNovoTemplate() {
    const { data, error: insertError } = await supabase
      .from('templates_implementacao')
      .insert({ nome: 'Novo template', status: 'rascunho' })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    navigate(`/templates/${data.id}`);
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Templates de Implementação</h1>
          <p className="field-hint">
            Modelos reutilizáveis de estrutura operacional (checklist, reuniões esperadas, critérios) — o funil de
            vendas do cliente continua sendo gerado por IA a partir do formulário, nunca pelo template.
          </p>
        </div>
        {souAdministrador && (
          <button type="button" className="btn btn-primary" onClick={handleNovoTemplate}>
            + Novo template
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-grid" style={{ marginBottom: 20 }}>
        <label className="field">
          <span>Buscar por nome</span>
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: CRM Padrão" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusTemplate | '')}>
            <option value="">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="ativo">Ativo</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </label>
        <label className="field">
          <span>Categoria</span>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ordenar por</span>
          <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}>
            <option value="atualizacao">Atualização mais recente</option>
            <option value="nome">Nome</option>
            <option value="uso">Mais usados</option>
          </select>
        </label>
      </div>

      {templatesFiltrados.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum template encontrado.</p>
          <p className="field-hint">
            {templates.length === 0
              ? 'Ainda não existe nenhum template cadastrado.'
              : 'Tente ajustar a busca ou os filtros.'}
          </p>
        </div>
      ) : (
        <div className="templates-grid">
          {templatesFiltrados.map((t) => (
            <button
              type="button"
              key={t.id}
              className="card template-card"
              onClick={() => navigate(`/templates/${t.id}`)}
            >
              <div className="page-header-actions page-header-actions-split">
                <h2 style={{ marginBottom: 0 }}>{t.nome}</h2>
                <span className={`status-badge status-tone-${STATUS_TEMPLATE_TONE[t.status]}`}>
                  {STATUS_TEMPLATE_LABELS[t.status]}
                </span>
              </div>
              {t.descricao && <p className="field-hint">{t.descricao}</p>}
              <p className="field-hint">
                {t.categoria ? `${t.categoria} · ` : ''}v{t.versao}
              </p>
              <p className="field-hint">
                {t.qtdAtividades} atividade(s) · {t.qtdReunioes} reunião(ões) · {t.qtdCriterios} critério(s)
              </p>
              <p className="field-hint">Usado em {t.qtdUsos} implementação(ões)</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
