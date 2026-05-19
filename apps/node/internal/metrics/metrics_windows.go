//go:build windows

package metrics

import (
	"errors"
	"runtime"
)

// Windows is dev-only; production node-agents always run on Linux. We return
// zero-valued snapshots and a sentinel error so the rest of the agent boots
// cleanly on a Windows dev box. The /metrics endpoint will surface the error
// via 503, panel side will treat it as "metrics unavailable".
var errUnsupported = errors.New("host metrics: not implemented on windows")

func (c *Collector) collectCPU() (CPUMetrics, error) {
	return CPUMetrics{Cores: runtime.NumCPU()}, errUnsupported
}

func readMemInfo() (MemoryMetrics, error) {
	return MemoryMetrics{}, errUnsupported
}

func statDisk(path string) (DiskMetrics, error) {
	return DiskMetrics{Path: path}, errUnsupported
}
