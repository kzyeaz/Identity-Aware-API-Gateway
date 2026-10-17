package dev.identity.platform;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "projects")
public class Project {
    @Id
    private UUID id;
    private String owner;
    private String name;
    private String description;
    @Column(name = "created_at")
    private Instant createdAt;

    protected Project() {}
    public Project(String owner, String name, String description) {
        this.id = UUID.randomUUID();
        this.owner = owner;
        this.name = name;
        this.description = description;
        this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public String getOwner() { return owner; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public Instant getCreatedAt() { return createdAt; }
}
