package com.example.crm.service;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import com.example.crm.error.NotFoundException;
import com.example.crm.error.ValidationException;
import com.example.crm.repository.CustomerRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
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
    Checked fields = check(name, email, phone,
        repository::existsByEmail,
        p -> repository.existsByPhoneAndStatus(p, CustomerStatus.ACTIVE));
    return repository.insert(fields.name(), fields.email(), fields.phone(), CustomerStatus.ACTIVE);
  }

  /** Replaces name, email and phone of an existing customer; its id and status are kept. */
  public Customer update(long id, String name, String email, String phone) {
    get(id);
    Checked fields = check(name, email, phone,
        e -> repository.existsByEmailAndIdNot(e, id),
        p -> repository.existsByPhoneAndStatusAndIdNot(p, CustomerStatus.ACTIVE, id));
    return repository.update(id, fields.name(), fields.email(), fields.phone())
        .orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
  }

  /** Sets the status of an existing customer; its name, email and phone are kept. */
  public Customer updateStatus(long id, String status) {
    Customer current = get(id);
    CustomerStatus target = parseStatus(status);
    if (current.status() == target) {
      return current;
    }
    if (target == CustomerStatus.ACTIVE
        && current.phone() != null
        && repository.existsByPhoneAndStatusAndIdNot(current.phone(), CustomerStatus.ACTIVE, id)) {
      throw new ValidationException(Map.of("phone", "is already used by another customer"));
    }
    return repository.updateStatus(id, target)
        .orElseThrow(() -> new NotFoundException("Customer " + id + " not found"));
  }

  private static CustomerStatus parseStatus(String status) {
    if (CustomerStatus.ACTIVE.name().equals(status)) {
      return CustomerStatus.ACTIVE;
    }
    if (CustomerStatus.INACTIVE.name().equals(status)) {
      return CustomerStatus.INACTIVE;
    }
    throw new ValidationException(Map.of("status", "must be ACTIVE or INACTIVE"));
  }

  /** Validates and normalizes the input; the predicates report whether another customer already uses the email or phone. */
  private Checked check(
      String name, String email, String phone, Predicate<String> emailTaken, Predicate<String> phoneTaken) {
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
    } else if (emailTaken.test(trimmedEmail)) {
      errors.put("email", "is already used by another customer");
    }
    if (!trimmedPhone.isEmpty()) {
      normalizedPhone = PhoneNumbers.normalize(trimmedPhone);
      if (!PhoneNumbers.isValid(normalizedPhone)) {
        errors.put("phone", "must be a valid phone number");
      } else if (phoneTaken.test(normalizedPhone)) {
        errors.put("phone", "is already used by another customer");
      }
    }
    if (!errors.isEmpty()) {
      throw new ValidationException(errors);
    }
    return new Checked(trimmedName, trimmedEmail, normalizedPhone);
  }

  private record Checked(String name, String email, String phone) {}
}
