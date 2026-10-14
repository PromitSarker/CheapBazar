export interface SSLCommerzInitParams {
  total_amount: number;
  currency: string;
  tran_id: string;
  success_url: string;
  fail_url: string;
  cancel_url: string;
  ipn_url: string;

  // Customer Information
  cus_name: string;
  cus_email: string;
  cus_phone: string;
  cus_add1: string;
  cus_city: string;
  cus_postcode?: string;
  cus_country?: string;

  // Product / Shipment Information
  product_name: string;
  product_category: string;
  product_profile: "general" | "physical-goods" | "non-physical-goods";
  shipping_method: "YES" | "NO" | "Courier";
  num_of_item?: number;

  // Custom Metadata tracking
  value_a?: string; // Purpose: STORE_ORDER | WALLET_TOPUP | PRO_SUBSCRIPTION | AD_BOOKING
  value_b?: string; // Store ID / Slug
  value_c?: string; // Order ID / Reference
  value_d?: string; // Extra user context
}

export interface SSLCommerzInitResponse {
  status: "SUCCESS" | "FAILED";
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  redirectGatewayURL?: string;
  gw?: Record<string, string>;
}

export interface SSLCommerzValidationResponse {
  status: "VALID" | "VALIDATED" | "INVALID_TRANSACTION" | "FAILED";
  tran_date?: string;
  tran_id: string;
  val_id: string;
  amount: string;
  store_amount?: string;
  currency: string;
  bank_tran_id?: string;
  card_type?: string;
  card_no?: string;
  card_issuer?: string;
  card_brand?: string;
  card_issuer_country?: string;
  card_issuer_country_code?: string;
  currency_type?: string;
  currency_amount?: string;
  currency_rate?: string;
  base_fair?: string;
  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;
  risk_level?: string;
  risk_title?: string;
  error?: string;
}

export interface SSLCommerzRefundParams {
  bank_tran_id: string;
  refund_amount: number;
  refund_remarks: string;
  re_id: string; // Unique refund reference ID
}

export interface SSLCommerzRefundResponse {
  status: "success" | "failed";
  refund_ref_id?: string;
  errorReason?: string;
}
