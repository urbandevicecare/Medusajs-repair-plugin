import {
  createWorkflow,
  WorkflowResponse,
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk";
import { updateRepairTicketStatusStep } from "./steps/update-repair-ticket-status";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";
import { Modules } from "@medusajs/framework/utils";
import { getRepairTemplate } from "../utils/templates/repair";

type RejectRepairCostWorkflowInput = {
  repair_ticket_id: string;
};

export const notifyTechnicianRejectedStep = createStep(
  "notify-technician-rejected",
  async (input: { repair_ticket_id: string }, { container }) => {
    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
    const ticket = await repairService.retrieveRepairTicket(input.repair_ticket_id);

    if (ticket.technician_id) {
      let technicianEmail = "";
      const customerModuleService = container.resolve(Modules.CUSTOMER);
      try {
        const customer = await customerModuleService.retrieveCustomer(ticket.technician_id);
        if (customer.email) technicianEmail = customer.email;
      } catch (e) {
        try {
          const userModuleService = container.resolve(Modules.USER);
          const user = await userModuleService.retrieveUser(ticket.technician_id);
          if (user.email) technicianEmail = user.email;
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
        const template = getRepairTemplate("technician-job-rejected", templateData);
        
        const notificationModuleService = container.resolve(Modules.NOTIFICATION);
        try {
          await notificationModuleService.createNotifications({
            to: technicianEmail,
            channel: "email",
            template: "technician-job-rejected",
            content: {
              subject: `Repair Job Cancelled: #${ticket.ticket_number}`,
              html: template.html,
            },
            data: {
              ...templateData,
              body: template.text,
            },
          });
        } catch (err: any) {
          container.resolve("logger").warn(`Failed to send technician rejection notification: ${err.message}`);
        }
        }
      }
    }
      // 3. Delegate document cleanup to documents module
      try {
        const docService: any = container.resolve("documents", { allowUnregistered: true });
        if (docService && typeof docService.deleteDocumentsForRepairTicket === "function") {
          await docService.deleteDocumentsForRepairTicket(ticket.id, container);
        }
      } catch (e: any) {
        container.resolve("logger")?.warn?.(`[rejectRepairCostWorkflow] Failed to delete documents via documents module: ${e.message}`);
      }

      const metadata = ticket.metadata || {};
      const newMeta = { ...metadata };
      delete newMeta.zoho_estimate_id;
      delete newMeta.zoho_invoice_id;
      delete newMeta.zoho_payment_id;
      delete newMeta.pdf_url;
      delete newMeta.last_document_generated;
      await repairService.updateRepairTickets({ id: ticket.id, metadata: newMeta });

    return new StepResponse(null);
  }
);

export const rejectRepairCostWorkflow = createWorkflow(
  "reject-repair-cost-workflow",
  function (input: RejectRepairCostWorkflowInput) {
    const updatedTicket = updateRepairTicketStatusStep({
      repair_ticket_id: input.repair_ticket_id,
      status: "cancelled",
    });

    notifyTechnicianRejectedStep({ repair_ticket_id: input.repair_ticket_id });

    return new WorkflowResponse({
      repairTicket: updatedTicket,
    });
  },
);
