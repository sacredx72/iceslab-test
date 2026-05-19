package hysteria

import "net"

// closableListener is the subset of net.Listener http.Server.Serve needs.
type closableListener interface {
	net.Listener
}

func netListen(addr string) (net.Listener, error) {
	return net.Listen("tcp", addr)
}
