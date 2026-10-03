package com.example.crm.service;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import com.example.crm.error.NotFoundException;
import com.example.crm.error.ValidationException;
import com.example.crm.repository.CustomerRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Business rules for customers. All validation happens here, not in the HTTP layer. */
public class CustomerService {
  static final int NAME_MAX_LENGTH = 100;
  private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

  private final CustomerRepository repository;

  public CustomerService(CustomerRepository repository) {
    this.repository = repository;
  }

  public List<Customer> list() {
    return repository.findAll();
  }

  public Customer get(long id) {
    return repository.findById(id).orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
  }

  public Customer create(String name, String email) {
    String trimmedName = name == null ? "" : name.trim();
    String trimmedEmail = email == null ? "" : email.trim();
    Map<String, String> errors = new LinkedHashMap<>();
    if (trimmedName.isEmpty()) {
      errors.put("name", "must not be blank");
    } else if (trimmedName.length() > NAME_MAX_LENGTH) {
      errors.put("name", "must be at most " + NAME_MAX_LENGTH + " characters");
    }
    if (!EMAIL.matcher(trimmedEmail).matches()) {
      errors.put("email", "must be a valid email address");
    } else if (repository.existsByEmail(trimmedEmail)) {
      errors.put("email", "is already used by another customer");
    }
    if (!errors.isEmpty()) {
      throw new ValidationException(errors);
    }
    return repository.insert(trimmedName, trimmedEmail, null, CustomerStatus.ACTIVE);
  }
}
