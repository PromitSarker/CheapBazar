import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || "5.0");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      storeSlug,
      buyerName,
      buyerEmail,
      buyerPhone,
      shippingAddress,
      shippingCity,
      paymentMethod, // "SSLCOMMERZ" | "COD"
      items, // Array of { id: productId, quantity: number }
    } = body;

    if (!storeSlug || !buyerName || !buyerPhone || !shippingAddress || !items || !items.length) {
      return NextResponse.json({ error: "Missing required order information" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Check store status
    if (store.status === "PAUSED" || store.status === "DELISTED" || store.status === "SUSPENDED" || store.status === "BANNED") {
      return NextResponse.json(
        { error: "This store is currently not accepting orders due to platform policy." },
        { status: 403 }
      );
    }

    // Validate cart item schema against negative/zero/float quantities
    for (const it of items) {
      if (!it.id || typeof it.quantity !== "number" || !Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 500) {
        return NextResponse.json({ error: "Invalid product quantity in bag. Must be a positive whole number." }, { status: 400 });
      }
    }

    // Deduplicate/aggregate cart items if same product ID sent multiple times
    const aggregatedItemsMap = new Map<string, number>();
    for (const it of items) {
      aggregatedItemsMap.set(it.id, (aggregatedItemsMap.get(it.id) || 0) + it.quantity);
    }
    const sanitizedItems = Array.from(aggregatedItemsMap.entries()).map(([id, quantity]) => ({ id, quantity }));

    // Fetch and validate all products & calculate total
    const productIds = sanitizedItems.map((i) => i.id);
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId: store.id },
    });

    if (dbProducts.length !== sanitizedItems.length) {
      return NextResponse.json({ error: "Some products are invalid or no longer available." }, { status: 400 });
    }

    let calculatedTotal = 0;
    const orderItemsData = sanitizedItems.map((cartItem) => {
      const product = dbProducts.find((p) => p.id === cartItem.id)!;
      if (product.stock < cartItem.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Only ${product.stock} available.`);
      }
      const itemSubtotal = Number(product.price) * cartItem.quantity;
      calculatedTotal += itemSubtotal;

      return {
        productId: product.id,
        quantity: cartItem.quantity,
        price: product.price,
      };
    });

    const totalAmount = calculatedTotal;
    const platformFee = Math.round((totalAmount * (PLATFORM_FEE_PERCENT / 100)) * 100) / 100;
    const sellerNet = Math.round((totalAmount - platformFee) * 100) / 100;
    const orderNumber = `ORD-${Date.now().toString().slice(-5)}${Math.floor(100 + Math.random() * 900)}`;

    // Store Status Enforcer Check for Cash On Delivery (COD)
    if (paymentMethod === "COD") {
      const availableBalance = Number(store.walletBalance) - Number(store.walletHolds);
      if (store.status === "COD_BLOCKED" || availableBalance < platformFee) {
        return NextResponse.json(
          {
            error: "Cash on Delivery is unavailable for this store. Please pay online with SSLCommerz (Cards/bKash/Nagad).",
          },
          { status: 400 }
        );
      }
    }

    // Create Order in DB
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          storeId: store.id,
          buyerName,
          buyerEmail: buyerEmail || `${buyerPhone}@storeforge.buyer`,
          buyerPhone,
          shippingAddress,
          shippingCity: shippingCity || "Dhaka",
          totalAmount,
          platformFee,
          sellerNet,
          paymentMethod,
          status: paymentMethod === "COD" ? "CONFIRMED" : "PENDING_PAYMENT",
          items: {
            create: orderItemsData,
          },
        },
      });

      // If COD, reserve stock immediately and hold platform fee on seller wallet
      if (paymentMethod === "COD") {
        for (const item of orderItemsData) {
          const updateCount = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updateCount.count === 0) {
            throw new Error("One or more items in your bag just sold out. Please refresh your bag.");
          }
        }

        // Lock platform fee hold on seller wallet
        await tx.store.update({
          where: { id: store.id },
          data: {
            walletHolds: { increment: platformFee },
          },
        });

        // Record COD fee hold in Ledger
        await tx.ledgerEntry.create({
          data: {
            storeId: store.id,
            transactionId: orderNumber,
            entryType: "COD_FEE_HOLD",
            description: `Platform commission hold (৳${platformFee}) for active COD order ${orderNumber}`,
            debit: platformFee,
            credit: null,
          },
        });
      }

      return newOrder;
    });

    // If Online Payment with SSLCommerz, initiate gateway session
    if (paymentMethod === "SSLCOMMERZ") {
      const initResult = await sslcommerzService.initiateOrderCheckout(order.id);
      return NextResponse.json({
        success: true,
        redirectUrl: initResult.gatewayUrl,
        orderNumber: order.orderNumber,
      });
    }

    // For COD, return confirmation page URL directly
    return NextResponse.json({
      success: true,
      redirectUrl: `/store/${store.slug}/order/${order.orderNumber}`,
      orderNumber: order.orderNumber,
    });
  } catch (error: any) {
    console.error("[API:orders/create] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process order" },
      { status: 400 }
    );
  }
}
