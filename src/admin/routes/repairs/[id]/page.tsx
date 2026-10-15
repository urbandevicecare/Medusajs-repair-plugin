import {
  Container,
  Heading,
  Badge,
  Button,
  Text,
  Label,
  Textarea,
  Input,
  Select,
  Toaster,
  toast,
} from "@medusajs/ui";
import { useEffect, useState } from "react";
import {
  ArrowUpRightOnBox,
  ChatBubbleLeftRight,
  Trash,
  BellAlert,
} from "@medusajs/icons";
import { useStoreCurrency } from "../../../lib/use-store-currency";
import { useNavigate } from "react-router-dom";

// Get id from URL path
const useParams = () => {
  const path = window.location.pathname;
  const parts = path.split("/");
  const id = parts[parts.length - 1];
  return { id };
};

type RepairTicket = {
  id: string;
  ticket_number: string;
  status: string;
  technician_id?: string;
  technician_name?: string;
  issue_description: string;
  accessories?: string;
  parts_estimate: number;
  labor_estimate: number;
  total_estimate: number;
  parts_actual: number;
  labor_actual: number;
  total_actual: number;
  is_approved: boolean;
  approved_at?: string;
  payment_status: string;
  payment_collection_id?: string;
  warranty_months: number;
  warranty_expiry?: string;
  estimated_completion?: string;
  completed_at?: string;
  collected_at?: string;
  created_at: string;
  terms_accepted?: boolean;
  data_wiped_consent?: boolean;
  device?: {
    serial_number: string;
    model_name: string;
    brand: string;
  };
  parts?: Array<{
    id: string;
    title: string;
    sku?: string;
  }>;
  custom_parts?: Array<{
    name: string;
    price: number;
  }>;
  media?: Array<{
    id: string;
    file_url: string;
    file_type: string;
    created_at: string;
  }>;
  notes?: Array<{
    id: string;
    content: string;
    is_internal: boolean;
    created_at: string;
  }>;
  updates?: Array<{
    id: string;
    message: string;
    author_type: string;
    author_id?: string;
    created_at: string;
  }>;
};

const RepairDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<RepairTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const { formatCurrency } = useStoreCurrency();

  // Form states
  const [newStatus, setNewStatus] = useState("");
  const [unifiedMessage, setUnifiedMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "chat" | "internal_note" | "public_note"
  >("chat");
  const [technicianName, setTechnicianName] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [etc, setEtc] = useState("");

  // Parts states
  const [inventoryParts, setInventoryParts] = useState<any[]>([]);
  const [selectedInventoryPart, setSelectedInventoryPart] =
    useState<string>("");
  const [partSearch, setPartSearch] = useState<string>("");
  const [isAddingPart, setIsAddingPart] = useState(false);
  const [customPartName, setCustomPartName] = useState("");
  const [customPartPrice, setCustomPartPrice] = useState("");
  const [partInputMode, setPartInputMode] = useState<"inventory" | "custom">("inventory");

  const [technicianSearch, setTechnicianSearch] = useState("");
  const [technicianOptions, setTechnicianOptions] = useState<any[]>([]);
  const [showTechnicianDropdown, setShowTechnicianDropdown] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isPushingStk, setIsPushingStk] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (!technicianSearch) {
        setTechnicianOptions([]);
        return;
      }
      Promise.all([
        fetch(`/admin/users?q=${technicianSearch}`, { credentials: "include" }).then((res) => res.json()),
        fetch(`/admin/customers?q=${technicianSearch}`, { credentials: "include" }).then((res) => res.json())
      ]).then(([usersData, customersData]) => {
        const admins = (usersData.users || []).map((u: any) => ({...u, type: 'Admin'}));
        const customers = (customersData.customers || []).map((c: any) => ({...c, type: 'Customer'}));
        setTechnicianOptions([...admins, ...customers]);
      }).catch(err => console.error("Search failed", err));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [technicianSearch]);

  const loadTicket = async () => {
    try {
      if (!ticket) setLoading(true);
      const res = await fetch(`/admin/repairs/${id}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to fetch ticket");
      }

      const t = data.repair_ticket;

      // Handle BigNumber serialization correctly which can be an object or string
      const parseNum = (val: any) => {
        if (typeof val === "object" && val !== null && "value" in val)
          return Number(val.value);
        if (val !== undefined) return Number(val);
        return 0;
      };

      t.labor_estimate = parseNum(t.labor_estimate);
      t.parts_estimate = parseNum(t.parts_estimate);
      t.total_estimate = parseNum(t.total_estimate);
      t.labor_actual = parseNum(t.labor_actual);
      t.parts_actual = parseNum(t.parts_actual);
      t.total_actual = parseNum(t.total_actual);
      t.custom_parts = t.custom_parts || [];

      setTicket(t);
      setNewStatus(t.status);
      setTechnicianName(t.technician_name || "");
      setTechnicianId(t.technician_id || "");

      setLaborCost((t.labor_estimate || 0).toFixed(2));

      setEtc(
        t.estimated_completion ? t.estimated_completion.split("T")[0] : "",
      );

      // load inventory parts for selection
      loadInventoryParts();
    } catch (err) {
      console.error("Failed to load repair ticket:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryParts = async () => {
    try {
      const res = await fetch(`/admin/parts`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setInventoryParts(data.parts || []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (id) {
      loadTicket();
      
      // Mark messages as read in the background
      fetch(`/admin/repairs/${id}/messages/read`, {
        method: "POST",
        credentials: "include",
      }).catch(err => console.error("Failed to mark messages as read", err));
    }
  }, [id]);

  const handleUpdateStatus = async () => {
    try {
      await fetch(`/admin/repairs/${id}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success("Status updated");
      loadTicket();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleAddInventoryPart = async () => {
    if (!selectedInventoryPart) return;
    try {
      setIsAddingPart(true);
      await fetch(`/admin/repairs/${id}/parts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_ids: [selectedInventoryPart] }),
      });
      toast.success("Inventory part added");
      setSelectedInventoryPart("");
      setPartSearch("");
      loadTicket();
    } catch (err) {
      toast.error("Failed to add part");
    } finally {
      setIsAddingPart(false);
    }
  };

  const handleRemoveInventoryPart = async (variantId: string) => {
    try {
      setIsAddingPart(true);
      await fetch(`/admin/repairs/${id}/parts/${variantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Inventory part removed");
      loadTicket();
    } catch (err) {
      toast.error("Failed to remove part");
    } finally {
      setIsAddingPart(false);
    }
  };

  const handleAddCustomPart = async () => {
    if (!customPartName || customPartPrice === "") return;
    try {
      setIsAddingPart(true);
      await fetch(`/admin/repairs/${id}/custom-parts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customPartName,
          price: Number(customPartPrice),
        }),
      });
      toast.success("Custom part added");
      setCustomPartName("");
      setCustomPartPrice("");
      setCustomPartTaxable(true);
      loadTicket();
    } catch (err) {
      toast.error("Failed to add custom part");
    } finally {
      setIsAddingPart(false);
    }
  };

  const handleStkPush = async () => {
    const phone = prompt("Enter customer M-PESA phone number:", ticket?.customer_phone || "");
    if (!phone) return;
    
    let amount = prompt("Enter amount to charge (KES):", ticket?.total_estimate?.toString());
    if (!amount) return;

    setIsPushingStk(true);
    try {
      const response = await fetch(`/admin/repairs/${id}/stk-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: Number(amount) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "STK Push failed");
      toast.success("STK Push successfully sent to customer's phone!");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setIsPushingStk(false);
    }
  };

  const handleMarkPaid = async () => {
    const reference = window.prompt("Enter payment reference (e.g. Cash Receipt, M-PESA Code). Leave blank if none:", "Cash");
    if (reference === null) return; // User cancelled

    if (!confirm("Are you sure you want to mark this ticket as Paid? This will sync the payment to Zoho Books.")) return;

    try {
      const response = await fetch(`/admin/repairs/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: reference ? "Cash/Other" : "Cash", reference })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to mark paid");
      toast.success("Successfully marked as paid and synced to Zoho Books!");
      loadTicket();
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };

  const handleSendUnified = async () => {
    if (!unifiedMessage.trim()) return;
    try {
      if (messageType === "chat") {
        await fetch(`/admin/repairs/${id}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: unifiedMessage }),
        });
        toast.success("Message sent");
      } else {
        await fetch(`/admin/repairs/${id}/notes`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: unifiedMessage,
            is_internal: messageType === "internal_note",
          }),
        });
        toast.success("Note added");
      }
      setUnifiedMessage("");
      loadTicket();
    } catch (err) {
      toast.error("Failed to add entry");
    }
  };

  const handleSendReminder = async () => {
    try {
      setIsSendingReminder(true);
      await fetch(`/admin/repairs/${id}/remind`, {
        method: "POST",
        credentials: "include",
      });
      toast.success("Reminder sent successfully");
    } catch (err) {
      toast.error("Failed to send reminder");
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleUpdateCosts = async (overrides?: { newStatus?: string; technicianName?: string; technicianId?: string; laborCost?: string; etc?: string }) => {
    try {
      const promises = [];
      const currentLaborCost = overrides?.laborCost ?? laborCost;
      const currentEtc = overrides?.etc !== undefined ? overrides.etc : etc;
      const currentTechName = overrides?.technicianName !== undefined ? overrides.technicianName : technicianName;
      const currentTechId = overrides?.technicianId !== undefined ? overrides.technicianId : technicianId;
      const currentStatus = overrides?.newStatus ?? newStatus;

      if (currentLaborCost !== "") {
        const laborAmount = parseFloat(currentLaborCost);
        if (!isNaN(laborAmount)) {
          promises.push(
            fetch(`/admin/repairs/${id}/costs`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                labor_estimate: laborAmount,
              }),
            }),
          );
        }
      }
      promises.push(
        fetch(`/admin/repairs/${id}/details`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estimated_completion: currentEtc ? new Date(currentEtc).toISOString() : null,
            technician_name: currentTechName || null,
            technician_id: currentTechId || null,
          }),
        }),
      );
      if (ticket && currentStatus !== ticket.status) {
        promises.push(
          fetch(`/admin/repairs/${id}/status`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: currentStatus }),
          }),
        );
      }
      await Promise.all(promises);
      toast.success("Details saved successfully");
      loadTicket();
    } catch (err) {
      toast.error("Failed to update details");
    }
  };

  const handleManualApprove = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/admin/repairs/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to approve ticket");
      }

      await loadTicket();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const handleToggleTax = async (checked: boolean) => {
    try {
      const res = await fetch(`/admin/repairs/${id}/tax`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_tax: checked }),
      });
      if (!res.ok) {
        throw new Error("Failed to update tax setting");
      }
      toast.success(checked ? "VAT applied to total" : "VAT removed from total");
      await loadTicket();
    } catch (err: any) {
      toast.error(err.message || "Failed to update tax setting");
    }
  };

  const handleStatusChange = async (newStatusValue: string) => {
    const colors: Record<string, "grey" | "blue" | "orange" | "green" | "red"> =
      {
        pending_dropoff: "grey",
        received: "grey",
        diagnosing: "blue",
        awaiting_approval: "orange",
        repairing: "blue",
        ready: "green",
        completed: "green",
        collected: "green",
        cancelled: "red",
      };
    return colors[newStatusValue] || "grey";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, "grey" | "blue" | "orange" | "green" | "red"> =
      {
        pending_dropoff: "grey",
        received: "grey",
        diagnosing: "blue",
        awaiting_approval: "orange",
        repairing: "blue",
        ready: "green",
        completed: "green",
        collected: "green",
        cancelled: "red",
      };
    return colors[status] || "grey";
  };

  if (loading) {
    return (
      <Container>
        <Text>Loading repair ticket...</Text>
      </Container>
    );
  }

  if (!ticket) {
    return (
      <Container>
        <Text>Repair ticket not found</Text>
      </Container>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <Container>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Heading level="h1">{ticket.ticket_number}</Heading>
              <Badge color={getStatusColor(ticket.status)}>
                {ticket.status.replace("_", " ")}
              </Badge>
              {ticket.technician_name && (
                <Badge color="purple">{ticket.technician_name}</Badge>
              )}
            </div>
            {ticket.device && (
              <Text className="text-ui-fg-subtle mt-2">
                {ticket.device.brand} {ticket.device.model_name} - S/N:{" "}
                {ticket.device.serial_number}
              </Text>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
            <a href={`/admin/repairs/${id}/document?type=job_card`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              Job Card
            </a>
            <a href={`/admin/repairs/${id}/document?type=service_report`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              Service Report
            </a>
            <a href={`/admin/repairs/${id}/document?type=handover`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              Handover
            </a>
            <a href={`/admin/repairs/${id}/document?type=quote`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              Quote
            </a>
            <a href={`/admin/repairs/${id}/document?type=invoice`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
              Invoice
            </a>
            {ticket.payment_status === "captured" || ticket.payment_status === "paid" || ticket.status === "completed" ? (
              <a href={`/admin/repairs/${id}/document?type=receipt`} target="_blank" className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
                Receipt
              </a>
            ) : (
              <span className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-muted cursor-not-allowed opacity-50" title="Available once payment is captured">
                Receipt
              </span>
            )}
            <button 
              onClick={handleSendReminder}
              disabled={isSendingReminder}
              className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-interactive hover:text-ui-fg-interactive-hover transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <BellAlert className="w-3 h-3" /> Reminder
            </button>
            <button onClick={() => navigate('/repairs')} className="text-[11px] uppercase tracking-wider font-semibold text-ui-fg-subtle hover:text-ui-fg-base transition-colors pl-2 border-l border-ui-border-base ml-2">
              Back
            </button>
          </div>
        </div>
      </Container>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-lg shadow-sm">
            {/* Issue Details */}
            <div className="p-6 border-b border-ui-border-base">

            <div className="flex items-baseline gap-2 mb-4">
              <Heading level="h2">
                Issue Details
              </Heading>
              <span className="text-ui-fg-muted text-xs">•</span>
              <span className="text-ui-fg-muted text-xs">
                {new Date(ticket.created_at).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric', 
                  hour: 'numeric', minute: '2-digit'
                })}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Description</Label>
                <Text>{ticket.issue_description}</Text>
              </div>
              {ticket.accessories && (
                <div>
                  <Label>Accessories</Label>
                  <Text>{ticket.accessories}</Text>
                </div>
              )}
              <div className="pt-3 border-t">
                <Label>Compliance</Label>
                <div className="flex gap-2 mt-1.5">
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm leading-none tracking-wider ${ticket.terms_accepted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Terms: {ticket.terms_accepted ? "YES" : "NO"}
                  </span>
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm leading-none tracking-wider ${ticket.data_wiped_consent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    Wipe: {ticket.data_wiped_consent ? "YES" : "NO"}
                  </span>
                </div>
              </div>
            </div>
          
            </div>
            {/* Update Details */}
            <div className="p-6 border-b border-ui-border-base bg-ui-bg-subtle/20">

            <Heading level="h2" className="mb-4">
              Update Details
            </Heading>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Technician */}
                <div className="relative">
                  <span className="text-[10px] uppercase font-semibold text-ui-fg-muted tracking-wider mb-1 block">Technician</span>
                  <div className="flex items-center border border-ui-border-base rounded-md overflow-hidden bg-ui-bg-base focus-within:ring-2 focus-within:ring-ui-fg-interactive transition-all">
                    {technicianName ? (
                      <>
                        <div className="flex-1 px-3 py-[9px] text-sm text-ui-fg-base truncate">{technicianName}</div>
                        <button className="px-3 text-ui-fg-muted hover:text-ui-fg-base" onClick={() => { setTechnicianName(""); setTechnicianId(""); handleUpdateCosts({ technicianName: "", technicianId: "" }) }}>×</button>
                      </>
                    ) : (
                      <>
                        <input
                          placeholder="Search tech..."
                          className="w-full bg-transparent text-sm px-3 py-[9px] outline-none text-ui-fg-base placeholder-ui-fg-muted"
                          value={technicianSearch}
                          onChange={(e) => {
                            setTechnicianSearch(e.target.value);
                            setShowTechnicianDropdown(true);
                          }}
                          onFocus={() => setShowTechnicianDropdown(true)}
                          onBlur={() => setTimeout(() => setShowTechnicianDropdown(false), 200)}
                        />
                        {showTechnicianDropdown && technicianOptions.length > 0 && (
                          <div className="absolute top-full left-0 z-50 w-full mt-1 bg-ui-bg-base border border-ui-border-base rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {technicianOptions.map((opt) => (
                              <div
                                key={opt.id}
                                className="p-2 text-sm cursor-pointer hover:bg-ui-bg-subtle-hover flex justify-between items-center"
                                onClick={() => {
                                  const name = `${opt.first_name} ${opt.last_name}`;
                                  setTechnicianName(name);
                                  setTechnicianId(opt.id);
                                  setTechnicianSearch("");
                                  setShowTechnicianDropdown(false);
                                  handleUpdateCosts({ technicianName: name, technicianId: opt.id });
                                }}
                              >
                                {opt.first_name} {opt.last_name}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="relative">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase font-semibold text-ui-fg-muted tracking-wider block">Status</span>
                    {(ticket?.status === "completed" || ticket?.status === "collected") && 
                     ticket?.payment_status !== "captured" && ticket?.payment_status !== "paid" && (
                      <span className="text-[9px] font-bold px-1 py-0.5 bg-red-100 text-red-700 rounded-sm leading-none">UNPAID</span>
                    )}
                  </div>
                  <div className="flex items-center border border-ui-border-base rounded-md overflow-hidden bg-ui-bg-base focus-within:ring-2 focus-within:ring-ui-fg-interactive transition-all">
                    <select 
                      className="w-full bg-transparent text-sm px-3 py-[9px] outline-none text-ui-fg-base appearance-none cursor-pointer"
                      value={newStatus}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewStatus(val);
                        handleUpdateCosts({ newStatus: val });
                      }}
                    >
                      <option value="pending_dropoff">Pending Dropoff</option>
                      <option value="received">Received</option>
                      <option value="diagnosing">Diagnosing</option>
                      <option value="awaiting_approval">Awaiting Approval</option>
                      <option value="repairing" disabled={!ticket?.is_approved}>Repairing {!ticket?.is_approved && "(Req Approval)"}</option>
                      <option value="ready" disabled={!ticket?.is_approved}>Ready {!ticket?.is_approved && "(Req Approval)"}</option>
                      <option value="completed" disabled={!ticket?.is_approved}>Completed {!ticket?.is_approved && "(Req Approval)"}</option>
                      <option value="collected" disabled={!ticket?.is_approved}>Collected {!ticket?.is_approved && "(Req Approval)"}</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Labor Cost */}
                <div className="relative">
                  <span className="text-[10px] uppercase font-semibold text-ui-fg-muted tracking-wider mb-1 block">Labor Cost (KES)</span>
                  <div className="flex items-center border border-ui-border-base rounded-md overflow-hidden bg-ui-bg-base focus-within:ring-2 focus-within:ring-ui-fg-interactive transition-all">
                    <span className="text-ui-fg-muted pl-3 text-sm">KES</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="0.00" 
                      className="w-full bg-transparent text-sm px-2 py-[9px] outline-none text-ui-fg-base placeholder-ui-fg-muted"
                      value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      onBlur={(e) => handleUpdateCosts({ laborCost: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Estimated Completion */}
                <div className="relative">
                  <span className="text-[10px] uppercase font-semibold text-ui-fg-muted tracking-wider mb-1 block">Est. Completion</span>
                  <div className="flex items-center border border-ui-border-base rounded-md overflow-hidden bg-ui-bg-base focus-within:ring-2 focus-within:ring-ui-fg-interactive transition-all">
                    <input 
                      type="date" 
                      className="w-full bg-transparent text-sm px-3 py-[9px] outline-none text-ui-fg-base text-ui-fg-muted"
                      value={etc}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => {
                        setEtc(e.target.value);
                        handleUpdateCosts({ etc: e.target.value });
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {!ticket?.is_approved && (
                <div className="text-xs text-ui-fg-error -mt-1">
                  Customer must approve estimate before starting work.
                </div>
              )}
            </div>
          
            </div>
            {/* Parts & Inventory */}
            <div className="p-6 border-b border-ui-border-base">

            <Heading level="h2" className="mb-4">
              Parts & Inventory
            </Heading>

            <div className="space-y-4 mb-6">
              {ticket.parts && ticket.parts.length > 0 && (
                <div className="space-y-2">
                  <Label>Inventory Parts Used</Label>
                  {ticket.parts.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-ui-bg-subtle rounded border text-sm"
                    >
                      <div className="flex flex-col">
                        <Text>{p.product?.title ? `${p.product.title} - ` : ""}{p.title}</Text>
                        <Text className="text-ui-fg-subtle text-xs">
                          {p.sku || "-"} {p.prices?.[0]?.amount != null ? ` • ${formatCurrency(p.prices[0].amount)}` : ""}
                        </Text>
                      </div>
                      <Button
                        variant="transparent"
                        className="text-ui-fg-muted hover:text-ui-fg-base"
                        onClick={() => handleRemoveInventoryPart(p.id)}
                        disabled={isAddingPart}
                      >
                        <Trash />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {ticket.custom_parts && ticket.custom_parts.length > 0 && (
                <div className="space-y-2">
                  <Label>Custom Parts</Label>
                  {ticket.custom_parts.map((cp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-ui-bg-subtle rounded border text-sm"
                    >
                      <div className="flex flex-col">
                        <Text>
                          {cp.name} 
                        </Text>
                        <Text className="font-medium text-xs">
                          {formatCurrency(cp.price)}
                        </Text>
                      </div>
                      <Button
                        variant="transparent"
                        className="text-ui-fg-muted hover:text-ui-fg-base"
                        onClick={async () => {
                          try {
                            setIsAddingPart(true);
                            await fetch(`/admin/repairs/${id}/custom-parts/${idx}`, {
                              method: "DELETE",
                              credentials: "include",
                            });
                            toast.success("Custom part removed");
                            loadTicket();
                          } catch (e) {
                            toast.error("Failed to remove custom part");
                          } finally {
                            setIsAddingPart(false);
                          }
                        }}
                        disabled={isAddingPart}
                      >
                        <Trash />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center border border-ui-border-base rounded-md overflow-visible bg-ui-bg-base focus-within:ring-2 focus-within:ring-ui-fg-interactive transition-all">
                {/* Type Toggle */}
                <div className="border-r border-ui-border-base px-2 py-[7px] bg-ui-bg-subtle h-full">
                  <select 
                    className="bg-transparent text-xs font-medium text-ui-fg-subtle outline-none cursor-pointer appearance-none pr-1"
                    value={partInputMode}
                    onChange={(e) => {
                      setPartInputMode(e.target.value as "inventory" | "custom");
                      setPartSearch("");
                      setSelectedInventoryPart("");
                      setCustomPartName("");
                      setCustomPartPrice("");
                    }}
                  >
                    <option value="inventory">Inventory ▾</option>
                    <option value="custom">Custom ▾</option>
                  </select>
                </div>

                {/* Input Area */}
                <div className="flex-1 px-3 relative">
                  {partInputMode === "inventory" ? (
                    <>
                      <input
                        placeholder="Search variant..."
                        className="w-full bg-transparent text-sm outline-none text-ui-fg-base placeholder-ui-fg-muted"
                        value={partSearch}
                        onChange={(e) => {
                          setPartSearch(e.target.value);
                          setSelectedInventoryPart("");
                        }}
                      />
                      {partSearch && !selectedInventoryPart && (
                        <div className="absolute left-0 z-50 w-full mt-2 bg-ui-bg-base border border-ui-border-base rounded-md shadow-md max-h-48 overflow-y-auto">
                          {inventoryParts
                            .filter((p) =>
                              p.title.toLowerCase().includes(partSearch.toLowerCase()) || 
                              p.sku?.toLowerCase().includes(partSearch.toLowerCase())
                            )
                            .map((p) => (
                              <div
                                key={p.id}
                                className="p-2 text-sm hover:bg-ui-bg-subtle-hover cursor-pointer"
                                onClick={() => {
                                  setSelectedInventoryPart(p.id);
                                  setPartSearch(`${p.title} ${p.sku ? `(${p.sku})` : ""}`);
                                }}
                              >
                                {p.title} {p.sku ? `(${p.sku})` : ""}
                              </div>
                            ))}
                          {inventoryParts.filter((p) =>
                              p.title.toLowerCase().includes(partSearch.toLowerCase()) || 
                              p.sku?.toLowerCase().includes(partSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="p-2 text-sm text-ui-fg-subtle">No parts found</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <input
                      placeholder="Part description..."
                      className="w-full bg-transparent text-sm outline-none text-ui-fg-base placeholder-ui-fg-muted"
                      value={customPartName}
                      onChange={(e) => setCustomPartName(e.target.value)}
                    />
                  )}
                </div>

                {/* Price Input & Add Button */}
                <div className="flex items-center border-l border-ui-border-base bg-ui-bg-subtle pl-2">
                  {partInputMode === "custom" && (
                    <>
                      <span className="text-ui-fg-subtle text-xs mr-1">KES</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="w-16 bg-transparent text-sm text-right outline-none text-ui-fg-base placeholder-ui-fg-muted py-[7px]"
                        value={customPartPrice}
                        onChange={(e) => setCustomPartPrice(e.target.value)}
                      />
                    </>
                  )}
                  <button
                    className={`ml-2 px-3 py-[7px] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${partInputMode === "custom" ? "border-l border-ui-border-base" : ""} text-ui-fg-base hover:bg-ui-bg-base-hover`}
                    onClick={partInputMode === "inventory" ? handleAddInventoryPart : handleAddCustomPart}
                    disabled={
                      isAddingPart || 
                      (partInputMode === "inventory" && !selectedInventoryPart) ||
                      (partInputMode === "custom" && (!customPartName || !customPartPrice))
                    }
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          
            </div>
            {/* Cost Breakdown */}
            <div className="p-6">

            <Heading level="h2" className="mb-4">
              Cost Breakdown
            </Heading>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Text>Parts Estimate:</Text>
                <Text className="font-medium">
                  {formatCurrency(ticket.parts_estimate)}
                </Text>
              </div>
              <div className="flex justify-between">
                <Text>Labor Estimate:</Text>
                <Text className="font-medium">
                  {formatCurrency(ticket.labor_estimate)}
                </Text>
              </div>
              <div className="flex justify-between items-center py-2">
                <Label htmlFor="global-vat-toggle" className="text-sm cursor-pointer text-ui-fg-subtle">
                  + Add 16% VAT to Total
                </Label>
                <input
                  type="checkbox"
                  id="global-vat-toggle"
                  checked={ticket.apply_tax ?? false}
                  onChange={(e) => handleToggleTax(e.target.checked)}
                  disabled={loading}
                />
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <Text>Total Estimate:</Text>
                <Text>{formatCurrency(ticket.total_estimate)}</Text>
              </div>

              {ticket.payment_status !== "paid" && ticket.payment_status !== "captured" && ticket.status !== "cancelled" && (
                <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-2">
                  <button 
                    onClick={handleStkPush}
                    disabled={loading || isPushingStk}
                    className="py-1.5 text-[11px] uppercase tracking-wider font-semibold text-ui-fg-interactive bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover rounded-md transition-colors disabled:opacity-50"
                  >
                    {isPushingStk ? "Pushing..." : "Push STK"}
                  </button>
                  <button 
                    onClick={handleMarkPaid}
                    disabled={loading}
                    className="py-1.5 text-[11px] uppercase tracking-wider font-semibold text-ui-fg-base bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover rounded-md transition-colors disabled:opacity-50"
                  >
                    Mark Paid (Cash)
                  </button>
                </div>
              )}

              {ticket.is_approved ? (
                <div className="mt-4 pt-3 border-t">
                  <div className="flex justify-between items-center">
                    <Text className="text-[10px] uppercase font-semibold text-ui-fg-muted tracking-wider">Status / Paid</Text>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase font-bold text-ui-fg-muted tracking-wider">
                        APPR: {new Date(ticket.approved_at!).toLocaleDateString()}
                      </span>
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm leading-none tracking-wider ${ticket.payment_status === "paid" || ticket.payment_status === "captured" ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {ticket.payment_status}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t">
                  <button 
                    onClick={handleManualApprove}
                    disabled={loading}
                    className="w-full py-1.5 text-[11px] uppercase tracking-wider font-semibold text-ui-fg-base bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover border border-ui-border-base rounded-md transition-colors disabled:opacity-50"
                  >
                    Manually Approve & Create Payment
                  </button>
                </div>
              )}
            </div>
          
            </div>
          </div>

{/* Media */}
          {ticket.media && ticket.media.length > 0 && (
            <Container>
              <Heading level="h2" className="mb-4">
                Media
              </Heading>
              <div className="grid grid-cols-2 gap-3">
                {ticket.media.map((media) => (
                  <a
                    key={media.id}
                    href={media.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square rounded border overflow-hidden hover:opacity-80"
                  >
                    <img
                      src={media.file_url}
                      alt="Repair media"
                      className="w-full h-full object-cover"
                    />
                    <ArrowUpRightOnBox
                      className="absolute top-2 right-2 text-white"
                      size={16}
                    />
                  </a>
                ))}
              </div>
            </Container>
          )}
        </div>
        <div className="lg:col-span-5">
          {/* Timeline & Communication */}<div>

            <div className="flex items-center gap-2 mb-4">
              <ChatBubbleLeftRight size={20} />
              <Heading level="h2">Timeline & Communication</Heading>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 max-h-[600px] overflow-y-auto mb-4 pl-4 border-l-2 border-ui-border-base ml-2">
                {(() => {
                  const items = [
                    ...((ticket.notes || []) as any[]).map((n) => ({
                      ...n,
                      entryType: "note",
                    })),
                    ...((ticket.updates || []) as any[]).map((u) => ({
                      ...u,
                      entryType: "update",
                    })),
                  ].sort(
                    (a, b) =>
                      new Date(a.created_at).getTime() -
                      new Date(b.created_at).getTime(),
                  );

                  if (items.length === 0) {
                    return (
                      <Text className="text-ui-fg-muted p-2 text-center text-sm">
                        No activity yet.
                      </Text>
                    );
                  }

                  return items.map((item) => (
                    <div
                      key={`${item.entryType}_${item.id}`}
                      className={`p-3 rounded border bg-ui-bg-base ${
                        item.entryType === "update" &&
                        item.author_type !== "customer"
                          ? "ml-8"
                          : item.entryType === "update" &&
                              item.author_type === "customer"
                            ? "mr-8"
                            : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        {item.entryType === "note" ? (
                          <Badge
                            color={item.is_internal ? "orange" : "blue"}
                            size="small"
                          >
                            {item.is_internal ? "Internal Note" : "Public Note"}
                          </Badge>
                        ) : (
                          <Badge
                            color={
                              item.author_type === "customer"
                                ? "green"
                                : "purple"
                            }
                            size="small"
                          >
                            {item.author_type === "customer"
                              ? ((ticket as any).customer?.first_name 
                                  ? `${(ticket as any).customer.first_name} ${(ticket as any).customer.last_name || ''}`.trim()
                                  : "Customer")
                              : (ticket.technician_name || "Technician")}
                          </Badge>
                        )}
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {new Date(item.created_at).toLocaleString()}
                        </Text>
                      </div>
                      <Text size="small" className="whitespace-pre-wrap">
                        {item.entryType === "note"
                          ? item.content
                          : item.message}
                      </Text>
                    </div>
                  ));
                })()}
              </div>

              <div className="flex flex-col gap-2 p-3">
                <Textarea
                  value={unifiedMessage}
                  onChange={(e) => setUnifiedMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendUnified();
                    }
                  }}
                  placeholder="Type a message or note... (Press Enter to send)"
                  rows={3}
                  className="bg-ui-bg-base"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Select
                    value={messageType}
                    onValueChange={(val: any) => setMessageType(val)}
                  >
                    <Select.Trigger className="w-[180px] bg-ui-bg-base">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="chat">Message Customer</Select.Item>
                      <Select.Item value="internal_note">
                        Internal Note
                      </Select.Item>
                      <Select.Item value="public_note">Public Note</Select.Item>
                    </Select.Content>
                  </Select>
                  <div className="flex-1 text-xs text-ui-fg-muted flex justify-end">
                    Press <kbd className="mx-1 px-1.5 py-0.5 bg-ui-bg-subtle border border-ui-border-base rounded text-[10px] font-mono">Enter</kbd> to submit
                  </div>
                </div>
              </div>
            </div>
          

          </div></div>
      </div>
    </div>
  );
};

export default RepairDetailPage;
