// Autenticação e leitura do Google Calendar via a mesma conta de serviço já
// usada pra Sheets (GOOGLE_SERVICE_ACCOUNT_JSON) — cada consultor precisa
// compartilhar seu calendário com o e-mail dessa conta de serviço (permissão
// "Ver todos os detalhes do evento"). Só leitura: nenhum evento é criado ou
// alterado no Google, apenas lido e espelhado no banco.

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function base64Url(bytes: Uint8Array): string {
  let binario = '';
  bytes.forEach((b) => (binario += String.fromCharCode(b)));
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importarChavePrivada(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export type ServiceAccountCredenciais = {
  client_email: string;
  private_key: string;
};

export async function obterAccessTokenCalendar(credenciais: ServiceAccountCredenciais): Promise<string> {
  const encoder = new TextEncoder();
  const agora = Math.floor(Date.now() / 1000);

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: credenciais.client_email,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: agora,
        exp: agora + 3600,
      }),
    ),
  );
  const semAssinatura = `${header}.${claims}`;

  const chave = await importarChavePrivada(credenciais.private_key);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, encoder.encode(semAssinatura));
  const jwt = `${semAssinatura}.${base64Url(new Uint8Array(assinatura))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao autenticar no Google Calendar: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type EventoGoogleCalendar = {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  attendees?: { email: string; displayName?: string }[];
};

export type PaginaEventosCalendar = {
  eventos: EventoGoogleCalendar[];
  nextSyncToken: string | null;
  syncTokenInvalido: boolean;
};

function extrairMeetLink(evento: EventoGoogleCalendar): string | null {
  if (evento.hangoutLink) return evento.hangoutLink;
  const entryPoint = evento.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return entryPoint?.uri ?? null;
}

export function dataHoraDoEvento(campo?: { dateTime?: string; date?: string }): string | null {
  if (!campo) return null;
  return campo.dateTime ?? (campo.date ? new Date(`${campo.date}T00:00:00Z`).toISOString() : null);
}

export { extrairMeetLink };

// Busca todos os eventos alterados desde `syncToken` (incremental) ou, sem
// token (primeira sincronização), os eventos de uma janela fixa em torno de
// hoje. O Google não permite combinar syncToken com timeMin/timeMax — por
// isso a primeira sincronização de cada calendário é sempre uma janela, e só
// a partir da segunda passamos a usar o token incremental.
export async function buscarEventosCalendar(params: {
  accessToken: string;
  calendarId: string;
  syncToken: string | null;
}): Promise<PaginaEventosCalendar> {
  const { accessToken, calendarId } = params;
  let eventos: EventoGoogleCalendar[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let syncToken = params.syncToken;
  let syncTokenInvalido = false;

  for (;;) {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    if (syncToken) {
      url.searchParams.set('syncToken', syncToken);
    } else {
      const agora = new Date();
      const inicio = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fim = new Date(agora.getTime() + 120 * 24 * 60 * 60 * 1000);
      url.searchParams.set('timeMin', inicio.toISOString());
      url.searchParams.set('timeMax', fim.toISOString());
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (res.status === 410 && syncToken) {
      // syncToken expirado/inválido — descarta e refaz do zero como primeira sincronização.
      syncTokenInvalido = true;
      syncToken = null;
      pageToken = undefined;
      eventos = [];
      continue;
    }

    if (!res.ok) {
      throw new Error(`Falha ao listar eventos do Google Calendar: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      items?: EventoGoogleCalendar[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    eventos.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    if (!pageToken) break;
  }

  return { eventos, nextSyncToken, syncTokenInvalido };
}

export function statusGoogleParaInterno(status: EventoGoogleCalendar['status']): 'confirmed' | 'cancelled' {
  return status === 'cancelled' ? 'cancelled' : 'confirmed';
}
