import type { Express } from 'express';
import { ConflictError, RecordStore } from './store';

// Separate visibility metadata leaves the prediction and evidence intact.
export async function archivedRunIds(store: RecordStore, workspace: string) {
  return new Set((await store.list(workspace, 'run-archive')).map(row => row.id));
}

export function installArchiveRoutes(app: Express, store: RecordStore) {
  app.post('/api/runs/:id/archive', async (req, res) => {
    try {
      const { workspace, username } = req.principal;
      const id = String(req.params.id);
      if (typeof req.body?.archived !== 'boolean') return res.status(400).json({ error: 'Choose archive or restore.' });
      if (!await store.get(workspace, 'analysis', id)) return res.status(404).json({ error: 'Saved run not found in this workspace.' });
      if (req.body.archived) {
        if (!await store.get(workspace, 'run-archive', id)) {
          try { await store.put(workspace, 'run-archive', id, { archivedAt: new Date().toISOString(), archivedBy: username }); }
          catch (error) { if (!(error instanceof ConflictError)) throw error; }
        }
      } else await store.remove(workspace, 'run-archive', id);
      res.json({ success: true, archived: req.body.archived });
    } catch {
      res.status(503).json({ error: 'The archive could not be updated. Please retry.' });
    }
  });
}
