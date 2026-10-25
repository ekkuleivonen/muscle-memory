public class Solution {
    public static String shift(String text, int offset) {
        StringBuilder o = new StringBuilder();
        int k = ((offset % 26) + 26) % 26;
        for (char c : text.toCharArray()) {
            int base = c >= 'a' && c <= 'z' ? 'a' : c >= 'A' && c <= 'Z' ? 'A' : 0;
            o.append(base == 0 ? c : (char)(base + (c - base + k) % 26));
        }
        return o.toString();
    }
}
