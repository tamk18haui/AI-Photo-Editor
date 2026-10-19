package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordPolicyTest {
    @Test void acceptsPasswordMeetingAllFiveRules() {
        assertTrue(PasswordPolicy.isValid("StrongPass123!"));
        assertTrue(PasswordPolicy.isValid("Ánhsang123!"));
        assertDoesNotThrow(() -> PasswordPolicy.requireValid("StrongPass123!"));
    }

    @Test void rejectsMissingTypesAndInvalidLength() {
        assertFalse(PasswordPolicy.isValid(null));
        assertFalse(PasswordPolicy.isValid("Ab1!"));
        assertFalse(PasswordPolicy.isValid("a".repeat(201) + "A1!"));
        assertFalse(PasswordPolicy.isValid("alllowercase1!"));
        assertFalse(PasswordPolicy.isValid("ALLUPPERCASE1!"));
        assertFalse(PasswordPolicy.isValid("NoDigitsHere!"));
        assertFalse(PasswordPolicy.isValid("NoSpecial123"));
        assertThrows(ApiException.class, () -> PasswordPolicy.requireValid("NoSpecial123"));
    }
}
