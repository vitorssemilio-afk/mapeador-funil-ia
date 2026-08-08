import { formatCampoEtapaLabel } from '../data/etapaCampos';
import type { EtapaFunil, FunilGerado, GeracaoMeta } from '../types/database';

// Mesma paleta escura + vermelho do relatório em PDF (RelatorioFunil.css:
// fundo 0d0d0f/050506, accent D42A42) — o PPTX usa as mesmas cores, mais o
// mesmo tratamento visual (cards com fundo sutil + barra de destaque,
// glow vermelho no canto) em vez de só texto solto num fundo escuro.
const COR_FUNDO = '0D0D0F';
const COR_ACCENT = 'D42A42';
const COR_TEXTO = 'F4F4F6';
const COR_TEXTO_MUTED = 'A9A9AE';
const FONTE = 'Arial';

const LARGURA = 13.33;
const ALTURA = 7.5;
const MARGEM_X = 0.5;
const LARGURA_CONTEUDO = LARGURA - MARGEM_X * 2;

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

// Fundo escuro + glow vermelho sutil no canto superior direito, equivalente
// ao radial-gradient de .relatorio-slide::after no PDF.
function slideBase(pptx: Pptx): Slide {
  const slide = pptx.addSlide();
  slide.background = { color: COR_FUNDO };
  slide.addShape('ellipse', {
    x: LARGURA - 5.2,
    y: -3.2,
    w: 7,
    h: 7,
    fill: { color: COR_ACCENT, transparency: 88 },
    line: { type: 'none' },
  });
  return slide;
}

// Card com fundo sutil + barra de destaque (esquerda ou topo) — equivalente
// a .relatorio-section / .relatorio-pc-head / .relatorio-validar-item.
function addCard(
  slide: Slide,
  params: { x: number; y: number; w: number; h: number; lado?: 'esquerda' | 'topo' },
) {
  const { x, y, w, h, lado = 'esquerda' } = params;
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: 'FFFFFF', transparency: 96 },
    line: { type: 'none' },
  });
  const espessura = lado === 'esquerda' ? 0.045 : 0.035;
  slide.addShape('rect', {
    x,
    y,
    w: lado === 'esquerda' ? espessura : w,
    h: lado === 'esquerda' ? h : espessura,
    fill: { color: COR_ACCENT },
    line: { type: 'none' },
  });
}

function addEyebrow(slide: Slide, texto: string) {
  slide.addText(texto.toUpperCase(), {
    x: MARGEM_X,
    y: 0.35,
    w: LARGURA_CONTEUDO,
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
    x: MARGEM_X,
    y,
    w: LARGURA_CONTEUDO,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: 'FFFFFF',
    fontFace: FONTE,
  });
}

// Estimativa grosseira de quantas linhas um texto ocupa numa caixa de
// largura `larguraIn`, pra dimensionar cards antes de desenhar o texto por
// cima (não há medição real de texto disponível em tempo de geração).
function estimarLinhas(texto: string, larguraIn: number, fontSize: number): number {
  const charsPorLinha = Math.max(10, Math.floor((larguraIn * 92) / fontSize));
  return Math.max(1, Math.ceil(texto.length / charsPorLinha));
}

// Escreve uma seção com título em destaque + lista de linhas dentro de um
// card com barra de destaque à esquerda, retornando o Y logo abaixo do
// card (pra empilhar seções sem sobrepor). Título sempre em 11pt fixo (não
// encolhe); só o conteúdo e o espaçamento respeitam `escala`.
function addSecao(
  slide: Slide,
  params: { x: number; y: number; w: number; titulo: string; linhas: string[]; fontSize?: number; escala?: number },
): number {
  const { x, y, w, titulo, linhas } = params;
  const fontSize = params.fontSize ?? 11;
  const escala = params.escala ?? 1;
  if (linhas.length === 0) return y;

  const padX = 0.18 * escala;
  const padTop = 0.15 * escala;
  const padBottom = 0.15 * escala;
  const tituloH = 0.24;
  const gap = 0.06 * escala;

  const totalLinhas = linhas.reduce((soma, linha) => soma + estimarLinhas(linha, w - padX * 2, fontSize), 0);
  const conteudoH = Math.max(0.22, totalLinhas * (fontSize / 50) + (linhas.length - 1) * 0.03 * escala);
  const cardH = padTop + tituloH + gap + conteudoH + padBottom;

  addCard(slide, { x, y, w, h: cardH });

  slide.addText(titulo.toUpperCase(), {
    x: x + padX,
    y: y + padTop,
    w: w - padX * 2,
    h: tituloH,
    fontSize: 11,
    bold: true,
    color: COR_ACCENT,
    fontFace: FONTE,
  });

  slide.addText(
    linhas.map((linha) => ({ text: linha, options: { bullet: linhas.length > 1, breakLine: true } })),
    {
      x: x + padX,
      y: y + padTop + tituloH + gap,
      w: w - padX * 2,
      h: conteudoH,
      fontSize,
      color: COR_TEXTO,
      fontFace: FONTE,
      valign: 'top',
    },
  );

  return y + cardH + 0.14 * escala;
}

