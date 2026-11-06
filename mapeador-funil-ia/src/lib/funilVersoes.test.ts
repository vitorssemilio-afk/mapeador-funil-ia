import { describe, expect, it } from 'vitest';
import { statusMapeamentoPorValidacao } from './funilVersoes';

// Prompt 64, Bloco 2 (seção 14): Kickoff realizado não significa funil
// automaticamente validado — só "sem_ajustes"/"pequenos_ajustes" aprovam; só
// "precisa_revisar" gera ajustes_solicitados. "Validação pendente" é
// implícita: enquanto essa função não é chamada, nada muda.
describe('statusMapeamentoPorValidacao', () => {
  it('sem ajustes: funil_validado', () => {
    expect(statusMapeamentoPorValidacao('sem_ajustes')).toBe('funil_validado');
  });

  it('pequenos ajustes: ainda conta como funil_validado (aprovado, com ressalvas)', () => {
    expect(statusMapeamentoPorValidacao('pequenos_ajustes')).toBe('funil_validado');
  });

  it('precisa revisar: ajustes_solicitados, nunca funil_validado', () => {
    expect(statusMapeamentoPorValidacao('precisa_revisar')).toBe('ajustes_solicitados');
  });
});
