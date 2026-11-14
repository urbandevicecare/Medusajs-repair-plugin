import { Heading, Text, Select, Button, Badge, Table, toast } from "@medusajs/ui";
import {
  ChartBar,
  ArrowDownTray,
  ArrowPath,
  Funnel,
  CheckCircle,
  Clock,
  DocumentText,
  MagnifyingGlass,
} from "@medusajs/icons";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStoreCurrency } from "../../../lib/use-store-currency";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { generateRepairReportCSV, EnrichedRepairTicket } from "../../../../utils/repair-analytics";

export const RepairReportsTab = () => {
  const navigate = useNavigate();
  // Primary analytics and ticket states
  const [data, setData] = useState<any>(null);
  const [rawTickets, setRawTickets] = useState<EnrichedRepairTicket[]>([]);
  const [availableFilters, setAvailableFilters] = useState<{
    technicians: string[];
    brands: string[];
    statuses: string[];
    payment_statuses: string[];
  }>({
    technicians: [],
    brands: [],
    statuses: [],
    payment_statuses: ["captured", "partially_paid", "pending", "refunded"],
  });
  const [loading, setLoading] = useState(true);

  // Filter states
  const [timeframe, setTimeframe] = useState("all");
  const [dateBasis, setDateBasis] = useState<"any" | "completed_at" | "created_at">("any");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sub-tab navigation
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "technicians" | "brands" | "tickets">("overview");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const { formatCurrency, currencyCode } = useStoreCurrency();

  // Load analytics from backend API
  const fetchAnalytics = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (timeframe) params.append("timeframe", timeframe);
    if (dateBasis) params.append("date_basis", dateBasis);
    if (timeframe === "custom" && customStart) params.append("start_date", customStart);
    if (timeframe === "custom" && customEnd) params.append("end_date", customEnd);
    if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
    if (paymentStatusFilter && paymentStatusFilter !== "all") params.append("payment_status", paymentStatusFilter);
    if (technicianFilter && technicianFilter !== "all") params.append("technician", technicianFilter);
    if (brandFilter && brandFilter !== "all") params.append("brand", brandFilter);
    if (searchQuery.trim()) params.append("search", searchQuery.trim());

    fetch(`/admin/repairs/analytics?${params.toString()}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((resData) => {
        setData(resData.analytics || null);
        setRawTickets(resData.raw_tickets || []);
        if (resData.available_filters) {
          setAvailableFilters(resData.available_filters);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load repair analytics:", err);
        setLoading(false);
      });
  }, [
    timeframe,
    dateBasis,
    customStart,
    customEnd,
    statusFilter,
    paymentStatusFilter,
    technicianFilter,
    brandFilter,
    searchQuery,
  ]);

  useEffect(() => {
    fetchAnalytics();
    setCurrentPage(1);
  }, [fetchAnalytics]);

  // Export CSV handler
  const handleExportCSV = async (allTime: boolean = false) => {
    try {
      let ticketsToExport: EnrichedRepairTicket[] = rawTickets;

      if (allTime) {
        const res = await fetch("/admin/repairs/analytics?timeframe=all", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load all tickets: " + res.statusText);
        const resData = await res.json();
        ticketsToExport = resData.raw_tickets || [];
      }

      if (!ticketsToExport.length) {
        toast.error("No data available to export.");
        return;
      }

      const csvContent = generateRepairReportCSV(ticketsToExport);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const urlObj = URL.createObjectURL(blob);
      link.setAttribute("href", urlObj);
      const dateStr = new Date().toISOString().split("T")[0];
      const scopeLabel = allTime ? "all_time" : `${timeframe}_${dateBasis}`;
      link.setAttribute("download", `repair_report_${scopeLabel}_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(urlObj);
      toast.success(`Successfully exported ${ticketsToExport.length} repair records.`);
    } catch (err: any) {
      toast.error("Failed to export report: " + err.message);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setTimeframe("all");
    setDateBasis("any");
    setCustomStart("");
    setCustomEnd("");
    setStatusFilter("all");
    setPaymentStatusFilter("all");
    setTechnicianFilter("all");
    setBrandFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters = useMemo(() => {
    return (
      timeframe !== "all" ||
      dateBasis !== "any" ||
      statusFilter !== "all" ||
      paymentStatusFilter !== "all" ||
      technicianFilter !== "all" ||
      brandFilter !== "all" ||
      Boolean(searchQuery.trim())
    );
  }, [timeframe, dateBasis, statusFilter, paymentStatusFilter, technicianFilter, brandFilter, searchQuery]);

  // Chart data for status distribution
  const statusChartData = useMemo(() => {
    if (!data?.status_counts) return [];
    return Object.entries(data.status_counts).map(([status, count]) => ({
      name: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count: Number(count),
    }));
  }, [data]);

  // Chart data for monthly revenue
  const revenueChartData = useMemo(() => {
    if (!data?.monthly_revenue) return [];
    return data.monthly_revenue.map((pt: any) => ({
      month: pt.month,
      Invoiced: pt.totalRevenue,
      Collected: pt.collectedRevenue,
      Parts: pt.partsRevenue,
      Labor: pt.laborRevenue,
    }));
  }, [data]);

  // Pagination for tickets table
  const paginatedTickets = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return rawTickets.slice(startIndex, startIndex + pageSize);
  }, [rawTickets, currentPage, pageSize]);

  const totalPages = Math.ceil(rawTickets.length / pageSize) || 1;

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const colorMap: Record<string, "green" | "blue" | "orange" | "red" | "grey"> = {
      completed: "green",
      collected: "green",
      ready: "green",
      repairing: "blue",
      diagnosing: "blue",
      awaiting_approval: "orange",
      received: "grey",
      pending_dropoff: "grey",
      cancelled: "red",
    };
    const label = status ? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
    return <Badge color={colorMap[status] || "grey"} size="small">{label}</Badge>;
  };

  // Payment badge helper
  const getPaymentBadge = (ticket: EnrichedRepairTicket) => {
    const pStatus = ticket.payment_status;
    const isCaptured = pStatus === "captured" || pStatus === "paid";
    const isRefunded = pStatus === "refunded" || ticket.metadata?.is_refunded;
    const amountPaid = Number(ticket.amount_paid) || 0;
    const finalTotal = Number(ticket.final_total) || 0;

    if (isRefunded) return <Badge color="orange" size="small">Refunded</Badge>;
    if ((isCaptured && (amountPaid > 0 || finalTotal === 0)) || (amountPaid >= finalTotal && (finalTotal > 0 || amountPaid > 0))) {
      return <Badge color="green" size="small">Paid</Badge>;
    }
    if (amountPaid > 0 && finalTotal > 0 && amountPaid < finalTotal) {
      return <Badge color="orange" size="small">Partially Paid</Badge>;
    }
    return <Badge color="red" size="small">Unpaid</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Tab Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ui-border-base">
        <div className="flex items-center gap-3">
          <Heading level="h1">Repair Reports & Analytics</Heading>
          <Badge color="blue" size="small">
            Real-time
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <ArrowPath className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowSummaryModal(true)}
            className="flex items-center gap-1.5"
          >
            <DocumentText className="w-3.5 h-3.5" />
            Executive Summary
          </Button>

          <Button
            variant="secondary"
            size="small"
            onClick={() => handleExportCSV(false)}
            className="flex items-center gap-1.5"
          >
            <ArrowDownTray className="w-3.5 h-3.5" />
            Export Filtered CSV
          </Button>

          <Button
            variant="primary"
            size="small"
            onClick={() => handleExportCSV(true)}
            className="flex items-center gap-1.5"
          >
            <ArrowDownTray className="w-3.5 h-3.5" />
            Export All Data
          </Button>
        </div>
      </div>

      {/* Filter Toolbar matching project styling */}
      <div className="p-4 bg-ui-bg-subtle/50 rounded-lg border border-ui-border-base space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Funnel className="w-3.5 h-3.5 text-ui-fg-subtle" />
            <Text className="text-xs font-semibold text-ui-fg-subtle uppercase tracking-wider">
              Filters
            </Text>
            {hasActiveFilters && (
              <Badge color="purple" size="small">
                Active Filter Scope
              </Badge>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-medium text-ui-fg-interactive hover:underline"
            >
              Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Timeframe */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Timeframe</label>
            <Select value={timeframe} onValueChange={setTimeframe} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Time</Select.Item>
                <Select.Item value="day">Today</Select.Item>
                <Select.Item value="yesterday">Yesterday</Select.Item>
                <Select.Item value="week">Past 7 Days</Select.Item>
                <Select.Item value="month">Past 30 Days</Select.Item>
                <Select.Item value="this_month">This Month</Select.Item>
                <Select.Item value="year">Past Year</Select.Item>
                <Select.Item value="this_year">This Year</Select.Item>
                <Select.Item value="custom">Custom Range</Select.Item>
              </Select.Content>
            </Select>
          </div>

          {/* Date Target */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Date Target</label>
            <Select value={dateBasis} onValueChange={(v: any) => setDateBasis(v)} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="any">Activity (Created/Done)</Select.Item>
                <Select.Item value="completed_at">Repairs Completed In Period</Select.Item>
                <Select.Item value="created_at">Repairs Received In Period</Select.Item>
              </Select.Content>
            </Select>
          </div>

          {/* Repair Status */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Repair Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Statuses</Select.Item>
                <Select.Item value="completed_only">Completed (Done/Collected)</Select.Item>
                <Select.Item value="in_progress">In-Progress Bench</Select.Item>
                <Select.Item value="received">Received</Select.Item>
                <Select.Item value="diagnosing">Diagnosing</Select.Item>
                <Select.Item value="awaiting_approval">Awaiting Approval</Select.Item>
                <Select.Item value="repairing">Repairing</Select.Item>
                <Select.Item value="ready">Ready</Select.Item>
                <Select.Item value="completed">Completed</Select.Item>
                <Select.Item value="collected">Collected</Select.Item>
                <Select.Item value="cancelled">Cancelled</Select.Item>
              </Select.Content>
            </Select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Payment Status</label>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Payments</Select.Item>
                <Select.Item value="captured">Paid in Full</Select.Item>
                <Select.Item value="partially_paid">Partially Paid</Select.Item>
                <Select.Item value="pending">Unpaid (Pending)</Select.Item>
                <Select.Item value="refunded">Refunded</Select.Item>
              </Select.Content>
            </Select>
          </div>

          {/* Technician */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Technician</label>
            <Select value={technicianFilter} onValueChange={setTechnicianFilter} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Technicians</Select.Item>
                {availableFilters.technicians.map((tech) => (
                  <Select.Item key={tech} value={tech}>
                    {tech}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[11px] font-medium text-ui-fg-muted mb-1">Device Brand</label>
            <Select value={brandFilter} onValueChange={setBrandFilter} size="small">
              <Select.Trigger className="w-full">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Brands</Select.Item>
                {availableFilters.brands.map((b) => (
                  <Select.Item key={b} value={b}>
                    {b}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        {/* Custom Range & Search Bar */}
        <div className="flex flex-col md:flex-row items-center gap-3 pt-2 border-t border-ui-border-base">
          {timeframe === "custom" && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ui-fg-subtle">From:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ui-border-base rounded bg-ui-bg-base text-ui-fg-base"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ui-fg-subtle">To:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ui-border-base rounded bg-ui-bg-base text-ui-fg-base"
                />
              </div>
            </div>
          )}

          <div className="relative w-full md:flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-fg-muted" />
            <input
              type="text"
              placeholder="Search by ticket #, customer name, phone, device model, or serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-ui-bg-field border border-ui-border-base rounded-md text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive placeholder:text-ui-fg-muted"
            />
          </div>
        </div>
      </div>

      {/* Loading Bar */}
      {loading && (
        <div className="w-full h-1 bg-ui-bg-subtle overflow-hidden rounded-full">
          <div className="h-full bg-ui-bg-interactive animate-pulse w-1/2"></div>
        </div>
      )}

      {/* KPI Cards styled matching project conventions */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
              Total Volume
            </span>
            <div className="text-2xl font-bold text-ui-fg-base font-mono my-1">
              {data.total_repairs}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              {data.in_progress_count} active bench · {data.cancelled_count} cancelled
            </span>
          </div>

          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
                Completed
              </span>
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600 font-mono my-1">
              {data.completed_count}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              {data.completion_rate}% completion rate
            </span>
          </div>

          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
                Turnaround
              </span>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-ui-fg-base font-mono my-1">
              {data.avg_repair_time_days > 0 ? `${data.avg_repair_time_days}d` : "-"}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              Min {data.min_repair_time_days}d · Max {data.max_repair_time_days}d
            </span>
          </div>

          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
              Revenue Paid
            </span>
            <div className="text-2xl font-bold text-green-600 font-mono my-1 truncate" title={formatCurrency(data.total_collected_revenue)}>
              {formatCurrency(data.total_collected_revenue)}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              Actual collected payments
            </span>
          </div>

          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
              Invoiced Value
            </span>
            <div className="text-2xl font-bold text-ui-fg-interactive font-mono my-1 truncate" title={formatCurrency(data.total_invoiced_revenue)}>
              {formatCurrency(data.total_invoiced_revenue)}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              Pipeline: {formatCurrency(data.total_expected_revenue)}
            </span>
          </div>

          <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg flex flex-col justify-between">
            <span className="text-[11px] font-medium text-ui-fg-subtle uppercase tracking-wider">
              Balance Due
            </span>
            <div className={`text-2xl font-bold font-mono my-1 truncate ${data.total_outstanding_balance > 0 ? "text-orange-600" : "text-ui-fg-base"}`} title={formatCurrency(data.total_outstanding_balance)}>
              {formatCurrency(data.total_outstanding_balance)}
            </div>
            <span className="text-[10px] text-ui-fg-muted">
              Pending customer payments
            </span>
          </div>
        </div>
      )}

      {/* Granular Sub-Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-ui-border-base pb-1">
          <button
            onClick={() => setActiveSubTab("overview")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSubTab === "overview"
                ? "bg-ui-bg-base text-ui-fg-base shadow-sm border border-ui-border-base font-semibold"
                : "text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Overview & Trends
          </button>
          <button
            onClick={() => setActiveSubTab("technicians")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSubTab === "technicians"
                ? "bg-ui-bg-base text-ui-fg-base shadow-sm border border-ui-border-base font-semibold"
                : "text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Technicians ({data?.technician_performance?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("brands")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSubTab === "brands"
                ? "bg-ui-bg-base text-ui-fg-base shadow-sm border border-ui-border-base font-semibold"
                : "text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Brands ({data?.brand_performance?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("tickets")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSubTab === "tickets"
                ? "bg-ui-bg-base text-ui-fg-base shadow-sm border border-ui-border-base font-semibold"
                : "text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Detailed Records ({rawTickets.length})
          </button>
        </div>

        {/* Tab 1: Overview & Trends */}
        {activeSubTab === "overview" && data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Financial Trends Chart */}
            <div className="lg:col-span-2 bg-ui-bg-base border border-ui-border-base rounded-lg p-5">
              <div className="mb-4">
                <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">
                  Revenue Trend (Invoiced vs Collected)
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Realized cash collected versus invoiced repair value over time.
                </Text>
              </div>

              <div className="h-[280px]">
                {revenueChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} dy={10} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#6b7280" }}
                        tickFormatter={(val) =>
                          new Intl.NumberFormat("en-US", {
                            notation: "compact",
                            compactDisplay: "short",
                            style: "currency",
                            currency: currencyCode,
                          }).format(val)
                        }
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        labelStyle={{ fontSize: "12px", fontWeight: "bold", color: "#111827", marginBottom: "4px" }}
                        itemStyle={{ fontSize: "12px" }}
                        formatter={(value: any) => [formatCurrency(Number(value)), ""]}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                      <Area
                        type="monotone"
                        dataKey="Invoiced"
                        name="Invoiced Total"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorInvoiced)"
                      />
                      <Area
                        type="monotone"
                        dataKey="Collected"
                        name="Paid / Collected"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorCollected)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-ui-fg-muted text-xs">
                    No revenue trend records available for the selected period.
                  </div>
                )}
              </div>
            </div>

            {/* Status Distribution */}
            <div className="bg-ui-bg-base border border-ui-border-base rounded-lg p-5 flex flex-col justify-between">
              <div>
                <Heading level="h3" className="text-sm font-semibold text-ui-fg-base mb-1">
                  Status Distribution
                </Heading>
                <Text className="text-xs text-ui-fg-subtle mb-4">
                  Breakdown across lifecycle stages.
                </Text>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#374151" }} width={95} />
                      <Tooltip
                        cursor={{ fill: "#f3f4f6" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        itemStyle={{ fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Parts vs Labor */}
              <div className="pt-4 border-t border-ui-border-base grid grid-cols-2 gap-3 text-center">
                <div className="p-2 rounded bg-ui-bg-subtle">
                  <Text className="text-[10px] text-ui-fg-muted uppercase font-medium">Parts Volume</Text>
                  <Text className="text-xs font-semibold text-ui-fg-base font-mono">
                    {formatCurrency(data.parts_actual_sum || data.parts_estimate_sum)}
                  </Text>
                </div>
                <div className="p-2 rounded bg-ui-bg-subtle">
                  <Text className="text-[10px] text-ui-fg-muted uppercase font-medium">Labor Volume</Text>
                  <Text className="text-xs font-semibold text-ui-fg-base font-mono">
                    {formatCurrency(data.labor_actual_sum || data.labor_estimate_sum)}
                  </Text>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Technician Performance */}
        {activeSubTab === "technicians" && data && (
          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="p-4 border-b border-ui-border-base bg-ui-bg-base">
              <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">
                Technician Productivity & Velocity
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Comparative metrics of repairs handled, completion rates, revenue generated, and turnaround days.
              </Text>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Technician</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Assigned</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Completed</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Completion Rate</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Avg Turnaround</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Invoiced Value</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Revenue Paid</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.technician_performance?.length > 0 ? (
                  data.technician_performance.map((tech: any) => (
                    <Table.Row key={tech.name} className="hover:bg-ui-bg-subtle-hover transition-colors">
                      <Table.Cell className="font-medium text-ui-fg-base">{tech.name}</Table.Cell>
                      <Table.Cell className="text-center font-semibold">{tech.assignedCount}</Table.Cell>
                      <Table.Cell className="text-center text-green-600 font-semibold">{tech.completedCount}</Table.Cell>
                      <Table.Cell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-ui-bg-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, tech.completionRate)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-medium">{tech.completionRate}%</span>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-center text-ui-fg-subtle">
                        {tech.avgTurnaroundDays > 0 ? `${tech.avgTurnaroundDays} days` : "-"}
                      </Table.Cell>
                      <Table.Cell className="text-right font-medium">{formatCurrency(tech.totalInvoiced)}</Table.Cell>
                      <Table.Cell className="text-right font-bold text-green-600">
                        {formatCurrency(tech.totalCollected)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={7} className="py-8 text-center text-ui-fg-muted">
                      No technician records found.
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </div>
        )}

        {/* Tab 3: Brand & Device Breakdown */}
        {activeSubTab === "brands" && data && (
          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="p-4 border-b border-ui-border-base bg-ui-bg-base">
              <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">
                Device Brand & Hardware Portfolio
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Volume and revenue realization segmented by device hardware brands.
              </Text>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Brand</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Devices Serviced</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Completed</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Invoiced Total</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Revenue Paid</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.brand_performance?.length > 0 ? (
                  data.brand_performance.map((b: any) => (
                    <Table.Row key={b.brand} className="hover:bg-ui-bg-subtle-hover transition-colors">
                      <Table.Cell className="font-medium text-ui-fg-base">{b.brand}</Table.Cell>
                      <Table.Cell className="text-center font-semibold">{b.count}</Table.Cell>
                      <Table.Cell className="text-center text-green-600 font-semibold">{b.completedCount}</Table.Cell>
                      <Table.Cell className="text-right font-medium">{formatCurrency(b.totalInvoiced)}</Table.Cell>
                      <Table.Cell className="text-right font-bold text-green-600">
                        {formatCurrency(b.totalCollected)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={5} className="py-8 text-center text-ui-fg-muted">
                      No brand records found.
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </div>
        )}

        {/* Tab 4: Detailed Records Table */}
        {activeSubTab === "tickets" && (
          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="p-4 border-b border-ui-border-base bg-ui-bg-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">
                  Granular Repair Records ({rawTickets.length})
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Complete line-by-line audit of matching repair tickets in scope.
                </Text>
              </div>

              <span className="text-xs text-ui-fg-muted">
                Showing {paginatedTickets.length} of {rawTickets.length} tickets
              </span>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Ticket #</Table.HeaderCell>
                  <Table.HeaderCell>Device</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Technician</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Payment</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Completed</Table.HeaderCell>
                  <Table.HeaderCell className="text-center">Turnaround</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Invoiced</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Paid</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Balance Due</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {paginatedTickets.length > 0 ? (
                  paginatedTickets.map((t) => (
                    <Table.Row
                      key={t.id}
                      onClick={() => navigate(`/repairs/${t.id}`)}
                      className="hover:bg-ui-bg-subtle-hover transition-colors cursor-pointer"
                    >
                      <Table.Cell className="font-semibold text-ui-fg-interactive">
                        {t.ticket_number}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-medium text-ui-fg-base">
                          {t.device?.brand || ""} {t.device?.model_name || "Device"}
                        </div>
                        {(t.device?.serial_number || t.device?.imei) && (
                          <div className="text-[10px] text-ui-fg-muted font-mono">
                            {t.device.serial_number ? `SN: ${t.device.serial_number}` : `IMEI: ${t.device.imei}`}
                          </div>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-medium text-ui-fg-base">{t.customer_name}</div>
                        {t.customer_phone && (
                          <div className="text-[10px] text-ui-fg-muted">{t.customer_phone}</div>
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-ui-fg-subtle">
                        {t.technician_name ? (
                          <Badge color="purple" size="small">
                            {t.technician_name}
                          </Badge>
                        ) : (
                          <span className="text-ui-fg-muted text-xs">Unassigned</span>
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-center">{getStatusBadge(t.status)}</Table.Cell>
                      <Table.Cell className="text-center">{getPaymentBadge(t)}</Table.Cell>
                      <Table.Cell className="text-center text-ui-fg-subtle text-xs">
                        {t.effective_completed_at
                          ? new Date(t.effective_completed_at).toLocaleDateString()
                          : "-"}
                      </Table.Cell>
                      <Table.Cell className="text-center font-medium text-xs">
                        {t.turnaround_days !== null ? `${t.turnaround_days}d` : "-"}
                      </Table.Cell>
                      <Table.Cell className="text-right font-medium">
                        {formatCurrency(t.final_total)}
                      </Table.Cell>
                      <Table.Cell className="text-right font-semibold text-green-600">
                        {formatCurrency(t.amount_paid)}
                      </Table.Cell>
                      <Table.Cell
                        className={`text-right font-semibold ${
                          t.balance_due > 0 ? "text-orange-600" : "text-ui-fg-muted"
                        }`}
                      >
                        {formatCurrency(t.balance_due)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={11} className="py-8 text-center text-ui-fg-muted">
                      No repair tickets match the selected filters.
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>

            {/* Pagination Controls matching Medusa standard */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-ui-border-base bg-ui-bg-base flex items-center justify-between">
                <Text className="text-xs text-ui-fg-subtle">
                  Page {currentPage} of {totalPages}
                </Text>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formatted Executive Summary Modal */}
      {showSummaryModal && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
              <div>
                <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                  Repair Operations Executive Summary
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Generated {new Date().toLocaleDateString()} · Timeframe: {timeframe} · Target: {dateBasis}
                </Text>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base text-lg font-bold p-1 leading-none"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Total Volume</Text>
                <Text className="text-lg font-bold text-ui-fg-base">{data.total_repairs}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Completed</Text>
                <Text className="text-lg font-bold text-green-600">{data.completed_count}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Velocity</Text>
                <Text className="text-lg font-bold text-blue-600">{data.completion_rate}%</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Avg Turnaround</Text>
                <Text className="text-lg font-bold text-ui-fg-base">
                  {data.avg_repair_time_days > 0 ? `${data.avg_repair_time_days} days` : "-"}
                </Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Total Paid</Text>
                <Text className="text-lg font-bold text-green-600">{formatCurrency(data.total_collected_revenue)}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Balance Due</Text>
                <Text className="text-lg font-bold text-orange-600">{formatCurrency(data.total_outstanding_balance)}</Text>
              </div>
            </div>

            <div className="space-y-2 text-xs text-ui-fg-subtle border-t border-ui-border-base pt-3">
              <p>• <strong>Invoiced Total:</strong> {formatCurrency(data.total_invoiced_revenue)}</p>
              <p>• <strong>Parts vs Labor:</strong> {formatCurrency(data.parts_actual_sum || data.parts_estimate_sum)} parts / {formatCurrency(data.labor_actual_sum || data.labor_estimate_sum)} labor</p>
              <p>• <strong>Outstanding Balance:</strong> {formatCurrency(data.total_outstanding_balance)}</p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-ui-border-base">
              <Button variant="secondary" size="small" onClick={() => window.print()}>
                Print / Save PDF
              </Button>
              <Button variant="primary" size="small" onClick={() => setShowSummaryModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
