package com.example.crm.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Input/output tables for the phone rules ported from source-legacy/lib/phone.php. */
class PhoneNumbersTest {
  // Rows contain control characters, so invocations are named by index only.
  private static final String ROW_NAME = "[{index}]";

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("trimmedInputs")
  @DisplayName("TC-1: trim strips only the PHP trim() characters from both ends")
  void trimStripsPhpTrimCharactersFromBothEnds(String raw, String expected) {
    // Arrange / Act
    String trimmed = PhoneNumbers.trim(raw);

    // Assert
    assertEquals(expected, trimmed);
  }

  private static Stream<Arguments> trimmedInputs() {
    return Stream.of(
        arguments(null, ""),
        arguments("", ""),
        arguments("   ", ""),
        arguments(" \t\n\r\0\u000B", ""),
        arguments(" \t0912.345-678\r\n ", "0912.345-678"),
        arguments("\0\u000B0912345678\u000B\0", "0912345678"),
        arguments("0912 345 678", "0912 345 678"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("inputsTrimKeeps")
  @DisplayName("TC-2: trim keeps characters outside the PHP trim() set")
  void trimKeepsCharactersOutsidePhpTrimSet(String raw) {
    String trimmed = PhoneNumbers.trim(raw);

    assertEquals(raw, trimmed);
  }

  private static Stream<String> inputsTrimKeeps() {
    return Stream.of(
        "\f", // String.trim() and strip() would return ""
        "\u001F", // String.trim() and strip() would return ""
        " ", // EM SPACE: strip() would return ""
        " ", // NBSP
        "\f0912345678\f",
        "0912345678  "); // a regex anchored with $ would drop the space before LINE SEPARATOR
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("inputsWithSeparators")
  @DisplayName("TC-3: normalize removes ASCII whitespace and separators at any position")
  void normalizeRemovesAsciiWhitespaceAndSeparators(String raw, String expected) {
    String normalized = PhoneNumbers.normalize(raw);

    assertEquals(expected, normalized);
  }

  private static Stream<Arguments> inputsWithSeparators() {
    return Stream.of(
        arguments(" 0912.345-678 ", "0912345678"),
        arguments("(0912) 345 678", "0912345678"),
        arguments("0912\t345\n678", "0912345678"),
        arguments("0912\f345\r678", "0912345678"),
        // To be confirmed (02-design.md R1): the legacy server runs PCRE >= 8.34, where \s includes VT.
        arguments("0912\u000B345678", "0912345678"),
        arguments("\f0912345678", "0912345678"),
        arguments("024.3825.1234", "02438251234"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("inputsWithConvertibleCountryCode")
  @DisplayName("TC-4: normalize turns +84, and 84 in an 11-character string, into a leading 0")
  void normalizeConvertsCountryCodeToLeadingZero(String raw, String expected) {
    String normalized = PhoneNumbers.normalize(raw);

    assertEquals(expected, normalized);
  }

  private static Stream<Arguments> inputsWithConvertibleCountryCode() {
    return Stream.of(
        arguments("+84 912.345.678", "0912345678"),
        arguments("(+84) 912-345-678", "0912345678"),
        arguments("+84 24 3825 1234", "02438251234"),
        arguments("84 912 345 678", "0912345678"),
        arguments("84912345678", "0912345678"),
        arguments("+84", "0")); // same as PHP '0' . false
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("inputsWithUnmatchedCountryCode")
  @DisplayName("TC-5: normalize does not convert a country code that falls outside the legacy rule")
  void normalizeLeavesUnmatchedCountryCode(String raw, String expected) {
    String normalized = PhoneNumbers.normalize(raw);

    assertEquals(expected, normalized);
  }

  private static Stream<Arguments> inputsWithUnmatchedCountryCode() {
    return Stream.of(
        arguments("84 24 3825 1234", "842438251234"), // 12 characters
        arguments("8491234567", "8491234567"), // 10 characters
        arguments("+84 0912 345 678", "00912345678"));
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("inputsWithForeignCharacters")
  @DisplayName("TC-6: normalize keeps characters that are not in the removal list")
  void normalizeKeepsForeignCharacters(String raw) {
    String normalized = PhoneNumbers.normalize(raw);

    assertEquals(raw, normalized);
  }

  private static Stream<String> inputsWithForeignCharacters() {
    return Stream.of(
        "0912a45678",
        "0912/345/678",
        "0912_345_678",
        "+0912345678",
        // To be confirmed (02-design.md R1): the legacy locale does not treat NBSP as whitespace.
        "0912 345678",
        "0912 345678"); // EM SPACE
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("separatorOnlyInputs")
  @DisplayName("TC-7: normalize turns a string of separators only into an empty string")
  void normalizeTurnsSeparatorsOnlyIntoEmptyString(String raw) {
    String normalized = PhoneNumbers.normalize(raw);

    assertEquals("", normalized);
  }

  private static Stream<String> separatorOnlyInputs() {
    return Stream.of("-", "()", " . ", "\f");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("validNumbers")
  @DisplayName("TC-8: isValid accepts 10-digit mobiles starting 03/05/07/08/09 and 11-digit landlines starting 02")
  void isValidAcceptsMobileAndLandlineNumbers(String number) {
    boolean valid = PhoneNumbers.isValid(number);

    assertTrue(valid, number);
  }

  private static Stream<String> validNumbers() {
    return Stream.of(
        "0312345678",
        "0512345678",
        "0712345678",
        "0812345678",
        "0912345678",
        "0300000000",
        "0999999999",
        "02438251234",
        "02000000000",
        "02999999999");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("numbersWithWrongPrefixOrLength")
  @DisplayName("TC-9: isValid rejects a wrong prefix or a wrong length")
  void isValidRejectsWrongPrefixOrLength(String number) {
    boolean valid = PhoneNumbers.isValid(number);

    assertFalse(valid, number);
  }

  private static Stream<String> numbersWithWrongPrefixOrLength() {
    return Stream.of(
        // wrong prefix
        "0123456789",
        "01234567890",
        "0412345678",
        "0612345678",
        "0012345678",
        "1912345678",
        // wrong length
        "091234567",
        "09123456789",
        "0243825123",
        "024382512345");
  }

  @ParameterizedTest(name = ROW_NAME)
  @MethodSource("valuesInvalidAfterNormalization")
  @DisplayName("TC-10: isValid rejects empty strings, foreign characters and unconverted country codes")
  void isValidRejectsValuesLeftInvalidByNormalization(String value) {
    boolean valid = PhoneNumbers.isValid(value);

    assertFalse(valid, value);
  }

  private static Stream<String> valuesInvalidAfterNormalization() {
    return Stream.of(
        // empty or too short
        "",
        "0",
        // foreign characters
        "0912a45678",
        "+0912345678",
        "0912 345678", // NBSP
        "091234567٩", // ARABIC-INDIC DIGIT NINE
        "０９１２３４５６７８", // fullwidth 0912345678
        // country code that normalize left in place
        "842438251234",
        "8491234567",
        "00912345678",
        // trailing line terminator: find() with $ would accept it
        "0912345678\n");
  }
}
