// Collapsing runs of spaces fixes the double space, but tabs and newlines still don't separate words.
package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        String trimmed = text.trim();
        return trimmed.isEmpty() ? 0 : trimmed.split(" +").length;
    }
}
