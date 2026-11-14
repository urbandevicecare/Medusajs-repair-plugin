import test from "node:test";
import assert from "node:assert";
import {
  isRepairCompleted,
  getRepairCompletionDate,
  calculateTurnaroundDays,
  getDateRangeFromTimeframe,
  enrichRepairTicket,
  filterRepairTickets,
  computeRepairAnalytics,
  generateRepairReportCSV,
} from "../src/utils/repair-analytics.js";

test("isRepairCompleted accurately identifies completed repairs across decoupled statuses", () => {
  // 1. Ticket with status 'completed'
  assert.strictEqual(
    isRepairCompleted({ status: "completed" }),
    true,
    "Status 'completed' must be recognized as completed"
  );

  // 2. Ticket with status 'collected' (even without explicit completed_at)
  assert.strictEqual(
    isRepairCompleted({ status: "collected" }),
    true,
    "Status 'collected' must be recognized as completed"
  );

  // 3. Ticket with physical status 'ready' or 'repairing' but with milestone completed_at timestamp
  assert.strictEqual(
    isRepairCompleted({ status: "ready", completed_at: "2026-11-14T14:00:00Z" }),
    true,
    "Ticket with completed_at must be completed regardless of status"
  );

  // 4. Ticket with metadata.is_completed = true
  assert.strictEqual(
    isRepairCompleted({ status: "repairing", metadata: { is_completed: true } }),
    true,
    "Ticket with metadata.is_completed must be completed"
  );

  // 5. Ticket with 'Completed' tag in metadata
  assert.strictEqual(
    isRepairCompleted({ status: "ready", metadata: { tags: ["Completed", "Screen"] } }),
    true,
    "Ticket with 'Completed' tag must be completed"
  );

  // 6. Ticket with status 'ready' without tags
  assert.strictEqual(
    isRepairCompleted({ status: "ready" }),
    true,
    "Status 'ready' must be recognized as completed"
  );

  // 7. Cancelled tickets must strictly NEVER be completed even with completed_at or metadata flags
  assert.strictEqual(
    isRepairCompleted({ status: "cancelled", completed_at: "2026-11-14T14:00:00Z" }),
    false,
    "Cancelled ticket must never be completed even with completed_at"
  );

  assert.strictEqual(
    isRepairCompleted({ status: "cancelled", metadata: { is_completed: true, tags: ["Completed"] } }),
    false,
    "Cancelled ticket with metadata must never be completed"
  );

  // 8. In-progress / diagnosing tickets without completion flags
  assert.strictEqual(
    isRepairCompleted({ status: "diagnosing", metadata: { tags: ["Urgent"] } }),
    false,
    "Diagnosing ticket must not be completed"
  );

  assert.strictEqual(
    isRepairCompleted({ status: "received" }),
    false,
    "Received ticket must not be completed"
  );

  assert.strictEqual(
    isRepairCompleted({ status: "awaiting_approval" }),
    false,
    "Awaiting approval ticket must not be completed"
  );

  assert.strictEqual(
    isRepairCompleted(null),
    false,
    "Null ticket must return false"
  );
});

test("getRepairCompletionDate and calculateTurnaroundDays derive correct completion dates and velocity", () => {
  const createdAt = "2026-11-10T10:00:00.000Z";
  const completedAt = "2026-11-12T22:00:00.000Z"; // 2.5 days later

  const ticket = {
    status: "collected",
    created_at: createdAt,
    completed_at: completedAt,
  };

  const compDate = getRepairCompletionDate(ticket);
  assert.ok(compDate instanceof Date);
  assert.strictEqual(compDate.toISOString(), completedAt);

  const turnaround = calculateTurnaroundDays(ticket);
  assert.strictEqual(turnaround, 2.5, "Turnaround must be 2.5 days");

  // Non-completed ticket should return null turnaround
  const openTicket = {
    status: "repairing",
    created_at: createdAt,
    completed_at: null,
  };
  assert.strictEqual(calculateTurnaroundDays(openTicket), null);
});

