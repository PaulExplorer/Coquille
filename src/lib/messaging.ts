import { browser } from 'wxt/browser';
import type { BackgroundRequest, BackgroundResponse } from './messages';

const REQUEST_TAG = '__betterGrammalecteRequest' as const;

type TaggedRequest = BackgroundRequest & Record<typeof REQUEST_TAG, true>;

function tagRequest(request: BackgroundRequest): TaggedRequest {
  return { ...request, [REQUEST_TAG]: true } as unknown as TaggedRequest;
}

/** Send a typed request to the background and unwrap the response envelope. */
export async function callBackground<T>(request: BackgroundRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(tagRequest(request))) as
    | BackgroundResponse<T>
    | undefined;
  if (response === undefined) {
    throw new Error(`No answer from the background for request: ${request.type}`);
  }
  if (!response.ok) {
    throw new Error(response.error ?? `Background error for request: ${request.type}`);
  }
  return response.value as T;
}

/**
 * Wrap an async handler into a runtime.onMessage listener, only answering
 * requests of our contract. The handler receives the untagged request.
 */
export function serveBackgroundRequests(
  handler: (
    request: BackgroundRequest,
    sender: { tabId: number | undefined },
  ) => Promise<unknown>,
): () => void {
  const wrap = (
    raw: unknown,
    sender: { tab?: { id?: number } },
  ): Promise<BackgroundResponse<unknown>> => {
    const tagged = raw as TaggedRequest | null;
    if (tagged == null || typeof tagged != 'object' || !(tagged[REQUEST_TAG] as unknown)) {
      return Promise.resolve({ ok: false, error: 'Unhandled message' });
    }
    const { [REQUEST_TAG]: _tag, ...request } = tagged;
    return handler(request, { tabId: sender.tab?.id })
      .then(value => ({ ok: true, value }))
      .catch(cause => ({
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }));
  };
  browser.runtime.onMessage.addListener(wrap as never);
  return () => {
    browser.runtime.onMessage.removeListener(wrap as never);
  };
}
