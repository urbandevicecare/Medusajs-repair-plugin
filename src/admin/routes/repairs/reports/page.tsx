import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Select, Button, Badge, Input, Table, Tabs } from "@medusajs/ui";
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

const ReportsPage = () => {
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

  // UI state
  const [activeTab, setActiveTab] = useState<"overview" | "technicians" | "brands" | "tickets">("overview");
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
        const resData = await res.json();
        ticketsToExport = resData.raw_tickets || [];
      }

      if (!ticketsToExport.length) {
        alert("No data available to export.");
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
    } catch (err: any) {
      alert("Failed to export report: " + err.message);
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

  // Status badge styling helper
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
    return <Badge color={colorMap[status] || "grey"}>{label}</Badge>;
  };

  // Payment badge styling helper
  const getPaymentBadge = (ticket: EnrichedRepairTicket) => {
    const pStatus = ticket.payment_status;
    const isPaid = (pStatus === "captured" || pStatus === "paid") || (ticket.final_total > 0 && ticket.amount_paid >= ticket.final_total);
    const isPartial = !isPaid && ticket.amount_paid > 0;
    const isRefunded = pStatus === "refunded";

    if (isRefunded) return <Badge color="orange">Refunded</Badge>;
    if (isPaid) return <Badge color="green">Paid</Badge>;
    if (isPartial) return <Badge color="orange">Partially Paid</Badge>;
    return <Badge color="red">Unpaid</Badge>;
  };

  return (
    <Container className="p-8 bg-transparent border-none shadow-none max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-ui-border-base">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">
              Repair & Operations Reports
            </Heading>
            <Badge color="blue" className="text-[11px]">Granular Analytics</Badge>
          </div>
          <Text className="text-ui-fg-subtle text-sm">
            Real-time tracking of completed repairs, turnaround velocity, technician performance, and revenue realization.
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

      {/* Granular Filter Toolbar */}
      <div className="p-5 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Funnel className="w-4 h-4 text-ui-fg-subtle" />
            <Text className="text-xs font-semibold uppercase tracking-wider text-ui-fg-subtle">
              Granular Filters
            </Text>
            {hasActiveFilters && (
              <Badge color="purple" className="text-[10px] ml-1">
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
          {/* Timeframe selector */}
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
                <Select.Item value="custom">Custom Date Range</Select.Item>
              </Select.Content>
            </Select>
          </div>

          {/* Date Basis selector */}
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

          {/* Physical Status selector */}
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

          {/* Payment Status selector */}
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

          {/* Technician selector */}
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

          {/* Brand selector */}
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

        {/* Custom Date Range & Search Row */}
        <div className="flex flex-col md:flex-row items-center gap-3 pt-2 border-t border-ui-border-base">
          {timeframe === "custom" && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ui-fg-subtle">From:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ui-border-base rounded bg-ui-bg-subtle text-ui-fg-base"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ui-fg-subtle">To:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ui-border-base rounded bg-ui-bg-subtle text-ui-fg-base"
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

      {/* Loading Progress Bar */}
      {loading && (
        <div className="w-full h-1 bg-ui-bg-base overflow-hidden rounded-full">
          <div className="h-full bg-ui-bg-interactive animate-pulse w-1/2"></div>
        </div>
      )}

      {/* Key Metrics KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Card 1: Total Volume */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider mb-1">
              Total Volume
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {data.total_repairs}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              {data.in_progress_count} active bench · {data.cancelled_count} cancelled
            </Text>
          </div>

          {/* Card 2: Completed Repairs */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider">
                Completed
              </Text>
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            </div>
            <Heading level="h2" className="text-2xl font-bold text-green-600">
              {data.completed_count}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              {data.completion_rate}% completion velocity
            </Text>
          </div>

          {/* Card 3: Avg Turnaround */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider">
                Turnaround
              </Text>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {data.avg_repair_time_days > 0 ? `${data.avg_repair_time_days}d` : "-"}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              Min {data.min_repair_time_days}d · Max {data.max_repair_time_days}d
            </Text>
          </div>

          {/* Card 4: Revenue Collected (Cash in Bank) */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider mb-1">
              Revenue Paid
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-green-600">
              {formatCurrency(data.total_collected_revenue)}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              Actual collected payments
            </Text>
          </div>

          {/* Card 5: Invoiced Value */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider mb-1">
              Invoiced Value
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-interactive">
              {formatCurrency(data.total_invoiced_revenue)}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              Pipeline: {formatCurrency(data.total_expected_revenue)}
            </Text>
          </div>

          {/* Card 6: Outstanding Balance */}
          <div className="flex flex-col p-4 bg-ui-bg-base rounded-xl border border-ui-border-base shadow-sm">
            <Text className="text-[11px] font-semibold text-ui-fg-subtle uppercase tracking-wider mb-1">
              Balance Due
            </Text>
            <Heading
              level="h2"
              className={`text-2xl font-bold ${data.total_outstanding_balance > 0 ? "text-orange-600" : "text-ui-fg-base"}`}
            >
              {formatCurrency(data.total_outstanding_balance)}
            </Heading>
            <Text className="text-[10px] text-ui-fg-muted mt-2">
              Pending customer payments
            </Text>
          </div>
        </div>
      )}

      {/* Tabs navigation for granular views */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-ui-border-base">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-ui-border-interactive text-ui-fg-interactive"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Overview & Trends
          </button>
          <button
            onClick={() => setActiveTab("technicians")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "technicians"
                ? "border-ui-border-interactive text-ui-fg-interactive"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Technician Performance ({data?.technician_performance?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("brands")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "brands"
                ? "border-ui-border-interactive text-ui-fg-interactive"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Brand & Device Breakdown ({data?.brand_performance?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("tickets")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "tickets"
                ? "border-ui-border-interactive text-ui-fg-interactive"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            Detailed Records ({rawTickets.length})
          </button>
        </div>

        {/* Tab 1: Overview & Trends */}
        {activeTab === "overview" && data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Financial Trends Chart */}
              <div className="lg:col-span-2 bg-ui-bg-base border border-ui-border-base rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">
                      Revenue Trend (Invoiced vs Collected)
                    </Heading>
                    <Text className="text-xs text-ui-fg-subtle">
                      Realized cash collected versus invoiced repair value over time.
                    </Text>
                  </div>
                </div>

                <div className="h-[320px]">
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
                          contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
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
              <div className="bg-ui-bg-base border border-ui-border-base rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <Heading level="h3" className="text-sm font-semibold text-ui-fg-base mb-1">
                    Repair Status Distribution
                  </Heading>
                  <Text className="text-xs text-ui-fg-subtle mb-6">
                    Breakdown of tickets across lifecycle stages.
                  </Text>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusChartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#374151" }} width={95} />
                        <Tooltip
                          cursor={{ fill: "#f3f4f6" }}
                          contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                          itemStyle={{ fontSize: "12px" }}
                        />
                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Financial parts vs labor summary */}
                <div className="pt-4 border-t border-ui-border-base grid grid-cols-2 gap-3 text-center">
                  <div className="p-2 rounded-lg bg-ui-bg-subtle">
                    <Text className="text-[10px] text-ui-fg-muted uppercase">Parts Volume</Text>
                    <Text className="text-xs font-semibold text-ui-fg-base">
                      {formatCurrency(data.parts_actual_sum || data.parts_estimate_sum)}
                    </Text>
                  </div>
                  <div className="p-2 rounded-lg bg-ui-bg-subtle">
                    <Text className="text-[10px] text-ui-fg-muted uppercase">Labor Volume</Text>
                    <Text className="text-xs font-semibold text-ui-fg-base">
                      {formatCurrency(data.labor_actual_sum || data.labor_estimate_sum)}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Technician Performance */}
        {activeTab === "technicians" && data && (
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-ui-border-base">
              <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                Technician Productivity & Velocity
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Comparative metrics of repairs handled, completion rates, revenue generated, and turnaround days.
              </Text>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted">
                    <th className="py-3 px-4 font-semibold">Technician</th>
                    <th className="py-3 px-4 font-semibold text-center">Repairs Assigned</th>
                    <th className="py-3 px-4 font-semibold text-center">Completed</th>
                    <th className="py-3 px-4 font-semibold text-center">Completion Rate</th>
                    <th className="py-3 px-4 font-semibold text-center">Avg Turnaround</th>
                    <th className="py-3 px-4 font-semibold text-right">Invoiced Value</th>
                    <th className="py-3 px-4 font-semibold text-right">Revenue Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border-base">
                  {data.technician_performance?.length > 0 ? (
                    data.technician_performance.map((tech: any) => (
                      <tr key={tech.name} className="hover:bg-ui-bg-subtle/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-ui-fg-base">{tech.name}</td>
                        <td className="py-3 px-4 text-center font-semibold">{tech.assignedCount}</td>
                        <td className="py-3 px-4 text-center text-green-600 font-semibold">{tech.completedCount}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-ui-bg-subtle rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.min(100, tech.completionRate)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium">{tech.completionRate}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-ui-fg-subtle font-medium">
                          {tech.avgTurnaroundDays > 0 ? `${tech.avgTurnaroundDays} days` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">{formatCurrency(tech.totalInvoiced)}</td>
                        <td className="py-3 px-4 text-right font-bold text-green-600">
                          {formatCurrency(tech.totalCollected)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ui-fg-muted">
                        No technician records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Brand & Device Breakdown */}
        {activeTab === "brands" && data && (
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-ui-border-base">
              <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                Device Brand & Hardware Portfolio
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Volume and revenue realization segmented by device hardware brands.
              </Text>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted">
                    <th className="py-3 px-4 font-semibold">Brand</th>
                    <th className="py-3 px-4 font-semibold text-center">Devices Serviced</th>
                    <th className="py-3 px-4 font-semibold text-center">Completed</th>
                    <th className="py-3 px-4 font-semibold text-right">Invoiced Total</th>
                    <th className="py-3 px-4 font-semibold text-right">Revenue Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border-base">
                  {data.brand_performance?.length > 0 ? (
                    data.brand_performance.map((b: any) => (
                      <tr key={b.brand} className="hover:bg-ui-bg-subtle/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-ui-fg-base">{b.brand}</td>
                        <td className="py-3 px-4 text-center font-semibold">{b.count}</td>
                        <td className="py-3 px-4 text-center text-green-600 font-semibold">{b.completedCount}</td>
                        <td className="py-3 px-4 text-right font-medium">{formatCurrency(b.totalInvoiced)}</td>
                        <td className="py-3 px-4 text-right font-bold text-green-600">
                          {formatCurrency(b.totalCollected)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ui-fg-muted">
                        No brand records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Detailed Records Table */}
        {activeTab === "tickets" && (
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                  Granular Repair Tickets ({rawTickets.length})
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Complete line-by-line audit of matching repair tickets in scope.
                </Text>
              </div>

              <span className="text-xs text-ui-fg-muted">
                Showing {paginatedTickets.length} of {rawTickets.length} tickets
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted">
                    <th className="py-3 px-4 font-semibold">Ticket #</th>
                    <th className="py-3 px-4 font-semibold">Device</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Technician</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-center">Payment</th>
                    <th className="py-3 px-4 font-semibold text-center">Completed</th>
                    <th className="py-3 px-4 font-semibold text-center">Turnaround</th>
                    <th className="py-3 px-4 font-semibold text-right">Invoiced</th>
                    <th className="py-3 px-4 font-semibold text-right">Paid</th>
                    <th className="py-3 px-4 font-semibold text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border-base">
                  {paginatedTickets.length > 0 ? (
                    paginatedTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-ui-bg-subtle/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-ui-fg-interactive">
                          <a href={`/app/repairs/${t.id}`} className="hover:underline">
                            {t.ticket_number}
                          </a>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-ui-fg-base">
                            {t.device?.brand || ""} {t.device?.model_name || "Device"}
                          </div>
                          {t.device?.serial_number && (
                            <div className="text-[10px] text-ui-fg-muted">SN: {t.device.serial_number}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-ui-fg-base">{t.customer_name}</div>
                          {t.customer_phone && (
                            <div className="text-[10px] text-ui-fg-muted">{t.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ui-fg-subtle">
                          {t.technician_name || "Unassigned"}
                        </td>
                        <td className="py-3 px-4 text-center">{getStatusBadge(t.status)}</td>
                        <td className="py-3 px-4 text-center">{getPaymentBadge(t)}</td>
                        <td className="py-3 px-4 text-center text-ui-fg-subtle">
                          {t.effective_completed_at
                            ? new Date(t.effective_completed_at).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="py-3 px-4 text-center font-medium">
                          {t.turnaround_days !== null ? `${t.turnaround_days}d` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatCurrency(t.final_total)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">
                          {formatCurrency(t.amount_paid)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            t.balance_due > 0 ? "text-orange-600" : "text-ui-fg-muted"
                          }`}
                        >
                          {formatCurrency(t.balance_due)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-ui-fg-muted">
                        No repair tickets match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-ui-border-base flex items-center justify-between">
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
          <div className="bg-ui-bg-base border border-ui-border-base rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-ui-border-base">
              <div>
                <Heading level="h2" className="text-xl font-bold text-ui-fg-base">
                  Repair Operations Executive Summary
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Generated {new Date().toLocaleDateString()} · Timeframe: {timeframe} · Target: {dateBasis}
                </Text>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Total Repairs</Text>
                <Text className="text-lg font-bold text-ui-fg-base">{data.total_repairs}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Completed Units</Text>
                <Text className="text-lg font-bold text-green-600">{data.completed_count}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Completion Velocity</Text>
                <Text className="text-lg font-bold text-blue-600">{data.completion_rate}%</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Avg Turnaround</Text>
                <Text className="text-lg font-bold text-ui-fg-base">
                  {data.avg_repair_time_days > 0 ? `${data.avg_repair_time_days} days` : "-"}
                </Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Total Collected</Text>
                <Text className="text-lg font-bold text-green-600">{formatCurrency(data.total_collected_revenue)}</Text>
              </div>
              <div className="p-3 bg-ui-bg-subtle rounded-lg">
                <Text className="text-[10px] text-ui-fg-muted uppercase font-semibold">Outstanding Due</Text>
                <Text className="text-lg font-bold text-orange-600">{formatCurrency(data.total_outstanding_balance)}</Text>
              </div>
            </div>

            {/* Quick technician breakdown */}
            <div>
              <Text className="text-xs font-semibold text-ui-fg-base mb-2">Technician Leaderboard</Text>
              <div className="space-y-1.5">
                {data.technician_performance?.slice(0, 5).map((tech: any) => (
                  <div key={tech.name} className="flex items-center justify-between p-2 rounded bg-ui-bg-subtle text-xs">
                    <span className="font-medium text-ui-fg-base">{tech.name}</span>
                    <span className="text-ui-fg-subtle">
                      {tech.completedCount} / {tech.assignedCount} done ({tech.completionRate}%) · {formatCurrency(tech.totalCollected)} paid
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border-base">
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
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Repair Reports",
  icon: ChartBar,
});

export default ReportsPage;
