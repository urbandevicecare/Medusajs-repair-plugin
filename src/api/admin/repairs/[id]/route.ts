import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  MedusaError,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils";

// GET /admin/repairs/:id - Get single repair ticket
export async function GET(
  req: MedusaRequest<{ id: string }>,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "repair_ticket",
    fields: ["*", "device.*", "media.*", "notes.*", "updates.*"],
    filters: { id: [req.params.id] },
  });

  if (!data || data.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Repair ticket with id ${req.params.id} not found`,
    );
  }

  // Fetch linked product variants (parts)
  let parts = [];
  try {
    const linkQuery = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    // First try with plural name which is standard for isList: true
    const { data: ticketWithParts } = await linkQuery.graph({
      entity: "repair_ticket",
      fields: ["id", "product_variants.*", "product_variants.product.*", "product_variants.prices.*"],
      filters: { id: [req.params.id] },
    });
    parts = ticketWithParts?.[0]?.product_variants || [];
  } catch (err) {
    try {
      const linkQuery = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: ticketWithParts } = await linkQuery.graph({
        entity: "repair_ticket",
        fields: ["id", "product_variant.*", "product_variant.product.*", "product_variant.prices.*"],
        filters: { id: [req.params.id] },
      });
      parts = ticketWithParts?.[0]?.product_variant || [];
    } catch (err2) {
      // both failed, which means the link isn't established properly in query graph graph, return empty parts.
    }
  }

  let customerInfo: any = null;
  if (data[0].customer_id) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["first_name", "last_name", "phone"],
        filters: { id: [data[0].customer_id] },
      });
      if (customers && customers.length > 0) {
        customerInfo = customers[0];
      }
    } catch (err) {
      // ignore
    }
  }

  let availableDocuments: string[] = [];
  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService && typeof docService.listDocumentRecords === "function") {
      const records = await docService.listDocumentRecords({ repair_ticket_id: req.params.id }).catch(() => []);
      if (Array.isArray(records)) {
        availableDocuments = records.map((r: any) => r.type === "estimate" ? "quote" : r.type);
      }
    }
  } catch (_) {}

  res.json({
    repair_ticket: {
      ...data[0],
      customer: customerInfo,
      customer_phone: customerInfo?.phone || "",
      parts,
      available_documents: availableDocuments,
    },
  });
}
