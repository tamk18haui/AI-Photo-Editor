package com.aiphotoeditor.common;
import jakarta.validation.ConstraintViolationException;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.slf4j.Logger;import org.slf4j.LoggerFactory;
@RestControllerAdvice
public class GlobalExceptionHandler {
 private static final Logger LOG=LoggerFactory.getLogger(GlobalExceptionHandler.class);
 @ExceptionHandler(ApiException.class)
 public ResponseEntity<ErrorResponse> api(ApiException e){return ResponseEntity.status(e.getStatus()).body(ErrorResponse.of(e.getStatus().value(),e.getCode(),e.getMessage()));}
 @ExceptionHandler(MethodArgumentNotValidException.class)
 public ResponseEntity<ErrorResponse> invalid(MethodArgumentNotValidException e){
   var fields=e.getBindingResult().getFieldErrors().stream().collect(Collectors.toMap(x->x.getField(),x->x.getDefaultMessage()==null?"Invalid":x.getDefaultMessage(),(a,b)->a));
   return ResponseEntity.badRequest().body(new ErrorResponse(java.time.Instant.now(),400,"VALIDATION_ERROR","Validation failed",fields));
 }
 @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,ConstraintViolationException.class,IllegalArgumentException.class})
 public ResponseEntity<ErrorResponse> malformed(Exception e){return ResponseEntity.badRequest().body(ErrorResponse.of(400,"INVALID_REQUEST","Invalid request"));}
 @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
 public ResponseEntity<ErrorResponse> race(Exception e){return ResponseEntity.status(409).body(ErrorResponse.of(409,"STATE_CONFLICT","Concurrent update; retry"));}
 @ExceptionHandler(DataIntegrityViolationException.class)
 public ResponseEntity<ErrorResponse> constraint(Exception e){return ResponseEntity.status(409).body(ErrorResponse.of(409,"DATA_CONFLICT","Database constraint violation"));}
 @ExceptionHandler(AccessDeniedException.class)
 public ResponseEntity<ErrorResponse> forbidden(Exception e){return ResponseEntity.status(403).body(ErrorResponse.of(403,"FORBIDDEN","Access denied"));}
 @ExceptionHandler(NoResourceFoundException.class)
 public ResponseEntity<ErrorResponse> notFound(Exception e){return ResponseEntity.status(404).body(ErrorResponse.of(404,"NOT_FOUND","Not found"));}
 @ExceptionHandler(Exception.class)
 public ResponseEntity<ErrorResponse> unknown(Exception e){LOG.error("Unhandled server error",e);return ResponseEntity.status(500).body(ErrorResponse.of(500,"INTERNAL_ERROR","Internal server error"));}
}
