package dev.identity.platform;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProjectServiceTest {
    @Test void failedProjectWritesDoNotPublishAuditEvents() {
        ProjectRepository projects = mock(ProjectRepository.class);
        ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
        when(projects.save(any())).thenThrow(new IllegalStateException("database unavailable"));
        assertThatThrownBy(() -> new ProjectService(projects, publisher).create("alice", "test", "", "request"))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(publisher);
    }
    @Test void auditFailureIsCountedWithoutFailingAnAlreadyCommittedWrite() {
        AuditRepository repository = mock(AuditRepository.class);
        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        AuditListener listener = new AuditListener(repository, metrics);
        AuditEvent event = new AuditEvent(UUID.randomUUID().toString(), "alice", "project.created", "project-id", "req", Instant.now());
        when(repository.save(any())).thenThrow(new IllegalStateException("Mongo unavailable"));
        assertThatCode(() -> listener.onCreated(event)).doesNotThrowAnyException();
        assertThat(metrics.counter("identity.audit.write.failures").count()).isEqualTo(1);
    }
    @Test void auditSuccessDoesNotCountAFailure() {
        AuditRepository repository = mock(AuditRepository.class);
        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        AuditEvent event = new AuditEvent("id", "alice", "project.created", "project", "req", Instant.now());
        new AuditListener(repository, metrics).onCreated(event);
        verify(repository).save(event);
        assertThat(metrics.find("identity.audit.write.failures").counter()).isNull();
    }
}
