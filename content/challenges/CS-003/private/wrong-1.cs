// Mistake: allows equal values
public static class Solution {
    public static int Longest(int[] values) {
        int b = 0, r = 0;
        for (int i = 0; i < values.Length; i++) {
            r = i > 0 && values[i] >= values[i - 1] ? r + 1 : 1;
            b = Math.Max(b, r);
        }
        return b;
    }
}
