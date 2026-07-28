import { createRouter, publicQuery } from "./middleware";
import { musicRouter } from "./musicRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  music: musicRouter,
});

export type AppRouter = typeof appRouter;
