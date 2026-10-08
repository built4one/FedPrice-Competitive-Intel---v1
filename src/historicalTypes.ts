export interface HistoricalDocumentAudit {
  kind:'SOLICITATION'|'MARKET'|'OUTCOME'|'UNKNOWN';
  publishedAt:string; dateQuote:string; reason:string;
  decision:'ADMITTED'|'EXCLUDED'; proof:'DATED_DOCUMENT'|'ATTESTED_ORIGINAL'|'NONE';
}
export interface HistoricalContext {
  cutoff:string; version:'historical-1'; originalPackageConfirmed:boolean;
  classification:'RETROSPECTIVE_APPROXIMATION'|'VALIDATED_BACKTEST';
  limitations:string[];
  documents:Array<{id:string;name:string;sha256?:string;audit:HistoricalDocumentAudit}>;
  excludedEvidence:Array<{id:string;reason:string}>;
  review?:{reviewedAt:string;reviewer:string;statement:string};
}
export interface FrozenPrediction {
  id:string; hash:string; frozenAt:string; version:string;
  target:number|null; low:number|null; high:number|null;
  classification:'RETROSPECTIVE_APPROXIMATION'|'VALIDATED_BACKTEST'|'LIVE_ASSESSMENT';
}
