package dev.identity.platform;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.*;

@RestController
public class ProjectController {
    public record CreateProject(@NotBlank @Size(max = 80) String name, @NotNull @Size(max = 280) String description) {}
    private final ProjectService projects;
    private final AuditRepository audit;
    public ProjectController(ProjectService projects, AuditRepository audit) { this.projects = projects; this.audit = audit; }

    @GetMapping("/api/projects")
    List<Project> list(@AuthenticationPrincipal Jwt jwt) { return projects.list(jwt.getSubject()); }

    @GetMapping("/api/projects/{id}")
    Project get(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) { return projects.get(id, jwt.getSubject()); }

    @PostMapping("/api/projects")
    ResponseEntity<Project> create(@Valid @RequestBody CreateProject body, @AuthenticationPrincipal Jwt jwt,
                                   @RequestHeader(value = "X-Request-Id", defaultValue = "direct") String requestId) {
        Project project = projects.create(jwt.getSubject(), body.name(), body.description(), requestId);
        return ResponseEntity.created(URI.create("/api/projects/" + project.getId())).body(project);
    }

    @GetMapping("/api/platform/audit")
    List<AuditEvent> audit() { return audit.findTop50ByOrderByTimeDesc(); }
}
