<?php
// Phone number rules of the legacy CRM (Vietnam numbers only).
// Business rule BR-07 (2018 update after the mobile prefix change): mobile prefixes are 03, 05, 07, 08, 09.

/**
 * Normalises user input: removes spaces, dots, dashes and parentheses,
 * and converts the country code +84 / 84 to a leading 0.
 * Example: "+84 912.345.678" -> "0912345678"
 */
function phone_normalize($raw) {
    $digits = preg_replace('/[\s.\-()]/', '', trim($raw));
    if (strpos($digits, '+84') === 0) {
        $digits = '0' . substr($digits, 3);
    } elseif (strpos($digits, '84') === 0 && strlen($digits) === 11) {
        $digits = '0' . substr($digits, 2);
    }
    return $digits;
}

/**
 * Valid numbers (after normalisation):
 *  - mobile:   10 digits, prefix 03 / 05 / 07 / 08 / 09
 *  - landline: 11 digits, prefix 02
 */
function phone_is_valid($normalized) {
    return (bool) preg_match('/^(0[35789][0-9]{8}|02[0-9]{9})$/', $normalized);
}

/**
 * Display format used on every screen:
 *  - mobile:   "0912 345 678"  (4-3-3)
 *  - landline: "024 3825 1234" (3-4-4)
 */
function phone_format($normalized) {
    if (strlen($normalized) === 10) {
        return substr($normalized, 0, 4) . ' ' . substr($normalized, 4, 3) . ' ' . substr($normalized, 7);
    }
    if (strlen($normalized) === 11) {
        return substr($normalized, 0, 3) . ' ' . substr($normalized, 3, 4) . ' ' . substr($normalized, 7);
    }
    return $normalized;
}
