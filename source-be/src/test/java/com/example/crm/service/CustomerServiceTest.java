package com.example.crm.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import com.example.crm.error.NotFoundException;
import com.example.crm.error.ValidationException;
import com.example.crm.repository.InMemoryCustomerRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;

class CustomerServiceTest {
  // Rows contain control characters, so invocations are named by index only.
  private static final String ROW_NAME = "[{index}]";

  private CustomerService service;

  @BeforeEach
  void setUp() {
    service = new CustomerService(new InMemoryCustomerRepository());
  }

  @Test
  @DisplayName("create stores a trimmed, active customer")
  void createStoresTrimmedActiveCustomer() {
    // Arrange / Act
    Customer created = service.create("  Nguyen Van An ", " an@example.com ", null);

    // Assert
    assertEquals("Nguyen Van An", created.name());
    assertEquals("an@example.com", created.email());
    assertEquals(CustomerStatus.ACTIVE, created.status());
    assertEquals(created, service.get(created.id()));
  }

  @Test
  @DisplayName("create rejects a blank name and an invalid email")
  void createRejectsBlankNameAndInvalidEmail() {
    ValidationException error = assertThrows(ValidationException.class, () -> service.create(" ", "not-an-email", null));

    assertEquals("must not be blank", error.errors().get("name"));
    assertEquals("must be a valid email address", error.errors().get("email"));
  }

  @Test
  @DisplayName("create rejects a name longer than 100 characters")
  void createRejectsTooLongName() {
    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("x".repeat(101), "a@example.com", null));

