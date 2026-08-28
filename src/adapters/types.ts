import type { EvidenceItem } from '../types';
import type { ConnectorStatus } from '../types';

export interface AdapterResult {
  name: ConnectorStatus['name'];
  success: boolean;
  status: ConnectorStatus['status'];
  recordsFound: number;
  evidence: EvidenceItem[];
  message?: string;
  durationMs: number;
  attempts: number;
  retrievedAt: string;
  querySummary: string;
}
