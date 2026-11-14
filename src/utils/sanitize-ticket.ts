export function parseNumberField(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && val !== null && "value" in val) {
    const n = Number(val.value);
    return isNaN(n) ? 0 : n;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export type SanitizedRepairTicket<T = Record<string, any>> = T & {
  parts_estimate: number;
  labor_estimate: number;
  total_estimate: number;
  parts_actual: number;
  labor_actual: number;
  total_actual: number;
  amount_paid: number;
  payment_status: string;
  raw_amount_paid: { value: string; precision: number };
  raw_parts_estimate: { value: string; precision: number };
  raw_labor_estimate: { value: string; precision: number };
  raw_total_estimate: { value: string; precision: number };
  raw_parts_actual: { value: string; precision: number };
  raw_labor_actual: { value: string; precision: number };
  raw_total_actual: { value: string; precision: number };
  metadata: Record<string, any>;
};

export function sanitizeRepairTicket<T extends Record<string, any>>(ticket: T): SanitizedRepairTicket<T> {
  if (!ticket || typeof ticket !== "object") return ticket as any;

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

  let payment_status = ticket.payment_status;

  // Cross-check payment records
  const paymentHistory = Array.isArray(metadata.payment_history) ? metadata.payment_history : [];
  const hasRecordedPayment =
    paymentHistory.length > 0 ||
    Boolean(metadata.zoho_payment_id) ||
    (Boolean(metadata.paystack_reference) && metadata.paystack_reference !== ticket.payment_collection_id);

  // If ticket has zero recorded payment records and is not legitimately captured or refunded,
  // any positive amount_paid or partially_paid status is erroneous and must be healed
  if (!hasRecordedPayment && payment_status !== "captured" && payment_status !== "refunded") {
    amount_paid = 0;
    payment_status = "pending";
  }

  // Derive legitimate payment state
  const targetTotal = total_actual > 0 ? total_actual : total_estimate;
  const isPaid = (payment_status === "captured" || payment_status === "paid") || (targetTotal > 0 && amount_paid >= targetTotal);
  const isPartial = !isPaid && amount_paid > 0 && targetTotal > 0 && amount_paid < targetTotal;

  // Sanitize tags: strictly remove stale Paid / Partially Paid tags if ticket does not meet criteria
  if (Array.isArray(metadata.tags)) {
    metadata.tags = metadata.tags.filter((t: string) => {
      if (t === "Paid") return isPaid;
      if (t === "Partially Paid") return isPartial;
      return true;
    });
  }

  // Synchronize raw fields to prevent downstream BigNumber deserialization issues
  const raw_amount_paid = { value: String(amount_paid), precision: 20 };
  const raw_parts_estimate = { value: String(parts_estimate), precision: 20 };
  const raw_labor_estimate = { value: String(labor_estimate), precision: 20 };
  const raw_total_estimate = { value: String(total_estimate), precision: 20 };
  const raw_parts_actual = { value: String(parts_actual), precision: 20 };
  const raw_labor_actual = { value: String(labor_actual), precision: 20 };
  const raw_total_actual = { value: String(total_actual), precision: 20 };

  return {
    ...ticket,
    parts_estimate,
    labor_estimate,
    total_estimate,
    parts_actual,
    labor_actual,
    total_actual,
    amount_paid,
    payment_status,
    raw_amount_paid,
    raw_parts_estimate,
    raw_labor_estimate,
    raw_total_estimate,
    raw_parts_actual,
    raw_labor_actual,
    raw_total_actual,
    metadata,
  };
}
