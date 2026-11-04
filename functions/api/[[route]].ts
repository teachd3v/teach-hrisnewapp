import { app } from '../../api/src/app';
import type { Bindings } from '../../api/src/env';

// Pages Functions: semua /api/* diteruskan ke aplikasi Hono.
export const onRequest: PagesFunction<Bindings> = (ctx) =>
  app.fetch(ctx.request, ctx.env, {
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    props: {},
  });
