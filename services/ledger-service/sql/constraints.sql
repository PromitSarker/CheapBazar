-- ledger-service integrity guarantees. Applied automatically at service start
-- (idempotent) and can be run by hand:  psql "$DATABASE_URL" -f sql/constraints.sql
--
-- 1. LedgerPosting / LedgerTransaction / StatementEntry are INSERT-ONLY.
-- 2. Every LedgerTransaction balances (sum debit = sum credit) at COMMIT.
-- 3. A posting is a debit XOR a credit, never negative.
-- 4. At most one in-flight withdrawal per store.

create or replace function ledger_block_mutation() returns trigger as $$
begin
  raise exception 'ledger rows are immutable (% on %)', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

drop trigger if exists ledger_posting_immutable on "LedgerPosting";
create trigger ledger_posting_immutable before update or delete on "LedgerPosting"
  for each row execute function ledger_block_mutation();

drop trigger if exists ledger_tx_immutable on "LedgerTransaction";
create trigger ledger_tx_immutable before update or delete on "LedgerTransaction"
  for each row execute function ledger_block_mutation();

drop trigger if exists statement_entry_immutable on "StatementEntry";
create trigger statement_entry_immutable before update or delete on "StatementEntry"
  for each row execute function ledger_block_mutation();

alter table "LedgerPosting" drop constraint if exists ledger_posting_shape;
alter table "LedgerPosting" add constraint ledger_posting_shape check (
  "debit" >= 0 and "credit" >= 0 and (("debit" > 0) <> ("credit" > 0))
);

create or replace function ledger_assert_balanced() returns trigger as $$
declare d numeric; c numeric;
begin
  select coalesce(sum("debit"), 0), coalesce(sum("credit"), 0) into d, c
    from "LedgerPosting" where "transactionId" = new."transactionId";
  if d <> c then
    raise exception 'unbalanced ledger transaction %: debit % <> credit %', new."transactionId", d, c
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists ledger_posting_balanced on "LedgerPosting";
create constraint trigger ledger_posting_balanced after insert on "LedgerPosting"
  deferrable initially deferred for each row execute function ledger_assert_balanced();

create unique index if not exists withdrawal_one_active_per_store
  on "Withdrawal" ("storeId") where "status" in ('PENDING', 'PROCESSING');

