import { CAMPOS_ETAPA, valorEtapaParaTexto } from '../data/etapaCampos';
import type { FunilGerado } from '../types/database';

const CARACTERES_INVALIDOS_ABA = /[\\/?*[\]:]/g;

function nomeAbaUnico(nomeFunil: string, usados: Set<string>): string {
  const base = (nomeFunil.replace(CARACTERES_INVALIDOS_ABA, '').trim() || 'Funil').slice(0, 31);
  let candidato = base;
  let contador = 2;

  while (usados.has(candidato)) {
    const sufixo = ` (${contador})`;
    candidato = `${base.slice(0, 31 - sufixo.length)}${sufixo}`;
    contador++;
  }

  usados.add(candidato);
  return candidato;
}

function nomeArquivo(nomeNegocio: string): string {
  const slug = nomeNegocio
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'funis'}-funis.xlsx`;
}

export async function exportarFunisParaExcel(nomeNegocio: string, funis: FunilGerado[]): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const nomesUsados = new Set<string>();

  for (const funil of funis) {
    const cabecalho = ['Campo', ...funil.etapas.map((etapa) => etapa.nome)];
    const linhas = CAMPOS_ETAPA.map((campo) => [
      campo.label,
      ...funil.etapas.map((etapa) => valorEtapaParaTexto(etapa[campo.key])),
    ]);

    const planilha = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
    XLSX.utils.book_append_sheet(workbook, planilha, nomeAbaUnico(funil.nome_funil, nomesUsados));
  }

  XLSX.writeFile(workbook, nomeArquivo(nomeNegocio));
}
