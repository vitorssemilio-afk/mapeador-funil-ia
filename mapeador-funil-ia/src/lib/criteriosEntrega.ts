// Critérios de Entrega — "a implementação foi corretamente entregue?" —
// separados dos Indicadores de Adoção (checkpoints_adocao) e do status
// comercial de contratação do Kommo (implementacoes_crm.status_contratacao_kommo).
// Nenhum dos três deve se misturar: contratar o plano pago, abandonar
// planilhas, usar relatórios com frequência ou o resultado do Checkpoint 30
// dias nunca contam como critério técnico de entrega.
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  CriterioEntrega,
  CriterioEntregaStatus,
  StatusContratacaoKommo,
  StatusCriterioEntrega,
} from '../types/database';

export const STATUS_CRITERIO_LABELS: Record<StatusCriterioEntrega, string> = {
  pendente: 'Pendente',
  em_validacao: 'Em validação',
  concluido: 'Concluído',
  nao_se_aplica: 'Não se aplica',
};

export const STATUS_CRITERIO_TONE: Record<StatusCriterioEntrega, 'warning' | 'info' | 'success' | 'danger'> = {
  pendente: 'warning',
  em_validacao: 'info',
  concluido: 'success',
  nao_se_aplica: 'danger',
};

export const STATUS_CONTRATACAO_KOMMO_LABELS: Record<StatusContratacaoKommo, string> = {
  contratado: 'Contratado',
  em_decisao: 'Em decisão',
  nao_contratado: 'Não contratado',
};

export const STATUS_CONTRATACAO_KOMMO_TONE: Record<StatusContratacaoKommo, 'success' | 'warning' | 'danger'> = {
  contratado: 'success',
  em_decisao: 'warning',
  nao_contratado: 'danger',
};

export type ResumoCriteriosEntrega = {
  // Total considerado no indicador "X/Y" — exclui os marcados "não se
  // aplica" do denominador, senão um critério opcional puxaria o indicador
  // pra baixo sem nenhuma ação possível do time.
  concluidos: number;
  total: number;
  // true só quando TODO critério obrigatório está 'concluido' ou
  // 'nao_se_aplica' (com justificativa) — os não-obrigatórios não bloqueiam.
  todosObrigatoriosAtendidos: boolean;
};

// Prompt 64, Bloco 4 (seções 23-29) — "Prontidão para Entrega": reaproveita
// confirmações já existentes em vez de pedir pro consultor preencher tudo de
// novo. Um critério só é manual de verdade quando NADA no sistema já prova
// aquilo — a maioria tem uma atividade-gêmea no checklist (requer_evidencia
// quando precisa de teste real, não só uma caixinha marcada) ou um marco do
// cliente (ex: treinamento realizado).
export type OrigemCriterio = 'manual' | 'automatico' | 'nao_aplicavel_condicional';

export type CriterioEfetivo = {
  status: StatusCriterioEntrega;
  evidencia: string | null;
  observacao: string | null;
  dataValidacaoIso: string | null;
  responsavelValidacaoId: string | null;
  origem: OrigemCriterio;
  // true = existe uma linha salva em criterios_entrega_status pra este
  // critério — o consultor já tomou uma decisão explícita aqui (controla se
  // a UI oferece "Validar" ou "Editar").
  temDecisaoManual: boolean;
};

// Só canais_funcionando por ora (depende do escopo de canal do cliente,
// Blocos 1/3) — um switch de um caso só não compensa virar coluna genérica
// de "regra de aplicabilidade" no banco.
function aplicavelAoCliente(criterio: CriterioEntrega, cliente: Cliente | null): boolean {
  if (criterio.chave === 'canais_funcionando' && cliente) {
    return cliente.canal_whatsapp_business !== false || cliente.canal_instagram !== false;
  }
  return true;
}

const CRITERIO_EFETIVO_PENDENTE: Pick<
  CriterioEfetivo,
  'status' | 'evidencia' | 'observacao' | 'dataValidacaoIso' | 'responsavelValidacaoId'
> = { status: 'pendente', evidencia: null, observacao: null, dataValidacaoIso: null, responsavelValidacaoId: null };

