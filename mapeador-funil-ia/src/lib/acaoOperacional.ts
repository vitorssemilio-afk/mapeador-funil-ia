// Resolvedor central de "ação contextual" — traduz o estado operacional
// JÁ CALCULADO pelas fontes oficiais (ClienteResumo de operacaoResumo.ts,
// Trial de trialKommo.ts, ata de atasIntegracao, relatório/aceite de
// entrega) num par {label, to} pra qualquer botão da Home (cards de
// atenção, "Precisa da sua decisão", coluna "Próxima ação" da carteira).
//
// Não recalcula saúde, prazo, Trial, reunião obrigatória ou próxima ação —
// só traduz o que essas fontes já decidiram em "pra onde o consultor deve
// ir e o que o botão deve dizer". Quando o estado não é reconhecido, cai em
// "Ver detalhes" (nunca um botão quebrado ou sem destino).
import type { ClienteResumo } from './operacaoResumo';
import type {
  ClienteOcorrencia,
  EntregaAceite,
  RelatorioImplementacao,
  TipoReuniao,
} from '../types/database';

export type TipoAcaoOperacional =
  | 'formulario'
  | 'funil'
  | 'reuniao'
  | 'pendencia'
  | 'checklist'
  | 'trial'
  | 'entrega'
  | 'implementacao'
  | 'detalhes';

export type AcaoOperacional = {
  label: string;
  to: string;
  tipo: TipoAcaoOperacional;
};

export type ContextoAcaoOperacional = {
  resumo: ClienteResumo;
  // Ocorrência aberta mais relevante pra este cliente (se houver) — mesma
  // fonte usada em construirAlertas, só repassada aqui porque o resolvedor
  // não tem acesso direto à lista de ocorrências.
  ocorrenciaDoCliente?: ClienteOcorrencia | null;
  // Qual tipo de reunião obrigatória está pendente, se resumo.reuniaoObrigatoriaPendente
  // for true (TIPOS_REUNIAO_OBRIGATORIOS verificado um a um pelo chamador
  // com a mesma função oficial alertaReuniaoObrigatoria — nenhuma regra
  // nova, só descobrir QUAL dos tipos já verificados é o pendente).
  tipoReuniaoPendente?: TipoReuniao | null;
  // Relatório de entrega final mais recente desta implementação, se existir.
  relatorioEntregaFinal?: RelatorioImplementacao | null;
  // Registro de aceite de entrega mais recente, se existir.
  aceiteEntrega?: EntregaAceite | null;
};

function linkMapeamento(mapeamentoId: string | undefined | null, clienteId: string): string {
  return mapeamentoId ? `/mapeamento/${mapeamentoId}` : `/clientes/${clienteId}?aba=mapeamento`;
}

// Reuniões só são de fato agendáveis/editáveis na aba "Reuniões" da
// IMPLEMENTAÇÃO — a aba de mesmo nome na ficha do cliente é só leitura
// (ver ClienteDetalhe.tsx). Mandar o CTA pro lugar errado deixaria o
// consultor sem conseguir agendar nada.
function linkReuniao(resumo: ClienteResumo, tipoPendente?: TipoReuniao | null): string {
  if (resumo.implementacao) {
    const base = `/implementacoes/${resumo.implementacao.id}?aba=reunioes`;
    return tipoPendente ? `${base}&tipo=${tipoPendente}&acao=agendar` : base;
  }
  return `/clientes/${resumo.cliente.id}?aba=reunioes`;
}

function linkEntrega(resumo: ClienteResumo): string {
  return resumo.implementacao
    ? `/implementacoes/${resumo.implementacao.id}/entrega`
    : `/clientes/${resumo.cliente.id}?aba=implementacao`;
}

