// Regra de sugestão automática de cliente/tipo pra um evento importado do
// Google Calendar (ver supabase/functions/google-calendar-sync) — usada
// tanto pelo edge function (ao sincronizar) quanto, se preciso, por uma
// pré-visualização no front-end. Nunca vincula sozinha: só sugere, o
// consultor sempre confirma antes de criar/atualizar a reunião.
import type { Cliente, ClienteContato, TipoReuniao } from '../types/database';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function sugerirClienteParaEvento(params: {
  attendees: { email: string }[] | null;
  titulo: string | null;
  descricao: string | null;
  clientes: Cliente[];
  contatos: ClienteContato[];
}): string | null {
  const { attendees, titulo, descricao, clientes, contatos } = params;

  const emailsConvidados = new Set((attendees ?? []).map((a) => a.email?.toLowerCase().trim()).filter(Boolean));
  if (emailsConvidados.size > 0) {
    const contatoBatido = contatos.find((c) => c.email && emailsConvidados.has(c.email.toLowerCase().trim()));
    if (contatoBatido) return contatoBatido.cliente_id;
  }

  const textoEvento = normalizar(`${titulo ?? ''} ${descricao ?? ''}`);
  if (!textoEvento) return null;

  const candidatos = clientes.filter((cliente) =>
    [cliente.nome_fantasia, cliente.razao_social, cliente.nome_empresa]
      .filter((nome): nome is string => !!nome && nome.trim().length >= 3)
      .some((nome) => textoEvento.includes(normalizar(nome))),
  );

  // Mais de um cliente bate no texto: ambíguo, melhor deixar em branco pro
  // consultor escolher do que arriscar vincular ao cliente errado.
  if (candidatos.length !== 1) return null;
  return candidatos[0].id;
}

const PALAVRAS_CHAVE_TIPO: { tipo: TipoReuniao; palavras: string[] }[] = [
  { tipo: 'kickoff', palavras: ['kickoff', 'kick-off', 'kick off'] },
  { tipo: 'treinamento', palavras: ['treinamento', 'training'] },
  { tipo: 'checkin_1', palavras: ['check-in 1', 'checkin 1', 'check in 1', 'checkin1'] },
  { tipo: 'checkin_2', palavras: ['check-in 2', 'checkin 2', 'check in 2', 'checkin2'] },
  { tipo: 'tira_duvidas', palavras: ['tira-duvida', 'tira duvida', 'duvida'] },
  { tipo: 'reuniao_final', palavras: ['reuniao final', 'entrega', 'encerramento'] },
];

export function sugerirTipoParaEvento(params: { titulo: string | null; descricao: string | null }): TipoReuniao | null {
  const texto = normalizar(`${params.titulo ?? ''} ${params.descricao ?? ''}`);
  if (!texto) return null;

  for (const { tipo, palavras } of PALAVRAS_CHAVE_TIPO) {
    if (palavras.some((palavra) => texto.includes(palavra))) return tipo;
  }
  return null;
}
