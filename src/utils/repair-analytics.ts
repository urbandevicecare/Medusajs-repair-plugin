import { parseNumberField, sanitizeRepairTicket, SanitizedRepairTicket } from "./sanitize-ticket";

export type EnrichedRepairTicket = SanitizedRepairTicket & {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  is_completed: boolean;
  effective_completed_at: string | null;
  turnaround_days: number | null;
  final_total: number;
  balance_due: number;
};

export type RepairReportFilterOptions = {
  timeframe?: string; // 'all' | 'day' | 'yesterday' | 'week' | 'month' | 'this_month' | 'year' | 'this_year' | 'custom'
  date_basis?: "created_at" | "completed_at" | "any";
  start_date?: string | null;
  end_date?: string | null;
  status?: string; // 'all' | 'completed_only' | 'in_progress' | or specific status
  payment_status?: string; // 'all' | 'captured' | 'partially_paid' | 'pending' | 'refunded'
  technician?: string;
  brand?: string;
  search?: string;
};

export type TechnicianPerformance = {
  name: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
  totalCollected: number;
  totalInvoiced: number;
  avgTurnaroundDays: number;
};

export type BrandPerformance = {
  brand: string;
  count: number;
  completedCount: number;
  totalCollected: number;
  totalInvoiced: number;
};

export type MonthlyRevenuePoint = {
  month: string;
  timestamp: number;
  partsRevenue: number;
  laborRevenue: number;
  totalRevenue: number;
  collectedRevenue: number;
  ticketCount: number;
  completedCount: number;
};

export type RepairAnalyticsResult = {
  total_repairs: number;
  completed_count: number;
  completion_rate: number;
  in_progress_count: number;
  cancelled_count: number;
  status_counts: Record<string, number>;
  payment_status_counts: Record<string, { count: number; amount: number }>;
  total_collected_revenue: number;
  total_invoiced_revenue: number;
  total_expected_revenue: number;
  total_outstanding_balance: number;
  parts_estimate_sum: number;
  labor_estimate_sum: number;
  parts_actual_sum: number;
  labor_actual_sum: number;
  avg_repair_time_days: number;
  min_repair_time_days: number;
  max_repair_time_days: number;
  monthly_revenue: MonthlyRevenuePoint[];
  technician_performance: TechnicianPerformance[];
  brand_performance: BrandPerformance[];
};

/**
 * Checks whether a repair ticket is considered completed.
 * A repair ticket is completed if:
 * 1. It is NOT cancelled (status !== "cancelled" and metadata.is_cancelled !== true), AND
 * 2. It has completed_at set, OR
 * 3. It has status === "completed", OR
 * 4. It has status === "collected" or collected_at set, OR
 * 5. It has status === "ready", OR
 * 6. It has metadata.is_completed === true, OR
 * 7. It contains the "Completed" tag in metadata.tags
 */
export function isRepairCompleted(ticket: any): boolean {
  if (!ticket || typeof ticket !== "object") return false;
  if (ticket.status === "cancelled" || ticket.metadata?.is_cancelled === true) return false;
  return Boolean(
    ticket.completed_at ||
    ticket.status === "completed" ||
    ticket.status === "collected" ||
    ticket.status === "ready" ||
    ticket.collected_at ||
    ticket.metadata?.is_completed === true ||
    (Array.isArray(ticket.metadata?.tags) && ticket.metadata.tags.includes("Completed"))
  );
}

/**
 * Derives the effective completion date timestamp for a ticket.
 */
