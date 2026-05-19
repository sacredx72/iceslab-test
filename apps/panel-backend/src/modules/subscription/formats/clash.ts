import type { SubscriptionEndpoint } from '../subscription.formats.js';

/**
 * Clash YAML subscription formatter (targets Clash Meta / Mihomo — covers
 * VLESS+REALITY, Hysteria2, Trojan+REALITY, and Shadowsocks native types).
 *
 * Scope:
 *   - hysteria              → `type: hysteria2`
 *   - xray (VLESS+REALITY)  → `type: vless` with `reality-opts`
 *   - xray (Trojan+REALITY) → `type: trojan` with `reality-opts` (slice 24c part 3a)
 *   - shadowsocks           → `type: ss` with cipher + password (slice 24d)
 *   - amneziawg / naive are NOT emitted: classic Clash has no native support
 *     and Clash Meta's experimental wireguard/naive support diverges per
 *     fork. AmneziaWG users get the wg-quick `.conf` format; Naive users
 *     get the naive+https URI directly.
 *
 * The output is hand-emitted YAML (no js-yaml dep): the schema is fixed and
 * small, and string-based generation gives us bit-for-bit deterministic
 * output across runs (good for diff-testing and avoiding spurious config
 * reloads in clients that hash the body).
 */

// Quote a value with double quotes if it contains anything that would need
// escaping in YAML, otherwise emit it bare. Conservative: passwords, names,
// and reality short-ids may contain `:`, `#`, special chars.
function yamlString(value: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(value)) return value;
  return JSON.stringify(value); // double-quoted, JSON escapes are valid YAML
}

export function buildClashYaml(endpoints: SubscriptionEndpoint[]): string {
  const proxies: string[] = [];
  const proxyNames: string[] = [];

  for (const e of endpoints) {
    const name = `${e.nodeName}-${e.protocol}`;
    if (e.protocol === 'hysteria') {
      proxyNames.push(name);
      const lines = [
        `  - name: ${yamlString(name)}`,
        `    type: hysteria2`,
        `    server: ${e.host}`,
        `    port: ${e.port}`,
        `    password: ${yamlString(e.password)}`,
      ];
      if (e.obfsPassword) {
        lines.push(
          `    obfs: salamander`,
          `    obfs-password: ${yamlString(e.obfsPassword)}`,
        );
      }
      // Slice 31.5 — Clash Meta (mihomo) port-hopping. The `ports` key
      // accepts a `START-END` (hyphen) or comma-list form; we emit the
      // hyphen form to match the URI's `mport`. Server-side iptables
      // REDIRECT range must cover this.
      if (
        typeof e.portHoppingStart === 'number' &&
        typeof e.portHoppingEnd === 'number'
      ) {
        lines.push(`    ports: ${e.portHoppingStart}-${e.portHoppingEnd}`);
      }
      proxies.push(lines.join('\n'));
    } else if (e.protocol === 'xray') {
      proxyNames.push(name);
      // Slice 24c part 3a — Trojan subprotocol shares REALITY but switches
      // proxy type and the auth field.
      const isTrojan = e.subprotocol === 'trojan';
      // Slice 24c part 2 — Clash Meta `network` field accepts the same
      // transport names as our wire (raw is "tcp" in clash terminology).
      const network = e.network === 'raw' || !e.network ? 'tcp' : e.network;

      const block = [
        `  - name: ${yamlString(name)}`,
        `    type: ${isTrojan ? 'trojan' : 'vless'}`,
        `    server: ${e.host}`,
        `    port: ${e.port}`,
        isTrojan
          ? `    password: ${yamlString(e.uuid)}`
          : `    uuid: ${e.uuid}`,
        `    network: ${network}`,
        `    tls: true`,
        `    udp: true`,
        `    servername: ${yamlString(e.sni)}`,
      ];
      // Vision flow is VLESS-only — Clash Meta rejects `flow:` on Trojan.
      if (!isTrojan && e.flow) {
        block.push(`    flow: ${yamlString(e.flow)}`);
      }
      // Slice 30.1 follow-up — per-host alpn (`['h2','http/1.1']`) +
      // skip-cert-verify. Clash Meta uses `alpn:` as a flow-style YAML list
      // and `skip-cert-verify: true` for the CDN-fronted host case. Mihomo
      // also accepts `tls: false` to disable client TLS when the host fronts
      // via a CDN that terminates TLS itself (`securityLayer: 'none'`).
      if (e.alpn && e.alpn.length > 0) {
        block.push(`    alpn: [${e.alpn.map((a) => yamlString(a)).join(', ')}]`);
      }
      if (e.allowInsecure) {
        block.push(`    skip-cert-verify: true`);
      }
      block.push(
        `    client-fingerprint: ${yamlString(e.fingerprint)}`,
        `    reality-opts:`,
        `      public-key: ${yamlString(e.publicKey)}`,
        `      short-id: ${yamlString(e.shortId)}`,
      );
      // Transport-specific options for ws/httpupgrade. Clash Meta accepts
      // the underscore-less `httpupgrade` form on modern Mihomo (≥1.18);
      // older builds wanted `http-upgrade`, but we don't target those.
      // grpc has its own block below.
      if (network === 'ws' || network === 'httpupgrade') {
        const optsKey = `${network}-opts`;
        const opts: string[] = [];
        if (e.path) opts.push(`      path: ${yamlString(e.path)}`);
        if (e.hostHeader) {
          if (network === 'ws') {
            opts.push(`      headers:`);
            opts.push(`        Host: ${yamlString(e.hostHeader)}`);
          } else {
            opts.push(`      host: ${yamlString(e.hostHeader)}`);
          }
        }
        if (opts.length > 0) {
          block.push(`    ${optsKey}:`);
          block.push(...opts);
        }
      }
      if (network === 'grpc' && e.serviceName) {
        block.push(`    grpc-opts:`);
        block.push(`      grpc-service-name: ${yamlString(e.serviceName)}`);
      }

      proxies.push(block.join('\n'));
    } else if (e.protocol === 'shadowsocks') {
      // Slice 24d — Clash Meta uses `type: ss` with a `cipher` field that
      // matches our `method` exactly (clash and xray share the SS2022 names).
      proxyNames.push(name);
      proxies.push(
        [
          `  - name: ${yamlString(name)}`,
          `    type: ss`,
          `    server: ${e.host}`,
          `    port: ${e.port}`,
          `    cipher: ${yamlString(e.method)}`,
          `    password: ${yamlString(e.password)}`,
          `    udp: true`,
        ].join('\n'),
      );
    }
  }

  const lines: string[] = [];
  lines.push('proxies:');
  if (proxies.length === 0) {
    lines.push('  []');
  } else {
    lines.push(...proxies);
  }
  lines.push('');

  lines.push('proxy-groups:');
  if (proxyNames.length > 0) {
    lines.push('  - name: Auto');
    lines.push('    type: url-test');
    lines.push('    url: http://www.gstatic.com/generate_204');
    lines.push('    interval: 300');
    lines.push('    proxies:');
    for (const n of proxyNames) {
      lines.push(`      - ${yamlString(n)}`);
    }
  } else {
    lines.push('  []');
  }
  lines.push('');

  lines.push('rules:');
  lines.push(proxyNames.length > 0 ? '  - MATCH,Auto' : '  - MATCH,DIRECT');

  return lines.join('\n') + '\n';
}
