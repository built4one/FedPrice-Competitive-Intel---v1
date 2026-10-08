export const PACKAGE_LIMITS = { uploadBytes: 50*1024*1024, expandedBytes: 200*1024*1024, fileBytes: 25*1024*1024, entries: 500, chunkBytes: 2*1024*1024, inputs: 40 };
export type PackageStage = 'UPLOADING'|'INVENTORY'|'READING'|'EXTRACTION'|'RESEARCH'|'PRICING'|'COMPLETE';
export interface PackageDocument {
  id:string; name:string; bytes:number; sha256?:string;
  status:'QUEUED'|'READ'|'EXCERPTS'|'VISUAL'|'DUPLICATE'|'UNSUPPORTED'|'UNREADABLE';
  priority:number; categories:string[]; note?:string; references?:string[];
}
export interface PackageCoverage {
  documents:PackageDocument[]; warnings:string[]; receivedAt:string; mode?:'LIVE'|'HISTORICAL';
  freshness:{status:'UNVERIFIED'|'METADATA_CHECKED'; checkedAt?:string; message:string};
}
export interface PackageJob {
  id:string; label:string; mode?:'LIVE'|'HISTORICAL'; stage:PackageStage; status:'READY'|'WORKING'|'PAUSED'|'COMPLETE'|'CANCELED';
  files:Array<{id:string;name:string;size:number;type:string;chunks:number}>;
  receivedChunks:string[]; documents:PackageDocument[]; warnings:string[]; receivedAt:string;
  message:string; opportunityRef?:string; cursor:number; leaseUntil?:number; attempts:number; runId?:string;
}
