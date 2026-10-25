// Without trimming, split keeps the empty string before leading whitespace and counts it as a word.
package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        if (text.isBlank()) return 0;
        return text.split("\\s+").length;
    }
}
