import type { EventEnvelope, EventHandler } from "../../../packages/event-bus";
import type { Runner } from "./db";

/**
 * Event handlers that maintain the read models. Every write is guarded by the
 * producer timestamp (`sourceTs`/`infoTs`/`statusTs`): an older event can
 * never overwrite a newer one, whatever order the bus delivers them in. Deletes
 * are tombstones so a late "updated" cannot resurrect a product.
 */

const ts = (env: EventEnvelope) => new Date(env.timestamp);
const searchText = (name: string, description: string) => `${name} ${description}`.toLowerCase().slice(0, 6000);

async function upsertListing(tx: Runner, env: EventEnvelope) {
  const d = env.data;
  await tx.$executeRawUnsafe(
    `INSERT INTO "ListingIndex"
       ("productId","storeId","name","description","image","price","stock","channel","moq","wholesalePrice","tiers","searchText","productCreatedAt","deleted","sourceTs","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,false,$14,now())
     ON CONFLICT ("productId") DO UPDATE SET
       "storeId"=EXCLUDED."storeId","name"=EXCLUDED."name","description"=EXCLUDED."description","image"=EXCLUDED."image",
       "price"=EXCLUDED."price","stock"=EXCLUDED."stock","channel"=EXCLUDED."channel","moq"=EXCLUDED."moq",
       "wholesalePrice"=EXCLUDED."wholesalePrice","tiers"=EXCLUDED."tiers","searchText"=EXCLUDED."searchText",
       "productCreatedAt"=EXCLUDED."productCreatedAt","deleted"=false,"sourceTs"=EXCLUDED."sourceTs","updatedAt"=now()
     WHERE "ListingIndex"."sourceTs" <= EXCLUDED."sourceTs" AND "ListingIndex"."deleted" = false`,
    d.productId, d.storeId, d.name ?? "", d.description ?? "", d.image ?? null, d.price ?? 0, d.stock ?? 0,
    d.channel ?? "RETAIL", d.moq ?? 1, d.wholesalePrice ?? null, JSON.stringify(d.tiers ?? []),
    searchText(d.name ?? "", d.description ?? ""), d.createdAt ? new Date(d.createdAt) : new Date(), ts(env)
  );
}

async function tombstone(tx: Runner, env: EventEnvelope) {
  const d = env.data;
  await tx.$executeRawUnsafe(
    `INSERT INTO "ListingIndex" ("productId","storeId","deleted","sourceTs","updatedAt") VALUES ($1,$2,true,$3,now())
     ON CONFLICT ("productId") DO UPDATE SET "deleted"=true,"sourceTs"=EXCLUDED."sourceTs","updatedAt"=now()
     WHERE "ListingIndex"."sourceTs" <= EXCLUDED."sourceTs"`,
    d.productId, d.storeId, ts(env)
  );
}

async function upsertStoreInfo(tx: Runner, env: EventEnvelope) {
  const d = env.data;
  await tx.$executeRawUnsafe(
    `INSERT INTO "StoreProjection" ("storeId","slug","name","ownerId","template","customDomain","infoTs","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT ("storeId") DO UPDATE SET
       "slug"=EXCLUDED."slug","name"=EXCLUDED."name","ownerId"=EXCLUDED."ownerId","template"=EXCLUDED."template",
       "customDomain"=EXCLUDED."customDomain","infoTs"=EXCLUDED."infoTs","updatedAt"=now()
     WHERE "StoreProjection"."infoTs" <= EXCLUDED."infoTs"`,
    d.storeId, d.slug ?? "", d.name ?? "", d.ownerId ?? null, d.template ?? "classic", d.customDomain ?? null, ts(env)
  );
}

async function setStoreStatus(tx: Runner, env: EventEnvelope) {
  const d = env.data;
  await tx.$executeRawUnsafe(
    `INSERT INTO "StoreProjection" ("storeId","status","statusTs","updatedAt") VALUES ($1,$2,$3,now())
     ON CONFLICT ("storeId") DO UPDATE SET "status"=EXCLUDED."status","statusTs"=EXCLUDED."statusTs","updatedAt"=now()
     WHERE "StoreProjection"."statusTs" <= EXCLUDED."statusTs"`,
    d.storeId, String(d.to), ts(env)
  );
}

export const handlers: Record<string, EventHandler> = {
  ProductCreated: (env, tx) => upsertListing(tx, env),
  ProductUpdated: (env, tx) => upsertListing(tx, env),
  ProductDeleted: (env, tx) => tombstone(tx, env),
  StoreCreated: (env, tx) => upsertStoreInfo(tx, env),
  StoreUpdated: (env, tx) => upsertStoreInfo(tx, env),
  StoreDomainUpdated: (env, tx) => upsertStoreInfo(tx, env),
  StoreStatusChanged: (env, tx) => setStoreStatus(tx, env),
};
