public static class Solution {
    public static string Encode(string text) {
        if (text.Length == 0)
            return "";
        string o = "";
        int n = 1;
        for (int i = 1; i <= text.Length; i++) {
            if (i < text.Length && text[i] == text[i - 1])
                n++;
            else {
                o += text[i - 1].ToString() + n;
                n = 1;
            }
        }
        return o;
    }
}