export function resolverCriterioEfetivo(params: {
  criterio: CriterioEntrega;
  statusRow: CriterioEntregaStatus | null;
  cliente: Cliente | null;
  atividadesTemplate: AtividadeCronograma[];
  atividadesStatus: AtividadeStatusRow[];
  implementacaoId: string;
}): CriterioEfetivo {
  const { criterio, statusRow, cliente, atividadesTemplate, atividadesStatus, implementacaoId } = params;

  // Decisão manual já registrada sempre vence — é uma escolha consciente do
  // consultor (inclusive uma correção por cima de uma fonte automática).
  if (statusRow) {
    return {
      status: statusRow.status,
      evidencia: statusRow.evidencia,
      observacao: statusRow.observacao,
      dataValidacaoIso: statusRow.data_validacao,
      responsavelValidacaoId: statusRow.responsavel_validacao_id,
      origem: 'manual',
      temDecisaoManual: true,
    };
  }

  if (!aplicavelAoCliente(criterio, cliente)) {
    return { ...CRITERIO_EFETIVO_PENDENTE, status: 'nao_se_aplica', origem: 'nao_aplicavel_condicional', temDecisaoManual: false };
  }

  const fonte = criterio.atividade_chave_fonte;
  if (fonte?.startsWith('marco:')) {
    const campo = fonte.slice('marco:'.length) as keyof Cliente;
    const valor = cliente?.[campo];
    if (typeof valor === 'string' && valor) {
      return { ...CRITERIO_EFETIVO_PENDENTE, status: 'concluido', dataValidacaoIso: valor, origem: 'automatico', temDecisaoManual: false };
    }
  } else if (fonte) {
    const atividade = atividadesTemplate.find((a) => a.chave === fonte && a.implementacao_id === null);
    const statusAtividade = atividade
      ? atividadesStatus.find((s) => s.implementacao_id === implementacaoId && s.atividade_id === atividade.id)
      : null;
    if (statusAtividade?.data_real) {
      return {
        status: 'concluido',
        evidencia: statusAtividade.evidencia,
        observacao: null,
        dataValidacaoIso: statusAtividade.data_real,
        responsavelValidacaoId: null,
        origem: 'automatico',
        temDecisaoManual: false,
      };
    }
  }

  return { ...CRITERIO_EFETIVO_PENDENTE, origem: 'manual', temDecisaoManual: false };
}

export function resolverResumoCriteriosEntrega(
  criterios: CriterioEntrega[],
  statusRows: CriterioEntregaStatus[],
  implementacaoId: string,
  // Opcional: quando informado, critérios sem decisão manual passam a
  // refletir a fonte automática (checklist/marco) e a aplicabilidade
  // condicional — sem isso, comporta-se exatamente como antes (só a decisão
  // manual salva conta), pros chamadores que ainda não têm esse contexto
  // carregado (relatórios/PDFs, por ex.).
  contexto?: { cliente: Cliente | null; atividadesTemplate: AtividadeCronograma[]; atividadesStatus: AtividadeStatusRow[] },
): ResumoCriteriosEntrega {
  const statusPorCriterio = new Map(
    statusRows.filter((s) => s.implementacao_id === implementacaoId).map((s) => [s.criterio_id, s]),
  );

  function statusEfetivo(criterio: CriterioEntrega): StatusCriterioEntrega {
    const statusRow = statusPorCriterio.get(criterio.id) ?? null;
    if (!contexto) return statusRow?.status ?? 'pendente';
    return resolverCriterioEfetivo({
      criterio,
      statusRow,
      cliente: contexto.cliente,
      atividadesTemplate: contexto.atividadesTemplate,
      atividadesStatus: contexto.atividadesStatus,
      implementacaoId,
    }).status;
  }

  const relevantes = criterios.filter((c) => statusEfetivo(c) !== 'nao_se_aplica');
  const concluidos = relevantes.filter((c) => statusEfetivo(c) === 'concluido').length;

  const obrigatorios = criterios.filter((c) => c.obrigatorio);
  const todosObrigatoriosAtendidos = obrigatorios.every((c) => {
    const status = statusEfetivo(c);
    return status === 'concluido' || status === 'nao_se_aplica';
  });

  return { concluidos, total: relevantes.length, todosObrigatoriosAtendidos };
}
