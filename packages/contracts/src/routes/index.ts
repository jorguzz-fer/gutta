import * as agenda from './agenda';
import * as calendar from './calendar';
import * as disciplines from './disciplines';
import * as files from './files';
import * as routine from './routine';
import * as schedule from './schedule';
import * as system from './system';
import type { RouteDef } from '../registry';

// Toda rota de /api/v1 nova entra aqui (ADR 0019). As antigas migram aos poucos.
const isRoute = (v: unknown): v is RouteDef =>
  typeof v === 'object' && v !== null && 'method' in v && 'path' in v && 'response' in v;

export const routes: RouteDef[] = [
  system,
  files,
  disciplines,
  schedule,
  routine,
  agenda,
  calendar,
].flatMap((m) => Object.values(m).filter(isRoute));
