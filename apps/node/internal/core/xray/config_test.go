package xray

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validInbound() InboundConfig {
	return InboundConfig{
		RealityDest:        "www.cloudflare.com:443",
		RealityServerNames: []string{"www.cloudflare.com"},
		RealityPrivateKey:  "fake-private-key-for-testing",
		RealityShortIDs:    []string{"abc123"},
	}
}

func TestInboundValidation(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*InboundConfig)
		wantErr string
	}{
		{"missing private key", func(c *InboundConfig) { c.RealityPrivateKey = "" }, "RealityPrivateKey"},
		{"missing server names", func(c *InboundConfig) { c.RealityServerNames = nil }, "RealityServerNames"},
		{"missing short IDs", func(c *InboundConfig) { c.RealityShortIDs = nil }, "RealityShortIDs"},
		{"missing dest", func(c *InboundConfig) { c.RealityDest = "" }, "RealityDest"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := validInbound()
			tc.mutate(&cfg)
			if err := cfg.validate(); err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("validate: got %v, want error containing %q", err, tc.wantErr)
			}
		})
	}
}

func TestInboundDefaults(t *testing.T) {
	cfg := InboundConfig{
		RealityDest:        "x.com:443",
		RealityServerNames: []string{"x.com"},
		RealityPrivateKey:  "k",
		RealityShortIDs:    []string{"s"},
	}
	d := cfg.withDefaults()
	if d.Tag != "vless-in" {
		t.Errorf("Tag default: got %q", d.Tag)
	}
	if d.ListenHost != "0.0.0.0" {
		t.Errorf("ListenHost default: got %q", d.ListenHost)
	}
	if d.ListenPort != 443 {
		t.Errorf("ListenPort default: got %d", d.ListenPort)
	}
	// Flow is no longer defaulted — empty is the canonical "no Vision"
	// value for non-raw transports. Panel sets it explicitly when needed.
	if d.Flow != "" {
		t.Errorf("Flow default: got %q, want empty", d.Flow)
	}
}

func TestRenderConfigShape(t *testing.T) {
	users := []xrayClient{
		{ID: "uuid-1", Email: "user-a", Flow: "xtls-rprx-vision"},
		{ID: "uuid-2", Email: "user-b", Flow: "xtls-rprx-vision"},
	}
	blob, err := renderConfig(validInbound(), users)
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(blob, &parsed); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}

	inbounds, ok := parsed["inbounds"].([]any)
	// Slice 24c: render now emits two inbounds — the public VLESS one and a
	// dedicated `api-in` (dokodemo-door on 127.0.0.1:8080) that exposes
	// StatsService for `xray api statsquery`. Find the VLESS inbound by tag.
	if !ok || len(inbounds) != 2 {
		t.Fatalf("expected 2 inbounds (vless + api-in), got %v", parsed["inbounds"])
	}
	var inb map[string]any
	for _, raw := range inbounds {
		m := raw.(map[string]any)
		if m["protocol"] == "vless" {
			inb = m
			break
		}
	}
	if inb == nil {
		t.Fatalf("vless inbound not found in render output")
	}
	stream := inb["streamSettings"].(map[string]any)
	if stream["network"] != "raw" {
		t.Errorf("network: got %v want raw (v24.9.30 naming)", stream["network"])
	}
	if stream["security"] != "reality" {
		t.Errorf("security: got %v want reality", stream["security"])
	}
	settings := inb["settings"].(map[string]any)
	clients := settings["clients"].([]any)
	if len(clients) != 2 {
		t.Errorf("clients: got %d want 2", len(clients))
	}

	// Slice 24c — verify stats wiring is present
	if _, ok := parsed["stats"]; !ok {
		t.Errorf("stats block missing from rendered config")
	}
	api, ok := parsed["api"].(map[string]any)
	if !ok || api["tag"] != "api" {
		t.Errorf("api block missing/wrong: %v", parsed["api"])
	}
	policy := parsed["policy"].(map[string]any)
	levels := policy["levels"].(map[string]any)
	level0 := levels["0"].(map[string]any)
	if level0["statsUserUplink"] != true || level0["statsUserDownlink"] != true {
		t.Errorf("policy.levels.0 missing per-user stats flags: %v", level0)
	}
}

func TestRenderConfigEmptyClients(t *testing.T) {
	blob, err := renderConfig(validInbound(), []xrayClient{})
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	if !strings.Contains(string(blob), `"clients": []`) {
		t.Errorf("expected empty clients array in: %s", string(blob))
	}
}

