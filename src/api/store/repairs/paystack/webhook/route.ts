import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { verifyPaystackPaymentWorkflow } from "../../../../../workflows/verify-paystack-payment-workflow";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import crypto from "crypto";

// POST /store/repairs/paystack/webhook - Automated Paystack webhook handler
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger: any = req.scope.resolve("logger", { allowUnregistered: true });
  const event = req.body as any;

  if (!event || !event.event) {
    return res.status(400).json({ message: "Invalid webhook payload" });
  }

  // Validate signature if secret key is configured
  try {
    const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
    const [settings] = await repairService.listRepairSettings({});
    if (settings?.paystack_secret_key) {
      const signature = req.headers["x-paystack-signature"] as string;
      if (signature) {
        const hash = crypto
          .createHmac("sha512", settings.paystack_secret_key)
          .update(JSON.stringify(req.body))
          .digest("hex");
        if (hash !== signature) {
          logger?.warn?.("[Paystack Webhook] Invalid HMAC signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }
    }
  } catch (sigErr: any) {
    logger?.warn?.(`[Paystack Webhook] Signature verification note: ${sigErr.message}`);
  }

  // Only handle successful charges
  if (event.event === "charge.success") {
    const data = event.data;
    const reference = data?.reference;
    if (reference) {
      try {
        await verifyPaystackPaymentWorkflow(req.scope).run({
          input: { reference },
        });
        logger?.info?.(`[Paystack Webhook] Successfully processed payment reference ${reference}`);
      } catch (err: any) {
        logger?.error?.(`[Paystack Webhook] Failed to process payment reference ${reference}: ${err.message}`);
      }
    }
  }

  // Always return 200 OK to Paystack
  return res.status(200).json({ status: "success" });
}
