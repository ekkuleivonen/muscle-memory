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
        if (password.chars().noneMatch(Character::isDigit)) broken.add("no-digit");
        if (password.chars().noneMatch(Character::isLetter)) broken.add("no-letter");
        if (password.chars().anyMatch(Character::isWhitespace)) broken.add("has-whitespace");
        return broken;
    }
}
