package com.aiphotoeditor.undo;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface UndoRedoRepository extends JpaRepository<UndoRedoCursor, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UndoRedoCursor> findByProjectId(Long projectId);
}