function addQuote(slide: Slide, params: { x: number; y: number; w: number; texto: string; fontSize: number }): number {
  const { x, y, w, texto, fontSize } = params;
  const padX = 0.18;
  const alturaQuote = Math.max(0.6, estimarLinhas(texto, w - padX * 2, fontSize) * (fontSize / 46) + 0.32);
  addCard(slide, { x, y, w, h: alturaQuote });
  slide.addText(`"${texto}"`, {
    x: x + padX,
    y,
    w: w - padX * 2,
    h: alturaQuote,
    fontSize,
    italic: true,
    color: COR_TEXTO,
    fontFace: FONTE,
    valign: 'middle',
  });
  return y + alturaQuote;
}

type BlocoColuna = { tipo: 'secao'; titulo: string; linhas: string[] } | { tipo: 'quote'; texto: string };

function medirBloco(bloco: BlocoColuna, w: number, fontSize: number, escala: number): number {
  if (bloco.tipo === 'quote') {
    const padX = 0.18;
    return Math.max(0.6, estimarLinhas(bloco.texto, w - padX * 2, fontSize) * (fontSize / 46) + 0.32);
  }
  const padX = 0.18 * escala;
  const padTop = 0.15 * escala;
  const padBottom = 0.15 * escala;
  const tituloH = 0.24;
  const gap = 0.06 * escala;
  const totalLinhas = bloco.linhas.reduce((soma, linha) => soma + estimarLinhas(linha, w - padX * 2, fontSize), 0);
  const conteudoH = Math.max(0.22, totalLinhas * (fontSize / 50) + (bloco.linhas.length - 1) * 0.03 * escala);
  return padTop + tituloH + gap + conteudoH + padBottom;
}

// Encolhe fonte/espaçamento (até um piso) pra tentar caber todos os blocos
// no espaço disponível.
function ajustarEscalaColuna(
  blocos: BlocoColuna[],
  w: number,
  alturaDisponivel: number,
): { fontSize: number; escala: number } {
  const medirTotal = (fontSize: number, escala: number) =>
    blocos.reduce((soma, bloco) => soma + medirBloco(bloco, w, fontSize, escala) + 0.14 * escala, 0);

  let fontSize = 11;
  let escala = 1;
  let total = medirTotal(fontSize, escala);

  while (total > alturaDisponivel && (fontSize > 8.5 || escala > 0.6)) {
    if (fontSize > 8.5) fontSize -= 0.5;
    if (escala > 0.6) escala = Math.max(0.6, escala - 0.08);
    total = medirTotal(fontSize, escala);
  }

  return { fontSize, escala };
}

