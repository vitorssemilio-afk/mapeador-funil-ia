// Sincronização periódica dos calendários dos consultores via o "endereço
// secreto no formato iCal" que cada um gera sozinho (ver migration 0043 —
// trocamos da API com conta de serviço pra isso porque a v4company restringe
// compartilhamento externo de agenda e não quer abrir exceção nem via
// delegação em todo o domínio). Pensado pra ser chamado por um cron job
// (pg_cron + pg_net) com a service role key, não pelo navegador do usuário.
//
// Pra cada consultor com google_calendar_ical_url configurado:
//   1. baixa o feed ICS inteiro (não existe sync incremental em iCal);
//   2. espelha em google_calendar_eventos_pendentes, com sugestão de
//      cliente/tipo quando ainda não está vinculado a uma reunião (só por
//      título/descrição — o feed privado não traz e-mails de convidados);
//   3. se já está vinculado a uma reunião: atualiza data/meet-link, registra
//      remarcação em auditoria quando o horário muda, e marca como
//      cancelada quando o evento some do feed ou vem com STATUS:CANCELLED
//      (nunca sobrescreve uma reunião já 'realizada').
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import { buscarEventosIcs, type EventoIcs } from '../_shared/googleCalendarIcs.ts';
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
  clientes: Cliente[];
  contatos: ClienteContato[];
}): Promise<{ consultorId: string; eventosProcessados: number; erro?: string }> {
  const { supabase, consultor, clientes, contatos } = params;

  try {
    const eventos = await buscarEventosIcs(consultor.google_calendar_ical_url!);
    const uidsNoFeed = new Set(eventos.map((e) => e.uid));

    for (const evento of eventos) {
      await processarEvento({ supabase, consultor, evento, cancelado: evento.cancelado, clientes, contatos });
    }

    // Um evento que sumiu do feed (não veio nem com STATUS:CANCELLED) é
    // tratado como cancelado também — o Google às vezes só remove em vez de
    // marcar o status.
    const { data: cacheDesseConsultor } = await supabase
      .from('google_calendar_eventos_pendentes')
      .select('*')
      .eq('consultor_id', consultor.id)
      .eq('status_google', 'confirmed');

    for (const cache of cacheDesseConsultor ?? []) {
      if (uidsNoFeed.has(cache.google_event_id)) continue;
      await processarEvento({
        supabase,
        consultor,
        evento: {
          uid: cache.google_event_id,
          titulo: cache.titulo,
          descricao: cache.descricao,
          inicio: cache.data_inicio,
          fim: cache.data_fim,
          cancelado: true,
          meetLink: cache.meet_link,
        },
        cancelado: true,
        clientes,
        contatos,
      });
    }

    await supabase
      .from('consultores')
      .update({ google_calendar_sincronizado_em: new Date().toISOString() })
      .eq('id', consultor.id);

    return { consultorId: consultor.id, eventosProcessados: eventos.length };
  } catch (err) {
    return { consultorId: consultor.id, eventosProcessados: 0, erro: err instanceof Error ? err.message : String(err) };
  }
}

async function processarEvento(params: {
  supabase: SupabaseClient;
  consultor: Consultor;
  evento: EventoIcs;
  cancelado: boolean;
  clientes: Cliente[];
  contatos: ClienteContato[];
}): Promise<void> {
  const { supabase, consultor, evento, cancelado, clientes, contatos } = params;
  const statusGoogle: 'confirmed' | 'cancelled' = cancelado ? 'cancelled' : 'confirmed';

  const { data: cacheExistente } = await supabase
    .from('google_calendar_eventos_pendentes')
    .select('*')
    .eq('consultor_id', consultor.id)
    .eq('google_event_id', evento.uid)
    .maybeSingle();

  // O feed privado não traz e-mails de convidados, então o match automático
  // aqui é só por título/descrição.
  const sugestaoClienteId =
    cacheExistente?.reuniao_id != null
      ? cacheExistente.sugestao_cliente_id
      : sugerirClienteParaEvento({
          attendees: null,
          titulo: evento.titulo,
          descricao: evento.descricao,
          clientes,
          contatos,
        });
  const sugestaoTipo =
    cacheExistente?.reuniao_id != null
      ? cacheExistente.sugestao_tipo
      : sugerirTipoParaEvento({ titulo: evento.titulo, descricao: evento.descricao });

  await supabase.from('google_calendar_eventos_pendentes').upsert(
    {
      consultor_id: consultor.id,
      google_calendar_id: consultor.id,
      google_event_id: evento.uid,
      titulo: evento.titulo,
      descricao: evento.descricao,
      data_inicio: evento.inicio,
      data_fim: evento.fim,
      meet_link: evento.meetLink,
      attendees: null,
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
    google_meet_link: evento.meetLink,
  };
  // Evento reativado no Google depois de ter sido cancelado por lá — volta
  // a ficar agendado; qualquer outro status manual (agendada/remarcada/
  // compareceu ou não) é decisão do consultor e não é sobrescrita aqui.
  if (reuniao.status === 'cancelada') {
    patch.status = 'agendada';
  }

  if (evento.inicio && reuniao.data_hora !== evento.inicio) {
    await supabase.from('reuniao_remarcacoes').insert({
      reuniao_id: reuniao.id,
      data_anterior: reuniao.data_hora,
      data_nova: evento.inicio,
      motivo: 'Remarcado no Google Calendar',
      responsavel_impacto: 'outro',
    });
    patch.data_hora = evento.inicio;
  }

  await supabase.from('reunioes').update(patch).eq('id', reuniao.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [{ data: consultores, error: consultoresError }, { data: clientes }, { data: contatos }] = await Promise.all([
    supabase.from('consultores').select('*').eq('ativo', true).not('google_calendar_ical_url', 'is', null),
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
        clientes: (clientes ?? []) as Cliente[],
        contatos: (contatos ?? []) as ClienteContato[],
      }),
    );
  }

  return jsonResponse({ sincronizados: resultados.length, resultados });
});
