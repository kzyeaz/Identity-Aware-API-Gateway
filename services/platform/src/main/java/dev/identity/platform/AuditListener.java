package dev.identity.platform;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

@Component
public class AuditListener {
    private static final Logger log = LoggerFactory.getLogger(AuditListener.class);
    private final AuditRepository audit;
    private final MeterRegistry metrics;
    public AuditListener(AuditRepository audit, MeterRegistry metrics) { this.audit = audit; this.metrics = metrics; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(AuditEvent event) {
        // Mongo is an independent store. Do not return a false write failure after PostgreSQL commits.
        // A production version should use a transactional outbox for durable delivery.
        try { audit.save(event); }
        catch (RuntimeException failure) {
            metrics.counter("identity.audit.write.failures").increment();
            log.warn("Audit persistence failed for request {}; project committed", event.requestId());
        }
    }
}