// Desenha o máximo de blocos que couber no espaço disponível (já no piso de
// encolhimento) e devolve os que sobraram, pra o chamador continuar numa
// outra coluna/slide — uma etapa com todo campo preenchido pode ter mais
// conteúdo do que cabe até encolhendo, então sempre paginar em vez de
// deixar vazar pra fora do slide.
function desenharColunaParcial(
  slide: Slide,
  params: { x: number; w: number; yInicial: number; alturaDisponivel: number; blocos: BlocoColuna[] },
): BlocoColuna[] {
  const { x, w, yInicial, alturaDisponivel, blocos } = params;
  if (blocos.length === 0) return [];

  const { fontSize, escala } = ajustarEscalaColuna(blocos, w, alturaDisponivel);

  let y = yInicial;
  let i = 0;
  for (; i < blocos.length; i++) {
    const bloco = blocos[i];
    const h = medirBloco(bloco, w, fontSize, escala);
    // Sempre desenha ao menos 1 bloco por página, mesmo que ele sozinho não
    // caiba (evita loop infinito nesse caso extremo).
    if (i > 0 && y + h > yInicial + alturaDisponivel) break;

    y =
      bloco.tipo === 'quote'
        ? addQuote(slide, { x, y, w, texto: bloco.texto, fontSize })
        : addSecao(slide, { x, y, w, titulo: bloco.titulo, linhas: bloco.linhas, fontSize, escala });
  }

  return blocos.slice(i);
}

// Barra com marcadores coloridos (SLA / Responsável), equivalente às
// .relatorio-sla-badge/.relatorio-resp-badge do PDF.
function addMetaBar(slide: Slide, y: number, itens: string[]): number {
  if (itens.length === 0) return y;

  const h = 0.4;
  addCard(slide, { x: MARGEM_X, y, w: LARGURA_CONTEUDO, h, lado: 'topo' });

  const runs: { text: string; options?: { color?: string; bold?: boolean } }[] = [];
  itens.forEach((item, i) => {
    if (i > 0) runs.push({ text: '      ' });
    runs.push({ text: '●  ', options: { color: COR_ACCENT } });
    runs.push({ text: item, options: { color: COR_TEXTO_MUTED } });
  });

  slide.addText(runs, {
    x: MARGEM_X + 0.18,
    y,
    w: LARGURA_CONTEUDO - 0.36,
    h,
    fontSize: 12,
    bold: true,
    fontFace: FONTE,
    valign: 'middle',
  });

  return y + h + 0.2;
}

function slideEtapa(pptx: Pptx, etapa: EtapaFunil, index: number) {
  let slide = slideBase(pptx);
  addEyebrow(slide, `Etapa ${index + 1}`);
  addTitulo(slide, etapa.nome);

  const meta: string[] = [];
  if (etapa.sla) meta.push(`SLA: ${etapa.sla}`);
  if (etapa.responsavel) meta.push(`Responsável: ${etapa.responsavel}`);
  const yMeta = addMetaBar(slide, 1.55, meta);

  const colX = [MARGEM_X, 6.9];
  const colW = 5.9;
  let yInicial = meta.length > 0 ? yMeta : 2.05;
  let alturaDisponivel = ALTURA - 0.4 - yInicial;

  const blocosEsquerda: BlocoColuna[] = [];
  if (etapa.objetivo) blocosEsquerda.push({ tipo: 'secao', titulo: 'Objetivo', linhas: [etapa.objetivo] });
  if (etapa.gatilho_entrada) {
    blocosEsquerda.push({ tipo: 'secao', titulo: 'Gatilho de entrada', linhas: [etapa.gatilho_entrada] });
  }
  if (etapa.gatilho_saida) {
    blocosEsquerda.push({ tipo: 'secao', titulo: 'Gatilho de saída', linhas: [etapa.gatilho_saida] });
  }
  if (etapa.campos_obrigatorios.length > 0) {
    blocosEsquerda.push({
      tipo: 'secao',
      titulo: 'Campos obrigatórios',
      linhas: etapa.campos_obrigatorios.map(formatCampoEtapaLabel),
    });
  }
  if (etapa.campos_desejaveis.length > 0) {
    blocosEsquerda.push({
      tipo: 'secao',
      titulo: 'Campos desejáveis',
      linhas: etapa.campos_desejaveis.map(formatCampoEtapaLabel),
    });
  }

  const blocosDireita: BlocoColuna[] = [];
  if (etapa.tarefas.length > 0) blocosDireita.push({ tipo: 'secao', titulo: 'Tarefas', linhas: etapa.tarefas });
  if (etapa.automacao.length > 0) blocosDireita.push({ tipo: 'secao', titulo: 'Automação', linhas: etapa.automacao });
  if (etapa.regras_negocio.length > 0) {
    blocosDireita.push({ tipo: 'secao', titulo: 'Regras de negócio', linhas: etapa.regras_negocio });
  }
  if (etapa.regras_perda.length > 0) {
    blocosDireita.push({ tipo: 'secao', titulo: 'Regras de perda', linhas: etapa.regras_perda });
  }
  if (etapa.script_sugerido) blocosDireita.push({ tipo: 'quote', texto: etapa.script_sugerido });

  let restanteEsquerda = blocosEsquerda;
  let restanteDireita = blocosDireita;
  let pagina = 1;

  // Sempre pagina em vez de deixar conteúdo vazar pra fora do slide — uma
  // etapa com todo campo preenchido pode não caber nem no piso de encolhimento.
  while ((restanteEsquerda.length > 0 || restanteDireita.length > 0) && pagina <= 6) {
    if (pagina > 1) {
      slide = slideBase(pptx);
      addEyebrow(slide, `Etapa ${index + 1}`);
      addTitulo(slide, `${etapa.nome} (continuação)`);
      yInicial = 1.65;
      alturaDisponivel = ALTURA - 0.4 - yInicial;
    }

    restanteEsquerda = desenharColunaParcial(slide, { x: colX[0], w: colW, yInicial, alturaDisponivel, blocos: restanteEsquerda });
    restanteDireita = desenharColunaParcial(slide, { x: colX[1], w: colW, yInicial, alturaDisponivel, blocos: restanteDireita });
    pagina += 1;
  }
}