test("getDateRangeFromTimeframe resolves proper start and end timestamps", () => {
  const fixedNow = new Date("2026-11-14T12:00:00.000Z");

  // 1. Day (Today)
  const dayRange = getDateRangeFromTimeframe("day", null, null, fixedNow);
  assert.ok(dayRange.startDate);
  assert.ok(dayRange.endDate);
  assert.strictEqual(dayRange.startDate.getHours(), 0);
  assert.strictEqual(dayRange.startDate.getMinutes(), 0);
  assert.strictEqual(dayRange.endDate.getHours(), 23);
  assert.strictEqual(dayRange.endDate.getMinutes(), 59);

  // 2. Week (Past 7 days)
  const weekRange = getDateRangeFromTimeframe("week", null, null, fixedNow);
  const diffDays =
    (weekRange.endDate!.getTime() - weekRange.startDate!.getTime()) / (1000 * 60 * 60 * 24);
  assert.ok(diffDays >= 7 && diffDays <= 8);

  // 3. All time
  const allRange = getDateRangeFromTimeframe("all", null, null, fixedNow);
  assert.strictEqual(allRange.startDate, null);
  assert.strictEqual(allRange.endDate, null);
});

test("enrichRepairTicket maps customer data and calculates financial balances accurately", () => {
  const rawTicket = {
    id: "rep_01",
    ticket_number: "RT-100",
    customer_id: "cus_01",
    status: "collected",
    payment_status: "partially_paid",
    parts_estimate: { value: "4000", precision: 20 },
    labor_estimate: { value: "2000", precision: 20 },
    total_estimate: { value: "6000", precision: 20 },
    parts_actual: { value: "4500", precision: 20 },
    labor_actual: { value: "2500", precision: 20 },
    total_actual: { value: "7000", precision: 20 },
    amount_paid: { value: "3000", precision: 20 },
    created_at: "2026-11-01T10:00:00Z",
    completed_at: "2026-11-03T10:00:00Z",
    metadata: {
      tags: ["Collected", "Partially Paid"],
      payment_history: [{ amount: 3000 }],
    },
  };

  const customerMap = {
    cus_01: {
      first_name: "Nelson",
      last_name: "Owalo",
      phone: "+254700000000",
      email: "nelson@example.com",
    },
  };

  const enriched = enrichRepairTicket(rawTicket, customerMap);

  assert.strictEqual(enriched.customer_name, "Nelson Owalo");
  assert.strictEqual(enriched.customer_phone, "+254700000000");
  assert.strictEqual(enriched.customer_email, "nelson@example.com");
  assert.strictEqual(enriched.parts_estimate, 4000);
  assert.strictEqual(enriched.labor_estimate, 2000);
  assert.strictEqual(enriched.total_estimate, 6000);
  assert.strictEqual(enriched.parts_actual, 4500);
  assert.strictEqual(enriched.labor_actual, 2500);
  assert.strictEqual(enriched.total_actual, 7000);
  assert.strictEqual(enriched.final_total, 7000, "final_total must prefer total_actual > 0");
  assert.strictEqual(enriched.amount_paid, 3000);
  assert.strictEqual(enriched.balance_due, 4000, "balance_due must be 7000 - 3000 = 4000");
  assert.strictEqual(enriched.is_completed, true);
  assert.strictEqual(enriched.turnaround_days, 2);

  // Refunded ticket must have balance_due = 0 and not owe phantom debt
  const refundedTicket = enrichRepairTicket({
    id: "rep_refunded",
    ticket_number: "RT-REF",
    status: "completed",
    payment_status: "refunded",
    total_actual: 5000,
    amount_paid: 0,
    metadata: { is_refunded: true },
  });
  assert.strictEqual(refundedTicket.balance_due, 0, "Refunded ticket must have 0 balance due");
});

