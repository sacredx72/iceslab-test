package amneziawg

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validInbound() InboundConfig {
	return InboundConfig{
		PrivateKey: "fake-server-priv-base64",
		Address:    "10.66.66.1/24",
		Jc:         4, Jmin: 40, Jmax: 70,
		S1: 72, S2: 56, S3: 32, S4: 16,
		H1: 100, H2: 200, H3: 300, H4: 400,
	}
}

func TestInboundDefaults(t *testing.T) {
	// Pass an explicitly-zero InboundConfig — withDefaults() should fill
	// install-time fallbacks (Interface, ListenPort, PostUp/Down) but
	// MUST leave junk / magic-size / Address as-is (zero is a legitimate
	// "obfuscation off" value from the panel UI; the panel is always the
	// source of truth for those fields).
	cfg := (&InboundConfig{}).withDefaults()
	if cfg.Interface != "awg0" {
		t.Errorf("Interface default: got %q", cfg.Interface)
	}
	if cfg.ListenPort != 51820 {
		t.Errorf("ListenPort default: got %d", cfg.ListenPort)
	}
	if cfg.Jc != 0 || cfg.Jmin != 0 || cfg.Jmax != 0 {
		t.Errorf("Jc/Jmin/Jmax should remain zero, got %d/%d/%d", cfg.Jc, cfg.Jmin, cfg.Jmax)
	}
	if cfg.S1 != 0 || cfg.S2 != 0 || cfg.S3 != 0 || cfg.S4 != 0 {
		t.Errorf("S1-S4 should remain zero, got %d/%d/%d/%d", cfg.S1, cfg.S2, cfg.S3, cfg.S4)
	}
	if cfg.Address != "" {
		t.Errorf("Address should remain empty, got %q", cfg.Address)
	}
	if !strings.Contains(cfg.PostUp, "MASQUERADE") {
		t.Errorf("PostUp default missing MASQUERADE: %q", cfg.PostUp)
	}
}

func TestInboundValidation(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*InboundConfig)
		wantErr string
	}{
		{"missing private key", func(c *InboundConfig) { c.PrivateKey = "" }, "PrivateKey"},
		{"H1 zero", func(c *InboundConfig) { c.H1 = 0 }, "H1"},
		{"H3 collides with WG default", func(c *InboundConfig) { c.H3 = 3 }, "H3"},
		{"H1 == H2", func(c *InboundConfig) { c.H1 = c.H2 }, "distinct"},
		{"Jmin > Jmax", func(c *InboundConfig) { c.Jmin = 200; c.Jmax = 100 }, "Jmin"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := validInbound()
			tc.mutate(&cfg)
			err := cfg.validate()
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("validate: got %v, want error containing %q", err, tc.wantErr)
			}
		})
	}
}

func TestRenderConfigInterfaceBlock(t *testing.T) {
	out, err := renderConfig(validInbound(), nil)
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	for _, want := range []string{
		"[Interface]",
		"PrivateKey = fake-server-priv-base64",
		"ListenPort = 51820",
		"Address = 10.66.66.1/24",
		"Jc = 4",
		"S1 = 72",
		"H1 = 100",
		"H4 = 400",
		"PostUp = iptables",
		"PostDown = iptables",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("rendered config missing %q. Output:\n%s", want, out)
		}
	}
	// No peers → no [Peer] sections.
	if strings.Contains(out, "[Peer]") {
		t.Errorf("expected no [Peer] block when peer list empty, got:\n%s", out)
	}
}

func TestRenderConfigPeers(t *testing.T) {
	peers := []Peer{
		{PublicKey: "pub-alice", AllowedIP: "10.0.0.2/32"},
		{PublicKey: "pub-bob", AllowedIP: "10.0.0.3/32"},
	}
	out, err := renderConfig(validInbound(), peers)
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	if strings.Count(out, "[Peer]") != 2 {
		t.Errorf("expected 2 [Peer] blocks, got %d. Output:\n%s", strings.Count(out, "[Peer]"), out)
	}
	for _, want := range []string{
		"PublicKey = pub-alice",
		"AllowedIPs = 10.0.0.2/32",
		"PublicKey = pub-bob",
		"AllowedIPs = 10.0.0.3/32",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestRenderConfigRejectsEmptyPeerFields(t *testing.T) {
	peers := []Peer{{PublicKey: "", AllowedIP: "10.0.0.2/32"}}
	if _, err := renderConfig(validInbound(), peers); err == nil {
		t.Errorf("expected error for empty PublicKey")
	}
}

func TestRenderConfigPropagatesValidationError(t *testing.T) {
	bad := validInbound()
	bad.PrivateKey = ""
	if _, err := renderConfig(bad, nil); err == nil {
		t.Errorf("expected validation error to propagate")
	}
}

func TestWriteConfigAtomic(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "etc", "amneziawg", "awg0.conf")
	blob := "[Interface]\nPrivateKey = secret\n"
	if err := writeConfig(path, blob); err != nil {
		t.Fatalf("writeConfig: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(got) != blob {
		t.Errorf("content mismatch: got %q want %q", string(got), blob)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Errorf("expected 0600 perms (config holds private key), got %o", mode)
	}
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("temp file lingered: %v", err)
	}
}
