// Linha simplificada de uma atividade do checklist (redesign da tela) — só
// o essencial pra decidir o que fazer agora: nome, status, data (ou "Data
// não informada", nunca "—" pra não parecer que não aconteceu) e uma ação
// rápida. Prazo/dependência/dia/ciclo/responsável/agendamento/bloqueio
// continuam existindo — só saem da linha principal e vão pro drawer de
// detalhes (ver AtividadeDetalhesDrawer), aberto sob demanda.
import type { AtividadeResolvida } from '../../lib/atividadesCronograma';

type AtividadeLinhaProps = {
  atividade: AtividadeResolvida;
  onAlternarConcluido: (concluido: boolean) => void;
  onAbrirDetalhes: () => void;
};

export function AtividadeLinha({ atividade, onAlternarConcluido, onAbrirDetalhes }: AtividadeLinhaProps) {
  const concluida = atividade.status === 'concluido';
  const concluidaSemData = concluida && !atividade.dataReal;
  const bloqueada = atividade.status === 'aguardando_etapa_anterior';
  const aguardandoCliente = atividade.status === 'bloqueado_cliente';

  let linhaStatus: string;
  if (concluida) {
    linhaStatus = concluidaSemData ? 'Concluído' : `Concluído · ${atividade.dataReal!.toLocaleDateString('pt-BR')}`;
  } else if (aguardandoCliente) {
    linhaStatus = 'Aguardando cliente';
  } else if (bloqueada) {
    linhaStatus =
      atividade.dependenciaLabel === 'Treinamento realizado'
        ? 'Bloqueado até realização do treinamento'
        : 'Aguardando etapa anterior';
  } else if (atividade.status === 'atrasado') {
    linhaStatus = 'Em andamento';
  } else {
    linhaStatus = 'Em andamento';
  }

  return (
    <div className={`checklist-atividade-linha checklist-atividade-${atividade.status}`}>
      <input
        type="checkbox"
        checked={concluida}
        disabled={bloqueada}
        aria-label={`Marcar "${atividade.nome}" como concluída`}
        onChange={(e) => onAlternarConcluido(e.target.checked)}
      />
      <div className="checklist-atividade-corpo">
        <button type="button" className="checklist-atividade-nome" onClick={onAbrirDetalhes}>
          {atividade.nome}
        </button>
        <div className="checklist-atividade-linha-status">
          <span>{linhaStatus}</span>
          {concluidaSemData && (
            <button type="button" className="btn-link" onClick={onAbrirDetalhes}>
              Adicionar data
            </button>
          )}
          {atividade.atrasoDias > 0 && <span className="checklist-badge-atraso">Atrasada {atividade.atrasoDias}d</span>}
          {!concluida && atividade.agendadoPara && (
            <span className="field-hint">Agendado para {atividade.agendadoPara.toLocaleDateString('pt-BR')}</span>
          )}
        </div>
      </div>
      <div className="checklist-atividade-acoes">
        {concluida ? (
          <button type="button" className="btn-link" onClick={onAbrirDetalhes}>
            Editar data
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={bloqueada} onClick={() => onAlternarConcluido(true)}>
            Concluir
          </button>
        )}
        <button type="button" className="btn-link" onClick={onAbrirDetalhes}>
          Detalhes
        </button>
      </div>
    </div>
  );
}
