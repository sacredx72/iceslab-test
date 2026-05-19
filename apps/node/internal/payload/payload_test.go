package payload

import (
	"strings"
	"testing"
)

func TestDecodeRoundtrip(t *testing.T) {
	original := &Payload{
		NodeCertPem: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----\n",
		NodeKeyPem:  "-----BEGIN PRIVATE KEY-----\nBBB\n-----END PRIVATE KEY-----\n",
		CACertPem:   "-----BEGIN CERTIFICATE-----\nCCC\n-----END CERTIFICATE-----\n",
	}

	encoded, err := Encode(original)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if strings.ContainsAny(encoded, "+/=") {
		t.Errorf("encoded blob is not base64url-safe: %q", encoded)
	}

	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decoded.NodeCertPem != original.NodeCertPem {
		t.Errorf("nodeCertPem mismatch")
	}
	if decoded.NodeKeyPem != original.NodeKeyPem {
		t.Errorf("nodeKeyPem mismatch")
	}
	if decoded.CACertPem != original.CACertPem {
		t.Errorf("caCertPem mismatch")
	}
}

func TestDecodeRejectsInvalidBase64(t *testing.T) {
	if _, err := Decode("not!!!base64"); err == nil {
		t.Errorf("expected error for invalid base64")
	}
}

func TestDecodeRejectsInvalidJSON(t *testing.T) {
	// "this is not json" base64url-encoded
	if _, err := Decode("dGhpcyBpcyBub3QganNvbg"); err == nil {
		t.Errorf("expected error for non-JSON content")
	}
}

func TestDecodeRejectsMissingFields(t *testing.T) {
	encoded, err := Encode(&Payload{NodeCertPem: "only-cert"})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if _, err := Decode(encoded); err == nil {
		t.Errorf("expected error when nodeKeyPem and caCertPem are missing")
	}
}

func TestDecodeAcceptsPaddedBase64URL(t *testing.T) {
	// Standard URL-safe base64 (with padding) should also work.
	original := &Payload{
		NodeCertPem: "x",
		NodeKeyPem:  "y",
		CACertPem:   "z",
	}
	raw, err := Encode(original)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	// Pad the raw url-safe blob.
	padded := raw
	for len(padded)%4 != 0 {
		padded += "="
	}
	if _, err := Decode(padded); err != nil {
		t.Errorf("expected padded base64url to decode, got: %v", err)
	}
}
