package com.example.crm.error;

import java.util.Map;

/** Input failed validation. Mapped to HTTP 400 with one message per invalid field. */
public class ValidationException extends RuntimeException {
  private final Map<String, String> errors;

  public ValidationException(Map<String, String> errors) {
    super("Validation failed: " + errors);
    this.errors = Map.copyOf(errors);
  }

  public Map<String, String> errors() {
    return errors;
  }
}
