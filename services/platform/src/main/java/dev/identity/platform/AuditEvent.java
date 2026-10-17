package dev.identity.platform;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

@Document("audit_events")
public record AuditEvent(@Id String id, String actor, String action, String resource, String requestId, Instant time) {}
