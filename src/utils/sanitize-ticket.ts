export function parseNumberField(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && val !== null && "value" in val) {
    const n = Number(val.value);
    return isNaN(n) ? 0 : n;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export function sanitizeRepairTicket<T extends Record<string, any>>(ticket: T): T {
  if (!ticket || typeof ticket !== "object") return ticket;

  const parts_estimate = parseNumberField(ticket.parts_estimate);
  const labor_estimate = parseNumberField(ticket.labor_estimate);
  const total_estimate = parseNumberField(ticket.total_estimate);
  const parts_actual = parseNumberField(ticket.parts_actual);
  const labor_actual = parseNumberField(ticket.labor_actual);
  const total_actual = parseNumberField(ticket.total_actual);
  let amount_paid = parseNumberField(ticket.amount_paid);

  const rawMetadata = ticket.metadata;
  let metadata: Record<string, any> = {};
  if (typeof rawMetadata === "string") {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch (_) {
      metadata = {};
    }
  } else if (rawMetadata && typeof rawMetadata === "object") {
    metadata = { ...rawMetadata };
  }

  // Cross-check payment records
  const paymentHistory = Array.isArray(metadata.payment_history) ? metadata.payment_history : [];
  const hasRecordedPayment =
    paymentHistory.length > 0 ||
    Boolean(metadata.zoho_payment_id) ||
    (Boolean(metadata.paystack_reference) && metadata.paystack_reference !== ticket.payment_collection_id);

  // If ticket is pending payment and has zero payment records, but amount_paid was erroneously populated, heal to 0
  if (ticket.payment_status === "pending" && !hasRecordedPayment && amount_paid > 0) {
    amount_paid = 0;
  }

  // Sanitize tags: if amount_paid is 0 and payment_status is pending, remove stale "Paid" and "Partially Paid" tags
  if (amount_paid === 0 && ticket.payment_status === "pending" && Array.isArray(metadata.tags)) {
    metadata.tags = metadata.tags.filter((t: string) => t !== "Paid" && t !== "Partially Paid");
  }

  return {
    ...ticket,
    parts_estimate,
    labor_estimate,
    total_estimate,
    parts_actual,
    labor_actual,
    total_actual,
    amount_paid,
    metadata,
  };
}
