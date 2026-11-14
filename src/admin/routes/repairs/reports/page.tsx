import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Redirects legacy /repairs/reports visits to the integrated "Repair Reports" tab in /repairs.
 * Note: defineRouteConfig is intentionally omitted so this route does NOT appear in the Medusa Admin sidebar.
 */
const ReportsPageRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/repairs?tab=reports", { replace: true });
  }, [navigate]);

  return null;
};

export default ReportsPageRedirect;
