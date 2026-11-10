import type { EventHandler } from "../../../packages/event-bus";
import { restock } from "./inventory";

/** Events catalog-service reacts to. Restock is idempotent (CAS on reservation status). */
export const handlers: Record<string, EventHandler> = {
  OrderCancelled: async (env, tx) => {
    await restock(tx, env.data.orderNumber);
  },
  OrderRefused: async (env, tx) => {
    await restock(tx, env.data.orderNumber);
  },
};
