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

  public Customer create(String name, String email, String phone) {
    Checked fields = check(name, email, phone, null);
    return repository.insert(fields.name(), fields.email(), fields.phone(), CustomerStatus.ACTIVE);
  }

  /** Replaces name, email and phone of an existing customer; its id and status are kept. */
  public Customer update(long id, String name, String email, String phone) {
    get(id);
    Checked fields = check(name, email, phone, id);
    return repository.update(id, fields.name(), fields.email(), fields.phone())
        .orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
  }

  /** Validates and normalizes the input. {@code ownId} is the customer being updated, or null when creating. */
  private Checked check(String name, String email, String phone, Long ownId) {
    String trimmedName = name == null ? "" : name.trim();
    String trimmedEmail = email == null ? "" : email.trim();
    String trimmedPhone = PhoneNumbers.trim(phone);
    String normalizedPhone = null;
    Map<String, String> errors = new LinkedHashMap<>();
    if (trimmedName.isEmpty()) {
      errors.put("name", "must not be blank");
    } else if (trimmedName.length() > NAME_MAX_LENGTH) {
      errors.put("name", "must be at most " + NAME_MAX_LENGTH + " characters");
    }
    if (!EMAIL.matcher(trimmedEmail).matches()) {
      errors.put("email", "must be a valid email address");
    } else if (isEmailUsed(trimmedEmail, ownId)) {
      errors.put("email", "is already used by another customer");
    }
    if (!trimmedPhone.isEmpty()) {
      normalizedPhone = PhoneNumbers.normalize(trimmedPhone);
      if (!PhoneNumbers.isValid(normalizedPhone)) {
        errors.put("phone", "must be a valid phone number");
      } else if (isPhoneUsed(normalizedPhone, ownId)) {
        errors.put("phone", "is already used by another customer");
      }
    }
    if (!errors.isEmpty()) {
      throw new ValidationException(errors);
    }
    return new Checked(trimmedName, trimmedEmail, normalizedPhone);
  }

  private boolean isEmailUsed(String email, Long ownId) {
    return ownId == null
        ? repository.existsByEmail(email)
        : repository.existsByEmailAndIdNot(email, ownId);
  }

  private boolean isPhoneUsed(String phone, Long ownId) {
    return ownId == null
        ? repository.existsByPhoneAndStatus(phone, CustomerStatus.ACTIVE)
        : repository.existsByPhoneAndStatusAndIdNot(phone, CustomerStatus.ACTIVE, ownId);
  }

  private record Checked(String name, String email, String phone) {}
}
