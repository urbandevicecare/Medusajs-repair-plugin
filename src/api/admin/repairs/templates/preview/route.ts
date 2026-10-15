import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import { generateRepairPdfBuffer } from "../../../../../utils/generate-repair-document";

// GET /admin/repairs/templates/preview?type=invoice | estimate | receipt | job_card | service_report | handover&style=zoho_exact | standard | modern
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
    const [settings] = await repairService.listRepairSettings({});

    const rawType = String(req.query.type || "invoice").trim().toLowerCase();
    const validTypes = ["invoice", "quote", "estimate", "receipt", "job_card", "service_report", "diagnostic", "handover"];
    const docType = validTypes.includes(rawType) ? rawType : "invoice";

    const style = String(req.query.style || "standard").trim().toLowerCase();

    const isReceipt = docType === "receipt";
    const isQuote = docType === "quote" || docType === "estimate";

    const sampleTicket: any = {
      id: "rep_ticket_preview_01",
      ticket_number: "1791294624557",
      status: isQuote ? "awaiting_approval" : isReceipt ? "completed" : "ready",
      payment_status: isReceipt ? "paid" : "unpaid",
      amount_paid: isReceipt ? 29500 : 0,
      labor_estimate: 4500,
      total_estimate: 29500,
      total_actual: isReceipt ? 29500 : 0,
      approval_token: "tok_preview_sample_88921",
      accessories: "Original MagSafe 3 96W Charger & Braided Cable",
      issue_description: "Device thermal throttling under heavy CPU load; fan bearings generating loud clicking noise; TrueTone sensor calibration required.",
      technician_name: "Bonifencia A.",
      created_at: new Date().toISOString(),
      customer: {
        first_name: "Nelson",
        last_name: "Owalo",
        email: "privateemail4mandela@gmail.com",
        phone: "+254 729 436 660",
      },
      device: {
        brand: "Apple",
        model_name: 'MacBook Pro 14" (M3)',
        serial_number: "PF59XEN8",
        imei: "358901234567890",
        condition: "Pristine chassis condition with minor desk wear on rubber feet. Battery cycle count 420.",
        parts_used: [
          {
            name: 'OEM Liquid Retina XDR Display Assembly',
            sku: 'APL-MBP14-DISP',
            price: 19000,
            is_taxable: true,
          },
          {
            name: 'OEM Internal Cooling Fan Module',
            sku: 'APL-FAN-M3',
            price: 6000,
            is_taxable: true,
          },
        ],
      },
      custom_parts: [],
    };

    const pdfBuffer = await generateRepairPdfBuffer(
      docType,
      sampleTicket,
      "Nelson Owalo",
      settings || {},
      settings?.storefront_url || process.env.STORE_URL || "http://localhost:3000",
      style
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="preview-${docType}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to render template preview", error: error.message });
  }
}
