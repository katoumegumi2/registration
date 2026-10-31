import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import type { StaffRole } from "@pendaftaran/shared";
import { ApiError } from "./errors";
import type { EventMeta } from "../events/bus";

export interface StaffPrincipal {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
}

export type AppEnv = {
  Variables: {
    participantId: string;
    staff: StaffPrincipal;
    sessionHash: string;
  };
};

export type AppContext = Context<AppEnv>;
export type App = OpenAPIHono<AppEnv>;

export function createApp(): App {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return;
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] ??= issue.message;
      }
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Data tidak valid", fields } }, 422);
    },
  });
}

/** IP klien hanya dari X-Real-IP yang diset Nginx (PRD 6.6). */
export const clientIp = (c: AppContext) => c.req.header("x-real-ip") ?? "unknown";

export const participantMeta = (c: AppContext): EventMeta => ({ actorType: "PARTICIPANT", actorId: c.get("participantId"), ip: clientIp(c) });
export const staffMeta = (c: AppContext): EventMeta => ({ actorType: "STAFF", actorId: c.get("staff").id, ip: clientIp(c) });
export const publicMeta = (c: AppContext): EventMeta => ({ actorType: "SYSTEM", ip: clientIp(c) });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Spec<B extends z.ZodType, Q extends z.ZodType> {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Pakai gaya OpenAPI: /events/{id}. Parameter bernama id/...Id divalidasi sebagai UUID. */
  path: string;
  tag: string;
  summary: string;
  body?: B;
  query?: Q;
  middleware?: MiddlewareHandler<AppEnv>[];
  status?: 200 | 201;
}

interface Ctx<B extends z.ZodType, Q extends z.ZodType> {
  c: AppContext;
  body: z.output<B>;
  query: z.output<Q>;
  params: Record<string, string>;
}

/** Mendaftarkan satu endpoint: validasi Zod + dokumentasi OpenAPI + format respons { data }. */
export function route<B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
  app: App,
  spec: Spec<B, Q>,
  handler: (ctx: Ctx<B, Q>) => Promise<unknown>,
) {
  const names = [...spec.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const paramsSchema = names.length
    ? z.object(Object.fromEntries(names.map((n) => [n, z.string().openapi({ param: { name: n, in: "path" } })])))
    : undefined;

  const definition = createRoute({
    method: spec.method,
    path: spec.path,
    tags: [spec.tag],
    summary: spec.summary,
    middleware: spec.middleware as never,
    request: {
      ...(paramsSchema ? { params: paramsSchema } : {}),
      ...(spec.query ? { query: spec.query as never } : {}),
      ...(spec.body ? { body: { content: { "application/json": { schema: spec.body as never } }, required: true } } : {}),
    },
    responses: { [spec.status ?? 200]: { description: "Berhasil" } },
  } as never);

  app.openapi(definition as never, (async (c: AppContext & { req: { valid: (t: string) => unknown } }) => {
    const params = (paramsSchema ? c.req.valid("param") : {}) as Record<string, string>;
    for (const n of names) {
      if ((n === "id" || n.endsWith("Id")) && !UUID_RE.test(params[n]!)) throw new ApiError(404, "NOT_FOUND", "Data tidak ditemukan");
    }
    const result = await handler({
      c,
      params,
      body: (spec.body ? c.req.valid("json") : undefined) as z.output<B>,
      query: (spec.query ? c.req.valid("query") : undefined) as z.output<Q>,
    });
    if (result instanceof Response) return result;
    return c.json({ data: result ?? null }, spec.status ?? 200);
  }) as never);
}

export const pageQuery = { page: z.coerce.number().int().min(1).optional() };