    assertEquals("must be at most 100 characters", error.errors().get("name"));
  }

  @Test
  @DisplayName("create rejects an email already used, ignoring case")
  void createRejectsDuplicateEmail() {
    service.create("An", "an@example.com", null);

    ValidationException error = assertThrows(ValidationException.class, () -> service.create("Other", "AN@example.com", null));

    assertEquals("is already used by another customer", error.errors().get("email"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @NullSource
  @MethodSource("blankPhones")
  @DisplayName("TC-13: create stores a null phone when no phone number is given")
  void createStoresNullPhoneWhenNoPhoneIsGiven(String phone) {
    Customer created = service.create("Tran Thi Binh", "binh@example.com", phone);

    assertNull(created.phone());
    assertEquals(CustomerStatus.ACTIVE, created.status());
    assertNull(service.get(created.id()).phone());
  }

  private static Stream<String> blankPhones() {
    return Stream.of(
        "",
        "   ",
        " \t\r\n",
        "\0", // String.strip() would keep it
        "\u000B");
  }

  @Test
  @DisplayName("TC-14: create allows several customers without a phone number")
  void createAllowsSeveralCustomersWithoutPhone() {
    service.create("An", "an@example.com", null);
    service.create("Binh", "binh@example.com", "   ");
    service.create("Chi", "chi@example.com", "");

    List<Customer> customers = service.list();
    assertEquals(3, customers.size());
    for (Customer customer : customers) {
      assertNull(customer.phone());
    }
  }

  @Test
  @DisplayName("TC-15: create stores a valid mobile number unchanged for each of the five prefixes")
  void createStoresValidMobileNumberUnchanged() {
    service.create("Seed", "seed@example.com", null);

    for (String phone : List.of("0312345678", "0512345678", "0712345678", "0812345678", "0912345678")) {
      String prefix = phone.substring(1, 2);
      Customer created = service.create("M" + prefix, "m" + prefix + "@example.com", phone);

      assertEquals(phone, created.phone());
      assertEquals(CustomerStatus.ACTIVE, created.status());
      assertEquals(phone, service.get(created.id()).phone());
    }
    assertEquals(6, service.list().size());
  }

  @Test
  @DisplayName("TC-16: create stores a valid landline number")
  void createStoresValidLandlineNumber() {
    service.create("Seed", "seed@example.com", null);

    Customer created = service.create("Le Van Cuong", "cuong@example.com", "02438251234");

    assertEquals("02438251234", created.phone());
    assertEquals("02438251234", service.get(created.id()).phone());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithSeparators")
  @DisplayName("TC-17: create normalizes surrounding whitespace and separators")
  void createNormalizesWhitespaceAndSeparators(String phone, String expected) {
    service.create("Seed", "seed@example.com", null);

    Customer created = service.create("Tran Thi Binh", "binh@example.com", phone);

    assertEquals(expected, created.phone());
    assertEquals(expected, service.get(created.id()).phone());
  }

  private static Stream<Arguments> phonesWithSeparators() {
    return Stream.of(
        arguments(" 0912.345-678 ", "0912345678"),
        arguments("(0912) 345 678", "0912345678"),
        // To be confirmed (02-design.md R1): the legacy server runs PCRE >= 8.34, where \s includes VT.
        arguments("\t0912\f345\u000B678\n", "0912345678"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithPlusCountryCode")
  @DisplayName("TC-18: create turns the +84 country code into a leading 0")
  void createConvertsPlusCountryCodeToLeadingZero(String phone, String expected) {
    service.create("Seed", "seed@example.com", null);

    Customer created = service.create("Tran Thi Binh", "binh@example.com", phone);

    assertEquals(expected, created.phone());
    assertEquals(expected, service.get(created.id()).phone());
  }

  private static Stream<Arguments> phonesWithPlusCountryCode() {
    return Stream.of(
        arguments("+84 912.345.678", "0912345678"),
        arguments("(+84) 912-345-678", "0912345678"),
        arguments("+84 24 3825 1234", "02438251234"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithBareCountryCode")
  @DisplayName("TC-19: create turns 84 into a leading 0 when the string is 11 characters long")
  void createConvertsBareCountryCodeToLeadingZero(String phone) {
    service.create("Seed", "seed@example.com", null);

    Customer created = service.create("Tran Thi Binh", "binh@example.com", phone);

    assertEquals("0912345678", created.phone());
    assertEquals("0912345678", service.get(created.id()).phone());
  }

  private static Stream<String> phonesWithBareCountryCode() {
    return Stream.of("84 912 345 678", "84912345678");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithWrongPrefixOrLength")
  @DisplayName("TC-20: create rejects a phone number with a wrong prefix or a wrong length")
  void createRejectsPhoneWithWrongPrefixOrLength(String phone) {
    service.create("Seed", "seed@example.com", null);

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("Tran Thi Binh", "binh@example.com", phone));

    assertEquals(Map.of("phone", "must be a valid phone number"), error.errors());
    assertEquals(1, service.list().size());
  }

  private static Stream<String> phonesWithWrongPrefixOrLength() {
    return Stream.of(
        // wrong prefix
        "0123456789",
        "01234567890",
        "0412345678",
        "0612345678",
        // wrong length
        "091234567",
        "09123456789",
        "0243825123",
        "024382512345");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithForeignCharacters")
  @DisplayName("TC-21: create rejects a phone number containing foreign characters")
  void createRejectsPhoneWithForeignCharacters(String phone) {
    service.create("Seed", "seed@example.com", null);

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("Tran Thi Binh", "binh@example.com", phone));

    assertEquals(Map.of("phone", "must be a valid phone number"), error.errors());
    assertEquals(1, service.list().size());
  }

  private static Stream<String> phonesWithForeignCharacters() {
    return Stream.of(
        "0912a45678",
        "0912/345/678",
        "0912_345_678",
        "+0912345678",
        // To be confirmed (02-design.md R1): the legacy locale does not treat NBSP as whitespace.
        "0912 345678");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("phonesWithUnmatchedCountryCode")
  @DisplayName("TC-22: create rejects a phone number whose country code falls outside the legacy rule")
  void createRejectsPhoneWithUnmatchedCountryCode(String phone) {
    service.create("Seed", "seed@example.com", null);

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("Tran Thi Binh", "binh@example.com", phone));

    assertEquals(Map.of("phone", "must be a valid phone number"), error.errors());
    assertEquals(1, service.list().size());
  }

  private static Stream<String> phonesWithUnmatchedCountryCode() {
    return Stream.of(
        "84 24 3825 1234", // 12 characters after normalization
        "8491234567", // 10 characters
        "+84 0912 345 678"); // becomes 00912345678
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("separatorOnlyPhones")
  @DisplayName("TC-23: create treats a string of separators only as invalid, not as no phone number")
  void createRejectsSeparatorsOnlyPhone(String phone) {
    service.create("Seed", "seed@example.com", null);

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("Tran Thi Binh", "binh@example.com", phone));

    assertEquals(Map.of("phone", "must be a valid phone number"), error.errors());
    assertEquals(1, service.list().size());
  }

  private static Stream<String> separatorOnlyPhones() {
    return Stream.of(
        "-",
        "()",
        " . ",
        "\f"); // String.trim() and strip() would turn it into "no phone number"
  }

  @Test
  @DisplayName("TC-24: create rejects a phone number already used by an active customer, compared after normalization")
  void createRejectsPhoneUsedByActiveCustomer() {
    service.create("Seed", "seed@example.com", null);
    service.create("An", "an@example.com", "0912345678");

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.create("Binh", "binh@example.com", "+84 912 345 678"));

    assertEquals(Map.of("phone", "is already used by another customer"), error.errors());
    assertEquals(2, service.list().size());
  }

  @Test
  @DisplayName("TC-25: create accepts a phone number held by an inactive customer")
  void createAcceptsPhoneHeldByInactiveCustomer() {
    InMemoryCustomerRepository repository = new InMemoryCustomerRepository();
    repository.insert("Old", "old@example.com", "0912345678", CustomerStatus.INACTIVE);
    CustomerService serviceWithInactiveCustomer = new CustomerService(repository);

    Customer created = serviceWithInactiveCustomer.create("New", "new@example.com", "0912345678");

    assertEquals(2, created.id());
    assertEquals("0912345678", created.phone());
    assertEquals(CustomerStatus.ACTIVE, created.status());
    assertEquals("0912345678", serviceWithInactiveCustomer.get(2).phone());
    assertEquals(2, serviceWithInactiveCustomer.list().size());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("invalidFieldsWithPhoneError")
  @DisplayName("TC-26: create reports the phone error together with the name and email errors")
  void createCollectsPhoneErrorWithNameAndEmailErrors(String name, String email, String phone, String phoneError) {
    service.create("An", "an@example.com", "0912345678");

    ValidationException error = assertThrows(ValidationException.class, () -> service.create(name, email, phone));

    assertEquals(
        Map.of("name", "must not be blank", "email", "must be a valid email address", "phone", phoneError),
        error.errors());
    assertEquals(1, service.list().size());
  }

  private static Stream<Arguments> invalidFieldsWithPhoneError() {
    return Stream.of(
        arguments("", "x", "0912345678", "is already used by another customer"),
        arguments(" ", "x", "0412345678", "must be a valid phone number"));
  }

  @Test
  @DisplayName("get throws NotFoundException for an unknown id")
  void getThrowsForUnknownId() {
    assertThrows(NotFoundException.class, () -> service.get(999));
  }
}
