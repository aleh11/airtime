package store_test

import "testing"

func TestStatusValueRoundTripsJSON(t *testing.T) {
	s := openTemp(t)

	if err := s.SetStatus("services", "txtempus_details", map[string]any{"service": "DCF77", "duration": 30}); err != nil {
		t.Fatalf("set: %v", err)
	}

	var got map[string]any
	ok, err := s.Status("services", "txtempus_details", &got)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !ok {
		t.Fatal("status reported missing after write")
	}
	if got["service"] != "DCF77" {
		t.Fatalf("got %+v, want service DCF77", got)
	}
}

func TestStatusBoolRoundTrips(t *testing.T) {
	s := openTemp(t)

	if err := s.SetStatus("services", "txtempus_running", true); err != nil {
		t.Fatalf("set: %v", err)
	}

	var running bool
	if _, err := s.Status("services", "txtempus_running", &running); err != nil {
		t.Fatalf("get: %v", err)
	}
	if !running {
		t.Fatal("got false, want true")
	}
}

func TestMissingStatusLeavesTargetUntouched(t *testing.T) {
	s := openTemp(t)

	running := true
	ok, err := s.Status("services", "never_written", &running)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("reported a status that was never written")
	}
	if !running {
		t.Fatal("target was overwritten for a missing status")
	}
}
