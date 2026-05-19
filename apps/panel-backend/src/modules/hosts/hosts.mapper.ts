import type { Host } from '../../generated/prisma/client.js';

export interface PublicHostDto {
  id: string;
  bindingId: string;
  remark: string;
  priority: number;
  enabled: boolean;
  addressOverride: string | null;
  portOverride: number | null;
  sniOverride: string | null;
  hostHeaderOverride: string | null;
  pathOverride: string | null;
  fingerprintOverride: string | null;
  alpn: string[];
  allowInsecure: boolean;
  securityLayer: string;
  disableForFormats: string[];
  createdAt: string;
  updatedAt: string;
}

export function mapHost(h: Host): PublicHostDto {
  return {
    id: h.id,
    bindingId: h.bindingId,
    remark: h.remark,
    priority: h.priority,
    enabled: h.enabled,
    addressOverride: h.addressOverride,
    portOverride: h.portOverride,
    sniOverride: h.sniOverride,
    hostHeaderOverride: h.hostHeaderOverride,
    pathOverride: h.pathOverride,
    fingerprintOverride: h.fingerprintOverride,
    alpn: h.alpn,
    allowInsecure: h.allowInsecure,
    securityLayer: h.securityLayer,
    disableForFormats: h.disableForFormats,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}
