public static class Solution {
    public static string Encode(string text) {
        var o = new System.Text.StringBuilder();
        for (int i = 0; i < text.Length;) {
            int j = i + 1;
            while (j < text.Length && text[j] == text[i])
                j++;
            o.Append(text[i]).Append(j - i);
            i = j;
        }
        return o.ToString();
    }
}
