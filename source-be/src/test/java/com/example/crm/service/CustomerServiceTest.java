package com.example.crm.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import com.example.crm.error.NotFoundException;
import com.example.crm.error.ValidationException;
import com.example.crm.repository.InMemoryCustomerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CustomerServiceTest {
  private CustomerService service;

  @BeforeEach
  void setUp() {
    service = new CustomerService(new InMemoryCustomerRepository());
  }

  @Test
  @DisplayName("create stores a trimmed, active customer")
  void createStoresTrimmedActiveCustomer() {
    // Arrange / Act
    Customer created = service.create("  Nguyen Van An ", " an@example.com ");

    // Assert
    assertEquals("Nguyen Van An", created.name());
    assertEquals("an@example.com", created.email());
    assertEquals(CustomerStatus.ACTIVE, created.status());
    assertEquals(created, service.get(created.id()));
  }

  @Test
  @DisplayName("create rejects a blank name and an invalid email")
  void createRejectsBlankNameAndInvalidEmail() {
    ValidationException error = assertThrows(ValidationException.class, () -> service.create(" ", "not-an-email"));

    assertEquals("must not be blank", error.errors().get("name"));
    assertEquals("must be a valid email address", error.errors().get("email"));
  }

  @Test
  @DisplayName("create rejects a name longer than 100 characters")
  void createRejectsTooLongName() {
    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("x".repeat(101), "a@example.com"));

    assertEquals("must be at most 100 characters", error.errors().get("name"));
  }

  @Test
  @DisplayName("create rejects an email already used, ignoring case")
  void createRejectsDuplicateEmail() {
    service.create("An", "an@example.com");

    ValidationException error = assertThrows(ValidationException.class, () -> service.create("Other", "AN@example.com"));

    assertEquals("is already used by another customer", error.errors().get("email"));
  }

  @Test
  @DisplayName("get throws NotFoundException for an unknown id")
  void getThrowsForUnknownId() {
    assertThrows(NotFoundException.class, () -> service.get(999));
  }
}
