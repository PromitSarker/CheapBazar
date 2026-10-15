import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sslcommerzClient } from "./client";
import type { PaymentPurpose, OrderStatus } from "@prisma/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || "5.0");

export class SSLCommerzService {
  /**
   * Generates unique Transaction Reference: e.g. "SF-ORD-a1b2c3d4"
   */
  private generateTranId(prefix: "ORD" | "TOPUP" | "SUB" | "AD"): string {
    const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
    const timestamp = Date.now().toString().slice(-4);
    return `SF-${prefix}-${timestamp}${randomHex}`;
  }

  /**
   * Initiate Online Order Checkout with SSLCommerz
   */
  async initiateOrderCheckout(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: { include: { product: true } },
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const tranId = this.generateTranId("ORD");

    // Upsert / Create Payment Transaction record
    await prisma.paymentTransaction.upsert({
      where: { orderId: order.id },
      update: {
        tranId,
        amount: order.totalAmount,
        currency: "BDT",
        purpose: "STORE_ORDER",
        status: "PENDING",
        storeId: order.storeId,
      },
      create: {
        tranId,
        amount: order.totalAmount,
        currency: "BDT",
        purpose: "STORE_ORDER",
        status: "PENDING",
        orderId: order.id,
        storeId: order.storeId,
      },
    });

    const initResponse = await sslcommerzClient.initPayment({
      total_amount: Number(order.totalAmount),
      currency: "BDT",
      tran_id: tranId,
      success_url: `${APP_URL}/api/payments/sslcommerz/success`,
      fail_url: `${APP_URL}/api/payments/sslcommerz/fail`,
      cancel_url: `${APP_URL}/api/payments/sslcommerz/cancel`,
      ipn_url: `${APP_URL}/api/payments/sslcommerz/ipn`,
      
      // Customer details
      cus_name: order.buyerName,
      cus_email: order.buyerEmail,
      cus_phone: order.buyerPhone,
      cus_add1: order.shippingAddress,
      cus_city: order.shippingCity || "Dhaka",
      cus_postcode: "1200",
      cus_country: "Bangladesh",

      // Products / Logistics
      product_name: `Order ${order.orderNumber} (${order.store.name})`,
      product_category: "General",
      product_profile: "physical-goods",
      shipping_method: "Courier",
      num_of_item: order.items.reduce((acc, it) => acc + it.quantity, 0),

      // Metadata tracking
      value_a: "STORE_ORDER",
      value_b: order.store.slug,
      value_c: order.orderNumber,
      value_d: order.id,
    });

    if (initResponse.status !== "SUCCESS" || !initResponse.GatewayPageURL) {
      throw new Error(initResponse.failedreason || "Failed to initialize SSLCommerz payment gateway session");
    }

    return {
      success: true,
      gatewayUrl: initResponse.GatewayPageURL,
      tranId,
    };
  }

  /**
   * Initiate Merchant Wallet Top-Up with SSLCommerz
   */
  async initiateWalletTopUp(params: {
    storeId: string;
    amount: number;
    userName: string;
    userEmail: string;
    userPhone?: string;
  }) {
    const { storeId, amount, userName, userEmail, userPhone } = params;

    if (amount < 10) {
      throw new Error("Minimum top-up amount is ৳10.00 BDT");
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new Error("Store not found");
    }

    const tranId = this.generateTranId("TOPUP");

    await prisma.paymentTransaction.create({
      data: {
        tranId,
        amount,
        currency: "BDT",
        purpose: "WALLET_TOPUP",
        status: "PENDING",
        storeId: store.id,
      },
    });

    const initResponse = await sslcommerzClient.initPayment({
      total_amount: amount,
      currency: "BDT",
      tran_id: tranId,
      success_url: `${APP_URL}/api/payments/sslcommerz/success`,
      fail_url: `${APP_URL}/api/payments/sslcommerz/fail`,
      cancel_url: `${APP_URL}/api/payments/sslcommerz/cancel`,
      ipn_url: `${APP_URL}/api/payments/sslcommerz/ipn`,

      cus_name: userName,
      cus_email: userEmail,
      cus_phone: userPhone || "01700000000",
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",

      product_name: `StoreForge Wallet Top-Up (${store.name})`,
      product_category: "Wallet Top-up",
      product_profile: "general",
      shipping_method: "NO",

      value_a: "WALLET_TOPUP",
      value_b: store.slug,
      value_c: store.id,
    });

    if (initResponse.status !== "SUCCESS" || !initResponse.GatewayPageURL) {
      throw new Error(initResponse.failedreason || "Failed to initialize SSLCommerz payment gateway session");
    }

    return {
      success: true,
      gatewayUrl: initResponse.GatewayPageURL,
      tranId,
    };
  }