test("filterRepairTickets correctly matches tickets completed today even if created in prior months", () => {
  const fixedNow = new Date("2026-11-14T15:00:00.000Z");

  const ticketCreatedWeeksAgoCompletedToday = enrichRepairTicket({
    id: "rep_oct",
    ticket_number: "RT-OCT",
    status: "collected",
    payment_status: "captured",
    created_at: "2026-10-15T09:00:00.000Z",
    completed_at: "2026-11-14T14:30:00.000Z", // Completed today
    total_estimate: 5000,
    amount_paid: 5000,
    metadata: { is_completed: true },
  });

  const ticketCreatedWeeksAgoNotCompleted = enrichRepairTicket({
    id: "rep_oct_open",
    ticket_number: "RT-OCT-OPEN",
    status: "repairing",
    payment_status: "pending",
    created_at: "2026-10-15T09:00:00.000Z",
    completed_at: null,
    total_estimate: 8000,
    amount_paid: 0,
  });

  const tickets = [ticketCreatedWeeksAgoCompletedToday, ticketCreatedWeeksAgoNotCompleted];

  // When filtering by timeframe 'day' and date_basis 'completed_at'
  const filteredCompletedToday = filterRepairTickets(
    tickets,
    { timeframe: "day", date_basis: "completed_at" },
    fixedNow
  );

  assert.strictEqual(filteredCompletedToday.length, 1);
  assert.strictEqual(filteredCompletedToday[0].ticket_number, "RT-OCT");

  // When filtering by date_basis 'created_at' for 'day', neither was created today
  const filteredCreatedToday = filterRepairTickets(
    tickets,
    { timeframe: "day", date_basis: "created_at" },
    fixedNow
  );
  assert.strictEqual(filteredCreatedToday.length, 0);

  // When filtering by date_basis 'any' for 'day', RT-OCT matches because it was completed today
  const filteredAnyToday = filterRepairTickets(
    tickets,
    { timeframe: "day", date_basis: "any" },
    fixedNow
  );
  assert.strictEqual(filteredAnyToday.length, 1);
  assert.strictEqual(filteredAnyToday[0].ticket_number, "RT-OCT");

  // When filtering by status: 'completed', RT-OCT matches because it is a completed repair
  const filteredCompletedStatus = filterRepairTickets(
    tickets,
    { status: "completed" },
    fixedNow
  );
  assert.strictEqual(filteredCompletedStatus.length, 1);
  assert.strictEqual(filteredCompletedStatus[0].ticket_number, "RT-OCT");
});

