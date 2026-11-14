import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import { Modules } from "@medusajs/framework/utils";

// POST /admin/repairs/:id/milestone
// Manages explicit physical milestone flags (completed, collected, cancelled, refund)
// strictly decoupled from financial payment_status
export async function POST(
  req: MedusaRequest<{
    milestone: "completed" | "collected" | "cancelled" | "refund";
    value?: boolean;
    amount?: number;
    reason?: string;
  }>,
  res: MedusaResponse
) {
  const { id } = req.params;
  const { milestone, value, amount, reason } = req.body || {};

  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  const tickets = await repairService.listRepairTickets({ id });

  if (!tickets || tickets.length === 0) {
    return res.status(404).json({ message: "Repair ticket not found" });
  }

  const ticket = tickets[0];
  const existingMetadata = (ticket.metadata as Record<string, any>) || {};
  const currentTags: string[] = Array.isArray(existingMetadata.tags)
    ? [...existingMetadata.tags]
    : typeof existingMetadata.tags === "string"
    ? existingMetadata.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const updatePayload: any = { id };
  const updatedMetadata: Record<string, any> = { ...existingMetadata };
  let eventToEmit: { name: string; data: any } | null = null;

  if (milestone === "completed") {
    const isCompleted = value !== undefined ? Boolean(value) : !ticket.completed_at;
    const now = new Date();
    updatePayload.completed_at = isCompleted ? now : null;
    updatedMetadata.is_completed = isCompleted;

    if (isCompleted) {
      const warrantyExpiry = new Date();
      warrantyExpiry.setMonth(warrantyExpiry.getMonth() + (ticket.warranty_months || 3));
      updatePayload.warranty_expiry = warrantyExpiry;
      if (!currentTags.includes("Completed")) currentTags.push("Completed");
      eventToEmit = {
        name: "repair.completed",
        data: { id: ticket.id, repair_ticket_id: ticket.id, status: ticket.status },
      };
    } else {
      updatePayload.warranty_expiry = null;
      const idx = currentTags.indexOf("Completed");
      if (idx !== -1) currentTags.splice(idx, 1);
      eventToEmit = {
        name: "repair.milestone_changed",
        data: { id: ticket.id, repair_ticket_id: ticket.id, milestone: "completed", value: false },
      };
    }
  } else if (milestone === "collected") {
    const isCollected = value !== undefined ? Boolean(value) : !ticket.collected_at;
    const now = new Date();
    updatePayload.collected_at = isCollected ? now : null;
    updatedMetadata.is_collected = isCollected;

    if (isCollected) {
      if (!currentTags.includes("Collected")) currentTags.push("Collected");
    } else {
      const idx = currentTags.indexOf("Collected");
      if (idx !== -1) currentTags.splice(idx, 1);
    }

    eventToEmit = {
      name: "repair.milestone_changed",
      data: { id: ticket.id, repair_ticket_id: ticket.id, milestone: "collected", value: isCollected },
    };
  } else if (milestone === "cancelled") {
    updatePayload.status = "cancelled";
    updatedMetadata.is_cancelled = true;
    updatedMetadata.cancelled_at = new Date().toISOString();
    if (reason) updatedMetadata.cancel_reason = reason;

    if (!currentTags.includes("Cancelled")) currentTags.push("Cancelled");

    // Clean up document links from metadata when cancelled
    delete updatedMetadata.zoho_estimate_id;
    delete updatedMetadata.zoho_invoice_id;
    delete updatedMetadata.zoho_payment_id;
    delete updatedMetadata.pdf_url;
    delete updatedMetadata.short_pdf_link;
    delete updatedMetadata.last_document_type;
    delete updatedMetadata.last_document_title;

    try {
      const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
      if (docService && typeof docService.deleteDocumentsForRepairTicket === "function") {
        await docService.deleteDocumentsForRepairTicket(id, req.scope);
      }
    } catch (_) {}

    eventToEmit = {
      name: "repair.status_changed",
      data: { id: ticket.id, repair_ticket_id: ticket.id, status: "cancelled", previous_status: ticket.status },
    };
  } else if (milestone === "refund") {
    const refundAmt = Number(amount || 0);
    if (isNaN(refundAmt) || refundAmt <= 0) {
      return res.status(400).json({ message: "Invalid refund amount" });
    }

    const currentPaid = Number(ticket.amount_paid || 0);
    const newPaid = Math.max(0, currentPaid - refundAmt);
    const isFullRefund = refundAmt >= currentPaid;

    updatePayload.amount_paid = newPaid;
    updatePayload.payment_status = isFullRefund ? "refunded" : "partially_paid";

    const refundHistory = Array.isArray(existingMetadata.refund_history)
      ? [...existingMetadata.refund_history]
      : [];
    refundHistory.push({
      amount: refundAmt,
      reason: reason || "Manual refund",
      date: new Date().toISOString(),
    });

    updatedMetadata.refund_history = refundHistory;
    updatedMetadata.is_refunded = true;
    updatedMetadata.last_refund_amount = refundAmt;
    updatedMetadata.last_refund_reason = reason || "Manual refund";
    updatedMetadata.total_refunded = (Number(updatedMetadata.total_refunded || 0) + refundAmt);

    // Update tags
    const filteredTags = currentTags.filter((t) => t !== "Paid" && t !== "Refunded" && t !== "Partially Refunded");
    if (isFullRefund) {
      filteredTags.push("Refunded");
      delete updatedMetadata.zoho_payment_id;
      try {
        const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
        if (docService && typeof docService.deleteReceiptsForRepairTicket === "function") {
          await docService.deleteReceiptsForRepairTicket(id, req.scope);
        }
      } catch (e) {
        req.scope.resolve("logger")?.warn?.(`[Milestone Refund] Failed to delete receipts on full refund: ${e}`);
      }
    } else {
      filteredTags.push("Partially Refunded");
    }
    currentTags.length = 0;
    currentTags.push(...filteredTags);

    eventToEmit = {
      name: "repair.refund_recorded",
      data: {
        id: ticket.id,
        repair_ticket_id: ticket.id,
        refund_amount: refundAmt,
        remaining_paid: newPaid,
        reason,
      },
    };
  } else {
    return res.status(400).json({ message: `Unknown milestone: ${milestone}` });
  }

  updatedMetadata.tags = currentTags;
  updatePayload.metadata = updatedMetadata;

  const updatedTicket = await repairService.updateRepairTickets(updatePayload);

  if (eventToEmit) {
    try {
      const eventBus: any = req.scope.resolve(Modules.EVENT_BUS, { allowUnregistered: true });
      if (eventBus) {
        await eventBus.emit(eventToEmit);
      }
    } catch (_) {}
  }

  return res.json({
    success: true,
    message: `Milestone ${milestone} updated successfully`,
    repair_ticket: updatedTicket,
  });
}