export function getRepairCompletionDate(ticket: any): Date | null {
  if (!ticket || typeof ticket !== "object") return null;
  if (!isRepairCompleted(ticket)) return null;

  const rawDate =
    ticket.completed_at ||
    ticket.collected_at ||
    ticket.metadata?.completed_at ||
    ticket.updated_at ||
    ticket.created_at;

  if (!rawDate) return null;
  const d = new Date(rawDate);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates turnaround time in days between created_at and completion date.
 */
export function calculateTurnaroundDays(ticket: any): number | null {
  if (!isRepairCompleted(ticket)) return null;
  const completion = getRepairCompletionDate(ticket);
  const created = ticket.created_at ? new Date(ticket.created_at) : null;
  if (!completion || !created || isNaN(created.getTime())) return null;
  const diffMs = completion.getTime() - created.getTime();
  if (diffMs < 0) return 0;
  return Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(2));
}

/**
 * Resolves timeframe string into concrete start and end dates.
 */
export function getDateRangeFromTimeframe(
  timeframe: string = "all",
  customStart?: string | null,
  customEnd?: string | null,
  now: Date = new Date()
): { startDate: Date | null; endDate: Date | null } {
  if (timeframe === "all" || !timeframe) {
    return { startDate: null, endDate: null };
  }

  const endOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const parseLocalDateBound = (dateStr: string, isEnd: boolean = false): Date => {
    const parts = dateStr.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (isEnd) {
        return new Date(year, month, day, 23, 59, 59, 999);
      }
      return new Date(year, month, day, 0, 0, 0, 0);
    }
    const d = new Date(dateStr);
    return isEnd ? endOfDay(d) : startOfDay(d);
  };

  if (timeframe === "day") {
    return {
      startDate: startOfDay(now),
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      startDate: startOfDay(y),
      endDate: endOfDay(y),
    };
  }

  if (timeframe === "week") {
    const w = new Date(now);
    w.setDate(w.getDate() - 7);
    return {
      startDate: startOfDay(w),
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "month") {
    const m = new Date(now);
    m.setDate(m.getDate() - 30);
    return {
      startDate: startOfDay(m),
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "this_month") {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return {
      startDate: mStart,
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "year") {
    const yr = new Date(now);
    yr.setFullYear(yr.getFullYear() - 1);
    return {
      startDate: startOfDay(yr),
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "this_year") {
    const yStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    return {
      startDate: yStart,
      endDate: endOfDay(now),
    };
  }

  if (timeframe === "custom") {
    const s = customStart ? parseLocalDateBound(customStart, false) : null;
    const e = customEnd ? parseLocalDateBound(customEnd, true) : endOfDay(now);
    return { startDate: s, endDate: e };
  }

  return { startDate: null, endDate: null };
}

/**
 * Hydrates and enriches raw ticket objects with customer details, sanitized financial BigNumbers,
 * completion status, turnaround metrics, and balance due.
 */
export function enrichRepairTicket(
  rawTicket: any,
  customerMap: Record<string, any> = {}
): EnrichedRepairTicket {
  const sanitized = sanitizeRepairTicket(rawTicket);
  const cust = sanitized.customer_id ? customerMap[sanitized.customer_id] : null;

  let customer_name = "N/A";
  let customer_phone = "";
  let customer_email = "";

  if (cust) {
    const fullName = `${cust.first_name || ""} ${cust.last_name || ""}`.trim();
    customer_name = fullName || cust.email || cust.phone || "N/A";
    customer_phone = cust.phone || "";
    customer_email = cust.email || "";
  } else if (rawTicket.customer) {
    const fullName = `${rawTicket.customer.first_name || ""} ${rawTicket.customer.last_name || ""}`.trim();
    customer_name = fullName || rawTicket.customer.email || rawTicket.customer.phone || "N/A";
    customer_phone = rawTicket.customer.phone || rawTicket.customer_phone || "";
    customer_email = rawTicket.customer.email || rawTicket.customer_email || "";
  } else if (rawTicket.customer_name) {
    customer_name = rawTicket.customer_name;
    customer_phone = rawTicket.customer_phone || "";
    customer_email = rawTicket.customer_email || "";
  }

  const is_completed = isRepairCompleted(sanitized);
  const compDate = getRepairCompletionDate(sanitized);
  const effective_completed_at = compDate ? compDate.toISOString() : null;
  const turnaround_days = calculateTurnaroundDays(sanitized);

  // Derive final billed total and balance due
  const final_total = sanitized.total_actual > 0 ? sanitized.total_actual : sanitized.total_estimate;
  const isRefunded =
    sanitized.payment_status === "refunded" ||
    sanitized.status === "refunded" ||
    sanitized.metadata?.is_refunded === true;
  const isCancelled =
    sanitized.status === "cancelled" ||
    sanitized.metadata?.is_cancelled === true;

  const balance_due =
    isCancelled || isRefunded
      ? 0
      : Math.max(0, final_total - sanitized.amount_paid);

  return {
    ...sanitized,
    customer_name,
    customer_phone,
    customer_email,
    is_completed,
    effective_completed_at,
    turnaround_days,
    final_total,
    balance_due,
  };
}

/**
 * Filters enriched tickets based on comprehensive criteria.
 */
export function filterRepairTickets(
  tickets: EnrichedRepairTicket[],
  options: RepairReportFilterOptions = {},
  now: Date = new Date()
): EnrichedRepairTicket[] {
  const {
    timeframe = "all",
    date_basis = "any",
    start_date,
    end_date,
    status = "all",
    payment_status = "all",
    technician = "all",
    brand = "all",
    search = "",
  } = options;

  const { startDate, endDate } = getDateRangeFromTimeframe(timeframe, start_date, end_date, now);

  const inDateRange = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return false;
    if (startDate && t < startDate.getTime()) return false;
    if (endDate && t > endDate.getTime()) return false;
    return true;
  };

  const searchQuery = search.trim().toLowerCase();

  return tickets.filter((t) => {
    // 1. Date filter
    if (startDate || endDate) {
      if (date_basis === "completed_at") {
        if (!t.is_completed || !inDateRange(t.effective_completed_at)) return false;
      } else if (date_basis === "created_at") {
        if (!inDateRange(t.created_at)) return false;
      } else {
        // "any": matches if either created_at or completed_at is within range
        const createdMatches = inDateRange(t.created_at);
        const completedMatches = t.is_completed && inDateRange(t.effective_completed_at);
        if (!createdMatches && !completedMatches) return false;
      }
    }

    // 2. Physical Status filter
    if (status && status !== "all") {
      if (status === "completed_only" || status === "completed") {
        if (!t.is_completed) return false;
      } else if (status === "in_progress") {
        if (t.is_completed || t.status === "cancelled" || t.status === "refunded") return false;
      } else {
        if (t.status !== status) return false;
      }
    }

    // 3. Payment Status filter
    if (payment_status && payment_status !== "all") {
      if (t.payment_status !== payment_status) return false;
    }

    // 4. Technician filter
    if (technician && technician !== "all") {
      const techName = (t.technician_name || "Unassigned").toLowerCase();
      const techId = (t.technician_id || "").toLowerCase();
      const targetTech = technician.toLowerCase();
      if (techName !== targetTech && techId !== targetTech) return false;
    }

    // 5. Brand filter
    if (brand && brand !== "all") {
      const ticketBrand = (t.device?.brand || "Other").toLowerCase();
      if (ticketBrand !== brand.toLowerCase()) return false;
    }

    // 6. Search query filter
    if (searchQuery) {
      const ticketNum = (t.ticket_number || "").toLowerCase();
      const custName = (t.customer_name || "").toLowerCase();
      const custPhone = (t.customer_phone || "").toLowerCase();
      const custEmail = (t.customer_email || "").toLowerCase();
      const dBrand = (t.device?.brand || "").toLowerCase();
      const dModel = (t.device?.model_name || "").toLowerCase();
      const dSerial = (t.device?.serial_number || "").toLowerCase();
      const dImei = (t.device?.imei || "").toLowerCase();
      const issue = (t.issue_description || "").toLowerCase();
      const tech = (t.technician_name || "").toLowerCase();

      const matched =
        ticketNum.includes(searchQuery) ||
        custName.includes(searchQuery) ||
        custPhone.includes(searchQuery) ||
        custEmail.includes(searchQuery) ||
        dBrand.includes(searchQuery) ||
        dModel.includes(searchQuery) ||
        dSerial.includes(searchQuery) ||
        dImei.includes(searchQuery) ||
        issue.includes(searchQuery) ||
        tech.includes(searchQuery);

      if (!matched) return false;
    }

    return true;
  });
}

/**
 * Computes analytics and performance indicators from enriched repair tickets.
 */
export function computeRepairAnalytics(
  filteredTickets: EnrichedRepairTicket[],
  allTickets: EnrichedRepairTicket[] = filteredTickets
): {
  analytics: RepairAnalyticsResult;
  available_filters: {
    technicians: string[];
    brands: string[];
    statuses: string[];
    payment_statuses: string[];
  };
} {
  const total_repairs = filteredTickets.length;
  const completed_tickets = filteredTickets.filter((t) => t.is_completed);
  const completed_count = completed_tickets.length;
  const completion_rate = total_repairs > 0 ? Number(((completed_count / total_repairs) * 100).toFixed(1)) : 0;
  const cancelled_count = filteredTickets.filter((t) => t.status === "cancelled" || t.status === "refunded").length;
  const in_progress_count = filteredTickets.filter((t) => !t.is_completed && t.status !== "cancelled" && t.status !== "refunded").length;

  const status_counts: Record<string, number> = {};
  const payment_status_counts: Record<string, { count: number; amount: number }> = {
    captured: { count: 0, amount: 0 },
    partially_paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    refunded: { count: 0, amount: 0 },
  };

  let total_collected_revenue = 0;
  let total_invoiced_revenue = 0;
  let total_expected_revenue = 0;
  let total_outstanding_balance = 0;

  let parts_estimate_sum = 0;
  let labor_estimate_sum = 0;
  let parts_actual_sum = 0;
  let labor_actual_sum = 0;

  const turnaroundTimes: number[] = [];

  for (const t of filteredTickets) {
    status_counts[t.status] = (status_counts[t.status] || 0) + 1;

    const pStatus = t.payment_status || "pending";
    if (!payment_status_counts[pStatus]) {
      payment_status_counts[pStatus] = { count: 0, amount: 0 };
    }
    payment_status_counts[pStatus].count++;
    payment_status_counts[pStatus].amount += t.amount_paid;

    if (t.status !== "cancelled" && t.status !== "refunded") {
      total_collected_revenue += t.amount_paid;
      total_invoiced_revenue += t.final_total;
      total_expected_revenue += t.total_estimate;
      total_outstanding_balance += t.balance_due;

      parts_estimate_sum += t.parts_estimate;
      labor_estimate_sum += t.labor_estimate;
      parts_actual_sum += t.parts_actual > 0 ? t.parts_actual : t.parts_estimate;
      labor_actual_sum += t.labor_actual > 0 ? t.labor_actual : t.labor_estimate;
    }

    if (t.is_completed && t.turnaround_days !== null && t.turnaround_days >= 0) {
      turnaroundTimes.push(t.turnaround_days);
    }
  }

  const avg_repair_time_days =
    turnaroundTimes.length > 0
      ? Number((turnaroundTimes.reduce((acc, v) => acc + v, 0) / turnaroundTimes.length).toFixed(1))
      : 0;

  const min_repair_time_days = turnaroundTimes.length > 0 ? Number(Math.min(...turnaroundTimes).toFixed(1)) : 0;
  const max_repair_time_days = turnaroundTimes.length > 0 ? Number(Math.max(...turnaroundTimes).toFixed(1)) : 0;

  // Monthly revenue trend grouping
  const monthlyRevenueMap: Record<string, MonthlyRevenuePoint> = {};
  for (const t of filteredTickets) {
    if (t.status === "cancelled" || t.status === "refunded") continue;

    // Use completion date for completed tickets if available, otherwise created date
    const dateToUse = t.is_completed && t.effective_completed_at ? new Date(t.effective_completed_at) : new Date(t.created_at);
    if (isNaN(dateToUse.getTime())) continue;

    const monthKey = `${dateToUse.toLocaleString("en-US", { month: "short" })} ${dateToUse.getFullYear()}`;
    const timestamp = new Date(dateToUse.getFullYear(), dateToUse.getMonth(), 1).getTime();

    if (!monthlyRevenueMap[monthKey]) {
      monthlyRevenueMap[monthKey] = {
        month: monthKey,
        timestamp,
        partsRevenue: 0,
        laborRevenue: 0,
        totalRevenue: 0,
        collectedRevenue: 0,
        ticketCount: 0,
        completedCount: 0,
      };
    }

    let pRev = t.parts_actual > 0 ? t.parts_actual : t.parts_estimate;
    let lRev = t.labor_actual > 0 ? t.labor_actual : t.labor_estimate;
    if (pRev === 0 && lRev === 0 && t.final_total > 0) {
      pRev = t.final_total;
    }

    monthlyRevenueMap[monthKey].partsRevenue += pRev;
    monthlyRevenueMap[monthKey].laborRevenue += lRev;
    monthlyRevenueMap[monthKey].totalRevenue += t.final_total;
    monthlyRevenueMap[monthKey].collectedRevenue += t.amount_paid;
    monthlyRevenueMap[monthKey].ticketCount++;
    if (t.is_completed) {
      monthlyRevenueMap[monthKey].completedCount++;
    }
  }

  const monthly_revenue = Object.values(monthlyRevenueMap).sort((a, b) => a.timestamp - b.timestamp);

  // Technician performance grouping
  const techMap: Record<
    string,
    { assignedCount: number; completedCount: number; totalCollected: number; totalInvoiced: number; turnarounds: number[] }
  > = {};

  for (const t of filteredTickets) {
    const techName = t.technician_name || "Unassigned";
    if (!techMap[techName]) {
      techMap[techName] = {
        assignedCount: 0,
        completedCount: 0,
        totalCollected: 0,
        totalInvoiced: 0,
        turnarounds: [],
      };
    }

    techMap[techName].assignedCount++;
    if (t.is_completed) techMap[techName].completedCount++;
    if (t.status !== "cancelled" && t.status !== "refunded") {
      techMap[techName].totalCollected += t.amount_paid;
      techMap[techName].totalInvoiced += t.final_total;
    }
    if (t.is_completed && t.turnaround_days !== null && t.turnaround_days >= 0) {
      techMap[techName].turnarounds.push(t.turnaround_days);
    }
  }

  const technician_performance: TechnicianPerformance[] = Object.entries(techMap)
    .map(([name, stat]) => {
      const avgT =
        stat.turnarounds.length > 0
          ? Number((stat.turnarounds.reduce((a, b) => a + b, 0) / stat.turnarounds.length).toFixed(1))
          : 0;
      const rate = stat.assignedCount > 0 ? Number(((stat.completedCount / stat.assignedCount) * 100).toFixed(1)) : 0;
      return {
        name,
        assignedCount: stat.assignedCount,
        completedCount: stat.completedCount,
        completionRate: rate,
        totalCollected: stat.totalCollected,
        totalInvoiced: stat.totalInvoiced,
        avgTurnaroundDays: avgT,
      };
    })
    .sort((a, b) => b.assignedCount - a.assignedCount);

  // Brand & Device performance grouping
  const brandMap: Record<string, { count: number; completedCount: number; totalCollected: number; totalInvoiced: number }> = {};
  for (const t of filteredTickets) {
    const brandName = t.device?.brand || "Other";
    if (!brandMap[brandName]) {
      brandMap[brandName] = { count: 0, completedCount: 0, totalCollected: 0, totalInvoiced: 0 };
    }
    brandMap[brandName].count++;
    if (t.is_completed) brandMap[brandName].completedCount++;
    if (t.status !== "cancelled" && t.status !== "refunded") {
      brandMap[brandName].totalCollected += t.amount_paid;
      brandMap[brandName].totalInvoiced += t.final_total;
    }
  }

  const brand_performance: BrandPerformance[] = Object.entries(brandMap)
    .map(([brand, stat]) => ({
      brand,
      count: stat.count,
      completedCount: stat.completedCount,
      totalCollected: stat.totalCollected,
      totalInvoiced: stat.totalInvoiced,
    }))
    .sort((a, b) => b.count - a.count);

  // Extract available filters from all tickets in the system
  const techniciansSet = new Set<string>();
  const brandsSet = new Set<string>();
  const statusesSet = new Set<string>();

  for (const t of allTickets) {
    if (t.technician_name) techniciansSet.add(t.technician_name);
    else techniciansSet.add("Unassigned");

    if (t.device?.brand) brandsSet.add(t.device.brand);
    else brandsSet.add("Other");

    if (t.status) statusesSet.add(t.status);
  }

  return {
    analytics: {
      total_repairs,
      completed_count,
      completion_rate,
      in_progress_count,
      cancelled_count,
      status_counts,
      payment_status_counts,
      total_collected_revenue,
      total_invoiced_revenue,
      total_expected_revenue,
      total_outstanding_balance,
      parts_estimate_sum,
      labor_estimate_sum,
      parts_actual_sum,
      labor_actual_sum,
      avg_repair_time_days,
      min_repair_time_days,
      max_repair_time_days,
      monthly_revenue,
      technician_performance,
      brand_performance,
    },
    available_filters: {
      technicians: Array.from(techniciansSet).sort(),
      brands: Array.from(brandsSet).sort(),
      statuses: Array.from(statusesSet).sort(),
      payment_statuses: ["captured", "partially_paid", "pending", "refunded"],
    },
  };
}

/**
 * Generates an RFC4180-compliant CSV string from a list of enriched tickets.
 */
export function generateRepairReportCSV(tickets: EnrichedRepairTicket[]): string {
  const headers = [
    "Ticket Number",
    "Customer Name",
    "Customer Phone",
    "Customer Email",
    "Device Brand",
    "Device Model",
    "Serial Number / IMEI",
    "Issue Description",
    "Technician",
    "Status",
    "Payment Status",
    "Completed?",
    "Created Date",
    "Completed Date",
    "Turnaround (Days)",
    "Parts Estimate",
    "Labor Estimate",
    "Total Estimate",
    "Parts Actual",
    "Labor Actual",
    "Total Invoiced/Actual",
    "Amount Paid",
    "Balance Due",
  ];

  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return '""';
    if (typeof val === "number") return String(val);
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const formatIsoDate = (dStr: string | null | undefined): string => {
    if (!dStr) return "";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

  const rows = tickets.map((t) => [
    t.ticket_number,
    t.customer_name,
    t.customer_phone,
    t.customer_email,
    t.device?.brand || "N/A",
    t.device?.model_name || "N/A",
    t.device?.serial_number || t.device?.imei || "N/A",
    t.issue_description || "",
    t.technician_name || "Unassigned",
    t.status,
    t.payment_status,
    t.is_completed ? "Yes" : "No",
    formatIsoDate(t.created_at),
    formatIsoDate(t.effective_completed_at),
    t.turnaround_days !== null ? t.turnaround_days : "",
    t.parts_estimate,
    t.labor_estimate,
    t.total_estimate,
    t.parts_actual,
    t.labor_actual,
    t.final_total,
    t.amount_paid,
    t.balance_due,
  ]);

  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\r\n");
}
