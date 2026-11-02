import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as s from '../schema';

/*
  Questões de DEMONSTRAÇÃO (ADR 0005). Fisiologia e fisiopatologia de livro-texto, escritas
  para testar a plataforma, sem revisão editorial e sem fonte cadastrada. Antes do teste de
  corredor, o conteúdo real do módulo MCH entra pelo fluxo editorial, revisado pelo Hugo.
*/

type Opt = [body: string, explanation: string, correct?: true];
type Q = { key: string; topic: string; difficulty: number; stem: string; options: Opt[] };

export const DEMO_QUESTIONS: Q[] = [
  {
    key: 'mch-valsalva',
    topic: 'mchObstrucao',
    difficulty: 3,
    stem: 'Na miocardiopatia hipertrófica com obstrução da via de saída do VE, qual manobra tende a AUMENTAR o gradiente de obstrução?',
    options: [
      [
        'Agachamento',
        'Agachar aumenta o retorno venoso e a pós-carga: o VE fica maior e a obstrução diminui.',
      ],
      [
        'Fase de esforço da manobra de Valsalva',
        'A Valsalva reduz o retorno venoso (pré-carga). Com menos volume, a cavidade do VE diminui, o septo e a mitral se aproximam e o gradiente aumenta.',
        true,
      ],
      [
        'Elevação passiva das pernas',
        'Elevar as pernas aumenta o retorno venoso; mais volume no VE reduz a obstrução.',
      ],
      [
        'Preensão manual sustentada (handgrip)',
        'O handgrip aumenta a pós-carga, o que mantém o VE mais cheio e reduz o gradiente.',
      ],
    ],
  },
  {
    key: 'mch-sopro-em-pe',
    topic: 'mchObstrucao',
    difficulty: 2,
    stem: 'O sopro sistólico da MCH obstrutiva costuma ficar mais intenso quando o paciente:',
    options: [
      [
        'passa de agachado para em pé',
        'Ficar em pé reduz o retorno venoso de repente: menos pré-carga, mais obstrução, sopro mais alto.',
        true,
      ],
      [
        'se agacha',
        'Agachar aumenta pré-carga e pós-carga; o sopro da MCH diminui. É uma forma de diferenciar da estenose aórtica.',
      ],
      ['eleva as pernas deitado', 'Mais retorno venoso enche o VE e diminui o sopro.'],
      ['faz preensão manual sustentada', 'O aumento da pós-carga reduz o gradiente e o sopro.'],
    ],
  },
  {
    key: 'mch-sam',
    topic: 'mchObstrucao',
    difficulty: 3,
    stem: 'Qual mecanismo explica a obstrução DINÂMICA da via de saída do VE na miocardiopatia hipertrófica?',
    options: [
      [
        'Movimento sistólico anterior (SAM) do folheto mitral em direção ao septo hipertrofiado',
        'Durante a sístole, o folheto anterior da mitral é puxado contra o septo espesso e estreita a via de saída. Por ser dinâmica, a obstrução varia com volume e contratilidade.',
        true,
      ],
      [
        'Calcificação progressiva da valva aórtica',
        'Isso descreve a estenose aórtica degenerativa, uma obstrução fixa e valvar.',
      ],
      [
        'Dilatação do anel aórtico',
        'A dilatação do anel causa insuficiência aórtica, não obstrução da via de saída.',
      ],
      [
        'Estenose da valva pulmonar',
        'É uma obstrução do lado direito, sem relação com a fisiopatologia da MCH.',
      ],
    ],
  },
  {
    key: 'mch-nitrato',
    topic: 'mchObstrucao',
    difficulty: 4,
    stem: 'Em paciente com MCH obstrutiva sintomática, qual classe de medicamento costuma ser EVITADA porque pode piorar o gradiente?',
    options: [
      [
        'Betabloqueadores',
        'São primeira linha: reduzem a frequência e a contratilidade, prolongam a diástole e diminuem o gradiente.',
      ],
      [
        'Nitratos e outros venodilatadores',
        'Venodilatadores reduzem a pré-carga; com o VE menor, a obstrução piora e pode haver hipotensão e síncope.',
        true,
      ],
      [
        'Bloqueadores de canal de cálcio não di-hidropiridínicos',
        'Verapamil e diltiazem são alternativa aos betabloqueadores em muitos casos, com cautela na obstrução grave.',
      ],
      [
        'Disopiramida',
        'É usada como adjuvante por seu efeito inotrópico negativo, que reduz o gradiente.',
      ],
    ],
  },
  {
    key: 'mch-diastole',
    topic: 'mchDiastole',
    difficulty: 2,
    stem: 'Na miocardiopatia hipertrófica, a alteração hemodinâmica presente mesmo em quem NÃO tem obstrução é:',
    options: [
      [
        'disfunção diastólica por menor complacência do VE',
        'O músculo espesso e fibrosado relaxa e enche mal. A pressão de enchimento sobe, o que explica dispneia e congestão mesmo com fração de ejeção preservada.',
        true,
      ],
      [
        'dilatação do VE com fração de ejeção muito reduzida',
        'Esse é o padrão da miocardiopatia dilatada. Na MCH a cavidade costuma ser pequena e a FE, normal ou alta.',
      ],
      ['insuficiência aórtica', 'Não é característica da MCH.'],
      [
        'shunt da esquerda para a direita',
        'Shunts são cardiopatias estruturais congênitas, como CIA e CIV.',
      ],
    ],
  },
  {
    key: 'mch-taquicardia',
    topic: 'mchDiastole',
    difficulty: 3,
    stem: 'Por que a taquicardia é mal tolerada por pacientes com miocardiopatia hipertrófica?',
    options: [
      [
        'Encurta a diástole, reduzindo o tempo de enchimento de um VE pouco complacente',
        'Com a frequência alta, a diástole encolhe mais que a sístole. Um VE rígido precisa de tempo para encher, e a perfusão coronariana, que acontece na diástole, também cai.',
        true,
      ],
      [
        'Aumenta a pré-carga do VE',
        'É o contrário: menos tempo de enchimento significa menos volume no fim da diástole.',
      ],
      ['Provoca dilatação aguda do VE', 'A taquicardia não dilata o VE de forma aguda na MCH.'],
      [
        'Reduz a contratilidade do VE',
        'A estimulação adrenérgica que acompanha a taquicardia costuma aumentar a contratilidade.',
      ],
    ],
  },
  {
    key: 'mch-heranca',
    topic: 'mch',
    difficulty: 2,
    stem: 'Qual é o padrão de herança mais comum da miocardiopatia hipertrófica?',
    options: [
      [
        'Autossômico dominante, por variantes em genes de proteínas do sarcômero',
        'A maioria dos casos familiares envolve genes como MYH7 e MYBPC3. Por isso se recomenda rastrear parentes de primeiro grau.',
        true,
      ],
      [
        'Recessivo ligado ao X',
        'Não é o padrão típico. Algumas fenocópias da MCH, como a doença de Fabry, são ligadas ao X.',
      ],
      [
        'Mitocondrial',
        'Doenças mitocondriais podem causar hipertrofia, mas são fenocópias raras, não a forma clássica.',
      ],
      [
        'Autossômico recessivo, por genes de canais iônicos',
        'Genes de canais iônicos se associam a canalopatias, como a síndrome do QT longo.',
      ],
    ],
  },
  {
    key: 'mch-histologia',
    topic: 'mch',
    difficulty: 3,
    stem: 'Qual achado histológico é característico da miocardiopatia hipertrófica?',
    options: [
      [
        'Desarranjo das fibras miocárdicas (disarray), com fibrose intersticial',
        'Os miócitos hipertrofiados perdem o alinhamento paralelo. O desarranjo e a fibrose formam substrato para arritmias.',
        true,
      ],
      ['Granulomas não caseosos', 'Sugerem sarcoidose cardíaca.'],
      [
        'Depósito extracelular de amiloide',
        'Caracteriza a amiloidose cardíaca, uma fenocópia que também espessa as paredes.',
      ],
      ['Infiltrado eosinofílico', 'Sugere miocardite eosinofílica ou de hipersensibilidade.'],
    ],
  },
  {
    key: 'ciclo-b1',
    topic: 'cicloCardiaco',
    difficulty: 1,
    stem: 'A primeira bulha cardíaca (B1) corresponde principalmente ao fechamento das valvas:',
    options: [
      [
        'mitral e tricúspide',
        'B1 marca o início da sístole ventricular, quando a pressão nos ventrículos supera a dos átrios e as valvas atrioventriculares se fecham.',
        true,
      ],
      [
        'aórtica e pulmonar',
        'O fechamento das semilunares produz a segunda bulha (B2), no fim da sístole.',
      ],
      ['aórtica, apenas', 'O componente aórtico faz parte de B2.'],
      [
        'mitral, no momento da sua abertura',
        'A abertura da mitral normalmente não é audível. Quando é, como no estalido de abertura, sugere estenose mitral.',
      ],
    ],
  },
  {
    key: 'ciclo-isovolumetrica',
    topic: 'cicloCardiaco',
    difficulty: 2,
    stem: 'Durante a contração isovolumétrica do ventrículo esquerdo:',
    options: [
      [
        'as valvas mitral e aórtica estão fechadas e a pressão no VE sobe rapidamente',
        'O ventrículo contrai com volume constante até a pressão superar a da aorta e a valva aórtica abrir.',
        true,
      ],
      ['a valva aórtica está aberta e o sangue é ejetado', 'Isso já é a fase de ejeção.'],
      [
        'a mitral está aberta e ocorre o enchimento rápido',
        'O enchimento acontece na diástole, depois do relaxamento isovolumétrico.',
      ],
      ['o volume do VE cai progressivamente', 'Por definição, o volume não muda nessa fase.'],
    ],
  },
  {
    key: 'ciclo-onda-p',
    topic: 'cicloCardiaco',
    difficulty: 1,
    stem: 'No eletrocardiograma, a onda P representa:',
    options: [
      ['a despolarização atrial', 'A onda P antecede a contração dos átrios.', true],
      ['a repolarização ventricular', 'Essa é a onda T.'],
      ['a despolarização ventricular', 'Esse é o complexo QRS.'],
      ['a repolarização atrial', 'Costuma ficar escondida dentro do QRS.'],
    ],
  },
  {
    key: 'ciclo-enchimento',
    topic: 'cicloCardiaco',
    difficulty: 2,
    stem: 'Em repouso, numa pessoa saudável, a maior parte do enchimento ventricular acontece:',
    options: [
      [
        'na fase de enchimento rápido, logo após a abertura das valvas atrioventriculares',
        'Logo que as valvas AV abrem, o sangue acumulado nos átrios entra rápido no ventrículo, que está relaxando.',
        true,
      ],
      [
        'durante a contração atrial',
        'A contração atrial completa o enchimento. Contribui menos em repouso e pesa mais quando o VE é rígido, como na MCH.',
      ],
      ['na contração isovolumétrica', 'Com as valvas fechadas, não há enchimento.'],
      ['durante a ejeção', 'Na ejeção o ventrículo esvazia.'],
    ],
  },
  {
    key: 'debito-starling',
    topic: 'debito',
    difficulty: 2,
    stem: 'Pelo mecanismo de Frank-Starling, aumentar o volume diastólico final do VE, dentro da faixa fisiológica, tende a:',
    options: [
      [
        'aumentar o volume sistólico',
        'Fibras mais estiradas contraem com mais força: mais enchimento gera mais volume ejetado.',
        true,
      ],
      [
        'reduzir o volume sistólico',
        'Isso só aparece em estiramento excessivo, na parte descendente da curva, fora da faixa fisiológica.',
      ],
      [
        'reduzir a frequência cardíaca',
        'O mecanismo de Frank-Starling é intrínseco ao músculo e não depende de mudança na frequência.',
      ],
      [
        'não alterar o débito cardíaco',
        'Com mais volume sistólico e a mesma frequência, o débito aumenta.',
      ],
    ],
  },
  {
    key: 'debito-formula',
    topic: 'debito',
    difficulty: 1,
    stem: 'O débito cardíaco é o produto de:',
    options: [
      ['frequência cardíaca × volume sistólico', 'Por exemplo, 70 bpm × 70 mL ≈ 4,9 L/min.', true],
      [
        'pressão arterial média × resistência vascular periférica',
        'É o contrário: PAM ≈ débito × resistência.',
      ],
      [
        'volume diastólico final − fração de ejeção',
        'Volume menos porcentagem não tem significado fisiológico. O volume sistólico é VDF − VSF.',
      ],
      ['frequência cardíaca ÷ volume sistólico', 'A relação é de produto, não de divisão.'],
    ],
  },
  {
    key: 'debito-poscarga',
    topic: 'debito',
    difficulty: 2,
    stem: 'Qual fator AUMENTA a pós-carga do ventrículo esquerdo?',
    options: [
      [
        'Aumento da resistência vascular periférica',
        'Pós-carga é a resistência que o VE vence para ejetar. Vasoconstrição e hipertensão a aumentam.',
        true,
      ],
      ['Vasodilatação arteriolar', 'Diminui a resistência e, portanto, a pós-carga.'],
      ['Queda da pressão arterial', 'Pressão menor na aorta reduz a pós-carga.'],
      ['Aumento do retorno venoso', 'Mais retorno venoso aumenta a pré-carga, não a pós-carga.'],
    ],
  },
  {
    key: 'ic-sraa',
    topic: 'ic',
    difficulty: 2,
    stem: 'Na insuficiência cardíaca com fração de ejeção reduzida, qual sistema ativado contribui diretamente para a retenção de sódio e água?',
    options: [
      [
        'Sistema renina-angiotensina-aldosterona',
        'A queda do débito ativa o SRAA: a angiotensina II faz vasoconstrição e a aldosterona retém sódio e água. É por isso que IECA, BRA e antagonistas mineralocorticoides fazem parte do tratamento.',
        true,
      ],
      [
        'Peptídeos natriuréticos',
        'Também sobem na IC, mas têm efeito oposto: natriurese e vasodilatação.',
      ],
      ['Óxido nítrico endotelial', 'É vasodilatador e não retém sódio.'],
      [
        'Bradicinina',
        'É vasodilatadora. Os IECA aumentam a bradicinina, o que explica a tosse como efeito colateral.',
      ],
    ],
  },
];

