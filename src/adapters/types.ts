import type { EvidenceItem } from '../types';
import type { ConnectorStatus } from '../types';

export interface AdapterResult {
  name: ConnectorStatus['name'];
  success: boolean;
  recordsFound: number;
  evidence: EvidenceItem[];
  message?: string;
}
