import type { EvidenceItem } from '../types';
import type { ConnectorStatus } from '../types';

export type SamDocumentRetrievalStatus =
  | 'DISCOVERED'
  | 'RETRIEVED'
  | 'PROVIDED'
  | 'RESTRICTED'
  | 'UNSUPPORTED'
  | 'TOO_LARGE'
  | 'SKIPPED'
  | 'FAILED';

export interface SamDocumentStatus {
  name: string;
  url: string;
  provided: boolean;
  type: string;
  retrievalStatus?: SamDocumentRetrievalStatus;
  sizeBytes?: number;
  mimeType?: string;
  message?: string;
}

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
  samDocuments?: SamDocumentStatus[];
}