// Grade de cards do pipeline, equivalente a .relatorio-pipeline/.relatorio-pc
// no PDF — cada card com barra de destaque no topo, nome da etapa e SLA.
function slidePipeline(pptx: Pptx, funil: FunilGerado, indice: number, total: number) {
  const slide = slideBase(pptx);
  addEyebrow(
    slide,
    `Funil ${indice + 1} de ${total} · ${TIPO_FUNIL_LABELS[funil.tipo_funil] ?? funil.tipo_funil}`,
  );
  addTitulo(slide, funil.nome_funil);

  let y = 1.65;
  if (funil.justificativa) {
    slide.addText(funil.justificativa, {
      x: MARGEM_X,
      y,
      w: LARGURA_CONTEUDO,
      h: 0.5,
      fontSize: 12,
      color: COR_TEXTO_MUTED,
      fontFace: FONTE,
    });
    y += 0.6;
  }

  const etapas = funil.etapas;
  const areaYFim = ALTURA - 0.55;
  const gap = 0.18;
  const cols = Math.min(4, etapas.length) || 1;
  const rows = Math.ceil(etapas.length / cols);
  const cardW = (LARGURA_CONTEUDO - gap * (cols - 1)) / cols;
  const cardH = Math.min(1.8, (areaYFim - y - gap * (rows - 1)) / rows);

  etapas.forEach((etapa, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = MARGEM_X + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    addCard(slide, { x: cx, y: cy, w: cardW, h: cardH, lado: 'topo' });

    slide.addText(`ETAPA ${i + 1}`, {
      x: cx + 0.14,
      y: cy + 0.12,
      w: cardW - 0.28,
      h: 0.2,
      fontSize: 9,
      bold: true,
      color: COR_ACCENT,
      fontFace: FONTE,
      charSpacing: 1,
    });
    slide.addText(etapa.nome, {
      x: cx + 0.14,
      y: cy + 0.34,
      w: cardW - 0.28,
      h: cardH - 0.68,
      fontSize: 13,
      bold: true,
      color: 'FFFFFF',
      fontFace: FONTE,
      valign: 'top',
    });
    if (etapa.sla) {
      slide.addText(`SLA: ${etapa.sla}`, {
        x: cx + 0.14,
        y: cy + cardH - 0.32,
        w: cardW - 0.28,
        h: 0.24,
        fontSize: 9,
        color: COR_TEXTO_MUTED,
        fontFace: FONTE,
      });
    }
  });
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
      x: MARGEM_X,
      y,
      w: LARGURA_CONTEUDO,
      titulo: 'Complexidade estimada',
      linhas: [`${complexidade}${semanas}`],
    });
    if (meta.observacao_estimativa) {
      y = addSecao(slide, {
        x: MARGEM_X,
        y,
        w: LARGURA_CONTEUDO,
        titulo: 'Observação',
        linhas: [meta.observacao_estimativa],
      });
    }
  }

  if (meta.transicoes_entre_funis.length > 0) {
    addSecao(slide, {
      x: MARGEM_X,
      y,
      w: LARGURA_CONTEUDO,
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
    x: MARGEM_X,
    y: 1.5,
    w: LARGURA_CONTEUDO,
    h: 0.5,
    fontSize: 12,
    color: COR_TEXTO_MUTED,
    fontFace: FONTE,
  });

  addSecao(slide, { x: MARGEM_X, y: 2.1, w: LARGURA_CONTEUDO, titulo: 'Indicadores', linhas: indicadores, fontSize: 13 });
}

