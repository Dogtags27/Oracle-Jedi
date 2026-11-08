import type { HandoffStatus, OfficeKeyBundle } from "@oj/core";

export interface OfficeView {
  domain: string;
  name: string;
  bundle: OfficeKeyBundle;
  fingerprint: string;
  safetyWords: string[];
  verified: boolean;
  verifiedAt: string | null;
  dnsRecord: { name: string; value: string };
}

export interface PublicRequest {
  id: string;
  checklist: string[];
  note: string | null;
  expiresAt: string;
  office: OfficeView;
}

export interface OfficeRequest {
  id: string;
  checklist: string[];
  note: string | null;
  expiresAt: string;
  createdAt?: string;
}

export interface HandoffSummary {
  id: string;
  mode: "office" | "person";
  status: HandoffStatus;
  requestId: string | null;
  officeDomain: string | null;
  paddedSize: number | null;
  createdAt: string;
  storedAt: string | null;
  openedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}

export interface Receipt {
  id: string;
  ctSha256: string;
  paddedSize: number;
  storedAt: string;
  sig: string;
}
