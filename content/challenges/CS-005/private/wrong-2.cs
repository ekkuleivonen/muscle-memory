// Mistake: omits count for singleton runs
public static class Solution {
    public static string Encode(string text) {
        string o = "";
        for (int i = 0; i < text.Length;) {
            int j = i + 1;
            while (j < text.Length && text[j] == text[i])
                j++;
            o += text[i];
            if (j - i > 1)
                o += (j - i).ToString();
            i = j;
        }
        return o;
    }
}
