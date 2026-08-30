// server.ts
import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import ExcelJS from "exceljs";

// src/adapters/sam.ts
import { z } from "zod";

// src/adapters/http.ts
var ConnectorError = class extends Error {
  constructor(message, status, statusCode, attempts = 1, durationMs = 0) {
    super(message);
    this.status = status;
    this.statusCode = statusCode;
    this.attempts = attempts;
    this.durationMs = durationMs;
    this.name = "ConnectorError";
  }
};
var retryableStatus = (status) => status === 408 || status === 429 || status >= 500;
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function classifyStatus(status) {
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 404 || status === 422) return "INVALID_QUERY";
  if (status >= 500) return "SOURCE_UNAVAILABLE";
  return "ERROR";
}
function safeMessage(body, status) {
  const compact = body.replace(/\s+/g, " ").trim().slice(0, 240);
  return compact ? `HTTP ${status}: ${compact}` : `HTTP ${status}`;
}
async function fetchJsonWithRetry(url, init = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12e3;
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        const status = classifyStatus(response.status);
        if (retryableStatus(response.status) && attempt < maxAttempts) {
          await wait(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
          continue;
        }
        throw new ConnectorError(safeMessage(body, response.status), status, response.status, attempt, Date.now() - startedAt);
      }
      try {
        return { data: JSON.parse(body), attempts: attempt, durationMs: Date.now() - startedAt, statusCode: response.status };
      } catch {
        throw new ConnectorError("The source returned a non-JSON response.", "SOURCE_UNAVAILABLE", response.status, attempt, Date.now() - startedAt);
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      const isTimeout = error instanceof Error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message));
      if (attempt < maxAttempts) {
        await wait(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
        continue;
      }
      throw new ConnectorError(
        isTimeout ? `Timed out after ${timeoutMs}ms.` : error instanceof Error ? error.message : "Network request failed.",
        isTimeout ? "TIMEOUT" : "SOURCE_UNAVAILABLE",
        void 0,
        attempt,
        Date.now() - startedAt
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new ConnectorError("Source request failed.", "ERROR", void 0, maxAttempts, Date.now() - startedAt);
}

// src/adapters/sam.ts
var resourceLinkSchema = z.object({
  type: z.string().nullish(),
  name: z.string().nullish(),
  link: z.string().nullish()
}).passthrough();
var responseSchema = z.object({
  totalRecords: z.number().default(0),
  opportunitiesData: z.array(z.object({
    noticeId: z.string().nullish(),
    title: z.string().nullish(),
    solicitationNumber: z.string().nullish(),
    department: z.string().nullish(),
    subTier: z.string().nullish(),
    postedDate: z.string().nullish(),
    type: z.string().nullish(),
    naicsCode: z.string().nullish(),
    resourceLinks: z.array(z.union([resourceLinkSchema, z.string()])).nullish()
  }).passthrough()).default([])
}).passthrough();
var mmddyyyy = (date) => `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`;
async function querySamGov(deal, uploadedFiles = []) {
  const apiKey2 = process.env.SAM_API_KEY;
  const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
  const querySummary = deal.solicitationNumber ? `solicitation: ${deal.solicitationNumber}` : `title: ${deal.title}`;
  if (!apiKey2) {
    return {
      name: "SAM.gov",
      success: false,
      status: "UNAVAILABLE",
      recordsFound: 0,
      evidence: [],
      message: "Optional SAM_API_KEY is not configured.",
      durationMs: 0,
      attempts: 0,
      retrievedAt,
      querySummary
    };
  }
  try {
    let parsed = null;
    let response = null;
    let statusMsg = "";
    if (deal.solicitationNumber?.trim()) {
      const params = new URLSearchParams({ api_key: apiKey2, limit: "10", offset: "0", solnum: deal.solicitationNumber.trim() });
      try {
        response = await fetchJsonWithRetry(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, { headers: { Accept: "application/json" } }, { timeoutMs: 15e3, maxAttempts: 2 });
        const solParsed = responseSchema.parse(response.data);
        const exact = solParsed.opportunitiesData.filter(
          (opportunity) => opportunity.solicitationNumber?.trim().toLowerCase() === deal.solicitationNumber?.trim().toLowerCase()
        );
        if (exact.length > 0) {
          parsed = { ...solParsed, opportunitiesData: exact };
          statusMsg = void 0;
        }
      } catch (e) {
        if (e instanceof ConnectorError && ["RATE_LIMITED", "AUTH_REQUIRED", "TIMEOUT", "SOURCE_UNAVAILABLE"].includes(e.status)) {
          throw e;
        }
      }
    }
    if (!parsed) {
      const from = /* @__PURE__ */ new Date();
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      const params = new URLSearchParams({
        api_key: apiKey2,
        postedFrom: mmddyyyy(from),
        postedTo: mmddyyyy(/* @__PURE__ */ new Date()),
        limit: "10",
        offset: "0"
      });
      if (deal.solicitationNumber?.trim()) params.set("solnum", deal.solicitationNumber.trim());
      else if (deal.title?.trim()) params.set("title", deal.title.trim());
      response = await fetchJsonWithRetry(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, {
        headers: { Accept: "application/json" }
      }, { timeoutMs: 15e3, maxAttempts: 2 });
      parsed = responseSchema.parse(response.data);
      statusMsg = parsed.opportunitiesData.length > 0 ? void 0 : "SAM.gov responded successfully but found no matching notice in the last year.";
    }
    const durationMs = response?.durationMs || 0;
    const attempts = response?.attempts || 1;
    let samDocuments = [];
    if (parsed.opportunitiesData[0]?.resourceLinks) {
      samDocuments = await Promise.all(parsed.opportunitiesData[0].resourceLinks.map(async (link) => {
        let name = "Unnamed Document";
        let url = "#";
        let type = "document";
        if (typeof link === "string") {
          url = link;
          try {
            const u = new URL(link);
            u.searchParams.set("api_key", apiKey2);
            const res = await fetch(u.toString(), { method: "GET", redirect: "manual" });
            const disp = res.headers.get("content-disposition");
            if (disp) {
              const match = disp.match(/filename="?([^"]+)"?/);
              if (match) name = match[1];
            }
          } catch (e) {
            name = "Document (Fetch Failed)";
          }
        } else {
          name = link.name || "Unnamed Document";
          url = link.link || "#";
          type = link.type || "document";
        }
        const isProvided = uploadedFiles.some((file) => file.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(file.toLowerCase()) || file.toLowerCase().includes(name.toLowerCase()));
        return { name, url, type, provided: isProvided };
      }));
    }
    const evidence = parsed.opportunitiesData.map((opportunity, index) => ({
      id: `SAM-${opportunity.noticeId || opportunity.solicitationNumber || index + 1}`,
      type: "EXTERNAL_SOURCE",
      sourceLabel: "SAM.gov Opportunities API",
      sourceRecordId: opportunity.noticeId || opportunity.solicitationNumber || void 0,
      claim: `SAM notice: ${opportunity.title || "Untitled opportunity"}${opportunity.solicitationNumber ? ` (${opportunity.solicitationNumber})` : ""}${opportunity.department ? ` from ${opportunity.department}` : ""}.`,
      confidence: 98,
      retrievedAt,
      url: opportunity.noticeId ? `https://sam.gov/opp/${opportunity.noticeId}/view` : "https://sam.gov/search/"
    }));
    return {
      name: "SAM.gov",
      success: true,
      status: evidence.length ? "SUCCESS" : "ZERO_RESULTS",
      recordsFound: evidence.length,
      evidence,
      message: statusMsg,
      durationMs,
      attempts,
      retrievedAt,
      querySummary,
      samDocuments: samDocuments.length > 0 ? samDocuments : void 0
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : void 0;
    return {
      name: "SAM.gov",
      success: false,
      status: failure?.status || "ERROR",
      recordsFound: 0,
      evidence: [],
      message: error instanceof z.ZodError ? "SAM.gov returned an unexpected response shape." : error instanceof Error ? error.message : "SAM.gov request failed.",
      durationMs: failure?.durationMs || 0,
      attempts: failure?.attempts || 1,
      retrievedAt,
      querySummary
    };
  }
}

// src/adapters/usaspending.ts
import { z as z2 } from "zod";
var awardSchema = z2.object({
  "Award ID": z2.string().nullish(),
  "Recipient Name": z2.string().nullish(),
  "Award Amount": z2.union([z2.number(), z2.string()]).nullish(),
  "Start Date": z2.string().nullish(),
  "End Date": z2.string().nullish(),
  "Awarding Agency": z2.string().nullish(),
  "Awarding Sub Agency": z2.string().nullish(),
  "Award Type": z2.string().nullish(),
  "Description": z2.string().nullish(),
  "NAICS Code": z2.union([z2.string(), z2.number()]).nullish(),
  "Product or Service Code": z2.string().nullish(),
  generated_internal_id: z2.string().nullish()
}).passthrough();
var responseSchema2 = z2.object({
  results: z2.array(awardSchema).default([]),
  page_metadata: z2.object({ page: z2.number().optional(), hasNext: z2.boolean().optional() }).passthrough().optional(),
  messages: z2.array(z2.string()).optional()
}).passthrough();
var isoDate = (date) => date.toISOString().slice(0, 10);
var validNaics = (value) => value?.match(/\b\d{6}\b/)?.[0];
var agencyAliases = [
  [/\bNASA\b|National Aeronautics|Langley/i, { tier: "toptier", name: "National Aeronautics and Space Administration" }],
  [/Food and Drug|\bFDA\b/i, { tier: "subtier", name: "Food and Drug Administration" }],
  [/Air Force|\bAFRL\b/i, { tier: "subtier", name: "Department of the Air Force" }],
  [/\bArmy\b|ACC-/i, { tier: "subtier", name: "Department of the Army" }],
  [/\bNavy\b|NAVSEA|NAVAIR/i, { tier: "subtier", name: "Department of the Navy" }],
  [/Department of Defense|\bDoD\b/i, { tier: "toptier", name: "Department of Defense" }],
  [/Health and Human Services|\bHHS\b/i, { tier: "toptier", name: "Department of Health and Human Services" }]
];
function normalizeAwardingAgency(value) {
  if (!value?.trim()) return void 0;
  return agencyAliases.find(([pattern]) => pattern.test(value))?.[1] || { tier: "toptier", name: value.trim() };
}
var stopWords = /* @__PURE__ */ new Set(["and", "the", "for", "with", "from", "this", "that", "services", "service", "support", "contract", "department"]);
var textTokens = (value) => new Set((value || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stopWords.has(token)));
var overlap = (left, right) => {
  const a = textTokens(left);
  const b = textTokens(right);
  if (!a.size || !b.size) return void 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
};
function awardRelevance(award, deal) {
  const factors = [];
  const targetAgency = normalizeAwardingAgency(deal.agency)?.name;
  const awardAgency = `${award["Awarding Agency"] || ""} ${award["Awarding Sub Agency"] || ""}`;
  factors.push([0.35, overlap(targetAgency, awardAgency)]);
  factors.push([0.35, overlap(`${deal.title} ${deal.scopeSummary}`, award["Description"] || void 0)]);
  const targetNaics = validNaics(deal.naics);
  const awardNaics = validNaics(award["NAICS Code"] ? String(award["NAICS Code"]) : void 0);
  factors.push([0.2, targetNaics && awardNaics ? targetNaics === awardNaics ? 1 : targetNaics.slice(0, 4) === awardNaics.slice(0, 4) ? 0.6 : 0 : void 0]);
  factors.push([0.1, deal.psc && award["Product or Service Code"] ? deal.psc === award["Product or Service Code"] ? 1 : deal.psc.slice(0, 2) === award["Product or Service Code"]?.slice(0, 2) ? 0.6 : 0 : void 0]);
  const covered = factors.reduce((sum, [weight, value]) => sum + (value === void 0 ? 0 : weight), 0);
  return covered ? factors.reduce((sum, [weight, value]) => sum + weight * (value || 0), 0) / covered : 0;
}
function filtersFor(deal, broadened = false) {
  const start2 = /* @__PURE__ */ new Date();
  start2.setUTCFullYear(start2.getUTCFullYear() - 8);
  const filters = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: isoDate(start2), end_date: isoDate(/* @__PURE__ */ new Date()) }]
  };
  const naics = validNaics(deal.naics);
  if (naics) filters.naics_codes = { require: [naics] };
  const agency = normalizeAwardingAgency(deal.agency);
  if (!broadened && agency) {
    filters.agencies = [{ type: "awarding", tier: agency.tier, name: agency.name }];
  }
  return filters;
}
async function search(deal, broadened) {
  const payload = {
    filters: filtersFor(deal, broadened),
    fields: [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Start Date",
      "End Date",
      "Awarding Agency",
      "Awarding Sub Agency",
      "Award Type",
      "Description",
      "NAICS Code",
      "Product or Service Code"
    ],
    page: 1,
    limit: 50,
    subawards: false
  };
  return fetchJsonWithRetry("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  }, { timeoutMs: 15e3, maxAttempts: 3 });
}
async function queryUSASpending(deal) {
  const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
  const naics = validNaics(deal.naics);
  const querySummary = [deal.agency && `agency: ${deal.agency}`, naics && `NAICS: ${naics}`, "8-year contract history"].filter(Boolean).join(" \xB7 ");
  if (!deal.agency?.trim() && !naics) {
    return {
      name: "USAspending",
      success: true,
      status: "ZERO_RESULTS",
      recordsFound: 0,
      evidence: [],
      message: "No agency or valid six-digit NAICS code was available for a defensible award search.",
      durationMs: 0,
      attempts: 0,
      retrievedAt,
      querySummary
    };
  }
  try {
    let response;
    let broadened = false;
    try {
      response = await search(deal, false);
    } catch (error) {
      if (error instanceof ConnectorError && error.status === "INVALID_QUERY" && deal.agency && naics) {
        response = await search(deal, true);
        broadened = true;
      } else {
        throw error;
      }
    }
    let parsed = responseSchema2.parse(response.data);
    if (parsed.results.length === 0 && deal.agency && naics && !broadened) {
      response = await search(deal, true);
      parsed = responseSchema2.parse(response.data);
      broadened = true;
    }
    const ranked = parsed.results.map((award) => ({ award, relevance: awardRelevance(award, deal) })).filter(({ relevance }) => relevance >= 0.45).sort((a, b) => b.relevance - a.relevance).slice(0, 10);
    const evidence = ranked.map(({ award }, index) => {
      const amount = Number(award["Award Amount"] ?? 0);
      const awardId = award["Award ID"] || `record-${index + 1}`;
      const recipient = award["Recipient Name"] || "recipient not reported";
      const startDate = award["Start Date"] ? new Date(award["Start Date"]) : void 0;
      const endDate = award["End Date"] ? new Date(award["End Date"]) : void 0;
      const periodMonths = startDate && endDate && !Number.isNaN(startDate.valueOf()) && !Number.isNaN(endDate.valueOf()) ? Math.max(1, Math.round((endDate.valueOf() - startDate.valueOf()) / (30.4375 * 24 * 60 * 60 * 1e3))) : void 0;
      return {
        id: `USA-${award.generated_internal_id || awardId}`,
        type: "EXTERNAL_SOURCE",
        sourceLabel: "USAspending.gov API",
        sourceRecordId: award.generated_internal_id || awardId,
        claim: `Historical contract award ${awardId} to ${recipient}${Number.isFinite(amount) && amount > 0 ? ` for ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}` : ""}.`,
        confidence: 98,
        numeric: Number.isFinite(amount) && amount > 0 ? {
          originalValue: amount,
          valueType: "CURRENT_AWARD_AMOUNT",
          currency: "USD",
          units: "TOTAL_USD",
          periodMonths,
          baseYear: startDate && !Number.isNaN(startDate.valueOf()) ? startDate.getUTCFullYear() : void 0,
          sourceDate: award["Start Date"] || void 0,
          endDate: award["End Date"] || void 0,
          agency: award["Awarding Sub Agency"] || award["Awarding Agency"] || void 0,
          naics: award["NAICS Code"] ? String(award["NAICS Code"]) : void 0,
          psc: award["Product or Service Code"] || void 0,
          contractType: award["Award Type"] || void 0,
          scopeText: award["Description"] || void 0,
          acquisitionStructure: award["Award Type"] || void 0,
          laborIntensity: "UNKNOWN",
          valueBasis: "INDIVIDUAL_AWARD"
        } : void 0,
        retrievedAt,
        url: award.generated_internal_id ? `https://www.usaspending.gov/award/${award.generated_internal_id}` : "https://www.usaspending.gov/search"
      };
    });
    return {
      name: "USAspending",
      success: true,
      status: evidence.length ? "SUCCESS" : "ZERO_RESULTS",
      recordsFound: evidence.length,
      evidence,
      message: evidence.length ? void 0 : `The query completed successfully but none of ${parsed.results.length} returned awards met the minimum relevance standard.`,
      durationMs: response.durationMs,
      attempts: response.attempts,
      retrievedAt,
      querySummary: `${querySummary}${broadened ? " \xB7 broadened to NAICS" : ""} \xB7 ${evidence.length}/${parsed.results.length} relevance-qualified`
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : void 0;
    return {
      name: "USAspending",
      success: false,
      status: failure?.status || "ERROR",
      recordsFound: 0,
      evidence: [],
      message: error instanceof z2.ZodError ? "USAspending returned an unexpected response shape." : error instanceof Error ? error.message : "USAspending request failed.",
      durationMs: failure?.durationMs || 0,
      attempts: failure?.attempts || 1,
      retrievedAt,
      querySummary
    };
  }
}

// src/adapters/gsa.ts
import { z as z3 } from "zod";
var sourceSchema = z3.object({
  id: z3.union([z3.string(), z3.number()]),
  labor_category: z3.string(),
  current_price: z3.union([z3.number(), z3.string()]),
  next_year_price: z3.union([z3.number(), z3.string()]).nullish(),
  vendor_name: z3.string().nullish(),
  schedule: z3.string().nullish(),
  education_level: z3.string().nullish(),
  min_years_experience: z3.union([z3.number(), z3.string()]).nullish(),
  worksite: z3.string().nullish(),
  security_clearance: z3.boolean().nullish(),
  idv_piid: z3.string().nullish()
}).passthrough();
var responseSchema3 = z3.object({
  hits: z3.object({
    hits: z3.array(z3.object({ _source: sourceSchema }).passthrough()).default([])
  }).passthrough()
}).passthrough();
var usefulTokens = (value) => value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && ![
  "the",
  "and",
  "for",
  "senior",
  "junior",
  "level",
  "personnel",
  "key",
  "lead",
  "specialist"
].includes(token));
var canonicalRoles = [
  [/data scientist/i, "Data Scientist"],
  [/software|application developer|full.?stack/i, "Software Engineer"],
  [/cloud/i, "Cloud Engineer"],
  [/cyber|information security|security engineer/i, "Cybersecurity Engineer"],
  [/systems? engineer/i, "Systems Engineer"],
  [/program manager|project manager/i, "Program Manager"],
  [/business analyst/i, "Business Analyst"],
  [/subject matter expert|\bSME\b/i, "Subject Matter Expert"],
  [/data engineer/i, "Data Engineer"],
  [/solution architect|technical architect/i, "Solution Architect"]
];
function normalizeLaborCategory(value) {
  return canonicalRoles.find(([pattern]) => pattern.test(value))?.[1];
}
async function queryGsaCalc(laborSignals) {
  const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
  const categories = [...new Set((laborSignals || []).map((item) => item.title?.trim()).filter((title) => Boolean(title)).map(normalizeLaborCategory).filter((title) => Boolean(title)))].slice(0, 4);
  const querySummary = categories.length ? `labor categories: ${categories.join(", ")}` : "No sufficiently specific labor category extracted";
  if (!categories.length) {
    return {
      name: "GSA CALC+",
      success: true,
      status: "ZERO_RESULTS",
      recordsFound: 0,
      evidence: [],
      message: "No labor category was available to search.",
      durationMs: 0,
      attempts: 0,
      retrievedAt,
      querySummary
    };
  }
  try {
    const settled = await Promise.allSettled(categories.map(async (category) => {
      const url = `https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/?keyword=${encodeURIComponent(category)}`;
      const response = await fetchJsonWithRetry(url, { headers: { Accept: "application/json" } }, { timeoutMs: 12e3, maxAttempts: 2 });
      const parsed = responseSchema3.parse(response.data);
      const tokens2 = usefulTokens(category);
      const rates = parsed.hits.hits.map((hit) => hit._source).filter((rate) => {
        const normalized = rate.labor_category.toLowerCase();
        const matches = tokens2.filter((token) => normalized.includes(token)).length;
        return tokens2.length > 0 && matches / tokens2.length >= 0.5;
      }).slice(0, 3);
      return { response, rates };
    }));
    const successful = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!successful.length) {
      const firstFailure = settled.find((result) => result.status === "rejected");
      throw firstFailure && firstFailure.status === "rejected" ? firstFailure.reason : new Error("GSA CALC+ searches failed.");
    }
    const comparable = successful.flatMap((result) => result.rates);
    const evidence = comparable.map((rate) => {
      const price = Number(rate.current_price);
      return {
        id: `GSA-${rate.id}`,
        type: "EXTERNAL_SOURCE",
        sourceLabel: "GSA CALC+ API",
        sourceRecordId: String(rate.id),
        claim: `${rate.labor_category} has a current GSA ceiling rate of ${price.toLocaleString("en-US", { style: "currency", currency: "USD" })}/hour${rate.vendor_name ? ` from ${rate.vendor_name}` : ""}${rate.schedule ? ` on ${rate.schedule}` : ""}.`,
        confidence: 96,
        numeric: Number.isFinite(price) && price > 0 ? {
          originalValue: price,
          valueType: "HOURLY_CEILING_RATE",
          currency: "USD",
          units: "USD_PER_HOUR",
          scopeText: rate.labor_category,
          contractType: rate.schedule || void 0,
          technologySecurityLocation: [
            rate.worksite,
            rate.security_clearance ? "security clearance required" : void 0,
            rate.education_level
          ].filter(Boolean).join(" ")
        } : void 0,
        retrievedAt,
        url: "https://buy.gsa.gov/pricing/qr/mas?page=1&page_size=20"
      };
    });
    return {
      name: "GSA CALC+",
      success: true,
      status: evidence.length ? "SUCCESS" : "ZERO_RESULTS",
      recordsFound: evidence.length,
      evidence,
      message: evidence.length ? void 0 : "GSA responded successfully but returned no sufficiently comparable labor categories.",
      durationMs: Math.max(0, ...successful.map((result) => result.response.durationMs)),
      attempts: successful.reduce((sum, result) => sum + result.response.attempts, 0),
      retrievedAt,
      querySummary
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : void 0;
    return {
      name: "GSA CALC+",
      success: false,
      status: failure?.status || "ERROR",
      recordsFound: 0,
      evidence: [],
      message: error instanceof z3.ZodError ? "GSA returned an unexpected response shape." : error instanceof Error ? error.message : "GSA request failed.",
      durationMs: failure?.durationMs || 0,
      attempts: failure?.attempts || 1,
      retrievedAt,
      querySummary
    };
  }
}

