import { AsyncLocalStorage } from "async_hooks";
import { Context } from "koa";

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  method?: string;
  url?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function runWithRequestContext<T>(
  store: RequestContextStore,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return requestContextStorage.run(store, fn);
}

export function getRequestContextStore(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}

export function getRequestIdFromContext(): string {
  return requestContextStorage.getStore()?.requestId || "unknown";
}

export function buildRequestContextStore(ctx: Context): RequestContextStore {
  const user = (ctx as any).user;
  return {
    requestId: String(ctx.state?.requestId || "unknown"),
    userId: user?.userId,
    method: ctx.method,
    url: ctx.url,
  };
}
