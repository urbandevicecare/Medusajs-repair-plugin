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

  // 1. Centralize document & Zoho payment creation in medusajs-documents-plugin if present
  try {
    const docService: any = container.resolve("documents", { allowUnregistered: true });
    if (docService) {
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
      return;
    }
  } catch (docErr: any) {
    container.resolve("logger")?.warn?.(`[syncPaymentToZoho] Documents module delegation note: ${docErr.message}`);
  }

  const [settings] = await repairService.listRepairSettings({});
  if (!settings?.zoho_books_enabled || !settings.zoho_client_id) {
    return;
  }

  try {
    const logger = container.resolve("logger");
    const { ZohoBooksService } = await import("../services/zoho-books.js");
    const zoho = new ZohoBooksService({
      client_id: settings.zoho_client_id,
      client_secret: settings.zoho_client_secret!,
      refresh_token: settings.zoho_refresh_token!,
      organization_id: settings.zoho_organization_id!,
            domain: settings.zoho_domain || "com",
    }, logger);

    let customerObj: any = { email: `guest-${ticket.id}@example.com` };
    if (ticket.customer_id) {
      const customerModule = container.resolve("customer", { allowUnregistered: true });
      if (customerModule) {
        const c = await customerModule.retrieveCustomer(ticket.customer_id);
        if (c) customerObj = c;
      }
    }
    const contactId = await zoho.syncContact(customerObj);
    
    const metadata = ticket.metadata || {};
    if (metadata.zoho_payment_id) {
      logger.info(`[Zoho Books] Payment already registered for ticket ${ticket.id} (${metadata.zoho_payment_id}), skipping duplicate.`);
      return;
    }

    let invId = metadata.zoho_invoice_id as string;
    if (!invId) {
      invId = await zoho.createInvoice(contactId, ticket);
    }

    const paymentId = await zoho.registerPayment(invId, amount, contactId, paymentMode, referenceNumber);
    await repairService.updateRepairTickets({
      id: ticket.id,
      metadata: { ...metadata, zoho_invoice_id: invId, zoho_payment_id: paymentId }
    });
    logger.info(`[Zoho Books] Synced payment ${paymentId} for ticket ${ticket.id}`);
  } catch (e: any) {
    container.resolve("logger").error(`[Zoho Books] Failed to sync payment: ${e.message}`);
  }
}
