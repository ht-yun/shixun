package cn.cloudlab.course;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import cn.cloudlab.lab.LabTemplateRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/courses")
@CrossOrigin(origins = "*")
public class CourseController {
  private final CourseRepository courses;
  private final LabTemplateRepository labs;
  CourseController(CourseRepository courses, LabTemplateRepository labs){this.courses=courses;this.labs=labs;}
  @GetMapping public List<Course> list(){return courses.findAll();}
  @GetMapping("/{id}") public Course one(@PathVariable UUID id){return courses.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"课程不存在"));}
  @PostMapping @ResponseStatus(HttpStatus.CREATED) public Course create(@Valid @RequestBody CourseInput input){if(courses.existsByCourseCodeIgnoreCase(input.courseCode()))throw new ResponseStatusException(HttpStatus.CONFLICT,"课程编号已存在");return courses.save(new Course(input.title(),input.courseCode(),input.description(),input.teacherName()));}
  @PutMapping("/{id}") public Course update(@PathVariable UUID id,@Valid @RequestBody CourseUpdate input){Course course=one(id);course.update(input.title(),input.description(),input.status());return courses.save(course);}
  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional public void delete(@PathVariable UUID id){Course course=one(id);labs.deleteByCourseId(id);courses.delete(course);}
  public record CourseInput(@NotBlank @Size(max=120) String title,@NotBlank @Size(max=48) String courseCode,@Size(max=1000) String description,@NotBlank @Size(max=40) String teacherName){}
  public record CourseUpdate(@NotBlank @Size(max=120) String title,@Size(max=1000) String description,@NotBlank String status){}
}
