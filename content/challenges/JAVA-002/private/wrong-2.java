// Only looks for a space, so a tab or newline in the password is not reported as whitespace.
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
        if (password.length() < 12) broken.add("too-short");
        if (!password.matches(".*[0-9].*")) broken.add("no-digit");
        if (!password.matches(".*[a-zA-Z].*")) broken.add("no-letter");
        if (password.contains(" ")) broken.add("has-whitespace");
        return broken;
    }
}
