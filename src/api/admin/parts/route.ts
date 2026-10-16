import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data, metadata } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "barcode", "ean", "upc", "product.title", "prices.*"],
    filters: req.filterableFields,
    pagination: req.queryConfig?.pagination,
  });

  // Format nicely as parts with B2B pricing
  const formattedParts = data.map((variant: any) => {
    // Find a specific price list or default to calculated
    let price = 0;
    if (variant.prices && variant.prices.length > 0) {
      price = variant.prices[0].amount;
    }

    return {
      id: variant.id,
      title: variant.title,
      product_title: variant.product?.title,
      sku: variant.sku,
      barcode: variant.barcode,
      ean: variant.ean,
      upc: variant.upc,
      price: price,
      is_b2b_price: true,
    };
  });

  res.json({
    parts: formattedParts,
    ...metadata,
  });
}
