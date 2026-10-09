package com.aiphotoeditor.common;
import java.time.Instant;
import java.util.Map;
public record ErrorResponse(Instant timestamp, int status, String code, String message, Map<String,String> fieldErrors) {
  public static ErrorResponse of(int status,String code,String message){return new ErrorResponse(Instant.now(),status,code,message,null);}
}
