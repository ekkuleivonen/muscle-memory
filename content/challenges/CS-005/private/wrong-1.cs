// Mistake: groups nonadjacent characters
public static class Solution {
    public static string Encode(string text) {
        return string.Concat(text.Distinct().Select(c => c.ToString() + text.Count(x => x == c)));
    }
}
