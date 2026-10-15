import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// GET /r/:code (Universal public shortlink redirect for repairs)
export async function GET(req: MedusaRequest<{ code: string }>, res: MedusaResponse) {
  const code = req.params.code;
  let links: any[] = [];
  try {
    const repairModule: any = req.scope.resolve("repair", { allowUnregistered: true });
    if (repairModule) {
      links = await repairModule.listRepairLinks({ shortcode: code }).catch(() => []);
    }
  } catch (e) {}

  if (!links || links.length === 0) {
    try {
      const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
      if (docService) {
        links = await docService.listDocumentLinks({ shortcode: code }).catch(() => []);
      }
    } catch (e) {}
  }

  if (links && links.length > 0) {
    let targetUrl = links[0].url;
    const host = req.get("host") || "localhost:9000";
    const forwarded = typeof req.get === "function" ? req.get("x-forwarded-proto") : undefined;
    const protocol = (forwarded === "http" || forwarded === "https") ? forwarded : (req.protocol || "http");

    if (targetUrl.includes("/documents/")) {
      const docSubpath = targetUrl.slice(targetUrl.indexOf("/documents/")).replace(/\/admin\/documents\//, "/documents/");
      targetUrl = `${protocol}://${host}${docSubpath}`;
    } else if (targetUrl.startsWith("/")) {
      targetUrl = `${protocol}://${host}${targetUrl}`;
    }
    res.setHeader("Location", targetUrl);
    return res.status(302).send("Redirecting...");
  }

  return res.status(404).send("Link not found");
}
