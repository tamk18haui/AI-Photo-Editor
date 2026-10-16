package com.aiphotoeditor.history;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectVersionRepository extends JpaRepository<ProjectVersionEntity, Long> {
    List<ProjectVersionEntity> findByProjectIdOrderByCreatedAtDescIdDesc(Long projectId);
    Optional<ProjectVersionEntity> findByIdAndProjectId(Long id, Long projectId);
}
