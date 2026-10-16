import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REPAIR_MODULE } from "../../../../modules/repair";
import RepairModuleService from "../../../../modules/repair/service";

// GET /admin/repairs/settings
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  let [settings] = await repairService.listRepairSettings({});
  
  if (!settings) {
    settings = await repairService.createRepairSettings({
      email_notifications_enabled: true,
      sms_notifications_enabled: true,
      whatsapp_notifications_enabled: false,
      company_name: "Urban Device Care Ltd",
      invoice_template: "zoho_exact",
      estimate_template: "zoho_exact",
      receipt_template: "zoho_exact",
      job_card_template: "standard",
      service_report_template: "standard",
      handover_template: "standard",
    });
  }

  res.json({ settings });
}

// POST /admin/repairs/settings
export async function POST(
  req: MedusaRequest<{
    email_notifications_enabled?: boolean;
    sms_notifications_enabled?: boolean;
    whatsapp_notifications_enabled?: boolean;
    zoho_books_enabled?: boolean;
    zoho_client_id?: string;
    zoho_client_secret?: string;
    zoho_refresh_token?: string;
    zoho_organization_id?: string;
    zoho_domain?: string;
    paystack_enabled?: boolean;
    paystack_public_key?: string;
    paystack_secret_key?: string;
    company_name?: string;
    storefront_url?: string;
    pdf_logo_url?: string;
    pdf_address?: string;
    pdf_phone?: string;
    pdf_email?: string;
    pdf_website?: string;
    pdf_payment_details?: string;
    pdf_terms?: string;
    kra_pin?: string;
    invoice_template?: string;
    estimate_template?: string;
    receipt_template?: string;
    job_card_template?: string;
    service_report_template?: string;
    handover_template?: string;
    email_subject_template?: string;
    email_body_template?: string;
    sms_body_template?: string;
    whatsapp_body_template?: string;
  }>,
  res: MedusaResponse
) {
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  let [settings] = await repairService.listRepairSettings({});
  
  if (!settings) {
    settings = await repairService.createRepairSettings({
      email_notifications_enabled: req.body.email_notifications_enabled ?? true,
      sms_notifications_enabled: req.body.sms_notifications_enabled ?? true,
      whatsapp_notifications_enabled: req.body.whatsapp_notifications_enabled ?? false,
      ...req.body,
    });
  } else {
    settings = await repairService.updateRepairSettings({
      id: settings.id,
      ...req.body,
    });
  }

  // Synchronize settings with medusajs-documents-plugin if registered
  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService) {
      const docSettings = await docService.getSettings().catch(() => null);
      if (docSettings?.id) {
        await docService.updateDocumentSettings({
          id: docSettings.id,
          zoho_books_enabled: settings.zoho_books_enabled,
          zoho_client_id: settings.zoho_client_id,
          zoho_client_secret: settings.zoho_client_secret,
          zoho_refresh_token: settings.zoho_refresh_token,
          zoho_organization_id: settings.zoho_organization_id,
          zoho_domain: settings.zoho_domain || "com",
          company_name: settings.company_name,
          storefront_url: settings.storefront_url,
          pdf_logo_url: settings.pdf_logo_url,
          pdf_address: settings.pdf_address,
          pdf_phone: settings.pdf_phone,
          pdf_email: settings.pdf_email,
          pdf_website: settings.pdf_website,
          pdf_payment_details: settings.pdf_payment_details,
          pdf_terms: settings.pdf_terms,
        }).catch(() => {});
      }
    }
  } catch (syncErr: any) {
    req.scope.resolve("logger")?.warn?.(`[Repair Settings] Could not sync settings to documents plugin: ${syncErr.message}`);
  }

  res.json({ settings });
}