// Traduz o texto já produzido por proximaAcaoLabel (operacaoResumo.ts) num
// destino de UI — não reimplementa a árvore de decisão dela, só mapeia a
// string oficial que ela já decidiu pro par {label, to} mais específico
// possível. Cobre toda a progressão normal (formulário → funil → kickoff →
// implementação → checklist) que não é, por si só, um "alerta".
function acaoDoTextoOficial(resumo: ClienteResumo): AcaoOperacional {
  const { cliente, vendas, posVenda, proximaAcao } = resumo;
  const texto = proximaAcao;

  if (texto === 'Criar mapeamento de vendas') {
    return { label: 'Criar mapeamento', to: `/clientes/${cliente.id}?aba=mapeamento`, tipo: 'formulario' };
  }
  // "Enviar link do formulário" e "Responder esclarecimento da IA" são os
  // dois estados em que o funil ainda depende do cliente responder — o
  // banco não distingue "nunca copiei o link" de "já copiei, aguardando o
  // cliente" (não existe um campo "link copiado em"), então os dois usam o
  // mesmo rótulo seguro (seção 5 do prompt previu esse fallback).
  if (texto === 'Enviar link do formulário' || texto === 'Responder esclarecimento da IA') {
    return { label: 'Ver formulário', to: linkMapeamento(vendas?.id, cliente.id), tipo: 'formulario' };
  }
  if (texto === 'Gerar funil de vendas') {
    return { label: 'Gerar funil', to: linkMapeamento(vendas?.id, cliente.id), tipo: 'funil' };
  }
  if (texto === 'Aguardando geração do funil') {
    return { label: 'Ver detalhes', to: linkMapeamento(vendas?.id, cliente.id), tipo: 'detalhes' };
  }
  if (texto === 'Revisar e tentar gerar o funil de novo') {
    return { label: 'Ver detalhes', to: linkMapeamento(vendas?.id, cliente.id), tipo: 'detalhes' };
  }
  if (texto.startsWith('Avançar o funil')) {
    // Cobre funil_gerado/em_revisao_interna/ajustes_solicitados — "revisar"
    // é a ação certa em qualquer um desses pontos da progressão manual.
    return { label: 'Revisar funil', to: linkMapeamento(vendas?.id, cliente.id), tipo: 'funil' };
  }
  if (texto === 'Iniciar implementação de CRM') {
    return { label: 'Iniciar implementação', to: `/clientes/${cliente.id}?aba=implementacao`, tipo: 'implementacao' };
  }
  if (texto === 'Nenhuma — implementação concluída') {
    return { label: 'Ver detalhes', to: `/clientes/${cliente.id}?aba=resumo`, tipo: 'detalhes' };
  }
  if (texto === 'Confirmar pré-requisitos (acessos)') {
    return { label: 'Confirmar acessos', to: `/clientes/${cliente.id}?aba=implementacao`, tipo: 'implementacao' };
  }
  if (texto === 'Enviar formulário de pós-venda' || texto === 'Aguardar/cobrar resposta do pós-venda') {
    return { label: 'Ver formulário', to: linkMapeamento(posVenda?.id, cliente.id), tipo: 'formulario' };
  }
  if (texto === 'Revisar cronograma com o cliente') {
    return { label: 'Ver pendências', to: `/clientes/${cliente.id}?aba=implementacao`, tipo: 'checklist' };
  }
  if (texto.startsWith('Acompanhar checklist')) {
    return { label: 'Ver checklist', to: `/clientes/${cliente.id}?aba=implementacao`, tipo: 'checklist' };
  }

  // Estado não reconhecido — nunca um botão quebrado ou sem destino
  // (seção 27). A ficha do cliente é sempre um destino seguro.
  return { label: 'Ver detalhes', to: `/clientes/${cliente.id}?aba=resumo`, tipo: 'detalhes' };
}

export function resolverAcaoOperacional(ctx: ContextoAcaoOperacional): AcaoOperacional {
  const { resumo, ocorrenciaDoCliente, tipoReuniaoPendente, relatorioEntregaFinal, aceiteEntrega } = ctx;
  const { cliente, trial } = resumo;

  // 1) Ocorrência aberta — mesma prioridade máxima de construirAlertas.
  if (ocorrenciaDoCliente) {
    const ehPendenciaDoCliente =
      ocorrenciaDoCliente.categoria === 'pendencia_cliente' || ocorrenciaDoCliente.categoria === 'acesso_pendente';
    const label = ehPendenciaDoCliente
      ? ocorrenciaDoCliente.impacta_cronograma
        ? 'Resolver pendência'
        : 'Ver pendência'
      : 'Resolver pendência';
    return { label, to: `/clientes/${cliente.id}?aba=resumo`, tipo: 'pendencia' };
  }

  // 2) Prazo geral vencido ou atividade do cronograma atrasada.
  const prazoVencido = resumo.diaCiclo != null && resumo.diaCiclo.dia > resumo.duracaoTotalDias;
  if (prazoVencido || resumo.atividadesAtrasadas.length > 0) {
    return { label: 'Ver pendências', to: `/clientes/${cliente.id}?aba=implementacao`, tipo: 'checklist' };
  }

  // 3) Trial — extensão a solicitar, ou já solicitada aguardando aprovação.
  if (trial?.precisaAlerta) {
    return { label: 'Solicitar extensão', to: `/clientes/${cliente.id}?aba=trial`, tipo: 'trial' };
  }
  if (trial?.proximaExtensao?.solicitadaEm && !trial.proximaExtensao.aprovadaEm) {
    return { label: 'Acompanhar extensão', to: `/clientes/${cliente.id}?aba=trial`, tipo: 'trial' };
  }

  // 4) Reunião obrigatória (treinamento/check-ins/entrega) ainda não agendada.
  if (resumo.reuniaoObrigatoriaPendente) {
    return { label: 'Agendar reunião', to: linkReuniao(resumo, tipoReuniaoPendente), tipo: 'reuniao' };
  }

  // 5) Entrega final — aceite pendente > entrega preparada aguardando
  // apresentação > entrega ainda não preparada (nessa ordem: um aceite
  // pendente é mais urgente que preparar uma entrega nova).
  if (aceiteEntrega?.status === 'aguardando_aceite') {
    return { label: 'Registrar aceite', to: linkEntrega(resumo), tipo: 'entrega' };
  }
  if (relatorioEntregaFinal && ['gerado', 'final'].includes(relatorioEntregaFinal.status) && !aceiteEntrega) {
    return { label: 'Apresentar entrega', to: linkEntrega(resumo), tipo: 'entrega' };
  }
  if (resumo.implementacao?.status === 'entrega' && !relatorioEntregaFinal) {
    return { label: 'Preparar entrega', to: linkEntrega(resumo), tipo: 'entrega' };
  }

  // 6) Nenhum alerta ativo — traduz a próxima ação oficial (progressão
  // normal: formulário → funil → kickoff → implementação → checklist).
  return acaoDoTextoOficial(resumo);
}
