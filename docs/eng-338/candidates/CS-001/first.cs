namespace Composer;

/// <summary>The word count the composer shows under the text box.</summary>
public static class WordCount
{
    /// <summary>The number of words in a post.</summary>
    public static int Count(string text)
    {
        int count = 0;
        bool inWord = false;
        foreach (char c in text)
        {
            bool whitespace = char.IsWhiteSpace(c);
            if (!whitespace && !inWord) count++;
            inWord = !whitespace;
        }
        return count;
    }
}