  /**
   * Validate incoming payment from SSLCommerz callback or IPN webhook
   * Idempotent & thread-safe state transition
   */
  async handlePaymentValidation(valId: string, tranId: string) {
    if (!tranId || !valId) {
      throw new Error("Missing tran_id or val_id in payment callback");
    }

    const payment = await prisma.paymentTransaction.findUnique({
      where: { tranId },
      include: {
        order: {
          include: {
            store: true,
            items: true,
          },
        },
        store: true,
      },
    });

    if (!payment) {
      throw new Error(`Payment transaction ${tranId} not found`);
    }

    // Idempotency check: If already validated, return existing status
    if (payment.status === "VALIDATED") {
      return {
        status: "ALREADY_VALIDATED",
        purpose: payment.purpose,
        storeSlug: payment.store?.slug || payment.order?.store?.slug,
        orderNumber: payment.order?.orderNumber,
      };
    }

    // Server-to-Server Validation with SSLCommerz Gateway
    const validation = await sslcommerzClient.validateTransaction(valId);

    const isValidStatus = validation.status === "VALID" || validation.status === "VALIDATED";
    const amountMatches = Math.abs(Number(validation.amount) - Number(payment.amount)) < 0.01;
    const currencyMatches = validation.currency === "BDT";
    const tranIdMatches = validation.tran_id === tranId;

    if (!isValidStatus || !amountMatches || !currencyMatches || !tranIdMatches) {
      await prisma.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          valId,
          rawValidation: validation as any,
        },
      });
      throw new Error(`SSLCommerz Validation rejected: status=${validation.status}, amount=${validation.amount}`);
    }

    // Transaction is verified! Execute atomic database state transitions:
    return await prisma.$transaction(async (tx) => {
      // 1. Atomic Compare-And-Swap (CAS) to eliminate double-crediting between redirect and IPN
      const updateResult = await tx.paymentTransaction.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: "VALIDATED",
          valId,
          bankTranId: validation.bank_tran_id || null,
          cardType: validation.card_type || null,
          rawValidation: validation as any,
        },
      });

      // If count === 0, another concurrent thread (IPN or Browser redirect) has already claimed and settled this payment!
      if (updateResult.count === 0) {
        return {
          status: "ALREADY_VALIDATED",
          purpose: payment.purpose,
          storeSlug: payment.store?.slug || payment.order?.store?.slug,
          orderNumber: payment.order?.orderNumber,
        };
      }

      // 2. Handle Purpose: STORE_ORDER
      if (payment.purpose === "STORE_ORDER" && payment.order) {
        const order = payment.order;

        // Update Order status
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CONFIRMED" },
        });

        // Decrement Product stock safely
        for (const item of order.items) {
          const prod = await tx.product.findUnique({ where: { id: item.productId } });
          const newStock = Math.max(0, (prod?.stock ?? 0) - item.quantity);
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: newStock },
          });
        }

        // Split Settlement:
        // Credit Seller Wallet with net amount (Total - Platform Fee)
        await tx.store.update({
          where: { id: order.storeId },
          data: {
            walletBalance: {
              increment: order.sellerNet,
            },
          },
        });

        // Write Double-Entry Ledger Entries
        // 1. Net Settlement to Seller
        await tx.ledgerEntry.create({
          data: {
            storeId: order.storeId,
            transactionId: tranId,
            entryType: "ORDER_SPLIT_SETTLEMENT",
            description: `Net settlement from Order ${order.orderNumber} via SSLCommerz (${validation.card_type || "Online"})`,
            credit: order.sellerNet,
            debit: null,
          },
        });

        // 2. Platform Fee Commission
        await tx.ledgerEntry.create({
          data: {
            storeId: order.storeId,
            transactionId: tranId,
            entryType: "PLATFORM_FEE",
            description: `${PLATFORM_FEE_PERCENT}% Platform Commission on Order ${order.orderNumber}`,
            credit: null,
            debit: order.platformFee,
          },
        });

        return {
          status: "SUCCESS",
          purpose: payment.purpose,
          storeSlug: order.store.slug,
          orderNumber: order.orderNumber,
        };
      }

      // 3. Handle Purpose: WALLET_TOPUP
      if (payment.purpose === "WALLET_TOPUP" && payment.storeId) {
        const store = await tx.store.findUnique({
          where: { id: payment.storeId },
        });

        if (store) {
          // Increment wallet balance
          const updatedStore = await tx.store.update({
            where: { id: store.id },
            data: {
              walletBalance: {
                increment: payment.amount,
              },
            },
          });

          // Ledger Entry
          await tx.ledgerEntry.create({
            data: {
              storeId: store.id,
              transactionId: tranId,
              entryType: "WALLET_TOP_UP",
              description: `Merchant prepaid balance top-up via SSLCommerz (${validation.card_type || "Gateway"})`,
              credit: payment.amount,
              debit: null,
            },
          });

          // Store Status Enforcer:
          // If store was in WARNING or COD_BLOCKED, and now has >= ৳500 available balance, restore to ACTIVE!
          const availableBalance = Number(updatedStore.walletBalance) - Number(updatedStore.walletHolds);
          if ((store.status === "WARNING" || store.status === "COD_BLOCKED") && availableBalance >= 500) {
            await tx.store.update({
              where: { id: store.id },
              data: { status: "ACTIVE" },
            });
          }

          return {
            status: "SUCCESS",
            purpose: payment.purpose,
            storeSlug: store.slug,
          };
        }
      }

      return {
        status: "SUCCESS",
        purpose: payment.purpose,
        storeSlug: payment.store?.slug,
      };
    });
  }

  /**
   * Handle payment failure / cancellation
   */
  async handlePaymentFailure(tranId: string, status: "FAILED" | "CANCELLED") {
    if (!tranId) return;
    await prisma.paymentTransaction.updateMany({
      where: { tranId, status: "PENDING" },
      data: { status },
    });
  }
}

export const sslcommerzService = new SSLCommerzService();
