package com.aiphotoeditor.project;
import java.util.Optional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface ProjectRepository extends JpaRepository<Project,Long> {
 Optional<Project> findByIdAndOwnerId(Long id,Long ownerId);
 @Query("select p from Project p where p.owner.id=:ownerId and (:search is null or lower(p.name) like lower(concat('%',:search,'%')))")
 Page<Project> searchMine(@Param("ownerId") Long ownerId,@Param("search") String search,Pageable pageable);
}
