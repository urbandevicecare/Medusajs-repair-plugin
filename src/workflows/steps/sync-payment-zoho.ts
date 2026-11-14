import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

type SyncPaymentZohoInput = {
  ticket_id: string;
  amount: number;
  reference?: string;
};

export const syncPaymentZohoStep = createStep(
  "sync-payment-zoho",
  async (input: SyncPaymentZohoInput, { container }) => {
    // 1. Emit repair.payment_received so medusajs-documents-plugin captures it automatically
    try {
      const eventBus = container.resolve(Modules.EVENT_BUS, { allowUnregistered: true });
      if (eventBus) {
        await eventBus.emit({
          name: "repair.payment_received",
          data: {
            id: input.ticket_id,
            repair_ticket_id: input.ticket_id,
            amount: input.amount,
            reference: input.reference,
          },
        });
      }
    } catch (e) {
      container.resolve("logger")?.warn?.(`[sync-payment-zoho] Failed to emit repair.payment_received: ${e}`);
    }

    return new StepResponse(true);
  }
);

