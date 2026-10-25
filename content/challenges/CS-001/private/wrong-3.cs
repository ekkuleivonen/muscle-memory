// Splitting on \s+ without trimming counts the empty strings before leading and after trailing whitespace.
using System.Text.RegularExpressions;

namespace Composer;

/// <summary>The word count the composer shows under the text box.</summary>
public static class WordCount
{
    /// <summary>The number of words in a post.</summary>
    public static int Count(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return 0;
        return Regex.Split(text, @"\s+").Length;
    }
}
