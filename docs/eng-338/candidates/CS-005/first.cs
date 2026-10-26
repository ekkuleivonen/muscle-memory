// TODO: implement the task.
public static class Solution {
    public static string Encode(string text) {
        var result = new System.Text.StringBuilder();
        int start = 0;
        while (start < text.Length) {
            int end = start + 1;
            while (end < text.Length && text[end] == text[start]) end++;
            result.Append(text[start]);
            result.Append((end - start).ToString(System.Globalization.CultureInfo.InvariantCulture));
            start = end;
        }
        return result.ToString();
    }
}
