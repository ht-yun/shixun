package cn.cloudlab.lab;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface LabTemplateRepository extends JpaRepository<LabTemplate, UUID>{
  List<LabTemplate> findByCourseId(UUID courseId);
  long deleteByCourseId(UUID courseId);
}