func TestRenderConfigPropagatesValidationError(t *testing.T) {
	bad := validInbound()
	bad.RealityPrivateKey = ""
	if _, err := renderConfig(bad, nil); err == nil {
		t.Errorf("expected validation error to propagate")
	}
}

func TestWriteConfigAtomic(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "config.json")
	blob := []byte(`{"hello":"world"}`)
	if err := writeConfig(path, blob); err != nil {
		t.Fatalf("writeConfig: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(got) != string(blob) {
		t.Errorf("content mismatch: got %q", string(got))
	}
	// Temp file should be cleaned up after rename.
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("temp file lingered: %v", err)
	}
}

// ───── Slice 24c part 2: routing defaults + sockopt + transport branches ─────

func renderToMap(t *testing.T, cfg InboundConfig) map[string]any {
	t.Helper()
	blob, err := renderConfig(cfg, []xrayClient{{ID: "u1", Email: "u1"}})
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(blob, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return m
}

func TestRender_RoutingDefaults_SniffingOnVlessInbound(t *testing.T) {
	m := renderToMap(t, validInbound())
	inbounds := m["inbounds"].([]any)
	for _, raw := range inbounds {
		inb := raw.(map[string]any)
		if inb["protocol"] == "vless" {
			sn := inb["sniffing"].(map[string]any)
			if sn["enabled"] != true {
				t.Errorf("sniffing should be enabled on vless inbound")
			}
			dest := sn["destOverride"].([]any)
			if len(dest) != 3 {
				t.Errorf("destOverride should have 3 entries, got %v", dest)
			}
		}
	}
}

func TestRender_RoutingDefaults_DnsOutAndBlackhole(t *testing.T) {
	m := renderToMap(t, validInbound())
	outbounds := m["outbounds"].([]any)
	tags := map[string]bool{}
	for _, raw := range outbounds {
		ob := raw.(map[string]any)
		tags[ob["tag"].(string)] = true
	}
	if !tags["direct"] || !tags["dns-out"] || !tags["blocked"] {
		t.Errorf("expected tags direct/dns-out/blocked, got %v", tags)
	}
}

func TestRender_RoutingDefaults_BlockRules(t *testing.T) {
	m := renderToMap(t, validInbound())
	routing := m["routing"].(map[string]any)
	rules := routing["rules"].([]any)

	var dnsRule, btRule, smtpRule bool
	for _, raw := range rules {
		r := raw.(map[string]any)
		out := r["outboundTag"]
		if protocols, ok := r["protocol"].([]any); ok {
			for _, p := range protocols {
				if p == "dns" && out == "dns-out" {
					dnsRule = true
				}
				if p == "bittorrent" && out == "blocked" {
					btRule = true
				}
			}
		}
		if r["port"] == "25" && out == "blocked" {
			smtpRule = true
		}
	}
	if !dnsRule {
		t.Errorf("missing dns→dns-out routing rule")
	}
	if !btRule {
		t.Errorf("missing bittorrent→blocked routing rule")
	}
	if !smtpRule {
		t.Errorf("missing port:25→blocked routing rule")
	}
}

func TestRender_DirectOutboundUsesBBR(t *testing.T) {
	m := renderToMap(t, validInbound())
	outbounds := m["outbounds"].([]any)
	for _, raw := range outbounds {
		ob := raw.(map[string]any)
		if ob["tag"] == "direct" {
			ss, ok := ob["streamSettings"].(map[string]any)
			if !ok {
				t.Errorf("direct outbound missing streamSettings")
				return
			}
			sock := ss["sockopt"].(map[string]any)
			if sock["tcpCongestion"] != "bbr" {
				t.Errorf("direct outbound should set tcpCongestion=bbr, got %v", sock["tcpCongestion"])
			}
			if sock["tcpFastOpen"] != true {
				t.Errorf("direct outbound should set tcpFastOpen=true")
			}
		}
	}
}

func TestRender_Network_WSEmitsWsSettings(t *testing.T) {
	cfg := validInbound()
	cfg.Network = "ws"
	cfg.Path = "/vless"
	cfg.HostHeader = "cdn.example.com"
	m := renderToMap(t, cfg)
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] != "vless" {
			continue
		}
		ss := inb["streamSettings"].(map[string]any)
		if ss["network"] != "ws" {
			t.Errorf("network: got %v want ws", ss["network"])
		}
		ws, ok := ss["wsSettings"].(map[string]any)
		if !ok {
			t.Fatalf("wsSettings missing")
		}
		if ws["path"] != "/vless" {
			t.Errorf("ws path: got %v want /vless", ws["path"])
		}
		headers := ws["headers"].(map[string]any)
		if headers["Host"] != "cdn.example.com" {
			t.Errorf("ws Host header: got %v", headers["Host"])
		}
	}
}

