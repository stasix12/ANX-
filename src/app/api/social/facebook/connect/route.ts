import { errorResponse, requireAdmin } from '@/lib/social/server/auth';
import { FB_DIALOG_BASE, GRAPH_VERSION, appCredentials } from '@/lib/social/server/graph';
import { issueState, redirectUri } from '@/lib/social/server/oauth';
import { REQUIRED_SCOPES } from '@/lib/social/types';

/**
 * Step 1 of Facebook Login: the signed-in admin asks for the dialog URL.
 * The browser then navigates there; Meta sends it back to /callback.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { appId } = appCredentials();
    const state = await issueState();
    const url = new URL(`${FB_DIALOG_BASE}/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri(request));
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
    return Response.json({ url: url.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
