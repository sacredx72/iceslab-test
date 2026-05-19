package mieru

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestInboundDefaults(t *testing.T) {
	cfg := (&InboundConfig{}).withDefaults()
	if cfg.ListenPort != 2012 {
		t.Errorf("ListenPort default: got %d", cfg.ListenPort)
	}
	if cfg.MTU != 1400 {
		t.Errorf("MTU default: got %d", cfg.MTU)
	}
	if cfg.LoggingLevel != "INFO" {
		t.Errorf("LoggingLevel default: got %q", cfg.LoggingLevel)
	}
}

func TestInboundValidation(t *testing.T) {
	cases := []struct {
		name    string
		mut     func(*InboundConfig)
		wantErr string
	}{
		{"MTU too low (below 1280 upstream min)", func(c *InboundConfig) { c.MTU = 1000 }, "out of range"},
		{"MTU too high", func(c *InboundConfig) { c.MTU = 9000 }, "out of range"},
		{"unknown log level", func(c *InboundConfig) { c.LoggingLevel = "TRACE" }, "not in DEBUG"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := InboundConfig{}
			tc.mut(&cfg)
			if err := cfg.validate(); err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("validate: got %v want error containing %q", err, tc.wantErr)
			}
		})
	}
}

// renderToMap parses the JSON output and lets tests poke at fields without
// brittle substring matching.
func renderToMap(t *testing.T, cfg InboundConfig, users []User) map[string]any {
	t.Helper()
	blob, err := renderConfig(cfg, users)
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(blob, &m); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, blob)
	}
	return m
}

func TestRenderConfig_OutputIsJson(t *testing.T) {
	blob, err := renderConfig(InboundConfig{ListenPort: 2012}, nil)
	if err != nil {
		t.Fatalf("renderConfig: %v", err)
	}
	// Must parse as JSON. mita's `apply config` rejects YAML.
	var m map[string]any
	if err := json.Unmarshal(blob, &m); err != nil {
		t.Errorf("output is not valid JSON: %v\n%s", err, blob)
	}
}

func TestRenderConfig_PortBindingsTcpAndUdp(t *testing.T) {
	m := renderToMap(t, InboundConfig{ListenPort: 2012}, nil)
	pb := m["portBindings"].([]any)
	if len(pb) != 2 {
		t.Fatalf("expected 2 port bindings (TCP+UDP), got %d", len(pb))
	}
	tcp := pb[0].(map[string]any)
	udp := pb[1].(map[string]any)
	if tcp["port"] != float64(2012) || tcp["protocol"] != "TCP" {
		t.Errorf("TCP binding: %+v", tcp)
	}
	if udp["port"] != float64(2012) || udp["protocol"] != "UDP" {
		t.Errorf("UDP binding: %+v", udp)
	}
}

func TestRenderConfig_UsersList(t *testing.T) {
	users := []User{
		{Name: "alice", Password: "pw-a"},
		{Name: "bob", Password: "pw-b"},
	}
	m := renderToMap(t, InboundConfig{ListenPort: 2012}, users)
	got := m["users"].([]any)
	if len(got) != 2 {
		t.Fatalf("expected 2 users, got %d", len(got))
	}
	a := got[0].(map[string]any)
	if a["name"] != "alice" || a["password"] != "pw-a" {
		t.Errorf("user[0] mismatch: %+v", a)
	}
	if m["mtu"] != float64(1400) {
		t.Errorf("mtu: got %v want 1400", m["mtu"])
	}
	if m["loggingLevel"] != "INFO" {
		t.Errorf("loggingLevel: got %v want INFO", m["loggingLevel"])
	}
}

func TestRenderConfig_EmptyUsersList(t *testing.T) {
	m := renderToMap(t, InboundConfig{}, nil)
	users, ok := m["users"].([]any)
	if !ok {
		t.Fatalf("users key missing or wrong type: %v", m["users"])
	}
	if len(users) != 0 {
		t.Errorf("empty users should render as []; got %d entries", len(users))
	}
}

func TestRenderConfig_RejectsEmptyUserName(t *testing.T) {
	_, err := renderConfig(InboundConfig{}, []User{{Name: "", Password: "x"}})
	if err == nil || !strings.Contains(err.Error(), "empty user name") {
		t.Errorf("expected empty-name error, got %v", err)
	}
}

func TestRenderConfig_RejectsEmptyUserPassword(t *testing.T) {
	_, err := renderConfig(InboundConfig{}, []User{{Name: "alice", Password: ""}})
	if err == nil || !strings.Contains(err.Error(), "empty user password") {
		t.Errorf("expected empty-password error, got %v", err)
	}
}

func TestSortedUsers_Deterministic(t *testing.T) {
	users := map[string]User{
		"u-c": {Name: "carol", Password: "x"},
		"u-a": {Name: "alice", Password: "x"},
		"u-b": {Name: "bob", Password: "x"},
	}
	got := sortedUsers(users)
	want := []string{"alice", "bob", "carol"}
	for i, name := range want {
		if got[i].Name != name {
			t.Errorf("position %d: got %q want %q", i, got[i].Name, name)
		}
	}
}