// Cada ponto a validar vira um card individual com barra de destaque à
// esquerda, igual a .relatorio-validar-item no PDF — pagina em mais de um
// slide quando não cabem todos numa tela só.
function slidesValidarComCliente(pptx: Pptx, pontos: string[]) {
  if (pontos.length === 0) return;

  const yInicio = 2.1;
  const areaYFim = ALTURA - 0.55;
  const gap = 0.14;
  const padX = 0.2;
  const padY = 0.14;
  const fontSize = 13;

  const paginas: string[][] = [];
  let paginaAtual: string[] = [];
  let yAcumulado = yInicio;

  for (const ponto of pontos) {
    const h = Math.max(0.55, estimarLinhas(ponto, LARGURA_CONTEUDO - padX * 2, fontSize) * 0.26 + padY * 2);
    if (yAcumulado + h > areaYFim && paginaAtual.length > 0) {
      paginas.push(paginaAtual);
      paginaAtual = [];
      yAcumulado = yInicio;
    }
    paginaAtual.push(ponto);
    yAcumulado += h + gap;
  }
  if (paginaAtual.length > 0) paginas.push(paginaAtual);

  paginas.forEach((paginaPontos, paginaIndex) => {
    const slide = slideBase(pptx);
    addEyebrow(slide, 'Antes de colocar em prática');
    addTitulo(slide, paginas.length > 1 ? `Para confirmar com você (${paginaIndex + 1}/${paginas.length})` : 'Para confirmar com você');

    if (paginaIndex === 0) {
      slide.addText(
        'Montamos esse funil com base no que você nos contou — só faltam confirmar alguns pontos antes de configurar tudo de verdade no CRM:',
        { x: MARGEM_X, y: 1.5, w: LARGURA_CONTEUDO, h: 0.5, fontSize: 12, color: COR_TEXTO_MUTED, fontFace: FONTE },
      );
    }

    let y = yInicio;
    for (const ponto of paginaPontos) {
      const h = Math.max(0.55, estimarLinhas(ponto, LARGURA_CONTEUDO - padX * 2, fontSize) * 0.26 + padY * 2);
      addCard(slide, { x: MARGEM_X, y, w: LARGURA_CONTEUDO, h });
      slide.addText(ponto, {
        x: MARGEM_X + padX,
        y,
        w: LARGURA_CONTEUDO - padX * 2,
        h,
        fontSize,
        italic: true,
        color: COR_TEXTO,
        fontFace: FONTE,
        valign: 'middle',
      });
      y += h + gap;
    }
  });
}

export async function exportarFunilParaPptx(
  nomeNegocio: string,
  funis: FunilGerado[],
  geracaoMeta: GeracaoMeta | null,
): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: LARGURA, height: ALTURA });
  pptx.layout = 'WIDE';

  const totalEtapas = funis.reduce((soma, f) => soma + f.etapas.length, 0);

  const capa = slideBase(pptx);
  capa.addShape('rect', {
    x: 0.7,
    y: 2.76,
    w: 0.28,
    h: 0.03,
    fill: { color: COR_ACCENT },
    line: { type: 'none' },
  });
  capa.addText('PLAYBOOK DE VENDAS', {
    x: 1.08,
    y: 2.6,
    w: 11.5,
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
    slidePipeline(pptx, funil, indice, funis.length);
    funil.etapas.forEach((etapa, i) => slideEtapa(pptx, etapa, i));
  });

  if (geracaoMeta) slidesValidarComCliente(pptx, geracaoMeta.pontos_para_validar);

  await pptx.writeFile({ fileName: nomeArquivo(nomeNegocio) });
}
