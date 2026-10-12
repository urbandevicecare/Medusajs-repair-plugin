import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createDeviceStep } from "./steps/create-device";
import { createRepairTicketStep } from "./steps/create-repair-ticket";
import { emitComplianceRequestedEventStep } from "./steps/emit-compliance-requested-event";
import { emitRepairCreatedEventStep } from "./steps/emit-repair-created-event";

type CreateRepairTicketWorkflowInput = {
  device: {
    serial_number: string;
    model_name: string;
    brand: string;
    customer_id?: string;
    imei?: string;
    condition?: string;
  };
  ticket: {
    customer_id?: string;
    issue_description: string;
    technician_name?: string;
    accessories?: string;
    terms_accepted?: boolean;
    data_wiped_consent?: boolean;
  };
};

export const createRepairTicketWorkflow = createWorkflow(
  "create-repair-ticket-workflow",
  function (input: CreateRepairTicketWorkflowInput) {
    const device = createDeviceStep(input.device);

    const repairTicket = createRepairTicketStep({
      device_id: device.id,
      customer_id: input.ticket.customer_id,
      issue_description: input.ticket.issue_description,
      technician_name: input.ticket.technician_name,
      accessories: input.ticket.accessories,
      terms_accepted: input.ticket.terms_accepted,
      data_wiped_consent: input.ticket.data_wiped_consent,
    });

    emitRepairCreatedEventStep({
      ticket_id: repairTicket.id,
    });

    emitComplianceRequestedEventStep({
      ticket_id: repairTicket.id,
      terms_accepted: input.ticket.terms_accepted ?? false,
    });

    return new WorkflowResponse({
      device,
      repairTicket,
    });
  },
);