// src/adapters/bls.ts
import { z as z4 } from "zod";
var responseSchema4 = z4.object({
  status: z4.string(),
  message: z4.array(z4.string()).default([]),
  Results: z4.object({
    series: z4.array(z4.object({
      seriesID: z4.string(),
      data: z4.array(z4.object({
        year: z4.string(),
        period: z4.string(),
        periodName: z4.string(),
        value: z4.string()
      }).passthrough()).default([])
    }).passthrough()).default([])
  })
}).passthrough();
async function queryBls() {
  const retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
  const currentYear = (/* @__PURE__ */ new Date()).getUTCFullYear();
  const seriesId = "CIU1010000000000A";
  const querySummary = `Employment Cost Index \xB7 ${currentYear - 2}\u2013${currentYear}`;
  try {
    const payload = {
      seriesid: [seriesId],
      startyear: String(currentYear - 2),
      endyear: String(currentYear)
    };
    if (process.env.BLS_API_KEY) payload.registrationkey = process.env.BLS_API_KEY;
    const response = await fetchJsonWithRetry("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }, { timeoutMs: 12e3, maxAttempts: 3 });
    const parsed = responseSchema4.parse(response.data);
    if (parsed.status !== "REQUEST_SUCCEEDED") throw new Error(parsed.message.join(" ") || `BLS returned status ${parsed.status}.`);
    const points = parsed.Results.series[0]?.data || [];
    const latest = points[0];
    const evidence = latest ? [{
      id: `BLS-${seriesId}-${latest.year}-${latest.period}`,
      type: "EXTERNAL_SOURCE",
      sourceLabel: "BLS Public Data API",
      sourceRecordId: seriesId,
      claim: `Employment Cost Index 12-month change for civilian workers was ${latest.value}% in ${latest.periodName} ${latest.year}.`,
      confidence: 99,
      numeric: {
        originalValue: Number(latest.value),
        valueType: "ESCALATION_RATE",
        currency: "UNKNOWN",
        units: "PERCENT",
        baseYear: Number(latest.year),
        sourceDate: `${latest.year}-12-31`,
        scopeText: "Employment Cost Index for civilian workers"
      },
      retrievedAt,
      url: "https://www.bls.gov/eci/"
    }] : [];
    return {
      name: "BLS",
      success: true,
      status: evidence.length ? "SUCCESS" : "ZERO_RESULTS",
      recordsFound: points.length,
      evidence,
      message: evidence.length ? void 0 : "BLS returned no observations for the requested period.",
      durationMs: response.durationMs,
      attempts: response.attempts,
      retrievedAt,
      querySummary
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : void 0;
    return {
      name: "BLS",
      success: false,
      status: failure?.status || "ERROR",
      recordsFound: 0,
      evidence: [],
      message: error instanceof z4.ZodError ? "BLS returned an unexpected response shape." : error instanceof Error ? error.message : "BLS request failed.",
      durationMs: failure?.durationMs || 0,
      attempts: failure?.attempts || 1,
      retrievedAt,
      querySummary
    };
  }
}

// src/domain/marketPosition/engineConfig.ts
var MARKET_POSITION_ENGINE_VERSION = "market-position-v2.1.0";
var COMPARABILITY_WEIGHTS = {
  scope: 0.25,
  scale: 0.15,
  acquisition: 0.15,
  customer: 0.1,
  period: 0.1,
  naicsPsc: 0.1,
  laborIntensity: 0.05,
  recency: 0.05,
  technologySecurityLocation: 0.05
};
var ENGINE_THRESHOLDS = {
  minimumComparability: 0.55,
  minimumEvidenceQuality: 0.65,
  minimumNormalizationConfidence: 0.65,
  supportedReadiness: 60,
  directionalReadiness: 45,
  minimumRangeWidth: 0.05,
  maximumRangeWidth: 0.4,
  oneAnchorMinimumRangeWidth: 0.2,
  twoAnchorMinimumRangeWidth: 0.12
};

// src/domain/marketPosition/valueNormalization.ts
var CENTRAL_VALUE_TYPES = /* @__PURE__ */ new Set([
  "EVALUATED_PRICE",
  "ESTIMATED_VALUE",
  "TOTAL_AWARD_VALUE",
  "EVENTUAL_SPEND"
]);
function extractPeriodMonths(value) {
  if (!value) return void 0;
  const normalized = value.toLowerCase().replace(/,/g, "");
  const months = normalized.match(/(\d+(?:\.\d+)?)\s*(?:month|months|mo\b)/);
  if (months) return Number(months[1]);
  const years = normalized.match(/(\d+(?:\.\d+)?)\s*(?:year|years|yr\b)/);
  if (years) return Number(years[1]) * 12;
  return void 0;
}
function determineCalculationRole(numeric, asOfDate) {
  if (!Number.isFinite(numeric.originalValue) || numeric.originalValue <= 0) return "EXCLUDED";
  if (numeric.currency !== "USD" && numeric.units !== "PERCENT") return "EXCLUDED";
  if (numeric.sharedAcrossAwards) return "EXCLUDED";
  if (numeric.valueBasis === "PAST_PERFORMANCE_THRESHOLD") return "EXCLUDED";
  if (numeric.valueBasis === "ORDER_LIMIT") return "CONTEXT";
  if (["PROGRAM_TOTAL", "MULTIPLE_AWARD_POOL", "BUDGET"].includes(numeric.valueBasis || "")) return "CONTEXT";
  if (CENTRAL_VALUE_TYPES.has(numeric.valueType)) return numeric.units === "TOTAL_USD" ? "CENTRAL_ANCHOR" : "EXCLUDED";
  if (numeric.valueType === "CURRENT_AWARD_AMOUNT") {
    const completed = numeric.endDate && Date.parse(numeric.endDate) <= Date.parse(asOfDate);
    return completed && numeric.units === "TOTAL_USD" ? "CENTRAL_ANCHOR" : "CONTEXT";
  }
  if (numeric.valueType === "CONTRACT_CEILING") {
    const compatibleBasis = numeric.valueBasis === "OPPORTUNITY_TOTAL" || numeric.valueBasis === "INDIVIDUAL_AWARD";
    return numeric.units === "TOTAL_USD" && numeric.opportunitySpecific && compatibleBasis ? "CONSTRAINT" : "CONTEXT";
  }
  if (numeric.valueType === "HOURLY_CEILING_RATE") return "COMPONENT";
  if (numeric.valueType === "ESCALATION_RATE") return "MODIFIER";
  if (["INITIAL_OBLIGATION", "CURRENT_OBLIGATIONS", "BUDGET_CONTEXT"].includes(numeric.valueType)) return "CONTEXT";
  return "EXCLUDED";
}
function normalizeNumericEvidence(evidence, deal, allEvidence, asOfDate) {
  const numeric = evidence.numeric;
  if (!numeric || !Number.isFinite(numeric.originalValue) || numeric.originalValue <= 0) {
    return { normalizedValue: null, confidence: 0, steps: [], notes: ["Numeric value is missing or invalid."] };
  }
  if (numeric.units !== "TOTAL_USD" || numeric.currency !== "USD") {
    return {
      normalizedValue: numeric.originalValue,
      confidence: 1,
      steps: [],
      notes: ["Retained in its native units and barred from total-value weighting."]
    };
  }
  let value = numeric.originalValue;
  let confidence = numeric.opportunitySpecific ? 1 : 0.95;
  const steps = [];
  const notes = [];
  const targetMonths = extractPeriodMonths(deal.periodOfPerformance);
  if (numeric.periodMonths && targetMonths && numeric.periodMonths !== targetMonths) {
    if (numeric.recurringService) {
      const factor = targetMonths / numeric.periodMonths;
      value *= factor;
      confidence *= 0.95;
      steps.push({
        type: "PERIOD",
        factor,
        rationale: `Recurring service value normalized from ${numeric.periodMonths} to ${targetMonths} months.`,
        evidenceIds: [evidence.id]
      });
    } else {
      confidence *= 0.72;
      notes.push("Period differs from the target and could not be normalized without assuming steady-state services.");
    }
  } else if (!numeric.opportunitySpecific && (!numeric.periodMonths || !targetMonths)) {
    confidence *= 0.85;
    notes.push("Period normalization was not possible because one period was unavailable.");
  }
  if (numeric.quantity && numeric.targetQuantity && numeric.quantity !== numeric.targetQuantity) {
    if (numeric.scalableByQuantity) {
      const factor = numeric.targetQuantity / numeric.quantity;
      value *= factor;
      confidence *= 0.95;
      steps.push({
        type: "QUANTITY",
        factor,
        rationale: `Value normalized from quantity ${numeric.quantity} to ${numeric.targetQuantity}.`,
        evidenceIds: [evidence.id]
      });
    } else {
      confidence *= 0.75;
      notes.push("Scale differs from the target and no evidence supports linear quantity scaling.");
    }
  }
  const targetYear = new Date(asOfDate).getUTCFullYear();
  if (numeric.baseYear && numeric.baseYear < targetYear) {
    const yearDifference = targetYear - numeric.baseYear;
    const escalation = allEvidence.find(
      (item) => item.numeric?.valueType === "ESCALATION_RATE" && item.numeric.units === "PERCENT" && item.numeric.originalValue > 0 && item.numeric.originalValue < 20
    );
    if (escalation?.numeric && yearDifference <= 3) {
      const factor = (1 + escalation.numeric.originalValue / 100) ** yearDifference;
      value *= factor;
      confidence *= 0.93;
      steps.push({
        type: "ESCALATION",
        factor,
        rationale: `Escalated ${yearDifference} year${yearDifference === 1 ? "" : "s"} using the cited BLS change rate.`,
        evidenceIds: [evidence.id, escalation.id]
      });
    } else if (yearDifference > 1) {
      confidence *= 0.8;
      notes.push("The value year differs from the analysis year and no sufficiently applicable escalation series was available.");
    }
  }
  return {
    normalizedValue: Number.isFinite(value) ? value : null,
    confidence: Math.max(0, Math.min(1, confidence)),
    steps,
    notes
  };
}

// src/domain/marketPosition/comparability.ts
var STOP_WORDS = /* @__PURE__ */ new Set(["and", "the", "for", "with", "from", "this", "that", "services", "service", "support", "contract"]);
function tokens(value) {
  return new Set((value || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}
function overlapScore(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return null;
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = (/* @__PURE__ */ new Set([...a, ...b])).size;
  return Math.min(1, shared / union * 4);
}
function exactOrOverlap(left, right) {
  if (!left?.trim() || !right?.trim()) return null;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return overlapScore(a, b);
}
function periodScore(sourceMonths, targetMonths) {
  if (!sourceMonths || !targetMonths) return null;
  return Math.min(sourceMonths, targetMonths) / Math.max(sourceMonths, targetMonths);
}
function scaleScore(source, target) {
  if (!source || !target || source <= 0 || target <= 0) return null;
  return Math.min(source, target) / Math.max(source, target);
}
function naicsPscScore(numeric, deal) {
  const sourceNaics = numeric.naics?.replace(/\D/g, "");
  const targetNaics = deal.naics?.replace(/\D/g, "");
  if (sourceNaics && targetNaics) {
    if (sourceNaics === targetNaics) return 1;
    if (sourceNaics.slice(0, 4) === targetNaics.slice(0, 4)) return 0.7;
    return 0.1;
  }
  if (numeric.psc && deal.psc) {
    if (numeric.psc === deal.psc) return 1;
    if (numeric.psc.slice(0, 2) === deal.psc.slice(0, 2)) return 0.6;
    return 0.1;
  }
  return null;
}
function targetLaborIntensity(deal) {
  const quantity = deal.laborSignals.reduce((sum, item) => sum + (item.quantity || 0), 0);
  if (quantity >= 25 || deal.laborSignals.length >= 8) return "HIGH";
  if (quantity > 0 || deal.laborSignals.length > 0) return "MEDIUM";
  return "UNKNOWN";
}
function laborScore(source, target) {
  if (!source || source === "UNKNOWN" || !target || target === "UNKNOWN") return null;
  if (source === target) return 1;
  if (source === "LOW" && target === "HIGH" || source === "HIGH" && target === "LOW") return 0.2;
  return 0.65;
}
function recencyScore(sourceDate, asOfDate) {
  if (!sourceDate || Number.isNaN(Date.parse(sourceDate))) return null;
  const years = Math.max(0, (Date.parse(asOfDate) - Date.parse(sourceDate)) / (365.25 * 24 * 60 * 60 * 1e3));
  if (years <= 2) return 1;
  if (years <= 4) return 0.8;
  if (years <= 6) return 0.6;
  if (years <= 8) return 0.4;
  return 0.2;
}
function scoreComparability(evidence, deal, asOfDate) {
  const numeric = evidence.numeric;
  if (!numeric) {
    const breakdown2 = {
      scope: null,
      scale: null,
      acquisition: null,
      customer: null,
      period: null,
      naicsPsc: null,
      laborIntensity: null,
      recency: null,
      technologySecurityLocation: null,
      coverage: 0
    };
    return { score: 0, breakdown: breakdown2 };
  }
  if (numeric.opportunitySpecific) {
    const breakdown2 = {
      scope: 1,
      scale: 1,
      acquisition: 1,
      customer: 1,
      period: 1,
      naicsPsc: 1,
      laborIntensity: 1,
      recency: 1,
      technologySecurityLocation: 1,
      coverage: 1
    };
    return { score: 1, breakdown: breakdown2 };
  }
  const dealTechContext = [
    deal.scopeSummary,
    ...deal.laborSignals.map((item) => [item.location, item.clearance].filter(Boolean).join(" "))
  ].join(" ");
  const breakdown = {
    scope: overlapScore(numeric.scopeText, `${deal.title} ${deal.scopeSummary}`),
    scale: scaleScore(numeric.quantity, numeric.targetQuantity),
    acquisition: exactOrOverlap(numeric.contractType || numeric.acquisitionStructure, `${deal.contractType} ${deal.awardStructure}`),
    customer: exactOrOverlap(numeric.agency, deal.agency),
    period: periodScore(numeric.periodMonths, extractPeriodMonths(deal.periodOfPerformance)),
    naicsPsc: naicsPscScore(numeric, deal),
    laborIntensity: laborScore(numeric.laborIntensity, targetLaborIntensity(deal)),
    recency: recencyScore(numeric.sourceDate, asOfDate),
    technologySecurityLocation: overlapScore(numeric.technologySecurityLocation, dealTechContext),
    coverage: 0
  };
  let coveredWeight = 0;
  let weightedSimilarity = 0;
  for (const [factor, weight] of Object.entries(COMPARABILITY_WEIGHTS)) {
    const value = breakdown[factor];
    if (typeof value === "number") {
      coveredWeight += weight;
      weightedSimilarity += weight * value;
    }
  }
  breakdown.coverage = coveredWeight;
  const similarity = coveredWeight > 0 ? weightedSimilarity / coveredWeight : 0;
  const score = similarity * Math.sqrt(coveredWeight);
  return { score: Math.max(0, Math.min(1, score)), breakdown };
}
function scoreEvidenceQuality(evidence) {
  const numeric = evidence.numeric;
  if (!numeric) return 0;
  const authority = evidence.type === "SOLICITATION_FACT" ? 1 : evidence.type === "EXTERNAL_SOURCE" ? 0.92 : evidence.type === "ANALYST_INFERENCE" ? 0.35 : 0;
  const clarity = numeric.valueType === "UNKNOWN" || numeric.units === "OTHER" ? 0.2 : 1;
  const lineageFields = [evidence.sourceRecordId, evidence.section, evidence.url, evidence.retrievedAt].filter(Boolean).length;
  const lineage = Math.min(1, 0.35 + lineageFields * 0.18);
  const completenessFields = [
    numeric.units,
    numeric.valueType,
    numeric.periodMonths,
    numeric.agency,
    numeric.naics || numeric.psc,
    numeric.scopeText
  ].filter((value) => value !== void 0 && value !== "" && value !== "UNKNOWN").length;
  const completeness = Math.min(1, 0.35 + completenessFields * 0.11);
  return Math.max(0, Math.min(1, authority * 0.4 + clarity * 0.25 + lineage * 0.2 + completeness * 0.15));
}

// src/domain/marketPosition/readiness.ts
var weightedAverage = (anchors, field) => {
  const totalWeight = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (totalWeight <= 0) return 0;
  return anchors.reduce((sum, anchor) => sum + anchor[field] * anchor.weight, 0) / totalWeight;
};
function effectiveSampleSize(anchors) {
  const sum = anchors.reduce((total, anchor) => total + anchor.weight, 0);
  const squared = anchors.reduce((total, anchor) => total + anchor.weight ** 2, 0);
  return squared > 0 ? sum ** 2 / squared : 0;
}
function calculateEvidenceReadiness(anchors, gaps, dispersion) {
  const effectiveQuantity = Math.min(1, effectiveSampleSize(anchors) / 3);
  const sourceDiversity = Math.min(1, new Set(anchors.map((anchor) => anchor.sourceLabel)).size / 3);
  const consistency = anchors.length ? Math.max(0, 1 - dispersion / 0.5) : 0;
  const highGaps = gaps.filter((gap) => gap.priority === "HIGH").length;
  const gapResolution = anchors.length === 0 && gaps.length === 0 ? 0 : 1 - Math.min(1, highGaps / 4);
  const comparability = weightedAverage(anchors, "comparabilityScore");
  const evidenceQuality = weightedAverage(anchors, "evidenceQuality");
  const normalizationConfidence = weightedAverage(anchors, "normalizationConfidence");
  const readiness = comparability * 0.25 + evidenceQuality * 0.2 + normalizationConfidence * 0.15 + effectiveQuantity * 0.15 + sourceDiversity * 0.1 + consistency * 0.1 + gapResolution * 0.05;
  const percent = (value) => Math.round(value * 100);
  return {
    score: percent(readiness),
    comparability: percent(comparability),
    evidenceQuality: percent(evidenceQuality),
    normalizationConfidence: percent(normalizationConfidence),
    effectiveQuantity: percent(effectiveQuantity),
    sourceDiversity: percent(sourceDiversity),
    consistency: percent(consistency),
    gapResolution: percent(gapResolution)
  };
}

// src/domain/marketPosition/scenarioEngine.ts
var roundCurrency = (value) => Math.round(value);
var roundScore = (value) => Math.round(value * 100) / 100;
var clamp = (minimum, maximum, value) => Math.min(maximum, Math.max(minimum, value));
function legacyNumericEvidence(evidence) {
  if (evidence.numeric) return evidence.numeric;
  if (!Number.isFinite(evidence.value) || !evidence.value || evidence.value <= 0) return void 0;
  return {
    originalValue: evidence.value,
    valueType: "UNKNOWN",
    currency: evidence.units?.toLowerCase().includes("usd") ? "USD" : "UNKNOWN",
    units: "OTHER"
  };
}
function evaluateAnchor(original, draft, options) {
  const numeric = legacyNumericEvidence(original);
  if (!numeric) return null;
  const evidence = original.numeric ? original : { ...original, numeric };
  const role = determineCalculationRole(numeric, options.asOfDate);
  const comparability = scoreComparability(evidence, draft.deal, options.asOfDate);
  const evidenceQuality = scoreEvidenceQuality(evidence);
  const normalization = normalizeNumericEvidence(evidence, draft.deal, draft.evidence, options.asOfDate);
  const exclusionReasons = [...normalization.notes];
  if (numeric.sharedAcrossAwards) exclusionReasons.push("Shared or multiple-award ceiling cannot represent one award price.");
  if (role === "COMPONENT") exclusionReasons.push("Component rate requires a supported staffing-and-hours model before it can become a total-value anchor.");
  if (role === "MODIFIER") exclusionReasons.push("Escalation evidence may normalize another value but is not a dollar anchor.");
  if (role === "CONTEXT") exclusionReasons.push("Funding or budget context is not a like-for-like total evaluated price.");
  if (role === "CONSTRAINT") exclusionReasons.push("A ceiling can constrain the range but cannot determine Expected by itself.");
  if (role === "EXCLUDED") exclusionReasons.push("Value type or units are not eligible for total-value weighting.");
  if (role === "CENTRAL_ANCHOR" && comparability.score < ENGINE_THRESHOLDS.minimumComparability) {
    exclusionReasons.push(`Comparability ${Math.round(comparability.score * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumComparability * 100)} inclusion threshold.`);
  }
  if (role === "CENTRAL_ANCHOR" && evidenceQuality < ENGINE_THRESHOLDS.minimumEvidenceQuality) {
    exclusionReasons.push(`Evidence quality ${Math.round(evidenceQuality * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumEvidenceQuality * 100)} inclusion threshold.`);
  }
  if (role === "CENTRAL_ANCHOR" && normalization.confidence < ENGINE_THRESHOLDS.minimumNormalizationConfidence) {
    exclusionReasons.push(`Normalization confidence ${Math.round(normalization.confidence * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumNormalizationConfidence * 100)} inclusion threshold.`);
  }
  if (normalization.normalizedValue === null) exclusionReasons.push("No valid normalized value is available.");
  const included = role === "CENTRAL_ANCHOR" && normalization.normalizedValue !== null && !numeric.sharedAcrossAwards && comparability.score >= ENGINE_THRESHOLDS.minimumComparability && evidenceQuality >= ENGINE_THRESHOLDS.minimumEvidenceQuality && normalization.confidence >= ENGINE_THRESHOLDS.minimumNormalizationConfidence;
  const weight = included ? comparability.score ** 2 * evidenceQuality * normalization.confidence : 0;
  return {
    id: `ANCHOR-${evidence.id}`,
    evidenceId: evidence.id,
    sourceLabel: evidence.sourceLabel,
    originalValue: numeric.originalValue,
    normalizedValue: normalization.normalizedValue,
    valueType: numeric.valueType,
    units: numeric.units,
    role,
    comparabilityScore: roundScore(comparability.score),
    comparability: { ...comparability.breakdown, coverage: roundScore(comparability.breakdown.coverage) },
    evidenceQuality: roundScore(evidenceQuality),
    normalizationConfidence: roundScore(normalization.confidence),
    weight: roundScore(weight),
    included,
    inclusionRationale: included ? "Eligible total-value evidence met comparability, quality, and normalization thresholds." : void 0,
    exclusionReasons: [...new Set(exclusionReasons)],
    normalizationSteps: normalization.steps,
    evidenceIds: [.../* @__PURE__ */ new Set([evidence.id, ...normalization.steps.flatMap((step) => step.evidenceIds)])],
    valueBasis: numeric.valueBasis,
    rangeBound: numeric.rangeBound,
    rangeId: numeric.rangeId
  };
}
function insufficientPosition(draft, anchors, readiness, rangeFactors) {
  return {
    currency: "USD",
    aggressive: null,
    expected: null,
    conservative: null,
    rangeStatus: "INSUFFICIENT_EVIDENCE",
    posture: "UNDETERMINED",
    summary: draft.marketAssessment.summary,
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    evidenceReadiness: readiness,
    anchors,
    effectiveSampleSize: 0,
    dispersionPct: 0,
    rangeWidthPct: 0,
    constraints: [],
    rangeFactors,
    assumptions: ["Only comparable total-value anchors may generate an authoritative Market Position."],
    basis: draft.marketAssessment.basis,
    drivers: draft.marketAssessment.drivers
  };
}
function calculateDeterministicScenarios(draft, options) {
  if (!options.asOfDate || Number.isNaN(Date.parse(options.asOfDate))) {
    throw new Error("A valid as-of date is required for deterministic Market Position calculations.");
  }
  const anchors = draft.evidence.map((evidence) => evaluateAnchor(evidence, draft, options)).filter((anchor) => Boolean(anchor));
  const included = anchors.filter((anchor) => anchor.included && anchor.normalizedValue !== null);
  if (!included.length) {
    const readiness2 = calculateEvidenceReadiness([], draft.gaps, 0);
    return insufficientPosition(
      draft,
      anchors,
      readiness2,
      ["No numeric evidence met the like-for-like inclusion rules."]
    );
  }
  const totalWeight = included.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (totalWeight <= 0) {
    const readiness2 = calculateEvidenceReadiness([], draft.gaps, 0);
    return insufficientPosition(draft, anchors, readiness2, ["Eligible anchors had no effective deterministic weight."]);
  }
  const expectedRaw = included.reduce((sum, anchor) => sum + (anchor.normalizedValue || 0) * anchor.weight, 0) / totalWeight;
  const dispersion = included.reduce(
    (sum, anchor) => sum + anchor.weight * Math.abs((anchor.normalizedValue || 0) - expectedRaw) / expectedRaw,
    0
  ) / totalWeight;
  const readiness = calculateEvidenceReadiness(included, draft.gaps, dispersion);
  const sampleSize = effectiveSampleSize(included);
  let status = included.length >= 2 && sampleSize >= 1.4 && readiness.score >= ENGINE_THRESHOLDS.supportedReadiness ? "SUPPORTED" : readiness.score >= ENGINE_THRESHOLDS.directionalReadiness ? "DIRECTIONAL" : "INSUFFICIENT_EVIDENCE";
  if (included.length === 1) {
    const single = included[0];
    const exceptionallyStrong = single.comparabilityScore >= 0.65 && single.evidenceQuality >= 0.65 && single.normalizationConfidence >= 0.65;
    status = exceptionallyStrong ? "DIRECTIONAL" : "INSUFFICIENT_EVIDENCE";
  }
  if (status === "INSUFFICIENT_EVIDENCE") {
    return insufficientPosition(
      draft,
      anchors,
      readiness,
      ["Eligible evidence remains too sparse or weak to support a defensible numeric position."]
    );
  }
  let rangeWidth = clamp(
    ENGINE_THRESHOLDS.minimumRangeWidth,
    ENGINE_THRESHOLDS.maximumRangeWidth,
    dispersion + 0.25 * (1 - readiness.score / 100)
  );
  if (included.length === 1) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.oneAnchorMinimumRangeWidth);
  if (included.length === 2) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.twoAnchorMinimumRangeWidth);
  let expected = expectedRaw;
  let aggressive = expected * (1 - rangeWidth);
  let conservative = expected * (1 + rangeWidth);
  const constraints = [];
  const rangeFactors = [
    `${included.length} eligible total-value anchor${included.length === 1 ? "" : "s"} produced an effective sample size of ${sampleSize.toFixed(2)}.`,
    `Weighted anchor dispersion was ${Math.round(dispersion * 100)}%.`,
    `Evidence Readiness was ${readiness.score}/100.`
  ];
  const officialRanges = /* @__PURE__ */ new Map();
  for (const anchor of included) {
    if (!anchor.rangeId || !anchor.rangeBound || anchor.valueBasis !== "INDIVIDUAL_AWARD") continue;
    officialRanges.set(anchor.rangeId, [...officialRanges.get(anchor.rangeId) || [], anchor]);
  }
  const supportedOfficialRange = [...officialRanges.values()].find(
    (items) => items.some((item) => item.rangeBound === "LOW") && items.some((item) => item.rangeBound === "HIGH")
  );
  if (supportedOfficialRange) {
    const low = supportedOfficialRange.find((item) => item.rangeBound === "LOW")?.normalizedValue;
    const high = supportedOfficialRange.find((item) => item.rangeBound === "HIGH")?.normalizedValue;
    if (low !== null && low !== void 0 && high !== null && high !== void 0 && low <= high) {
      aggressive = low;
      conservative = high;
      expected = clamp(low, high, expected);
      rangeFactors.push("A solicitation-stated individual-award range directly bounded Aggressive and Conservative.");
    }
  }
  const applicableCeilings = anchors.filter(
    (anchor) => anchor.role === "CONSTRAINT" && anchor.normalizedValue !== null && anchor.comparabilityScore >= 0.8 && anchor.evidenceQuality >= 0.65
  );
  if (applicableCeilings.length) {
    const ceiling = Math.min(...applicableCeilings.map((anchor) => anchor.normalizedValue));
    constraints.push(`Verified opportunity ceiling of ${ceiling.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} applied as an upper constraint.`);
    if (ceiling < Math.min(...included.map((anchor) => anchor.normalizedValue)) * 0.75) {
      return insufficientPosition(
        draft,
        anchors,
        { ...readiness, score: Math.min(readiness.score, 44) },
        [...rangeFactors, "Comparable evidence materially conflicts with the verified opportunity ceiling."]
      );
    }
    if (expected > ceiling) {
      return insufficientPosition(
        draft,
        anchors,
        { ...readiness, score: Math.min(readiness.score, 44) },
        [...rangeFactors, "The weighted evidence exceeds a verified compatible ceiling, indicating unlike value bases or unresolved conflict."]
      );
    }
    conservative = Math.min(conservative, ceiling);
  }
  aggressive = Math.min(aggressive, expected);
  conservative = Math.max(conservative, expected);
  const assumptions = [
    "Only evidence normalized to total USD on a compatible opportunity basis influenced Expected.",
    "Qualitative competitive intelligence did not add or subtract an arbitrary percentage.",
    ...included.flatMap((anchor) => anchor.normalizationSteps.map((step) => step.rationale))
  ];
  return {
    currency: "USD",
    aggressive: roundCurrency(aggressive),
    expected: roundCurrency(expected),
    conservative: roundCurrency(conservative),
    rangeStatus: status,
    posture: draft.marketAssessment.posture,
    summary: draft.marketAssessment.summary,
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    evidenceReadiness: readiness,
    anchors,
    effectiveSampleSize: roundScore(sampleSize),
    dispersionPct: Math.round(dispersion * 100),
    rangeWidthPct: Math.round(rangeWidth * 100),
    constraints,
    rangeFactors,
    assumptions: [...new Set(assumptions)],
    basis: draft.marketAssessment.basis,
    drivers: draft.marketAssessment.drivers
  };
}

// src/domain/marketPosition/evidenceClassification.ts
function stableRangeId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `RANGE-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function classifyNumericEvidence(items) {
  for (const item of items) {
    const numeric = item.numeric;
    if (!numeric) continue;
    const claim = `${item.claim} ${item.section || ""}`.toLowerCase();
    if (/past performance|relevant experience/.test(claim) && /minimum|at least|threshold/.test(claim)) {
      numeric.valueBasis = "PAST_PERFORMANCE_THRESHOLD";
    } else if (/minimum order|maximum order|order limitation/.test(claim)) {
      numeric.valueBasis = "ORDER_LIMIT";
    } else if (/individual (?:awards?|contracts?)|each award|single award/.test(claim)) {
      numeric.valueBasis = "INDIVIDUAL_AWARD";
      numeric.opportunitySpecific = true;
    } else if (/total estimated funding|program(?:-wide)? funding|portfolio funding|anticipated funding for fy|annual funding/.test(claim)) {
      numeric.valueBasis = /multiple awards?|pool/.test(claim) ? "MULTIPLE_AWARD_POOL" : "PROGRAM_TOTAL";
    } else if (numeric.valueType === "BUDGET_CONTEXT") {
      numeric.valueBasis = "BUDGET";
    } else if (numeric.opportunitySpecific && numeric.units === "TOTAL_USD" && !numeric.valueBasis) {
      numeric.valueBasis = "OPPORTUNITY_TOTAL";
    } else {
      numeric.valueBasis ||= "UNKNOWN";
    }
  }
  const rangeGroups = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (!item.numeric || item.numeric.valueBasis !== "INDIVIDUAL_AWARD") continue;
    if (!/range|between|from.+to/.test(item.claim.toLowerCase())) continue;
    const key = `${item.sourceLabel}|${item.section || ""}|${item.claim.toLowerCase().replace(/\$?[\d,.]+/g, "#")}`;
    rangeGroups.set(key, [...rangeGroups.get(key) || [], item]);
  }
  for (const [key, group] of rangeGroups) {
    const ordered = group.filter((item) => item.numeric).sort((a, b) => (a.numeric?.originalValue || 0) - (b.numeric?.originalValue || 0));
    if (ordered.length < 2) continue;
    const rangeId = stableRangeId(key);
    ordered[0].numeric.rangeBound = "LOW";
    ordered[0].numeric.rangeId = rangeId;
    ordered[ordered.length - 1].numeric.rangeBound = "HIGH";
    ordered[ordered.length - 1].numeric.rangeId = rangeId;
  }
}

// src/domain/marketPosition/authoritative.ts
var currencyClaim = /(?:\$\s?\d[\d,.]*(?:\s?(?:million|billion|m|b))?|\bUSD\s+\d[\d,.]*|\b\d+(?:\.\d+)?\s*(?:million|billion)\b|\b\d{1,3}(?:,\d{3}){2,}\b)/gi;
function scrubText(value) {
  return value.replace(currencyClaim, "the calculated Market Position");
}
function sanitizeNarrative(narrative) {
  return {
    headline: scrubText(narrative.headline || "Evidence-led Market Position"),
    rationale: scrubText(narrative.rationale || "Review the authoritative calculation and its evidence."),
    decisionFactors: (narrative.decisionFactors || []).map(scrubText),
    guardrails: (narrative.guardrails || []).map(scrubText),
    nextActions: (narrative.nextActions || []).map(scrubText)
  };
}
function sanitizeMarketAssessment(assessment) {
  return {
    posture: assessment.posture || "UNDETERMINED",
    summary: scrubText(assessment.summary || "Review the authoritative calculation and its evidence."),
    basis: (assessment.basis || []).map(scrubText),
    drivers: normalizeDrivers(assessment.drivers).map((driver) => ({
      ...driver,
      name: scrubText(driver.name),
      assessment: scrubText(driver.assessment)
    }))
  };
}
function normalizeDrivers(drivers) {
  if (!Array.isArray(drivers)) return [];
  return drivers.map((driver) => {
    const item = driver;
    return {
      name: String(item.name || "Analytical factor"),
      assessment: String(item.assessment || ""),
      evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : [],
      inference: item.inference ?? true
    };
  });
}
function marketAssessmentFromPosition(position) {
  return sanitizeMarketAssessment({
    posture: position.posture || "UNDETERMINED",
    summary: position.summary || "Legacy analysis requires recalculation under the current methodology.",
    basis: Array.isArray(position.basis) ? position.basis.map(String) : [],
    drivers: normalizeDrivers(position.drivers)
  });
}
function createLegacyPosition(position = {}) {
  return {
    currency: "USD",
    aggressive: null,
    expected: null,
    conservative: null,
    rangeStatus: "LEGACY_RECALCULATION_REQUIRED",
    posture: "UNDETERMINED",
    summary: position.summary || "This saved run predates the evidence-weighted calculation engine.",
    formulaVersion: "legacy-unverified",
    evidenceReadiness: {
      score: 0,
      comparability: 0,
      evidenceQuality: 0,
      normalizationConfidence: 0,
      effectiveQuantity: 0,
      sourceDiversity: 0,
      consistency: 0,
      gapResolution: 0
    },
    anchors: [],
    effectiveSampleSize: 0,
    dispersionPct: 0,
    rangeWidthPct: 0,
    constraints: [],
    rangeFactors: ["Recalculate this run before using its numeric Market Position."],
    assumptions: [],
    basis: Array.isArray(position.basis) ? position.basis.map(String) : [],
    drivers: normalizeDrivers(position.drivers)
  };
}
function enforceAuthoritativeAnalysis(analysis) {
  const analyzedAt = analysis.meta?.analyzedAt;
  if (!analyzedAt || Number.isNaN(Date.parse(analyzedAt))) {
    throw new Error("Analysis metadata must include a valid analyzedAt date.");
  }
  const currentPosition = analysis.marketPosition || createLegacyPosition();
  const marketAssessment = marketAssessmentFromPosition(currentPosition);
  const marketPosition = calculateDeterministicScenarios({
    deal: analysis.deal,
    evidence: analysis.evidence || [],
    gaps: analysis.gaps || [],
    marketAssessment
  }, { asOfDate: analyzedAt });
  return {
    ...analysis,
    marketPosition,
    narrative: sanitizeNarrative(analysis.narrative || {
      headline: "Evidence-led Market Position",
      rationale: "Review the authoritative calculation and its evidence.",
      decisionFactors: [],
      guardrails: [],
      nextActions: []
    }),
    meta: {
      ...analysis.meta,
      warnings: [...new Set(analysis.meta.warnings || [])]
    }
  };
}
function isCurrentEngine(position) {
  return position?.formulaVersion === MARKET_POSITION_ENGINE_VERSION;
}

// server.ts
var app = express();
var port = Number(process.env.PORT || 3e3);
var model = process.env.GEMINI_MODEL || "gemini-2.5-pro";
var apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 10 }
});
app.use(express.json({ limit: "5mb" }));
function aiClient() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  return new GoogleGenAI({ apiKey });
}
function parseJson(text) {
  if (!text) throw new Error("The AI returned an empty response.");
  const cleaned = text.replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/i, "").trim();
  const start2 = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start2 < 0 || end < start2) throw new Error("The AI response was not valid JSON.");
  return JSON.parse(cleaned.slice(start2, end + 1));
}
var stringArray = { type: "ARRAY", items: { type: "STRING" } };
var numericEvidenceSchema = {
  type: "OBJECT",
  properties: {
    originalValue: { type: "NUMBER" },
    valueType: { type: "STRING" },
    currency: { type: "STRING" },
    units: { type: "STRING" },
    periodMonths: { type: "NUMBER" },
    baseYear: { type: "NUMBER" },
    quantity: { type: "NUMBER" },
    targetQuantity: { type: "NUMBER" },
    sourceDate: { type: "STRING" },
    endDate: { type: "STRING" },
    agency: { type: "STRING" },
    naics: { type: "STRING" },
    psc: { type: "STRING" },
    contractType: { type: "STRING" },
    acquisitionStructure: { type: "STRING" },
    scopeText: { type: "STRING" },
    laborIntensity: { type: "STRING" },
    technologySecurityLocation: { type: "STRING" },
    opportunitySpecific: { type: "BOOLEAN" },
    recurringService: { type: "BOOLEAN" },
    scalableByQuantity: { type: "BOOLEAN" },
    sharedAcrossAwards: { type: "BOOLEAN" },
    valueBasis: { type: "STRING" },
    rangeBound: { type: "STRING" },
    rangeId: { type: "STRING" }
  },
  required: ["originalValue", "valueType", "currency", "units", "valueBasis"]
};
var driverSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      assessment: { type: "STRING" },
      evidenceIds: stringArray,
      inference: { type: "BOOLEAN" }
    },
    required: ["name", "assessment", "evidenceIds", "inference"]
  }
};
var narrativeSchema = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    rationale: { type: "STRING" },
    decisionFactors: stringArray,
    guardrails: stringArray,
    nextActions: stringArray
  },
  required: ["headline", "rationale", "decisionFactors", "guardrails", "nextActions"]
};
var baseSchema = {
  type: "OBJECT",
  properties: {
    deal: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        agency: { type: "STRING" },
        solicitationNumber: { type: "STRING" },
        contractType: { type: "STRING" },
        dueDate: { type: "STRING" },
        periodOfPerformance: { type: "STRING" },
        naics: { type: "STRING" },
        psc: { type: "STRING" },
        awardStructure: { type: "STRING" },
        evaluationMethod: { type: "STRING" },
        scopeSummary: { type: "STRING" },
        facts: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              label: { type: "STRING" },
              value: { type: "STRING" },
              section: { type: "STRING" },
              confidence: { type: "NUMBER" }
            },
            required: ["label", "value", "confidence"]
          }
        },
        requirements: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              detail: { type: "STRING" },
              category: { type: "STRING" },
              section: { type: "STRING" },
              confidence: { type: "NUMBER" }
            },
            required: ["name", "detail", "category", "confidence"]
          }
        },
        laborSignals: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              quantity: { type: "NUMBER" },
              annualHours: { type: "NUMBER" },
              location: { type: "STRING" },
              clearance: { type: "STRING" },
              section: { type: "STRING" }
            },
            required: ["title"]
          }
        },
        pricingSignals: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              signal: { type: "STRING" },
              implication: { type: "STRING" },
              section: { type: "STRING" },
              confidence: { type: "NUMBER" }
            },
            required: ["signal", "implication", "confidence"]
          }
        }
      },
      required: [
        "title",
        "agency",
        "solicitationNumber",
        "contractType",
        "dueDate",
        "periodOfPerformance",
        "naics",
        "awardStructure",
        "evaluationMethod",
        "scopeSummary",
        "facts",
        "requirements",
        "laborSignals",
        "pricingSignals"
      ]
    },
    marketAssessment: {
      type: "OBJECT",
      properties: {
        posture: { type: "STRING" },
        summary: { type: "STRING" },
        basis: stringArray,
        drivers: driverSchema
      },
      required: ["posture", "summary", "basis", "drivers"]
    },
    competitors: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING" },
          pricingPosture: { type: "STRING" },
          rationale: { type: "STRING" },
          differentiators: stringArray,
          risks: stringArray,
          sourceRefs: stringArray,
          confidence: { type: "NUMBER" },
          evidenceType: { type: "STRING" },
          demonstratedCapabilities: stringArray,
          deliveryModel: { type: "STRING" },
          techPlatform: { type: "STRING" },
          laborShape: { type: "STRING" },
          partnerEcosystem: stringArray,
          vehicleAccess: stringArray,
          incumbentAdvantage: { type: "STRING" },
          automationClaims: stringArray,
          costDrivers: stringArray,
          unknowns: stringArray
        },
        required: ["name", "role", "pricingPosture", "rationale", "differentiators", "risks", "sourceRefs", "confidence", "evidenceType"]
      }
    },
    incumbent: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        status: { type: "STRING" },
        strengths: stringArray,
        vulnerabilities: stringArray,
        transitionRisk: { type: "STRING" },
        confidence: { type: "NUMBER" },
        sourceRefs: stringArray
      },
      required: ["name", "status", "strengths", "vulnerabilities", "transitionRisk", "confidence", "sourceRefs"]
    },
    evidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: { type: "STRING" },
          sourceLabel: { type: "STRING" },
          section: { type: "STRING" },
          claim: { type: "STRING" },
          excerpt: { type: "STRING" },
          confidence: { type: "NUMBER" },
          numeric: numericEvidenceSchema
        },
        required: ["id", "type", "sourceLabel", "claim", "confidence"]
      }
    },
    gaps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          impact: { type: "STRING" },
          priority: { type: "STRING" }
        },
        required: ["question", "impact", "priority"]
      }
    },
    affordability: {
      type: "OBJECT",
      properties: {
        estimatedCeiling: { type: "NUMBER" },
        budgetSignals: stringArray,
        obligationsHistory: { type: "STRING" },
        fundingAvailability: { type: "STRING" },
        confidence: { type: "STRING" },
        evidenceIds: stringArray
      },
      required: ["budgetSignals", "fundingAvailability", "confidence"]
    },
    gaoFindings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          topic: { type: "STRING" },
          implication: { type: "STRING" },
          sourceUrl: { type: "STRING" },
          relevanceScore: { type: "NUMBER" },
          evidenceIds: stringArray
        },
        required: ["topic", "implication", "relevanceScore"]
      }
    },
    preRfpSignals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          date: { type: "STRING" },
          summary: { type: "STRING" },
          impact: { type: "STRING" },
          evidenceIds: stringArray
        },
        required: ["type", "date", "summary", "impact"]
      }
    },
    narrative: narrativeSchema
  },
  required: ["deal", "marketAssessment", "competitors", "incumbent", "evidence", "gaps", "narrative"]
};
var analysisPrompt = `You are a federal capture and competitive-pricing analyst. Analyze the attached solicitation and return a concise evidence-led market assessment.

NON-NEGOTIABLE AUTHORITY RULES
- Do not calculate or recommend Aggressive, Expected, Conservative, low, target, high, or any other Market Position dollar value.
- Do not put dollar values in the narrative. The deterministic engine owns every authoritative Market Position number.
- Extract a numeric evidence object only when the document explicitly states the value. Preserve its section and excerpt.
- Keep evaluated price, estimated value, ceiling, initial obligation, current obligations, eventual spend, total award value, hourly ceiling rate, escalation rate, and budget context distinct.
- CRITICAL: If a value represents the total deal or contract size, you MUST use valueType 'ESTIMATED_VALUE', 'TOTAL_AWARD_VALUE', or 'EVALUATED_PRICE', and YOU MUST set units exactly to 'TOTAL_USD'.
- Classify the measurement basis using valueBasis exactly from: OPPORTUNITY_TOTAL, INDIVIDUAL_AWARD, PROGRAM_TOTAL, MULTIPLE_AWARD_POOL, ORDER_LIMIT, PAST_PERFORMANCE_THRESHOLD, BUDGET, UNKNOWN.
- Program-wide funding, portfolio funding, annual funding, and multiple-award pools are context, not the expected value of one award.
- Minimum/maximum order limitations and past-performance eligibility thresholds are not Market Position anchors.
- For a stated individual-award range, return the low and high values as separate evidence items with the same rangeId and rangeBound LOW or HIGH.
- Use valueType values exactly from: EVALUATED_PRICE, ESTIMATED_VALUE, TOTAL_AWARD_VALUE, CURRENT_AWARD_AMOUNT, CONTRACT_CEILING, INITIAL_OBLIGATION, CURRENT_OBLIGATIONS, EVENTUAL_SPEND, HOURLY_CEILING_RATE, ESCALATION_RATE, BUDGET_CONTEXT, UNKNOWN.
- Use units TOTAL_USD, USD_PER_HOUR, PERCENT, or OTHER. Do not convert unlike units.
- Set opportunitySpecific true only for a value that describes this solicitation.
- Set recurringService, scalableByQuantity, or sharedAcrossAwards true only when the document supports it.
- Never invent an incumbent, competitor, amount, staffing level, source, normalization factor, or evidence ID.
- Do not create numeric evidence for dates, page numbers, proposal-validity days, or periods of performance. Keep those as deal facts.
- SOLICITATION_FACT requires a document citation. Label deductions ANALYST_INFERENCE.
- Confidence values are 0-100, but do not create an opportunity score or probability of win.
- Do not claim public-source research was performed during this extraction pass.

PRODUCT TASK
1. Extract deal, evaluation, staffing, pricing, and acquisition facts.
2. Build an evidence ledger, including explicit numeric evidence with correct value types.
3. Identify gaps that affect comparability or normalization.
4. Produce qualitative competitor and incumbent reconstruction with fact/inference separation.
5. Produce marketAssessment and narrative fields that explain conditions, guardrails, and next actions without authoritative dollar values.

Use concise language suitable for a federal pricing lead.`;
var sourceNames = ["SAM.gov", "USAspending", "GSA CALC+", "BLS"];
var connectorCache = /* @__PURE__ */ new Map();
var connectorCacheTtlMs = 15 * 60 * 1e3;
var blockedResearchHosts = [
  "facebook.com",
  "wikipedia.org",
  "fool.com",
  "marketsandmarkets.com",
  "mordorintelligence.com",
  "govtribe.com",
  "highergov.com",
  "govoppintel.com",
  "orangeslices.ai"
];
function usableResearchUrl(value) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return !blockedResearchHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}
function connectorCacheKey(name, deal) {
  const labor = deal.laborSignals?.map((item) => item.title).filter(Boolean).slice(0, 5) || [];
  return JSON.stringify([name, deal.agency, deal.naics, deal.solicitationNumber, deal.title, labor]);
}
async function runConnectorSet(deal, only, force = false, fileNames = []) {
  const tasks = {
    "SAM.gov": () => querySamGov(deal, fileNames),
    USAspending: () => queryUSASpending(deal),
    "GSA CALC+": () => queryGsaCalc(deal.laborSignals || []),
    BLS: () => queryBls()
  };
  const selected = only ? [only] : sourceNames;
  const settled = await Promise.allSettled(selected.map(async (name) => {
    const key = connectorCacheKey(name, deal);
    const cached = connectorCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, status: "CACHED", message: cached.result.message || "Preserved cached result used." };
    }
    const result = await tasks[name]();
    if (result.success) connectorCache.set(key, { expiresAt: Date.now() + connectorCacheTtlMs, result });
    return result;
  }));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      name: selected[index],
      success: false,
      status: "ERROR",
      recordsFound: 0,
      evidence: [],
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      durationMs: 0,
      attempts: 1,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      querySummary: "Connector failed before the request completed."
    };
  });
}
function connectorStatus(result) {
  return {
    name: result.name,
    status: result.status,
    recordsFound: result.recordsFound,
    message: result.message,
    durationMs: result.durationMs,
    attempts: result.attempts,
    retrievedAt: result.retrievedAt,
    querySummary: result.querySummary,
    samDocuments: result.samDocuments
  };
}
function mergeEvidence(existing = [], incoming = []) {
  const merged = new Map((existing || []).filter(Boolean).map((item) => [item.id, item]));
  for (const item of (incoming || []).filter(Boolean)) merged.set(item.id, item);
  return [...merged.values()];
}
async function synthesizeOfficialEvidence(draft) {
  const official = draft.evidence.filter((item) => item.type === "EXTERNAL_SOURCE" && /API/.test(item.sourceLabel));
  if (official.length === 0) return;
  const response = await aiClient().models.generateContent({
    model,
    contents: `Update only the qualitative interpretation using the validated official evidence below.
Return JSON with keys marketAssessment, competitors, incumbent, and narrative. Preserve their existing shapes and evidence IDs.
Never return a Market Position dollar value, numeric range, opportunity score, or probability of win.
Treat award amounts, ceilings, obligations, hourly ceiling rates, and escalation percentages as different measurements.
Do not put dollar values in narrative strings.

CURRENT QUALITATIVE ANALYSIS:
${JSON.stringify({
      marketAssessment: draft.marketAssessment,
      competitors: draft.competitors,
      incumbent: draft.incumbent,
      narrative: draft.narrative
    })}

OFFICIAL EVIDENCE:
${JSON.stringify(official)}`,
    config: { responseMimeType: "application/json", temperature: 0.1 }
  });
  const synthesis = parseJson(response.text);
  draft.marketAssessment = sanitizeMarketAssessment(synthesis.marketAssessment || draft.marketAssessment);
  draft.competitors = synthesis.competitors || draft.competitors;
  draft.incumbent = synthesis.incumbent || draft.incumbent;
  draft.narrative = sanitizeNarrative(synthesis.narrative || draft.narrative);
}
async function analyzeFiles(files) {
  const client = aiClient();
  const inlineDataParts = files.map((file) => ({
    inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype || "application/octet-stream" }
  }));
  const response = await client.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [
        { text: analysisPrompt },
        ...inlineDataParts
      ]
    }],
    config: { responseMimeType: "application/json", responseSchema: baseSchema, temperature: 0.15 }
  });
  const draft = parseJson(response.text);
  draft.evidence = draft.evidence || [];
  classifyNumericEvidence(draft.evidence);
  draft.gaps = draft.gaps || [];
  draft.marketAssessment = sanitizeMarketAssessment(draft.marketAssessment);
  draft.narrative = sanitizeNarrative(draft.narrative);
  const warnings = [];
  let researchStatus = "SOLICITATION_ONLY";
  const connectors = [];
  const fileNames = files.map((f) => f.originalname);
  const connectorWork = runConnectorSet(draft.deal, void 0, false, fileNames);
  const researchWork = process.env.ENABLE_GOOGLE_SEARCH !== "false" ? client.models.generateContent({
    model,
    contents: `Research the public federal market for this opportunity using Google Search.
Return JSON with keys marketAssessment, competitors, incumbent, and narrative only.
Improve only qualitative claims supported by current public sources and preserve the existing shapes.
Never return or revise an authoritative Market Position dollar value, numeric range, opportunity score, or probability of win.
Do not put dollar values in narrative strings. Put source URLs in competitor and incumbent sourceRefs.
Prefer official .gov/.mil records and first-party company sources. Do not rely on Wikipedia, social media, market-size aggregators, procurement aggregators, or search-result snippets.

BASE ANALYSIS:
${JSON.stringify(draft)}`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1 }
  }) : Promise.resolve(null);
  const [connectorOutcome, researchOutcome] = await Promise.allSettled([connectorWork, researchWork]);
  if (connectorOutcome.status === "fulfilled") {
    const results = connectorOutcome.value;
    for (const result of results) {
      connectors.push(connectorStatus(result));
      draft.evidence = mergeEvidence(draft.evidence, result.evidence);
    }
    if (results.some((result) => result.success && result.recordsFound > 0)) {
      researchStatus = "PARTIAL";
    }
  } else {
    warnings.push(`Government API adapters failed to run: ${connectorOutcome.reason instanceof Error ? connectorOutcome.reason.message : String(connectorOutcome.reason)}`);
  }
  if (researchOutcome.status === "fulfilled" && researchOutcome.value) {
    try {
      const researchResponse = researchOutcome.value;
      const research = parseJson(researchResponse.text);
      draft.marketAssessment = sanitizeMarketAssessment(research.marketAssessment || draft.marketAssessment);
      draft.competitors = research.competitors || draft.competitors;
      draft.incumbent = research.incumbent || draft.incumbent;
      draft.narrative = sanitizeNarrative(research.narrative || draft.narrative);
      const chunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks.flatMap((chunk, index) => usableResearchUrl(chunk.web?.uri) ? [{
        id: `EXT-${index + 1}`,
        type: "EXTERNAL_SOURCE",
        sourceLabel: chunk.web.title || `External source ${index + 1}`,
        claim: "Public market source used during grounded qualitative enrichment.",
        url: chunk.web.uri,
        confidence: 80,
        retrievedAt: (/* @__PURE__ */ new Date()).toISOString()
      }] : []);
      draft.evidence = mergeEvidence(draft.evidence, sources);
      researchStatus = sources.length ? "GROUNDED" : researchStatus;
    } catch (error) {
      warnings.push(`Public-market enrichment was unavailable; the brief remains solicitation and official-adapter grounded. ${error instanceof Error ? error.message : ""}`.trim());
    }
  } else if (researchOutcome.status === "rejected") {
    warnings.push(`Public-market enrichment was unavailable; the brief remains solicitation and official-adapter grounded. ${researchOutcome.reason instanceof Error ? researchOutcome.reason.message : ""}`.trim());
    if (researchStatus === "SOLICITATION_ONLY") {
      researchStatus = connectors.some((connector) => connector.status === "SUCCESS") ? "PARTIAL" : "SOLICITATION_ONLY";
    }
  }
  const analyzedAt = (/* @__PURE__ */ new Date()).toISOString();
  const marketPosition = calculateDeterministicScenarios(draft, { asOfDate: analyzedAt });
  const { marketAssessment: _marketAssessment, ...analysisFields } = draft;
  return {
    ...analysisFields,
    marketPosition,
    narrative: sanitizeNarrative(draft.narrative),
    id: `run-${crypto.randomUUID()}`,
    meta: { mode: "MARKET_ONLY", model, analyzedAt, researchStatus, warnings, connectors }
  };
}
app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  aiConfigured: Boolean(apiKey),
  model,
  calculationEngine: MARKET_POSITION_ENGINE_VERSION
}));
var localRuns = [];
function legacyNarrative(raw) {
  const narrative = raw?.narrative || raw?.guidance || {};
  return sanitizeNarrative({
    headline: narrative.headline || "Legacy analysis",
    rationale: narrative.rationale || "Recalculate this run under the current methodology.",
    decisionFactors: narrative.decisionFactors || narrative.winConditions || [],
    guardrails: narrative.guardrails || [],
    nextActions: narrative.nextActions || []
  });
}
function normalizeIncomingRun(raw) {
  if (!raw?.id || !raw?.deal || !raw?.meta) throw new Error("A valid Opportunity Run is required.");
  if (!isCurrentEngine(raw.marketPosition)) {
    return {
      ...raw,
      marketPosition: createLegacyPosition(raw.marketPosition),
      narrative: legacyNarrative(raw),
      meta: {
        ...raw.meta,
        warnings: [.../* @__PURE__ */ new Set([
          ...raw.meta.warnings || [],
          "This legacy run must be recalculated before its numeric Market Position can be used."
        ])]
      }
    };
  }
  return enforceAuthoritativeAnalysis(raw);
}
app.get("/api/runs", (_req, res) => {
  res.json({ data: localRuns });
});
app.post("/api/runs", (req, res) => {
  try {
    const run = normalizeIncomingRun(req.body);
    localRuns = [run, ...localRuns.filter((item) => item.id !== run.id)];
    res.json({ success: true, data: run });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Run could not be saved." });
  }
});
app.delete("/api/runs/:id", (req, res) => {
  localRuns = localRuns.filter((run) => run.id !== req.params.id);
  res.json({ success: true });
});
app.post("/api/analyze-solicitation", upload.array("files"), async (req, res) => {
  try {
    if (!apiKey) return res.status(503).json({ error: "GEMINI_API_KEY is not configured for this deployment." });
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: "Choose solicitation files before starting the analysis." });
    const allowed = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    for (const file of files) {
      if (!allowed.includes(file.mimetype)) {
        return res.status(415).json({ error: `File ${file.originalname} is not supported. Use a PDF, DOCX, DOC, or TXT file.` });
      }
    }
    res.json({ data: await analyzeFiles(files) });
  } catch (error) {
    console.error("Analysis failed", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "The analysis could not be completed." });
  }
});
app.post("/api/retry-connector", async (req, res) => {
  try {
    let analysis = req.body?.analysis;
    const source = req.body?.source;
    if (!analysis?.deal || !sourceNames.includes(source)) {
      return res.status(400).json({ error: "A valid analysis and connector name are required." });
    }
    const [result] = await runConnectorSet(analysis.deal, source, true);
    const sourceLabels = {
      "SAM.gov": ["SAM.gov Opportunities API"],
      USAspending: ["USAspending.gov API"],
      "GSA CALC+": ["GSA CALC+ API"],
      BLS: ["BLS Public Data API"]
    };
    analysis.evidence = mergeEvidence(
      analysis.evidence.filter((item) => !sourceLabels[source].includes(item.sourceLabel)),
      result.evidence
    );
    analysis.meta.connectors = [
      ...(analysis.meta.connectors || []).filter((connector) => connector.name !== source),
      connectorStatus(result)
    ].sort((a, b) => sourceNames.indexOf(a.name) - sourceNames.indexOf(b.name));
    analysis.meta.analyzedAt = (/* @__PURE__ */ new Date()).toISOString();
    const draft = {
      deal: analysis.deal,
      marketAssessment: marketAssessmentFromPosition(analysis.marketPosition),
      competitors: analysis.competitors,
      incumbent: analysis.incumbent,
      evidence: analysis.evidence,
      gaps: analysis.gaps,
      narrative: analysis.narrative,
      affordability: analysis.affordability,
      gaoFindings: analysis.gaoFindings,
      preRfpSignals: analysis.preRfpSignals
    };
    if (result.recordsFound > 0) {
      try {
        await synthesizeOfficialEvidence(draft);
      } catch (error) {
        analysis.meta.warnings.push(`The ${source} evidence refreshed, but qualitative synthesis did not. ${error instanceof Error ? error.message : ""}`.trim());
      }
    }
    analysis = {
      ...analysis,
      competitors: draft.competitors,
      incumbent: draft.incumbent,
      narrative: sanitizeNarrative(draft.narrative),
      marketPosition: calculateDeterministicScenarios(draft, { asOfDate: analysis.meta.analyzedAt })
    };
    res.json({ data: analysis });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "The connector could not be retried." });
  }
});
var displayValue = (value) => value === null ? "Insufficient evidence" : value;
app.post("/api/export-brief", async (req, res) => {
  try {
    const analysis = normalizeIncomingRun(req.body);
    if (!analysis.deal?.title) return res.status(400).json({ error: "Analysis payload is required." });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Federal Market Position";
    const summary = workbook.addWorksheet("Executive Decision");
    summary.columns = [{ header: "Field", key: "field", width: 34 }, { header: "Value", key: "value", width: 92 }];
    summary.addRows([
      { field: "Opportunity", value: analysis.deal.title },
      { field: "Agency", value: analysis.deal.agency },
      { field: "Solicitation", value: analysis.deal.solicitationNumber },
      { field: "Aggressive Market Position", value: displayValue(analysis.marketPosition.aggressive) },
      { field: "Expected Market Position", value: displayValue(analysis.marketPosition.expected) },
      { field: "Conservative Market Position", value: displayValue(analysis.marketPosition.conservative) },
      { field: "Range Status", value: analysis.marketPosition.rangeStatus },
      { field: "Evidence Readiness", value: `${analysis.marketPosition.evidenceReadiness.score}/100` },
      { field: "Formula Version", value: analysis.marketPosition.formulaVersion },
      { field: "Calculation Basis", value: "Weighted comparable total-value evidence only" }
    ]);
    const methodology = workbook.addWorksheet("Calculation Methodology");
    const evidenceById = new Map(analysis.evidence.map((item) => [item.id, item]));
    methodology.columns = [
      { header: "Evidence ID", key: "evidenceId", width: 18 },
      { header: "Source", key: "source", width: 28 },
      { header: "Value Type", key: "valueType", width: 24 },
      { header: "Role", key: "role", width: 20 },
      { header: "Original Value", key: "originalValue", width: 18 },
      { header: "Normalized Value", key: "normalizedValue", width: 20 },
      { header: "Comparability", key: "comparability", width: 16 },
      { header: "Evidence Quality", key: "quality", width: 18 },
      { header: "Normalization Confidence", key: "normalization", width: 24 },
      { header: "Weight", key: "weight", width: 12 },
      { header: "Used", key: "used", width: 10 },
      { header: "Rationale", key: "rationale", width: 80 },
      { header: "Underlying Claim", key: "claim", width: 90 }
    ];
    methodology.addRows(analysis.marketPosition.anchors.map((anchor) => ({
      evidenceId: anchor.evidenceId,
      source: anchor.sourceLabel,
      valueType: anchor.valueType,
      role: anchor.role,
      originalValue: anchor.originalValue,
      normalizedValue: anchor.normalizedValue,
      comparability: Math.round(anchor.comparabilityScore * 100),
      quality: Math.round(anchor.evidenceQuality * 100),
      normalization: Math.round(anchor.normalizationConfidence * 100),
      weight: anchor.weight,
      used: anchor.included ? "Yes" : "No",
      rationale: anchor.included ? anchor.inclusionRationale : anchor.exclusionReasons.join(" "),
      claim: evidenceById.get(anchor.evidenceId)?.claim || ""
    })));
    const intelligence = workbook.addWorksheet("Intelligence");
    intelligence.columns = [{ header: "Category", key: "category", width: 24 }, { header: "Finding", key: "finding", width: 100 }];
    intelligence.addRow({ category: "Market Assessment", finding: analysis.marketPosition.summary });
    intelligence.addRow({ category: "Incumbent", finding: analysis.incumbent.name ? `${analysis.incumbent.name} \u2014 ${analysis.incumbent.status}; transition risk ${analysis.incumbent.transitionRisk}.` : "No incumbent was verified." });
    analysis.narrative.decisionFactors.forEach((finding) => intelligence.addRow({ category: "Decision Factor", finding }));
    analysis.narrative.guardrails.forEach((finding) => intelligence.addRow({ category: "Guardrail", finding }));
    analysis.narrative.nextActions.forEach((finding) => intelligence.addRow({ category: "Next Action", finding }));
    analysis.gaps.forEach((gap) => intelligence.addRow({ category: `Gap \u2014 ${gap.priority}`, finding: `${gap.question} ${gap.impact}` }));
    if (analysis.affordability) {
      intelligence.addRow({ category: "Affordability", finding: analysis.affordability.estimatedCeiling ? `Reported ceiling: ${analysis.affordability.estimatedCeiling}` : "No reported ceiling." });
      intelligence.addRow({ category: "Budget Signals", finding: analysis.affordability.budgetSignals?.join("; ") });
    }
    analysis.gaoFindings?.forEach((finding) => intelligence.addRow({ category: "GAO / Source Selection", finding: `${finding.topic} \u2014 ${finding.implication}` }));
    analysis.preRfpSignals?.forEach((signal) => intelligence.addRow({ category: "Pre-RFP Signal", finding: `${signal.type}: ${signal.summary}` }));
    const competitors = workbook.addWorksheet("Competition");
    competitors.columns = [
      { header: "Name", key: "name", width: 25 },
      { header: "Role", key: "role", width: 20 },
      { header: "Capabilities", key: "capabilities", width: 50 },
      { header: "Technology", key: "technology", width: 30 },
      { header: "Delivery Model", key: "deliveryModel", width: 32 },
      { header: "Cost Drivers", key: "costDrivers", width: 45 },
      { header: "Risks / Unknowns", key: "risks", width: 55 },
      { header: "Assessment", key: "rationale", width: 80 },
      { header: "Evidence Type", key: "evidenceType", width: 22 },
      { header: "Confidence", key: "confidence", width: 14 },
      { header: "Sources", key: "sources", width: 60 }
    ];
    analysis.competitors.forEach((competitor) => competitors.addRow({
      name: competitor.name,
      role: competitor.role,
      capabilities: (competitor.demonstratedCapabilities?.length ? competitor.demonstratedCapabilities : competitor.differentiators)?.join(", "),
      technology: competitor.techPlatform,
      deliveryModel: competitor.deliveryModel,
      costDrivers: competitor.costDrivers?.join(", "),
      risks: [...competitor.risks || [], ...competitor.unknowns || []].join(", "),
      rationale: competitor.rationale,
      evidenceType: competitor.evidenceType,
      confidence: competitor.confidence,
      sources: competitor.sourceRefs?.join(", ")
    }));
    const evidence = workbook.addWorksheet("Evidence Ledger");
    evidence.columns = [
      { header: "ID", key: "id", width: 16 },
      { header: "Type", key: "type", width: 22 },
      { header: "Source", key: "sourceLabel", width: 35 },
      { header: "Section", key: "section", width: 20 },
      { header: "Claim", key: "claim", width: 80 },
      { header: "Confidence", key: "confidence", width: 14 },
      { header: "Value Type", key: "valueType", width: 24 },
      { header: "Original Value", key: "originalValue", width: 18 }
    ];
    evidence.addRows(analysis.evidence.map((item) => ({
      ...item,
      valueType: item.numeric?.valueType,
      originalValue: item.numeric?.originalValue
    })));
    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10243E" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = analysis.deal.solicitationNumber?.replace(/[^a-z0-9-]/gi, "_") || "market-position";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Market_Position.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Export failed." });
  }
});
app.use((error, _req, res, next) => {
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each uploaded file must be 4 MB or smaller in the hosted demo." });
  if (error.code === "LIMIT_FILE_COUNT") return res.status(400).json({ error: "Upload no more than 10 solicitation files at once." });
  return res.status(400).json({ error: `Upload failed: ${error.message}` });
});
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(port, "0.0.0.0", () => console.log(`Federal Market Position running on http://localhost:${port}`));
}
var server_default = app;
if (process.env.VERCEL !== "1") {
  start();
}
export {
  server_default as default
};
