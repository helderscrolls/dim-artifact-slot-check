/*
 * Listens to the requests DIM makes to Bungie, without getting in DIM's way.
 * DIM asks Bungie for the player's profile and for the name tables; this file
 * reads a copy of those answers and passes them on.
 */
import { MANIFEST_URL_PATTERN, PROFILE_URL_PATTERN } from './constants';

/** The two kinds of answer this extension cares about. */
export type BungieResponseKind = 'profile' | 'manifest';

type ResponseHandler = (kind: BungieResponseKind, json: { Response?: unknown }) => void;

/**
 * Wraps the page's `fetch`. Every request goes to DIM exactly as before; for
 * profile and manifest requests a copy of the answer is also handed to
 * `onResponse`. Errors in here are swallowed, so DIM never breaks because of us.
 */
export function listenToBungieResponses(originalFetch: typeof fetch, onResponse: ResponseHandler): void {
  window.fetch = function (this: unknown, ...fetchArguments: Parameters<typeof fetch>): Promise<Response> {
    const responsePromise = originalFetch.apply(this as typeof globalThis, fetchArguments);

    try {
      const kind = identifyBungieRequest(fetchArguments[0]);
      if (kind) {
        // A separate chain on a clone: DIM's own handling is never touched.
        responsePromise
          .then(async (response) => {
            if (response?.ok) onResponse(kind, await response.clone().json());
          })
          .catch(() => {
            /* a failed request is DIM's business, not ours */
          });
      }
    } catch {
      /* never break DIM */
    }

    return responsePromise;
  };
}

/** Says which kind of Bungie request this is, or null if it is not one we need. */
function identifyBungieRequest(requestInput: Parameters<typeof fetch>[0]): BungieResponseKind | null {
  let url: string | undefined;
  if (typeof requestInput === 'string') url = requestInput;
  else if (requestInput instanceof URL) url = requestInput.href;
  else url = requestInput?.url;

  if (!url) return null;
  if (PROFILE_URL_PATTERN.test(url)) return 'profile';
  if (MANIFEST_URL_PATTERN.test(url)) return 'manifest';
  return null;
}
