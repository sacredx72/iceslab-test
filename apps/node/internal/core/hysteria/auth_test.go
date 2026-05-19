package hysteria

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/icecompany-tech/iceslab/apps/node/internal/core"
)

func TestAuthCallbackAcceptsKnownPassword(t *testing.T) {
	a := newTestAdapter(t)
	_ = a.AddUser(core.User{
		UserID:           "u-42",
		Username:         "carol",
		HysteriaPassword: "secret-pw",
	})

	body := `{"addr":"1.2.3.4:5678","auth":"secret-pw","tx":0}`
	req := httptest.NewRequest(http.MethodPost, "/auth", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	a.handleAuthCallback(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: got %d want 200", rr.Code)
	}
	var resp AuthResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !resp.OK {
		t.Errorf("ok: got false want true")
	}
	if resp.ID != "u-42" {
		t.Errorf("id: got %q want u-42", resp.ID)
	}
}

func TestAuthCallbackRejectsUnknownPassword(t *testing.T) {
	a := newTestAdapter(t)

	body := `{"addr":"1.2.3.4:5678","auth":"unknown","tx":0}`
	req := httptest.NewRequest(http.MethodPost, "/auth", strings.NewReader(body))
	rr := httptest.NewRecorder()
	a.handleAuthCallback(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: got %d want 200", rr.Code)
	}
	var resp AuthResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.OK {
		t.Errorf("ok: got true want false (unknown password)")
	}
}

func TestAuthCallbackRejectsRotatedPassword(t *testing.T) {
	a := newTestAdapter(t)
	_ = a.AddUser(core.User{UserID: "u-1", HysteriaPassword: "old"})
	_ = a.RemoveUser("u-1")
	_ = a.AddUser(core.User{UserID: "u-1", HysteriaPassword: "new"})

	body := `{"addr":"1.2.3.4:5","auth":"old","tx":0}`
	req := httptest.NewRequest(http.MethodPost, "/auth", strings.NewReader(body))
	rr := httptest.NewRecorder()
	a.handleAuthCallback(rr, req)

	var resp AuthResponse
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if resp.OK {
		t.Errorf("rotated-out password should be rejected")
	}
}

func TestAuthCallbackRejectsGet(t *testing.T) {
	a := newTestAdapter(t)
	req := httptest.NewRequest(http.MethodGet, "/auth", nil)
	rr := httptest.NewRecorder()
	a.handleAuthCallback(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("status: got %d want 405", rr.Code)
	}
}

func TestAuthCallbackRejectsInvalidJSON(t *testing.T) {
	a := newTestAdapter(t)
	req := httptest.NewRequest(http.MethodPost, "/auth", strings.NewReader("{ broken"))
	rr := httptest.NewRecorder()
	a.handleAuthCallback(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("status: got %d want 400", rr.Code)
	}
}
