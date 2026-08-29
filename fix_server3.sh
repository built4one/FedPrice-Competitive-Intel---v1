sed -i '/app.post('"'"'\/api\/analyze-solicitation'"'"'/i \
let localRuns: OpportunityAnalysis[] = [];\
\
app.get("/api/runs", (req, res) => {\
  res.json({ data: localRuns });\
});\
\
app.post("/api/runs", express.json(), (req, res) => {\
  const run = req.body;\
  localRuns = [run, ...localRuns.filter(r => r.id !== run.id)];\
  res.json({ success: true });\
});\
\
app.delete("/api/runs/:id", (req, res) => {\
  localRuns = localRuns.filter(r => r.id !== req.params.id);\
  res.json({ success: true });\
});\
' server.ts
