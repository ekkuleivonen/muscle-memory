// Mistake: drops nonletters
public class Solution {
    public static String shift(String text, int offset) {
        String o = "";
        for (char c : text.toCharArray()) {
            if (c >= 'a' && c <= 'z')
                o += (char)('a' + Math.floorMod(c - 'a' + offset, 26));
            else if (c >= 'A' && c <= 'Z')
                o += (char)('A' + Math.floorMod(c - 'A' + offset, 26));
        }
        return o;
    }
}
