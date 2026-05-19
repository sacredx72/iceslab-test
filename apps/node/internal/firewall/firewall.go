// Package firewall manages UFW rules from the agent in lockstep with
// applyInbound. Background: install-iceslab-node.sh opens conventional ports
// (443, 80, 1234) at install time, but the panel UI lets admin pick
// any 1..65535 port for a binding. Without this auto-open, an admin
// picking port 8080 in the UI sees the inbound config applied on the
// agent side (server is listening) yet handshakes drop silently at
// the firewall — exactly the cross-layer class of bug we burned 4 VPS
// on during cycle #6 (subnet collision was its sibling).
//
// Idempotent by design: `ufw allow N/proto` is a no-op when the rule
// already exists. We don't track old ports for cleanup — leftover
// ufw rules from past port changes are harmless (just a few extra
// ALLOW lines). Add `--delete` logic only if a real operator
// complains about firewall noise.
package firewall

import (
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"time"
)

// Allow opens an inbound UFW rule for the given (port, proto).
// proto must be "tcp" or "udp". Returns nil on success OR when ufw
// isn't installed — agents on hosts without ufw shouldn't fail
// applyInbound just because of firewall management.
func Allow(ctx context.Context, logger *slog.Logger, port int, proto string) {
	if port <= 0 || port > 65535 {
		logger.Warn("firewall.Allow: invalid port, skipping", "port", port)
		return
	}
	if proto != "tcp" && proto != "udp" {
		logger.Warn("firewall.Allow: invalid proto, skipping", "proto", proto)
		return
	}
	if _, err := exec.LookPath("ufw"); err != nil {
		// ufw not installed (e.g. dev container, alpine, custom image).
		// Operators on those hosts manage firewall externally; we don't
		// fail. Logged at debug so it doesn't spam normal deployments.
		logger.Debug("firewall.Allow: ufw not installed, skipping", "spec", fmt.Sprintf("%d/%s", port, proto))
		return
	}
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	spec := fmt.Sprintf("%d/%s", port, proto)
	out, err := exec.CommandContext(cctx, "ufw", "allow", spec).CombinedOutput()
	if err != nil {
		// Non-fatal — agent stays alive, admin can fix UFW manually.
		logger.Warn("firewall.Allow: ufw allow failed",
			"spec", spec, "err", err, "out", string(out))
		return
	}
	logger.Info("firewall.Allow: rule ensured", "spec", spec)
}
