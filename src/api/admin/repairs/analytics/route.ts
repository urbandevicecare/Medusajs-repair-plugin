import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  enrichRepairTicket,
  filterRepairTickets,
  computeRepairAnalytics,
  RepairReportFilterOptions,
} from "../../../../utils/repair-analytics";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  // 1. Fetch tickets from remote query with full limit
  const { data: rawTickets } = await query.graph({
    entity: "repair_ticket",
    fields: ["*", "device.*"],
    pagination: {
      take: 10000,
      order: { created_at: "DESC" },
    },
  });

  const ticketsList = Array.isArray(rawTickets) ? rawTickets : [];

  // 2. Batch-fetch customer details for all referenced customer_ids
  const customerIds = Array.from(
    new Set(ticketsList.map((t: any) => t.customer_id).filter(Boolean))
  );

  const customerMap: Record<string, any> = {};
  if (customerIds.length > 0) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "first_name", "last_name", "phone", "email"],
        filters: { id: customerIds },
      });
      if (Array.isArray(customers)) {
        for (const c of customers) {
          customerMap[c.id] = c;
        }
      }
    } catch (_) {
      // Continue gracefully if customer query fails
    }
  }

  // 3. Enrich and sanitize all tickets
  const enrichedTickets = ticketsList.map((t: any) => enrichRepairTicket(t, customerMap));

  // 4. Extract query options
  const filterOptions: RepairReportFilterOptions = {
    timeframe: (req.query.timeframe as string) || "all",
    date_basis: (req.query.date_basis as any) || "any",
    start_date: (req.query.start_date as string) || null,
    end_date: (req.query.end_date as string) || null,
    status: (req.query.status as string) || "all",
    payment_status: (req.query.payment_status as string) || "all",
    technician: (req.query.technician as string) || "all",
    brand: (req.query.brand as string) || "all",
    search: (req.query.search as string) || "",
  };

  // 5. Apply filters
  const filteredTickets = filterRepairTickets(enrichedTickets, filterOptions);

  // 6. Compute analytics on filtered set and available filters on full set
  const { analytics, available_filters } = computeRepairAnalytics(filteredTickets, enrichedTickets);

  res.json({
    analytics,
    available_filters,
    query_params: filterOptions,
    raw_tickets: filteredTickets,
    all_tickets_count: enrichedTickets.length,
  });
}
