import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data, metadata } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "sku",
      "barcode",
      "ean",
      "upc",
      "product.title",
      "prices.*",
      "inventory_quantity",
      "inventory_items.*",
      "inventory_items.inventory.location_levels.*",
    ],
    filters: req.filterableFields,
    pagination: req.queryConfig?.pagination,
  });

  // Format nicely as parts with B2B pricing and real in-stock inventory
  const formattedParts = data.map((variant: any) => {
    // Find a specific price list or default to calculated
    let price = 0;
    if (variant.prices && variant.prices.length > 0) {
      price = variant.prices[0].amount;
    }

    // Resolve actual inventory across direct quantity or inventory module levels
    let inventoryQuantity = 0;
    if (typeof variant.inventory_quantity === "number") {
      inventoryQuantity = variant.inventory_quantity;
    } else if (Array.isArray(variant.inventory_items)) {
      inventoryQuantity = variant.inventory_items.reduce((acc: number, itemLink: any) => {
        const levels = itemLink.inventory?.location_levels || itemLink.location_levels || [];
        const itemStock = Array.isArray(levels)
          ? levels.reduce(
            (sum: number, lvl: any) =>
              sum + (typeof lvl.stocked_quantity === "number"
                ? lvl.stocked_quantity
                : (typeof lvl.available_quantity === "number" ? lvl.available_quantity : 0)),
            0,
          )
          : 0;
        return acc + itemStock;
      }, 0);
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
      inventory_quantity: inventoryQuantity,
      is_b2b_price: true,
    };
  });

  res.json({
    parts: formattedParts,
    ...metadata,
  });
}
