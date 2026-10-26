// TODO: implement the task.
public class Solution {
    public static String shift(String text, int offset) {
        int normalized = ((offset % 26) + 26) % 26;
        StringBuilder result = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= 'a' && c <= 'z') c = (char) ('a' + (c - 'a' + normalized) % 26);
            else if (c >= 'A' && c <= 'Z') c = (char) ('A' + (c - 'A' + normalized) % 26);
            result.append(c);
        }
        return result.toString();
    }
}
