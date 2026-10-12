import {
  type SubscriberConfig,
  type SubscriberArgs,
} from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";
import { getRepairTemplate } from "../utils/templates/repair";

export default async function handleOrderPaid({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderModuleService = container.resolve(Modules.ORDER);
  const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
  const customerModuleService = container.resolve(Modules.CUSTOMER);

  // Retrieve the order that was paid
  const order = await orderModuleService.retrieveOrder(data.id);

  // Check if it's tied to a repair ticket
  const repairTicketId = order.metadata?.repair_ticket_id as string;
  if (!repairTicketId) {
    return;
  }

  // Fetch the ticket
  const ticket = await repairService.retrieveRepairTicket(repairTicketId);

  // Notify technician if assigned
  if (ticket.technician_id) {
    let technicianEmail = "";
    
    // Try fetching technician details from customer module (since user uses customers as technicians)
    try {
      const customer = await customerModuleService.retrieveCustomer(ticket.technician_id);
      if (customer.email) {
        technicianEmail = customer.email;
      }
    } catch (e) {
      // If they are an admin user instead of a customer
      try {
        const userModuleService = container.resolve(Modules.USER);
        const user = await userModuleService.retrieveUser(ticket.technician_id);
        if (user.email) {
          technicianEmail = user.email;
        }
      } catch (e2) {}
    }

    if (technicianEmail) {
      const [settings] = await repairService.listRepairSettings({});
      if (!settings || settings.email_notifications_enabled) {
        const templateData = {
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        repair_ticket_id: ticket.id,
        technician_name: ticket.technician_name,
      };
      const template = getRepairTemplate("technician-job-paid", templateData);
      
      // Dispatch notification
      const notificationModuleService = container.resolve(Modules.NOTIFICATION);
      await notificationModuleService.createNotifications({
        to: technicianEmail,
        channel: "email",
        template: "technician-job-paid",
        content: {
          subject: `Repair Job Paid: #${ticket.ticket_number}`,
          html: template.html,
        },
        data: {
          ...templateData,
          body: template.text,
        },
      });
      }
    }
  }

  const amount = order.total || ticket.total_actual || ticket.total_estimate;

  // 1. Emit repair.payment_received event so medusajs-documents-plugin handles receipt & Zoho sync
  try {
    const eventBus = container.resolve(Modules.EVENT_BUS, { allowUnregistered: true });
    if (eventBus) {
      await eventBus.emit({
        name: "repair.payment_received",
        data: {
          id: ticket.id,
          repair_ticket_id: ticket.id,
          amount,
          order_id: order.id,
        },
      });
    }
  } catch (e) {
    container.resolve("logger")?.warn?.(`[handleOrderPaid] Failed to emit repair.payment_received: ${e}`);
  }

  // 2. Fallback: Push Payment to Zoho Books only if medusajs-documents-plugin is NOT active
  try {
    const docModule = container.resolve("documents", { allowUnregistered: true });
    if (!docModule) {
      const { syncPaymentToZoho } = await import("../utils/zoho-payment-sync.js");
      await syncPaymentToZoho(container, ticket.id, amount as number, "PaymentCollection");
    }
  } catch (e) {}
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
};
