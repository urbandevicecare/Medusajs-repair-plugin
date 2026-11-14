import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import { syncPaymentToZoho } from "../../../../../utils/zoho-payment-sync.js";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const { amount, method, reference } = req.body as { amount?: number, method?: string, reference?: string };
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  
  const tickets = await repairService.listRepairTickets({ id });
  if (!tickets || tickets.length === 0) {
    return res.status(404).json({ message: "Repair ticket not found" });
  }
  
  const ticket = tickets[0];
  
  const parseNum = (val: any) => {
    if (!val) return 0;
    if (typeof val === "object" && "value" in val) return Number(val.value);
    return Number(val);
  };

  const totalEstimate = parseNum(ticket.total_estimate);
  const totalActual = parseNum(ticket.total_actual);
  const targetTotal = totalActual > 0 ? totalActual : totalEstimate;
  
  const currentPaid = parseNum(ticket.amount_paid);
  const remainingBalance = Math.max(0, targetTotal - currentPaid);

  const body = (req.body as any) || {};
  const isReset = body.action === "reset";

  let newAmountPaid = 0;
  let amountRecorded = 0;

  if (isReset) {
    newAmountPaid = 0;
    amountRecorded = 0;
  } else if (amount !== undefined && amount !== null) {
    amountRecorded = Math.max(0, Number(amount));
    newAmountPaid = currentPaid + amountRecorded;
  } else {
    amountRecorded = remainingBalance;
    newAmountPaid = currentPaid + amountRecorded;
  }

  const isFullyPaid = !isReset && newAmountPaid >= targetTotal && targetTotal > 0;
  const isPartiallyPaid = !isReset && !isFullyPaid && newAmountPaid > 0;

  const paymentStatus = isFullyPaid ? "captured" : isPartiallyPaid ? "partially_paid" : "pending";

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
  } else if (isPartiallyPaid) {
    existingTags.push("Partially Paid");
  }

  const paymentHistory = Array.isArray(existingMetadata.payment_history)
    ? [...existingMetadata.payment_history]
    : [];

  if (amountRecorded > 0) {
    paymentHistory.push({
      amount: amountRecorded,
      method: method || "Cash",
      reference: reference || "Direct Payment",
      date: new Date().toISOString(),
    });
  }

  const updates: any = {
    id,
    amount_paid: newAmountPaid,
    payment_status: paymentStatus,
    payment_collection_id: isReset ? null : (reference || ticket.payment_collection_id),
    metadata: {
      ...existingMetadata,
      tags: existingTags,
      payment_history: isReset ? [] : paymentHistory,
      last_payment_method: isReset ? null : (method || "Cash"),
      last_payment_reference: isReset ? null : (reference || ""),
    },
  };

  // If ticket was awaiting_approval and has been paid/partially paid, can move to repairing
  if (!isReset && ticket.status === "awaiting_approval" && (isFullyPaid || isPartiallyPaid)) {
    updates.status = "repairing";
  }

  const updatedTicket = await repairService.updateRepairTickets(updates);
  
  let handledByDocumentsModule = false;
  try {
    const { Modules } = await import("@medusajs/framework/utils");
    const eventBus: any = req.scope.resolve(Modules.EVENT_BUS, { allowUnregistered: true });
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (amountRecorded > 0 && eventBus && docService) {
      await eventBus.emit({
        name: "repair.payment_received",
        data: {
          id,
          repair_ticket_id: id,
          amount: amountRecorded,
          reference: reference || "Direct Payment",
          payment_method: method || "Cash",
        },
      });
      handledByDocumentsModule = true;
    }
  } catch (e) {}

  if (!handledByDocumentsModule && amountRecorded > 0) {
    try {
      // Fallback: Trigger Zoho sync as a cash/manual payment if documents module is not active
      await syncPaymentToZoho(req.scope as any, id, amountRecorded, method || "Cash", reference);
    } catch(e) {
      req.scope.resolve("logger")?.error?.(`[Mark Paid] Zoho sync failed: ${e}`);
    }
  }
  
  res.json({
    message: isReset
      ? "Payment reset successfully"
      : isFullyPaid
      ? "Repair ticket marked as fully paid"
      : isPartiallyPaid
      ? `Recorded partial payment of ${amountRecorded}. Remaining balance: ${Math.max(0, targetTotal - newAmountPaid)}`
      : "Payment recorded",
    repair_ticket: updatedTicket,
    amount_paid: newAmountPaid,
    payment_status: paymentStatus,
    remaining_balance: Math.max(0, targetTotal - newAmountPaid),
  });
}
