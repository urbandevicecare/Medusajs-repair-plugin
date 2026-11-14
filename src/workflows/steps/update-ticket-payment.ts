import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { REPAIR_MODULE } from "../../modules/repair";
import RepairModuleService from "../../modules/repair/service";

type UpdateTicketPaymentInput = {
  ticketId?: string;
  reference: string;
  actualPaidAmount: number;
};

export const updateTicketPaymentStep = createStep(
  "update-ticket-payment",
  async (input: UpdateTicketPaymentInput, { container }) => {
    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
    
    let tickets;
    if (input.ticketId) {
      tickets = await repairService.listRepairTickets({ id: input.ticketId });
    } else {
      tickets = await repairService.listRepairTickets({ ticket_number: input.reference });
    }

    if (!tickets || tickets.length === 0) {
      throw new Error("Repair ticket not found");
    }

    const ticket = tickets[0];

    const parseNum = (val: any) => {
      if (!val) return 0;
      if (typeof val === "object" && "value" in val) return Number(val.value);
      return Number(val);
    };

    const totalEstimate = parseNum(ticket.total_estimate);
    const amountPaidSoFar = parseNum(ticket.amount_paid);
    const newAmountPaid = amountPaidSoFar + input.actualPaidAmount;
    
    const targetTotal = parseNum(ticket.total_actual) > 0 ? parseNum(ticket.total_actual) : totalEstimate;
    const isFullyPaid = newAmountPaid >= targetTotal;

    const previousData = {
      id: ticket.id,
      amount_paid: ticket.amount_paid,
      payment_status: ticket.payment_status,
      status: ticket.status,
      metadata: ticket.metadata,
      collected_at: ticket.collected_at,
    };

    const isPartiallyPaid = !isFullyPaid && newAmountPaid > 0;
    const paymentStatus = isFullyPaid ? "captured" : isPartiallyPaid ? "partially_paid" : "pending";

    let newStatus = ticket.status;
    const updatePayload: any = {
      id: ticket.id,
      amount_paid: newAmountPaid,
      payment_status: paymentStatus,
      payment_collection_id: input.reference
    };

    const existingMetadata = (ticket.metadata as Record<string, any>) || {};
    const rawTags = existingMetadata.tags;
    let existingTags: string[] = Array.isArray(rawTags)
      ? [...rawTags]
      : typeof rawTags === "string"
      ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    existingTags = existingTags.filter((t) => t !== "Paid" && t !== "Partially Paid" && t !== "Unpaid");

    if (isFullyPaid) {
      existingTags.push("Paid");
      if (ticket.status === "awaiting_approval") {
        newStatus = "repairing";
      }
    } else if (isPartiallyPaid) {
      existingTags.push("Partially Paid");
    }

    updatePayload.status = newStatus;
    updatePayload.metadata = {
      ...existingMetadata,
      tags: existingTags,
    };

    const updatedTicket = await repairService.updateRepairTickets(updatePayload);

    return new StepResponse(updatedTicket, previousData);
  },
  async (previousData, { container }) => {
    if (!previousData) return;
    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
    // Note: In real life, if Paystack actually captured the funds, we shouldn't roll this back just because Zoho failed!
    // But this exists if we intentionally abort the workflow for a critical local reason.
    await repairService.updateRepairTickets({
      id: previousData.id,
      amount_paid: previousData.amount_paid,
      payment_status: previousData.payment_status,
      status: previousData.status
    });
  }
);
