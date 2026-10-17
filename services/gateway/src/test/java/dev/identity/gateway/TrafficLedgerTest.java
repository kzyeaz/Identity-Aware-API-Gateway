package dev.identity.gateway;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class TrafficLedgerTest {
    @Test void boundsMemoryWhileKeepingLifetimeCountsAndRecentP95() {
        TrafficLedger ledger = new TrafficLedger();
        assertThat(ledger.snapshot().get("p95")).isEqualTo(0.0);
        for (int i = 1; i <= 120; i++) ledger.record("id-" + i, "GET", "/api/projects", 200, i);
        ledger.record("denied", "GET", "/api/projects", 401, 1);
        ledger.record("forbidden", "POST", "/api/projects", 403, 2);
        ledger.record("limit", "GET", "/api/projects", 429, 3);
        ledger.record("upstream", "GET", "/api/projects", 502, 4);
        var snapshot = ledger.snapshot();
        assertThat(snapshot.get("total")).isEqualTo(124L);
        assertThat(snapshot.get("allowed")).isEqualTo(120L);
        assertThat(snapshot.get("denied")).isEqualTo(2L);
        assertThat(snapshot.get("limited")).isEqualTo(1L);
        assertThat((List<?>) snapshot.get("events")).hasSize(100);
        assertThat(snapshot.get("p95")).isEqualTo(115.0);
    }
}
