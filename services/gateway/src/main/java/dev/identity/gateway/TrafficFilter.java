package dev.identity.gateway;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.server.*;
import reactor.core.publisher.Mono;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TrafficFilter implements WebFilter {
    private final TrafficLedger ledger;
    public TrafficFilter(TrafficLedger ledger) { this.ledger = ledger; }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String id = UUID.randomUUID().toString();
        long start = System.nanoTime();
        String path = exchange.getRequest().getPath().value();
        exchange.getResponse().getHeaders().set("X-Request-Id", id);
        exchange.getResponse().getHeaders().set("Cache-Control", "no-store");
        // Exclude dashboard polling from the traffic being demonstrated.
        if (path.startsWith("/api/projects")) {
            exchange.getResponse().beforeCommit(() -> {
                int status = exchange.getResponse().getStatusCode() == null
                        ? 200 : exchange.getResponse().getStatusCode().value();
                ledger.record(id, exchange.getRequest().getMethod().name(), path,
                        status, (System.nanoTime() - start) / 1_000_000.0);
                return Mono.empty();
            });
        }
        return chain.filter(exchange.mutate().request(r -> r.headers(h -> {
            h.set("X-Request-Id", id);
            h.remove("X-User-Id");
            h.remove("X-Tenant-Id");
        })).build());
    }
}
