// Deck de Kick Off V4 (primeira reunião com o cliente de Implementação de
// CRM) — porta pra TypeScript/pptxgenjs a lógica da skill "kickoff-v4", que
// originalmente rodava como um script Python (python-pptx) sobre um pptx já
// pronto. Duas adaptações em relação à skill original:
//
// 1. A skill recebe um pptx de "Playbook de Vendas" já gerado (num template
//    antigo) e restila cada slide dele (detecta "FUNIL X DE Y"/"ETAPA N" no
//    texto, troca o fundo por foto, remove um círculo decorativo). Aqui não
//    existe esse pptx intermediário pra reabrir: as mesmas funções que
//    geram o conteúdo de funil/etapa do nosso pptx atual (exportPptx.ts,
//    já no padrão visual escuro + vermelho da V4) são reaproveitadas
//    diretamente — não há nada pra "restilizar", porque esse conteúdo já
//    nasce no estilo certo.
// 2. Os textos de indicadores usam `geracaoMeta.indicadores_dashboard`
//    (mesmo campo que a geração por IA já preenche), em vez de pedir uma
//    lista escrita à parte pro Kick Off.
//
// Os slides fixos (capa, divisórias, pauta, cronograma, indicadores,
// próximos passos, encerramento) seguem fielmente o `montar_kickoff.py` do
// Kit Kick Off V4: mesmas coordenadas (grade 1000×563, convertida aqui pra
// polegadas com o mesmo fator de escala), mesmos textos padrão, mesmas
// fontes (Anton/Oswald/Arial — caem pra fonte substituta em quem não tiver
// essas fontes instaladas, igual já acontecia no script original).
import {
  ALTURA,
  LARGURA,
  slideEtapa,
  slideMeta,
  slidePipeline,
  slidesValidarComCliente,
  type Pptx,
  type Slide,
} from './exportPptx';
import type { FunilGerado, GeracaoMeta } from '../types/database';

const RED = 'D42A42';
const RED_BLOCK = 'E00000';
const WHITE = 'FFFFFF';
const GRAY = 'B5B5B5';

const AGENDA_PADRAO = [
  'Cronograma de Implementação',
  'Validação das informações do formulário de pré-configuração',
  'Estruturação dos funis de venda',
  'Dicas e gatilhos de entrada e saída em cada etapa do funil',
  'Apresentação completa da plataforma Kommo',
  'Orientação para contratação da plataforma',
];

const CRONOGRAMA_PADRAO: [string, string][] = [
  ['Kickoff &\nConfiguração', 'Semana 1'],
  ['Automações de\nQualificação', 'Semana 2'],
  ['Relatórios &\nDashboards', 'Semana 3'],
  ['Entrega do\nPlaybook', 'Semana 4'],
];

const PROXIMOS_PASSOS_PADRAO = [
  'Definir email principal do administrador',
  'Definir quantidade de usuários e email de cada - Definir hierarquia',
  'Marcar data do treinamento da ferramenta com o time',
  'Enviar código solicitado pelo CRM',
];

const PRAZO_PADRAO = 'PRAZO DE 4 SEMANAS';
const LINK_PLANOS = 'https://www.kommo.com/br/precos/compare-planos/';

// Assets fotográficos do Kit Kick Off V4 (fundo F1 vermelho/preto, logo),
// servidos como estáticos — ver public/kickoff-assets/.
const ASSET = (nome: string) => `/kickoff-assets/${nome}`;
// Proporção real dos arquivos (logo.png: 1080×350, car.png: 200×200) — pra
// não esticar/espremer a imagem ao redimensionar só pela largura.
const LOGO_ASPECT = 350 / 1080;
const CAR_ASPECT = 1;

// Mesma grade 1000×563 do script original — todas as coordenadas abaixo
// (x/y/w/h) são nessa unidade e passam por `e()` antes de ir pro pptxgenjs.
const K = LARGURA / 1000;
function e(v: number): number {
  return v * K;
}

