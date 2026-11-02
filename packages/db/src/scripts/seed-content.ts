import type { Db } from '../client';

// Questões e flashcards de demonstração entram no item 13 do plano.
export async function seedQuestions(
  _db: Db,
  _ctx: { topics: Record<string, string>; authorId: string; reviewerId: string },
) {}
