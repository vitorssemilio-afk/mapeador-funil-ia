import { PX_POR_DIA, adicionarDias, diaParaPx, type EscalaTempo } from '../lib/cronograma';

export function GanttRuler({ escala }: { escala: EscalaTempo }) {
  const marcas: Date[] = [];
  for (let dia = 0; dia <= escala.totalDias; dia += 7) {
    marcas.push(adicionarDias(escala.inicio, dia));
  }

  return (
    <div className="gantt-ruler" style={{ width: escala.totalDias * PX_POR_DIA }}>
      {marcas.map((data) => (
        <span key={data.toISOString()} className="gantt-ruler-marca" style={{ left: diaParaPx(data, escala) }}>
          {data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </span>
      ))}
    </div>
  );
}
