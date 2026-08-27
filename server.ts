import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.js";
import { opportunities, auditLogs } from "./src/db/schema.js";
import { eq } from "drizzle-orm";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const upload = multer({ dest: "uploads/" });
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/opportunities", async (req, res) => {
    try {
      let opps = await db.select().from(opportunities);
      res.json(opps);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/opportunities", async (req, res) => {
    try {
      const oppData = req.body;
      const { generateScenarios } = await import("./src/utils/pricing.js");
      
      if (!oppData.scenarios || oppData.scenarios.length === 0) {
        oppData.scenarios = generateScenarios(oppData.clins || [], oppData.popYears || 5);
      }

      const result = await db.insert(opportunities).values({
        id: oppData.id || `run-${Date.now()}`,
        title: oppData.title,
        agency: oppData.agency,
        solicitationNumber: oppData.solicitationNumber,
        popYears: oppData.popYears,
        status: oppData.status || "Ready for Review",
        clins: oppData.clins || [],
        scenarios: oppData.scenarios
      }).returning();
      
      res.json({
        ...result[0],
        contractType: oppData.contractType || "Firm-Fixed-Price (FFP) & Labor Hour (LH)",
        naicsCode: oppData.naicsCode || "541512 - Computer Systems Design Services",
        dueDate: oppData.dueDate || "30 Days Post-Issuance",
        evaluationPosture: oppData.evaluationPosture || "Best Value Tradeoff",
        confidence: oppData.confidence || "High",
        competitors: oppData.competitors || [],
        vulnerabilities: oppData.vulnerabilities || [],
        evidence: oppData.evidence || []
      });
    } catch (e: any) {
      console.error("Insert error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/opportunities/:id", async (req, res) => {
    try {
      const result = await db.select().from(opportunities).where(eq(opportunities.id, req.params.id));
      if (result.length > 0) res.json(result[0]);
      else res.status(404).json({ error: "Not found" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/upload-solicitation", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new Error("No file uploaded");
      
      const fileData = fs.readFileSync(req.file.path);
      
      const prompt = `You are an elite Federal Pricing Analyst and Intelligence Analyst. Extract and generate the following from the provided solicitation document:
1. title (string) - Opportunity Title
2. agency (string) - Issuing Agency
3. solicitationNumber (string)
4. popYears (number) - Total Period of Performance years (base + options)
5. clins (array) - List of CLINs. Each CLIN should have:
  - id (string, e.g., 'clin-001')
  - name (string)
  - laborCategories (array of objects with: id, title, fte, hoursPerFte, baseRate, and gsaCalcBenchmark with min, median, max realistic market rates).
6. competitors (array) - Predict 3-4 realistic competitors for this agency/domain. Include name, type (Incumbent, Large Prime, Challenger, Mid-Tier), estimatedBid, winProbability, pricingPosture, keyDifferentiator.
7. vulnerabilities (array) - Extract 2-4 specific incumbent vulnerabilities, transition risks, or pain points mentioned in the PWS/SOW. Include area, finding, severity (High/Medium/Low), and counterStrategy.
8. evidence (array) - Extract 3-5 verbatim FAR clauses, pricing constraints, or SLA penalties directly from the text. Include id, source (e.g. "Section L.5"), extractedFact, confidence (0-100), verified (true), and checksum (random 8-char hex string).
Respond ONLY with a valid JSON object matching this structure.`;

      const schema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Opportunity Title" },
          agency: { type: "STRING", description: "Issuing Agency" },
          solicitationNumber: { type: "STRING" },
          popYears: { type: "INTEGER", description: "Total Period of Performance years" },
          clins: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                name: { type: "STRING" },
                laborCategories: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: { type: "STRING" },
                      title: { type: "STRING" },
                      fte: { type: "NUMBER" },
                      hoursPerFte: { type: "NUMBER" },
                      baseRate: { type: "NUMBER" },
                      gsaCalcBenchmark: {
                        type: "OBJECT",
                        properties: {
                          min: { type: "NUMBER" },
                          median: { type: "NUMBER" },
                          max: { type: "NUMBER" }
                        }
                      }
                    },
                    required: ["id", "title", "fte", "hoursPerFte", "baseRate"]
                  }
                }
              },
              required: ["id", "name", "laborCategories"]
            }
          },
          competitors: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                type: { type: "STRING" },
                estimatedBid: { type: "NUMBER" },
                winProbability: { type: "NUMBER" },
                pricingPosture: { type: "STRING" },
                keyDifferentiator: { type: "STRING" }
              }
            }
          },
          vulnerabilities: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                area: { type: "STRING" },
                finding: { type: "STRING" },
                severity: { type: "STRING" },
                counterStrategy: { type: "STRING" }
              }
            }
          },
          evidence: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                source: { type: "STRING" },
                extractedFact: { type: "STRING" },
                confidence: { type: "NUMBER" },
                verified: { type: "BOOLEAN" },
                checksum: { type: "STRING" }
              }
            }
          }
        },
        required: ["title", "agency", "solicitationNumber", "popYears", "clins"]
      };

      const response = await getAIClient().models.generateContent({
        model: "gemini-2.5-pro",
        contents: [
          { role: "user", parts: [{ text: prompt }, { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } }] }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema as any,
        }
      });

      let jsonString = response.text;
      if (!jsonString) throw new Error("Empty response from AI");
      
      jsonString = jsonString.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const extractedData = JSON.parse(jsonString);
      
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json({ status: "success", data: extractedData });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/opportunities/:id/export", async (req, res) => {
    try {
      const result = await db.select().from(opportunities).where(eq(opportunities.id, req.params.id));
      if (result.length === 0) return res.status(404).json({ error: "Not found" });
      const opp = result[0];

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      
      const sheet = workbook.addWorksheet("PTW Scenarios");
      sheet.columns = [
        { header: "Scenario", key: "name", width: 15 },
        { header: "Direct Labor", key: "directLabor", width: 20 },
        { header: "Fringe", key: "fringeCost", width: 20 },
        { header: "Overhead", key: "overheadCost", width: 20 },
        { header: "G&A", key: "gaCost", width: 20 },
        { header: "Fee", key: "feeAmount", width: 20 },
        { header: "Total Price", key: "totalPrice", width: 20 },
      ];

      (opp.scenarios as any[]).forEach(s => {
        sheet.addRow({
          name: s.name,
          directLabor: s.breakdown.directLabor,
          fringeCost: s.breakdown.fringeCost,
          overheadCost: s.breakdown.overheadCost,
          gaCost: s.breakdown.gaCost,
          feeAmount: s.breakdown.feeAmount,
          totalPrice: s.totalPrice,
        });
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${opp.title.replace(/[^a-z0-9]/gi, '_')}_PTW.xlsx"`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
