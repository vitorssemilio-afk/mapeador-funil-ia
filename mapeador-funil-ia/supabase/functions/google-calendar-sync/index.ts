// Sincronização periódica dos calendários dos consultores (polling, não
// webhook — ver decisão registrada na migration 0042 e no PR). Pensado pra
// ser chamado por um cron job (pg_cron + pg_net) com a service role key,
// não pelo navegador do usuário: por isso usa a service role (ignora RLS) e
// não depende de sessão de usuário nenhuma.
//
// Pra cada consultor com google_calendar_id configurado:
//   1. busca o que mudou no Google Calendar desde a última sincronização
//      (ou uma janela de -7/+120 dias, na primeira vez);
//   2. espelha em google_calendar_eventos_pendentes, com sugestão de
//      cliente/tipo quando ainda não está vinculado a uma reunião;
//   3. se já está vinculado a uma reunião: atualiza data/meet-link, registra
//      remarcação em auditoria quando o horário muda, e marca como
//      cancelada quando o evento é cancelado no Google (nunca sobrescreve
//      uma reunião já 'realizada').
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buscarEventosCalendar,
  dataHoraDoEvento,
  extrairMeetLink,
  obterAccessTokenCalendar,
  statusGoogleParaInterno,
  type EventoGoogleCalendar,
  type ServiceAccountCredenciais,
} from '../_shared/googleCalendar.ts';
import { sugerirClienteParaEvento, sugerirTipoParaEvento } from '../../../src/lib/googleCalendarEventos.ts';
import type { Cliente, ClienteContato, Consultor, Reuniao } from '../../../src/types/database.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function sincronizarConsultor(params: {
  supabase: SupabaseClient;
  consultor: Consultor;
  credenciais: ServiceAccountCredenciais;
  clientes: Cliente[];
  contatos: ClienteContato[];
}): Promise<{ consultorId: string; eventosProcessados: number; erro?: string }> {
  const { supabase, consultor, credenciais, clientes, contatos } = params;
  const calendarId = consultor.google_calendar_id!;

  try {
    const accessToken = await obterAccessTokenCalendar(credenciais);
    const { eventos, nextSyncToken, syncTokenInvalido } = await buscarEventosCalendar({
      accessToken,
      calendarId,
      syncToken: consultor.google_calendar_sync_token,
    });

    for (const evento of eventos) {
      await processarEvento({ supabase, consultor, calendarId, evento, clientes, contatos });
    }

    await supabase
      .from('consultores')
      .update({
        google_calendar_sync_token: nextSyncToken ?? (syncTokenInvalido ? null : consultor.google_calendar_sync_token),
        google_calendar_sincronizado_em: new Date().toISOString(),
      })
      .eq('id', consultor.id);

    return { consultorId: consultor.id, eventosProcessados: eventos.length };
  } catch (err) {
    return { consultorId: consultor.id, eventosProcessados: 0, erro: err instanceof Error ? err.message : String(err) };
  }
}

