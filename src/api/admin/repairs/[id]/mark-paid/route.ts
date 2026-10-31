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
  
  const amountToPay = amount ? amount : targetTotal - parseNum(ticket.amount_paid);
  
  const newAmountPaid = parseNum(ticket.amount_paid) + amountToPay;
  const isFullyPaid = newAmountPaid >= targetTotal;

  let newStatus = ticket.status;
  const updates: any = {
    id,
    amount_paid: newAmountPaid,
    payment_status: isFullyPaid ? "captured" : "pending",
    payment_collection_id: reference || ticket.payment_collection_id
  };

  const existingMetadata = (ticket.metadata as Record<string, any>) || {};
  const rawTags = existingMetadata.tags;
  const existingTags: string[] = Array.isArray(rawTags)
    ? [...rawTags]
    : typeof rawTags === "string"
    ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  if (isFullyPaid) {
    if (!existingTags.includes("Paid")) {
      existingTags.push("Paid");
    }
    if (ticket.status === "ready") {
      newStatus = "collected";
      updates.collected_at = new Date();
    } else if (ticket.status === "awaiting_approval") {
      newStatus = "repairing";
    }
  }

  updates.status = newStatus;
  updates.metadata = {
    ...existingMetadata,
    tags: existingTags,
  };

  const updatedTicket = await repairService.updateRepairTickets(updates);
  
  try {
     // Trigger Zoho sync as a cash/manual payment
     await syncPaymentToZoho(req.scope as any, id, amountToPay, method || "Cash", reference);
  } catch(e) {
     req.scope.resolve("logger").error(`[Mark Paid] Zoho sync failed: ${e}`);
  }
  
  res.json({ repair_ticket: updatedTicket });
}
