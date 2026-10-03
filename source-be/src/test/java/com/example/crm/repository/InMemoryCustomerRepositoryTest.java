package com.example.crm.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Exercises the in-memory store directly, without the service layer. */
class InMemoryCustomerRepositoryTest {
  @Test
  @DisplayName("TC-11: insert stores the given phone and status")
  void insertStoresGivenPhoneAndStatus() {
    // Arrange
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();

    // Act
    Customer old = repository.insert("Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE);
    Customer an = repository.insert("An", "an@example.com", null, CustomerStatus.ACTIVE);

    // Assert
    Customer expectedOld = new Customer(1, "Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE);
    Customer expectedAn = new Customer(2, "An", "an@example.com", null, CustomerStatus.ACTIVE);
    assertEquals(expectedOld, old);
    assertEquals(expectedAn, an);
    assertEquals(Optional.of(expectedOld), repository.findById(1));
    assertEquals(Optional.of(expectedAn), repository.findById(2));
    assertEquals(List.of(expectedOld, expectedAn), repository.findAll());
  }

  @ParameterizedTest
  @MethodSource("phoneAndStatusQueries")
  @DisplayName("TC-12: existsByPhoneAndStatus is true only when both the phone and the status match")
  void existsByPhoneAndStatusMatchesPhoneAndStatus(String phone, CustomerStatus status, boolean expected) {
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    // The customer without a phone goes first, so every query passes over a null phone.
    repository.insert("C", "c@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("A", "a@example.com", "0912345678", CustomerStatus.ACTIVE);
    repository.insert("B", "b@example.com", "0987654321", CustomerStatus.INACTIVE);

    boolean exists = repository.existsByPhoneAndStatus(phone, status);

    assertEquals(expected, exists);
  }

  private static Stream<Arguments> phoneAndStatusQueries() {
    return Stream.of(
        arguments("0912345678", CustomerStatus.ACTIVE, true),
        arguments("0912345678", CustomerStatus.INACTIVE, false),
        arguments("0987654321", CustomerStatus.ACTIVE, false),
        arguments("0987654321", CustomerStatus.INACTIVE, true),
        arguments("0911111111", CustomerStatus.ACTIVE, false));
  }
}
