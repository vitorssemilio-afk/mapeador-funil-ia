// Prompt 63, seção 14 — o App de Atas manda o conteúdo em Markdown simples
// (títulos, negrito, itálico, listas, links), mas a tela mostrava o texto
// bruto (ex.: "*Ata de Reunião*" aparecia com os asteriscos literais). Este
// renderer cobre só o subconjunto realmente usado pelas atas — sem
// dependência nova e, por nunca passar por dangerouslySetInnerHTML (cada
// elemento nasce como nó React, nunca como string HTML), não existe canal
// pra executar HTML/script vindo do conteúdo externo.
import type { ReactNode } from 'react';
import { Fragment } from 'react';

function renderInline(texto: string, keyPrefix: string): ReactNode[] {
  // Ordem importa: **negrito** antes de *itálico*, senão "**x**" seria lido
  // como itálico de "*x*". Cada regra consome o trecho e segue a partir daí.
  const partes: ReactNode[] = [];
  let resto = texto;
  let i = 0;

  const regexes: Array<{ re: RegExp; render: (m: RegExpMatchArray, key: string) => ReactNode }> = [
    { re: /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/, render: (m, key) => (
      <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
        {m[1]}
      </a>
    ) },
    { re: /^\*\*([^*]+)\*\*/, render: (m, key) => <strong key={key}>{m[1]}</strong> },
    { re: /^__([^_]+)__/, render: (m, key) => <strong key={key}>{m[1]}</strong> },
    { re: /^\*([^*]+)\*/, render: (m, key) => <em key={key}>{m[1]}</em> },
    { re: /^_([^_]+)_/, render: (m, key) => <em key={key}>{m[1]}</em> },
    { re: /^`([^`]+)`/, render: (m, key) => <code key={key}>{m[1]}</code> },
  ];

  while (resto.length > 0) {
    let casou = false;
    for (const { re, render } of regexes) {
      const m = resto.match(re);
      if (m) {
        partes.push(render(m, `${keyPrefix}-${i++}`));
        resto = resto.slice(m[0].length);
        casou = true;
        break;
      }
    }
    if (!casou) {
      // Avança até o próximo caractere "especial" (ou o fim da string) e
      // empurra o texto puro acumulado como um nó só.
      const proximo = resto.slice(1).search(/[*_`[]/);
      const corte = proximo === -1 ? resto.length : proximo + 1;
      partes.push(<Fragment key={`${keyPrefix}-${i++}`}>{resto.slice(0, corte)}</Fragment>);
      resto = resto.slice(corte);
    }
  }
  return partes;
}

type Bloco =
  | { tipo: 'heading'; nivel: 1 | 2 | 3; texto: string }
  | { tipo: 'lista'; ordenada: boolean; itens: string[] }
  | { tipo: 'paragrafo'; linhas: string[] };

function parseBlocos(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  const blocos: Bloco[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    if (linha.trim() === '') {
      i++;
      continue;
    }

    const heading = linha.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocos.push({ tipo: 'heading', nivel: heading[1].length as 1 | 2 | 3, texto: heading[2].trim() });
      i++;
      continue;
    }

    const listaItem = linha.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (listaItem) {
      const ordenada = /\d/.test(listaItem[1]);
      const itens: string[] = [];
      while (i < linhas.length) {
        const m = linhas[i].match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        itens.push(m[2].trim());
        i++;
      }
      blocos.push({ tipo: 'lista', ordenada, itens });
      continue;
    }

    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i].trim() !== '' && !linhas[i].match(/^(#{1,3})\s+/) && !linhas[i].match(/^\s*([-*•]|\d+[.)])\s+/)) {
      paragrafo.push(linhas[i].trim());
      i++;
    }
    blocos.push({ tipo: 'paragrafo', linhas: paragrafo });
  }

  return blocos;
}

/** Prompt 63, seções 9-11 — os campos manuais da reunião (pendências do
 *  cliente/internas, próximos passos) são texto livre, sem metadados de
 *  responsável/prazo. Só divide em itens quando o próprio texto já tem
 *  linhas/marcadores separados (nunca inventa estrutura); com uma linha só,
 *  devolve null pra o chamador tratar como parágrafo único. */
export function splitTextoLivreEmItens(texto: string | null | undefined): string[] | null {
  if (!texto || !texto.trim()) return null;
  const linhas = texto
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))
    .filter((l) => l.length > 0);
  return linhas.length > 1 ? linhas : null;
}

/** Renderiza um subconjunto seguro de Markdown (títulos, negrito, itálico,
 *  código inline, links, listas, parágrafos com quebra de linha) como nós
 *  React — nunca como HTML. Preserva o texto original armazenado; isto é só
 *  apresentação. */
export function renderMarkdown(texto: string | null | undefined): ReactNode {
  if (!texto || !texto.trim()) return null;
  const blocos = parseBlocos(texto);
  const TAG_HEADING = { 1: 'h4', 2: 'h5', 3: 'h6' } as const;

  return (
    <div className="ata-markdown">
      {blocos.map((bloco, idx) => {
        if (bloco.tipo === 'heading') {
          const Tag = TAG_HEADING[bloco.nivel];
          return <Tag key={idx}>{renderInline(bloco.texto, `h${idx}`)}</Tag>;
        }
        if (bloco.tipo === 'lista') {
          const ListTag = bloco.ordenada ? 'ol' : 'ul';
          return (
            <ListTag key={idx}>
              {bloco.itens.map((item, i) => (
                <li key={i}>{renderInline(item, `l${idx}-${i}`)}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={idx}>
            {bloco.linhas.map((linha, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {renderInline(linha, `p${idx}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
