// Helpers compartilhados sobre `consultores` — extraído daqui em vez de
// duplicado entre Consultores.tsx e UserMenu.tsx (mesmo rótulo de papel,
// mesma forma de buscar "o consultor do usuário logado").
import { supabase } from './supabaseClient';
import type { Consultor, PapelConsultor } from '../types/database';

export const PAPEL_LABELS: Record<PapelConsultor, string> = {
  administrador: 'Administrador',
  consultor: 'Consultor',
  consultor_apoio: 'Consultor de apoio',
};

// "Vítor Emílio" → "Vítor" (seção 11 do prompt: header mostra só o
// primeiro nome, o resto fica no menu completo).
export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] ?? nomeCompleto;
}

// "Vítor Emílio" → "VE" · "Vítor" → "VI" (duas letras também quando só
// há um nome, pra nunca cair num avatar de letra única desequilibrado).
export function iniciais(nomeOuEmail: string): string {
  const partes = nomeOuEmail.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Linha do próprio usuário logado em `consultores` — null quando a
// conta de auth ainda não foi vinculada a um consultor (não deveria
// acontecer no uso normal, mas a UI trata isso sem quebrar).
export async function buscarMeuConsultor(userId: string): Promise<Consultor | null> {
  const { data } = await supabase.from('consultores').select('*').eq('user_id', userId).maybeSingle();
  return data ?? null;
}
