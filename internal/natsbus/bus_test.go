package natsbus

import "testing"

func TestParseURL(t *testing.T) {
	settings, err := parseURL("nats://user:pass@example.com:4222")
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	if settings.address != "example.com:4222" || settings.username != "user" || settings.password != "pass" {
		t.Fatalf("unexpected settings: %+v", settings)
	}
}

func TestParseURLRejectsUnsupportedScheme(t *testing.T) {
	if _, err := parseURL("http://localhost:4222"); err == nil {
		t.Fatal("expected unsupported scheme to fail")
	}
}

func TestJetStreamPublishSubject(t *testing.T) {
	got := jetStreamPublishSubject("MICROSEEM_LOGS", "logs.raw")
	want := "$JS.API.PUB.MICROSEEM_LOGS.logs.raw"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestValidatePublishAck(t *testing.T) {
	if err := validatePublishAck([]byte(`{"stream":"MICROSEEM_LOGS","seq":42}`)); err != nil {
		t.Fatalf("expected valid ack: %v", err)
	}

	if err := validatePublishAck([]byte(`{"error":{"description":"boom"}}`)); err == nil {
		t.Fatal("expected errored ack to fail")
	}

	if err := validatePublishAck([]byte(`{"stream":"MICROSEEM_LOGS","seq":0}`)); err == nil {
		t.Fatal("expected seq=0 ack to fail")
	}
}
