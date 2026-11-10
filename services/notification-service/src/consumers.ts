import type { EventHandler } from "../../../packages/event-bus";
import type { Directory } from "./directory";
import { apply } from "./dispatch";
import { NOTIFIABLE_EVENTS } from "./templates";

/** One handler per notifiable event; all share the planner so rules live in templates.ts. */
export function buildHandlers(dir: Directory): Record<string, EventHandler> {
  const handlers: Record<string, EventHandler> = {};
  for (const type of NOTIFIABLE_EVENTS) {
    handlers[type] = async (env, tx) => {
      await apply(tx, dir, env);
    };
  }
  return handlers;
}
