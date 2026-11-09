import { defineRouteConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Table,
  Badge,
  Button,
  Input,
  Select,
  FocusModal,
  Label,
  Textarea,
  Text,
  Checkbox,
  Tabs,
  Switch,
} from "@medusajs/ui";
import { useEffect, useState } from "react";
import { Wrench, DocumentText, ArrowPath, ArrowDownTray, Envelope, Sparkles } from "@medusajs/icons";
import { useStoreCurrency } from "../../lib/use-store-currency";
import { useNavigate } from "react-router-dom";

type RepairTicket = {
  id: string;
  ticket_number: string;
  customer_id?: string;
  status: string;
  technician_name?: string;
  issue_description: string;
  total_estimate: number;
  created_at: string;
  estimated_completion?: string;
  updates?: any[];
};

const RepairsPage = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { formatCurrency } = useStoreCurrency();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [settings, setSettings] = useState({
    email_notifications_enabled: true,
    sms_notifications_enabled: true,
    whatsapp_notifications_enabled: false,
    zoho_books_enabled: false,
    zoho_client_id: "",
    zoho_client_secret: "",
    zoho_refresh_token: "",
    zoho_organization_id: "",
    zoho_domain: "com",
    paystack_enabled: false,
    paystack_public_key: "",
    paystack_secret_key: "",
    company_name: "Urban Device Care Ltd",
    storefront_url: "",
    email_subject_template: "",
    email_body_template: "",
    sms_body_template: "",
    whatsapp_body_template: "",
  });

  const loadSettings = () => {
    fetch("/admin/repairs/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings({
            ...data.settings,
            zoho_client_id: data.settings.zoho_client_id || "",
            zoho_client_secret: data.settings.zoho_client_secret || "",
            zoho_refresh_token: data.settings.zoho_refresh_token || "",
            zoho_organization_id: data.settings.zoho_organization_id || "",
            zoho_domain: data.settings.zoho_domain || "com",
            paystack_public_key: data.settings.paystack_public_key || "",
            paystack_secret_key: data.settings.paystack_secret_key || "",
            company_name: data.settings.company_name || "Urban Device Care Ltd",
            storefront_url: data.settings.storefront_url || "",
            email_subject_template: data.settings.email_subject_template || "",
            email_body_template: data.settings.email_body_template || "",
            sms_body_template: data.settings.sms_body_template || "",
            whatsapp_body_template: data.settings.whatsapp_body_template || "",
          });
        }
      })
      .catch((err) => console.error(err));
  };

  const [isSaving, setIsSaving] = useState(false);

  const updateSettingState = (key: string, value: boolean | string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const insertTag = (field: "email_body_template" | "sms_body_template" | "whatsapp_body_template", tag: string) => {
    const cur = (settings as any)[field] || "";
    const updated = cur + (cur.endsWith(" ") || !cur ? "" : " ") + tag;
    updateSettingState(field, updated);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await fetch("/admin/repairs/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      alert("Settings saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };
  const [newDevice, setNewDevice] = useState({
    serial_number: "",
    model_name: "",
    brand: "Apple",
    customer_id: "",
    imei: "",
    condition: "",
  });
  const [newTicket, setNewTicket] = useState({
    customer_id: "",
    issue_description: "",
    terms_accepted: false,
    data_wiped_consent: false,
  });

  const [accessoryInput, setAccessoryInput] = useState("");
  const [accessories, setAccessories] = useState<string[]>([]);

  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const loadCustomers = () => {
    setLoadingCustomers(true);
    fetch(`/admin/customers`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setCustomers(data.customers || []);
        setLoadingCustomers(false);
      })
      .catch((err) => {
        console.error("Failed to load customers:", err);
        setLoadingCustomers(false);
      });
  };

  const loadTickets = () => {
    setLoading(true);
    fetch(`/admin/repairs`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setTickets(data.repair_tickets || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load repair tickets:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadTickets();
    loadCustomers();
    loadSettings();
  }, []);

  const handleAccessoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const val = accessoryInput.trim().replace(",", "");
      if (val && !accessories.includes(val)) {
        setAccessories([...accessories, val]);
      }
      setAccessoryInput("");
    }
  };
  const removeAccessory = (acc: string) =>
    setAccessories(accessories.filter((a) => a !== acc));

  const handleCreateTicket = async () => {
    if (!newTicket.terms_accepted) {
      alert("Customer must accept the Repair Terms & Conditions to proceed.");
      return;
    }
    try {
      setIsCreating(true);
      const res = await fetch(`/admin/repairs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: {
            serial_number: newDevice.serial_number,
            model_name: newDevice.model_name,
            brand: newDevice.brand,
            customer_id: newDevice.customer_id || undefined,
            imei: newDevice.imei || undefined,
            condition: newDevice.condition || undefined,
          },
          ticket: {
            customer_id: newTicket.customer_id || undefined,
            issue_description: newTicket.issue_description,
            accessories:
              accessories.length > 0 ? accessories.join(", ") : undefined,
            terms_accepted: newTicket.terms_accepted,
            data_wiped_consent: newTicket.data_wiped_consent,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create repair ticket");
      }

      setCreateModalOpen(false);
      setNewDevice({
        serial_number: "",
        model_name: "",
        brand: "Apple",
        customer_id: "",
        imei: "",
        condition: "",
      });
      setNewTicket({
        customer_id: "",
        issue_description: "",
        terms_accepted: false,
        data_wiped_consent: false,
      });
      setAccessories([]);
      setAccessoryInput("");
      loadTickets();
    } catch (err) {
      console.error(err);
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, "grey" | "blue" | "orange" | "green" | "red"> =
      {
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

  const getCustomerName = (customerId?: string) => {
    if (!customerId) return "No Customer";
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return "Unknown";
    return customer.first_name || customer.last_name
      ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : customer.email || "Unknown";
  };

  const filteredTickets = tickets
    .map((ticket) => {
      // Handle BigNumber parsing
      const parseNum = (val: any) => {
        if (typeof val === "object" && val !== null && "value" in val)
          return Number(val.value);
        if (val !== undefined) return Number(val);
        return 0;
      };
      return {
        ...ticket,
        total_estimate: parseNum(ticket.total_estimate),
      };
    })
    .filter((ticket) => {
      const matchesSearch =
        ticket.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.issue_description
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        ticket.technician_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || ticket.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  const [activeTab, setActiveTab] = useState("tickets");

  return (
    <Container className="p-0 overflow-hidden">
      <div className="flex border-b border-ui-border-base px-6 pt-2 space-x-6">
        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-3 text-sm font-medium transition-colors ${
            activeTab === "tickets"
              ? "border-b-2 border-ui-fg-base text-ui-fg-base"
              : "text-ui-fg-subtle hover:text-ui-fg-base"
          }`}
        >
          Repair Tickets
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          className={`pb-3 text-sm font-medium transition-colors ${
            activeTab === "notifications"
              ? "border-b-2 border-ui-fg-base text-ui-fg-base"
              : "text-ui-fg-subtle hover:text-ui-fg-base"
          }`}
        >
          Notification Templates
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-3 text-sm font-medium transition-colors ${
            activeTab === "settings"
              ? "border-b-2 border-ui-fg-base text-ui-fg-base"
              : "text-ui-fg-subtle hover:text-ui-fg-base"
          }`}
        >
          Settings & Integrations
        </button>
      </div>
      
      {activeTab === "tickets" && (
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <Heading level="h1">Repair Tickets</Heading>
        <FocusModal open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <FocusModal.Trigger asChild>
            <Button variant="primary">Create Repair Ticket</Button>
          </FocusModal.Trigger>
          <FocusModal.Content>
            <FocusModal.Header>
              <Button
                variant="primary"
                onClick={handleCreateTicket}
                isLoading={isCreating}
              >
                Save Ticket
              </Button>
            </FocusModal.Header>
            <FocusModal.Body className="flex flex-col items-center py-16 overflow-y-auto">
              <div className="flex w-full max-w-lg flex-col gap-y-8">
                <div className="flex flex-col gap-y-2">
                  <Heading>Create Repair Ticket</Heading>
                  <p className="text-ui-fg-subtle text-sm">
                    Add a new device and repair ticket.
                  </p>
                </div>

                <div className="flex flex-col gap-y-4">
                  <Heading level="h2" className="text-lg">
                    Device Details
                  </Heading>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="brand">Brand *</Label>
                      <Input
                        id="brand"
                        value={newDevice.brand}
                        onChange={(e) =>
                          setNewDevice({ ...newDevice, brand: e.target.value })
                        }
                        placeholder="Apple"
                      />
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="model_name">Model Name *</Label>
                      <Input
                        id="model_name"
                        value={newDevice.model_name}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            model_name: e.target.value,
                          })
                        }
                        placeholder="iPhone 13 Pro"
                      />
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="serial_number">Serial Number *</Label>
                      <Input
                        id="serial_number"
                        value={newDevice.serial_number}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            serial_number: e.target.value,
                          })
                        }
                        placeholder="SN12345678"
                      />
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="imei">IMEI</Label>
                      <Input
                        id="imei"
                        value={newDevice.imei}
                        onChange={(e) =>
                          setNewDevice({ ...newDevice, imei: e.target.value })
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="flex flex-col gap-y-2 col-span-2">
                      <Label htmlFor="condition">Device Condition</Label>
                      <Textarea
                        id="condition"
                        value={newDevice.condition}
                        onChange={(e) =>
                          setNewDevice({
                            ...newDevice,
                            condition: e.target.value,
                          })
                        }
                        placeholder="Scratches on screen, etc."
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-y-4">
                  <Heading level="h2" className="text-lg">
                    Ticket Details
                  </Heading>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="customer_id">Customer</Label>
                      <Select
                        value={newTicket.customer_id}
                        onValueChange={(val) => {
                          setNewTicket({ ...newTicket, customer_id: val });
                          setNewDevice({ ...newDevice, customer_id: val });
                        }}
                      >
                        <Select.Trigger>
                          <Select.Value
                            placeholder={
                              loadingCustomers
                                ? "Loading..."
                                : "Select a customer"
                            }
                          />
                        </Select.Trigger>
                        <Select.Content>
                          {customers.map((customer) => (
                            <Select.Item key={customer.id} value={customer.id}>
                              {customer.first_name || customer.last_name
                                ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
                                : "No Name"}{" "}
                              ({customer.email})
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="issue_description">
                        Issue Description *
                      </Label>
                      <Textarea
                        id="issue_description"
                        value={newTicket.issue_description}
                        onChange={(e) =>
                          setNewTicket({
                            ...newTicket,
                            issue_description: e.target.value,
                          })
                        }
                        placeholder="Screen is cracked and battery draining fast."
                      />
                    </div>
                    <div className="flex flex-col gap-y-2">
                      <Label htmlFor="accessories">
                        Accessories Included (press comma to add)
                      </Label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {accessories.map((acc) => (
                          <Badge
                            key={acc}
                            color="grey"
                            size="small"
                            className="flex items-center gap-1"
                          >
                            {acc}
                            <button
                              type="button"
                              onClick={() => removeAccessory(acc)}
                              className="text-ui-fg-muted hover:text-ui-fg-base"
                            >
                              &times;
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <Input
                        id="accessories"
                        value={accessoryInput}
                        onChange={(e) => setAccessoryInput(e.target.value)}
                        onKeyDown={handleAccessoryKeyDown}
                        placeholder="Type and press comma..."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-y-4">
                  <Heading level="h2" className="text-lg">
                    Legal & Compliance
                  </Heading>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-x-2">
                      <Checkbox
                        id="terms_accepted"
                        checked={newTicket.terms_accepted}
                        onCheckedChange={(c) =>
                          setNewTicket({
                            ...newTicket,
                            terms_accepted: c === true,
                          })
                        }
                      />
                      <Label htmlFor="terms_accepted">
                        Customer accepts Repair Terms & Conditions *
                      </Label>
                    </div>
                    <div className="flex items-center gap-x-2">
                      <Checkbox
                        id="data_wiped_consent"
                        checked={newTicket.data_wiped_consent}
                        onCheckedChange={(c) =>
                          setNewTicket({
                            ...newTicket,
                            data_wiped_consent: c === true,
                          })
                        }
                      />
                      <Label htmlFor="data_wiped_consent">
                        Customer consents to device data wipe (if required)
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <Select.Trigger>
              <Select.Value placeholder="Filter by status" />
            </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All Statuses</Select.Item>
            <Select.Item value="received">Received</Select.Item>
            <Select.Item value="diagnosing">Diagnosing</Select.Item>
            <Select.Item value="awaiting_approval">
              Awaiting Approval
            </Select.Item>
            <Select.Item value="repairing">Repairing</Select.Item>
            <Select.Item value="ready">Ready</Select.Item>
            <Select.Item value="completed">Completed</Select.Item>
            <Select.Item value="collected">Collected</Select.Item>
            <Select.Item value="cancelled">Cancelled</Select.Item>
          </Select.Content>
        </Select>
        </div>
        <Input
          placeholder="Search tickets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">Loading repair tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-12 text-ui-fg-subtle">
          <Wrench className="mx-auto mb-4" size={48} />
          <p>No repair tickets found</p>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Ticket #</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Technician</Table.HeaderCell>
              <Table.HeaderCell>Issue</Table.HeaderCell>
              <Table.HeaderCell>Estimate</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredTickets.map((ticket) => {
              const hasUnreadUpdate = ticket.updates?.some((u: any) => u.author_type === "customer" && !u.is_read);
              const isPendingDropoff = ticket.status === "pending_dropoff";
              const needsAttention = hasUnreadUpdate || isPendingDropoff;
              
              return (
              <Table.Row 
                key={ticket.id} 
                onClick={() => navigate(`/repairs/${ticket.id}`)}
                className="cursor-pointer hover:bg-ui-bg-subtle-hover transition-colors relative"
              >
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Text className="font-medium">{ticket.ticket_number}</Text>
                    {needsAttention && (
                      <div 
                        className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_0_2px_rgba(239,68,68,0.2)]" 
                        title={hasUnreadUpdate ? "Unread customer message" : "Pending drop-off"} 
                      />
                    )}
                  </div>
                  <Text className="text-ui-fg-subtle text-xs">
                    {getCustomerName(ticket.customer_id)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2 items-center">
                    <Badge color={getStatusColor(ticket.status)} size="small">
                      {ticket.status.replace("_", " ")}
                    </Badge>
                    {(ticket.payment_status === "captured" || ticket.payment_status === "paid" || (Array.isArray(ticket.metadata?.tags) && ticket.metadata?.tags.includes("Paid"))) ? (
                      <Badge color="green" size="small">
                        Paid
                      </Badge>
                    ) : (ticket.status === "completed" || ticket.status === "collected") ? (
                      <Badge color="red" size="small">
                        Unpaid
                      </Badge>
                    ) : null}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {ticket.technician_name ? (
                    <Badge color="purple" size="small">
                      {ticket.technician_name}
                    </Badge>
                  ) : (
                    <span className="text-ui-fg-muted text-xs">Unassigned</span>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-xs truncate">
                  {ticket.issue_description}
                </Table.Cell>
                <Table.Cell>{formatCurrency(ticket.total_estimate)}</Table.Cell>
                <Table.Cell>
                  {new Date(ticket.created_at).toLocaleDateString()}
                </Table.Cell>
              </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      )}
      </div>
      )}


      {/* ========================================================= */}
      {/* TAB 3: NOTIFICATION TEMPLATES & CHANNELS                  */}
      {/* ========================================================= */}
      {activeTab === "notifications" && (
        <div className="p-6 max-w-4xl flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <Heading level="h2" className="text-lg font-semibold">Customizable Notification Message Templates</Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Configure message templates and channel rules dispatched across Email, SMS, and WhatsApp. Click on any merge tag below each editor to insert dynamic placeholders.
            </Text>
          </div>

          {/* Best Practices Banner */}
          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col gap-2">
            <div className="flex items-center gap-2 text-ui-fg-interactive font-medium text-xs">
              <Sparkles className="w-4 h-4" />
              <span>Smart Milestone Dispatch Policy</span>
            </div>
            <ul className="text-xs text-ui-fg-subtle list-disc list-inside space-y-1">
              <li><strong>Customer Milestones:</strong> Notifications are pushed exclusively on true milestones (<code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">received</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">awaiting_approval</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">ready</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">completed</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">cancelled</code>).</li>
              <li><strong>Zero Bench Spam:</strong> Internal workshop operations (<code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">diagnosing</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">repairing</code>) do NOT send customer notifications.</li>
              <li><strong>SMS Cost Protection:</strong> SMS messages are strictly restricted to customer action milestones (<code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">awaiting_approval</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">ready</code>, <code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">cancelled</code>).</li>
              <li><strong>WhatsApp Safety:</strong> WhatsApp is disabled by default to prevent unhandled provider errors in Medusa.</li>
            </ul>
          </div>

          {/* Channel Switches */}
          <div className="p-4 border border-ui-border-base rounded-lg bg-ui-bg-base flex flex-col gap-4">
            <Label className="font-semibold text-sm">Active Channels</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 border border-ui-border-base rounded bg-ui-bg-subtle">
                <div>
                  <Label className="font-medium text-xs">Email Channel</Label>
                  <Text className="text-[11px] text-ui-fg-muted">Responsive HTML emails</Text>
                </div>
                <Switch
                  checked={settings.email_notifications_enabled}
                  onCheckedChange={(v) => updateSettingState("email_notifications_enabled", v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-ui-border-base rounded bg-ui-bg-subtle">
                <div>
                  <Label className="font-medium text-xs">SMS Channel</Label>
                  <Text className="text-[11px] text-ui-fg-muted">Action-required SMS only</Text>
                </div>
                <Switch
                  checked={settings.sms_notifications_enabled}
                  onCheckedChange={(v) => updateSettingState("sms_notifications_enabled", v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-ui-border-base rounded bg-ui-bg-subtle">
                <div>
                  <Label className="font-medium text-xs">WhatsApp Channel</Label>
                  <Text className="text-[11px] text-ui-fg-muted">Off by default</Text>
                </div>
                <Switch
                  checked={settings.whatsapp_notifications_enabled}
                  onCheckedChange={(v) => updateSettingState("whatsapp_notifications_enabled", v)}
                />
              </div>
            </div>
          </div>

          {/* 1. Email Template Card */}
          <div className="p-5 border border-ui-border-base rounded-lg bg-ui-bg-base flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Envelope className="w-4 h-4 text-ui-fg-interactive" />
                <Label className="font-semibold text-sm">Email Notification Customizer</Label>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  updateSettingState("email_subject_template", "");
                  updateSettingState("email_body_template", "");
                }}
              >
                Reset to Default
              </Button>
            </div>

            <div>
              <Label className="text-xs font-medium">Email Subject Template</Label>
              <Input
                value={settings.email_subject_template || ""}
                onChange={(e) => updateSettingState("email_subject_template", e.target.value)}
                placeholder="{company_name}: Repair Status Update - {device} (#{ticket_number})"
                size="small"
                className="mt-1 font-mono text-xs"
              />
              <Text className="text-[11px] text-ui-fg-muted mt-1">
                Default: <code>&#123;company_name&#125;: Repair Status Update - &#123;device&#125; (#&#123;ticket_number&#125;)</code>
              </Text>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">Email Body Template (HTML / Text)</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    "{customer_name}",
                    "{ticket_number}",
                    "{device}",
                    "{status}",
                    "{total_estimate}",
                    "{approval_url}",
                    "{pdf_url}",
                    "{company_name}",
                    "{payment_button}",
                    "{download_button}",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag("email_body_template", tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover text-ui-fg-subtle border border-ui-border-base font-mono cursor-pointer transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={settings.email_body_template || ""}
                onChange={(e) => updateSettingState("email_body_template", e.target.value)}
                placeholder={`<p>Dear <strong>{customer_name}</strong>,</p>\n<p>Your repair ticket <strong>#{ticket_number}</strong> for <strong>{device}</strong> is now: <strong>{status}</strong>.</p>\n<p>Estimated Cost: <strong>{total_estimate}</strong></p>\n{payment_button}\n{download_button}\n<p>Best regards,<br/><strong>{company_name}</strong></p>`}
                rows={5}
                className="font-mono text-xs"
              />
              <Text className="text-[11px] text-ui-fg-muted mt-1">
                Leave blank to use default responsive branded layout with action buttons and summary card.
              </Text>
            </div>
          </div>

          {/* 2. SMS Template Card */}
          <div className="p-5 border border-ui-border-base rounded-lg bg-ui-bg-base flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">SMS Message Body Template</Label>
              <Button
                variant="secondary"
                size="small"
                onClick={() => updateSettingState("sms_body_template", "")}
              >
                Reset to Default
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">SMS Body Text</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    "{customer_name}",
                    "{ticket_number}",
                    "{device}",
                    "{status}",
                    "{total_estimate}",
                    "{short_approval_url}",
                    "{short_pdf_url}",
                    "{company_name}",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag("sms_body_template", tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover text-ui-fg-subtle border border-ui-border-base font-mono cursor-pointer transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={settings.sms_body_template || ""}
                onChange={(e) => updateSettingState("sms_body_template", e.target.value)}
                placeholder="[{company_name}] Hi {customer_name}, repair #{ticket_number} ({device}) is: {status}. Cost: {total_estimate}. Action/Track: {short_approval_url}"
                rows={3}
                className="font-mono text-xs"
              />
              <Text className="text-[11px] text-ui-fg-muted mt-1">
                Leave blank to use concise default: <code>[&#123;company_name&#125;] Hi &#123;customer_name&#125;, your repair #&#123;ticket_number&#125; (&#123;device&#125;) is: &#123;status&#125;...</code>
              </Text>
            </div>
          </div>

          {/* 3. WhatsApp Template Card */}
          <div className="p-5 border border-ui-border-base rounded-lg bg-ui-bg-base flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">WhatsApp Message Body Template</Label>
              <Button
                variant="secondary"
                size="small"
                onClick={() => updateSettingState("whatsapp_body_template", "")}
              >
                Reset to Default
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">WhatsApp Body Text</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    "{customer_name}",
                    "{ticket_number}",
                    "{device}",
                    "{status}",
                    "{total_estimate}",
                    "{approval_url}",
                    "{pdf_url}",
                    "{company_name}",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag("whatsapp_body_template", tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover text-ui-fg-subtle border border-ui-border-base font-mono cursor-pointer transition-colors"
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={settings.whatsapp_body_template || ""}
                onChange={(e) => updateSettingState("whatsapp_body_template", e.target.value)}
                placeholder="*[{company_name}]* Hi {customer_name}, repair #{ticket_number} ({device}) is: *{status}*.\nEstimate: {total_estimate}\nTrack progress: {approval_url}"
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="primary" onClick={saveSettings} isLoading={isSaving}>
              Save Notification Templates
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: GENERAL SETTINGS, BRANDING & INTEGRATIONS           */}
      {/* ========================================================= */}
      {activeTab === "settings" && (
        <div className="flex flex-col gap-6 w-full max-w-3xl p-6">
          <div>
            <Heading level="h2">General Settings</Heading>
            <Text className="text-ui-fg-subtle text-xs">
              General workshop configuration and storefront tracking settings.
            </Text>
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-2">
                <Text size="small" className="font-medium text-ui-fg-base">Company Name</Text>
                <Input 
                  placeholder="e.g. Urban Device Care Ltd" 
                  value={settings.company_name} 
                  onChange={(e) => updateSettingState("company_name", e.target.value)} 
                />
              </div>

              <div className="flex flex-col gap-2">
                <Text size="small" className="font-medium text-ui-fg-base">Storefront URL</Text>
                <Text size="small" className="text-ui-fg-subtle">Base URL for customer tracking links & online payment.</Text>
                <Input 
                  placeholder="e.g. https://store.urbandevicecare.co.uk" 
                  value={settings.storefront_url} 
                  onChange={(e) => updateSettingState("storefront_url", e.target.value)} 
                />
              </div>
            </div>
            <div className="border-b border-ui-border-base my-6" />
          </div>

          <div className="flex flex-col gap-y-6">
            <Heading level="h2">Zoho Books Integration</Heading>
            <Text className="text-ui-fg-subtle text-xs">
              Configure Zoho Books to sync Repair Tickets as Estimates and Invoices.
            </Text>
            
            <div className="flex flex-col gap-y-6 mt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold">Enable Zoho Books Sync</Label>
                  <Text className="text-xs text-ui-fg-subtle">Official Zoho Books documents for Invoices, Estimates & Receipts.</Text>
                </div>
                <Switch checked={settings.zoho_books_enabled} onCheckedChange={(v) => updateSettingState("zoho_books_enabled", v)} />
              </div>

              {settings.zoho_books_enabled && (
                <div className="flex flex-col gap-y-4 p-4 border border-ui-border-base rounded-lg bg-ui-bg-subtle">
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Zoho Data Center (Domain)</Label>
                    <Select 
                      value={settings.zoho_domain} 
                      onValueChange={(v) => updateSettingState("zoho_domain", v)}
                    >
                      <Select.Trigger size="small">
                        <Select.Value placeholder="Select Data Center" />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="com">.com (Global)</Select.Item>
                        <Select.Item value="eu">.eu (Europe)</Select.Item>
                        <Select.Item value="in">.in (India)</Select.Item>
                        <Select.Item value="com.au">.com.au (Australia)</Select.Item>
                        <Select.Item value="jp">.jp (Japan)</Select.Item>
                      </Select.Content>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Organization ID</Label>
                    <Input 
                      placeholder="e.g. 12345678" 
                      value={settings.zoho_organization_id} 
                      onChange={(e) => updateSettingState("zoho_organization_id", e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Client ID</Label>
                    <Input 
                      placeholder="1000.XXXXXXXXXXXXXXXXXXXXXXXX" 
                      value={settings.zoho_client_id} 
                      onChange={(e) => updateSettingState("zoho_client_id", e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Client Secret</Label>
                    <Input 
                      placeholder="Enter Client Secret" 
                      type="password"
                      value={settings.zoho_client_secret} 
                      onChange={(e) => updateSettingState("zoho_client_secret", e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Refresh Token</Label>
                    <Input 
                      placeholder="1000.XXXXXXXXXXXXXXXXXXXXXXXX" 
                      type="password"
                      value={settings.zoho_refresh_token} 
                      onChange={(e) => updateSettingState("zoho_refresh_token", e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <hr className="my-6" />
          
          <div className="flex flex-col gap-y-6">
            <Heading level="h2">Paystack Integration</Heading>
            <Text className="text-ui-fg-subtle text-xs">
              Configure Paystack to generate instant online payment links for repairs.
            </Text>
            
            <div className="flex flex-col gap-y-6 mt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold">Enable Paystack Checkout</Label>
                  <Text className="text-xs text-ui-fg-subtle">Generate Paystack checkout links on approved tickets.</Text>
                </div>
                <Switch checked={settings.paystack_enabled} onCheckedChange={(v) => updateSettingState("paystack_enabled", v)} />
              </div>

              {settings.paystack_enabled && (
                <div className="flex flex-col gap-y-4 p-4 border border-ui-border-base rounded-lg bg-ui-bg-subtle">
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Public Key</Label>
                    <Input 
                      placeholder="pk_test_..." 
                      value={settings.paystack_public_key} 
                      onChange={(e) => updateSettingState("paystack_public_key", e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label className="text-xs">Secret Key</Label>
                    <Input 
                      placeholder="sk_test_..." 
                      type="password"
                      value={settings.paystack_secret_key} 
                      onChange={(e) => updateSettingState("paystack_secret_key", e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="primary" onClick={saveSettings} isLoading={isSaving}>
              Save All Settings
            </Button>
          </div>
        </div>
      )}

    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Repair",
  icon: Wrench,
});

export default RepairsPage;
