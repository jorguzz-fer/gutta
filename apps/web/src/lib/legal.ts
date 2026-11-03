import 'server-only';
import { env } from './env';

/** Identificação do controlador e do encarregado (LGPD art. 9º, II e III; art. 41, §1º). */
export function legalInfo() {
  const e = env();
  return {
    controllerName: e.LEGAL_CONTROLLER_NAME || null,
    controllerDocument: e.LEGAL_CONTROLLER_DOCUMENT || null,
    dpoName: e.DPO_NAME || null,
    dpoEmail: e.DPO_EMAIL || null,
    get complete() {
      return Boolean(this.controllerName && this.dpoName && this.dpoEmail);
    },
  };
}
