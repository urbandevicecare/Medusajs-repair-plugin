import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { REPAIR_MODULE } from "../../modules/repair";
import RepairModuleService from "../../modules/repair/service";
import { parseNumberField } from "../../utils/sanitize-ticket";

type UpdateRepairCostsInput = {
  repair_ticket_id: string;
  parts_estimate?: number;
  labor_estimate?: number;
  parts_actual?: number;
  labor_actual?: number;
  apply_tax?: boolean;
};

export const updateRepairCostsStep = createStep(
  "update-repair-costs",
  async (input: UpdateRepairCostsInput, { container }) => {
    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);

    // Get current ticket for compensation
    const currentTicket = await repairService.retrieveRepairTicket(
      input.repair_ticket_id,
    );

    const updateData: any = {};
    const hasTax = input.apply_tax !== undefined ? input.apply_tax : currentTicket.apply_tax;
    
    if (input.apply_tax !== undefined) {
      updateData.apply_tax = input.apply_tax;
      // If we are JUST updating tax, we must recalculate total based on current parts/labor
      let newTotalEst = (input.parts_estimate ?? parseNumberField(currentTicket.parts_estimate)) + (input.labor_estimate ?? parseNumberField(currentTicket.labor_estimate));
      if (hasTax) newTotalEst = newTotalEst * 1.16;
      updateData.total_estimate = newTotalEst;
      
      let newTotalAct = (input.parts_actual ?? parseNumberField(currentTicket.parts_actual)) + (input.labor_actual ?? parseNumberField(currentTicket.labor_actual));
      if (hasTax) newTotalAct = newTotalAct * 1.16;
      updateData.total_actual = newTotalAct;
    }

    if (input.parts_estimate !== undefined || input.labor_estimate !== undefined) {
      if (input.parts_estimate !== undefined) updateData.parts_estimate = input.parts_estimate;
      if (input.labor_estimate !== undefined) updateData.labor_estimate = input.labor_estimate;
      let newTotal = (input.parts_estimate ?? parseNumberField(currentTicket.parts_estimate)) + (input.labor_estimate ?? parseNumberField(currentTicket.labor_estimate));
      if (hasTax) {
        newTotal = newTotal * 1.16;
      }
      updateData.total_estimate = newTotal;
    }

    if (input.parts_actual !== undefined || input.labor_actual !== undefined) {
      if (input.parts_actual !== undefined) updateData.parts_actual = input.parts_actual;
      if (input.labor_actual !== undefined) updateData.labor_actual = input.labor_actual;
      let newTotal = (input.parts_actual ?? parseNumberField(currentTicket.parts_actual)) + (input.labor_actual ?? parseNumberField(currentTicket.labor_actual));
      if (hasTax) {
        newTotal = newTotal * 1.16;
      }
      updateData.total_actual = newTotal;
    }

    const updatedTicket = await repairService.updateRepairTickets({
      id: input.repair_ticket_id,
      ...updateData,
    });

    return new StepResponse(updatedTicket, {
      repair_ticket_id: currentTicket.id,
      previous_parts_estimate: currentTicket.parts_estimate,
      previous_labor_estimate: currentTicket.labor_estimate,
      previous_total_estimate: currentTicket.total_estimate,
      previous_parts_actual: currentTicket.parts_actual,
      previous_labor_actual: currentTicket.labor_actual,
      previous_total_actual: currentTicket.total_actual,
      previous_apply_tax: currentTicket.apply_tax,
    });
  },
  async (compensateInput, { container }) => {
    if (!compensateInput) return;
    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);

    await repairService.updateRepairTickets({
      id: compensateInput.repair_ticket_id,
      parts_estimate: compensateInput.previous_parts_estimate,
      labor_estimate: compensateInput.previous_labor_estimate,
      total_estimate: compensateInput.previous_total_estimate,
      parts_actual: compensateInput.previous_parts_actual,
      labor_actual: compensateInput.previous_labor_actual,
      total_actual: compensateInput.previous_total_actual,
      apply_tax: compensateInput.previous_apply_tax,
    });
  },
);
