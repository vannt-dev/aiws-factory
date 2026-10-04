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
import org.junit.jupiter.params.provider.ValueSource;

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

  @ParameterizedTest
  @MethodSource("updateValues")
  @DisplayName("TC-44: update rewrites name, email and phone and keeps id and status")
  void updateRewritesNameEmailPhoneAndKeepsIdAndStatus(
      CustomerStatus status, String oldPhone, String newPhone) {
    // Arrange
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    Customer other = repository.insert("Other", "other@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", oldPhone, status);

    // Act
    Optional<Customer> result = repository.update(2, "Nguyen Van Anh", "anh@example.com", newPhone);

    // Assert
    Customer expected = new Customer(2, "Nguyen Van Anh", "anh@example.com", newPhone, status);
    assertEquals(Optional.of(expected), result);
    assertEquals(Optional.of(expected), repository.findById(2));
    assertEquals(List.of(other, expected), repository.findAll());
  }

  private static Stream<Arguments> updateValues() {
    return Stream.of(
        arguments(CustomerStatus.ACTIVE, "0912345678", "0987654321"),
        arguments(CustomerStatus.INACTIVE, "0912345678", "0987654321"),
        arguments(CustomerStatus.ACTIVE, "0912345678", null),
        arguments(CustomerStatus.INACTIVE, null, "0987654321"));
  }

  @ParameterizedTest
  @ValueSource(longs = {999L, 0L, 2L})
  @DisplayName("TC-45: update with an unknown id returns Optional.empty() and inserts nothing")
  void updateUnknownIdReturnsEmptyAndInsertsNothing(long id) {
    // Arrange
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);
    List<Customer> before = repository.findAll();

    // Act
    Optional<Customer> result = repository.update(id, "X", "x@example.com", "0987654321");

    // Assert
    assertEquals(Optional.empty(), result);
    assertEquals(Optional.empty(), repository.findById(id));
    assertEquals(before, repository.findAll());
  }

  @ParameterizedTest
  @MethodSource("emailQueries")
  @DisplayName("TC-46: existsByEmailAndIdNot is true only when another customer uses the email")
  void existsByEmailAndIdNotExcludesGivenId(String email, long id, boolean expected) {
    // Arrange
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    repository.insert("A", "an@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("B", "binh@example.com", null, CustomerStatus.INACTIVE);
    repository.insert("C", "dup@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("D", "dup@example.com", null, CustomerStatus.ACTIVE);

    // Act
    boolean exists = repository.existsByEmailAndIdNot(email, id);

    // Assert
    assertEquals(expected, exists);
  }

  private static Stream<Arguments> emailQueries() {
    return Stream.of(
        arguments("an@example.com", 1L, false),
        arguments("AN@Example.com", 1L, false),
        arguments("an@example.com", 2L, true),
        arguments("AN@EXAMPLE.COM", 2L, true),
        arguments("binh@example.com", 1L, true),
        arguments("binh@example.com", 2L, false),
        arguments("new@example.com", 1L, false),
        arguments("an@example.com", 999L, true),
        arguments("dup@example.com", 3L, true));
  }

  @ParameterizedTest
  @MethodSource("phoneStatusIdQueries")
  @DisplayName("TC-47: existsByPhoneAndStatusAndIdNot excludes the given id and matches the status")
  void existsByPhoneAndStatusAndIdNotExcludesGivenId(
      String phone, CustomerStatus status, long id, boolean expected) {
    // Arrange
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    // The customer without a phone goes first, so every query passes over a null phone.
    repository.insert("C", "c@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("A", "a@example.com", "0912345678", CustomerStatus.ACTIVE);
    repository.insert("B", "b@example.com", "0987654321", CustomerStatus.INACTIVE);
    repository.insert("D", "d@example.com", "0912345678", CustomerStatus.INACTIVE);

    // Act
    boolean exists = repository.existsByPhoneAndStatusAndIdNot(phone, status, id);

    // Assert
    assertEquals(expected, exists);
  }

  private static Stream<Arguments> phoneStatusIdQueries() {
    return Stream.of(
        arguments("0912345678", CustomerStatus.ACTIVE, 2L, false),
        arguments("0912345678", CustomerStatus.ACTIVE, 1L, true),
        arguments("0912345678", CustomerStatus.ACTIVE, 4L, true),
        arguments("0987654321", CustomerStatus.ACTIVE, 1L, false),
        arguments("0987654321", CustomerStatus.INACTIVE, 1L, true),
        arguments("0987654321", CustomerStatus.INACTIVE, 3L, false),
        arguments("0912345678", CustomerStatus.INACTIVE, 2L, true),
        arguments("0911111111", CustomerStatus.ACTIVE, 1L, false),
        arguments("0912345678", CustomerStatus.ACTIVE, 999L, true));
  }
}
