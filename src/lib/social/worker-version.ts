/**
 * The local browser worker's build number, shared so the dashboard can say
 * when the copy running on the owner's PC is older than the app it is talking
 * to. Bump it whenever a change to worker/ has to reach that machine before it
 * takes effect.
 *
 * This exists because a stale worker is invisible otherwise: it heartbeats,
 * reports a healthy Facebook login and publishes — just without whatever was
 * fixed. The only evidence was a version number in one line of its terminal
 * output, which nobody reads.
 */
export const WORKER_VERSION = '3.2.1';
