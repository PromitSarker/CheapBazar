import type {
  SSLCommerzInitParams,
  SSLCommerzInitResponse,
  SSLCommerzValidationResponse,
  SSLCommerzRefundParams,
  SSLCommerzRefundResponse,
} from "./types";

export class SSLCommerzClient {
  private storeId: string;
  private storePasswd: string;
  private isLive: boolean;
  private baseUrl: string;

  constructor() {
    this.storeId = process.env.SSLCOMMERZ_STORE_ID || "testbox";
    this.storePasswd = process.env.SSLCOMMERZ_STORE_PASSWORD || "qwerty";
    this.isLive = process.env.SSLCOMMERZ_IS_LIVE === "true";
    this.baseUrl = this.isLive
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";
  }

  /**
   * Step 1: Initiate Payment Session with SSLCommerz
   */
  async initPayment(params: SSLCommerzInitParams): Promise<SSLCommerzInitResponse> {
    const payload = new URLSearchParams();
    payload.append("store_id", this.storeId);
    payload.append("store_passwd", this.storePasswd);

    // Append all transaction parameters
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        payload.append(key, String(val));
      }
    });

    const endpoint = `${this.baseUrl}/gwprocess/v4/api.php`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
        signal: AbortSignal.timeout(15000), // 15 second timeout
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz init failed with HTTP ${response.status}`);
      }

      const data: SSLCommerzInitResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error("[SSLCommerzClient] initPayment Error:", error);
      return {
        status: "FAILED",
        failedreason: error.message || "Failed to communicate with SSLCommerz Gateway",
      };
    }
  }

  /**
   * Step 2: Validate transaction using SSLCommerz Order Validation API
   * Crucial Security: Must validate via server API before crediting or marking orders paid.
   */
  async validateTransaction(valId: string): Promise<SSLCommerzValidationResponse> {
    const query = new URLSearchParams({
      val_id: valId,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      format: "json",
      v: "1",
    });

    const endpoint = `${this.baseUrl}/validator/api/validationserverAPI.php?${query.toString()}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz validation failed with HTTP ${response.status}`);
      }

      const data: SSLCommerzValidationResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error("[SSLCommerzClient] validateTransaction Error:", error);
      return {
        status: "FAILED",
        tran_id: "",
        val_id: valId,
        amount: "0.00",
        currency: "BDT",
        error: error.message || "Validation request failed",
      };
    }
  }

  /**
   * Query status of a transaction by merchant tran_id
   */
  async queryByTransactionId(tranId: string): Promise<any> {
    const query = new URLSearchParams({
      tran_id: tranId,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      format: "json",
    });

    const endpoint = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      return await response.json();
    } catch (error: any) {
      console.error("[SSLCommerzClient] queryByTransactionId Error:", error);
      return null;
    }
  }

  /**
   * Step 3: Initiate Refund API
   */
  async refund(params: SSLCommerzRefundParams): Promise<SSLCommerzRefundResponse> {
    const query = new URLSearchParams({
      bank_tran_id: params.bank_tran_id,
      refund_amount: String(params.refund_amount),
      refund_remarks: params.refund_remarks,
      re_id: params.re_id,
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      format: "json",
    });

    const endpoint = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      return await response.json();
    } catch (error: any) {
      console.error("[SSLCommerzClient] refund Error:", error);
      return {
        status: "failed",
        errorReason: error.message || "Refund failed",
      };
    }
  }
}

export const sslcommerzClient = new SSLCommerzClient();
