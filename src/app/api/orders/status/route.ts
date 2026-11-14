import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStore } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { updateOrderStatusViaServices } from "@/lib/bff/portal";
import type { OrderStatus } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const store = await requireStore();
    const body = await request.json();
    const { orderId, newStatus } = body as { orderId: string; newStatus: OrderStatus };

    if (!orderId || !newStatus) {
      return NextResponse.json({ error: "Missing orderId or newStatus" }, { status: 400 });
    }

    if (servicesEnabled()) {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      const r = await updateOrderStatusViaServices(store.id, user.id, String(orderId), String(newStatus));
      return NextResponse.json(r.body, { status: r.status });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Guard: Cannot transition terminal states
    if (order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "REFUSED") {
      return NextResponse.json(
        { error: `Cannot update an order that is already in terminal state: ${order.status}` },
        { status: 400 }
      );
    }

    const previousStatus = order.status;

    await prisma.$transaction(async (tx) => {
      // 1. Update Order Status
      await tx.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });

      // 2. Cash On Delivery (COD): no platform fee, so the seller wallet is never touched.
      //    Delivery needs no money movement; a cancelled / refused order only restocks.
      if (order.paymentMethod === "COD") {
        if (newStatus === "CANCELLED" || newStatus === "REFUSED") {
          // Restock product inventory
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }

          // Ledger Entry
          await tx.ledgerEntry.create({
            data: {
              storeId: store.id,
              transactionId: order.orderNumber,
              entryType: "COD_HOLD_RELEASED",
              description: `COD Order ${newStatus}: items restocked for ${order.orderNumber}`,
              debit: null,
              credit: null,
            },
          });
        }
      }

      // 3. Handle Online Paid Order Cancellation: Restock inventory
      if (order.paymentMethod === "SSLCOMMERZ" && (newStatus === "CANCELLED" || newStatus === "REFUSED")) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        await tx.ledgerEntry.create({
          data: {
            storeId: store.id,
            transactionId: order.orderNumber,
            entryType: "ORDER_RESTOCKED",
            description: `Order ${order.orderNumber} ${newStatus}: Items restocked to inventory`,
            debit: null,
            credit: null,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus,
    });
  } catch (error: any) {
    console.error("[API:orders/status] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update order status" },
      { status: 500 }
    );
  }
}
