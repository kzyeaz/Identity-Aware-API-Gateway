package dev.identity.platform;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;

@Service
public class ProjectService {
    private final ProjectRepository projects;
    private final ApplicationEventPublisher events;
    public ProjectService(ProjectRepository projects, ApplicationEventPublisher events) {
        this.projects = projects;
        this.events = events;
    }
    public List<Project> list(String owner) { return projects.findTop50ByOwnerOrderByCreatedAtDesc(owner); }
    public Project get(UUID id, String owner) {
        return projects.findByIdAndOwner(id, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }
    @Transactional
    public Project create(String owner, String name, String description, String requestId) {
        Project project = projects.save(new Project(owner, name.strip(), description.strip()));
        events.publishEvent(new AuditEvent(UUID.randomUUID().toString(), owner, "project.created",
                project.getId().toString(), requestId, Instant.now()));
        return project;
    }
}
