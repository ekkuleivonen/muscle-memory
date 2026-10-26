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
        List<String> broken = new ArrayList<>();
        boolean digit = false, letter = false, whitespace = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            digit |= Character.isDigit(c);
            letter |= Character.isLetter(c);
            whitespace |= Character.isWhitespace(c);
        }
        if (password.length() < 12) broken.add("too-short");
        if (!digit) broken.add("no-digit");
        if (!letter) broken.add("no-letter");
        if (whitespace) broken.add("has-whitespace");
        return broken;
    }
}
