import { Migration } from '@mikro-orm/migrations';

export class Migration20261015000000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "repair_settings" add column if not exists "kra_pin" text;');
    this.addSql('alter table if exists "repair_settings" add column if not exists "invoice_template" text not null default \'zoho_exact\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "estimate_template" text not null default \'zoho_exact\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "receipt_template" text not null default \'zoho_exact\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "job_card_template" text not null default \'standard\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "service_report_template" text not null default \'standard\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "handover_template" text not null default \'standard\';');
    this.addSql('alter table if exists "repair_settings" add column if not exists "email_subject_template" text;');
    this.addSql('alter table if exists "repair_settings" add column if not exists "email_body_template" text;');
    this.addSql('alter table if exists "repair_settings" add column if not exists "sms_body_template" text;');
    this.addSql('alter table if exists "repair_settings" add column if not exists "whatsapp_body_template" text;');
    this.addSql('alter table if exists "repair_settings" alter column "whatsapp_notifications_enabled" set default false;');
  }

  async down(): Promise<void> {
    this.addSql('alter table if exists "repair_settings" drop column if exists "kra_pin";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "invoice_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "estimate_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "receipt_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "job_card_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "service_report_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "handover_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "email_subject_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "email_body_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "sms_body_template";');
    this.addSql('alter table if exists "repair_settings" drop column if exists "whatsapp_body_template";');
  }
}
