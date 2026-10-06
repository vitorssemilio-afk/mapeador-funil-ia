// Bloco "Marcos do ciclo" — separado das atividades de propósito (redesign
// da tela de checklist, seção 25 do pedido): marco é um evento do processo
// com data própria em `clientes` (Kickoff, Funil validado, Conta Kommo
// solicitada/criada, Treinamento), atividade é uma tarefa de execução. Não
// inventa fonte de dado nova — cada marco aqui já vem resolvido por
// resolverMarcoSimples/resolverMarcoAgendavel (mesma lógica usada em toda a
// tela de implementação), incluindo o estado "concluído sem data" quando
// uma etapa posterior já prova que esta aconteceu.
import type { AtividadeResolvida } from '../../lib/atividadesCronograma';

export type MarcoChecklist = {
  atividade: AtividadeResolvida;
  // Rótulo da ação disponível pra este marco (null = sem ação aqui, ex:
  // marco sem edição própria nesta tela).
  acaoLabel: string | null;
  // Quantas atividades deste ciclo dependem deste marco — só exibido
  // enquanto o marco ainda não está concluído, pra dar contexto de por que
  // ele importa sem listar a dependência em cada atividade.
  libera?: number;
};

type CicloMarcosProps = {
  marcos: MarcoChecklist[];
  onAcao: (nomeMarco: string) => void;
};

function iconeMarco(status: AtividadeResolvida['status']): string {
  if (status === 'concluido') return '✓';
  if (status === 'bloqueado_cliente') return '⊘';
  return '○';
}

export function CicloMarcos({ marcos, onAcao }: CicloMarcosProps) {
  if (marcos.length === 0) return null;

  return (
    <div className="checklist-marcos">
      <h3 className="checklist-marcos-titulo">Marcos do ciclo</h3>
      <ol className="checklist-marcos-lista">
        {marcos.map(({ atividade, acaoLabel, libera }) => {
          const concluidaSemData = atividade.status === 'concluido' && !atividade.dataReal;
          return (
            <li key={atividade.nome} className={`checklist-marco-item checklist-marco-${atividade.status}`}>
              <span className="checklist-marco-icone" aria-hidden="true">
                {iconeMarco(atividade.status)}
              </span>
              <div className="checklist-marco-corpo">
                <span className="checklist-marco-nome">{atividade.nome}</span>
                <span className="checklist-marco-data">
                  {atividade.dataReal
                    ? atividade.dataReal.toLocaleDateString('pt-BR')
                    : concluidaSemData
                      ? 'Data não informada'
                      : atividade.status === 'bloqueado_cliente'
                        ? 'Aguardando cliente'
                        : 'Pendente'}
                </span>
                {!atividade.dataReal && !concluidaSemData && libera ? (
                  <span className="field-hint">Libera {libera} atividade(s) deste ciclo</span>
                ) : null}
              </div>
              {acaoLabel && (
                <button type="button" className="btn-link" onClick={() => onAcao(atividade.nome)}>
                  {acaoLabel}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
