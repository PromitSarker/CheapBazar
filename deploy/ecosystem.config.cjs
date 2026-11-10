// pm2 process file for the 8 microservices. Secrets come from deploy/.env (not committed).
// Start:  pm2 start deploy/ecosystem.config.cjs     (run deploy/setup.sh first)
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const root = path.join(__dirname, "..");
const pgPort = env.PG_PORT || "54330";
const db = (name) => `postgresql://cheapbazar:${env.PG_PASSWORD}@127.0.0.1:${pgPort}/${name}`;

const common = {
  INTERNAL_AUTH_SECRET: env.INTERNAL_AUTH_SECRET,
  HOST: "127.0.0.1", // services are internal; only the web tier talks to them
  NODE_ENV: "production",
};
// [pm2 name, folder, port, DB env var, db name, extra env]
const services = [
  ["cb-identity", "identity-service", 4001, "IDENTITY_DATABASE_URL", "identity_db", {}],
  ["cb-catalog", "catalog-service", 4002, "CATALOG_DATABASE_URL", "catalog_db", {}],
  ["cb-order", "order-service", 4003, "ORDER_DATABASE_URL", "orders_db", {
    COURIER_WEBHOOK_SECRET: env.COURIER_WEBHOOK_SECRET, ALLOW_SELLER_FINALIZE: env.ALLOW_SELLER_FINALIZE,
  }],
  ["cb-payment", "payment-billing-service", 4004, "PAYMENT_DATABASE_URL", "payment_billing_db", {
    APP_URL: env.APP_URL, BILLING_PUBLIC_URL: env.BILLING_PUBLIC_URL,
    ONLINE_PAYMENTS_ENABLED: env.ONLINE_PAYMENTS_ENABLED,
    SSLCOMMERZ_STORE_ID: env.SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD: env.SSLCOMMERZ_STORE_PASSWORD,
    SSLCOMMERZ_IS_LIVE: env.SSLCOMMERZ_IS_LIVE,
  }],
  ["cb-ledger", "ledger-service", 4005, "LEDGER_DATABASE_URL", "ledger_db", {}],
  ["cb-ad", "ad-service", 4006, "ADS_DATABASE_URL", "ads_db", {}],
  ["cb-aggregator", "aggregator-service", 4007, "AGGREGATOR_DATABASE_URL", "search_db", {}],
  ["cb-notification", "notification-service", 4008, "NOTIFICATION_DATABASE_URL", "notifications_db", {
    COURIER_WEBHOOK_SECRET: env.COURIER_WEBHOOK_SECRET,
    SMS_API_URL: env.SMS_API_URL, SMS_API_KEY: env.SMS_API_KEY, SMS_SENDER: env.SMS_SENDER,
    RESEND_API_KEY: env.RESEND_API_KEY, MAIL_FROM: env.MAIL_FROM,
  }],
];

module.exports = {
  apps: services.map(([name, dir, port, dbVar, dbName, extra]) => ({
    name,
    cwd: root,
    script: "node_modules/.bin/tsx",
    args: `services/${dir}/src/index.ts`,
    autorestart: true,
    max_memory_restart: "250M",
    env: { ...common, PORT: String(port), [dbVar]: db(dbName), ...extra },
  })),
};
