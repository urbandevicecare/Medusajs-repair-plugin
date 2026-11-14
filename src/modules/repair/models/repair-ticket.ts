import { model } from "@medusajs/framework/utils";
import Device from "./device";
import RepairMedia from "./repair-media";
import RepairNote from "./repair-note";
import RepairUpdate from "./repair-update";

const RepairTicket = model.define("repair_ticket", {
  id: model.id().primaryKey(),
  ticket_number: model.text().unique(),

  // Device reference
  device: model.belongsTo(() => Device, {
    mappedBy: "repair_tickets",
  }),

  // Customer reference
  customer_id: model.text().nullable(),

  // Technician assignment
  technician_id: model.text().nullable(),
  technician_name: model.text().nullable(),

  // Status tracking
  status: model
    .enum([
      "pending_dropoff",
      "received",
      "diagnosing",
      "awaiting_approval",
      "repairing",
      "ready",
      "completed",
      "collected",
      "cancelled",
      "refunded",
    ])
    .default("pending_dropoff"),

  // Repair details
  issue_description: model.text(),
  accessories: model.text().nullable(), // JSON string or comma-separated list

  // Cost breakdown
  parts_estimate: model.bigNumber().default(0),
  labor_estimate: model.bigNumber().default(0),
  total_estimate: model.bigNumber().default(0),

  parts_actual: model.bigNumber().default(0),
  labor_actual: model.bigNumber().default(0),
  total_actual: model.bigNumber().default(0),

  // Approval
  is_approved: model.boolean().default(false),
  approved_at: model.dateTime().nullable(),
  approval_token: model.text().nullable(),

  // Warranty
  warranty_months: model.number().default(3),
  warranty_expiry: model.dateTime().nullable(),

  // ETC (Estimated Time of Completion)
  estimated_completion: model.dateTime().nullable(),

  // Completion
  completed_at: model.dateTime().nullable(),
  collected_at: model.dateTime().nullable(),

  // Payment Tracking
  amount_paid: model.bigNumber().default(0),
  payment_status: model
    .enum(["pending", "partially_paid", "authorized", "captured", "refunded"])
    .default("pending"),
  payment_collection_id: model.text().nullable(),

  // Tax handling
  apply_tax: model.boolean().default(false),

  // Relationships
  media: model.hasMany(() => RepairMedia, {
    mappedBy: "repair_ticket",
  }),

  // Legal & Compliance
  terms_accepted: model.boolean().default(false), // Customer accepted T&Cs
  data_wiped_consent: model.boolean().default(false), // Customer consented to data wipe if necessary

  // Custom parts
  custom_parts: model.json().nullable(),

  notes: model.hasMany(() => RepairNote, {
    mappedBy: "repair_ticket",
  }),

  updates: model.hasMany(() => RepairUpdate, {
    mappedBy: "repair_ticket",
  }),

  // Metadata for extensibility
  metadata: model.json().nullable(),
});

export default RepairTicket;
