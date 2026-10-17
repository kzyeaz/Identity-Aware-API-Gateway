package dev.identity.gateway;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class OverviewController {
    private final TrafficLedger ledger;
    public OverviewController(TrafficLedger ledger) { this.ledger = ledger; }

    @GetMapping("/gateway/overview")
    Map<String, Object> overview() { return ledger.snapshot(); }
}
