import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import { Modules } from "@medusajs/framework/utils";
import { getRepairTemplate } from "../../../../../utils/templates/repair";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

export async function POST(
  req: MedusaRequest<{
    estimated_completion?: string | null;
    technician_name?: string | null;
    technician_id?: string | null;
  }>,
  res: MedusaResponse,
) {
  const { estimated_completion, technician_name, technician_id } = req.validatedBody;
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);

  // Get current ticket to check if technician changed
  const currentTicket = await repairService.retrieveRepairTicket(req.params.id);
  const isNewAssignment = technician_id && technician_id !== currentTicket.technician_id;

  const updatedTicket = await repairService.updateRepairTickets({
    id: req.params.id,
    estimated_completion: estimated_completion
      ? new Date(estimated_completion)
      : null,
    technician_name: technician_name || null,
    technician_id: technician_id || null,
  });

  if (isNewAssignment) {
    // Notify technician
    let technicianEmail = "";
    const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
    try {
      const customer = await customerModuleService.retrieveCustomer(technician_id);
      if (customer.email) technicianEmail = customer.email;
    } catch (e) {
      try {
        const userModuleService = req.scope.resolve(Modules.USER);
        const user = await userModuleService.retrieveUser(technician_id);
        if (user.email) technicianEmail = user.email;
      } catch (e2) {}
    }

    if (technicianEmail) {
      const [settings] = await repairService.listRepairSettings({});
      if (!settings || settings.email_notifications_enabled) {
        const templateData = {
        ticket_number: updatedTicket.ticket_number,
        status: updatedTicket.status,
        repair_ticket_id: updatedTicket.id,
        technician_name: updatedTicket.technician_name,
      };
      const template = getRepairTemplate("technician-assigned", templateData);
      
      const notificationModuleService = req.scope.resolve(Modules.NOTIFICATION);
      try {
        await notificationModuleService.createNotifications({
          to: technicianEmail,
          channel: "email",
          template: "technician-assigned",
          content: {
            subject: `New Repair Job Assigned: #${updatedTicket.ticket_number}`,
            html: template.html,
          },
          data: {
            ...templateData,
            body: template.text,
          },
        });
      } catch (err: any) {
        req.scope.resolve("logger").error(`Failed to send technician notification: ${err.message}`);
      }
      }
    }
  }

  res.json({
    repair_ticket: sanitizeRepairTicket(updatedTicket),
  });
}
