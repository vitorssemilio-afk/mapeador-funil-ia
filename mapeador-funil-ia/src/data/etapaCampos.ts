import type { EtapaFunil } from '../types/database';

export type CampoEtapaKey = Exclude<keyof EtapaFunil, 'nome'>;

export type CampoEtapaConfig = {
  key: CampoEtapaKey;
  label: string;
  lista: boolean;
};

export const CAMPOS_ETAPA: CampoEtapaConfig[] = [
  { key: 'objetivo', label: 'Objetivo', lista: false },
  { key: 'gatilho_entrada', label: 'Gatilho de Entrada', lista: false },
  { key: 'gatilho_saida', label: 'Gatilho de Saída', lista: false },
  { key: 'tarefas', label: 'Tarefas', lista: true },
  { key: 'campos_obrigatorios', label: 'Campos Obrigatórios', lista: true },
  { key: 'campos_desejaveis', label: 'Campos Desejáveis', lista: true },
  { key: 'sla', label: 'SLA', lista: false },
  { key: 'regras_negocio', label: 'Regras de Negócio', lista: true },
  { key: 'regras_perda', label: 'Regras de Perda', lista: true },
  { key: 'responsavel', label: 'Responsável', lista: false },
  { key: 'automacao', label: 'Automação', lista: true },
  { key: 'script_sugerido', label: 'Script Sugerido', lista: false },
];

export function valorEtapaParaTexto(valor: string[] | string | null): string {
  if (Array.isArray(valor)) return valor.join('\n');
  return valor ?? '';
}

export function textoParaValorEtapa(texto: string, lista: boolean): string[] | string {
  if (lista) {
    return texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean);
  }
  return texto;
}
