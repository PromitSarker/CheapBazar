import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const passwordHash = await bcrypt.hash("demo1234", 10);
const user = await prisma.user.upsert({
  where: { email: "demo@storeforge.dev" },
  update: { role: "SELLER" },
  create: { email: "demo@storeforge.dev", name: "Demo Seller", passwordHash, role: "SELLER" },
});

// Seed Platform Admin
const adminHash = await bcrypt.hash("admin1234", 10);
await prisma.user.upsert({
  where: { email: "admin@storeforge.dev" },
  update: { role: "ADMIN" },
  create: { email: "admin@storeforge.dev", name: "Platform Admin", passwordHash: adminHash, role: "ADMIN" },
});

// Seed Buyer
const buyerHash = await bcrypt.hash("buyer1234", 10);
await prisma.user.upsert({
  where: { email: "buyer@storeforge.dev" },
  update: { role: "BUYER" },
  create: { email: "buyer@storeforge.dev", name: "Sample Buyer", passwordHash: buyerHash, role: "BUYER" },
});

const store = await prisma.store.upsert({
  where: { slug: "demo-bakery" },
  update: { status: "ACTIVE" },
  create: { name: "Demo Bakery", slug: "demo-bakery", template: "classic", ownerId: user.id, status: "ACTIVE" },
});

if ((await prisma.product.count({ where: { storeId: store.id } })) === 0) {
  await prisma.product.createMany({
    data: [
      { storeId: store.id, name: "Sourdough Loaf", description: "48-hour ferment, wood-fired artisan loaf.", price: 450.0, stock: 12 },
      { storeId: store.id, name: "Butter Croissant", description: "Laminated over three days with French butter.", price: 220.0, stock: 30 },
      { storeId: store.id, name: "Basque Cheesecake", description: "Burnt top, custardy middle.", price: 1650.0, stock: 4 },
      { storeId: store.id, name: "Rye Baguette", description: "Deli-style, caraway crust.", price: 320.0, stock: 0 },
    ],
  });

}

console.log("Seed done.");
console.log("Seller: demo@storeforge.dev / demo1234 -> Storefront: /store/demo-bakery");
console.log("Admin:  admin@storeforge.dev / admin1234 -> Admin Portal: /admin");
console.log("Buyer:  buyer@storeforge.dev / buyer1234");
await prisma.$disconnect();

