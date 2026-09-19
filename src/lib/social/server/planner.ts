import 'server-only';
import { planQueue as planCore } from '../plan';
import { serviceDb } from './db';
import { logActivity } from './log';

/**
 * The server's entry point into the shared planner (../plan.ts): same
 * bookkeeping, run with the service-role client and the server activity log.
 */
export async function planQueue(now = new Date()): Promise<number> {
  return planCore({ db: serviceDb(), now, log: logActivity });
}
