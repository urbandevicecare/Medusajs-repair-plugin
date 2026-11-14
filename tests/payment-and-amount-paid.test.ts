import test from "node:test";
import assert from "node:assert";
import { parseNumberField, sanitizeRepairTicket } from "../src/utils/sanitize-ticket.js";

test("parseNumberField handles all edge cases correctly", () => {
  assert.strictEqual(parseNumberField(100), 100);
  assert.strictEqual(parseNumberField("1500"), 1500);
  assert.strictEqual(parseNumberField("0"), 0);
  assert.strictEqual(parseNumberField("0.00"), 0);
  assert.strictEqual(parseNumberField(""), 0);
  assert.strictEqual(parseNumberField(null), 0);
  assert.strictEqual(parseNumberField(undefined), 0);
  assert.strictEqual(parseNumberField(NaN), 0);
  assert.strictEqual(parseNumberField({ value: "2500", precision: 20 }), 2500);
  assert.strictEqual(parseNumberField({ value: "0", precision: 20 }), 0);
  assert.strictEqual(parseNumberField({ value: 0 }), 0);
  assert.strictEqual(parseNumberField({}), 0);
  assert.strictEqual(parseNumberField("invalid"), 0);
});

test("sanitizeRepairTicket heals desynchronized raw_amount_paid when payment_status is pending with zero payments", () => {
  const badTicket = {
    id: "rep_01",
    ticket_number: "RT-001",
    status: "collected",
    payment_status: "pending",
    total_estimate: { value: "3000", precision: 20 },
    amount_paid: { value: "3000", precision: 20 }, // Errantly mirrored total_estimate
    metadata: {
      tags: ["Partially Paid", "Diagnostic"],
      payment_history: [],
    },
  };

  const sanitized = sanitizeRepairTicket(badTicket);

  assert.strictEqual(sanitized.total_estimate, 3000, "total_estimate must be 3000 number");
  assert.strictEqual(sanitized.amount_paid, 0, "amount_paid must be healed to 0");
  assert.deepStrictEqual(sanitized.metadata.tags, ["Diagnostic"], "Stale 'Partially Paid' tag must be removed");
});

test("sanitizeRepairTicket preserves legitimate partial and full payments", () => {
  const partialTicket = {
    id: "rep_02",
    ticket_number: "RT-002",
    status: "repairing",
    payment_status: "partially_paid",
    total_estimate: "5000",
    amount_paid: "2000",
    metadata: {
      tags: ["Partially Paid"],
      payment_history: [{ amount: 2000, method: "Cash" }],
    },
  };

  const sanitizedPartial = sanitizeRepairTicket(partialTicket);
  assert.strictEqual(sanitizedPartial.amount_paid, 2000, "amount_paid must remain 2000");
  assert.strictEqual(sanitizedPartial.total_estimate, 5000);

  const fullTicket = {
    id: "rep_03",
    ticket_number: "RT-003",
    status: "completed",
    payment_status: "captured",
    total_estimate: 15000,
    amount_paid: 15000,
    metadata: {
      tags: ["Paid"],
      zoho_payment_id: "14029860000001",
    },
  };

  const sanitizedFull = sanitizeRepairTicket(fullTicket);
  assert.strictEqual(sanitizedFull.amount_paid, 15000);
  assert.ok(sanitizedFull.metadata.tags.includes("Paid"));
});

test("Payment badge helper logic strictly prevents zero-payment tickets from showing Partially Paid", () => {
  const getTicketPaymentBadge = (ticket: any): { label: string; color: "green" | "orange" | "red" } => {
    const amountPaid = parseNumberField(ticket.amount_paid);
    const targetTotal = parseNumberField(ticket.total_actual) > 0 ? parseNumberField(ticket.total_actual) : parseNumberField(ticket.total_estimate);
    const isCaptured = ticket.payment_status === "captured" || ticket.payment_status === "paid";
    const isRefunded = ticket.payment_status === "refunded" || ticket.metadata?.is_refunded;

    if (isRefunded) {
      return { label: "Refunded", color: "orange" };
    }

    if ((isCaptured && (amountPaid > 0 || targetTotal === 0)) || (targetTotal > 0 && amountPaid >= targetTotal)) {
      return { label: "Paid", color: "green" };
    }

    if (amountPaid > 0 && (targetTotal === 0 || amountPaid < targetTotal)) {
      return { label: "Partially Paid", color: "orange" };
    }

    return { label: "Unpaid", color: "red" };
  };

  // 1. Ticket with 0 paid and pending status -> MUST BE Unpaid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: 0, total_estimate: 3000, payment_status: "pending" }),
    { label: "Unpaid", color: "red" }
  );

  // 2. Ticket with string "0" and partially_paid status (e.g. stale flag) -> MUST BE Unpaid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: "0", total_estimate: 3000, payment_status: "partially_paid" }),
    { label: "Unpaid", color: "red" }
  );

  // 3. Ticket with BigNumber 0 -> MUST BE Unpaid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: { value: "0" }, total_estimate: 3000, payment_status: "pending" }),
    { label: "Unpaid", color: "red" }
  );

  // 4. Ticket with legitimate partial payment -> MUST BE Partially Paid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: 1000, total_estimate: 3000, payment_status: "pending" }),
    { label: "Partially Paid", color: "orange" }
  );

  // 5. Ticket with legitimate full payment -> MUST BE Paid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: 3000, total_estimate: 3000, payment_status: "captured" }),
    { label: "Paid", color: "green" }
  );

  // 6. Complimentary / warranty ticket (total estimate 0, captured) -> MUST BE Paid
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: 0, total_estimate: 0, payment_status: "captured" }),
    { label: "Paid", color: "green" }
  );

  // 7. Refunded ticket -> MUST BE Refunded
  assert.deepStrictEqual(
    getTicketPaymentBadge({ amount_paid: 0, total_estimate: 3000, payment_status: "refunded" }),
    { label: "Refunded", color: "orange" }
  );
});