test("computeRepairAnalytics computes accurate totals, turnaround, and distributions", () => {
  const ticket1 = enrichRepairTicket({
    id: "1",
    ticket_number: "RT-1",
    status: "completed",
    payment_status: "captured",
    technician_name: "Alice",
    device: { brand: "Apple", model_name: "iPhone 13" },
    created_at: "2026-11-01T10:00:00Z",
    completed_at: "2026-11-03T10:00:00Z", // 2 days
    total_estimate: 5000,
    total_actual: 5000,
    amount_paid: 5000,
    metadata: { is_completed: true },
  });

  const ticket2 = enrichRepairTicket({
    id: "2",
    ticket_number: "RT-2",
    status: "collected",
    payment_status: "partially_paid",
    technician_name: "Bob",
    device: { brand: "Samsung", model_name: "Galaxy S22" },
    created_at: "2026-11-05T10:00:00Z",
    completed_at: "2026-11-09T10:00:00Z", // 4 days
    total_estimate: 10000,
    total_actual: 12000,
    amount_paid: 6000,
    metadata: {
      tags: ["Collected", "Partially Paid"],
      payment_history: [{ amount: 6000 }],
    },
  });

  const ticket3 = enrichRepairTicket({
    id: "3",
    ticket_number: "RT-3",
    status: "repairing",
    payment_status: "pending",
    technician_name: "Alice",
    device: { brand: "Apple", model_name: "MacBook Pro" },
    created_at: "2026-11-10T10:00:00Z",
    completed_at: null,
    total_estimate: 15000,
    amount_paid: 0,
  });

  // Ticket 4: Cancelled ticket with leftover amount_paid - must NOT inflate collected or invoiced revenue
  const ticket4 = enrichRepairTicket({
    id: "4",
    ticket_number: "RT-4",
    status: "cancelled",
    payment_status: "pending",
    technician_name: null, // Unassigned
    device: null, // Unbranded (Other)
    created_at: "2026-11-11T10:00:00Z",
    completed_at: null,
    total_estimate: 10000,
    amount_paid: 2000,
  });

  const { analytics, available_filters } = computeRepairAnalytics([ticket1, ticket2, ticket3, ticket4]);

  assert.strictEqual(analytics.total_repairs, 4);
  assert.strictEqual(analytics.completed_count, 2, "2 tickets must be completed");
  assert.strictEqual(analytics.cancelled_count, 1, "1 ticket cancelled");
  assert.strictEqual(analytics.in_progress_count, 1, "1 ticket in progress");
  assert.strictEqual(analytics.completion_rate, 50.0);
  // Collected revenue must exclude cancelled ticket: 5000 + 6000 = 11000 (not 13000!)
  assert.strictEqual(analytics.total_collected_revenue, 11000, "Collected revenue must exclude cancelled repairs");
  assert.strictEqual(analytics.total_invoiced_revenue, 32000, "5000 + 12000 + 15000 = 32000 (excludes cancelled 10000)");
  assert.strictEqual(analytics.total_outstanding_balance, 21000, "0 + 6000 + 15000 = 21000 (cancelled balance is 0)");
  assert.strictEqual(analytics.avg_repair_time_days, 3, "(2 + 4) / 2 = 3 days");
  assert.strictEqual(analytics.min_repair_time_days, 2);
  assert.strictEqual(analytics.max_repair_time_days, 4);

  // Available filters should include Unassigned and Other
  assert.ok(available_filters.technicians.includes("Unassigned"), "Available filters must include 'Unassigned'");
  assert.ok(available_filters.brands.includes("Other"), "Available filters must include 'Other'");
  assert.ok(available_filters.statuses.includes("completed"));
  assert.ok(available_filters.statuses.includes("collected"));
  assert.ok(available_filters.statuses.includes("repairing"));
  assert.ok(available_filters.statuses.includes("cancelled"));

  // Technician performance
  const alice = analytics.technician_performance.find((t) => t.name === "Alice");
  assert.ok(alice);
  assert.strictEqual(alice.assignedCount, 2);
  assert.strictEqual(alice.completedCount, 1);
  assert.strictEqual(alice.totalCollected, 5000);

  // Brand performance
  const apple = analytics.brand_performance.find((b) => b.brand === "Apple");
  assert.ok(apple);
  assert.strictEqual(apple.count, 2);
  assert.strictEqual(apple.completedCount, 1);
});

test("generateRepairReportCSV creates valid escaped CSV output", () => {
  const ticket = enrichRepairTicket({
    ticket_number: "RT-TEST,101",
    customer_name: "John \"Jack\" Doe",
    customer_phone: "+254711223344",
    issue_description: "Cracked OLED display & battery swollen",
    status: "collected",
    payment_status: "captured",
    created_at: "2026-11-01T12:00:00Z",
    completed_at: "2026-11-02T12:00:00Z",
    total_estimate: 3500,
    amount_paid: 3500,
    device: { brand: "HP", model_name: "EliteBook" },
  });

  const csv = generateRepairReportCSV([ticket]);
  assert.ok(csv.includes('"Ticket Number"'));
  assert.ok(csv.includes('"Issue Description"'));
  assert.ok(csv.includes('"RT-TEST,101"'));
  assert.ok(csv.includes('"John ""Jack"" Doe"'));
  assert.ok(csv.includes('"Cracked OLED display & battery swollen"'));
  assert.ok(csv.includes('"HP"'));
  assert.ok(csv.includes('3500'));
  assert.ok(csv.includes('"2026-11-01"'));
  assert.ok(csv.includes('"2026-11-02"'));
});