export async function seedQuestions(
  db: Db,
  ctx: { topics: Record<string, string>; authorId: string; reviewerId: string },
) {
  for (const q of DEMO_QUESTIONS) {
    const topicId = ctx.topics[q.topic];
    if (!topicId) throw new Error(`Assunto desconhecido no seed: ${q.topic}`);
    const exists = await db.query.questions.findFirst({
      where: and(eq(s.questions.topicId, topicId), eq(s.questions.stem, q.stem)),
      columns: { id: true },
    });
    if (exists) continue;
    const topic = await db.query.topics.findFirst({ where: eq(s.topics.id, topicId) });
    const [row] = await db
      .insert(s.questions)
      .values({
        topicId,
        disciplineId: topic!.disciplineId,
        stem: q.stem,
        difficulty: q.difficulty,
        status: 'published',
        isDemo: true,
        authorId: ctx.authorId,
        reviewerId: ctx.reviewerId,
        publishedAt: new Date(),
      })
      .returning({ id: s.questions.id });
    await db.insert(s.questionOptions).values(
      q.options.map(([body, explanation, correct], i) => ({
        questionId: row!.id,
        displayOrder: i,
        body,
        explanation,
        isCorrect: Boolean(correct),
      })),
    );
  }
}

// Flashcards editoriais de DEMONSTRAÇÃO, ligados aos mesmos assuntos.
export const DEMO_FLASHCARDS: { topic: string; front: string; back: string }[] = [
  {
    topic: 'mchObstrucao',
    front: 'MCH obstrutiva: o que acontece com o sopro na manobra de Valsalva?',
    back: 'Aumenta. Menos pré-carga deixa o VE menor e piora a obstrução da via de saída.',
  },
  {
    topic: 'mchObstrucao',
    front: 'O que é o SAM na miocardiopatia hipertrófica?',
    back: 'Movimento sistólico anterior do folheto mitral em direção ao septo, que estreita a via de saída do VE.',
  },
  {
    topic: 'mchObstrucao',
    front: 'Três manobras que DIMINUEM o sopro da MCH',
    back: 'Agachamento, elevação passiva das pernas e preensão manual sustentada.',
  },
  {
    topic: 'mchDiastole',
    front: 'Problema hemodinâmico central da MCH, mesmo sem obstrução',
    back: 'Disfunção diastólica: o VE espesso e rígido enche mal, com pressão de enchimento alta.',
  },
  {
    topic: 'mch',
    front: 'Herança típica da MCH',
    back: 'Autossômica dominante, por variantes em genes do sarcômero (ex.: MYH7, MYBPC3).',
  },
  {
    topic: 'mch',
    front: 'Achado histológico característico da MCH',
    back: 'Desarranjo das fibras miocárdicas (disarray) com fibrose intersticial.',
  },
  {
    topic: 'cicloCardiaco',
    front: 'B1 e B2: fechamento de quais valvas?',
    back: 'B1: mitral e tricúspide (início da sístole). B2: aórtica e pulmonar (fim da sístole).',
  },
  {
    topic: 'cicloCardiaco',
    front: 'Fases do ciclo cardíaco, em ordem',
    back: 'Contração isovolumétrica, ejeção, relaxamento isovolumétrico e enchimento (rápido, lento e contração atrial).',
  },
  {
    topic: 'debito',
    front: 'Fórmula do débito cardíaco',
    back: 'DC = frequência cardíaca × volume sistólico.',
  },
  {
    topic: 'debito',
    front: 'Pré-carga × pós-carga',
    back: 'Pré-carga: estiramento no fim da diástole (volume). Pós-carga: resistência que o VE vence para ejetar.',
  },
];

export async function seedFlashcards(
  db: Db,
  ctx: { topics: Record<string, string>; authorId: string; reviewerId: string },
) {
  for (const f of DEMO_FLASHCARDS) {
    const topicId = ctx.topics[f.topic]!;
    const exists = await db.query.flashcards.findFirst({
      where: and(eq(s.flashcards.topicId, topicId), eq(s.flashcards.front, f.front)),
      columns: { id: true },
    });
    if (exists) continue;
    await db.insert(s.flashcards).values({
      topicId,
      front: f.front,
      back: f.back,
      visibility: 'editorial',
      status: 'published',
      isDemo: true,
      authorId: ctx.authorId,
      reviewerId: ctx.reviewerId,
      publishedAt: new Date(),
    });
  }
}
