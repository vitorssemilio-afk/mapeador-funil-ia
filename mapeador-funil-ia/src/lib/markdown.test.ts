// Prompt 63, seções 9-11 — splitTextoLivreEmItens decide se um campo manual
// da ata (texto livre, sem metadados) é mostrado como lista ou como
// parágrafo único; nunca pode inventar uma divisão que o texto não tem.
import { describe, expect, it } from 'vitest';
import { splitTextoLivreEmItens } from './markdown';

describe('splitTextoLivreEmItens', () => {
  it('retorna null para vazio/nulo — sem conteúdo inventado', () => {
    expect(splitTextoLivreEmItens(null)).toBeNull();
    expect(splitTextoLivreEmItens('')).toBeNull();
    expect(splitTextoLivreEmItens('   ')).toBeNull();
  });

  it('retorna null para uma única linha — vira parágrafo, não lista', () => {
    expect(splitTextoLivreEmItens('Enviar e-mail principal para criação da conta CRM')).toBeNull();
  });

  it('divide em itens quando o texto já tem várias linhas', () => {
    const texto = 'Enviar e-mail principal\nAgendar treinamento da equipe\nVerificar WhatsApp';
    expect(splitTextoLivreEmItens(texto)).toEqual([
      'Enviar e-mail principal',
      'Agendar treinamento da equipe',
      'Verificar WhatsApp',
    ]);
  });

  it('remove marcadores de lista (-, *, •, numeração) sem alterar o conteúdo', () => {
    const texto = '- Primeiro item\n* Segundo item\n• Terceiro item\n1. Quarto item';
    expect(splitTextoLivreEmItens(texto)).toEqual(['Primeiro item', 'Segundo item', 'Terceiro item', 'Quarto item']);
  });

  it('ignora linhas em branco entre itens', () => {
    const texto = 'Item A\n\nItem B\n\n';
    expect(splitTextoLivreEmItens(texto)).toEqual(['Item A', 'Item B']);
  });
});
