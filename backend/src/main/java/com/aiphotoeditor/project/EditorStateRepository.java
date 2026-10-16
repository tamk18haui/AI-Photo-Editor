package com.aiphotoeditor.project;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EditorStateRepository extends JpaRepository<EditorStateEntity,Long> {
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select s from EditorStateEntity s where s.projectId = :projectId")
 Optional<EditorStateEntity> findLockedByProjectId(@Param("projectId") Long projectId);
}
