// Leitura do Google Calendar via o "endereço secreto no formato iCal" que
// cada consultor gera sozinho (Configurações da agenda → Integrar agenda) —
// nenhuma autenticação, nenhuma política de compartilhamento envolvida, só
// um GET numa URL privada que só quem a possui conhece. Trade-off aceito:
// o feed privado do Google não inclui e-mails de convidados (só o dono vê
// isso), então a sugestão automática de cliente cai só no match por
// título/descrição; e não existe syncToken incremental em ICS — cada
// sincronização baixa o feed inteiro e compara com o que já tínhamos.

export type EventoIcs = {
  uid: string;
  titulo: string | null;
  descricao: string | null;
  inicio: string | null;
  fim: string | null;
  cancelado: boolean;
  meetLink: string | null;
};

function desdobrarLinhas(texto: string): string[] {
  // RFC 5545: uma linha de continuação começa com espaço ou tab e deve ser
  // colada na linha anterior, sem esse espaço.
  const linhasCruas = texto.split(/\r\n|\n|\r/);
  const linhas: string[] = [];
  for (const linha of linhasCruas) {
    if ((linha.startsWith(' ') || linha.startsWith('\t')) && linhas.length > 0) {
      linhas[linhas.length - 1] += linha.slice(1);
    } else {
      linhas.push(linha);
    }
  }
  return linhas;
}

function desescaparTexto(valor: string): string {
  return valor
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parsearLinhaPropriedade(linha: string): { nome: string; params: Record<string, string>; valor: string } | null {
  const indiceDoisPontos = linha.indexOf(':');
  if (indiceDoisPontos === -1) return null;

  const chave = linha.slice(0, indiceDoisPontos);
  const valor = linha.slice(indiceDoisPontos + 1);
  const [nome, ...partesParams] = chave.split(';');

  const params: Record<string, string> = {};
  for (const parte of partesParams) {
    const [k, v] = parte.split('=');
    if (k && v) params[k.toUpperCase()] = v;
  }

  return { nome: nome.toUpperCase(), params, valor };
}

function offsetMinutosParaFuso(dataUtcAproximada: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const partes = dtf.formatToParts(dataUtcAproximada).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const comoUtc = Date.UTC(
      Number(partes.year),
      Number(partes.month) - 1,
      Number(partes.day),
      Number(partes.hour),
      Number(partes.minute),
      Number(partes.second),
    );
    return (comoUtc - dataUtcAproximada.getTime()) / 60000;
  } catch {
    return 0;
  }
}

// Converte um DTSTART/DTEND do ICS (que pode vir em UTC com sufixo Z, em um
// fuso horário nomeado via TZID, ou só como data — evento de dia inteiro)
// pra um ISO string em UTC.
function converterDataIcs(propriedade: { params: Record<string, string>; valor: string } | undefined): string | null {
  if (!propriedade) return null;
  const valor = propriedade.valor.trim();

  if (propriedade.params.VALUE === 'DATE' || /^\d{8}$/.test(valor)) {
    const ano = Number(valor.slice(0, 4));
    const mes = Number(valor.slice(4, 6));
    const dia = Number(valor.slice(6, 8));
    return new Date(Date.UTC(ano, mes - 1, dia)).toISOString();
  }

  const m = valor.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, ano, mes, dia, hora, minuto, segundo, utcSufixo] = m;
  const componentes = [Number(ano), Number(mes), Number(dia), Number(hora), Number(minuto), Number(segundo)] as const;

  if (utcSufixo) {
    return new Date(Date.UTC(...componentes)).toISOString();
  }

  const timeZone = propriedade.params.TZID;
  if (!timeZone) {
    // Sem TZID e sem Z: horário "flutuante" — trata como UTC mesmo (melhor
    // aproximação possível sem mais contexto).
    return new Date(Date.UTC(...componentes)).toISOString();
  }

  const palpiteUtc = new Date(Date.UTC(...componentes));
  const offsetMinutos = offsetMinutosParaFuso(palpiteUtc, timeZone);
  return new Date(palpiteUtc.getTime() - offsetMinutos * 60000).toISOString();
}

const REGEX_MEET = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i;

export function parsearEventosIcs(icsTexto: string): EventoIcs[] {
  const linhas = desdobrarLinhas(icsTexto);
  const eventos: EventoIcs[] = [];

  let dentroDeEvento = false;
  let propriedadesAtual: { nome: string; params: Record<string, string>; valor: string }[] = [];

  for (const linha of linhas) {
    if (linha === 'BEGIN:VEVENT') {
      dentroDeEvento = true;
      propriedadesAtual = [];
      continue;
    }
    if (linha === 'END:VEVENT') {
      dentroDeEvento = false;

      const porNome = (nome: string) => propriedadesAtual.find((p) => p.nome === nome);
      const uid = porNome('UID')?.valor;
      if (uid) {
        const summary = porNome('SUMMARY');
        const description = porNome('DESCRIPTION');
        const location = porNome('LOCATION');
        const status = porNome('STATUS')?.valor?.toUpperCase();

        const textoParaMeet = `${description?.valor ?? ''} ${location?.valor ?? ''}`;
        const meetMatch = textoParaMeet.match(REGEX_MEET);

        eventos.push({
          uid,
          titulo: summary ? desescaparTexto(summary.valor) : null,
          descricao: description ? desescaparTexto(description.valor) : null,
          inicio: converterDataIcs(porNome('DTSTART')),
          fim: converterDataIcs(porNome('DTEND')),
          cancelado: status === 'CANCELLED',
          meetLink: meetMatch ? meetMatch[0] : null,
        });
      }
      continue;
    }
    if (!dentroDeEvento) continue;

    const propriedade = parsearLinhaPropriedade(linha);
    if (propriedade) propriedadesAtual.push(propriedade);
  }

  return eventos;
}

export async function buscarEventosIcs(icalUrl: string): Promise<EventoIcs[]> {
  const res = await fetch(icalUrl);
  if (!res.ok) {
    throw new Error(`Falha ao buscar o feed iCal (${res.status}): ${await res.text()}`);
  }
  const texto = await res.text();
  return parsearEventosIcs(texto);
}
