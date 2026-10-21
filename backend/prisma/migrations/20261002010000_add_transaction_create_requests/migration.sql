CREATE TABLE "TransactionCreateRequest" (
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "responseBody" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionCreateRequest_pkey" PRIMARY KEY ("userId", "idempotencyKey"),
  CONSTRAINT "TransactionCreateRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "TransactionCreateRequest_key_check" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT "TransactionCreateRequest_hash_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "TransactionCreateRequest_response_check" CHECK ("responseStatus" = 201 AND jsonb_typeof("responseBody") = 'object')
);
-- No FK to Transaction: replay remains stable after edits/deletion of the source.
CREATE FUNCTION reject_transaction_create_request_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Transaction creation receipts are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER transaction_create_request_immutable BEFORE UPDATE OR DELETE ON "TransactionCreateRequest"
FOR EACH ROW EXECUTE FUNCTION reject_transaction_create_request_change();
