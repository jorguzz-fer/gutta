import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import type { Usage } from './pricing';

/*
  AIProvider: o resto do app não conhece o SDK. A implementação Anthropic usa a API de
  mensagens; a de teste responde de forma determinística (E2E e CI, sem chave e sem custo).
*/
export type TutorTurn = { role: 'user' | 'assistant'; content: string };
export type TutorRequest = {
  rules: string;
  material: string;
  answered: string;
  messages: TutorTurn[];
};
export type TutorReply = {
  text: string;
  model: string;
  usage: Usage;
  stopReason: string | null;
  refused: boolean;
};

export interface AIProvider {
  readonly name: string;
  available(): boolean;
  reply(req: TutorRequest): Promise<TutorReply>;
}

export class ProviderUnavailable extends Error {}

class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null = null;

  available() {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  private sdk() {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: env().ANTHROPIC_API_KEY,
        timeout: 60_000,
        maxRetries: 1,
      });
    }
    return this.client;
  }

  async reply(req: TutorRequest): Promise<TutorReply> {
    const model = env().TUTOR_MODEL;
    try {
      const res = await this.sdk().beta.messages.create({
        model,
        max_tokens: 2000,
        // Conversa de estudo: esforço baixo responde rápido e gasta pouco (pensamento sempre
        // ligado no Opus 5.5; o esforço é o único controle). Recusa do classificador cai no
        // fallback do servidor em vez de deixar o aluno sem resposta.
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          // Regras e material do módulo primeiro, com cache: são iguais para todos os alunos.
          { type: 'text', text: req.rules },
          { type: 'text', text: req.material, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: req.answered },
        ],
        messages: req.messages,
      });
      const text = res.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('\n')
        .trim();
      const refused = res.stop_reason === 'refusal';
      return {
        text: refused
          ? 'Não consigo ajudar com esse pedido aqui. Posso explicar os conceitos do módulo; para casos reais, procure um profissional responsável ou o seu professor.'
          : text || 'Não consegui responder agora. Tente reformular a pergunta.',
        model: res.model,
        usage: {
          input: res.usage.input_tokens,
          output: res.usage.output_tokens,
          cacheRead: res.usage.cache_read_input_tokens ?? 0,
          cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        },
        stopReason: res.stop_reason,
        refused,
      };
    } catch (err) {
      // Classes tipadas do SDK, da mais específica para a mais geral.
      if (err instanceof Anthropic.AuthenticationError)
        throw new ProviderUnavailable('Chave da Anthropic inválida.');
      if (err instanceof Anthropic.RateLimitError)
        throw new ProviderUnavailable('Muitos pedidos ao mesmo tempo. Tente em um minuto.');
      if (
        err instanceof Anthropic.APIConnectionError ||
        err instanceof Anthropic.InternalServerError
      )
        throw new ProviderUnavailable('O serviço de IA não respondeu. Tente de novo.');
      if (err instanceof Anthropic.APIError)
        throw new ProviderUnavailable(`Erro do serviço de IA (${err.status ?? 'sem status'}).`);
      throw err;
    }
  }
}

/** Respostas fixas para testes: cita o módulo e nunca chama rede. */
class FakeProvider implements AIProvider {
  readonly name = 'fake';
  available() {
    return true;
  }
  async reply(req: TutorRequest): Promise<TutorReply> {
    const last = req.messages.at(-1)?.content ?? '';
    const title = /modulo="([^"]+)"/.exec(req.material)?.[1] ?? 'do módulo';
    const real = /paciente|minha m[ãa]e|meu pai|dose/i.test(last);
    const text = real
      ? 'Não posso orientar casos reais. Posso explicar o conceito como em uma aula.'
      : `Pelo material de ${title}: ${req.material.split('\n').slice(1, 3).join(' ').slice(0, 200)}`;
    return {
      text,
      model: 'fake-tutor',
      usage: {
        input: Math.ceil((req.material.length + last.length) / 4),
        output: Math.ceil(text.length / 4),
        cacheRead: 0,
        cacheWrite: 0,
      },
      stopReason: 'end_turn',
      refused: false,
    };
  }
}

let provider: AIProvider | null = null;
export function aiProvider(): AIProvider {
  if (!provider)
    provider = env().AI_PROVIDER === 'fake' ? new FakeProvider() : new AnthropicProvider();
  return provider;
}
