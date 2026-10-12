import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import { syncPaymentToZoho } from "../../utils/zoho-payment-sync.js";

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

    // 2. Fallback: If medusajs-documents-plugin is not registered, run legacy sync
    try {
      const docModule = container.resolve("documents", { allowUnregistered: true });
      if (!docModule) {
        await syncPaymentToZoho(container as any, input.ticket_id, input.amount, "Paystack", input.reference);
      }
    } catch (e) {}

    return new StepResponse(true);
  }
);
