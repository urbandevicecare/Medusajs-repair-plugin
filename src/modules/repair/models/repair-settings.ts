import { model } from "@medusajs/framework/utils";

export const RepairSettings = model.define("repair_settings", {
  id: model.id().primaryKey(),
  email_notifications_enabled: model.boolean().default(true),
  sms_notifications_enabled: model.boolean().default(true),
  whatsapp_notifications_enabled: model.boolean().default(false),
  zoho_books_enabled: model.boolean().default(false),
  zoho_client_id: model.text().nullable(),
  zoho_client_secret: model.text().nullable(),
  zoho_refresh_token: model.text().nullable(),
  zoho_organization_id: model.text().nullable(),
  zoho_domain: model.text().default("com"),
  paystack_enabled: model.boolean().default(false),
  paystack_public_key: model.text().nullable(),
  paystack_secret_key: model.text().nullable(),

  company_name: model.text().default("Urban Device Care Ltd"),
  storefront_url: model.text().nullable(),

  // Customizable Notification Templates
  email_subject_template: model.text().nullable(),
  email_body_template: model.text().nullable(),
  sms_body_template: model.text().nullable(),
  whatsapp_body_template: model.text().nullable(),
});
