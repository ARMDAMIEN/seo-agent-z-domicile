import { google } from "googleapis";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GSC_REFRESH_TOKEN,
  GSC_SITE_URL,
} from "../config.js";

function getAuthedSearchConsole() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
    throw new Error(
      "Missing GSC OAuth2 credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GSC_REFRESH_TOKEN in .env (run `npm run gsc:token` once)."
    );
  }
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GSC_REFRESH_TOKEN });
  return google.searchconsole({ version: "v1", auth: oauth2 });
}

export type GscDimension = "query" | "page" | "country" | "device" | "searchAppearance" | "date";
export type GscFilterOp = "contains" | "notContains" | "equals" | "notEquals" | "includingRegex" | "excludingRegex";

export interface GscFilter {
  dimension: "query" | "page" | "country" | "device" | "searchAppearance";
  operator: GscFilterOp;
  expression: string;
}

export interface GscSearchAnalyticsInput {
  start_date: string;
  end_date: string;
  dimensions: GscDimension[];
  row_limit?: number;
  start_row?: number;
  filters?: GscFilter[];
  data_state?: "final" | "all";
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function queryGscSearchAnalytics(input: GscSearchAnalyticsInput): Promise<{
  rows: GscRow[];
  response_aggregation_type: string | null | undefined;
  site_url: string;
}> {
  const sc = getAuthedSearchConsole();
  const res = await sc.searchanalytics.query({
    siteUrl: GSC_SITE_URL,
    requestBody: {
      startDate: input.start_date,
      endDate: input.end_date,
      dimensions: input.dimensions,
      rowLimit: input.row_limit ?? 250,
      startRow: input.start_row ?? 0,
      dataState: input.data_state ?? "final",
      dimensionFilterGroups: input.filters?.length
        ? [
            {
              groupType: "and",
              filters: input.filters.map((f) => ({
                dimension: f.dimension,
                operator: f.operator,
                expression: f.expression,
              })),
            },
          ]
        : undefined,
    },
  });
  const rows = (res.data.rows ?? []).map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
  return {
    rows,
    response_aggregation_type: res.data.responseAggregationType,
    site_url: GSC_SITE_URL,
  };
}

export async function listGscSites(): Promise<{
  sites: Array<{ siteUrl: string; permissionLevel: string }>;
}> {
  const sc = getAuthedSearchConsole();
  const res = await sc.sites.list({});
  const sites = (res.data.siteEntry ?? []).map((s) => ({
    siteUrl: s.siteUrl ?? "",
    permissionLevel: s.permissionLevel ?? "",
  }));
  return { sites };
}

export async function inspectGscUrl(inspection_url: string): Promise<{
  index_status: string | null | undefined;
  coverage_state: string | null | undefined;
  last_crawl_time: string | null | undefined;
  page_fetch_state: string | null | undefined;
  indexing_state: string | null | undefined;
  verdict: string | null | undefined;
}> {
  const sc = getAuthedSearchConsole();
  const res = await (sc as any).urlInspection.index.inspect({
    requestBody: {
      inspectionUrl: inspection_url,
      siteUrl: GSC_SITE_URL,
    },
  });
  const r = res.data?.inspectionResult ?? {};
  const idx = r.indexStatusResult ?? {};
  return {
    index_status: idx.coverageState,
    coverage_state: idx.coverageState,
    last_crawl_time: idx.lastCrawlTime,
    page_fetch_state: idx.pageFetchState,
    indexing_state: idx.indexingState,
    verdict: idx.verdict,
  };
}
