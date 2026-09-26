package com.example.crm.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/** Error body following RFC 9457 (application/problem+json). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Problem(String type, String title, int status, String detail, Map<String, String> errors) {
  public static Problem of(int status, String title, String detail) {
    return new Problem("about:blank", title, status, detail, null);
  }
}
