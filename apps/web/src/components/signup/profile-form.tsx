'use client';
import { useActionState, useState } from 'react';
import { saveProfileAction, type SignupFormState } from '@/features/signup/actions';
import { MAIN_GOALS } from '@/features/signup/steps';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';

type Option = { id: string; name: string; slug?: string };

export function ProfileForm({
  courses,
  institutions,
  initial,
}: {
  courses: Option[];
  institutions: Option[];
  initial: {
    courseId?: string;
    courseOther?: string | null;
    semester?: number;
    institutionId?: string | null;
    institutionOther?: string | null;
    campus?: string | null;
    classGroup?: string | null;
    mainGoal?: string | null;
  } | null;
}) {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(
    saveProfileAction,
    null,
  );
  const e = state?.errors ?? {};
  const v = state?.values ?? {};
  const [courseId, setCourseId] = useState(initial?.courseId ?? '');
  const [institutionId, setInstitutionId] = useState(
    initial?.institutionOther ? 'outra' : (initial?.institutionId ?? ''),
  );
  const isOther = courses.find((c) => c.id === courseId)?.slug === 'outro-curso-da-saude';
  return (
    <form action={action} className="grid gap-5" noValidate>
      {e.form ? <Alert tone="danger">{e.form}</Alert> : null}
      <Field label="Curso de graduação" error={e.courseId}>
        {(p) => (
          <Select
            {...p}
            name="courseId"
            value={courseId}
            onChange={(ev) => setCourseId(ev.target.value)}
            required
          >
            <option value="">Escolha seu curso</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {isOther ? (
        <Field label="Nome do curso" error={e.courseOther}>
          {(p) => (
            <Input
              {...p}
              name="courseOther"
              defaultValue={v.courseOther ?? initial?.courseOther ?? ''}
              required
            />
          )}
        </Field>
      ) : null}
      <Field label="Semestre" error={e.semester}>
        {(p) => (
          <Select
            {...p}
            name="semester"
            defaultValue={v.semester ?? initial?.semester ?? ''}
            required
          >
            <option value="">Escolha o semestre</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}º semestre
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Instituição" error={e.institutionId}>
        {(p) => (
          <Select
            {...p}
            name="institutionId"
            value={institutionId}
            onChange={(ev) => setInstitutionId(ev.target.value)}
            required
          >
            <option value="">Escolha a instituição</option>
            {institutions.map((i) => (
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
          label="Nome da instituição"
          error={e.institutionOther}
          hint="A equipe confere e inclui na lista."
        >
          {(p) => (
            <Input
              {...p}
              name="institutionOther"
              defaultValue={v.institutionOther ?? initial?.institutionOther ?? ''}
            />
          )}
        </Field>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Campus" optional error={e.campus}>
          {(p) => <Input {...p} name="campus" defaultValue={v.campus ?? initial?.campus ?? ''} />}
        </Field>
        <Field
          label="Turma"
          optional
          error={e.classGroup}
          hint="Como aparece no seu horário, ex.: XIIA"
        >
          {(p) => (
            <Input
              {...p}
              name="classGroup"
              defaultValue={v.classGroup ?? initial?.classGroup ?? ''}
            />
          )}
        </Field>
      </div>
      <fieldset className="grid gap-2" aria-describedby={e.mainGoal ? 'goal-error' : undefined}>
        <legend className="mb-1 text-sm font-medium">Principal objetivo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MAIN_GOALS.map((g) => (
            <label
              key={g.value}
              className="flex min-h-11 items-center gap-3 rounded-[var(--radius)] border border-line px-3 text-[15px]"
            >
              <input
                type="radio"
                name="mainGoal"
                value={g.value}
                defaultChecked={(v.mainGoal ?? initial?.mainGoal) === g.value}
                className="size-5 accent-[var(--accent)]"
              />
              {g.label}
            </label>
          ))}
        </div>
        {e.mainGoal ? (
          <p id="goal-error" className="text-[13px] font-medium text-danger" role="alert">
            {e.mainGoal}
          </p>
        ) : null}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar e continuar'}
        </Button>
      </div>
    </form>
  );
}
