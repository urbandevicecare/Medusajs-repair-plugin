import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

// GET /admin/repairs/technicians - List all repair technicians
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "phone", "metadata"],
    });

    const technicians = (customers || [])
      .filter((c: any) => {
        const meta = c.metadata || {};
        return meta.is_technician === true || meta.role === "technician";
      })
      .map((c: any) => ({
        id: c.id,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email,
        email: c.email || "",
        phone: c.phone || "",
        role: "Technician",
      }));

    res.json({ technicians });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to list technicians", error: err.message });
  }
}

// POST /admin/repairs/technicians - Add or promote a customer to technician
export async function POST(
  req: MedusaRequest<{
    customer_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  }>,
  res: MedusaResponse
) {
  const customerModule: any = req.scope.resolve("customer", { allowUnregistered: true });
  const { customer_id, first_name, last_name, email, phone } = req.body;

  if (!customerModule) {
    return res.status(500).json({ message: "Customer module not available" });
  }

  try {
    let customer: any = null;

    if (customer_id) {
      customer = await customerModule.retrieveCustomer(customer_id);
    } else if (email) {
      const existing = await customerModule.listCustomers({ email }).catch(() => []);
      if (existing && existing.length > 0) {
        customer = existing[0];
      }
    }

    if (customer) {
      const currentMeta = (customer.metadata as any) || {};
      const updated = await customerModule.updateCustomers(customer.id, {
        first_name: first_name || customer.first_name,
        last_name: last_name || customer.last_name,
        phone: phone || customer.phone,
        metadata: {
          ...currentMeta,
          is_technician: true,
          role: "technician",
        },
      });
      return res.json({
        technician: {
          id: updated.id,
          first_name: updated.first_name,
          last_name: updated.last_name,
          name: `${updated.first_name || ""} ${updated.last_name || ""}`.trim(),
          email: updated.email,
          phone: updated.phone,
          role: "Technician",
        },
      });
    }

    if (!first_name || !email) {
      return res.status(400).json({ message: "First name and email are required to create a technician." });
    }

    const created = await customerModule.createCustomers({
      first_name,
      last_name: last_name || "",
      email,
      phone: phone || undefined,
      metadata: {
        is_technician: true,
        role: "technician",
      },
    });

    res.json({
      technician: {
        id: created.id,
        first_name: created.first_name,
        last_name: created.last_name,
        name: `${created.first_name || ""} ${created.last_name || ""}`.trim(),
        email: created.email,
        phone: created.phone,
        role: "Technician",
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save technician", error: err.message });
  }
}

// DELETE /admin/repairs/technicians?id=... - Demote a technician
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const id = (req.query.id as string) || (req.body as any)?.id;
  if (!id) {
    return res.status(400).json({ message: "Technician ID is required." });
  }

  const customerModule: any = req.scope.resolve("customer", { allowUnregistered: true });
  if (!customerModule) {
    return res.status(500).json({ message: "Customer module not available" });
  }

  try {
    const customer = await customerModule.retrieveCustomer(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const meta = (customer.metadata as any) || {};
    delete meta.is_technician;
    delete meta.role;

    await customerModule.updateCustomers(id, { metadata: meta });

    res.json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to remove technician", error: err.message });
  }
}
