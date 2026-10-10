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
import java.util.ArrayList;
import java.util.Arrays;
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
import org.junit.jupiter.params.provider.ValueSource;

class CustomerServiceTest {
  // Rows contain control characters, so invocations are named by index only.
  private static final String ROW_NAME = "[{index}]";

  private InMemoryCustomerRepository repository;
  private CustomerService service;

  @BeforeEach
  void setUp() {
    repository = new InMemoryCustomerRepository();
    service = new CustomerService(repository);
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

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("updatedFields")
  @DisplayName("TC-48: update stores trimmed name and email, normalized phone, and does not insert a customer")
  void updateStoresUpdatedFieldsWithoutInserting(
      String currentPhone, String name, String email, String phone, String expectedName, String expectedEmail, String expectedPhone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", currentPhone, CustomerStatus.ACTIVE);

    Customer updated = service.update(2, name, email, phone);

    assertEquals(new Customer(2, expectedName, expectedEmail, expectedPhone, CustomerStatus.ACTIVE), updated);
    assertEquals(updated, service.get(2));
    assertEquals(2, service.list().size());
    assertEquals(new Customer(1, "Seed", "seed@example.com", null, CustomerStatus.ACTIVE), service.get(1));
  }

  private static Stream<Arguments> updatedFields() {
    return Stream.of(
        arguments(
            "0912345678", "  Nguyen Van Anh ", " anh@example.com ", " 0987.654-321 ",
            "Nguyen Van Anh", "anh@example.com", "0987654321"),
        arguments(
            "0912345678", "Nguyen Van Anh", "anh@example.com", "+84 24 3825 1234",
            "Nguyen Van Anh", "anh@example.com", "02438251234"),
        arguments(
            "0912345678", "Nguyen Van Anh", "anh@example.com", "84 987 654 321",
            "Nguyen Van Anh", "anh@example.com", "0987654321"),
        arguments(
            null, "Nguyen Van An", "an@example.com", "0987654321",
            "Nguyen Van An", "an@example.com", "0987654321"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("validNames")
  @DisplayName("TC-49: update accepts a name at the length boundary, measured after trim")
  void updateAcceptsNameAtLengthBoundary(String name, String expectedName) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);

    Customer updated = service.update(2, name, "an@example.com", "0912345678");

    assertEquals(expectedName, updated.name());
    assertEquals(expectedName, service.get(2).name());
  }

  private static Stream<Arguments> validNames() {
    return Stream.of(
        arguments("x", "x"),
        arguments("x".repeat(100), "x".repeat(100)),
        arguments(" " + "x".repeat(100) + " ", "x".repeat(100)));
  }

  @ParameterizedTest(name = ROW_NAME)
  @NullSource
  @MethodSource("blankPhones")
  @DisplayName("TC-50: update with no phone number clears the phone currently stored")
  void updateWithoutPhoneClearsStoredPhone(String phone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);

    Customer updated = service.update(2, "Nguyen Van An", "an@example.com", phone);

    assertEquals(new Customer(2, "Nguyen Van An", "an@example.com", null, CustomerStatus.ACTIVE), updated);
    assertNull(service.get(2).phone());
    assertEquals(2, service.list().size());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("statuses")
  @DisplayName("TC-51: update keeps the status of an ACTIVE or INACTIVE customer")
  void updateKeepsStatus(CustomerStatus status) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", status);

    Customer updated = service.update(2, "Nguyen Van Anh", "anh@example.com", "0987654321");

    assertEquals(new Customer(2, "Nguyen Van Anh", "anh@example.com", "0987654321", status), updated);
    assertEquals(updated, service.get(2));
  }

  private static Stream<CustomerStatus> statuses() {
    return Stream.of(CustomerStatus.ACTIVE, CustomerStatus.INACTIVE);
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("invalidFieldsWithSingleError")
  @DisplayName("TC-52: update rejects one field that breaks the create rules, with the same message as create")
  void updateRejectsSingleInvalidField(String name, String email, String phone, Map<String, String> expectedErrors) {
    insertSeedAndAn();
    List<Customer> before = service.list();

    ValidationException error = assertThrows(ValidationException.class, () -> service.update(2, name, email, phone));

    assertEquals(expectedErrors, error.errors());
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> invalidFieldsWithSingleError() {
    String validName = "Nguyen Van Anh";
    String validEmail = "anh@example.com";
    String validPhone = "0987654321";
    Map<String, String> blankName = Map.of("name", "must not be blank");
    Map<String, String> invalidEmail = Map.of("email", "must be a valid email address");
    Map<String, String> invalidPhone = Map.of("phone", "must be a valid phone number");
    return Stream.of(
        arguments(null, validEmail, validPhone, blankName),
        arguments("", validEmail, validPhone, blankName),
        arguments("   ", validEmail, validPhone, blankName),
        arguments("x".repeat(101), validEmail, validPhone, Map.of("name", "must be at most 100 characters")),
        arguments(validName, null, validPhone, invalidEmail),
        arguments(validName, "", validPhone, invalidEmail),
        arguments(validName, "x", validPhone, invalidEmail),
        arguments(validName, "a@b", validPhone, invalidEmail),
        arguments(validName, validEmail, "0412345678", invalidPhone),
        arguments(validName, validEmail, "091234567", invalidPhone),
        arguments(validName, validEmail, "0912a45678", invalidPhone),
        arguments(validName, validEmail, "84 24 3825 1234", invalidPhone),
        arguments(validName, validEmail, "-", invalidPhone));
  }

  @Test
  @DisplayName("TC-53: update reports the errors of all three fields in one ValidationException")
  void updateCollectsErrorsOfAllFields() {
    insertSeedAndAn();
    repository.insert("Tran Thi Binh", "binh@example.com", "0987654321", CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.update(2, "", "x", "0412345678"));
    assertEquals(
        Map.of("name", "must not be blank", "email", "must be a valid email address", "phone", "must be a valid phone number"),
        error.errors());

    ValidationException duplicatePhone =
        assertThrows(ValidationException.class, () -> service.update(2, " ", "x", "0987654321"));
    assertEquals(
        Map.of("name", "must not be blank", "email", "must be a valid email address", "phone", "is already used by another customer"),
        duplicatePhone.errors());
    assertEquals(before, service.list());
  }

  @Test
  @DisplayName("TC-54: update validates the stored phone again even when it is unchanged")
  void updateRevalidatesUnchangedPhone() {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Le Van Cuong", "cuong@example.com", "01234567890", CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.update(2, "Le Van Cuong Moi", "cuong@example.com", "01234567890"));

    assertEquals(Map.of("phone", "must be a valid phone number"), error.errors());
    assertEquals(before, service.list());
    assertEquals("Le Van Cuong", service.get(2).name());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("duplicateEmails")
  @DisplayName("TC-55: update rejects an email of another customer, regardless of status and letter case")
  void updateRejectsEmailOfAnotherCustomer(CustomerStatus binhStatus, String email) {
    repository.insert("Tran Thi Binh", "binh@example.com", null, binhStatus);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.update(2, "Nguyen Van An", email, "0912345678"));

    assertEquals(Map.of("email", "is already used by another customer"), error.errors());
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> duplicateEmails() {
    return Stream.of(
        arguments(CustomerStatus.ACTIVE, "binh@example.com"),
        arguments(CustomerStatus.ACTIVE, "BINH@Example.com"),
        arguments(CustomerStatus.ACTIVE, " binh@example.com "),
        arguments(CustomerStatus.INACTIVE, "binh@example.com"),
        arguments(CustomerStatus.INACTIVE, "BINH@Example.com"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("duplicatePhones")
  @DisplayName("TC-56: update rejects a phone held by another ACTIVE customer after normalization")
  void updateRejectsPhoneOfAnotherActiveCustomer(CustomerStatus anStatus, String anPhone, String phone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Tran Thi Binh", "binh@example.com", "0912345678", CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", anPhone, anStatus);
    List<Customer> before = service.list();

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.update(3, "Nguyen Van An", "an@example.com", phone));

    assertEquals(Map.of("phone", "is already used by another customer"), error.errors());
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> duplicatePhones() {
    return Stream.of(
        arguments(CustomerStatus.ACTIVE, "0987654321", "0912345678"),
        arguments(CustomerStatus.ACTIVE, "0987654321", "+84 912 345 678"),
        arguments(CustomerStatus.INACTIVE, null, "0912345678"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @ValueSource(strings = {"0912345678", "+84 912 345 678"})
  @DisplayName("TC-57: update rejects an INACTIVE customer that sends back a phone given to an ACTIVE customer")
  void updateRejectsInactiveCustomerReclaimingPhone(String phone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.INACTIVE);
    repository.insert("Tran Thi Binh", "binh@example.com", "0912345678", CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    ValidationException error =
        assertThrows(ValidationException.class, () -> service.update(2, "Nguyen Van Anh", "an@example.com", phone));

    assertEquals(Map.of("phone", "is already used by another customer"), error.errors());
    assertEquals(before, service.list());
    assertEquals("Nguyen Van An", service.get(2).name());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("keepOwnFields")
  @DisplayName("TC-58: update accepts the email and phone already held by the same customer")
  void updateAcceptsOwnEmailAndPhone(
      String name, String email, String phone, String expectedEmail, String expectedPhone) {
    insertSeedAndAn();

    Customer updated = service.update(2, name, email, phone);

    assertEquals(new Customer(2, name, expectedEmail, expectedPhone, CustomerStatus.ACTIVE), updated);
    assertEquals(updated, service.get(2));
    assertEquals(2, service.list().size());
  }

  private static Stream<Arguments> keepOwnFields() {
    return Stream.of(
        arguments("Nguyen Van Anh", "an@example.com", "0912345678", "an@example.com", "0912345678"),
        arguments("Nguyen Van An", "AN@Example.com", "0912345678", "AN@Example.com", "0912345678"),
        arguments("Nguyen Van An", "an@example.com", "+84 912 345 678", "an@example.com", "0912345678"),
        arguments("Nguyen Van Anh", "AN@Example.com", "+84 912 345 678", "AN@Example.com", "0912345678"));
  }

  @Test
  @DisplayName("TC-59: update accepts a phone held only by an INACTIVE customer")
  void updateAcceptsPhoneHeldByInactiveCustomer() {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Old", "old@example.com", "0987654321", CustomerStatus.INACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);

    Customer updated = service.update(3, "Nguyen Van An", "an@example.com", "0987654321");

    assertEquals(new Customer(3, "Nguyen Van An", "an@example.com", "0987654321", CustomerStatus.ACTIVE), updated);
    assertEquals(updated, service.get(3));
    assertEquals(new Customer(2, "Old", "old@example.com", "0987654321", CustomerStatus.INACTIVE), service.get(2));
    assertEquals(3, service.list().size());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("updatedFieldsForUnknownId")
  @DisplayName("TC-60: update throws NotFoundException for an unknown id before validating the fields")
  void updateThrowsNotFoundBeforeValidation(String name, String email, String phone) {
    insertSeedAndAn();
    List<Customer> before = service.list();

    NotFoundException error = assertThrows(NotFoundException.class, () -> service.update(999, name, email, phone));

    assertEquals("Customer 999 not found", error.getMessage());
    assertEquals(before, service.list());
    assertThrows(NotFoundException.class, () -> service.get(999));
  }

  private static Stream<Arguments> updatedFieldsForUnknownId() {
    return Stream.of(
        arguments("Nguyen Van Anh", "anh@example.com", "0987654321"),
        arguments("", "x", "0412345678"),
        arguments("Nguyen Van An", "an@example.com", "0912345678"));
  }

  private void insertSeedAndAn() {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", CustomerStatus.ACTIVE);
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("deactivatePhones")
  @DisplayName("TC-84: updateStatus deactivates an ACTIVE customer and keeps its data unchanged")
  void updateStatusDeactivatesActiveCustomerAndKeepsData(String aPhone, String bPhone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    Customer seed = service.get(1);
    repository.insert("Nguyen Van An", "an@example.com", aPhone, CustomerStatus.ACTIVE);
    repository.insert("Tran Thi Binh", "binh@example.com", bPhone, CustomerStatus.ACTIVE);
    Customer b = service.get(3);

    Customer updated = service.updateStatus(2, "INACTIVE");

    assertEquals(new Customer(2, "Nguyen Van An", "an@example.com", aPhone, CustomerStatus.INACTIVE), updated);
    assertEquals(updated, service.get(2));
    assertEquals(List.of(seed, updated, b), service.list());
  }

  private static Stream<Arguments> deactivatePhones() {
    return Stream.of(
        arguments("0912345678", "0987654321"),
        arguments(null, null),
        arguments("01234567890", "0987654321"), // legacy-rule phone number
        arguments("0912345678", "0912345678")); // B already holds A's phone while ACTIVE
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("reactivateAllowedPhones")
  @DisplayName("TC-85: updateStatus reactivates a customer when no other ACTIVE customer holds its phone")
  void updateStatusReactivatesWhenPhoneIsFree(String aPhone, String bPhone, CustomerStatus bStatus) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    Customer seed = service.get(1);
    repository.insert("Tran Thi Binh", "binh@example.com", bPhone, bStatus);
    Customer b = service.get(2);
    repository.insert("Nguyen Van An", "an@example.com", aPhone, CustomerStatus.INACTIVE);

    Customer updated = service.updateStatus(3, "ACTIVE");

    assertEquals(new Customer(3, "Nguyen Van An", "an@example.com", aPhone, CustomerStatus.ACTIVE), updated);
    assertEquals(updated, service.get(3));
    assertEquals(List.of(seed, b, updated), service.list());
  }

  private static Stream<Arguments> reactivateAllowedPhones() {
    return Stream.of(
        arguments(null, null, CustomerStatus.ACTIVE),
        arguments("0912345678", "0987654321", CustomerStatus.ACTIVE),
        arguments("0912345678", "0912345678", CustomerStatus.INACTIVE),
        arguments("01234567890", "0987654321", CustomerStatus.ACTIVE)); // legacy-rule phone number
  }

  @ParameterizedTest(name = ROW_NAME)
  @ValueSource(strings = {"0912345678", "01234567890"})
  @DisplayName("TC-86: updateStatus rejects reactivation when another ACTIVE customer holds the phone")
  void updateStatusRejectsReactivationWhenPhoneIsTaken(String phone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", phone, CustomerStatus.INACTIVE);
    repository.insert("Tran Thi Binh", "binh@example.com", phone, CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    ValidationException error = assertThrows(ValidationException.class, () -> service.updateStatus(2, "ACTIVE"));

    assertEquals(Map.of("phone", "is already used by another customer"), error.errors());
    assertEquals(before, service.list());
    assertEquals(CustomerStatus.INACTIVE, service.get(2).status());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("sameTargetStatuses")
  @DisplayName("TC-87: updateStatus to the status already held returns the stored customer without checking for a duplicate phone")
  void updateStatusToSameStatusReturnsStoredCustomer(CustomerStatus status, String aPhone, String bPhone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", aPhone, status);
    repository.insert("Tran Thi Binh", "binh@example.com", bPhone, CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    Customer result = service.updateStatus(2, status.name());

    assertEquals(new Customer(2, "Nguyen Van An", "an@example.com", aPhone, status), result);
    assertEquals(result, service.get(2));
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> sameTargetStatuses() {
    return Stream.of(
        arguments(CustomerStatus.ACTIVE, "0912345678", "0987654321"),
        arguments(CustomerStatus.INACTIVE, "0912345678", "0987654321"),
        arguments(CustomerStatus.INACTIVE, "0912345678", "0912345678"),
        arguments(CustomerStatus.ACTIVE, "0912345678", "0912345678"), // duplicate ACTIVE phones already existing
        arguments(CustomerStatus.INACTIVE, null, null));
  }

  @ParameterizedTest(name = ROW_NAME)
  @NullSource
  @MethodSource("statusesForUnknownId")
  @DisplayName("TC-88: updateStatus throws NotFoundException for an unknown id before validating the target status")
  void updateStatusThrowsNotFoundBeforeValidatingStatus(String status) {
    insertSeedAndAn();
    List<Customer> before = service.list();

    NotFoundException error = assertThrows(NotFoundException.class, () -> service.updateStatus(999, status));

    assertEquals("Customer 999 not found", error.getMessage());
    assertEquals(before, service.list());
    assertThrows(NotFoundException.class, () -> service.get(999));
  }

  private static Stream<String> statusesForUnknownId() {
    return Stream.of("ACTIVE", "INACTIVE", "DELETED", "");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("invalidTargetStatuses")
  @DisplayName("TC-89: updateStatus rejects a target status that is not exactly ACTIVE or INACTIVE")
  void updateStatusRejectsValueOtherThanActiveOrInactive(CustomerStatus current, String status) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", "0912345678", current);
    List<Customer> before = service.list();

    ValidationException error = assertThrows(ValidationException.class, () -> service.updateStatus(2, status));

    assertEquals(Map.of("status", "must be ACTIVE or INACTIVE"), error.errors());
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> invalidTargetStatuses() {
    List<String> values = Arrays.asList(null, "", "   ", "DELETED", "active", "Inactive", " ACTIVE", "INACTIVE ");
    return Stream.of(CustomerStatus.ACTIVE, CustomerStatus.INACTIVE)
        .flatMap(current -> values.stream().map(status -> arguments(current, status)));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("roundTripPhones")
  @DisplayName("TC-90: updateStatus deactivating then reactivating returns the original customer")
  void updateStatusDeactivateThenReactivateReturnsOriginalCustomer(String phone) {
    repository.insert("Seed", "seed@example.com", null, CustomerStatus.ACTIVE);
    repository.insert("Nguyen Van An", "an@example.com", phone, CustomerStatus.ACTIVE);
    List<Customer> before = service.list();

    Customer deactivated = service.updateStatus(2, "INACTIVE");
    Customer reactivated = service.updateStatus(2, "ACTIVE");

    assertEquals(new Customer(2, "Nguyen Van An", "an@example.com", phone, CustomerStatus.INACTIVE), deactivated);
    assertEquals(new Customer(2, "Nguyen Van An", "an@example.com", phone, CustomerStatus.ACTIVE), reactivated);
    assertEquals(before, service.list());
  }

  private static Stream<String> roundTripPhones() {
    return Stream.of("0912345678", null, "01234567890");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("statusListsForNoFilter")
  @DisplayName("TC-117: list with no status value returns the same customers as list()")
  void listWithNoStatusValueReturnsSameAsList(List<CustomerStatus> statuses) {
    List<Customer> inserted = insertByStatuses(statuses);

    List<Customer> result = service.list(List.of());

    assertEquals(service.list(), result);
    assertEquals(inserted, result);
  }

  private static Stream<List<CustomerStatus>> statusListsForNoFilter() {
    return Stream.of(
        List.of(CustomerStatus.ACTIVE, CustomerStatus.INACTIVE, CustomerStatus.ACTIVE, CustomerStatus.INACTIVE),
        List.of(CustomerStatus.INACTIVE, CustomerStatus.INACTIVE),
        List.of());
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("statusListsWithOneFilterValue")
  @DisplayName("TC-118: list with one valid status value returns only the customers in that status, ordered by id")
  void listWithOneValidStatusValueReturnsMatchingCustomers(
      List<CustomerStatus> statuses, String filter, List<Integer> expectedIds) {
    List<Customer> inserted = insertByStatuses(statuses);

    List<Customer> result = service.list(List.of(filter));

    List<Customer> expected = expectedIds.stream().map(id -> inserted.get(id - 1)).toList();
    assertEquals(expected, result);
    assertEquals(inserted, service.list());
  }

  private static Stream<Arguments> statusListsWithOneFilterValue() {
    return Stream.of(
        arguments(
            List.of(CustomerStatus.ACTIVE, CustomerStatus.INACTIVE, CustomerStatus.ACTIVE, CustomerStatus.INACTIVE),
            "ACTIVE", List.of(1, 3)),
        arguments(
            List.of(CustomerStatus.ACTIVE, CustomerStatus.INACTIVE, CustomerStatus.ACTIVE, CustomerStatus.INACTIVE),
            "INACTIVE", List.of(2, 4)),
        arguments(List.of(CustomerStatus.ACTIVE, CustomerStatus.ACTIVE), "INACTIVE", List.of()),
        arguments(List.of(CustomerStatus.INACTIVE, CustomerStatus.INACTIVE), "ACTIVE", List.of()),
        arguments(List.of(), "ACTIVE", List.of()));
  }

  // Name, email and phone of the four standard customers of the REQ-005 test spec, in id order.
  private static final String[][] STANDARD_CUSTOMERS = {
    {"Nguyen Van An", "an@example.com", null},
    {"Tran Thi Binh", "binh@example.com", "0912345678"},
    {"Le Van Cuong", "cuong@example.com", "0987654321"},
    {"Pham Thi Dung", "dung@example.com", null}
  };

  private List<Customer> insertByStatuses(List<CustomerStatus> statuses) {
    List<Customer> inserted = new ArrayList<>();
    for (CustomerStatus status : statuses) {
      String[] customer = STANDARD_CUSTOMERS[inserted.size()];
      inserted.add(repository.insert(customer[0], customer[1], customer[2], status));
    }
    return inserted;
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("invalidStatusValueLists")
  @DisplayName("TC-119: list rejects status values other than exactly one ACTIVE or INACTIVE")
  void listRejectsStatusValuesOtherThanExactlyOneValid(boolean useK4, List<String> statusValues) {
    if (useK4) {
      repository.insert("Nguyen Van An", "an@example.com", null, CustomerStatus.ACTIVE);
      repository.insert("Tran Thi Binh", "binh@example.com", "0912345678", CustomerStatus.INACTIVE);
      repository.insert("Le Van Cuong", "cuong@example.com", "0987654321", CustomerStatus.ACTIVE);
      repository.insert("Pham Thi Dung", "dung@example.com", null, CustomerStatus.INACTIVE);
    }
    List<Customer> before = service.list();

    ValidationException error = assertThrows(ValidationException.class, () -> service.list(statusValues));

    assertEquals(Map.of("status", "must be ACTIVE or INACTIVE"), error.errors());
    assertEquals(before, service.list());
  }

  private static Stream<Arguments> invalidStatusValueLists() {
    List<List<String>> values = List.of(
        List.of("DELETED"),
        List.of("ALL"),
        List.of("active"),
        List.of("Inactive"),
        List.of(""),
        List.of("   "),
        List.of(" ACTIVE"),
        List.of("INACTIVE "),
        List.of("ACTIVE,INACTIVE"),
        List.of("ACTIVE", "INACTIVE"),
        List.of("INACTIVE", "ACTIVE"),
        List.of("ACTIVE", "ACTIVE"),
        List.of("INACTIVE", "INACTIVE"),
        List.of("ACTIVE", ""),
        List.of("", "ACTIVE"),
        List.of("ACTIVE", "ACTIVE", "ACTIVE"));
    return Stream.of(true, false).flatMap(useK4 -> values.stream().map(v -> arguments(useK4, v)));
  }

  @Test
  @DisplayName("get throws NotFoundException for an unknown id")
  void getThrowsForUnknownId() {
    assertThrows(NotFoundException.class, () -> service.get(999));
  }
}
