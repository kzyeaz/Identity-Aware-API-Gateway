package dev.identity.gateway;

import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.LongAdder;

@Component
public class TrafficLedger {
    public record Event(String id, String time, String method, String path, int status, double latencyMs) {}
    private final LongAdder total = new LongAdder();
    private final LongAdder allowed = new LongAdder();
    private final LongAdder denied = new LongAdder();
    private final LongAdder limited = new LongAdder();
    private final ConcurrentLinkedDeque<Event> events = new ConcurrentLinkedDeque<>();
    private final Instant started = Instant.now();

    public void record(String id, String method, String path, int status, double latencyMs) {
        total.increment();
        if (status >= 200 && status < 400) allowed.increment();
        if (status == 401 || status == 403) denied.increment();
        if (status == 429) limited.increment();
        events.addFirst(new Event(id, Instant.now().toString(), method, path, status, latencyMs));
        while (events.size() > 100) events.pollLast();
    }

    public Map<String, Object> snapshot() {
        List<Event> recent = List.copyOf(events);
        double[] latencies = recent.stream().mapToDouble(Event::latencyMs).sorted().toArray();
        double p95 = latencies.length == 0 ? 0 : latencies[(int) Math.ceil(latencies.length * .95) - 1];
        return Map.of("total", total.sum(), "allowed", allowed.sum(), "denied", denied.sum(),
                "limited", limited.sum(), "p95", Math.round(p95 * 10) / 10.0,
                "events", recent, "startedAt", started.toString());
    }
}
