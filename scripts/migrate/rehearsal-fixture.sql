-- Applied to the LOCAL COPY only (never Neon): data the live DB does not have yet, so the
-- order / hold / withdrawal / non-ACTIVE-status migration paths get exercised.
-- Stores used: unified-cloud (orders), sd (withdrawal), hghjg (suspended).
UPDATE "Store" SET status = 'SUSPENDED' WHERE slug = 'hghjg';
UPDATE "Store" SET "walletBalance" = 4850.00 WHERE slug = 'unified-cloud';
INSERT INTO "Product"(id,"storeId",name,description,price,stock) SELECT 'fx-prod-1', id, 'Fixture Widget', '', 450.00, 7 FROM "Store" WHERE slug='unified-cloud';
INSERT INTO "Order"(id,"orderNumber","storeId","buyerName","buyerEmail","buyerPhone","shippingAddress","shippingCity","totalAmount","platformFee","sellerNet","paymentMethod",status,"updatedAt")
  SELECT 'fx-ord-1','ORD-FX1',id,'Fixture Buyer','fx@example.com','01700000001','1 Test Rd','Dhaka',450.00,22.50,427.50,'COD','SHIPPED',now() FROM "Store" WHERE slug='unified-cloud';
INSERT INTO "Order"(id,"orderNumber","storeId","buyerName","buyerEmail","buyerPhone","shippingAddress","shippingCity","totalAmount","platformFee","sellerNet","paymentMethod",status,"updatedAt")
  SELECT 'fx-ord-2','ORD-FX2',id,'Fixture Buyer','fx@example.com','01700000001','1 Test Rd','Dhaka',900.00,45.00,855.00,'COD','DELIVERED',now() FROM "Store" WHERE slug='unified-cloud';
INSERT INTO "OrderItem"(id,"orderId","productId",quantity,price) VALUES ('fx-it-1','fx-ord-1','fx-prod-1',1,450.00),('fx-it-2','fx-ord-2','fx-prod-1',2,450.00);
INSERT INTO "WithdrawalRequest"(id,"withdrawalNumber","storeId","payoutMethodId",amount,fee,"netAmount",status,"updatedAt")
  SELECT 'fx-wd-1','WD-FX1',"storeId",id,1000.00,10.00,990.00,'COMPLETED',now() FROM "StorePayoutMethod" LIMIT 1;
