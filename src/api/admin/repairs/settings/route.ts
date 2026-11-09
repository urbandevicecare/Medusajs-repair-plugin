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

  // Synchronize common credentials with medusajs-documents-plugin if registered
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
        }).catch(() => {});
      }
    }
  } catch (syncErr: any) {
    req.scope.resolve("logger")?.warn?.(`[Repair Settings] Could not sync settings to documents plugin: ${syncErr.message}`);
  }

  res.json({ settings });
}
