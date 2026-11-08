export const SUITE = "HANDOFF-PQ1" as const;
export type Suite = typeof SUITE;

export type SealMode = "office" | "person";

export type FindingKind =
  | "ssn"
  | "itin"
  | "ein"
  | "routing"
  | "card"
  | "account"
  | "dob"
  | "mrz"
  | "email"
  | "phone";

export interface Finding {
  kind: FindingKind;
  value: string;
  start: number;
  end: number;
  confidence: "high" | "medium";
  sample?: boolean;
}

export interface RedactionSummary {
  removed: Partial<Record<FindingKind, number>>;
  verified: boolean;
  boxes?: number;
  pagesRemoved?: number;
  metadataRemoved?: boolean;
}

export interface Meta {
  name: string;
  type: string;
  size: number;
  redactions?: RedactionSummary;
}

export interface EnvelopeHeader {
  v: 1;
  suite: Suite;
  id: string;
  mode: SealMode;
  recipient?: { domain: string; kid: string };
  kemCt?: string;
  wrappedDek?: string;
  wrapNonce?: string;
  chunkSize: number;
  nChunks: number;
  nonceBase: string;
  paddedSize: number;
  created: string;
  expires: string;
}

export interface Sealed {
  header: EnvelopeHeader;
  ciphertext: Uint8Array;
}

export interface PersonKeyShares {
  k1: Uint8Array;
  k2: Uint8Array;
}

export interface OfficeKeyBundle {
  v: 1;
  domain: string;
  name: string;
  kemPk: string;
  sigPk: string;
  created: string;
  expires: string;
  prevFp?: string;
  sig: string;
}

export interface OfficeSecret {
  kemSk: Uint8Array;
  sigSk: Uint8Array;
}

export type Verdict = "verified" | "mismatch" | "unknown";

export interface CheckRequest {
  claimedOrg: string;
  senderDomain: string;
  senderEmail?: string;
  linkDomains: string[];
  phones: string[];
  locationHint?: string;
}

export interface Evidence {
  url: string;
  quote: string;
  verified: boolean;
  fetchedAt: string;
  source: "tavily" | "exa" | "registry";
  corroborated?: boolean;
}

export interface CheckResponse {
  verdict: Verdict;
  claimedOrg: string;
  officialName?: string;
  officialDomain?: string;
  officialUploadUrl?: string;
  officialPhone?: string;
  officialVerifiedByDns?: boolean;
  evidence: Evidence[];
  signals: string[];
  explanation: string;
  latencyMs: number;
  source: "registry" | "cache" | "live";
  providers: string[];
}

export type HandoffStatus = "pending" | "stored" | "opened" | "revoked" | "expired";

export interface CreateHandoffRequest {
  mode: SealMode;
  officeDomain?: string;
  requestId?: string;
  revokeTokenHash: string;
  expiresInMinutes?: number;
}

export interface CreateHandoffResponse {
  id: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface FinalizeHandoffRequest {
  header: EnvelopeHeader;
  ctSha256: string;
  paddedSize: number;
  k2?: string;
  codeHash?: string;
}

export interface StorageReceipt {
  id: string;
  ctSha256: string;
  paddedSize: number;
  storedAt: string;
  sig: string;
}

export interface HandoffInfo {
  id: string;
  status: HandoffStatus;
  header: EnvelopeHeader;
  downloadUrl?: string;
  createdAt: string;
  openedAt?: string;
  expiresAt: string;
}

export interface DocRequest {
  id: string;
  officeDomain: string;
  officeName: string;
  checklist: string[];
  note?: string;
  expiresAt: string;
}

export type HandoffEventType = "created" | "stored" | "opened" | "revoked" | "expired";

export interface HandoffEvent {
  id: string;
  handoffId: string;
  type: HandoffEventType;
  at: string;
  prevHash: string;
  hash: string;
}

export interface LedgerEntry {
  at: string;
  method: string;
  url: string;
  bytes: number;
  preview: string;
}
