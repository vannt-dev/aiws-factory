package com.example.crm.service;

import java.util.regex.Pattern;

/** Phone number rules (BR-07), ported one-to-one from source-legacy/lib/phone.php. */
final class PhoneNumbers {
  // Default character set of PHP trim(): space, tab, LF, CR, NUL, VT. Narrower than String.trim()/strip().
  private static final String TRIM_CHARACTERS = " \t\n\r\0\u000B";
  // PCRE [\s.\-()] without the u flag, spelled out so that it stays ASCII-only.
  private static final Pattern SEPARATORS = Pattern.compile("[ \\t\\n\\x0B\\f\\r.()-]");
  private static final Pattern VALID = Pattern.compile("0[35789][0-9]{8}|02[0-9]{9}");

  private PhoneNumbers() {}

  static String trim(String raw) {
    if (raw == null) {
      return "";
    }
    int start = 0;
    int end = raw.length();
    while (start < end && TRIM_CHARACTERS.indexOf(raw.charAt(start)) >= 0) {
      start++;
    }
    while (end > start && TRIM_CHARACTERS.indexOf(raw.charAt(end - 1)) >= 0) {
      end--;
    }
    return raw.substring(start, end);
  }

  static String normalize(String raw) {
    String digits = SEPARATORS.matcher(trim(raw)).replaceAll("");
    if (digits.startsWith("+84")) {
      digits = "0" + digits.substring(3);
    } else if (digits.startsWith("84") && digits.length() == 11) {
      digits = "0" + digits.substring(2);
    }
    return digits;
  }

  static boolean isValid(String normalized) {
    return VALID.matcher(normalized).matches();
  }
}
