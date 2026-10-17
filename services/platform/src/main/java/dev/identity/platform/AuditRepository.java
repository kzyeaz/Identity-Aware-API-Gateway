package dev.identity.platform;

import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface AuditRepository extends MongoRepository<AuditEvent, String> {
    List<AuditEvent> findTop50ByOrderByTimeDesc();
}
