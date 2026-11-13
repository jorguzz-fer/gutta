import type { agenda } from '@gutta/contracts';
import { cn } from '@/lib/cn';
import { categoryClasses, EVENT_TYPE_COLOR, type CategoryColor } from '@/styles/categories';

type Item = agenda.AgendaItemDto;

export const KIND_LABEL: Record<Item['kind'], string> = {
  aula: 'Aula',
  pratica: 'Prática',
  prova: 'Prova',
  atividade: 'Atividade',
  entrega: 'Entrega',
  estudo: 'Estudo',
  revisao: 'Revisão',
  pessoal: 'Pessoal',
  compromisso: 'Compromisso',
  outro: 'Outro',
};

/** Cor do item: a da disciplina nas aulas; a do tipo no resto (CAL-03, CAL-15). */
export function itemColor(item: Item, disciplineColor?: number): CategoryColor {
  if ((item.kind === 'aula' || item.kind === 'pratica') && disciplineColor)
    return disciplineColor as CategoryColor;
  if (item.kind === 'prova') return EVENT_TYPE_COLOR.prova;
  if (item.kind === 'atividade' || item.kind === 'entrega') return EVENT_TYPE_COLOR.entrega;
  if (item.kind === 'estudo' || item.kind === 'revisao') return EVENT_TYPE_COLOR.estudo;
  if (item.color) return item.color as CategoryColor;
  if (item.category === 'lazer') return EVENT_TYPE_COLOR.lazer;
  return EVENT_TYPE_COLOR.pessoal;
}

export function timeLabel(item: Item) {
  if (item.allDay) return 'Dia todo';
  if (!item.endLocal) return item.startLocal ?? '';
  return `${item.startLocal} – ${item.endLocal}`;
}

/** Linha de um compromisso: hora, tipo e título. Acadêmico e pessoal com estilos distintos. */
export function AgendaRow({
  item,
  disciplineName,
  disciplineColor,
}: {
  item: Item;
  disciplineName?: string;
  disciplineColor?: number;
}) {
  const academic = item.kind !== 'pessoal' && item.kind !== 'compromisso';
  // Tipo só quando acrescenta algo ao título (o bloco "Estudo" não repete "Estudo").
  const kind = KIND_LABEL[item.kind];
  const sub = [kind.toLowerCase() === item.title.toLowerCase() ? null : kind, disciplineName]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-stretch gap-3">
      <span className="tabular w-28 shrink-0 pt-2 text-sm text-muted">{timeLabel(item)}</span>
      <div
        className={cn(
          'grid flex-1 gap-0.5 rounded-[var(--radius)] px-3 py-2',
          academic ? 'border-l-4' : 'border border-dashed',
          categoryClasses(itemColor(item, disciplineColor)),
        )}
      >
        <span className="text-sm font-semibold">{item.title}</span>
        {sub ? <span className="text-xs">{sub}</span> : null}
      </div>
    </div>
  );
}
