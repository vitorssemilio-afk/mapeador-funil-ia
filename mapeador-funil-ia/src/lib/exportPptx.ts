import { formatCampoEtapaLabel } from '../data/etapaCampos';
import type { EtapaFunil, FunilGerado, GeracaoMeta } from '../types/database';

const COR_FUNDO = '0D0D0F';
const COR_ACCENT = 'D42A42';
const COR_TEXTO = 'F4F4F6';
const COR_TEXTO_MUTED = 'A9A9AE';
const FONTE = 'Arial';

const TIPO_FUNIL_LABELS: Record<string, string> = {
  qualificacao: 'Qualificação',
  vendas: 'Vendas',
  comparecimento: 'Comparecimento',
  pos_venda: 'Pós-venda',
  outro: 'Outro',
};

const NIVEL_COMPLEXIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

function nomeArquivo(nomeNegocio: string): string {
  const slug = nomeNegocio
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'funil'}-apresentacao.pptx`;
}

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pptx['addSlide']>;

function slideBase(pptx: Pptx): Slide {
  const slide = pptx.addSlide();
  slide.background = { color: COR_FUNDO };
  return slide;
}

function addEyebrow(slide: Slide, texto: string) {
  slide.addText(texto.toUpperCase(), {
    x: 0.5,
    y: 0.35,
    w: 12,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: COR_ACCENT,
    fontFace: FONTE,
    charSpacing: 2,
  });
}

function addTitulo(slide: Slide, texto: string, y = 0.68) {
  slide.addText(texto, {
    x: 0.5,
    y,
    w: 12.3,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: 'FFFFFF',
    fontFace: FONTE,
  });
}

// Escreve uma seção com título em destaque + lista de linhas, retornando o Y
// logo abaixo do conteúdo escrito (pra empilhar seções sem sobrepor).
function addSecao(
  slide: Slide,
  params: { x: number; y: number; w: number; titulo: string; linhas: string[]; fontSize?: number },
): number {
  const { x, y, w, titulo, linhas } = params;
  const fontSize = params.fontSize ?? 11;
  if (linhas.length === 0) return y;

  slide.addText(titulo.toUpperCase(), {
    x,
    y,
    w,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: COR_ACCENT,
    fontFace: FONTE,
  });

  const alturaEstimada = Math.max(0.3, linhas.length * (fontSize / 42));
  slide.addText(
    linhas.map((linha) => ({ text: linha, options: { bullet: linhas.length > 1, breakLine: true } })),
    {
      x,
      y: y + 0.32,
      w,
      h: alturaEstimada,
      fontSize,
      color: COR_TEXTO,
      fontFace: FONTE,
      valign: 'top',
    },
  );

  return y + 0.32 + alturaEstimada + 0.22;
}

function slideEtapa(pptx: Pptx, etapa: EtapaFunil, index: number) {
  const slide = slideBase(pptx);
  addEyebrow(slide, `Etapa ${index + 1}`);
  addTitulo(slide, etapa.nome);

  const meta: string[] = [];
  if (etapa.sla) meta.push(`SLA: ${etapa.sla}`);
  if (etapa.responsavel) meta.push(`Responsável: ${etapa.responsavel}`);
  if (meta.length > 0) {
    slide.addText(meta.join('   ·   '), {
      x: 0.5,
      y: 1.55,
      w: 12.3,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: COR_TEXTO_MUTED,
      fontFace: FONTE,
    });
  }

  const colX = [0.5, 6.9];
  const colW = 5.9;
  let yEsquerda = 2.05;
  let yDireita = 2.05;

  if (etapa.objetivo) {
    yEsquerda = addSecao(slide, {
      x: colX[0],
      y: yEsquerda,
      w: colW,
      titulo: 'Objetivo',
      linhas: [etapa.objetivo],
    });
  }
  if (etapa.gatilho_entrada) {
    yEsquerda = addSecao(slide, {
      x: colX[0],
      y: yEsquerda,
      w: colW,
      titulo: 'Gatilho de entrada',
      linhas: [etapa.gatilho_entrada],
    });
  }
  if (etapa.gatilho_saida) {
    yEsquerda = addSecao(slide, {
      x: colX[0],
      y: yEsquerda,
      w: colW,
      titulo: 'Gatilho de saída',
      linhas: [etapa.gatilho_saida],
    });
  }
  if (etapa.campos_obrigatorios.length > 0) {
    yEsquerda = addSecao(slide, {
      x: colX[0],
      y: yEsquerda,
      w: colW,
      titulo: 'Campos obrigatórios',
      linhas: etapa.campos_obrigatorios.map(formatCampoEtapaLabel),
    });
  }
  if (etapa.campos_desejaveis.length > 0) {
    addSecao(slide, {
      x: colX[0],
      y: yEsquerda,
      w: colW,
      titulo: 'Campos desejáveis',
      linhas: etapa.campos_desejaveis.map(formatCampoEtapaLabel),
    });
  }

  if (etapa.tarefas.length > 0) {
    yDireita = addSecao(slide, { x: colX[1], y: yDireita, w: colW, titulo: 'Tarefas', linhas: etapa.tarefas });
  }
  if (etapa.automacao.length > 0) {
    yDireita = addSecao(slide, {
      x: colX[1],
      y: yDireita,
      w: colW,
      titulo: 'Automação',
      linhas: etapa.automacao,
    });
  }
  if (etapa.regras_negocio.length > 0) {
    yDireita = addSecao(slide, {
      x: colX[1],
      y: yDireita,
      w: colW,
      titulo: 'Regras de negócio',
      linhas: etapa.regras_negocio,
    });
  }
  if (etapa.regras_perda.length > 0) {
    yDireita = addSecao(slide, {
      x: colX[1],
      y: yDireita,
      w: colW,
      titulo: 'Regras de perda',
      linhas: etapa.regras_perda,
    });
  }
  if (etapa.script_sugerido) {
    slide.addText(`"${etapa.script_sugerido}"`, {
      x: colX[1],
      y: yDireita,
      w: colW,
      h: 0.9,
      fontSize: 11,
      italic: true,
      color: COR_TEXTO,
      fontFace: FONTE,
      fill: { color: '2A1418' },
      valign: 'top',
      margin: 10,
    });
  }
}

function slideVisaoGeral(pptx: Pptx, funil: FunilGerado, indice: number, total: number) {
  const slide = slideBase(pptx);
  addEyebrow(
    slide,
    `Funil ${indice + 1} de ${total} · ${TIPO_FUNIL_LABELS[funil.tipo_funil] ?? funil.tipo_funil}`,
  );
  addTitulo(slide, funil.nome_funil);

  let y = 1.65;
  if (funil.justificativa) {
    slide.addText(funil.justificativa, {
      x: 0.5,
      y,
      w: 12.3,
      h: 0.5,
      fontSize: 12,
      color: COR_TEXTO_MUTED,
      fontFace: FONTE,
    });
    y += 0.6;
  }

  const linhas = funil.etapas.map(
    (etapa, i) =>
      `Etapa ${i + 1}: ${etapa.nome}${etapa.sla ? ` (SLA: ${etapa.sla})` : ''}${
        etapa.responsavel ? ` — ${etapa.responsavel}` : ''
      }`,
  );
  addSecao(slide, { x: 0.5, y, w: 12.3, titulo: 'Etapas do funil', linhas, fontSize: 13 });
}

function slideMeta(pptx: Pptx, meta: GeracaoMeta) {
  if (meta.transicoes_entre_funis.length === 0 && !meta.nivel_complexidade) return;

  const slide = slideBase(pptx);
  addEyebrow(slide, 'Antes de implementar');
  addTitulo(slide, 'Pontos de atenção');

  let y = 1.65;
  if (meta.nivel_complexidade) {
    const complexidade = NIVEL_COMPLEXIDADE_LABELS[meta.nivel_complexidade] ?? meta.nivel_complexidade;
    const semanas =
      meta.semanas_estimadas != null
        ? ` · ~${meta.semanas_estimadas} ${meta.semanas_estimadas === 1 ? 'semana' : 'semanas'}`
        : '';
    y = addSecao(slide, {
      x: 0.5,
      y,
      w: 12.3,
      titulo: 'Complexidade estimada',
      linhas: [`${complexidade}${semanas}`],
    });
    if (meta.observacao_estimativa) {
      y = addSecao(slide, { x: 0.5, y, w: 12.3, titulo: 'Observação', linhas: [meta.observacao_estimativa] });
    }
  }

  if (meta.transicoes_entre_funis.length > 0) {
    addSecao(slide, {
      x: 0.5,
      y,
      w: 12.3,
      titulo: 'Transições entre funis',
      linhas: meta.transicoes_entre_funis.map((t) => `${t.de_funil} → ${t.para_funil}: ${t.condicao}`),
    });
  }
}

function slideIndicadoresDashboard(pptx: Pptx, indicadores: string[]) {
  if (indicadores.length === 0) return;

  const slide = slideBase(pptx);
  addEyebrow(slide, 'Visibilidade do negócio');
  addTitulo(slide, 'O que você vai conseguir acompanhar');
  slide.addText('Com o funil configurado, esses indicadores ficam disponíveis direto no painel do CRM:', {
    x: 0.5,
    y: 1.5,
    w: 12.3,
    h: 0.5,
    fontSize: 12,
    color: COR_TEXTO_MUTED,
    fontFace: FONTE,
  });

  addSecao(slide, { x: 0.5, y: 2.1, w: 12.3, titulo: 'Indicadores', linhas: indicadores, fontSize: 13 });
}

function slideValidarComCliente(pptx: Pptx, pontos: string[]) {
  if (pontos.length === 0) return;

  const slide = slideBase(pptx);
  addEyebrow(slide, 'Antes de colocar em prática');
  addTitulo(slide, 'Para confirmar com você');
  slide.addText(
    'Montamos esse funil com base no que você nos contou — só faltam confirmar alguns pontos antes de configurar tudo de verdade no CRM:',
    { x: 0.5, y: 1.5, w: 12.3, h: 0.5, fontSize: 12, color: COR_TEXTO_MUTED, fontFace: FONTE },
  );

  addSecao(slide, { x: 0.5, y: 2.1, w: 12.3, titulo: 'Pontos', linhas: pontos, fontSize: 13 });
}

export async function exportarFunilParaPptx(
  nomeNegocio: string,
  funis: FunilGerado[],
  geracaoMeta: GeracaoMeta | null,
): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const totalEtapas = funis.reduce((soma, f) => soma + f.etapas.length, 0);

  const capa = slideBase(pptx);
  capa.addText('PLAYBOOK DE VENDAS', {
    x: 0.7,
    y: 2.6,
    w: 11.9,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: COR_TEXTO_MUTED,
    fontFace: FONTE,
    charSpacing: 2,
  });
  capa.addText(nomeNegocio, {
    x: 0.7,
    y: 3.0,
    w: 11.9,
    h: 1.4,
    fontSize: 44,
    bold: true,
    color: 'FFFFFF',
    fontFace: FONTE,
  });
  capa.addText(
    `${funis.length} funil${funis.length === 1 ? '' : 's'} · ${totalEtapas} etapas · ${new Date().toLocaleDateString('pt-BR')}`,
    { x: 0.7, y: 4.3, w: 11.9, h: 0.4, fontSize: 14, color: COR_TEXTO_MUTED, fontFace: FONTE },
  );

  if (geracaoMeta) slideMeta(pptx, geracaoMeta);
  if (geracaoMeta) slideIndicadoresDashboard(pptx, geracaoMeta.indicadores_dashboard);

  funis.forEach((funil, indice) => {
    slideVisaoGeral(pptx, funil, indice, funis.length);
    funil.etapas.forEach((etapa, i) => slideEtapa(pptx, etapa, i));
  });

  if (geracaoMeta) slideValidarComCliente(pptx, geracaoMeta.pontos_para_validar);

  await pptx.writeFile({ fileName: nomeArquivo(nomeNegocio) });
}
