package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        int words = 0;
        boolean inWord = false;
        for (int offset = 0; offset < text.length();) {
            int codePoint = text.codePointAt(offset);
            boolean whitespace = Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint);
            if (!whitespace && !inWord) words++;
            inWord = !whitespace;
            offset += Character.charCount(codePoint);
        }
        return words;
    }
}
