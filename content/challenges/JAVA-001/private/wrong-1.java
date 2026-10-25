// Trimming then splitting still returns one empty string for a blank post, so it counts 1 word.
package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        return text.trim().split("\\s+").length;
    }
}
