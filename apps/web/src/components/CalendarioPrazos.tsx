import { hojeNoFuso } from '@stante/shared';
import type { Demanda } from '../api/demandas';

const NOMES_MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface Celula {
  numero: number;
  foraDoMes: boolean;
  dataIso: string | null;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Monta as semanas do mês (domingo a sábado), completando com dias dos meses vizinhos. */
function montarCelulas(ano: number, mes: number): Celula[] {
  // Tudo em UTC: o dia da semana não pode depender do fuso do computador de quem olha
  const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const diasNoMesAnterior = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const celulas: Celula[] = [];
  for (let i = primeiroDiaSemana - 1; i >= 0; i -= 1) {
    celulas.push({ numero: diasNoMesAnterior - i, foraDoMes: true, dataIso: null });
  }
  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    celulas.push({ numero: dia, foraDoMes: false, dataIso: `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}` });
  }
  while (celulas.length % 7 !== 0) {
    celulas.push({ numero: celulas.length - (primeiroDiaSemana + diasNoMes) + 1, foraDoMes: true, dataIso: null });
  }
  return celulas;
}

const classeDaPilula = (status: Demanda['status']) =>
  status === 'vencida' ? 'pill-vencida' : status === 'prazo_critico' ? 'pill-critico' : '';

export function CalendarioPrazos({
  ano,
  mes,
  demandas,
  aoMudarMes,
  aoAbrir,
}: {
  ano: number;
  mes: number; // 0 a 11
  demandas: Demanda[];
  aoMudarMes: (deslocamento: -1 | 1) => void;
  aoAbrir: (id: number) => void;
}) {
  const hoje = hojeNoFuso();
  const porDia = new Map<string, Demanda[]>();
  for (const demanda of demandas) {
    porDia.set(demanda.prazo, [...(porDia.get(demanda.prazo) ?? []), demanda]);
  }

  return (
    <div className="card">
      <div className="calendario-header">
        <button type="button" className="btn-secondary" onClick={() => aoMudarMes(-1)}>
          ← Anterior
        </button>
        <h2>
          {NOMES_MESES_COMPLETOS[mes]} de {ano}
        </h2>
        <button type="button" className="btn-secondary" onClick={() => aoMudarMes(1)}>
          Próximo →
        </button>
      </div>

      <div className="calendario-dias-semana">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
          <span key={dia}>{dia}</span>
        ))}
      </div>

      <div className="calendario-grid">
        {montarCelulas(ano, mes).map((celula, indice) => (
          <div
            key={indice}
            className={`calendario-dia ${celula.foraDoMes ? 'fora-do-mes' : ''} ${celula.dataIso === hoje ? 'hoje' : ''}`}
          >
            <div className="calendario-dia-numero">{celula.numero}</div>
            {celula.dataIso &&
              porDia.get(celula.dataIso)?.map((demanda) => (
                <button
                  key={demanda.id}
                  type="button"
                  className={`calendario-pill ${classeDaPilula(demanda.status)}`}
                  title={`${demanda.numero} — ${demanda.assunto}`}
                  onClick={() => aoAbrir(demanda.id)}
                >
                  {demanda.numero}
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
