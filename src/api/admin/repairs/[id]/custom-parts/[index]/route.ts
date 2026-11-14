import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import RepairModuleService from "../../../../../../modules/repair/service";
import { REPAIR_MODULE } from "../../../../../../modules/repair";
import { sanitizeRepairTicket } from "../../../../../../utils/sanitize-ticket";

// DELETE /admin/repairs/:id/custom-parts/:index - Remove a custom part
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  
  const ticket = await repairService.retrieveRepairTicket(req.params.id);
  const index = parseInt(req.params.index, 10);

  if (
    isNaN(index) ||
    !Array.isArray(ticket.custom_parts) ||
    index < 0 ||
    index >= ticket.custom_parts.length
  ) {
    res.status(400).json({ message: "Invalid custom part index" });
    return;
  }

  const customParts = [...ticket.custom_parts] as any[];
  const removedPart = customParts.splice(index, 1)[0];

  const priceToDeduct = removedPart.price || 0;

  const currentPartsEstimate =
    typeof ticket.parts_estimate === "object" &&
    ticket.parts_estimate !== null &&
    "value" in ticket.parts_estimate
      ? Number((ticket.parts_estimate as any).value)
      : Number(ticket.parts_estimate);

  const currentLaborEstimate =
    typeof ticket.labor_estimate === "object" &&
    ticket.labor_estimate !== null &&
    "value" in ticket.labor_estimate
      ? Number((ticket.labor_estimate as any).value)
      : Number(ticket.labor_estimate);

  const updatedPartsEstimate = Math.max(0, currentPartsEstimate - priceToDeduct);

  let newTotalEstimate = updatedPartsEstimate + currentLaborEstimate;
  if ((ticket as any).apply_tax) {
    newTotalEstimate = newTotalEstimate * 1.16;
  }

  const updatedTicket = await repairService.updateRepairTickets({
    id: req.params.id,
    custom_parts: customParts as unknown as Record<string, unknown>,
    parts_estimate: updatedPartsEstimate,
    total_estimate: newTotalEstimate,
  });

  res.json({ repair_ticket: sanitizeRepairTicket(updatedTicket) });
}
