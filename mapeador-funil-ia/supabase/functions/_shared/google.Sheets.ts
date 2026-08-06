// Cliente mínimo pra escrever no Google Sheets via conta de serviço (JWT
// assinado com a chave privada, trocado por um access token OAuth2), sem
// depender de nenhuma lib externa — só fetch + Web Crypto, que o Deno já tem.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

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

async function obterAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const encoder = new TextEncoder();
  const agora = Math.floor(Date.now() / 1000);

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: agora,
        exp: agora + 3600,
      }),
    ),
  );
  const semAssinatura = `${header}.${claims}`;

  const chave = await importarChavePrivada(privateKeyPem);
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    chave,
    encoder.encode(semAssinatura),
  );
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
    throw new Error(`Falha ao autenticar no Google: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function colunaParaLetra(indiceBase0: number): string {
  let n = indiceBase0 + 1;
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

async function obterPrimeiraAba(spreadsheetId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao ler a planilha: ${await res.text()}`);
  const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  const titulo = data.sheets?.[0]?.properties?.title;
  if (!titulo) throw new Error('A planilha não tem nenhuma aba.');
  return titulo;
}

function faixa(aba: string, ref: string): string {
  return encodeURIComponent(`${aba}!${ref}`);
}

async function lerValores(
  spreadsheetId: string,
  aba: string,
  ref: string,
  accessToken: string,
): Promise<string[][]> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${faixa(aba, ref)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao ler valores da planilha: ${await res.text()}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function escreverValores(
  spreadsheetId: string,
  aba: string,
  ref: string,
  valores: string[][],
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${faixa(aba, ref)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: valores }),
    },
  );
  if (!res.ok) throw new Error(`Falha ao gravar na planilha: ${await res.text()}`);
}

async function apendarValores(
  spreadsheetId: string,
  aba: string,
  valores: string[][],
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${faixa(aba, 'A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: valores }),
    },
  );
  if (!res.ok) throw new Error(`Falha ao adicionar linha na planilha: ${await res.text()}`);
}

// Google Sheets interpreta uma célula que começa com =, +, -, @ como fórmula
// mesmo escrevendo via API — prefixar com aspas simples força texto literal,
// igual o "colar como texto" da própria interface do Sheets.
function sanitizarCelula(valor: string): string {
  if (/^[=+\-@]/.test(valor)) return `'${valor}`;
  return valor;
}

export type ServiceAccountCredenciais = {
  client_email: string;
  private_key: string;
};

// Garante que a linha desse `idUnico` (coluna A) esteja atualizada na
// planilha — cria a linha se ainda não existir, atualiza se já existir — e
// mantém o cabeçalho (linha 1) sincronizado com as colunas desejadas.
export async function sincronizarLinhaGoogleSheets(params: {
  credenciais: ServiceAccountCredenciais;
  spreadsheetId: string;
  cabecalho: string[];
  idUnico: string;
  linha: string[];
}): Promise<void> {
  const { credenciais, spreadsheetId, cabecalho, idUnico, linha } = params;

  const accessToken = await obterAccessToken(credenciais.client_email, credenciais.private_key);
  const aba = await obterPrimeiraAba(spreadsheetId, accessToken);
  const ultimaColuna = colunaParaLetra(cabecalho.length - 1);

  const cabecalhoAtual = await lerValores(spreadsheetId, aba, `A1:${ultimaColuna}1`, accessToken);
  const cabecalhoAtualPlano = cabecalhoAtual[0] ?? [];
  const cabecalhoDiferente =
    cabecalhoAtualPlano.length !== cabecalho.length ||
    cabecalho.some((coluna, i) => cabecalhoAtualPlano[i] !== coluna);

  if (cabecalhoDiferente) {
    await escreverValores(spreadsheetId, aba, `A1:${ultimaColuna}1`, [cabecalho], accessToken);
  }

  const linhaSanitizada = linha.map(sanitizarCelula);

  const colunaId = await lerValores(spreadsheetId, aba, 'A2:A', accessToken);
  const indiceExistente = colunaId.findIndex((row) => row[0] === idUnico);

  if (indiceExistente >= 0) {
    const numeroLinha = indiceExistente + 2; // +2: compensa índice 0 e a linha de cabeçalho
    await escreverValores(
      spreadsheetId,
      aba,
      `A${numeroLinha}:${ultimaColuna}${numeroLinha}`,
      [linhaSanitizada],
      accessToken,
    );
  } else {
    await apendarValores(spreadsheetId, aba, [linhaSanitizada], accessToken);
  }
}
