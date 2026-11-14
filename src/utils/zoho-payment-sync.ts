import { MedusaContainer } from "@medusajs/framework/types";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";

export async function syncPaymentToZoho(
  container: MedusaContainer,
  ticketId: string,
  amount: number,
  paymentMode: string = "PaymentCollection",
  referenceNumber?: string
) {
  const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
  const ticket = await repairService.retrieveRepairTicket(ticketId);

  // Centralize document & Zoho payment creation in medusajs-documents-plugin
  const docService: any = container.resolve("documents", { allowUnregistered: true });
  if (docService) {
    try {
      await docService.generateDocument(
        {
          type: "receipt",
          repair_ticket_id: ticket.id,
          total: Number(amount || ticket.total_actual || ticket.total_estimate || 0),
          payment_reference: referenceNumber || (ticket.metadata as any)?.paystack_reference || (ticket.metadata as any)?.payment_reference,
          payment_status: "paid",
          auto_send: false,
        },
        container
      );
    } catch (docErr: any) {
      container.resolve("logger")?.warn?.(`[syncPaymentToZoho] Documents module delegation note: ${docErr.message}`);
    }
    return;
  }

  container.resolve("logger")?.warn?.(
    `[syncPaymentToZoho] Documents module is not registered. All document & Zoho receipt creation is centralized in medusajs-documents-plugin. No local fallback performed.`
  );
}
