// Only lowercase letters count as letters, so an all-caps password is reported as having none.
package com.acme.accounts;

import java.util.ArrayList;
import java.util.List;

/** The password rules sign-up and password reset enforce. */
public final class PasswordPolicy {
    private PasswordPolicy() {}

    /**
     * The rules a password breaks, in this order: too-short, no-digit, no-letter,
     * has-whitespace. Empty when it passes.
     */
    public static List<String> violations(String password) {
        boolean digit = false;
        boolean letter = false;
        boolean whitespace = false;
        for (char c : password.toCharArray()) {
            digit |= Character.isDigit(c);
            letter |= Character.isLowerCase(c);
            whitespace |= Character.isWhitespace(c);
        }
        List<String> broken = new ArrayList<>();
        if (password.length() < 12) broken.add("too-short");
        if (!digit) broken.add("no-digit");
        if (!letter) broken.add("no-letter");
        if (whitespace) broken.add("has-whitespace");
        return broken;
    }
}
