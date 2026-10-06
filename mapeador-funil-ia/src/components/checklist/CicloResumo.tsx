// Cabeçalho do ciclo (redesign da tela de checklist) — substitui a ideia de
// "ler a tabela inteira pra saber onde estamos" por um resumo de 1 olhada:
// dia do projeto, período do ciclo e quantas atividades estão em cada
// situação, com barra de progresso. Não recalcula nada — só soma os
// `status` já resolvidos por resolverAtividade/resolverMarcoSimples.
import type { AtividadeResolvida } from '../../lib/atividadesCronograma';

type CicloResumoProps = {
  nomeCiclo: string;
  diaAtual: number | null;
  diaInicio: number;
  diaFim: number;
  atividades: AtividadeResolvida[];
};

export function CicloResumo({ nomeCiclo, diaAtual, diaInicio, diaFim, atividades }: CicloResumoProps) {
  const total = atividades.length;
  const concluidas = atividades.filter((a) => a.status === 'concluido').length;
  const bloqueadas = atividades.filter((a) => a.status === 'bloqueado_cliente').length;
  const pendentes = atividades.filter((a) => a.status === 'aguardando_etapa_anterior').length;
  const emAndamento = total - concluidas - bloqueadas - pendentes;
  const percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  return (
    <div className="checklist-ciclo-resumo">
      <div className="checklist-ciclo-resumo-titulo">
        <h2>{nomeCiclo}</h2>
        <div className="checklist-ciclo-resumo-meta">
          {diaAtual != null && <span>Dia {diaAtual}/40</span>}
          <span>
            Período do ciclo: dias {diaInicio}–{diaFim}
          </span>
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="checklist-ciclo-resumo-contagens">
            <span>
              <strong>{concluidas}</strong> de <strong>{total}</strong> concluídas
            </span>
            {emAndamento > 0 && <span>{emAndamento} em andamento</span>}
            {pendentes > 0 && <span>{pendentes} pendentes</span>}
            {bloqueadas > 0 && <span className="checklist-badge-aguardando-cliente">{bloqueadas} aguardando cliente</span>}
          </div>

          <div
            className="checklist-progresso"
            role="progressbar"
            aria-valuenow={percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${concluidas} de ${total} atividades concluídas`}
          >
            <div className="checklist-progresso-barra" style={{ width: `${percentual}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
