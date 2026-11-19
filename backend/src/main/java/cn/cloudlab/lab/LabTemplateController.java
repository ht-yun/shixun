package cn.cloudlab.lab;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import cn.cloudlab.course.CourseRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/labs")
@CrossOrigin(origins = "*")
public class LabTemplateController {
  private final LabTemplateRepository labs;
  private final CourseRepository courses;
  LabTemplateController(LabTemplateRepository labs,CourseRepository courses){this.labs=labs;this.courses=courses;}
  @GetMapping public List<LabTemplate> list(@RequestParam(required=false) UUID courseId){return courseId==null?labs.findAll():labs.findByCourseId(courseId);}
  @GetMapping("/{id}") public LabTemplate one(@PathVariable UUID id){return labs.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"实验模板不存在"));}
  @PostMapping @ResponseStatus(HttpStatus.CREATED) public LabTemplate create(@Valid @RequestBody LabInput input){if(!courses.existsById(input.courseId()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"所属课程不存在");return labs.save(new LabTemplate(input.courseId(),input.title(),input.operationMode(),input.maxMinutes(),input.instructions()));}
  @PutMapping("/{id}") public LabTemplate update(@PathVariable UUID id,@Valid @RequestBody LabUpdate input){LabTemplate lab=one(id);lab.update(input.title(),input.operationMode(),input.maxMinutes(),input.instructions(),input.evaluationConfig(),input.status());return labs.save(lab);}
  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable UUID id){labs.delete(one(id));}
  public record LabInput(@NotNull UUID courseId,@NotBlank @Size(max=120) String title,@NotBlank String operationMode,@NotNull @Min(10) @Max(720) Integer maxMinutes,@Size(max=30000) String instructions){}
  public record LabUpdate(@NotBlank @Size(max=120) String title,@NotBlank String operationMode,@NotNull @Min(10) @Max(720) Integer maxMinutes,@Size(max=30000) String instructions,@Size(max=50000) String evaluationConfig,@NotBlank String status){}
}
