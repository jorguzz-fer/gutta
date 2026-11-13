import * as system from './system';
import type { RouteDef } from '../registry';

// Toda rota de /api/v1 nova entra aqui (ADR 0019). As antigas migram aos poucos.
export const routes: RouteDef[] = [...Object.values(system)];
