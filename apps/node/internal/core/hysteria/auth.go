package hysteria

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// AuthRequest is what Hysteria POSTs to our /auth callback URL.
// Schema: https://v2.hysteria.network/docs/advanced/Server/#http
type AuthRequest struct {
	Addr string `json:"addr"`
	Auth string `json:"auth"`
	Tx   int64  `json:"tx"`
}

// AuthResponse is what Hysteria expects back. `id` is opaque and gets logged
// by Hysteria for the connection — we use the panel user UUID.
type AuthResponse struct {
	OK bool   `json:"ok"`
	ID string `json:"id,omitempty"`
}

// startAuthCallback launches the local HTTP server that Hysteria's
// `auth.type: http` callback hits on every client connection.
func (a *Adapter) startAuthCallback() error {
	mux := http.NewServeMux()
	mux.HandleFunc(a.cfg.AuthCallbackPath, a.handleAuthCallback)

	a.callbackSrv = &http.Server{
		Addr:              fmt.Sprintf("%s:%d", a.cfg.AuthCallbackHost, a.cfg.AuthCallbackPort),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ln, err := listen(a.callbackSrv.Addr)
	if err != nil {
		return err
	}

	go func() {
		a.logger.Info("hysteria auth callback listening", "addr", a.callbackSrv.Addr)
		if err := a.callbackSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			a.logger.Error("hysteria auth callback failed", "err", err)
		}
	}()
	return nil
}

func (a *Adapter) stopAuthCallback(ctx context.Context) error {
	if a.callbackSrv == nil {
		return nil
	}
	shutCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	err := a.callbackSrv.Shutdown(shutCtx)
	a.callbackSrv = nil
	return err
}

func (a *Adapter) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	userID, ok := a.LookupByPassword(req.Auth)
	if !ok {
		a.logger.Info("hysteria auth rejected", "addr", req.Addr)
		writeAuthJSON(w, AuthResponse{OK: false})
		return
	}
	a.logger.Info("hysteria auth accepted", "addr", req.Addr, "userId", userID)
	writeAuthJSON(w, AuthResponse{OK: true, ID: userID})
}

func writeAuthJSON(w http.ResponseWriter, body AuthResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

// listen is split out so tests can swap in `net.Listen("tcp", ":0")` for an
// ephemeral port without reaching into http.Server internals.
var listen = func(addr string) (closableListener, error) {
	ln, err := netListen(addr)
	if err != nil {
		return nil, err
	}
	return ln, nil
}
