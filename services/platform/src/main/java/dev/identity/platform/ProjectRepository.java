package dev.identity.platform;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
    List<Project> findTop50ByOwnerOrderByCreatedAtDesc(String owner);
    Optional<Project> findByIdAndOwner(UUID id, String owner);
}
