public class Solution {
    public static String shift(String text, int offset) {
        String lo = "abcdefghijklmnopqrstuvwxyz", hi = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", o = "";
        int k = Math.floorMod(offset, 26);
        for (char c : text.toCharArray()) {
            int i = lo.indexOf(c), j = hi.indexOf(c);
            o += i >= 0 ? lo.charAt((i + k) % 26) : j >= 0 ? hi.charAt((j + k) % 26) : c;
        }
        return o;
    }
}
