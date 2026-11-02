'use client';
import { useActionState, useMemo, useState } from 'react';
import { saveAcademicProfile, type ProfileFormState } from '@/features/onboarding/actions';
import type { OnboardingData } from '@/features/onboarding/data';
import { Button } from '@/components/ui/button';
import { Alert, DemoBadge } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';

const DAYS = [
  ['D', 'Domingo'],
  ['S', 'Segunda'],
  ['T', 'Terça'],
  ['Q', 'Quarta'],
  ['Q', 'Quinta'],
  ['S', 'Sexta'],
  ['S', 'Sábado'],
] as const;
const GOALS = [10, 20, 30, 45, 60];
const STEPS = ['Curso', 'Disciplinas', 'Rotina'] as const;

/*
  Onboarding em 3 passos com progresso visível (Gradiente de Meta, Conexão Uniforme).
  Poucas escolhas por passo e padrões sensatos (Hick, Tesler): curso único já vem marcado,
  meta de 20 min e dias úteis. Prova é opcional. No perfil, as mesmas seções aparecem juntas.
*/
export function AcademicForm({
  data,
  mode,
}: {
  data: OnboardingData;
  mode: 'onboarding' | 'perfil';
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    saveAcademicProfile,
    null,
  );
  const p = data.profile;
  const [step, setStep] = useState(0);
  const [courseId, setCourseId] = useState(
    p?.courseId ?? (data.courses.length === 1 ? data.courses[0]!.id : ''),
  );
  const [institutionId, setInstitutionId] = useState(
    p?.institutionOther ? 'outra' : (p?.institutionId ?? ''),
  );
  const [semester, setSemester] = useState<number>(p?.semester ?? 0);
  const [selected, setSelected] = useState<string[]>(data.activeDisciplineIds);
  const [goal, setGoal] = useState(p?.studyGoalMinutes ?? 20);
  const [localError, setLocalError] = useState<Record<string, string>>({});
  // Erro some assim que o campo é corrigido (validação inline). Uma resposta nova do servidor
  // zera a lista de corrigidos, para os erros dela aparecerem.
  const [fixed, setFixed] = useState<{ for: ProfileFormState; fields: Set<string> }>({
    for: null,
    fields: new Set(),
  });
  const fixedFields = fixed.for === state ? fixed.fields : new Set<string>();
  const errors = Object.fromEntries(
    Object.entries({ ...(state?.errors ?? {}), ...localError }).filter(
      ([k]) => !fixedFields.has(k),
    ),
  ) as Record<string, string>;
  const touch = (field: string) =>
    setFixed({ for: state, fields: new Set(fixedFields).add(field) });
  const isOnboarding = mode === 'onboarding';

  const disciplines = useMemo(
    () => data.disciplines.filter((d) => d.courseId === courseId),
    [data.disciplines, courseId],
  );
  const chosen = disciplines.filter((d) => selected.includes(d.id));
  const activeInstitutions = data.institutions.filter((i) => i.status === 'active');
  const course = data.courses.find((c) => c.id === courseId);

  function next() {
    const errs: Record<string, string> = {};
    if (step === 0 && !courseId) errs.courseId = 'Escolha seu curso.';
    if (step === 1 && !semester) errs.semester = 'Escolha o semestre.';
    if (step === 1 && chosen.length === 0)
      errs.disciplineIds = 'Escolha pelo menos uma disciplina.';
    setLocalError(errs);
    setFixed({ for: state, fields: new Set() });
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const show = (i: number) => !isOnboarding || step === i;

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="mode" value={mode} />
      {isOnboarding ? (
        <ol className="grid grid-cols-3 gap-2" aria-label="Etapas">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className="grid gap-1.5">
              <span className={cn('h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
              <span className={cn('text-xs', i === step ? 'font-semibold text-fg' : 'text-muted')}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {errors.form ? <Alert tone="danger">{errors.form}</Alert> : null}
      {state?.saved ? (
        <Alert tone="success">Perfil salvo. As recomendações já levam isso em conta.</Alert>
      ) : null}

      <section hidden={!show(0)} className="grid gap-4" aria-labelledby="sec-curso">
        <h2 id="sec-curso" className="text-xl font-bold">
          {isOnboarding ? 'Onde você estuda?' : 'Curso e instituição'}
        </h2>
        {!isOnboarding ? (
          <Field label="Como quer ser chamado(a)" error={errors.displayName}>
            {(a) => <Input {...a} name="displayName" defaultValue={data.displayName} />}
          </Field>
        ) : null}
        <Field label="Curso" error={errors.courseId}>
          {(a) => (
            <Select
              {...a}
              name="courseId"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                touch('courseId');
              }}
            >
              <option value="">Escolha…</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {course?.isDemo ? (
          <p className="text-sm text-muted">
            <DemoBadge /> O conteúdo deste curso ainda está em demonstração.
          </p>
        ) : null}
        <Field
          label="Instituição"
          optional
          hint="Ajuda a sugerir o que estudar. Não temos vínculo oficial com faculdades."
        >
          {(a) => (
            <Select
              {...a}
              name="institutionId"
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
            >
              <option value="">Prefiro não informar</option>
              {activeInstitutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
              <option value="outra">Não encontrei a minha</option>
            </Select>
          )}
        </Field>
        {institutionId === 'outra' ? (
          <Field
            label="Nome da sua instituição"
            error={errors.institutionOther}
            hint="Vamos conferir e adicionar à lista."
          >
            {(a) => (
              <Input {...a} name="institutionOther" defaultValue={p?.institutionOther ?? ''} />
            )}
          </Field>
        ) : null}
      </section>

      <section hidden={!show(1)} className="grid gap-4" aria-labelledby="sec-disc">
        <h2 id="sec-disc" className="text-xl font-bold">
          {isOnboarding ? 'O que você está cursando?' : 'Semestre e disciplinas'}
        </h2>
        <Field label="Semestre atual" error={errors.semester}>
          {(a) => (
            <Select
              {...a}
              name="semester"
              value={semester || ''}
              onChange={(e) => {
                setSemester(Number(e.target.value));
                touch('semester');
              }}
            >
              <option value="">Escolha…</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}º semestre
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset
          className="grid gap-2"
          aria-describedby={errors.disciplineIds ? 'disc-error' : undefined}
        >
          <legend className="mb-1 text-sm font-medium">
            Disciplinas que você quer estudar aqui
          </legend>
          {disciplines.length === 0 ? (
            <p className="text-sm text-muted">Escolha o curso no passo anterior.</p>
          ) : null}
          {disciplines.map((d) => {
            const on = selected.includes(d.id);
            const near = semester && d.periodHint ? Math.abs(d.periodHint - semester) <= 1 : false;
            return (
              <label
                key={d.id}
                className={cn(
                  'flex min-h-14 cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-surface p-3',
                  on ? 'border-accent' : 'border-line',
                )}
              >
                <input
                  type="checkbox"
                  name="disciplineIds"
                  value={d.id}
                  checked={on}
                  onChange={() => {
                    setSelected((cur) => (on ? cur.filter((x) => x !== d.id) : [...cur, d.id]));
                    touch('disciplineIds');
                  }}
                  className="mt-1 size-5 accent-[var(--accent)]"
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {d.name}
                    {near ? (
                      <span className="ml-2 font-mono text-[11px] text-accent uppercase">
                        do seu semestre
                      </span>
                    ) : null}
                  </span>
                  {d.description ? (
                    <span className="text-sm text-muted">{d.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
          {errors.disciplineIds ? (
            <p id="disc-error" role="alert" className="text-[13px] font-medium text-danger">
              {errors.disciplineIds}
            </p>
          ) : null}
        </fieldset>
      </section>

      <section hidden={!show(2)} className="grid gap-5" aria-labelledby="sec-rotina">
        <h2 id="sec-rotina" className="text-xl font-bold">
          {isOnboarding ? 'Quanto tempo por dia?' : 'Rotina de estudo'}
        </h2>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Meta diária</legend>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <label
                key={g}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]',
                  goal === g
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-strong bg-surface',
                )}
              >
                <input
                  type="radio"
                  name="studyGoalMinutes"
                  value={g}
                  checked={goal === g}
                  onChange={() => setGoal(g)}
                  className="sr-only"
                />
                {g} min
              </label>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            Pouco e todo dia rende mais que muito de vez em quando.
          </p>
        </fieldset>
        <fieldset
          className="grid gap-2"
          aria-describedby={errors.studyDays ? 'days-error' : undefined}
        >
          <legend className="mb-1 text-sm font-medium">Dias em que você costuma estudar</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(([short, full], i) => (
              <label
                key={full}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface font-medium has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
              >
                <input
                  type="checkbox"
                  name="studyDays"
                  value={i}
                  defaultChecked={(p?.studyDays ?? [1, 2, 3, 4, 5]).includes(i)}
                  className="sr-only"
                  aria-label={full}
                />
                <span aria-hidden>{short}</span>
              </label>
            ))}
          </div>
          {errors.studyDays ? (
            <p id="days-error" role="alert" className="text-[13px] font-medium text-danger">
              {errors.studyDays}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3 rounded-[var(--radius-lg)] border border-line p-4">
          <legend className="px-1 text-sm font-medium">
            Tem prova chegando? <span className="font-normal text-muted">(opcional)</span>
          </legend>
          <p className="text-[13px] text-muted">
            Com a data, priorizamos os assuntos dessa disciplina.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Disciplina" error={errors.examDisciplineId}>
              {(a) => (
                <Select {...a} name="examDisciplineId" defaultValue="">
                  <option value="">—</option>
                  {chosen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Data da prova">
              {(a) => <Input {...a} name="examDate" type="date" />}
            </Field>
          </div>
          <Field label="Nome da prova" optional>
            {(a) => <Input {...a} name="examTitle" placeholder="P1, prova prática…" />}
          </Field>
        </fieldset>

        {data.needsConsent ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="terms"
              className="mt-0.5 size-5 accent-[var(--accent)]"
              required
            />
            <span>Li e aceito os termos de uso e a política de privacidade.</span>
          </label>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {isOnboarding && step > 0 ? (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Voltar
          </Button>
        ) : null}
        {isOnboarding && step < STEPS.length - 1 ? (
          // key distinta: sem ela o React reaproveita o mesmo <button> e, ao virar type=submit
          // no mesmo clique, o navegador envia o formulário antes do último passo.
          <Button key="next" onClick={next} size="lg">
            Continuar
          </Button>
        ) : (
          <Button key="submit" type="submit" size="lg" loading={pending}>
            {isOnboarding ? 'Começar a estudar' : 'Salvar perfil'}
          </Button>
        )}
        {isOnboarding && step === STEPS.length - 1 ? (
          <span className="text-sm text-muted">Dá para mudar tudo depois, no perfil.</span>
        ) : null}
      </div>
    </form>
  );
}