func TestRender_Network_HTTPUpgradeEmitsHttpupgradeSettings(t *testing.T) {
	cfg := validInbound()
	cfg.Network = "httpupgrade"
	cfg.Path = "/u"
	m := renderToMap(t, cfg)
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] != "vless" {
			continue
		}
		ss := inb["streamSettings"].(map[string]any)
		if ss["network"] != "httpupgrade" {
			t.Errorf("network: got %v", ss["network"])
		}
		hu, ok := ss["httpupgradeSettings"].(map[string]any)
		if !ok {
			t.Fatalf("httpupgradeSettings missing")
		}
		if hu["path"] != "/u" {
			t.Errorf("httpupgrade path: got %v", hu["path"])
		}
	}
}

func TestRender_Network_KCPEmitsKcpSettings(t *testing.T) {
	cfg := validInbound()
	cfg.Network = "kcp"
	m := renderToMap(t, cfg)
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] != "vless" {
			continue
		}
		ss := inb["streamSettings"].(map[string]any)
		if ss["network"] != "kcp" {
			t.Errorf("network: got %v", ss["network"])
		}
		if _, ok := ss["kcpSettings"].(map[string]any); !ok {
			t.Errorf("kcpSettings missing")
		}
	}
}

func TestRender_Network_GrpcEmitsServiceName(t *testing.T) {
	cfg := validInbound()
	cfg.Network = "grpc"
	cfg.ServiceName = "GunSvc"
	m := renderToMap(t, cfg)
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] != "vless" {
			continue
		}
		ss := inb["streamSettings"].(map[string]any)
		grpc := ss["grpcSettings"].(map[string]any)
		if grpc["serviceName"] != "GunSvc" {
			t.Errorf("serviceName: got %v", grpc["serviceName"])
		}
	}
}

// ───── Slice 24c part 3: Trojan subprotocol ─────

func TestRender_DefaultsToVless(t *testing.T) {
	m := renderToMap(t, validInbound())
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["tag"] == "vless-in" || inb["tag"] == "" {
			if inb["protocol"] != "vless" {
				t.Errorf("default subprotocol should be vless, got %v", inb["protocol"])
			}
		}
	}
}

func TestRender_TrojanInboundProtocol(t *testing.T) {
	cfg := validInbound()
	cfg.Subprotocol = "trojan"
	m := renderToMap(t, cfg)

	var trojanInb map[string]any
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] == "trojan" {
			trojanInb = inb
			break
		}
	}
	if trojanInb == nil {
		t.Fatalf("trojan inbound not found in render")
	}

	settings := trojanInb["settings"].(map[string]any)
	clients := settings["clients"].([]any)
	if len(clients) != 1 {
		t.Fatalf("expected 1 client, got %d", len(clients))
	}
	c := clients[0].(map[string]any)
	if c["password"] != "u1" {
		t.Errorf("trojan client should have password=ID, got %v", c["password"])
	}
	if _, hasID := c["id"]; hasID {
		t.Errorf("trojan client should NOT have `id` field, only `password`")
	}
	// Trojan also doesn't carry the VLESS-only `decryption: none`
	if _, hasDec := settings["decryption"]; hasDec {
		t.Errorf("trojan settings should NOT have `decryption` field")
	}
}

func TestRender_Trojan_StillUsesRealityStreamSettings(t *testing.T) {
	cfg := validInbound()
	cfg.Subprotocol = "trojan"
	m := renderToMap(t, cfg)
	for _, raw := range m["inbounds"].([]any) {
		inb := raw.(map[string]any)
		if inb["protocol"] != "trojan" {
			continue
		}
		ss := inb["streamSettings"].(map[string]any)
		if ss["security"] != "reality" {
			t.Errorf("trojan should still use REALITY security, got %v", ss["security"])
		}
		// Reality settings should contain server names + private key
		rs := ss["realitySettings"].(map[string]any)
		if rs["privateKey"] != "fake-private-key-for-testing" {
			t.Errorf("trojan should preserve REALITY private key")
		}
	}
}