function nomeArquivoKickoff(nomeNegocio: string): string {
  const slug = nomeNegocio
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'cliente'} - Kick Off.pptx`;
}

function novoSlideComFundo(pptx: Pptx, imagem: string): Slide {
  const slide = pptx.addSlide();
  slide.background = { color: '000000' };
  slide.addImage({ path: ASSET(imagem), x: 0, y: 0, w: LARGURA, h: ALTURA });
  return slide;
}

function addLogo(slide: Slide, corner: boolean) {
  if (corner) {
    slide.addImage({ path: ASSET('logo.png'), x: e(890), y: e(523), w: e(100), h: e(100) * LOGO_ASPECT });
  } else {
    slide.addImage({ path: ASSET('logo.png'), x: e(60), y: e(420), w: e(122), h: e(122) * LOGO_ASPECT });
  }
}

function addPill(slide: Slide, label: string, w = 400, x = 62, y = 38) {
  slide.addShape('roundRect', {
    x: e(x),
    y: e(y),
    w: e(w),
    h: e(26),
    fill: { color: '000000', transparency: 100 },
    line: { color: WHITE, width: 0.75, transparency: 25 },
    rectRadius: e(13),
  });
  slide.addText(label, {
    x: e(x + 14),
    y: e(y),
    w: e(w - 20),
    h: e(26),
    fontSize: 9.5,
    fontFace: 'Inter',
    color: WHITE,
    valign: 'middle',
  });
}

function slideCapaKickoff(pptx: Pptx, titulo: string, subtitulo: string, subtituloItalico = false): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_capa.jpg');
  const n = titulo.length;
  const tamanho = n <= 14 ? 80 : n <= 26 ? 66 : 54;
  slide.addText(titulo, {
    x: e(60),
    y: e(60),
    w: e(560),
    h: e(210),
    fontSize: tamanho,
    fontFace: 'Anton',
    color: WHITE,
    valign: 'bottom',
  });
  slide.addText(subtitulo, {
    x: e(60),
    y: e(300),
    w: e(560),
    h: e(50),
    fontSize: 26,
    fontFace: 'Inter',
    italic: subtituloItalico,
    color: WHITE,
  });
  addLogo(slide, false);
  return slide;
}

function slideDivisoria(pptx: Pptx, titulo: string, linkPlanos?: string): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_divisoria.jpg');
  addPill(slide, 'IMPLEMENTAÇÃO CRM');
  slide.addText(titulo, {
    x: e(60),
    y: e(140),
    w: e(560),
    h: e(230),
    fontSize: 70,
    fontFace: 'Anton',
    color: WHITE,
    valign: 'bottom',
  });
  slide.addImage({ path: ASSET('logo.png'), x: e(60), y: e(478), w: e(122), h: e(122) * LOGO_ASPECT });
  if (linkPlanos) {
    slide.addText(linkPlanos, {
      x: e(68),
      y: e(378),
      w: e(470),
      h: e(60),
      fontSize: 19,
      fontFace: 'Inter',
      color: WHITE,
      underline: { style: 'sng' },
      hyperlink: { url: linkPlanos },
    });
  }
  return slide;
}

function slideAgenda(pptx: Pptx, itens: string[]): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_lista.jpg');
  addPill(slide, 'IMPLEMENTAÇÃO CRM', 450, 22, 14);
  const n = itens.length;
  const top = 281 - n * 18;
  slide.addText(
    itens.map((item) => ({ text: `•   ${item}`, options: { breakLine: true } })),
    {
      x: e(35),
      y: e(top),
      w: e(820),
      h: e(n * 40),
      fontSize: 21,
      fontFace: 'Oswald',
      bold: true,
      color: WHITE,
      paraSpaceAfter: 4,
    },
  );
  addLogo(slide, true);
  return slide;
}

function slideCronograma(pptx: Pptx, etapas: [string, string][], prazo: string): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_cronograma.jpg');
  slide.addShape('rect', { x: e(10), y: e(143), w: e(3), h: e(410), fill: { color: RED_BLOCK }, line: { type: 'none' } });
  slide.addText('AS ETAPAS DO PROCESSO — KOMMO', {
    x: e(40),
    y: e(128),
    w: e(920),
    h: e(50),
    fontSize: 28,
    fontFace: 'Arial Black',
    color: WHITE,
    align: 'center',
  });

  const n = etapas.length;
  const span = 924;
  const gap = 14;
  const w = (span - gap * (n - 1)) / n;
  etapas.forEach(([rotulo, semana], i) => {
    const x = 38 + i * (w + gap);
    slide.addText(rotulo.split('\n').join('\n'), {
      x: e(x),
      y: e(190),
      w: e(w),
      h: e(40),
      fontSize: 10.5,
      fontFace: 'Arial',
      bold: true,
      color: WHITE,
      align: 'center',
      valign: 'bottom',
    });
    slide.addShape('parallelogram', {
      x: e(x),
      y: e(233),
      w: e(w),
      h: e(48),
      fill: { color: RED_BLOCK },
      line: { color: WHITE, width: 0.75, transparency: 25 },
    });
    slide.addText(semana, {
      x: e(x),
      y: e(233),
      w: e(w),
      h: e(48),
      fontSize: 13,
      fontFace: 'Arial',
      bold: true,
      color: WHITE,
      align: 'center',
      valign: 'middle',
    });
  });

  slide.addImage({ path: ASSET('car.png'), x: e(110), y: e(268), w: e(85), h: e(85) * CAR_ASPECT });
  slide.addShape('line', {
    x: e(38),
    y: e(323),
    w: e(962 - 38),
    h: 0,
    line: { color: WHITE, width: 1.5 },
  });
  slide.addText(prazo, {
    x: e(300),
    y: e(343),
    w: e(400),
    h: e(24),
    fontSize: 13,
    fontFace: 'Arial',
    bold: true,
    color: WHITE,
    align: 'center',
  });
  addLogo(slide, true);
  return slide;
}

function slideIndicadoresKickoff(pptx: Pptx, itens: string[]): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_cronograma.jpg');
  slide.addText('VISIBILIDADE DO NEGÓCIO', { x: e(16), y: e(24), w: e(600), h: e(20), fontSize: 9.5, bold: true, color: RED });
  slide.addText('O que você vai conseguir acompanhar', {
    x: e(16),
    y: e(56),
    w: e(900),
    h: e(44),
    fontSize: 26,
    bold: true,
    color: WHITE,
  });
  slide.addText('Com o funil configurado, esses indicadores ficam disponíveis direto no painel do CRM:', {
    x: e(16),
    y: e(108),
    w: e(900),
    h: e(20),
    fontSize: 8.5,
    color: GRAY,
  });
  slide.addShape('rect', { x: e(12), y: e(142), w: e(976), h: e(410), fill: { color: '000000', transparency: 45 }, line: { type: 'none' } });
  slide.addShape('rect', { x: e(12), y: e(142), w: e(3), h: e(410), fill: { color: RED }, line: { type: 'none' } });
  slide.addText('INDICADORES', { x: e(30), y: e(152), w: e(300), h: e(18), fontSize: 8.5, bold: true, color: RED });
  slide.addText(
    itens.map((item) => ({ text: `•   ${item}`, options: { breakLine: true } })),
    { x: e(30), y: e(174), w: e(940), h: e(370), fontSize: 13, color: WHITE, paraSpaceAfter: 14 },
  );
  addLogo(slide, true);
  return slide;
}

function slideProximosPassos(pptx: Pptx, itens: string[]): Slide {
  const slide = novoSlideComFundo(pptx, 'bg_proximos.jpg');
  slide.addText('ANTES DE COLOCAR EM PRÁTICA', { x: e(18), y: e(18), w: e(600), h: e(22), fontSize: 11, bold: true, color: RED });
  slide.addText('Próximos Passos', { x: e(18), y: e(58), w: e(700), h: e(44), fontSize: 28, bold: true, color: WHITE });
  slide.addText('O que iremos fazer a partir daqui', { x: e(18), y: e(122), w: e(700), h: e(20), fontSize: 9.5, color: GRAY });

  const n = itens.length;
  const top = 162;
  const bottom = 520;
  const gap = 12;
  const h = (bottom - top - gap * (n - 1)) / n;
  itens.forEach((item, i) => {
    const y = top + i * (h + gap);
    slide.addShape('rect', { x: e(12), y: e(y), w: e(976), h: e(h), fill: { color: WHITE, transparency: 94 }, line: { type: 'none' } });
    slide.addShape('rect', { x: e(12), y: e(y), w: e(3), h: e(h), fill: { color: RED }, line: { type: 'none' } });
    slide.addText(item, {
      x: e(35),
      y: e(y),
      w: e(900),
      h: e(h),
      fontSize: 12,
      italic: true,
      color: WHITE,
      valign: 'middle',
    });
  });
  addLogo(slide, true);
  return slide;
}

// Divide uma lista em grupos de até `tamanho` itens — a skill limita cada
// slide de indicadores a no máximo 5 itens.
function emGrupos<T>(itens: T[], tamanho: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) grupos.push(itens.slice(i, i + tamanho));
  return grupos;
}

export async function exportarKickoffPptx(
  nomeNegocio: string,
  funis: FunilGerado[],
  geracaoMeta: GeracaoMeta | null,
): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: LARGURA, height: ALTURA });
  pptx.layout = 'WIDE';

  // Fixos de abertura
  slideCapaKickoff(pptx, nomeNegocio.toUpperCase(), 'IMPLEMENTAÇÃO DE CRM');
  slideDivisoria(pptx, 'OBJETIVO DA\nREUNIÃO');
  slideAgenda(pptx, AGENDA_PADRAO);
  slideCronograma(pptx, CRONOGRAMA_PADRAO, PRAZO_PADRAO);
  slideDivisoria(pptx, 'VISÃO GERAL\nCRM');
  slideDivisoria(pptx, 'PLANOS E\nVALORES', LINK_PLANOS);

  // Conteúdo do(s) funil(is) — mesmas slides do pptx de playbook
  // (exportPptx.ts), já no visual escuro + vermelho da V4.
  if (geracaoMeta) slideMeta(pptx, geracaoMeta);
  funis.forEach((funil, indice) => {
    slidePipeline(pptx, funil, indice, funis.length);
    funil.etapas.forEach((etapa, i) => slideEtapa(pptx, etapa, i));
  });
  if (geracaoMeta) slidesValidarComCliente(pptx, geracaoMeta.pontos_para_validar);

  // Indicadores (até 5 por slide) e fixos de fechamento
  const indicadores = geracaoMeta?.indicadores_dashboard ?? [];
  emGrupos(indicadores, 5).forEach((grupo) => slideIndicadoresKickoff(pptx, grupo));
  slideDivisoria(pptx, 'PRÓXIMOS\nPASSOS');
  slideProximosPassos(pptx, PROXIMOS_PASSOS_PADRAO);
  slideCapaKickoff(pptx, 'VAMOS PRA CIMA', 'Nosso negócio é vender o seu!', true);

  await pptx.writeFile({ fileName: nomeArquivoKickoff(nomeNegocio) });
}
