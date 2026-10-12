import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

type EmitRepairCreatedInput = {
  ticket_id: string;
};

export const emitRepairCreatedEventStep = createStep(
  "emit-repair-created-event",
  async (input: EmitRepairCreatedInput, { container }) => {
    try {
      const eventBus = container.resolve(Modules.EVENT_BUS, { allowUnregistered: true });
      if (eventBus) {
        await eventBus.emit({
          name: "repair.created",
          data: {
            id: input.ticket_id,
            repair_ticket_id: input.ticket_id,
          },
        });
      }
    } catch (e) {
      container.resolve("logger")?.warn?.(`[emit-repair-created-event] Failed to emit: ${e}`);
    }
    return new StepResponse({ emitted: true });
  }
);