async function processarEvento(params: {
  supabase: SupabaseClient;
  consultor: Consultor;
  calendarId: string;
  evento: EventoGoogleCalendar;
  clientes: Cliente[];
  contatos: ClienteContato[];
}): Promise<void> {
  const { supabase, consultor, calendarId, evento, clientes, contatos } = params;

  const statusGoogle = statusGoogleParaInterno(evento.status);
  const dataInicio = dataHoraDoEvento(evento.start);
  const dataFim = dataHoraDoEvento(evento.end);
  const meetLink = extrairMeetLink(evento);
  const attendees = evento.attendees?.map((a) => ({ email: a.email, displayName: a.displayName })) ?? null;

  const { data: cacheExistente } = await supabase
    .from('google_calendar_eventos_pendentes')
    .select('*')
    .eq('consultor_id', consultor.id)
    .eq('google_event_id', evento.id)
    .maybeSingle();

  const sugestaoClienteId =
    cacheExistente?.reuniao_id != null
      ? cacheExistente.sugestao_cliente_id
      : sugerirClienteParaEvento({
          attendees,
          titulo: evento.summary ?? null,
          descricao: evento.description ?? null,
          clientes,
          contatos,
        });
  const sugestaoTipo =
    cacheExistente?.reuniao_id != null
      ? cacheExistente.sugestao_tipo
      : sugerirTipoParaEvento({ titulo: evento.summary ?? null, descricao: evento.description ?? null });

  await supabase.from('google_calendar_eventos_pendentes').upsert(
    {
      consultor_id: consultor.id,
      google_calendar_id: calendarId,
      google_event_id: evento.id,
      titulo: evento.summary ?? null,
      descricao: evento.description ?? null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      meet_link: meetLink,
      attendees,
      status_google: statusGoogle,
      reuniao_id: cacheExistente?.reuniao_id ?? null,
      sugestao_cliente_id: sugestaoClienteId,
      sugestao_tipo: sugestaoTipo,
    },
    { onConflict: 'consultor_id,google_event_id' },
  );

  if (!cacheExistente?.reuniao_id) return;

  const { data: reuniao } = await supabase
    .from('reunioes')
    .select('*')
    .eq('id', cacheExistente.reuniao_id)
    .maybeSingle<Reuniao>();
  if (!reuniao) return;

  // Uma reunião já confirmada como realizada nunca é tocada de volta pela
  // sincronização — a fonte de verdade sobre "aconteceu de fato" é sempre
  // uma confirmação manual do consultor, nunca o Google Calendar.
  if (reuniao.status === 'realizada') return;

  if (statusGoogle === 'cancelled') {
    if (reuniao.status !== 'cancelada') {
      await supabase
        .from('reunioes')
        .update({ status: 'cancelada', google_status: 'cancelled' })
        .eq('id', reuniao.id);
    }
    return;
  }

  const patch: Partial<Reuniao> = {
    google_status: 'confirmed',
    google_meet_link: meetLink,
  };
  // Evento reativado no Google depois de ter sido cancelado por lá — volta
  // a ficar agendado; qualquer outro status manual (agendada/remarcada/
  // compareceu ou não) é decisão do consultor e não é sobrescrita aqui.
  if (reuniao.status === 'cancelada') {
    patch.status = 'agendada';
  }

  if (dataInicio && reuniao.data_hora !== dataInicio) {
    await supabase.from('reuniao_remarcacoes').insert({
      reuniao_id: reuniao.id,
      data_anterior: reuniao.data_hora,
      data_nova: dataInicio,
      motivo: 'Remarcado no Google Calendar',
      responsavel_impacto: 'outro',
    });
    patch.data_hora = dataInicio;
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from('reunioes').update(patch).eq('id', reuniao.id);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const serviceAccountRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountRaw) {
    return jsonResponse({ error: 'Secret GOOGLE_SERVICE_ACCOUNT_JSON não configurado.' }, 500);
  }

  let credenciais: ServiceAccountCredenciais;
  try {
    credenciais = JSON.parse(serviceAccountRaw);
  } catch {
    return jsonResponse({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' }, 500);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [{ data: consultores, error: consultoresError }, { data: clientes }, { data: contatos }] = await Promise.all([
    supabase.from('consultores').select('*').eq('ativo', true).not('google_calendar_id', 'is', null),
    supabase.from('clientes').select('*'),
    supabase.from('cliente_contatos').select('*'),
  ]);

  if (consultoresError) {
    return jsonResponse({ error: consultoresError.message }, 500);
  }

  const resultados = [];
  for (const consultor of (consultores ?? []) as Consultor[]) {
    resultados.push(
      await sincronizarConsultor({
        supabase,
        consultor,
        credenciais,
        clientes: (clientes ?? []) as Cliente[],
        contatos: (contatos ?? []) as ClienteContato[],
      }),
    );
  }

  return jsonResponse({ sincronizados: resultados.length, resultados });
});
