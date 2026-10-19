package com.aiphotoeditor.history;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EditHistoryRepository extends JpaRepository<EditHistoryEntity, Long> {
    List<EditHistoryEntity> findByProjectIdOrderByCreatedAtDescIdDesc(Long projectId);
}
