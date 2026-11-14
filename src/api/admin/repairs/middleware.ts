import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework";
import { z } from "@medusajs/framework/zod";
import { createFindParams } from "@medusajs/medusa/api/utils/validators";

const GetRepairsSchema = createFindParams().extend({
  customer_id: z.union([z.string(), z.array(z.string())]).optional(),
  status: z.string().optional(),
});

const CreateRepairTicketSchema = z.object({
  device: z.object({
    serial_number: z.string(),
    model_name: z.string(),
    brand: z.string(),
    customer_id: z.string().optional(),
    imei: z.string().optional(),
    condition: z.string().optional(),
  }),
  ticket: z.object({
    customer_id: z.string().optional(),
    issue_description: z.string(),
    accessories: z.string().optional(),
    terms_accepted: z.boolean().optional(),
    data_wiped_consent: z.boolean().optional(),
  }),
});

const UpdateStatusSchema = z.object({
  status: z.enum([
    "received",
    "diagnosing",
    "awaiting_approval",
    "repairing",
    "ready",
    "completed",
    "collected",
    "cancelled",
    "refunded",
  ]),
  estimated_completion: z.string().optional(),
  previous_status: z.string().optional(),
});

const AddPartsSchema = z.object({
  variant_ids: z.array(z.string()),
});

const UpdateCostsSchema = z.object({
  parts_estimate: z.number().optional(),
  labor_estimate: z.number().optional(),
  parts_actual: z.number().optional(),
  labor_actual: z.number().optional(),
});

const AddMediaSchema = z.object({
  file_url: z.string(),
  file_name: z.string(),
  file_type: z.enum(["image", "video"]),
  mime_type: z.string().optional(),
  file_size: z.number().optional(),
  description: z.string().optional(),
});

const AddNoteSchema = z.object({
  content: z.string(),
  is_internal: z.boolean(),
});

const AddMessageSchema = z.object({
  message: z.string(),
});

const AddDetailsSchema = z.object({
  estimated_completion: z.string().nullable().optional(),
  technician_name: z.string().nullable().optional(),
  technician_id: z.string().nullable().optional(),
});

export const repairMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/admin/repairs",
    middlewares: [
      validateAndTransformQuery(GetRepairsSchema, {
        defaults: ["id", "ticket_number", "status", "created_at"],
        isList: true,
      }),
    ],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs",
    middlewares: [validateAndTransformBody(CreateRepairTicketSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/status",
    middlewares: [validateAndTransformBody(UpdateStatusSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/parts",
    middlewares: [validateAndTransformBody(AddPartsSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/costs",
    middlewares: [validateAndTransformBody(UpdateCostsSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/media",
    middlewares: [validateAndTransformBody(AddMediaSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/notes",
    middlewares: [validateAndTransformBody(AddNoteSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/messages",
    middlewares: [validateAndTransformBody(AddMessageSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/repairs/:id/details",
    middlewares: [validateAndTransformBody(AddDetailsSchema)],
  },
];
