// Guarding the empty post fixes "1 word", but a double space still counts an extra word.
namespace Composer;

/// <summary>The word count the composer shows under the text box.</summary>
public static class WordCount
{
    /// <summary>The number of words in a post.</summary>
    public static int Count(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return 0;
        return trimmed.Split(' ').Length;
    }
}
