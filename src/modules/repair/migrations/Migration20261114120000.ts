import { Migration } from '@mikro-orm/migrations';

export class Migration20261114120000 extends Migration {
  async up(): Promise<void> {
    // 1. Resynchronize raw_amount_paid for tickets where payment_status is pending with no payment records
    this.addSql(`
      UPDATE "repair_ticket"
      SET 
        "amount_paid" = 0,
        "raw_amount_paid" = jsonb_build_object('value', '0', 'precision', 20)
      WHERE "payment_status" = 'pending'
        AND (metadata->'payment_history' IS NULL OR jsonb_array_length(COALESCE(metadata->'payment_history', '[]'::jsonb)) = 0)
        AND metadata->>'zoho_payment_id' IS NULL
        AND (metadata->>'paystack_reference' IS NULL OR metadata->>'paystack_reference' = payment_collection_id);
    `);

    // 2. Synchronize raw_amount_paid for any remaining rows
    this.addSql(`
      UPDATE "repair_ticket"
      SET "raw_amount_paid" = jsonb_build_object('value', "amount_paid"::text, 'precision', 20)
      WHERE "raw_amount_paid" IS NULL OR ("raw_amount_paid"->>'value')::numeric != "amount_paid";
    `);

    // 3. Clean up stale tags in metadata
    this.addSql(`
      UPDATE "repair_ticket"
      SET "metadata" = jsonb_set(
        "metadata",
        '{tags}',
        COALESCE(
          (
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements("metadata"->'tags') elem
            WHERE elem #>> '{}' NOT IN ('Paid', 'Partially Paid')
          ),
          '[]'::jsonb
        )
      )
      WHERE "amount_paid" = 0
        AND "payment_status" = 'pending'
        AND "metadata"->'tags' IS NOT NULL;
    `);

    // 4. Create trigger function to ensure raw_amount_paid always mirrors amount_paid
    this.addSql(`
      CREATE OR REPLACE FUNCTION sync_repair_ticket_raw_amount_paid()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.amount_paid IS NOT NULL THEN
          NEW.raw_amount_paid = jsonb_build_object('value', NEW.amount_paid::text, 'precision', 20);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      DROP TRIGGER IF EXISTS trg_sync_repair_ticket_raw_amount_paid ON "repair_ticket";
      CREATE TRIGGER trg_sync_repair_ticket_raw_amount_paid
      BEFORE INSERT OR UPDATE OF "amount_paid", "raw_amount_paid" ON "repair_ticket"
      FOR EACH ROW
      EXECUTE FUNCTION sync_repair_ticket_raw_amount_paid();
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TRIGGER IF EXISTS trg_sync_repair_ticket_raw_amount_paid ON "repair_ticket";');
    this.addSql('DROP FUNCTION IF EXISTS sync_repair_ticket_raw_amount_paid();');
  }
}
