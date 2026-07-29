import { formatCampoEtapaLabel } from '../data/etapaCampos';
import type { CampoEtapa, EtapaFunil, FunilGerado } from '../types/database';

export type ItensDerivados = {
  semana1: string[];
  semana2: string[];
};

function etapasResumo(funil: FunilGerado): string {
  return funil.etapas.map((etapa) => etapa.nome).join(' → ');
}

function camposResumo(campos: CampoEtapa[]): string {
  return campos.map((campo) => formatCampoEtapaLabel(campo)).join('; ');
}

function itemCamposPersonalizados(etapa: EtapaFunil, funilNome: string): string | null {
  if (etapa.campos_obrigatorios.length === 0 && etapa.campos_desejaveis.length === 0) return null;

  const partes: string[] = [];
  if (etapa.campos_obrigatorios.length > 0) {
    partes.push(`obrigatórios: ${camposResumo(etapa.campos_obrigatorios)}`);
  }
  if (etapa.campos_desejaveis.length > 0) {
    partes.push(`desejáveis: ${camposResumo(etapa.campos_desejaveis)}`);
  }

  return `Cadastrar campos personalizados — "${etapa.nome}" (${funilNome}): ${partes.join(' · ')}`;
}

// Deriva o checklist de Semana 1 (funis, cards, campos personalizados,
// gatilhos de entrada/saída) e Semana 2 (canais, automações de
// movimentação, modelos de mensagem, motivos de perda) diretamente do
// funil já gerado por IA, em vez de montar isso na mão pra cada cliente.
// Não chama IA — só formata o que já está salvo em funis_gerados.
export function gerarItensDerivados(funis: FunilGerado[]): ItensDerivados {
  const semana1: string[] = [];
  const semana2: string[] = [];
  const motivosPerda = new Set<string>();

  for (const funil of funis) {
    semana1.push(`Estruturar funil "${funil.nome_funil}" com as etapas: ${etapasResumo(funil)}`);

    for (const etapa of funil.etapas) {
      semana1.push(
        `Configurar gatilhos de entrada/saída — "${etapa.nome}" (${funil.nome_funil}): entra quando ${etapa.gatilho_entrada}; sai quando ${etapa.gatilho_saida}`,
      );

      const itemCampos = itemCamposPersonalizados(etapa, funil.nome_funil);
      if (itemCampos) semana1.push(itemCampos);

      if (etapa.automacao.length > 0) {
        semana2.push(
          `Configurar automação de movimentação — "${etapa.nome}" (${funil.nome_funil}): ${etapa.automacao.join('; ')}`,
        );
      }

      if (etapa.script_sugerido) {
        semana2.push(
          `Criar modelo de mensagem — "${etapa.nome}" (${funil.nome_funil}): "${etapa.script_sugerido}"`,
        );
      }

      etapa.regras_perda.forEach((motivo) => motivosPerda.add(motivo));
    }
  }

  if (motivosPerda.size > 0) {
    semana2.push(`Cadastrar motivos de perda: ${[...motivosPerda].join('; ')}`);
  }

  return { semana1, semana2 };
}
