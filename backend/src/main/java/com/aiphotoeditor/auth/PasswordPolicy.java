package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import org.springframework.http.HttpStatus;

/** Policy for newly registered and reset passwords; existing logins remain compatible. */
public final class PasswordPolicy {
    private PasswordPolicy() {}

    public static boolean isValid(String password) {
        if (password == null || password.length() < 8 || password.length() > 200) return false;
        boolean upper = false, lower = false, digit = false, special = false;
        for (int i = 0; i < password.length();) {
            int codePoint = password.codePointAt(i);
            upper |= Character.isUpperCase(codePoint);
            lower |= Character.isLowerCase(codePoint);
            digit |= Character.isDigit(codePoint);
            special |= !Character.isLetterOrDigit(codePoint) && !Character.isWhitespace(codePoint);
            i += Character.charCount(codePoint);
        }
        return upper && lower && digit && special;
    }

    public static void requireValid(String password) {
        if (!isValid(password)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_WEAK",
                    "Password requires 8-200 characters including uppercase, lowercase, number and special character");
        }
    }
}
